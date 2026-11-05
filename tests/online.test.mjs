// Online-Ablauf Ende-zu-Ende in einem Prozess: zwei echte GameController mit Netz-Gegner
// über In-Memory-Transport gegen einen echten Server-Kern (Uhr und Zufall injiziert).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../server/GameServer.js';
import { fakeClock, mulberry32 } from './support/fakeClock.mjs';
import { memoryNet } from './support/memoryTransport.mjs';
import { TIMES } from '../shared/rules.js';

const { GameController, makeCtx, until } = await import('./support/headless.mjs');

/** Letzte Argumente eines UI-Aufrufs (oder undefined). */
const shown = (p, method) => p.ui.last && p.ui.last[method];

function harbor(seed = 7) {
  const clock = fakeClock();
  const core = createGameServer({ clock, rng: mulberry32(seed) });
  /** Ein Spieler: Controller mit Mock-Szene, Name und Netz zum Kern. */
  function pirate(name, { ownClock } = {}) {
    const m = makeCtx();
    const net = memoryNet(core);
    m.ctx.net = net;
    m.ctx.clock = ownClock || clock; // Online-Fristen laufen auf derselben vorspulbaren Uhr wie der Server
    m.ctx.ui.playerName = name;
    const gc = new GameController(m.ctx);
    gc.debug.setTimeScale(0);
    gc.start();
    return { ...m, gc, net, ui: m.ctx.ui };
  }
  return { clock, core, pirate };
}

/** Gastgeber lädt ein, Gast gibt den Code ein. */
async function invited(h, a = 'Rotbart', b = 'Einaugen-Jule', guestOpts) {
  const host = h.pirate(a), guest = h.pirate(b, guestOpts);
  host.ui.menu.onInvite();
  await until(() => shown(host, 'showLobby')?.code);
  const { code } = shown(host, 'showLobby');
  guest.ui.menu.onJoin(code.toLowerCase());
  await until(() => host.gc.state === 'placement' && guest.gc.state === 'placement');
  return { host, guest, code };
}

test('Online: Einladen per Code -> beide platzieren', async () => {
  const h = harbor();
  const { host, guest, code } = await invited(h);
  assert.match(code, /^[A-Z2-9]{4}$/);
  assert.match(shown(host, 'showLobby').link, new RegExp(`[?&]join=${code}$`));
  assert.equal(host.gc.debug.mode, 'online');
  assert.deepEqual(host.gc.debug.names, { player: 'Rotbart', enemy: 'Einaugen-Jule' });
  assert.deepEqual(guest.gc.debug.names, { player: 'Einaugen-Jule', enemy: 'Rotbart' });
});

/** Beide platzieren zufällig und bestätigen. */
async function toBattle(host, guest) {
  for (const p of [host, guest]) { p.gc.debug.autoPlace(); p.gc.debug.confirm(); }
  await until(() => host.gc.debug.status().pending || guest.gc.debug.status().pending);
}

/** me schießt auf eine noch unbeschossene Zelle: mode 'hit' trifft ein Schiff von foe, 'miss' Wasser. */
function fireOnce(me, foe, mode) {
  const known = me.gc.logic.enemy, truth = foe.gc.logic.player;
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    if (!known.wasShot(c, r) && (truth.shipAt(c, r) >= 0) === (mode === 'hit')) return me.gc.debug.fire(c, r);
  }
  return false;
}

/** Wer am Zug ist, schießt (aim: Modus je Spieler), bis beide im Game Over sind. */
async function play(a, b, aim = { a: 'hit', b: 'miss' }) {
  const shooters = [[a, b, aim.a], [b, a, aim.b]];
  for (let i = 0; i < 2000; i++) {
    if (a.gc.state === 'gameover' && b.gc.state === 'gameover') return;
    const turn = shooters.find(([p]) => p.gc.debug.status().pending);
    if (turn) fireOnce(...turn);
    await new Promise((r) => setTimeout(r, turn ? 1 : 2));
  }
  assert.fail('Partie endet nicht');
}

test('Online: komplette Partie bis Game Over, Gegnerflotte bleibt verdeckt', async () => {
  const h = harbor();
  const { host, guest } = await invited(h);
  await toBattle(host, guest);
  assert.equal(host.gc.ships.enemy.filter(Boolean).length, 0, 'keine Gegnerschiffe in der Szene');
  await play(host, guest);
  await until(() => shown(host, 'showGameOver') && shown(guest, 'showGameOver'));
  assert.equal(host.ui.gameOver.won, true);
  assert.equal(guest.ui.gameOver.won, false);
  assert.deepEqual(host.ui.gameOver.players.map((p) => [p.name, p.winner, p.hits]), [['Rotbart', true, 17], ['Einaugen-Jule', false, 0]]);
  assert.deepEqual(guest.ui.gameOver.players.map((p) => [p.name, p.winner]), [['Einaugen-Jule', false], ['Rotbart', true]]);
  assert.equal(guest.gc.logic.enemy.ships.filter(Boolean).length, 0, 'Gast kennt keine Schiffe des Gastgebers');
  assert.equal(host.gc.logic.enemy.sunkCount(), 5);
  assert.ok(guest.ui.announced.some((t) => /^Rotbart hat (deine|deinen) \S+ versenkt!$/.test(t)), 'Banner mit Gegnername');
  assert.equal(host.ui.gameOver.onRestart, null, 'Revanche kommt mit Etappe 6');

  host.ui.gameOver.onMenu();
  guest.ui.gameOver.onMenu();
  assert.deepEqual(host.counters(), { alive: 0, fires: 0 });
  await until(() => h.core.playerCount() === 0);
  assert.equal(h.core.rooms.size, 0, 'Raum geschlossen');
});

test('Online: Beitritt per Link überspringt das Menü', async () => {
  const h = harbor();
  const host = h.pirate('Klaus');
  host.ui.menu.onInvite();
  await until(() => shown(host, 'showLobby')?.code);
  const guest = h.pirate('Jule'); // start() ohne join hat schon das Menü gezeigt
  guest.gc.start({ join: shown(host, 'showLobby').code });
  await until(() => shown(guest, 'showLobby')?.title?.startsWith('Du trittst'));
  assert.equal(shown(guest, 'showLobby').title, "Du trittst Klaus' Runde bei …");
  await until(() => guest.gc.state === 'placement');
  assert.equal(host.gc.state, 'placement');
  assert.ok(host.ui.announced.includes('Jule ist an Bord!'));
});

test('Online: unbekannter, ungültiger oder voller Code gibt eine klare Meldung', async () => {
  const h = harbor();
  const p = h.pirate('Bert');
  p.ui.menu.onJoin('ab0');
  assert.equal(shown(p, 'showLobby').title, 'Ungültiger Code');
  assert.equal(p.net.opened.length, 0, 'ohne Verbindung geprüft');
  assert.equal(p.gc.state, 'menu');

  p.ui.menu.onJoin('ZZZZ');
  await until(() => shown(p, 'showLobby')?.phase === 'notice');
  assert.equal(shown(p, 'showLobby').title, 'Unbekannter Code');
  assert.equal(p.gc.state, 'menu');

  const { code } = await invited(h);
  p.ui.menu.onJoin(code);
  await until(() => shown(p, 'showLobby')?.title === 'Die Runde ist voll');
  assert.equal(p.gc.state, 'menu');
});

test('Online: Gastgeber bricht das Warten ab -> Raum geschlossen', async () => {
  const h = harbor();
  const host = h.pirate('Rotbart');
  host.ui.menu.onInvite();
  await until(() => shown(host, 'showLobby')?.code);
  const { code, onCancel } = shown(host, 'showLobby');
  onCancel();
  assert.equal(host.gc.state, 'menu');
  await until(() => h.core.rooms.size === 0);
  const guest = h.pirate('Jule');
  guest.ui.menu.onJoin(code);
  await until(() => shown(guest, 'showLobby')?.phase === 'notice');
  assert.equal(shown(guest, 'showLobby').title, 'Einladung verfallen');
});

test('Online: Gegner verlässt die Partie im Kampf -> Sieg mit Grund', async () => {
  for (const [how, title] of [['menu', 'Einaugen-Jule hat die Flagge gestrichen – Sieg!'], ['drop', 'Der Feind ist geflohen – Sieg!']]) {
    const h = harbor();
    const { host, guest } = await invited(h);
    await toBattle(host, guest);
    if (how === 'menu') guest.gc.start();
    else { guest.net.opened[0].close(); setTimeout(() => h.clock.advance(60_000), 5); } // Verbindung weg, ohne „leave“; Schonfrist läuft ab
    await until(() => shown(host, 'showGameOver'));
    assert.equal(host.gc.state, 'gameover');
    assert.equal(host.ui.gameOver.won, true);
    assert.equal(host.ui.gameOver.title, title);
    assert.equal(host.gc.debug.status().pending, false);
  }
});

test('Online: Gegner legt während der Platzierung ab -> zurück ins Menü', async () => {
  const h = harbor();
  const { host, guest } = await invited(h);
  host.gc.debug.autoPlace(); host.gc.debug.confirm(); // wartet auf den Gegner
  guest.gc.start();
  await until(() => host.gc.state === 'menu');
  assert.equal(shown(host, 'showLobby').title, 'Einaugen-Jule hat abgelegt');
});

/** Uhr in Schritten vorspulen, bis cond erfüllt ist (Wiederverbindungsversuche laufen asynchron). */
async function advanceUntil(h, cond, step = 1000, max = 120) {
  for (let i = 0; i < max && !cond(); i++) { h.clock.advance(step); await new Promise((r) => setTimeout(r, 3)); }
}

test('Online: Hafen neu gestartet -> Partie unbekannt, klare Meldung', async () => {
  const h = harbor();
  const { host, guest } = await invited(h);
  await toBattle(host, guest);
  host.net.core = createGameServer({ clock: h.clock, rng: mulberry32(99) }); // frischer Server ohne Partien
  host.net.opened[0].kill();
  await until(() => shown(host, 'setConnection')?.text);
  assert.equal(shown(host, 'setConnection').text, 'Verbindung zum Hafen verloren – neuer Versuch …');
  await advanceUntil(h, () => host.gc.state === 'menu');
  assert.equal(shown(host, 'showLobby').title, 'Verbindung zum Hafen verloren');
  assert.match(shown(host, 'showLobby').text, /neu gestartet/);
  assert.deepEqual(host.counters(), { alive: 0, fires: 0 });
  assert.equal(host.net.session.value, null, 'Sitzung vergessen');
});

test('Online: Hafen bleibt unerreichbar -> nach der Schonfrist Meldung', async () => {
  const h = harbor();
  const { host, guest } = await invited(h);
  await toBattle(host, guest);
  let tries = 0;
  host.net.connect = async () => { tries++; throw Object.assign(new Error('weg'), { code: 'connection' }); };
  host.net.opened[0].kill();
  await advanceUntil(h, () => host.gc.state === 'menu');
  assert.equal(shown(host, 'showLobby').title, 'Verbindung zum Hafen verloren');
  assert.ok(tries >= 5 && tries <= 10, `Versuche mit wachsendem Abstand (${tries})`);
});

/** Ein paar Schüsse beider Seiten, damit Marker, Treffer und ein versenktes Schiff vorliegen. */
async function skirmish(host, guest) {
  for (let i = 0; i < 400; i++) {
    if (host.gc.logic.enemy.sunkCount() >= 1 && guest.gc.logic.enemy.shots.some(Boolean) && host.gc.debug.status().pending) return;
    const turn = [[host, guest, i % 7 === 6 ? 'miss' : 'hit'], [guest, host, i % 3 ? 'hit' : 'miss']].find(([p]) => p.gc.debug.status().pending);
    if (turn) fireOnce(...turn);
    await new Promise((r) => setTimeout(r, 1));
  }
  assert.fail('kein Zwischenstand erreicht');
}

const snapshot = (p) => ({
  enemyShots: p.gc.logic.enemy.shots.join(''), ownShots: p.gc.logic.player.shots.join(''),
  sunk: p.gc.logic.enemy.sunkCount(), markers: { ...p.ctx.boards.enemy.markers }, ownMarkers: { ...p.ctx.boards.player.markers },
  stats: [p.gc.stats.shots, p.gc.stats.hits, p.gc.statsEnemy.shots, p.gc.statsEnemy.hits],
});

test('Online: kurzer Verbindungsabbruch -> automatisch zurück, Stand ohne neue Animationen', async () => {
  const h = harbor();
  const { host, guest } = await invited(h);
  await toBattle(host, guest);
  await skirmish(host, guest);
  const before = snapshot(host);
  const shots = host.counters();
  host.net.opened[0].kill();
  await until(() => shown(guest, 'setConnection'));
  assert.match(shown(guest, 'setConnection').text, /hat die Verbindung verloren$/);
  await advanceUntil(h, () => host.net.opened.length === 2 && host.gc.debug.status().pending);
  assert.deepEqual(snapshot(host), before, 'Bretter, Marker und Statistik wie vor dem Abbruch');
  assert.equal(host.counters().alive, 5, 'nur die eigene Flotte – versenkte Gegnerschiffe liegen schon am Grund');
  assert.ok(shots.alive > 5, 'vorher waren versenkte Gegnerschiffe noch in der Szene');
  assert.equal(host.counters().fires, shots.fires, 'Feuer wieder an denselben Stellen');
  assert.equal(host.ui.last.setConnection, null);
  assert.ok(guest.ui.announced.includes('Rotbart ist zurück an Bord!'));
  await play(host, guest);
  await until(() => shown(host, 'showGameOver') && shown(guest, 'showGameOver'));
  assert.equal(host.ui.gameOver.won, true);
});

test('Online: Neuladen im selben Tab -> zurück in die Partie', async () => {
  const h = harbor();
  const { host, guest } = await invited(h);
  await toBattle(host, guest);
  await skirmish(host, guest);
  const before = snapshot(host);
  const token = host.net.session.value;
  assert.ok(token, 'Token im Tab-Speicher');
  host.net.opened[0].kill(); // Seite wird verlassen
  host.gc._token++; // alter Controller ist mit der Seite weg

  const again = h.pirate('Rotbart');
  again.net.session.save(token);
  again.gc.start({ resume: token });
  await until(() => again.gc.state === 'battle' && again.gc.debug.status().pending);
  const after = snapshot(again);
  assert.deepEqual([after.enemyShots, after.ownShots, after.sunk, after.stats], [before.enemyShots, before.ownShots, before.sunk, before.stats]);
  assert.deepEqual(after.markers, before.markers);
  assert.deepEqual(again.gc.debug.names, { player: 'Rotbart', enemy: 'Einaugen-Jule' });
  await play(again, guest);
  await until(() => shown(again, 'showGameOver'));
  assert.equal(again.net.session.value, null, 'nach Spielende vergessen');
});

test('Online: Neuladen nach Ablauf der Partie -> Meldung statt Hänger', async () => {
  const h = harbor();
  const p = h.pirate('Rotbart');
  p.net.session.save('gibtsnicht');
  p.gc.start({ resume: 'gibtsnicht' });
  await until(() => shown(p, 'showLobby')?.phase === 'notice');
  assert.equal(shown(p, 'showLobby').title, 'Verbindung zum Hafen verloren');
  assert.equal(p.net.session.value, null);
});

test('Online: Abbruch während der Platzierung -> gesetzte Schiffe bleiben', async () => {
  const h = harbor();
  const { host, guest } = await invited(h);
  host.gc._plClick({ col: 0, row: 0 });
  h.clock.advance(20_000);
  host.net.opened[0].kill();
  await advanceUntil(h, () => host.net.opened.length === 2 && shown(host, 'setConnection') === null);
  assert.equal(host.gc.state, 'placement');
  assert.deepEqual([host.gc.logic.player.ships[0].col, host.gc.logic.player.ships[0].row], [0, 0]);
  assert.deepEqual(shown(host, 'setTimer'), { ms: TIMES.placementMs - 20_000, warn: true }, 'Restzeit wie vor dem Abbruch');
  for (const p of [host, guest]) { p.gc.debug.autoPlace(); p.gc.debug.confirm(); }
  await until(() => host.gc.debug.status().pending || guest.gc.debug.status().pending);
});

test('Online: Pause hält die Partie nicht an', async () => {
  const h = harbor();
  const { host, guest } = await invited(h);
  await toBattle(host, guest);
  const [me, foe] = host.gc.debug.status().pending ? [host, guest] : [guest, host];
  foe.gc._togglePause();
  assert.equal(foe.gc.debug.paused, false, 'Abläufe laufen weiter');
  assert.equal(shown(foe, 'showPause').online, true);
  const shots = foe.gc.statsEnemy.shots;
  assert.ok(fireOnce(me, foe, 'miss'));
  await until(() => foe.gc.statsEnemy.shots === shots + 1);
  assert.equal(foe.gc.statsEnemy.shots, shots + 1, 'Gegnerschuss trotz Pausenmenü inszeniert');
});

test('Online: Gastgeber legt ab, während der Gast noch beitritt -> klare Meldung', async () => {
  const h = harbor();
  const host = h.pirate('Rotbart');
  host.ui.menu.onInvite();
  await until(() => shown(host, 'showLobby')?.code);
  const guest = h.pirate('Jule');
  guest.gc.debug.setTimeScale(0.5); // „Du trittst … bei“ bleibt kurz stehen
  guest.ui.menu.onJoin(shown(host, 'showLobby').code);
  await until(() => shown(guest, 'showLobby')?.title?.startsWith('Du trittst'));
  host.gc.start();
  await until(() => shown(guest, 'showLobby')?.title === 'Rotbart hat abgelegt');
  assert.equal(shown(guest, 'showLobby').title, 'Rotbart hat abgelegt');
  assert.equal(guest.gc.state, 'menu');
});

test('Hauptmenü weckt den Hafen und zeigt seinen Zustand', async () => {
  const m = makeCtx();
  let pings = 0;
  m.ctx.net = { connect: async () => { throw new Error('nicht gebraucht'); }, health: async () => { pings++; return { ok: true, players: 0 }; } };
  const gc = new GameController(m.ctx);
  gc.start();
  await until(() => m.ctx.ui.last?.setHarbor === 'ready');
  assert.equal(m.ctx.ui.last.setHarbor, 'ready');
  assert.equal(pings, 1);
  gc.start(); // gleich wieder im Menü: noch frisch, kein neuer Ping
  assert.equal(pings, 1);
  assert.equal(m.ctx.ui.last.setHarbor, 'ready', 'Menü bekommt den bekannten Zustand');
});

/** Wer gerade zielen darf (oder null). */
const aiming = (a, b) => [a, b].find((p) => p.gc.debug.status().pending) || null;

test('Online: Zugzeit läuft ab -> Zufallsschuss bei beiden inszeniert, Sanduhr im HUD', async () => {
  const h = harbor();
  const { host, guest } = await invited(h);
  await toBattle(host, guest);
  const me = aiming(host, guest), foe = me === host ? guest : host;
  assert.deepEqual(shown(me, 'setTimer'), { ms: TIMES.turnMs, warn: true, frozen: false }, 'eigene Sanduhr warnt');
  assert.equal(shown(foe, 'setTimer').warn, false, 'Sanduhr des Gegners ohne Warnung');
  h.clock.advance(TIMES.turnMs + TIMES.animMs);
  await until(() => me.gc.stats.shots === 1 && foe.gc.statsEnemy.shots === 1);
  assert.equal(me.gc.stats.shots, 1, 'Zufallsschuss zählt für mich');
  assert.ok(me.ui.announced.includes('Zeit um – ein Zufallsschuss!'));
  assert.ok(foe.ui.announced.some((t) => / zögert – ein Zufallsschuss!$/.test(t)));
  assert.equal(me.gc.logic.enemy.shots.filter(Boolean).length, 1, 'Ergebnis im Wissens-Brett');
});

test('Online: drei verpasste Züge -> Niederlage durch Zeit', async () => {
  const h = harbor();
  const { host, guest } = await invited(h);
  await toBattle(host, guest);
  const lazy = aiming(host, guest), busy = lazy === host ? guest : host;
  for (let i = 0; i < 200 && lazy.gc.state !== 'gameover'; i++) {
    if (busy.gc.debug.status().pending) fireOnce(busy, lazy, 'miss');
    else if (lazy.gc.debug.status().pending) h.clock.advance(TIMES.turnMs + TIMES.sunkAnimMs);
    await new Promise((r) => setTimeout(r, 2));
  }
  await until(() => shown(lazy, 'showGameOver') && shown(busy, 'showGameOver'));
  assert.equal(lazy.ui.gameOver.title, 'Eingeschlafen!');
  assert.equal(busy.ui.gameOver.title, `${lazy.gc.debug.names.player} ist eingeschlafen – Sieg!`);
  assert.equal(busy.ui.gameOver.won, true);
});

test('Online: Platzierungszeit um -> gesetzte Schiffe bleiben, der Rest wird ergänzt', async () => {
  const h = harbor();
  const { host, guest } = await invited(h);
  host.gc._plClick({ col: 0, row: 0 }); // Galeone waagerecht oben links
  const galeone = { ...host.gc.logic.player.ships[0] };
  assert.equal(galeone.col, 0);
  assert.deepEqual(shown(host, 'setTimer'), { ms: TIMES.placementMs, warn: true });
  guest.gc.debug.autoPlace(); guest.gc.debug.confirm();
  h.clock.advance(TIMES.placementMs);
  await until(() => host.gc.debug.status().pending || guest.gc.debug.status().pending);
  assert.equal(host.gc.state, 'battle');
  assert.deepEqual([host.gc.logic.player.ships[0].col, host.gc.logic.player.ships[0].row, host.gc.logic.player.ships[0].orientation], [0, 0, galeone.orientation]);
  assert.equal(host.gc.logic.player.ships.filter(Boolean).length, 5);
});

test('Online: Server ergänzt die Flotte eines säumigen Clients -> Client übernimmt sie', async () => {
  const h = harbor();
  const sleepy = fakeClock(); // Tab im Hintergrund: die eigene Frist des Gasts läuft nie ab
  const { host, guest } = await invited(h, 'Rotbart', 'Einaugen-Jule', { ownClock: sleepy });
  guest.gc._plClick({ col: 0, row: 0 }); // nur die Galeone gesetzt
  host.gc.debug.autoPlace(); host.gc.debug.confirm();
  h.clock.advance(TIMES.placementMs + TIMES.placementSlackMs);
  await until(() => guest.gc.state === 'battle' && (host.gc.debug.status().pending || guest.gc.debug.status().pending));
  assert.ok(!guest.ui.announced.includes('Die Zeit ist um – der Rest der Flotte läuft aus!'), 'Gast hat nicht selbst ergänzt');
  const server = [...h.core.rooms.values()][0].seats[1].board;
  for (let i = 0; i < 5; i++) {
    const a = guest.gc.logic.player.ships[i], b = server.ships[i];
    assert.deepEqual([a.col, a.row, a.orientation], [b.col, b.row, b.orientation], `Schiff ${i} wie auf dem Server`);
  }
  assert.ok(guest.ui.announced.includes('Der Hafenmeister hat deine Flotte aufgestellt'));
});

test('Online: Gegner getrennt -> Hinweis mit Schonfrist, Sanduhr steht, kein Zielen', async () => {
  const h = harbor();
  const { host, guest } = await invited(h);
  await toBattle(host, guest);
  const me = aiming(host, guest), foe = me === host ? guest : host;
  foe.net.opened[0].close();
  await until(() => shown(me, 'setConnection'));
  assert.deepEqual(shown(me, 'setConnection'), { text: `${foe.gc.debug.names.player} hat die Verbindung verloren`, ms: TIMES.graceMs });
  assert.equal(shown(me, 'setTimer').frozen, true);
  assert.equal(me.gc.debug.status().pending, false, 'eingefroren: kein Schuss möglich');
  h.clock.advance(TIMES.graceMs);
  await until(() => shown(me, 'showGameOver'));
  assert.equal(me.ui.gameOver.title, 'Der Feind ist geflohen – Sieg!');
  assert.equal(me.ui.last.setConnection, null, 'Hinweis weg');
});

test('Online: Aufgeben im Pausenmenü', async () => {
  const h = harbor();
  const { host, guest } = await invited(h);
  await toBattle(host, guest);
  host.gc._togglePause();
  assert.equal(typeof shown(host, 'showPause').onResign, 'function');
  shown(host, 'showPause').onResign();
  await until(() => shown(host, 'showGameOver') && shown(guest, 'showGameOver'));
  assert.equal(host.ui.gameOver.won, false);
  assert.equal(host.ui.gameOver.title, 'Flagge gestrichen');
  assert.equal(guest.ui.gameOver.title, 'Rotbart hat die Flagge gestrichen – Sieg!');
});
