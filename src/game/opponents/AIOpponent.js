// KI-Gegner: lokales Brett mit zufälliger Flotte + AI. Kein three.js.
//
// Gegner-Schnittstelle (wird vom GameController genutzt; Netz-Gegner folgt mit Etappe 4):
//   submitFleet(ships)  -> Promise<{ first: 'player'|'enemy' }>   ships im placeFleet-Format, wartet ggf. auf den Gegner
//   shoot(col, row)     -> Promise<{ result: 'miss'|'hit'|'sunk', ship? }>   eigener Schuss; ship nur bei 'sunk':
//                          { index, col, row, orientation, length }
//   nextShot()          -> Promise<{ col, row, result }>             nächster gegnerischer Schuss auf die eigene Flotte
//   dispose()
// Ergebnisse auf das eigene Brett wertet der Controller selbst aus; `result` dient dem Abgleich.
import { Board } from '../../../shared/Board.js';
import { FLEET, RULES, BOARD_SIZE } from '../../../shared/rules.js';
import { AI } from '../AI.js';

const LENGTHS = FLEET.map((f) => f.length);
const newBoard = () => new Board({ size: BOARD_SIZE, noTouching: RULES.noTouching });

export class AIOpponent {
  /**
   * @param {{difficulty?: 'easy'|'normal'|'hard', rng?: () => number, sleep?: (sec: number) => Promise<void>}} opts
   *   sleep: Bedenkzeit vor einem Schuss (vom Controller, damit Zeitskala/Tests greifen)
   */
  constructor({ difficulty = 'normal', rng = Math.random, sleep = () => Promise.resolve() } = {}) {
    this.rng = rng;
    this.sleep = sleep;
    /** Eigene (verdeckte) Flotte – auch für die Debug-API. */
    this.board = newBoard();
    this.board.randomize(LENGTHS, rng);
    this.ai = new AI(difficulty, rng, { fleet: LENGTHS, size: BOARD_SIZE, noTouching: RULES.noTouching });
    this._target = null; // Kopie der Spielerflotte
    this._streak = false; // letzter eigener Schuss war Treffer -> kurze Pause statt Bedenkzeit
  }

  async submitFleet(ships) {
    const b = newBoard();
    for (const s of ships) b.place(s.index, FLEET[s.index].length, s.col, s.row, s.orientation);
    this._target = b;
    return { first: 'player' };
  }

  async shoot(col, row) {
    const res = this.board.receiveShot(col, row);
    if (res.result !== 'sunk') return { result: res.result };
    const { index, col: c, row: r, orientation, length } = this.board.ships[res.shipIndex];
    return { result: 'sunk', ship: { index, col: c, row: r, orientation, length } };
  }

  async nextShot() {
    await this.sleep(this._streak ? 0.4 : 0.6 + this.rng() * 0.5);
    let shot = this.ai.chooseShot();
    if (!shot || this._target.wasShot(shot.col, shot.row)) shot = this._anyUnshot();
    if (!shot) return null;
    const res = this._target.receiveShot(shot.col, shot.row);
    this.ai.notify(shot.col, shot.row, res.result === 'repeat' ? 'miss' : res.result, res.cells);
    this._streak = res.result === 'hit' || res.result === 'sunk';
    return { col: shot.col, row: shot.row, result: res.result };
  }

  _anyUnshot() {
    const list = [];
    for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) if (!this._target.wasShot(c, r)) list.push({ col: c, row: r });
    return list.length ? list[Math.floor(this.rng() * list.length)] : null;
  }

  dispose() {}
}
