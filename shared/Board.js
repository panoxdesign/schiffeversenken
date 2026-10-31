// Reine Spielfeld-Logik (kein three.js). Schiffe werden über ihren Flottenindex identifiziert.

export class Board {
  /** @param {{size?:number, noTouching?:boolean}} opts */
  constructor({ size = 10, noTouching = true } = {}) {
    this.size = size;
    this.noTouching = noTouching;
    /** Eintrag pro Flottenindex: { index, length, col, row, orientation, cells:[{col,row}], hits:number, sunk } */
    this.ships = [];
    this.grid = new Int16Array(size * size).fill(-1); // Schiffsindex je Zelle
    this.shots = new Uint8Array(size * size); // 0 = nicht beschossen, 1 = Fehlschuss, 2 = Treffer
  }

  inBounds(col, row) { return col >= 0 && row >= 0 && col < this.size && row < this.size; }

  clear() {
    this.ships.length = 0;
    this.grid.fill(-1);
    this.shots.fill(0);
  }

  resetShots() {
    this.shots.fill(0);
    for (const s of this.ships) if (s) { s.hits = 0; s.sunk = false; }
  }

  /** Kann ein Schiff dort liegen? ignoreIndex: dieses Schiff (beim Verschieben) ignorieren. */
  canPlace(length, col, row, orientation, ignoreIndex = -1) {
    const dc = orientation === 'h' ? 1 : 0;
    const dr = orientation === 'h' ? 0 : 1;
    const endC = col + dc * (length - 1);
    const endR = row + dr * (length - 1);
    if (!this.inBounds(col, row) || !this.inBounds(endC, endR)) return false;
    const m = this.noTouching ? 1 : 0;
    for (let i = 0; i < length; i++) {
      const c = col + dc * i, r = row + dr * i;
      for (let rr = r - m; rr <= r + m; rr++) {
        for (let cc = c - m; cc <= c + m; cc++) {
          if (!this.inBounds(cc, rr)) continue;
          const s = this.grid[rr * this.size + cc];
          if (s >= 0 && s !== ignoreIndex) return false;
        }
      }
    }
    return true;
  }

  /** Platziert Schiff `index`. Ein vorhandenes Schiff mit diesem Index wird zuvor verschoben. */
  place(index, length, col, row, orientation) {
    if (!this.canPlace(length, col, row, orientation, index)) return false;
    this.remove(index);
    const cells = [];
    for (let i = 0; i < length; i++) {
      const c = orientation === 'h' ? col + i : col;
      const r = orientation === 'h' ? row : row + i;
      cells.push({ col: c, row: r });
      this.grid[r * this.size + c] = index;
    }
    this.ships[index] = { index, length, col, row, orientation, cells, hits: 0, sunk: false };
    return true;
  }

  remove(index) {
    const s = this.ships[index];
    if (!s) return false;
    for (const c of s.cells) this.grid[c.row * this.size + c.col] = -1;
    this.ships[index] = undefined;
    return true;
  }

  /** Flottenindex des Schiffs auf der Zelle oder -1. */
  shipAt(col, row) {
    if (!this.inBounds(col, row)) return -1;
    return this.grid[row * this.size + col];
  }

  isPlaced(index) { return !!this.ships[index]; }

  /** Zufällige Platzierung der Flotte (lengths: Array von Längen). Hängt nie. */
  randomize(lengths, rng = Math.random) {
    const n = lengths.length;
    // längste zuerst platzieren (robuster), Index bleibt Flottenindex
    const order = lengths.map((l, i) => i).sort((a, b) => lengths[b] - lengths[a]);
    for (let attempt = 0; attempt < 300; attempt++) {
      this.clear();
      let ok = true;
      for (const idx of order) {
        if (!this._placeRandom(idx, lengths[idx], rng, 60)) { ok = false; break; }
      }
      if (ok) return true;
    }
    // Fallback: systematisch (deterministisch, aber mit zufälligem Start)
    this.clear();
    const startOffset = Math.floor(rng() * this.size * this.size);
    let ok = true;
    for (const idx of order) {
      let placed = false;
      for (let k = 0; k < this.size * this.size * 2 && !placed; k++) {
        const p = (k + startOffset) % (this.size * this.size);
        const o = k < this.size * this.size ? 'h' : 'v';
        placed = this.place(idx, lengths[idx], p % this.size, Math.floor(p / this.size), o);
      }
      if (!placed) { ok = false; break; }
    }
    if (!ok) { // letzte Rettung: Berührung erlauben
      const prev = this.noTouching;
      this.noTouching = false;
      this.clear();
      for (const idx of order) this._placeRandom(idx, lengths[idx], rng, 500);
      this.noTouching = prev;
    }
    return this.ships.filter(Boolean).length === n;
  }

  /**
   * Ergänzt fehlende Schiffe zufällig; bereits gesetzte bleiben unverändert (Platzierungs-Timeout).
   * @returns {boolean} false, wenn die gesetzten Schiffe keinen Platz mehr lassen.
   */
  completeRandom(lengths, rng = Math.random) {
    const missing = lengths.map((l, i) => i).filter((i) => !this.isPlaced(i)).sort((a, b) => lengths[b] - lengths[a]);
    if (!missing.length) return true;
    for (let attempt = 0; attempt < 300; attempt++) {
      for (const idx of missing) this.remove(idx);
      if (missing.every((idx) => this._placeRandom(idx, lengths[idx], rng, 60))) return true;
    }
    // Fallback: systematisch alle Positionen ab zufälligem Start
    for (const idx of missing) this.remove(idx);
    const n = this.size * this.size;
    const startOffset = Math.floor(rng() * n);
    for (const idx of missing) {
      let placed = false;
      for (let k = 0; k < n * 2 && !placed; k++) {
        const p = (k + startOffset) % n;
        placed = this.place(idx, lengths[idx], p % this.size, Math.floor(p / this.size), k < n ? 'h' : 'v');
      }
      if (!placed) return false;
    }
    return true;
  }

  _placeRandom(index, length, rng, tries) {
    for (let t = 0; t < tries; t++) {
      const o = rng() < 0.5 ? 'h' : 'v';
      const maxC = o === 'h' ? this.size - length : this.size - 1;
      const maxR = o === 'v' ? this.size - length : this.size - 1;
      const c = Math.floor(rng() * (maxC + 1));
      const r = Math.floor(rng() * (maxR + 1));
      if (this.place(index, length, c, r, o)) return true;
    }
    return false;
  }

  /** @returns {{result:'miss'|'hit'|'sunk'|'repeat', shipIndex:number, cellIndex:number, cells:{col:number,row:number}[]}} */
  receiveShot(col, row) {
    if (!this.inBounds(col, row)) return { result: 'repeat', shipIndex: -1, cellIndex: -1, cells: [] };
    const k = row * this.size + col;
    if (this.shots[k]) return { result: 'repeat', shipIndex: this.grid[k], cellIndex: -1, cells: [] };
    const si = this.grid[k];
    if (si < 0) {
      this.shots[k] = 1;
      return { result: 'miss', shipIndex: -1, cellIndex: -1, cells: [] };
    }
    this.shots[k] = 2;
    const ship = this.ships[si];
    ship.hits++;
    const cellIndex = ship.orientation === 'h' ? col - ship.col : row - ship.row;
    if (ship.hits >= ship.length) {
      ship.sunk = true;
      return { result: 'sunk', shipIndex: si, cellIndex, cells: ship.cells.map((c) => ({ ...c })) };
    }
    return { result: 'hit', shipIndex: si, cellIndex, cells: [] };
  }

  // --- Wissens-Brett: gegnerisches Brett, von dem nur Schussergebnisse bekannt sind.

  /** Schussergebnis eintragen, ohne die Schiffe zu kennen. */
  recordShot(col, row, hit) {
    if (this.inBounds(col, row)) this.shots[row * this.size + col] = hit ? 2 : 1;
  }

  /** Bekannt gewordenes, versenktes Schiff eintragen. */
  recordSunk(index, length, col, row, orientation) {
    this.remove(index);
    const cells = [];
    for (let i = 0; i < length; i++) {
      const c = orientation === 'h' ? col + i : col;
      const r = orientation === 'h' ? row : row + i;
      cells.push({ col: c, row: r });
      this.grid[r * this.size + c] = index;
      this.shots[r * this.size + c] = 2;
    }
    this.ships[index] = { index, length, col, row, orientation, cells, hits: length, sunk: true };
  }

  sunkCount() { return this.ships.filter((s) => s && s.sunk).length; }

  wasShot(col, row) { return this.inBounds(col, row) && this.shots[row * this.size + col] !== 0; }

  allSunk() {
    let any = false;
    for (const s of this.ships) {
      if (!s) continue;
      any = true;
      if (!s.sunk) return false;
    }
    return any;
  }

  /** Nachbarzellen (8er-Nachbarschaft) eines Schiffs, ohne Schiffszellen selbst. */
  neighborsOf(index) {
    const s = this.ships[index];
    if (!s) return [];
    return neighborCells(s.cells, this.size);
  }
}

/** Nachbarzellen einer Zellenmenge (ohne die Zellen selbst). */
export function neighborCells(cells, size) {
  const own = new Set(cells.map((c) => c.row * size + c.col));
  const seen = new Set();
  const out = [];
  for (const c of cells) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const cc = c.col + dc, rr = c.row + dr;
        if (cc < 0 || rr < 0 || cc >= size || rr >= size) continue;
        const k = rr * size + cc;
        if (own.has(k) || seen.has(k)) continue;
        seen.add(k);
        out.push({ col: cc, row: rr });
      }
    }
  }
  return out;
}
