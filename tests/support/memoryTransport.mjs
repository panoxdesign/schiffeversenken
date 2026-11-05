// In-Memory-Transport für Tests: verbindet einen Client direkt mit dem Server-Kern.
// Gleiche Gegenstelle wie der WebSocket-Transport (send, close, onMessage, onClose); Zustellung asynchron
// und als JSON-Kopie, damit sich Tests wie über das Netz verhalten.
const later = (fn) => setTimeout(fn, 0);

export function memoryTransport(core) {
  let onMessage = () => {};
  let onClose = () => {};
  let closed = false;
  const end = () => { if (closed) return; closed = true; onClose(); };
  const conn = core.connect({
    send: (msg) => { const raw = JSON.stringify(msg); later(() => { if (!closed) onMessage(JSON.parse(raw)); }); },
    close: () => later(end),
  });
  return {
    send(msg) { if (closed) return; const raw = JSON.stringify(msg); later(() => conn.receive(raw)); },
    close() { if (closed) return; closed = true; later(() => conn.disconnect()); },
    onMessage(fn) { onMessage = fn; },
    onClose(fn) { onClose = fn; },
    /** Test: Server verschwindet (Neustart, Einschlafen). */
    kill() { conn.disconnect(); end(); },
  };
}

/**
 * ctx.net für den GameController: jede Verbindung ist eine neue In-Memory-Gegenstelle zum Kern.
 * `core` ist austauschbar (Server-Neustart), `session` ersetzt den Tab-Speicher (sessionStorage).
 */
export function memoryNet(core) {
  const opened = [];
  const net = {
    core, opened,
    connect: async () => { const t = memoryTransport(net.core); opened.push(t); return t; },
    session: { value: null, load() { return this.value; }, save(v) { this.value = v; }, clear() { this.value = null; } },
  };
  return net;
}
