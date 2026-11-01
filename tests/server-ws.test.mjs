// Smoke-Test mit echtem ws auf zufälligem Port: Verbindung, hello/welcome, Origin-Ablehnung, /health.
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createGameServer } from '../server/GameServer.js';
import { realClock, cryptoRng } from '../server/runtime.js';
import { startServer, originAllowed, parseOrigins } from '../server/wsAdapter.js';
import { PROTOCOL_VERSION } from '../shared/protocol.js';

const ORIGIN = 'https://freibeuter.example';

async function withServer(fn) {
  const core = createGameServer({ clock: realClock, rng: cryptoRng });
  const srv = await startServer({ core, port: 0, host: '127.0.0.1', allowedOrigins: [ORIGIN] });
  try { await fn(srv.port); } finally { await srv.close(); }
}

const nextMessage = (ws) => new Promise((resolve, reject) => {
  ws.once('message', (data) => resolve(JSON.parse(data.toString())));
  ws.once('error', reject);
});

test('ws: hello -> welcome, /health zählt Spieler', () => withServer(async (port) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: ORIGIN });
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  ws.send(JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, name: 'Rotbart' }));
  const welcome = await nextMessage(ws);
  assert.equal(welcome.type, 'welcome');
  assert.equal(welcome.name, 'Rotbart');
  assert.equal(welcome.players, 1);

  const res = await fetch(`http://127.0.0.1:${port}/health`, { headers: { Origin: ORIGIN } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.deepEqual(await res.json(), { ok: true, players: 1, version: PROTOCOL_VERSION });

  ws.send('kein json');
  assert.equal((await nextMessage(ws)).code, 'invalid');
  ws.close();
}));

test('ws: fremde Herkunft und falscher Pfad werden abgelehnt', () => withServer(async (port) => {
  const status = (url, origin) => new Promise((resolve) => {
    const ws = new WebSocket(url, { origin });
    ws.once('unexpected-response', (req, res) => { resolve(res.statusCode); ws.terminate(); });
    ws.once('open', () => { resolve('open'); ws.close(); });
    ws.once('error', () => {});
  });
  assert.equal(await status(`ws://127.0.0.1:${port}/ws`, 'https://boese.example'), 403);
  assert.equal(await status(`ws://127.0.0.1:${port}/anderswo`, ORIGIN), 404);
}));

test('ws: zu große Nachricht trennt die Verbindung', () => withServer(async (port) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: ORIGIN });
  await new Promise((r) => ws.once('open', r));
  const closed = new Promise((r) => ws.once('close', (code) => r(code)));
  ws.send('x'.repeat(4096));
  assert.equal(await closed, 1009);
}));

test('Origins: Standard nur localhost, Liste exakt, Stern erlaubt alles', () => {
  assert.equal(parseOrigins(''), null);
  assert.deepEqual(parseOrigins(' https://a.example/, http://localhost:5173 '), ['https://a.example', 'http://localhost:5173']);
  assert.ok(originAllowed('http://localhost:5173', null));
  assert.ok(originAllowed('http://127.0.0.1:4173', null));
  assert.ok(!originAllowed('https://boese.example', null));
  assert.ok(!originAllowed(undefined, null));
  assert.ok(originAllowed('https://a.example', ['https://a.example']));
  assert.ok(!originAllowed('https://a.example.boese.example', ['https://a.example']));
  assert.ok(originAllowed(undefined, ['*']));
});
