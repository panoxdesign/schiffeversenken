// Headless-Test des GameControllers mit Mocks (kein DOM/WebGL nötig).
import test from 'node:test';
import assert from 'node:assert/strict';

const { GameController, makeCtx, until } = await import('./support/headless.mjs');

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

test('Hot-Seat: Platzierung, Sichtschutz, Rückblick, Spielende', async () => {
  const { ctx, counters } = makeCtx();
  const gc = new GameController(ctx);
  gc.debug.setTimeScale(0);
  gc.rng = () => 0.9; // Münzwurf: Spieler 2 beginnt
  gc.start();
  ctx.ui.menu.onHotseat(['Rotbart', 'Rotbart']);
  assert.deepEqual(gc.debug.names, { player: 'Rotbart', enemy: 'Rotbart II' }, 'gleiche Namen unterscheidbar');
  assert.equal(gc.state, 'placement');

  // Spieler 1 platziert links, dann Sichtschutz für Spieler 2
  gc.debug.autoPlace();
  gc.debug.confirm();
  assert.equal(gc.state, 'handover');
  assert.equal(gc.debug.curtain, 'enemy');
  assert.ok(gc.ships.player.every((s) => s.v === false), 'Flotte 1 verdeckt');
  gc.debug.autoPlace();
  assert.equal(gc.logic.enemy.ships.filter(Boolean).length, 0, 'keine Platzierung hinter dem Sichtschutz');
  gc.debug.readyCurtain();
  await until(() => gc.state === 'placement');
  gc.debug.autoPlace();
  assert.equal(gc.logic.enemy.ships.filter(Boolean).length, 5, 'Spieler 2 platziert rechts');
  gc.debug.confirm();

  // Münzwurf -> Sichtschutz für die beginnende Seite
  assert.equal(await gc.debug.ready(), 'handover');
  assert.equal(gc.debug.curtain, 'enemy');
  assert.ok(gc.ships.enemy.every((s) => s.v === false) && gc.ships.player.every((s) => s.v === false));
  gc.debug.readyCurtain();
  await gc.debug.ready();
  assert.ok(ctx.ui.announced.includes('Rotbart II eröffnet das Feuer!'));
  assert.equal(gc.debug.turnSide, 'enemy');
  assert.ok(gc.ships.enemy.every((s) => s.v === true) && gc.ships.player.every((s) => s.v === false), 'nur eigene Flotte sichtbar');

  // Spieler 2: Treffer (kein Sichtschutz), dann daneben -> Sichtschutz für Spieler 1
  await gc.debug.autoFire('hit');
  assert.equal(await gc.debug.ready(), 'battle', 'nach Treffer erneut schießen');
  assert.equal(gc.debug.curtain, null);
  await gc.debug.autoFire('miss');
  await gc.debug.ready();
  assert.equal(gc.debug.curtain, 'player');
  gc.debug.readyCurtain();
  await gc.debug.ready();
  const rv = gc.debug.review;
  assert.equal(rv.side, 'player');
  assert.deepEqual(rv.shots.map((s) => s.result), ['hit', 'miss']);
  assert.match(rv.text, /^Rotbart II traf (deine|deinen) \S+ \([A-J]\d+\) und verfehlte bei [A-J]\d+$/);
  assert.ok(gc.ships.player.every((s) => s.v === true) && gc.ships.enemy.every((s) => s.v === false));

  // Spieler 1 gewinnt
  while (gc.state !== 'gameover') {
    await gc.debug.ready();
    if (gc.debug.curtain) gc.debug.readyCurtain();
    else await gc.debug.autoFire(gc.debug.turnSide === 'player' ? 'hit' : 'miss');
  }
  await until(() => typeof ctx.ui.gameOver === 'object');
  const go = ctx.ui.gameOver;
  assert.equal(go.winnerName, 'Rotbart');
  assert.deepEqual(go.players.map((p) => [p.name, p.winner]), [['Rotbart', true], ['Rotbart II', false]]);
  assert.equal(go.players[0].hits, 17);
  assert.equal(go.players[1].shots, gc.statsEnemy.shots);
  assert.ok(gc.ships.enemy.every((s) => s.v === true), 'beide Flotten aufgedeckt');

  go.onRestart();
  assert.equal(gc.state, 'placement');
  assert.equal(gc.debug.mode, 'hotseat');
  assert.deepEqual(gc.debug.names, { player: 'Rotbart', enemy: 'Rotbart II' });
  gc.start();
  assert.deepEqual(counters(), { alive: 0, fires: 0 });
});

test('Hot-Seat: Hauptmenü während des Sichtschutzes bricht sauber ab', async () => {
  const { ctx, counters } = makeCtx();
  const gc = new GameController(ctx);
  gc.debug.setTimeScale(0);
  gc.debug.beginHotseat();
  gc.debug.autoPlace();
  gc.debug.confirm();
  assert.equal(gc.debug.curtain, 'enemy');
  gc.start();
  assert.equal(gc.debug.curtain, null);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(gc.state, 'menu');
  assert.deepEqual(counters(), { alive: 0, fires: 0 });
});
