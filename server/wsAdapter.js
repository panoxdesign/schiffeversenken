// Dünner Transport-Adapter: HTTP (/health) + WebSocket (/ws) auf einem Port.
// Origin-Prüfung, Payload-Limit und Heartbeat liegen hier; Spiellogik und Limits pro Nachricht im Server-Kern.
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION } from '../shared/protocol.js';

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * ALLOWED_ORIGINS -> Liste. Leer/ungesetzt: nur localhost (Entwicklung). „*“: alle.
 * @param {string|undefined} value kommagetrennt, z. B. "https://freibeuter.vercel.app,http://localhost:5173"
 * @returns {string[]|null} null = nur localhost
 */
export function parseOrigins(value) {
  const list = (value || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  return list.length ? list : null;
}

export function originAllowed(origin, allowed) {
  if (allowed?.includes('*')) return true;
  if (!origin) return false;
  return allowed ? allowed.includes(origin) : LOCAL_ORIGIN.test(origin);
}

/**
 * Startet HTTP- und WebSocket-Server für einen Server-Kern.
 * @param {{ core: import('./GameServer.js').GameServer, port?: number, host?: string,
 *           allowedOrigins?: string[]|null, heartbeatMs?: number }} opts
 * @returns {Promise<{ port: number, close(): Promise<void> }>}
 */
export function startServer({ core, port = 8787, host = '0.0.0.0', allowedOrigins = null, heartbeatMs = 25_000 }) {
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const origin = req.headers.origin;
    if (origin && originAllowed(origin, allowedOrigins)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, players: core.playerCount(), version: PROTOCOL_VERSION }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Hier liegt kein Schiff vor Anker.');
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const reject = (status) => { socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); };
    if (pathname !== '/ws') return reject('404 Not Found');
    if (!originAllowed(req.headers.origin, allowedOrigins)) return reject('403 Forbidden');
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    const conn = core.connect({
      send: (msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); },
      close: () => ws.close(1008),
    });
    ws.on('message', (data, isBinary) => conn.receive(isBinary ? null : data.toString()));
    ws.on('close', () => conn.disconnect());
    ws.on('error', () => ws.terminate());
  });

  // Heartbeat: wer auf einen Ping bis zum nächsten nicht antwortet, wird getrennt.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve({
        port: server.address().port,
        close: () => new Promise((done) => {
          clearInterval(heartbeat);
          for (const ws of wss.clients) ws.terminate();
          wss.close();
          core.dispose();
          server.close(() => done());
        }),
      });
    });
  });
}
