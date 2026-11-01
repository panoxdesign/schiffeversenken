// Netz-Gegner: erfüllt die Gegner-Schnittstelle (siehe src/game/opponents/AIOpponent.js) über den Spielserver.
// Der Server ist Schiedsrichter; das gegnerische Brett im Client ist ein reines Wissens-Brett.
// Lokal ist der eigene Spieler immer 'player' (links), der Server-Platz (seat 0/1) wird darauf abgebildet.
import { C2S } from '../../shared/protocol.js';
import { NetError } from './NetClient.js';

export class NetOpponent {
  /**
   * @param {import('./NetClient.js').NetClient} client
   * @param {number} seat eigener Platz auf dem Server
   * @param {{ onGameOver?: (msg: object) => void, onLost?: () => void }} [events]
   *   onGameOver: Spielende vom Server (alle Gründe, auch allSunk); onLost: Verbindung zum Server abgerissen.
   */
  constructor(client, seat, { onGameOver, onLost } = {}) {
    this.client = client;
    this.seat = seat;
    this._off = client.onPush((msg) => { if (msg.type === 'gameOver' && onGameOver) onGameOver(msg); });
    client.onLost = () => onLost && onLost();
  }

  async submitFleet(ships) {
    this.client.send({ type: C2S.placeFleet, ships });
    const { first } = await this._reply(C2S.placeFleet, (m) => m.type === 'start');
    return { first: first === this.seat ? 'player' : 'enemy' };
  }

  async shoot(col, row) {
    this.client.send({ type: C2S.shoot, col, row });
    const m = await this._reply(C2S.shoot, (x) => x.type === 'shotResult' && x.shooter === this.seat);
    return m.result === 'sunk' ? { result: 'sunk', ship: m.ship } : { result: m.result };
  }

  /** Antwort auf eine eigene Nachricht; lehnt der Server sie ab (error for=type), wird geworfen statt ewig zu warten. */
  async _reply(type, ok) {
    const m = await this.client.next((x) => ok(x) || (x.type === 'error' && x.for === type));
    if (m.type === 'error') throw new NetError(m.code);
    return m;
  }

  async nextShot() {
    const m = await this.client.next((x) => x.type === 'shotResult' && x.shooter !== this.seat);
    return { col: m.col, row: m.row, result: m.result };
  }

  /** Raum verlassen und trennen (zählt im Kampf als Aufgabe). */
  dispose() {
    this._off();
    this.client.onLost = null;
    this.client.send({ type: C2S.leave });
    this.client.close();
  }
}
