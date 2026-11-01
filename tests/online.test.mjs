// Online-Ablauf Ende-zu-Ende in einem Prozess: zwei echte GameController mit Netz-Gegner
// über In-Memory-Transport gegen einen echten Server-Kern (Uhr und Zufall injiziert).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../server/GameServer.js';
import { fakeClock, mulberry32 } from './support/fakeClock.mjs';
import { memoryNet } from './support/memoryTransport.mjs';

const { GameController, makeCtx, until } = await import('./support/headless.mjs');

/** Letzte Argumente eines UI-Aufrufs (oder undefined). */
const shown = (p, method) => p.ui.last && p.ui.last[method];

function harbor(seed = 7) {
  const clock = fakeClock();
  const core = createGameServer({ clock, rng: mulberry32(seed) });
  /** Ein Spieler: Controller mit Mock-Szene, Name und Netz zum Kern. */
  function pirate(name) {
    const m = makeCtx();
    const net = memoryNet(core);
    m.ctx.net = net;
    m.ctx.ui.playerName = name;
    const gc = new GameController(m.ctx);
    gc.debug.setTimeScale(0);
    gc.start();
    return { ...m, gc, net, ui: m.ctx.ui };
  }
  return { clock, core, pirate };
}

/** Gastgeber lädt ein, Gast gibt den Code ein. */
async function invited(h, a = 'Rotbart', b = 'Einaugen-Jule') {
  const host = h.pirate(a), guest = h.pirate(b);
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
    else guest.net.opened[0].close(); // Verbindung weg, ohne „leave“
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

test('Online: Hafen verschwindet -> Meldung und Menü', async () => {
  const h = harbor();
  const { host, guest } = await invited(h);
  await toBattle(host, guest);
  host.net.opened[0].kill();
  await until(() => host.gc.state === 'menu');
  assert.equal(shown(host, 'showLobby').title, 'Verbindung zum Hafen verloren');
  assert.deepEqual(host.counters(), { alive: 0, fires: 0 });
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
