// Verbindung eines Clients zum Spielserver – kennt nur das Protokoll, keinen Transport und kein three.js.
//
// Transport (Gegenstelle): { send(msg: object), close(), onMessage(fn(msg: object)), onClose(fn()) }
//   real: openWebSocket() (src/net/WebSocketTransport.js), in Tests: In-Memory-Verbindung zum Server-Kern.
//
// Antworten, auf die jemand warten kann, landen in einem Postfach; `next(match)` entnimmt die erste passende
// (oder wartet auf sie). Übrige Nachrichten gehen an `onPush`-Abonnenten.
// Jede Nachricht bekommt beim Empfang `at` (Zeitpunkt nach `now`), damit Restzeiten (ms) ab Empfang zählen.
import { C2S, PROTOCOL_VERSION } from '../../shared/protocol.js';

/** Netz-Fehler; code: ein Fehlercode des Servers (ERROR_CODES), 'connection' oder 'ended'. */
export class NetError extends Error {
  constructor(code, detail) {
    super(`Netz: ${code}`);
    this.code = code;
    this.detail = detail;
  }
}

const QUEUED = new Set(['welcome', 'roomCreated', 'matched', 'start', 'shotResult', 'turn', 'state', 'error']);
const MAX_INBOX = 64;

export class NetClient {
  /** @param {{ now?: () => number }} [opts] Uhr für den Empfangszeitpunkt (Standard: Date.now). */
  constructor(transport, { now = () => Date.now() } = {}) {
    this.transport = transport;
    this.now = now;
    this.closed = false;
    /** Spielende vom Server (gameOver); danach warten keine neuen Spielnachrichten mehr. */
    this.ended = null;
    this._inbox = [];
    this._waiters = [];
    this._push = new Set();
    /** Letzte Nachricht je Typ (z. B. placementDeadline, die vor dem Abonnieren ankam). */
    this.latest = {};
    /** Wird gerufen, wenn die Verbindung unerwartet abreißt (nicht nach close()). */
    this.onLost = null;
    transport.onMessage((msg) => this._receive(msg));
    transport.onClose(() => this._lost());
  }

  send(msg) { if (!this.closed) this.transport.send(msg); }

  /** Abonniert alle Nachrichten (auch die im Postfach). Liefert eine Abmelde-Funktion. */
  onPush(fn) { this._push.add(fn); return () => this._push.delete(fn); }

  /** Nächste Nachricht, für die match(msg) wahr ist. */
  next(match) {
    const i = this._inbox.findIndex(match);
    if (i >= 0) return Promise.resolve(this._inbox.splice(i, 1)[0]);
    if (this.closed) return Promise.reject(new NetError('connection'));
    if (this.ended) return Promise.reject(new NetError('ended', this.ended));
    return new Promise((resolve, reject) => this._waiters.push({ match, resolve, reject }));
  }

  /** Begrüßung -> welcome { token, name, players, resumed? }. Mit token: zurück in die laufende Partie (dann folgt `state`). */
  async hello(name, token) {
    this.send({ type: C2S.hello, version: PROTOCOL_VERSION, name: typeof name === 'string' ? name : '', ...(token && { token }) });
    const welcome = await this._expect((m) => m.type === 'welcome', (m) => m.type === 'error' && !m.for);
    /** Sitzungs-Token: damit kommt der Client nach einem Abbruch in seine Partie zurück. */
    this.token = welcome.token;
    return welcome;
  }

  /** Raum anlegen -> Code. */
  async createRoom() {
    this.send({ type: C2S.createRoom });
    return (await this._expect((m) => m.type === 'roomCreated', (m) => m.type === 'error' && m.for === 'createRoom')).code;
  }

  /** Gastgeber: wartet auf den Gast -> matched { seat, name, opponent }. */
  waitMatched() {
    return this._expect((m) => m.type === 'matched', (m) => m.type === 'error' && m.code === 'roomExpired');
  }

  /** Gast: Raum beitreten -> matched. Fehler: roomNotFound | roomExpired | roomFull | rateLimit | invalid. */
  async joinRoom(code) {
    this.send({ type: C2S.joinRoom, code });
    return this._expect((m) => m.type === 'matched', (m) => m.type === 'error' && m.for === 'joinRoom');
  }

  /** Bewusst trennen (meldet kein onLost). */
  close() {
    if (this.closed) return;
    this.closed = true;
    this._fail(new NetError('connection'));
    this._push.clear();
    this.transport.close();
  }

  async _expect(ok, err) {
    const msg = await this.next((m) => ok(m) || err(m));
    if (ok(msg)) return msg;
    throw new NetError(msg.code);
  }

  _receive(msg) {
    if (this.closed || !msg || typeof msg.type !== 'string') return;
    msg.at = this.now();
    this.latest[msg.type] = msg;
    for (const fn of [...this._push]) {
      try { fn(msg); } catch (e) { console.warn('[net] Fehler im Abonnenten', e); }
    }
    if (this.closed) return;
    if (msg.type === 'gameOver') {
      this.ended = msg;
      this._fail(new NetError('ended', msg));
      return;
    }
    if (!QUEUED.has(msg.type)) return;
    const w = this._waiters.findIndex((x) => x.match(msg));
    if (w >= 0) { this._waiters.splice(w, 1)[0].resolve(msg); return; }
    this._inbox.push(msg);
    if (this._inbox.length > MAX_INBOX) this._inbox.shift();
  }

  _fail(err) {
    for (const w of this._waiters.splice(0)) w.reject(err);
  }

  _lost() {
    if (this.closed) return;
    this.closed = true;
    this._fail(new NetError('connection'));
    const fn = this.onLost;
    this.onLost = null;
    this._push.clear();
    if (fn) fn();
  }
}
