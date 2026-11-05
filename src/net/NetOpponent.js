// Netz-Gegner: Gegenstück zum KI-Gegner (src/game/opponents/AIOpponent.js) über den Spielserver.
// Der Server ist Schiedsrichter: Ergebnis und Zugrecht kommen von ihm, nicht aus lokalen Regeln. Darum liefert
// der Netz-Gegner statt `shoot`/`nextShot` einen Strom von Kampfereignissen in Server-Reihenfolge (`nextEvent`).
// Lokal ist der eigene Spieler immer 'player' (links), der Server-Platz (seat 0/1) wird darauf abgebildet.
import { C2S } from '../../shared/protocol.js';
import { NetError } from './NetClient.js';

/**
 * @typedef {object} NetEvents
 * @property {(msg: object) => void} [onGameOver] Spielende vom Server (alle Gründe, auch allSunk)
 * @property {() => void} [onLost] Verbindung zum Server abgerissen
 * @property {(msg: {status: 'grace'|'back'|'left', ms?: number}) => void} [onStatus] Verbindung des Gegners
 * @property {(ms: number, at: number) => void} [onPlacementDeadline] Restzeit der Platzierung ab Empfang `at`
 * @property {(start: {first: 'player'|'enemy', fleet: object[]}) => void} [onStart] Kampf beginnt (auch ohne eigene Flotte,
 *   wenn der Server nach Ablauf der Platzierungszeit ergänzt hat)
 */

export class NetOpponent {
  /**
   * @param {import('./NetClient.js').NetClient} client
   * @param {number} seat eigener Platz auf dem Server
   * @param {NetEvents} [events]
   */
  constructor(client, seat, events = {}) {
    this.client = client;
    this.seat = seat;
    /** start-Nachricht des Servers, sobald der Kampf begonnen hat. */
    this.started = null;
    /** Flotte liegt dem Server schon vor (gesendet oder nach dem Wiederverbinden bekannt). */
    this.fleetSent = false;
    this._off = client.onPush((msg) => this._push(msg, events));
    client.onLost = () => events.onLost && events.onLost();
  }

  /** Server-Platz -> lokale Seite. */
  side(seat) { return seat === this.seat ? 'player' : 'enemy'; }

  _push(msg, ev) {
    switch (msg.type) {
      case 'gameOver': ev.onGameOver && ev.onGameOver(msg); break;
      case 'opponentStatus': ev.onStatus && ev.onStatus(msg); break;
      case 'placementDeadline': ev.onPlacementDeadline && ev.onPlacementDeadline(msg.ms, msg.at); break;
      case 'start':
        if (this.started) break;
        this.started = msg;
        if (ev.onStart) ev.onStart(this._start(msg));
        break;
      default:
    }
  }

  _start(msg) { return { first: this.side(msg.first), fleet: msg.fleet }; }

  /** Flotte übergeben (falls der Server nicht schon begonnen hat) und auf den Start warten -> { first, fleet }. */
  async submitFleet(ships) {
    if (!this.started && !this.fleetSent) { this.fleetSent = true; this.client.send({ type: C2S.placeFleet, ships }); }
    const m = await this.client.next((x) => x.type === 'start' || (x.type === 'error' && x.for === C2S.placeFleet));
    if (m.type === 'error') throw new NetError(m.code);
    return this._start(m);
  }

  /**
   * Nächstes Kampfereignis in Server-Reihenfolge:
   *   { type: 'shotResult', shooter, col, row, result, ship?, auto? } · { type: 'turn', seat, ms, at } ·
   *   { type: 'error', for: 'shoot' } (Schuss abgelehnt, z. B. weil die Zeit gerade ablief).
   * Wirft NetError 'ended' nach Spielende bzw. 'connection' ohne Verbindung.
   */
  nextEvent() {
    return this.client.next((x) => x.type === 'shotResult' || x.type === 'turn' || (x.type === 'error' && x.for === C2S.shoot));
  }

  /** Eigener Schuss; das Ergebnis kommt als shotResult über nextEvent. */
  shoot(col, row) { this.client.send({ type: C2S.shoot, col, row }); }

  /** Flagge streichen; das Spielende kommt als gameOver. */
  resign() { this.client.send({ type: C2S.resign }); }

  /** Raum verlassen und trennen (zählt im Kampf als Aufgabe). */
  dispose() {
    this._off();
    this.client.onLost = null;
    this.client.send({ type: C2S.leave });
    this.client.close();
  }
}
