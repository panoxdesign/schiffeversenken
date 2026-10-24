// Gegner-KI (reine Logik, kein three.js).
import { neighborCells } from './Board.js';

const UNKNOWN = 0, MISS = 1, HIT = 2, SUNK = 3, BLOCKED = 4;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class AI {
  /**
   * @param {'easy'|'normal'|'hard'} difficulty
   * @param {()=>number} rng
   * @param {{fleet:number[], size?:number, noTouching?:boolean}} opts fleet = Schiffslängen
   */
  constructor(difficulty = 'normal', rng = Math.random, { fleet, size = 10, noTouching = true } = {}) {
    this.difficulty = difficulty;
    this.rng = rng;
    this.size = size;
    this.noTouching = noTouching;
    this.remaining = fleet.slice();
    this.state = new Uint8Array(size * size);
    this.density = new Float32Array(size * size);
  }

  _at(c, r) { return this.state[r * this.size + c]; }
  _in(c, r) { return c >= 0 && r >= 0 && c < this.size && r < this.size; }

  /** Ergebnis des letzten Schusses melden. sunkCells nur bei 'sunk'. */
  notify(col, row, result, sunkCells) {
    const k = row * this.size + col;
    if (result === 'miss') this.state[k] = MISS;
    else if (result === 'hit') this.state[k] = HIT;
    else if (result === 'sunk') {
      this.state[k] = HIT;
      const cells = sunkCells && sunkCells.length ? sunkCells : this._clusterFrom(col, row);
      for (const c of cells) this.state[c.row * this.size + c.col] = SUNK;
      const i = this.remaining.indexOf(cells.length);
      if (i >= 0) this.remaining.splice(i, 1);
      if (this.noTouching && this.difficulty === 'hard') { // nur die schwere KI nutzt die Berührungsregel
        for (const n of neighborCells(cells, this.size)) {
          const nk = n.row * this.size + n.col;
          if (this.state[nk] === UNKNOWN) this.state[nk] = BLOCKED;
        }
      }
    }
  }

  /** Fallback ohne sunkCells: zusammenhängende Treffer ab (col,row). */
  _clusterFrom(col, row) {
    const out = [], stack = [[col, row]], seen = new Set();
    while (stack.length) {
      const [c, r] = stack.pop();
      const k = r * this.size + c;
      if (seen.has(k) || !this._in(c, r) || (this.state[k] !== HIT)) continue;
      seen.add(k); out.push({ col: c, row: r });
      for (const [dc, dr] of DIRS) stack.push([c + dc, r + dr]);
    }
    return out;
  }

  chooseShot() {
    let s;
    if (this.difficulty === 'easy') s = this._easy();
    else if (this.difficulty === 'hard') s = this._hard();
    else s = this._normal();
    if (!s) s = this._anyUnknown(true) || this._anyUnknown(false);
    return s;
  }

  _pick(list) { return list[Math.floor(this.rng() * list.length)]; }

  _anyUnknown(skipBlocked) {
    const list = [];
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
      const v = this._at(c, r);
      if (v === UNKNOWN || (!skipBlocked && v === BLOCKED)) list.push({ col: c, row: r });
    }
    return list.length ? this._pick(list) : null;
  }

  _hits() {
    const out = [];
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) if (this._at(c, r) === HIT) out.push({ col: c, row: r });
    return out;
  }

  _free(c, r) { return this._in(c, r) && this._at(c, r) === UNKNOWN; }

  _easy() {
    const hits = this._hits();
    if (hits.length && this.rng() < 0.4) {
      const cand = [];
      for (const h of hits) for (const [dc, dr] of DIRS) if (this._free(h.col + dc, h.row + dr)) cand.push({ col: h.col + dc, row: h.row + dr });
      if (cand.length) return this._pick(cand);
    }
    const list = [];
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) if (this._at(c, r) === UNKNOWN) list.push({ col: c, row: r });
    return list.length ? this._pick(list) : null;
  }

  _normal() {
    const hits = this._hits();
    if (hits.length) {
      // Kandidaten mit Priorität: Fortsetzung einer Linie aus >=2 Treffern zuerst
      let best = [], bestScore = -1;
      for (const h of hits) {
        for (const [dc, dr] of DIRS) {
          const c = h.col + dc, r = h.row + dr;
          if (!this._free(c, r)) continue;
          let score = 1;
          // Linie in Gegenrichtung?
          let run = 0, pc = h.col - dc, pr = h.row - dr;
          while (this._in(pc, pr) && this._at(pc, pr) === HIT) { run++; pc -= dc; pr -= dr; }
          if (run > 0) score = 10 + run;
          if (score > bestScore) { bestScore = score; best = [{ col: c, row: r }]; }
          else if (score === bestScore) best.push({ col: c, row: r });
        }
      }
      if (best.length) return this._pick(best);
    }
    // Hunt: Schachbrettmuster (Parität nach kleinstem Schiff)
    const minLen = Math.min(...this.remaining, 99);
    const step = minLen >= 2 ? 2 : 1;
    const list = [];
    for (let r = 0; r < this.size; r++) for (let c = 0; c < this.size; c++) {
      if (this._at(c, r) === UNKNOWN && (c + r) % step === 0) list.push({ col: c, row: r });
    }
    if (list.length) return this._pick(list);
    return this._anyUnknown(true);
  }

  _hard() {
    const n = this.size;
    const d = this.density;
    d.fill(0);
    const hitsExist = this.state.includes(HIT);
    const lens = new Set(this.remaining);
    const counts = new Map();
    for (const l of this.remaining) counts.set(l, (counts.get(l) || 0) + 1);
    for (const len of lens) {
      const mult = counts.get(len);
      for (let o = 0; o < 2; o++) {
        const dc = o === 0 ? 1 : 0, dr = o === 0 ? 0 : 1;
        const maxC = n - dc * (len - 1), maxR = n - dr * (len - 1);
        for (let r = 0; r < maxR; r++) for (let c = 0; c < maxC; c++) {
          let ok = true, k = 0;
          for (let i = 0; i < len; i++) {
            const v = this.state[(r + dr * i) * n + c + dc * i];
            if (v === HIT) k++;
            else if (v !== UNKNOWN) { ok = false; break; }
          }
          if (!ok) continue;
          let w = mult;
          if (k > 0) w *= Math.pow(40, k);
          else if (hitsExist) w *= 0.02;
          for (let i = 0; i < len; i++) {
            const idx = (r + dr * i) * n + c + dc * i;
            if (this.state[idx] === UNKNOWN) d[idx] += w;
          }
        }
      }
    }
    let best = [], bestV = 0;
    for (let i = 0; i < n * n; i++) {
      if (this.state[i] !== UNKNOWN) continue;
      const v = d[i];
      if (v > bestV * 1.0000001) { bestV = v; best = [i]; }
      else if (v >= bestV * 0.9999999 && v > 0) best.push(i);
    }
    if (!best.length) return null;
    const i = best[Math.floor(this.rng() * best.length)];
    return { col: i % n, row: Math.floor(i / n) };
  }
}
