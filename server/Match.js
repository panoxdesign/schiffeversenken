// Ein Raum mit genau zwei Plätzen (Seats): Platzierung, Kampf, Spielende. Kein Transport, kein ws.
// Der Server ist Schiedsrichter: er hält beide Bretter und verrät jedem Client nur, was er wissen darf.
//
// Zustände: waiting -> placement -> battle -> gameover -> closed (siehe spec/multiplayer.md).
// Jeder Platz: verbunden (session) -> Schonfrist (grace) -> weg. Solange ein Platz in der Schonfrist ist,
// stehen Platzierungs- und Zugzeit still. Noch nicht hier (Etappe 6): Revanche, Emotes.
import { S2C, validateFleet, fleetOf } from '../shared/protocol.js';
import { RULES, FLEET, BOARD_SIZE, TIMES } from '../shared/rules.js';
import { Board } from '../shared/Board.js';
import { distinctNames } from '../shared/names.js';

const LENGTHS = FLEET.map((f) => f.length);

/**
 * @typedef {{ send(msg: object): void, name: string, token: string, match: Match|null }} Session
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
    this.seats = [this._seat(host, host.name)];
    this.turn = -1;
    this.score = [0, 0];
    /** Letzte gameOver-Nachricht (für `state` nach dem Wiederverbinden). */
    this.over = null;
    this.startedAt = 0;
    /** Laufende Platzierungs- oder Zugzeit: { fn, left, at, handle } (handle null = angehalten). */
    this._phase = null;
    host.match = this;
    this._expiry = clock.setTimeout(() => this._expire(), ttlMs);
  }

  get joinable() { return this.state === 'waiting'; }

  /** Gast tritt bei -> Platzierung mit Zeitlimit. */
  join(guest) {
    this.clock.clearTimeout(this._expiry);
    const [, guestName] = distinctNames(this.seats[0].name, guest.name);
    this.seats.push(this._seat(guest, guestName));
    guest.match = this;
    this.state = 'placement';
    this.seats.forEach((s, seat) => s.session.send({ type: S2C.matched, seat, name: s.name, opponent: this.seats[1 - seat].name }));
    this._setPhase(TIMES.placementMs + TIMES.placementSlackMs, () => this._placementTimeout());
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

  /**
   * Platz verlässt den Raum. `how`: 'leave' (bewusst) oder 'disconnect' (Verbindung weg).
   * Ein Verbindungsabbruch während Platzierung oder Kampf startet die Schonfrist.
   */
  leave(session, how) {
    const seat = this._seatOf(session);
    if (seat < 0) return;
    // Erst austragen: wer geht, bekommt keine Nachrichten mehr aus diesem Raum.
    this.seats[seat].session = null;
    session.match = null;
    if (how === 'disconnect' && this._live) { this._startGrace(seat); return; }
    this._gone(seat, 'resign');
  }

  /** Platz, der sich mit diesem Token wieder verbinden darf (verbunden oder in der Schonfrist), sonst -1. */
  seatOfToken(token) {
    if (this.state === 'waiting' || this.state === 'closed') return -1;
    return this.seats.findIndex((s) => s.token === token && (s.session || s.grace));
  }

  /** Noch verbundene alte Session eines Platzes lösen (Übernahme durch eine neue Verbindung). */
  detach(seat) {
    const old = this.seats[seat].session;
    if (!old) return null;
    this.seats[seat].session = null;
    old.match = null;
    return old;
  }

  /** Platz kehrt mit neuer Verbindung zurück: kompletter Stand, danach läuft die Zeit weiter. */
  resume(seat, session) {
    const s = this.seats[seat];
    if (s.grace) { this.clock.clearTimeout(s.grace); s.grace = null; }
    s.session = session;
    session.match = this;
    session.send(this._stateFor(seat));
    this._toOther(seat, { type: S2C.opponentStatus, status: 'back' });
    if (!this._paused) this._resumePhase();
  }

  close() {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this.clock.clearTimeout(this._expiry);
    this._clearPhase();
    for (const s of this.seats) {
      if (s.grace) { this.clock.clearTimeout(s.grace); s.grace = null; }
      if (s.session) { s.session.match = null; s.session = null; }
    }
    this.onClose(this);
  }

  // --- intern: Plätze

  _seat(session, name) {
    return { session, token: session.token, name, board: null, stats: { shots: 0, hits: 0 }, shots: [], missed: 0, grace: null, graceUntil: 0 };
  }

  _seatOf(session) { return this.seats.findIndex((s) => s.session === session); }

  get _live() { return this.state === 'placement' || this.state === 'battle'; }

  /** Ein Platz ist in der Schonfrist: Zeiten stehen still. */
  get _paused() { return this.seats.some((s) => s.grace); }

  _broadcast(msg) { for (const s of this.seats) s.session?.send(msg); }

  _toOther(seat, msg) { this.seats[1 - seat]?.session?.send(msg); }

  _startGrace(seat) {
    const s = this.seats[seat];
    this._pausePhase();
    s.graceUntil = this.clock.now() + TIMES.graceMs;
    s.grace = this.clock.setTimeout(() => { s.grace = null; this._gone(seat, 'fled'); }, TIMES.graceMs);
    this._toOther(seat, { type: S2C.opponentStatus, status: 'grace', ms: TIMES.graceMs });
  }

  /** Platz ist endgültig weg (bewusst gegangen oder Schonfrist abgelaufen). */
  _gone(seat, reason) {
    if (this.state === 'placement') this._finish(null, 'abandoned');
    else if (this.state === 'battle') this._finish(1 - seat, reason);
    else if (this.state === 'gameover') this._toOther(seat, { type: S2C.opponentStatus, status: 'left' });
    if (this.state === 'waiting' || this.seats.every((s) => !s.session && !s.grace)) this.close();
  }

  _expire() {
    if (this.state !== 'waiting') return;
    this.seats[0].session?.send({ type: S2C.error, code: 'roomExpired' });
    this.close();
  }

  // --- intern: Zeiten (Platzierung bzw. Zug), anhaltbar während der Schonfrist

  _setPhase(ms, fn) {
    this._clearPhase();
    this._phase = { fn, left: ms, at: 0, handle: null };
    if (!this._paused) this._resumePhase();
  }

  /** Zeit (wieder) laufen lassen und beiden die Restzeit nennen. */
  _resumePhase() {
    const p = this._phase;
    if (!p) return;
    if (p.handle === null) {
      p.at = this.clock.now() + p.left;
      p.handle = this.clock.setTimeout(() => { this._phase = null; p.fn(); }, p.left);
    }
    const left = Math.max(0, p.at - this.clock.now());
    if (this.state === 'placement') this._broadcast({ type: S2C.placementDeadline, ms: Math.max(0, left - TIMES.placementSlackMs) });
    else if (this.state === 'battle') this._broadcast({ type: S2C.turn, seat: this.turn, ms: left });
  }

  _pausePhase() {
    const p = this._phase;
    if (!p || p.handle === null) return;
    this.clock.clearTimeout(p.handle);
    p.handle = null;
    p.left = Math.max(0, p.at - this.clock.now());
  }

  _clearPhase() {
    if (this._phase?.handle != null) this.clock.clearTimeout(this._phase.handle);
    this._phase = null;
  }

  // --- intern: Platzierung

  _placeFleet(seat, ships) {
    if (this.state !== 'placement' || this.seats[seat].board) return false;
    const board = validateFleet(ships);
    if (!board) return false;
    this.seats[seat].board = board;
    if (this.seats.every((s) => s.board)) this._begin();
    return true;
  }

  /** Platzierungszeit samt Nachfrist vorbei: wer noch keine Flotte hat, bekommt eine zufällige. */
  _placementTimeout() {
    for (const s of this.seats) {
      if (s.board) continue;
      s.board = new Board({ size: BOARD_SIZE, noTouching: RULES.noTouching });
      s.board.randomize(LENGTHS, this.rng);
    }
    this._begin();
  }

  /** Kampf beginnt: Server lost aus. Jeder erfährt seine (ggf. vom Server ergänzte) Flotte. */
  _begin() {
    this.state = 'battle';
    this.startedAt = this.clock.now();
    const first = this.rng() < 0.5 ? 0 : 1;
    this.seats.forEach((s) => s.session?.send({ type: S2C.start, first, fleet: fleetOf(s.board) }));
    this._startTurn(first, TIMES.animMs);
  }

  // --- intern: Kampf

  _startTurn(seat, animMs) {
    this.turn = seat;
    this._setPhase(TIMES.turnMs + animMs, () => this._turnTimeout());
  }

  /** Zugzeit abgelaufen: Zufallsschuss; nach zu vielen verpassten Zügen in Folge verloren. */
  _turnTimeout() {
    const seat = this.turn;
    if (++this.seats[seat].missed >= TIMES.maxMissed) { this._finish(1 - seat, 'timeout'); return; }
    const target = this.seats[1 - seat].board, open = [];
    for (let row = 0; row < BOARD_SIZE; row++) for (let col = 0; col < BOARD_SIZE; col++) if (!target.wasShot(col, row)) open.push({ col, row });
    const { col, row } = open[Math.floor(this.rng() * open.length)];
    this._fire(seat, col, row, true);
  }

  _shoot(seat, col, row) {
    if (this.state !== 'battle' || seat !== this.turn || this._paused) return false;
    if (this.seats[1 - seat].board.wasShot(col, row)) return false;
    this.seats[seat].missed = 0;
    this._fire(seat, col, row, false);
    return true;
  }

  _fire(seat, col, row, auto) {
    const target = this.seats[1 - seat].board;
    const res = target.receiveShot(col, row);
    const me = this.seats[seat];
    me.stats.shots++;
    if (res.result !== 'miss') me.stats.hits++;
    me.shots.push({ col, row, result: res.result });

    const msg = { type: S2C.shotResult, shooter: seat, col, row, result: res.result };
    if (auto) msg.auto = true;
    if (res.result === 'sunk') msg.ship = shipInfo(target.ships[res.shipIndex]);
    this._broadcast(msg);

    if (target.allSunk()) { this._finish(seat, 'allSunk'); return; }
    const next = res.result === 'miss' || !RULES.shootAgainOnHit ? 1 - seat : seat;
    this._startTurn(next, res.result === 'sunk' ? TIMES.sunkAnimMs : TIMES.animMs);
  }

  /** Spielende; winner = Platz oder null (abgebrochen, ohne Wertung). */
  _finish(winner, reason) {
    this._clearPhase();
    this.state = 'gameover';
    this.turn = -1;
    if (winner !== null) this.score[winner]++;
    this.over = {
      type: S2C.gameOver, winner, reason,
      stats: this.seats.map((s) => ({ ...s.stats })),
      score: [...this.score],
    };
    this._broadcast(this.over);
  }

  /**
   * Kompletter Stand für einen zurückkehrenden Platz. Verrät nur, was dieser Platz wissen darf:
   * die eigene Flotte, alle Schüsse samt Ergebnis und die versenkten gegnerischen Schiffe.
   */
  _stateFor(seat) {
    const me = this.seats[seat], foe = this.seats[1 - seat];
    const now = this.clock.now();
    return {
      type: S2C.state,
      seat, name: me.name, opponent: foe.name, phase: this.state,
      fleet: me.board ? fleetOf(me.board) : null,
      opponentReady: !!foe.board,
      shots: me.shots.map((x) => ({ ...x })),
      received: foe.shots.map((x) => ({ ...x })),
      sunk: foe.board ? foe.board.ships.filter((s) => s && s.sunk).map(shipInfo) : [],
      turn: this.turn,
      stats: this.seats.map((s) => ({ ...s.stats })),
      score: [...this.score],
      elapsedMs: this.startedAt ? now - this.startedAt : 0,
      opponentStatus: foe.session ? 'connected' : foe.grace ? 'grace' : 'left',
      ...(foe.grace && { graceMs: Math.max(0, foe.graceUntil - now) }),
      over: this.over,
    };
  }
}

function shipInfo({ index, col, row, orientation, length }) {
  return { index, col, row, orientation, length };
}
