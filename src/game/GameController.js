// Spielablauf: MENU -> PLACEMENT -> BATTLE -> GAMEOVER. Inszenierung gegen die Modul-Verträge (ARCHITECTURE.md).
import * as THREE from 'three';
import { FLEET, RULES, BOARD_SIZE, COL_LABELS, ROW_LABELS, FLAGSHIP_POSITION, BOARD_CENTER } from '../config.js';
import { Board } from './Board.js';
import { AI } from './AI.js';
import { Input } from './Input.js';

const CANCEL = { cancelled: true };
const LENGTHS = FLEET.map((f) => f.length);

/** Defensiver Aufruf: fehlende Methode oder Fehler blockieren das Spiel nie. */
function call(obj, method, ...args) {
  try {
    const fn = obj && obj[method];
    return typeof fn === 'function' ? fn.apply(obj, args) : undefined;
  } catch (e) {
    console.warn(`[game] ${method} fehlgeschlagen`, e);
    return undefined;
  }
}

const label = (c, r) => ROW_LABELS[r] + COL_LABELS[c];

export class GameController {
  constructor(ctx) {
    this.ctx = ctx;
    const { engine } = ctx;
    this.state = 'menu';
    this.difficulty = 'normal';
    this.rng = Math.random;

    this._token = 0;
    this._paused = false;
    this._resumeWaiters = [];
    this._lastPauseToggle = 0;
    this._timeScale = 1; // nur für Debug/Tests

    this.logic = { player: this._newBoard(), enemy: this._newBoard() };
    this.ships = { player: [], enemy: [] };
    this.flagships = { player: null, enemy: null };
    this.ai = null;
    this.stats = this._newStats();
    this._view = null;
    this._pending = null; // wartet auf Spieler-Schuss
    this._readyWaiters = [];
    this._pl = { selected: 0, orientation: 'h', hover: null };

    // Feuer-Handles, deren Position jeden Frame nachgeführt wird (Schiffe schaukeln)
    this._fires = [];
    this._tmpV = new THREE.Vector3();
    this._offUpdate = engine.onUpdate((dt) => this._updateFires(), 15);

    this.input = new Input({ engine, cameraRig: ctx.cameraRig });
    this.input.onHover = (cell) => this._onHover(cell);
    this.input.onSelect = (cell) => this._onSelect(cell);
    this.input.onRotate = () => this._onRotate();
    this.input.onPause = () => this._togglePause();
    ctx.ui.onPauseRequested = () => this._togglePause();

    this.debug = this._makeDebug();
  }

  _newBoard() { return new Board({ size: BOARD_SIZE, noTouching: RULES.noTouching }); }
  _newStats() { return { shots: 0, hits: 0, turns: 0, startedAt: 0 }; }

  // ------------------------------------------------------------------ Menü
  start() {
    this._resetGame();
    const { world, cameraRig, audio, ui } = this.ctx;
    this.state = 'menu';
    call(world, 'setMood', 'menu');
    this._setView('menu', 1.6);
    call(audio, 'playMusic', 'menu');
    call(ui, 'showMainMenu', { onStart: (key) => this._beginPlacement(key) });
  }

  // ------------------------------------------------------------------ Platzierung
  _beginPlacement(key) {
    const { ui, world, audio, boards } = this.ctx;
    this._resetGame();
    if (key) this.difficulty = key;
    this.state = 'placement';
    call(ui, 'hideMainMenu');
    call(world, 'setMood', 'menu');
    call(audio, 'playMusic', 'menu');
    this._setView('placement', 1.6);
    this._pl = { selected: 0, orientation: 'h', hover: null };
    this.input.setBoard(boards.player);
    call(ui, 'showPlacement', {
      fleet: FLEET,
      onSelectShip: (i) => this._plSelect(i),
      onRotate: () => this._plRotate(),
      onRandom: () => this._plRandom(),
      onClear: () => this._plClear(),
      onConfirm: () => this._plConfirm(),
    });
    call(ui, 'announce', 'Platziere deine Flotte', 'info');
    this._plRefresh();
  }

  _plNextFree() {
    for (let i = 0; i < FLEET.length; i++) if (!this.logic.player.isPlaced(i)) return i;
    return -1;
  }

  _plAnchor(len, col, row, o) {
    if (o === 'h') col = Math.min(col, BOARD_SIZE - len);
    else row = Math.min(row, BOARD_SIZE - len);
    return { col, row };
  }

  _plRefresh() {
    const { ui, boards } = this.ctx;
    const pl = this._pl;
    const placed = FLEET.map((f, i) => this.logic.player.isPlaced(i));
    call(ui, 'updatePlacement', { placed, selectedIndex: pl.selected, orientation: pl.orientation, canConfirm: placed.every(Boolean) });
    const h = pl.hover;
    if (!h || pl.selected < 0 || this.state !== 'placement') { call(boards.player, 'hideGhost'); return; }
    const len = LENGTHS[pl.selected];
    const a = this._plAnchor(len, h.col, h.row, pl.orientation);
    const valid = this.logic.player.canPlace(len, a.col, a.row, pl.orientation, pl.selected);
    call(boards.player, 'showGhost', len, a.col, a.row, pl.orientation, valid);
  }

  /** Visuelles Schiff mit der Logik abgleichen. */
  _plSync(i) {
    const { shipFactory, boards } = this.ctx;
    const s = this.logic.player.ships[i];
    let obj = this.ships.player[i];
    if (!s) { if (obj) call(obj, 'setVisible', false); return; }
    if (!obj) { obj = call(shipFactory, 'createShip', LENGTHS[i], 'player'); this.ships.player[i] = obj; }
    call(obj, 'place', boards.player, s.col, s.row, s.orientation);
    call(obj, 'setVisible', true);
  }

  _plSelect(i) {
    if (this.state !== 'placement' || i < 0 || i >= FLEET.length) return;
    if (this.logic.player.isPlaced(i)) { // aufnehmen
      this._pl.orientation = this.logic.player.ships[i].orientation;
      this.logic.player.remove(i);
      this._plSync(i);
    }
    this._pl.selected = i;
    call(this.ctx.audio, 'play', 'click');
    this._plRefresh();
  }

  _plRotate() {
    if (this.state !== 'placement') return;
    this._pl.orientation = this._pl.orientation === 'h' ? 'v' : 'h';
    call(this.ctx.audio, 'play', 'rotate');
    this._plRefresh();
  }

  _plRandom() {
    if (this.state !== 'placement') return;
    this.logic.player.randomize(LENGTHS, this.rng);
    for (let i = 0; i < FLEET.length; i++) this._plSync(i);
    this._pl.selected = -1;
    call(this.ctx.audio, 'play', 'place');
    this._plRefresh();
  }

  _plClear() {
    if (this.state !== 'placement') return;
    this.logic.player.clear();
    for (let i = 0; i < FLEET.length; i++) this._plSync(i);
    this._pl.selected = 0;
    call(this.ctx.audio, 'play', 'click');
    this._plRefresh();
  }

  _plConfirm() {
    if (this.state !== 'placement' || this._plNextFree() !== -1) return;
    this._startBattle();
  }

  _plClick(cell) {
    const pl = this._pl, lp = this.logic.player, audio = this.ctx.audio;
    const idx = lp.shipAt(cell.col, cell.row);
    if (idx >= 0) { // platziertes Schiff wieder aufnehmen
      pl.orientation = lp.ships[idx].orientation;
      lp.remove(idx);
      this._plSync(idx);
      pl.selected = idx;
      pl.hover = cell;
      call(audio, 'play', 'click');
    } else if (pl.selected >= 0) {
      const len = LENGTHS[pl.selected];
      const a = this._plAnchor(len, cell.col, cell.row, pl.orientation);
      if (lp.place(pl.selected, len, a.col, a.row, pl.orientation)) {
        this._plSync(pl.selected);
        call(audio, 'play', 'place');
        pl.selected = this._plNextFree();
      } else {
        call(audio, 'play', 'error');
      }
    }
    this._plRefresh();
  }

  // ------------------------------------------------------------------ Eingabe-Weiterleitung
  _onHover(cell) {
    if (this._paused) return;
    const { boards, ui } = this.ctx;
    if (this.state === 'placement') {
      this._pl.hover = cell;
      this._plRefresh();
    } else if (this.state === 'battle' && this._pending) {
      if (cell) {
        call(boards.enemy, 'setHover', cell.col, cell.row, this.logic.enemy.wasShot(cell.col, cell.row) ? 'invalid' : 'aim');
        call(ui, 'setCoordinate', label(cell.col, cell.row));
      } else {
        call(boards.enemy, 'setHover', 0, 0, null);
        call(ui, 'setCoordinate', null);
      }
    }
  }

  _onSelect(cell) {
    if (this._paused) return;
    if (this.state === 'placement') this._plClick(cell);
    else if (this.state === 'battle' && this._pending) {
      if (this.logic.enemy.wasShot(cell.col, cell.row)) { call(this.ctx.audio, 'play', 'error'); return; }
      const p = this._pending;
      this._pending = null;
      this.input.setBoard(null);
      call(this.ctx.boards.enemy, 'setHover', 0, 0, null);
      call(this.ctx.ui, 'setCoordinate', null);
      p.resolve(cell);
    }
  }

  _onRotate() { if (!this._paused) this._plRotate(); }

  // ------------------------------------------------------------------ Pause
  _togglePause() {
    const now = performance.now();
    if (now - this._lastPauseToggle < 200) return; // UI und Input melden ESC evtl. beide
    this._lastPauseToggle = now;
    if (this._paused) { this._resume(); return; }
    if (this.state !== 'placement' && this.state !== 'battle') return;
    this._paused = true;
    this._pauseStart = now;
    this.input.enabled = false;
    call(this.ctx.ui, 'showPause', { onResume: () => this._resume(), onMenu: () => { this._paused = false; this.start(); } });
  }

  _resume() {
    if (!this._paused) return;
    this._paused = false;
    this.stats.startedAt += performance.now() - this._pauseStart;
    this.input.enabled = true;
    call(this.ctx.ui, 'hidePause');
    const w = this._resumeWaiters.splice(0);
    for (const r of w) r();
    this.input.refresh();
  }

  // ------------------------------------------------------------------ Async-Helfer
  async _cp(token) {
    if (token !== this._token) throw CANCEL;
    while (this._paused) {
      await new Promise((r) => this._resumeWaiters.push(r));
      if (token !== this._token) throw CANCEL;
    }
  }

  async _race(p, token, ms = 6000) {
    let t;
    const timeout = new Promise((r) => { t = setTimeout(r, ms); });
    try { await Promise.race([Promise.resolve(p), timeout]); }
    catch (e) { console.warn('[game] Animation-Fehler', e); }
    finally { clearTimeout(t); }
    await this._cp(token);
  }

  async _wait(sec, token) {
    await new Promise((r) => setTimeout(r, sec * 1000 * this._timeScale));
    await this._cp(token);
  }

  _setView(name, dur) {
    this._view = name;
    let p;
    try { p = this.ctx.cameraRig.setView(name, dur); } catch (e) { console.warn(e); }
    return Promise.resolve(p).catch((e) => console.warn(e));
  }

  async _camTo(name, dur, token) {
    if (this._view === name) return;
    await this._race(this._setView(name, dur), token, 4000);
  }

  // ------------------------------------------------------------------ Aufräumen
  _stopAllFires() {
    for (const f of this._fires) call(f.handle, 'stop');
    this._fires.length = 0;
  }

  _resetGame() {
    const { ui, boards, fx, world } = this.ctx;
    this._token++;
    this._paused = false;
    const w = this._resumeWaiters.splice(0);
    for (const r of w) r();
    if (this._pending) { const p = this._pending; this._pending = null; p.reject(CANCEL); }
    this._readyWaiters.splice(0).forEach((r) => r());
    this.input.enabled = true;
    this.input.setBoard(null);
    this._stopAllFires();
    for (const side of ['player', 'enemy']) {
      for (const s of this.ships[side]) if (s) call(s, 'dispose');
      this.ships[side] = [];
      this.logic[side] = this._newBoard();
      const b = boards[side];
      call(b, 'clearMarkers');
      call(b, 'hideGhost');
      call(b, 'setHover', 0, 0, null);
      call(b, 'setActive', false);
    }
    call(fx, 'clearAll');
    for (const m of ['hideMainMenu', 'hidePlacement', 'hideHUD', 'hideGameOver', 'hidePause']) call(ui, m);
    call(ui, 'setCoordinate', null);
    this.ai = null;
    this.stats = this._newStats();
  }

  // ------------------------------------------------------------------ Kampf
  _ensureFlagships() {
    const { shipFactory } = this.ctx;
    for (const side of ['player', 'enemy']) {
      if (!this.flagships[side]) this.flagships[side] = call(shipFactory, 'createFlagship', side) || null;
    }
  }

  _startBattle() {
    const { ui, world, audio, boards, shipFactory } = this.ctx;
    const token = this._token;
    this.state = 'battle';
    call(ui, 'hidePlacement');
    call(boards.player, 'hideGhost');
    this.input.setBoard(null);

    // Gegnerflotte
    this.logic.enemy.randomize(LENGTHS, this.rng);
    for (let i = 0; i < FLEET.length; i++) {
      const s = this.logic.enemy.ships[i];
      const ship = call(shipFactory, 'createShip', LENGTHS[i], 'enemy');
      this.ships.enemy[i] = ship;
      call(ship, 'place', boards.enemy, s.col, s.row, s.orientation);
      call(ship, 'setVisible', false);
    }
    this._ensureFlagships();
    this.ai = new AI(this.difficulty, this.rng, { fleet: LENGTHS, size: BOARD_SIZE, noTouching: RULES.noTouching });
    this.stats = this._newStats();
    this.stats.startedAt = performance.now();

    call(world, 'setMood', 'battle');
    call(audio, 'playMusic', 'battle');
    call(ui, 'showHUD');
    this._updateUI('player');
    this._battleLoop(token);
  }

  async _battleLoop(token) {
    let errors = 0;
    while (token === this._token) {
      try {
        await this._camTo('enemy', 1.4, token);
        for (;;) {
          const w = await this._playerTurn(token);
          if (w === 'won') { await this._gameOver(true, token); return; }
          const l = await this._enemyTurn(token);
          if (l === 'lost') { await this._gameOver(false, token); return; }
        }
      } catch (e) {
        if (e === CANCEL) return;
        console.error('[game] Fehler im Kampfablauf', e);
        if (++errors > 5) { console.error('[game] zu viele Fehler, zurück ins Menü'); this.start(); return; }
        this._pending = null;
      }
    }
  }

  _awaitPlayerShot(token) {
    return new Promise((resolve, reject) => {
      this._pending = { resolve, reject };
      this.input.setBoard(this.ctx.boards.enemy);
      this.input.refresh();
      this._readyWaiters.splice(0).forEach((r) => r());
    });
  }

  async _playerTurn(token) {
    const { ui, boards } = this.ctx;
    this.stats.turns++;
    call(ui, 'setTurn', 'player');
    call(boards.player, 'setActive', false);
    call(boards.enemy, 'setActive', true);
    await this._camTo('enemy', 1.1, token);
    call(ui, 'announce', 'Dein Zug', 'turn');
    for (;;) {
      const cell = await this._awaitPlayerShot(token);
      await this._cp(token);
      const res = await this._shoot('player', cell.col, cell.row, token);
      if (res.result === 'repeat') continue;
      this._updateUI('player');
      if (this.logic.enemy.allSunk()) return 'won';
      if (res.result === 'miss' || !RULES.shootAgainOnHit) return 'continue';
    }
  }

  async _enemyTurn(token) {
    const { ui, boards } = this.ctx;
    call(ui, 'setTurn', 'enemy');
    call(boards.enemy, 'setActive', false);
    call(boards.player, 'setActive', true);
    call(ui, 'announce', 'Der Feind ist am Zug', 'turn');
    const think = 0.6 + this.rng() * 0.5;
    await Promise.all([this._camTo('player', 1.1, token), this._wait(think, token)]);
    for (;;) {
      let shot = this.ai.chooseShot();
      if (!shot || this.logic.player.wasShot(shot.col, shot.row)) shot = this._anyUnshot(this.logic.player);
      if (!shot) return 'continue';
      const res = await this._shoot('enemy', shot.col, shot.row, token);
      this.ai.notify(shot.col, shot.row, res.result === 'repeat' ? 'miss' : res.result, res.cells);
      this._updateUI('enemy');
      if (this.logic.player.allSunk()) return 'lost';
      if (res.result === 'miss' || !RULES.shootAgainOnHit) return 'continue';
      await this._wait(0.4, token);
    }
  }

  _anyUnshot(board) {
    const list = [];
    for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) if (!board.wasShot(c, r)) list.push({ col: c, row: r });
    return list.length ? list[Math.floor(this.rng() * list.length)] : null;
  }

  /** Ein kompletter Schuss samt Inszenierung. shooter: 'player' | 'enemy'. */
  async _shoot(shooter, col, row, token) {
    const { boards, fx, audio, cameraRig, world, ui } = this.ctx;
    const tSide = shooter === 'player' ? 'enemy' : 'player';
    const view = boards[tSide];
    const res = this.logic[tSide].receiveShot(col, row);
    if (res.result === 'repeat') return res;
    if (shooter === 'player') { this.stats.shots++; if (res.result !== 'miss') this.stats.hits++; }

    const target = view.cellToWorld ? view.cellToWorld(col, row, new THREE.Vector3()) : new THREE.Vector3();
    target.y = call(world, 'getWaterHeight', target.x, target.z) || 0;

    // Feuern
    const flag = this.flagships[shooter];
    let muzzle = new THREE.Vector3();
    const m = call(flag, 'getCannonPosition', target, muzzle);
    if (m && m.isVector3) muzzle = m; else muzzle.copy(FLAGSHIP_POSITION[shooter]).setY(3);
    call(flag, 'fireRecoil');
    call(audio, 'play', 'cannon', { x: muzzle.x });
    call(cameraRig, 'shake', 0.4);
    setTimeout(() => { if (token === this._token) call(audio, 'play', 'whistle', { x: target.x }); }, 150 * this._timeScale);
    await this._race(call(fx, 'fireCannon', muzzle, target, { flightTime: 0.9 }), token);

    // Ergebnis
    const mine = shooter === 'player';
    if (res.result === 'miss') {
      call(fx, 'splash', target);
      call(audio, 'play', 'splash', { x: target.x });
      call(view, 'markMiss', col, row);
      call(ui, 'announce', mine ? 'Daneben!' : 'Der Feind verfehlt!', 'miss');
      await this._wait(0.45, token);
      return res;
    }

    const ship = this.ships[tSide][res.shipIndex];
    call(fx, 'explosion', target, 1);
    call(audio, 'play', 'explosion', { x: target.x });
    call(cameraRig, 'shake', 0.8);
    call(view, 'markHit', col, row);
    if (tSide === 'player') call(ship, 'damage', res.cellIndex);
    this._startFire(tSide, col, row, ship, res.cellIndex, target);

    if (res.result === 'hit') {
      call(ui, 'announce', mine ? 'Treffer!' : 'Wir wurden getroffen!', 'hit');
      await this._wait(0.55, token);
      return res;
    }

    // Versenkt
    const info = this.logic[tSide].ships[res.shipIndex];
    const name = FLEET[res.shipIndex].name;
    call(ui, 'announce', mine ? `${name} versenkt!` : `Unsere ${name} ist gesunken!`, 'sunk');
    await this._wait(0.5, token);
    this._stopShipFires(tSide, res.shipIndex);
    call(ship, 'setVisible', true);
    if (tSide === 'enemy') for (let i = 0; i < info.length; i++) call(ship, 'damage', i);
    const a = view.cellToWorld(info.col, info.row, new THREE.Vector3());
    const b = view.cellToWorld(info.orientation === 'h' ? info.col + info.length - 1 : info.col, info.orientation === 'v' ? info.row + info.length - 1 : info.row, new THREE.Vector3());
    const mid = a.add(b).multiplyScalar(0.5);
    const sinkP = call(ship, 'sink');
    call(fx, 'sinkEffect', mid, info.length, info.orientation);
    call(audio, 'play', 'sink', { x: mid.x });
    if (RULES.noTouching) for (const n of this.logic[tSide].neighborsOf(res.shipIndex)) call(view, 'markBlocked', n.col, n.row);
    this._updateUI(shooter);
    const over = this.logic[tSide].allSunk();
    await this._wait(over ? 0.8 : 1.0, token);
    if (over) await this._race(sinkP, token, 4000);
    return res;
  }

  // ------------------------------------------------------------------ Feuer
  _startFire(tSide, col, row, ship, cellIndex, target) {
    const handle = call(this.ctx.fx, 'startFire', target, 1);
    if (!handle) return;
    this._fires.push({
      handle, side: tSide, shipIndex: this.logic[tSide].shipAt(col, row), ship: tSide === 'player' ? ship : null,
      idx: cellIndex, x: target.x, z: target.z,
    });
  }

  _stopShipFires(side, shipIndex) {
    for (let i = this._fires.length - 1; i >= 0; i--) {
      const f = this._fires[i];
      if (f.side === side && f.shipIndex === shipIndex) { call(f.handle, 'stop'); this._fires.splice(i, 1); }
    }
  }

  _updateFires() {
    const fires = this._fires;
    if (!fires.length) return;
    const v = this._tmpV, world = this.ctx.world;
    for (let i = 0; i < fires.length; i++) {
      const f = fires[i];
      let ok = false;
      if (f.ship && typeof f.ship.getCellWorldPosition === 'function') {
        try { f.ship.getCellWorldPosition(f.idx, v); ok = true; } catch (_) { /* ignorieren */ }
      }
      if (!ok) {
        const y = world && world.getWaterHeight ? world.getWaterHeight(f.x, f.z) : 0;
        v.set(f.x, y, f.z);
      }
      if (f.handle && typeof f.handle.setPosition === 'function') f.handle.setPosition(v);
    }
  }

  // ------------------------------------------------------------------ UI-Status
  _updateUI(turn) {
    const { ui } = this.ctx;
    const st = (side, hidden) => FLEET.map((f, i) => {
      const s = this.logic[side].ships[i];
      return { name: f.name, length: f.length, hits: s ? (hidden ? (s.sunk ? f.length : 0) : s.hits) : 0, sunk: !!(s && s.sunk) };
    });
    call(ui, 'updateFleetStatus', { player: st('player', false), enemy: st('enemy', true) });
    const { shots, hits } = this.stats;
    call(ui, 'updateStats', { shots, hits, accuracy: shots ? hits / shots : 0, turn: this.stats.turns });
  }

  // ------------------------------------------------------------------ Spielende
  async _gameOver(won, token) {
    const { world, audio, fx, ui, boards } = this.ctx;
    this.state = 'gameover';
    this._readyWaiters.splice(0).forEach((r) => r());
    this.input.setBoard(null);
    call(boards.player, 'setActive', false);
    call(boards.enemy, 'setActive', false);
    call(ui, 'setCoordinate', null);
    call(world, 'setMood', won ? 'victory' : 'defeat');
    call(audio, 'playMusic', 'none');
    call(audio, 'play', won ? 'victory' : 'defeat');
    this._setView(won ? 'victory' : 'defeat', 2.2);
    if (won) {
      call(fx, 'celebrate', BOARD_CENTER.player.clone());
      await this._wait(1.0, token);
      call(fx, 'celebrate', BOARD_CENTER.enemy.clone());
      await this._wait(1.0, token);
    } else {
      await this._wait(2.0, token);
    }
    const { shots, hits, turns, startedAt } = this.stats;
    call(ui, 'hideHUD');
    call(ui, 'showGameOver', {
      won,
      stats: { shots, hits, accuracy: shots ? hits / shots : 0, turns, durationSec: Math.round((performance.now() - startedAt) / 1000) },
      onRestart: () => this._beginPlacement(this.difficulty),
      onMenu: () => this.start(),
    });
  }

  // ------------------------------------------------------------------ Debug
  _makeDebug() {
    const self = this;
    return {
      get state() { return self.state; },
      get logic() { return self.logic; },
      get stats() { return self.stats; },
      get paused() { return self._paused; },
      /** Zeitskala für interne Wartezeiten (0.1 = 10x schneller). */
      setTimeScale(s) { self._timeScale = s; },
      begin(key = 'normal') { self._beginPlacement(key); },
      autoPlace() { self._plRandom(); return self.state; },
      confirm() { self._plConfirm(); return self.state; },
      /** Menü -> Platzierung -> Kampf (Schiffe zufällig). */
      quickStart(key = 'normal') { self._beginPlacement(key); self._plRandom(); self._plConfirm(); return self.state; },
      /** Resolve, sobald der Spieler schießen darf oder das Spiel zu Ende ist. */
      ready(timeoutMs = 60000) {
        return new Promise((resolve) => {
          if (self._pending || self.state === 'gameover') { resolve(self.state); return; }
          const t = setTimeout(() => resolve('timeout'), timeoutMs);
          self._readyWaiters.push(() => { clearTimeout(t); resolve(self.state); });
        });
      },
      /** Schießt als Spieler auf (col,row). */
      fire(col, row) {
        if (!self._pending) return false;
        self._onSelect({ col, row });
        return true;
      },
      /** mode: 'hit' = nächste unbeschossene Gegner-Schiffszelle, 'miss' = Wasserzelle, 'random'. */
      async autoFire(mode = 'random') {
        await this.ready();
        if (!self._pending) return null;
        const lg = self.logic.enemy, cand = [];
        for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
          if (lg.wasShot(c, r)) continue;
          const isShip = lg.shipAt(c, r) >= 0;
          if (mode === 'hit' ? isShip : mode === 'miss' ? !isShip : true) cand.push([c, r]);
        }
        if (!cand.length) return null;
        const [c, r] = cand[Math.floor(Math.random() * cand.length)];
        self._onSelect({ col: c, row: r });
        return { col: c, row: r };
      },
      /** n Spielerzüge automatisch (Muster z. B. ['miss','hit','random']); danach Status. */
      async simulate(n = 5, pattern = ['random']) {
        for (let i = 0; i < n && self.state === 'battle'; i++) {
          await this.autoFire(pattern[i % pattern.length]);
          await new Promise((r) => setTimeout(r, 30));
        }
        return this.status();
      },
      /** Spielt bis zum Ende (mode 'random' oder 'hit' für schnellen Sieg). */
      async playToEnd(mode = 'random', maxShots = 300) {
        for (let i = 0; i < maxShots && self.state !== 'gameover'; i++) {
          const r = await this.autoFire(mode);
          if (!r && self.state !== 'gameover') await new Promise((res) => setTimeout(res, 50));
        }
        return this.status();
      },
      status() {
        return { state: self.state, difficulty: self.difficulty, stats: { ...self.stats }, fires: self._fires.length, pending: !!self._pending };
      },
    };
  }
}
