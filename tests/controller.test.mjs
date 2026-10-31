// Headless-Test des GameControllers mit Mocks (kein DOM/WebGL nötig).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

globalThis.window = globalThis.window || Object.assign(new EventTarget(), { innerWidth: 1280, innerHeight: 720 });
const { GameController } = await import('../src/game/GameController.js');
const { BOARD_CENTER, CELL, FLEET } = await import('../src/config.js');

const until = async (fn) => { for (let i = 0; i < 400 && !fn(); i++) await new Promise((r) => setTimeout(r, 5)); };

function makeCtx() {
  const calls = {};
  const count = (n) => (calls[n] = (calls[n] || 0) + 1);
  const dom = Object.assign(new EventTarget(), { setPointerCapture() {}, releasePointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) });
  const updaters = [];
  const engine = {
    renderer: { domElement: dom }, camera: new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 500), width: 1280, height: 720, time: 0,
    onUpdate(fn) { updaters.push(fn); return () => updaters.splice(updaters.indexOf(fn), 1); },
  };
  engine.camera.position.set(-12, 30, 26); engine.camera.lookAt(-12, 0, 0); engine.camera.updateMatrixWorld(true);
  const mkBoard = (side) => ({
    center: BOARD_CENTER[side].clone(), ghost: null, markers: { hit: 0, miss: 0, blocked: 0 },
    cellToWorld(c, r, t = new THREE.Vector3()) { return t.set(this.center.x + (c - 4.5) * CELL, 0, this.center.z + (r - 4.5) * CELL); },
    worldToCell(p) { const c = Math.floor((p.x - this.center.x) / CELL + 5), r = Math.floor((p.z - this.center.z) / CELL + 5); return c < 0 || r < 0 || c > 9 || r > 9 ? null : { col: c, row: r }; },
    setHover() { count('hover'); }, showGhost(...a) { this.ghost = a; }, hideGhost() { this.ghost = null; },
    markHit() { this.markers.hit++; }, markMiss() { this.markers.miss++; }, markBlocked() { this.markers.blocked++; },
    clearMarkers() { this.markers = { hit: 0, miss: 0, blocked: 0 }; }, setActive() {}, setLabelsVisible() {},
  });
  let alive = 0, fires = 0;
  const ctx = {
    engine, world: { setMood: (m) => (calls.mood = m), getWaterHeight: () => 0 },
    boards: { player: mkBoard('player'), enemy: mkBoard('enemy') },
    shipFactory: {
      createShip(length) { alive++; return { length, place() {}, setVisible(v) { this.v = v; }, damage() {}, getCellWorldPosition(i, t) { return t.set(i, 1, 0); }, sink: () => Promise.resolve(), reset() {}, dispose() { alive--; } }; },
      createFlagship: () => ({ getCannonPosition: (t, o) => o.set(30, 3, 0), fireRecoil() {} }),
    },
    fx: { fireCannon: () => Promise.resolve(), splash() {}, explosion() {}, startFire() { fires++; return { setPosition() {}, stop() { fires--; } }; }, sinkEffect() {}, celebrate() {}, clearAll() {} },
    cameraRig: { setView: () => Promise.resolve(), shake() {}, setPointerParallax() {} },
    audio: { play: (n) => count('snd:' + n), playMusic() {} },
    ui: new Proxy({ onPauseRequested: null }, { get: (t, k) => (k in t ? t[k] : (...a) => { count(String(k)); if (k === 'showGameOver') t.gameOver = a[0]; if (k === 'showMainMenu') t.menu = a[0]; return undefined; }), set: (t, k, v) => { t[k] = v; return true; } }),
  };
  return { ctx, calls, counters: () => ({ alive, fires }), updaters };
}

test('Vollständige Partien inkl. Neustart ohne Lecks', async () => {
  const { ctx, calls, counters, updaters } = makeCtx();
  const gc = new GameController(ctx);
  gc.debug.setTimeScale(0);
  gc.start();
  assert.equal(gc.state, 'menu');
  for (let game = 0; game < 3; game++) {
    ctx.ui.menu ? null : null;
    gc.debug.quickStart(['easy', 'normal', 'hard'][game]);
    assert.equal(gc.state, 'battle');
    // einige Fehlschüsse (Gegnerzüge), dann Treffer bis zum Sieg
    await gc.debug.simulate(4, ['miss']);
    for (const u of updaters) u(0.016, 1);
    const st = await gc.debug.playToEnd('hit');
    assert.equal(st.state, 'gameover', JSON.stringify(st));
    await until(() => typeof ctx.ui.gameOver === 'object');
    assert.equal(ctx.ui.gameOver.won, true);
    assert.ok(ctx.ui.gameOver.stats.shots >= 21);
    ctx.ui.gameOver.onRestart();
    delete ctx.ui.gameOver;
    assert.equal(gc.state, 'placement');
    assert.deepEqual(counters(), { alive: 0, fires: 0 });
  }
  assert.ok(calls['snd:explosion'] > 0 && calls['snd:splash'] > 0 && calls['snd:sink'] >= 15);
  gc.start();
  assert.equal(counters().alive, 0);
});

test('Niederlage: Spieler schießt nur daneben', async () => {
  const { ctx, counters } = makeCtx();
  const gc = new GameController(ctx);
  gc.debug.setTimeScale(0);
  gc.debug.quickStart('hard');
  const st = await gc.debug.playToEnd('miss');
  assert.equal(st.state, 'gameover');
  await until(() => typeof ctx.ui.gameOver === 'object');
  assert.equal(ctx.ui.gameOver.won, false);
  ctx.ui.gameOver.onMenu();
  assert.equal(gc.state, 'menu');
  assert.deepEqual(counters(), { alive: 0, fires: 0 });
});

test('Abbruch mitten in der Sequenz startet keine alten Abläufe', async () => {
  const { ctx, counters } = makeCtx();
  let release;
  ctx.fx.fireCannon = () => new Promise((r) => { release = r; });
  const gc = new GameController(ctx);
  gc.debug.setTimeScale(0);
  gc.debug.quickStart('normal');
  await gc.debug.autoFire('hit');
  await new Promise((r) => setTimeout(r, 10));
  gc.start(); // zurück ins Menü während der Kugel fliegt
  release();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(gc.state, 'menu');
  assert.deepEqual(counters(), { alive: 0, fires: 0 });
});

test('Pause blockiert Eingaben und Sequenzen', async () => {
  const { ctx } = makeCtx();
  const gc = new GameController(ctx);
  gc.debug.setTimeScale(0);
  gc.debug.quickStart('normal');
  await gc.debug.ready();
  gc._togglePause();
  assert.equal(gc.debug.paused, true);
  assert.equal(gc.debug.fire(0, 0) && gc.stats.shots, 0, 'kein Schuss während Pause');
  await new Promise((r) => setTimeout(r, 250));
  gc._togglePause();
  assert.equal(gc.debug.paused, false);
});

test('Platzierung: Geist, Platzieren, Aufnehmen, Drehen', () => {
  const { ctx } = makeCtx();
  const gc = new GameController(ctx);
  gc.start();
  gc._beginPlacement('normal');
  gc._onHover({ col: 8, row: 0 });
  assert.deepEqual(gc.ctx.boards.player.ghost.slice(0, 5), [5, 5, 0, 'h', true], 'Anker geklemmt');
  gc._onSelect({ col: 8, row: 0 });
  assert.equal(gc.logic.player.shipAt(5, 0), 0);
  gc._onSelect({ col: 5, row: 0 }); // aufnehmen
  assert.equal(gc.logic.player.shipAt(5, 0), -1);
  assert.equal(gc._pl.selected, 0);
  gc._onRotate();
  assert.equal(gc._pl.orientation, 'v');
  gc._onSelect({ col: 0, row: 0 });
  assert.equal(gc.logic.player.ships[0].orientation, 'v');
  gc._onSelect({ col: 1, row: 1 }); // berührt -> ungültig
  assert.equal(gc.logic.player.isPlaced(1), false);
  gc._plRandom();
  assert.equal(gc._plNextFree(), -1);
  gc._plClear();
  assert.equal(gc._plNextFree(), 0);
});

test('Input: Touch zielt erst, zweiter Tap feuert; Klick-Toleranz', async () => {
  const { ctx } = makeCtx();
  const gc = new GameController(ctx);
  const seen = { hover: [], select: [] };
  gc.input.onHover = (c) => seen.hover.push(c && `${c.col},${c.row}`);
  gc.input.onSelect = (c) => seen.select.push(`${c.col},${c.row}`);
  gc.input.setBoard(ctx.boards.player);
  // Bildschirmmitte trifft ca. Brettmitte (-12,0,0)
  const ev = (type, x, y, pointerType = 'touch') => Object.assign(new Event(type), { clientX: x, clientY: y, pointerId: 1, pointerType, button: 0 });
  const dom = ctx.engine.renderer.domElement;
  const tap = (x, y, t) => { dom.dispatchEvent(ev('pointerdown', x, y, t)); dom.dispatchEvent(ev('pointerup', x, y, t)); };
  tap(640, 400); assert.equal(seen.select.length, 0, 'erster Tap nur Zielen');
  assert.equal(seen.hover.length, 1);
  tap(640, 400); assert.equal(seen.select.length, 1, 'zweiter Tap feuert');
  dom.dispatchEvent(ev('pointerdown', 640, 400, 'mouse'));
  dom.dispatchEvent(ev('pointerup', 700, 460, 'mouse'));
  assert.equal(seen.select.length, 1, 'bewegt = kein Klick');
  tap(640, 400, 'mouse'); assert.equal(seen.select.length, 2);
  const n = seen.hover.length;
  dom.dispatchEvent(ev('pointermove', 640, 400, 'mouse')); dom.dispatchEvent(ev('pointermove', 641, 401, 'mouse'));
  assert.equal(seen.hover.length, n, 'Hover nur bei Zellwechsel');
  gc.input.dispose();
});

test('Gegner-Abstraktion: Controller kennt nur versenkte Gegnerschiffe', async () => {
  const { ctx } = makeCtx();
  const gc = new GameController(ctx);
  gc.debug.setTimeScale(0);
  gc.debug.quickStart('normal');
  await gc.debug.ready();
  assert.equal(gc.logic.enemy.ships.filter(Boolean).length, 0, 'Gegnerflotte verdeckt');
  assert.equal(gc.ships.enemy.filter(Boolean).length, 0, 'keine Gegnerschiffe in der Szene');
  const truth = gc.opponent.board;
  const target = truth.ships[4]; // Schaluppe (2 Felder)
  for (const c of target.cells) {
    await gc.debug.ready();
    assert.ok(gc.debug.fire(c.col, c.row));
  }
  await until(() => gc.logic.enemy.sunkCount() === 1);
  assert.deepEqual(gc.logic.enemy.ships[4].cells, target.cells);
  assert.equal(gc.ships.enemy.filter(Boolean).length, 1, 'versenktes Schiff erscheint');
  assert.equal(gc.logic.enemy.ships.filter(Boolean).length, 1);
});
