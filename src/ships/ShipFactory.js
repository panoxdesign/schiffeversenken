// Fabrik für Schiffe und Flaggschiffe. Ein gemeinsamer Update-Loop (engine.onUpdate, Priorität 10).
// Orientierung: Bug zeigt bei 'h' nach +x, bei 'v' nach +z (also zum höheren Zellenindex).
import { buildShip } from './shipBuilder.js';
import { Ship, Flagship } from './Ship.js';
import { shipTime } from './materials.js';

export class ShipFactory {
  constructor(engine, world) {
    this.engine = engine;
    this.world = world;
    this._ships = [];
    this._cache = new Map();
    this._scratch = { heave: 0, pitch: 0, roll: 0 };
    this._variantCounter = { player: 0, enemy: 0 };
    this._off = engine.onUpdate((dt, t) => this._update(dt, t), 10);
  }

  _entry(key, params) {
    let e = this._cache.get(key);
    if (!e) {
      e = buildShip(params);
      this._cache.set(key, e);
    }
    return e;
  }

  createShip(length, side = 'player') {
    const detail = this.engine.quality.detail;
    let variant = 0;
    if (length === 3) variant = this._variantCounter[side]++ % 2;
    const key = `${length}|${side}|${detail}|${variant}`;
    const entry = this._entry(key, { cells: length, side, detail, variant });
    const ship = new Ship(this, entry, length, side);
    this._ships.push(ship);
    return ship;
  }

  createFlagship(side = 'player') {
    const detail = this.engine.quality.detail;
    const key = `flag|${side}|${detail}`;
    const entry = this._entry(key, { cells: 5, side, detail, flagship: true });
    const ship = new Flagship(this, entry, side);
    this._ships.push(ship);
    return ship;
  }

  _remove(ship) {
    const i = this._ships.indexOf(ship);
    if (i >= 0) this._ships.splice(i, 1);
  }

  _update(dt, t) {
    shipTime.value = t;
    const s = this._ships;
    for (let i = 0; i < s.length; i++) s[i]._step(dt, t);
  }
}
