// Server-Kern ohne Transport: Verbindungen, Begrüßung, Validierung, Limits und Lobby (Raum-Codes).
// Uhr und Zufall werden injiziert. Der ws-Adapter (server/wsAdapter.js) ist nur ein dünner Einstieg.
//
// Verwendung:
//   const core = createGameServer({ clock, rng });
//   const conn = core.connect({ send(msg) {...}, close() {...} });  // Gegenstelle des Transports
//   conn.receive(rawText);  conn.disconnect();
import { S2C, PROTOCOL_VERSION, CODE_ALPHABET, CODE_LENGTH, normalizeCode, sanitizeName } from '../shared/protocol.js';
import { randomPirateName } from '../shared/names.js';
import { readClientMessage } from './messages.js';
import { Match } from './Match.js';

export const DEFAULT_LIMITS = Object.freeze({
  maxConnections: 500,
  messagesPerSecond: 20,
  /** Ungültige Nachrichten bzw. Ratenverstöße bis zur Trennung. */
  maxViolations: 10,
  wrongCodesPerMinute: 5,
  roomTtlMs: 10 * 60_000,
  /** So lange wird ein abgelaufener Code als „abgelaufen“ statt „unbekannt“ gemeldet (und nicht neu vergeben). */
  expiredCodeMemoryMs: 60 * 60_000,
});

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TOKEN_LENGTH = 24;

/**
 * @param {{ clock: import('./runtime.js').Clock, rng: () => number, limits?: Partial<typeof DEFAULT_LIMITS> }} opts
 */
export function createGameServer(opts) {
  return new GameServer(opts);
}

class Session {
  constructor(peer, now) {
    this.peer = peer;
    /** Gesetzt nach `hello`. */
    this.name = '';
    this.token = '';
    /** @type {Match|null} */
    this.match = null;
    this.closed = false;
    this.violations = 0;
    this.rateWindow = now;
    this.rateCount = 0;
    /** @type {number[]} Zeitpunkte fehlgeschlagener Beitritte */
    this.wrongCodes = [];
  }

  get greeted() { return this.name !== ''; }

  send(msg) { if (!this.closed) this.peer.send(msg); }
}

export class GameServer {
  constructor({ clock, rng, limits = {} }) {
    this.clock = clock;
    this.rng = rng;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    /** @type {Set<Session>} */
    this.sessions = new Set();
    /** @type {Map<string, Match>} */
    this.rooms = new Map();
    /** @type {Map<string, number>} Code -> Zeitpunkt des Ablaufs */
    this.expiredCodes = new Map();
  }

  /** Zahl der begrüßten Verbindungen („Piraten auf See“). */
  playerCount() {
    let n = 0;
    for (const s of this.sessions) if (s.greeted) n++;
    return n;
  }

  /**
   * Neue Verbindung des Transports.
   * @param {{ send(msg: object): void, close(): void }} peer
   * @returns {{ receive(raw: unknown): void, disconnect(): void }}
   */
  connect(peer) {
    if (this.sessions.size >= this.limits.maxConnections) {
      peer.send({ type: S2C.error, code: 'full' });
      peer.close();
      return { receive() {}, disconnect() {} };
    }
    const session = new Session(peer, this.clock.now());
    this.sessions.add(session);
    return {
      receive: (raw) => this._receive(session, raw),
      disconnect: () => this._drop(session),
    };
  }

  /** Alle Räume schließen und Timer aufräumen (Herunterfahren). */
  dispose() {
    for (const room of [...this.rooms.values()]) room.close();
  }

  // --- Eingang

  _receive(s, raw) {
    if (s.closed || !this._withinRate(s)) return;
    const msg = readClientMessage(raw);
    if (!msg || s.greeted === (msg.type === 'hello')) return this._violation(s, msg?.type);
    switch (msg.type) {
      case 'hello': return this._hello(s, msg);
      case 'createRoom': return this._createRoom(s);
      case 'joinRoom': return this._joinRoom(s, msg.code);
      case 'leave': return this._leaveRoom(s, 'leave');
      default:
        if (!s.match || !s.match.handle(s, msg)) this._violation(s, msg.type);
    }
  }

  _withinRate(s) {
    const now = this.clock.now();
    if (now - s.rateWindow >= 1000) { s.rateWindow = now; s.rateCount = 0; }
    s.rateCount++;
    if (s.rateCount <= this.limits.messagesPerSecond) return true;
    if (s.rateCount === this.limits.messagesPerSecond + 1) {
      s.send({ type: S2C.error, code: 'rateLimit' });
      this._strike(s);
    }
    return false;
  }

  _violation(s, about) {
    s.send(about ? { type: S2C.error, code: 'invalid', for: about } : { type: S2C.error, code: 'invalid' });
    this._strike(s);
  }

  _strike(s) {
    if (++s.violations >= this.limits.maxViolations) this._close(s);
  }

  /** Vom Server ausgehende Trennung. */
  _close(s) {
    if (s.closed) return;
    s.peer.close();
    this._drop(s);
  }

  /** Verbindung ist weg (vom Transport gemeldet oder vom Server getrennt). Idempotent. */
  _drop(s) {
    if (s.closed) return;
    this._leaveRoom(s, 'disconnect');
    s.closed = true;
    this.sessions.delete(s);
  }

  // --- Begrüßung

  _hello(s, msg) {
    if (msg.version !== PROTOCOL_VERSION) {
      s.send({ type: S2C.error, code: 'version' });
      return this._close(s);
    }
    s.name = sanitizeName(msg.name) || randomPirateName(this.rng);
    s.token = this._randomString(TOKEN_ALPHABET, TOKEN_LENGTH);
    s.send({ type: S2C.welcome, token: s.token, name: s.name, players: this.playerCount() });
  }

  // --- Lobby

  _createRoom(s) {
    this._leaveRoom(s, 'leave');
    const code = this._newCode();
    const room = new Match({
      code, host: s, clock: this.clock, rng: this.rng, ttlMs: this.limits.roomTtlMs,
      onClose: (m) => this._roomClosed(m),
    });
    this.rooms.set(code, room);
    s.send({ type: S2C.roomCreated, code });
  }

  _joinRoom(s, input) {
    const now = this.clock.now();
    s.wrongCodes = s.wrongCodes.filter((t) => now - t < 60_000);
    if (s.wrongCodes.length >= this.limits.wrongCodesPerMinute) return s.send({ type: S2C.error, code: 'rateLimit', for: 'joinRoom' });

    const code = normalizeCode(input);
    const room = code ? this.rooms.get(code) : undefined;
    if (!room) {
      s.wrongCodes.push(now);
      return s.send({ type: S2C.error, code: code && this.expiredCodes.has(code) ? 'roomExpired' : 'roomNotFound', for: 'joinRoom' });
    }
    if (room === s.match) return this._violation(s, 'joinRoom');
    if (!room.joinable) return s.send({ type: S2C.error, code: 'roomFull', for: 'joinRoom' });
    this._leaveRoom(s, 'leave');
    room.join(s);
  }

  _leaveRoom(s, how) {
    s.match?.leave(s, how);
  }

  _roomClosed(room) {
    this.rooms.delete(room.code);
    this.expiredCodes.set(room.code, this.clock.now());
  }

  _newCode() {
    const now = this.clock.now();
    for (const [code, at] of this.expiredCodes) if (now - at >= this.limits.expiredCodeMemoryMs) this.expiredCodes.delete(code);
    for (;;) {
      const code = this._randomString(CODE_ALPHABET, CODE_LENGTH);
      if (!this.rooms.has(code) && !this.expiredCodes.has(code)) return code;
    }
  }

  _randomString(alphabet, length) {
    let out = '';
    for (let i = 0; i < length; i++) out += alphabet[Math.floor(this.rng() * alphabet.length)];
    return out;
  }
}
