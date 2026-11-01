// Ein Raum mit genau zwei Plätzen (Seats): Platzierung, Kampf, Spielende. Kein Transport, kein ws.
// Der Server ist Schiedsrichter: er hält beide Bretter und verrät jedem Client nur, was er wissen darf.
//
// Zustände: waiting -> placement -> battle -> gameover -> closed (siehe spec/multiplayer.md).
// Noch nicht hier (Etappe 5/6): Zug- und Platzierungszeit, Schonfrist + `state`, Revanche, Emotes.
import { S2C, validateFleet } from '../shared/protocol.js';
import { RULES } from '../shared/rules.js';
import { distinctNames } from '../shared/names.js';

/**
 * @typedef {{ send(msg: object): void, name: string, match: Match|null }} Session
 *   Session des GameServers; das Match setzt/löscht `match`.
 */

export class Match {
  /**
   * @param {{ code: string, host: Session, clock: import('./runtime.js').Clock, rng: () => number,
   *           ttlMs: number, onClose: (match: Match) => void }} opts
   */
  constructor({ code, host, clock, rng, ttlMs, onClose }) {
    this.code = code;
    this.clock = clock;
    this.rng = rng;
    this.onClose = onClose;
    this.state = 'waiting';
    /** @type {({ session: Session|null, name: string, board: import('../shared/Board.js').Board|null, stats: {shots:number, hits:number} })[]} */
    this.seats = [this._seat(host, host.name)];
    this.turn = -1;
    this.score = [0, 0];
    host.match = this;
    this._expiry = clock.setTimeout(() => this._expire(), ttlMs);
  }

  get joinable() { return this.state === 'waiting'; }

  /** Gast tritt bei -> Platzierung. */
  join(guest) {
    this.clock.clearTimeout(this._expiry);
    const [, guestName] = distinctNames(this.seats[0].name, guest.name);
    this.seats.push(this._seat(guest, guestName));
    guest.match = this;
    this.state = 'placement';
    this.seats.forEach((s, seat) => s.session.send({ type: S2C.matched, seat, name: s.name, opponent: this.seats[1 - seat].name }));
  }

  /**
   * Spielnachricht eines Platzes.
   * @returns {boolean} false, wenn die Nachricht in diesem Zustand ungültig ist.
   */
  handle(session, msg) {
    const seat = this._seatOf(session);
    if (seat < 0) return false;
    switch (msg.type) {
      case 'placeFleet': return this._placeFleet(seat, msg.ships);
      case 'shoot': return this._shoot(seat, msg.col, msg.row);
      case 'resign':
        if (this.state !== 'placement' && this.state !== 'battle') return false;
        this._finish(1 - seat, 'resign');
        return true;
      default: return false;
    }
  }

  /** Platz verlässt den Raum. `how`: 'leave' (bewusst) oder 'disconnect' (Verbindung weg). */
  leave(session, how) {
    const seat = this._seatOf(session);
    if (seat < 0) return;
    // Erst austragen: wer geht, bekommt keine Nachrichten mehr aus diesem Raum.
    this.seats[seat].session = null;
    session.match = null;
    if (this.state === 'placement') this._finish(null, 'abandoned');
    else if (this.state === 'battle') this._finish(1 - seat, how === 'leave' ? 'resign' : 'fled');
    else if (this.state === 'gameover') this._toOther(seat, { type: S2C.opponentStatus, status: 'left' });

    if (this.state === 'waiting' || this.seats.every((s) => !s.session)) this.close();
  }

  close() {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this.clock.clearTimeout(this._expiry);
    for (const s of this.seats) if (s.session) { s.session.match = null; s.session = null; }
    this.onClose(this);
  }

  // --- intern

  _seat(session, name) { return { session, name, board: null, stats: { shots: 0, hits: 0 } }; }

  _seatOf(session) { return this.seats.findIndex((s) => s.session === session); }

  _broadcast(msg) { for (const s of this.seats) s.session?.send(msg); }

  _toOther(seat, msg) { this.seats[1 - seat]?.session?.send(msg); }

  _expire() {
    if (this.state !== 'waiting') return;
    this.seats[0].session?.send({ type: S2C.error, code: 'roomExpired' });
    this.close();
  }

  _placeFleet(seat, ships) {
    if (this.state !== 'placement' || this.seats[seat].board) return false;
    const board = validateFleet(ships);
    if (!board) return false;
    this.seats[seat].board = board;
    if (this.seats.every((s) => s.board)) {
      this.state = 'battle';
      this.turn = this.rng() < 0.5 ? 0 : 1;
      this._broadcast({ type: S2C.start, first: this.turn });
      this._broadcast({ type: S2C.turn, seat: this.turn });
    }
    return true;
  }

  _shoot(seat, col, row) {
    if (this.state !== 'battle' || seat !== this.turn) return false;
    const target = this.seats[1 - seat].board;
    if (target.wasShot(col, row)) return false;
    const res = target.receiveShot(col, row);
    const stats = this.seats[seat].stats;
    stats.shots++;
    if (res.result !== 'miss') stats.hits++;

    const msg = { type: S2C.shotResult, shooter: seat, col, row, result: res.result };
    if (res.result === 'sunk') {
      const { index, col: c, row: r, orientation, length } = target.ships[res.shipIndex];
      msg.ship = { index, col: c, row: r, orientation, length };
    }
    this._broadcast(msg);

    if (target.allSunk()) {
      this._finish(seat, 'allSunk');
    } else {
      if (res.result === 'miss' || !RULES.shootAgainOnHit) this.turn = 1 - seat;
      this._broadcast({ type: S2C.turn, seat: this.turn });
    }
    return true;
  }

  /** Spielende; winner = Platz oder null (abgebrochen, ohne Wertung). */
  _finish(winner, reason) {
    this.state = 'gameover';
    this.turn = -1;
    if (winner !== null) this.score[winner]++;
    this._broadcast({
      type: S2C.gameOver, winner, reason,
      stats: this.seats.map((s) => ({ ...s.stats })),
      score: [...this.score],
    });
  }
}
