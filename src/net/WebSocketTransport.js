// Transport per Browser-WebSocket (Gegenstelle für NetClient): send, close, onMessage, onClose.
import { NetError } from './NetClient.js';

/** Öffnet die Verbindung; lehnt ab, wenn sie nicht zustande kommt. */
export function openWebSocket(url, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(url); } catch { reject(new NetError('connection')); return; }
    let onMessage = () => {}, onClose = () => {}, open = false;
    const timer = setTimeout(() => { ws.close(); reject(new NetError('connection')); }, timeoutMs);
    ws.addEventListener('open', () => {
      open = true;
      clearTimeout(timer);
      resolve({
        send: (msg) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); },
        close: () => ws.close(1000),
        onMessage: (fn) => { onMessage = fn; },
        onClose: (fn) => { onClose = fn; },
      });
    });
    ws.addEventListener('message', (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      onMessage(msg);
    });
    ws.addEventListener('close', () => {
      clearTimeout(timer);
      if (open) onClose(); else reject(new NetError('connection'));
    });
  });
}
