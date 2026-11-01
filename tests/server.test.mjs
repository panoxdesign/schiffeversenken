// Protokoll-Tests des Server-Kerns: simulierte Clients sprechen per Nachrichten mit dem Kern.
// Uhr und Zufall sind injiziert, Timer werden vorgespult. Kein Netzwerk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../server/GameServer.js';
import { PROTOCOL_VERSION, CODE_ALPHABET, MAX_MESSAGE_BYTES } from '../shared/protocol.js';
import { FLEET } from '../shared/rules.js';
import { fakeClock, mulberry32 } from './support/fakeClock.mjs';

const MIN = 60_000;

// Feste Flotte: Schiff i liegt waagerecht in Zeile 2*i ab Spalte 0 (berührungsfrei).
const FLEET_A = FLEET.map((f, index) => ({ index, col: 0, row: index * 2, orientation: 'h' }));
const CELLS_A = FLEET.flatMap((f, index) => Array.from({ length: f.length }, (_, c) => ({ col: c, row: index * 2 })));

function setup({ seed = 1, limits } = {}) {
  const clock = fakeClock();
  const server = createGameServer({ clock, rng: mulberry32(seed), limits });

  function client() {
    const inbox = [];
    const all = [];
    let closed = false;
    const conn = server.connect({
      send: (msg) => { const copy = JSON.parse(JSON.stringify(msg)); inbox.push(copy); all.push(copy); },
      close: () => { closed = true; },
    });
    return {
      inbox, all,
      get closed() { return closed; },
      send: (msg) => conn.receive(typeof msg === 'string' ? msg : JSON.stringify(msg)),
      disconnect: () => conn.disconnect(),
      /** Erste Nachricht des Typs entnehmen (muss vorhanden sein). */
      take(type) {
        const i = inbox.findIndex((m) => m.type === type);
        assert.ok(i >= 0, `erwartet „${type}“, im Postfach: [${inbox.map((m) => m.type).join(', ')}]`);
        return inbox.splice(i, 1)[0];
      },
      none(type) { assert.ok(!inbox.some((m) => m.type === type), `unerwartet „${type}“`); },
      clear() { inbox.length = 0; },
    };
  }

  function hello(name = 'Anna') {
    const c = client();
    c.send({ type: 'hello', version: PROTOCOL_VERSION, name });
    c.welcome = c.take('welcome');
    return c;
  }

  /** Gastgeber + Gast im selben Raum (Platzierung). */
  function pair(a = 'Anna', b = 'Bert') {
    const host = hello(a);
    const guest = hello(b);
    host.send({ type: 'createRoom' });
    const { code } = host.take('roomCreated');
    guest.send({ type: 'joinRoom', code });
    host.matched = host.take('matched');
    guest.matched = guest.take('matched');
    return { host, guest, code };
  }

  /** Beide platzieren FLEET_A; liefert die Clients nach Seat und wer beginnt. */
  function battle(a, b) {
    const { host, guest, code } = pair(a, b);
    host.send({ type: 'placeFleet', ships: FLEET_A });
    guest.send({ type: 'placeFleet', ships: FLEET_A });
    const { first } = host.take('start');
    assert.equal(guest.take('start').first, first);
    host.take('turn'); guest.take('turn');
    const bySeat = [host, guest];
    return { host, guest, code, first, bySeat, shooter: bySeat[first], target: bySeat[1 - first] };
  }

  return { clock, server, client, hello, pair, battle };
}

// --- Verbindung & Begrüßung

test('hello -> welcome mit Token, Name und Spielerzahl', () => {
  const t = setup();
  const a = t.hello('  Rotbart\u0007 ');
  assert.equal(a.welcome.name, 'Rotbart');
  assert.match(a.welcome.token, /^[A-Za-z0-9]{24}$/);
  assert.equal(a.welcome.players, 1);
  const b = t.hello('Bert');
  assert.equal(b.welcome.players, 2);
  assert.notEqual(a.welcome.token, b.welcome.token);
  assert.equal(t.server.playerCount(), 2);
  b.disconnect();
  assert.equal(t.server.playerCount(), 1);
});

test('leerer Name -> generierter Piratenname', () => {
  const t = setup();
  const a = t.hello('   ');
  assert.ok(a.welcome.name.length > 0 && a.welcome.name.length <= 16);
});

test('falsche Protokollversion -> error version und Trennung', () => {
  const t = setup();
  const c = t.client();
  c.send({ type: 'hello', version: PROTOCOL_VERSION + 1, name: 'Alt' });
  assert.equal(c.take('error').code, 'version');
  assert.ok(c.closed);
  assert.equal(t.server.playerCount(), 0);
});

test('vor hello ist nichts erlaubt, hello nur einmal', () => {
  const t = setup();
  const c = t.client();
  c.send({ type: 'createRoom' });
  assert.equal(c.take('error').code, 'invalid');
  c.send({ type: 'hello', version: PROTOCOL_VERSION });
  c.take('welcome');
  c.send({ type: 'hello', version: PROTOCOL_VERSION });
  assert.equal(c.take('error').code, 'invalid');
});

test('Server voll -> error full und Trennung', () => {
  const t = setup({ limits: { maxConnections: 2 } });
  t.hello(); t.hello();
  const c = t.client();
  assert.equal(c.take('error').code, 'full');
  assert.ok(c.closed);
});

// --- Lobby

test('Raum erstellen und per Code beitreten (Groß-/Kleinschreibung egal)', () => {
  const t = setup();
  const host = t.hello('Anna');
  const guest = t.hello('Bert');
  host.send({ type: 'createRoom' });
  const { code } = host.take('roomCreated');
  assert.equal(code.length, 4);
  for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch));
  guest.send({ type: 'joinRoom', code: ` ${code.toLowerCase()} ` });
  assert.deepEqual(host.take('matched'), { type: 'matched', seat: 0, name: 'Anna', opponent: 'Bert' });
  assert.deepEqual(guest.take('matched'), { type: 'matched', seat: 1, name: 'Bert', opponent: 'Anna' });
});

test('gleiche Namen: der Gast erhält „II“', () => {
  const t = setup();
  const { host, guest } = t.pair('Rotbart', 'Rotbart');
  assert.equal(host.matched.opponent, 'Rotbart II');
  assert.equal(guest.matched.name, 'Rotbart II');
});

test('Codes sind eindeutig', () => {
  const t = setup({ seed: 5 });
  const codes = new Set();
  for (let i = 0; i < 200; i++) {
    const h = t.hello();
    h.send({ type: 'createRoom' });
    codes.add(h.take('roomCreated').code);
  }
  assert.equal(codes.size, 200);
});

test('Beitritt: unbekannt, voll, eigener Raum, ungültiges Format', () => {
  const t = setup();
  const { code, host } = t.pair();
  const third = t.hello('Cleo');
  third.send({ type: 'joinRoom', code });
  assert.equal(third.take('error').code, 'roomFull');
  third.send({ type: 'joinRoom', code: code === 'ZZZZ' ? 'YYYY' : 'ZZZZ' });
  assert.equal(third.take('error').code, 'roomNotFound');
  third.send({ type: 'joinRoom', code: 'K0QX' });
  assert.equal(third.take('error').code, 'roomNotFound');
  third.send({ type: 'joinRoom', code: 42 });
  assert.equal(third.take('error').code, 'invalid');

  const solo = t.hello('Dora');
  solo.send({ type: 'createRoom' });
  const own = solo.take('roomCreated').code;
  solo.send({ type: 'joinRoom', code: own });
  assert.equal(solo.take('error').code, 'invalid');
  host.none('error');
});

test('Raum verfällt nach 10 Minuten ohne Beitritt', () => {
  const t = setup();
  const host = t.hello('Anna');
  host.send({ type: 'createRoom' });
  const { code } = host.take('roomCreated');
  t.clock.advance(10 * MIN - 1);
  host.none('error');
  t.clock.advance(1);
  assert.equal(host.take('error').code, 'roomExpired');
  const guest = t.hello('Bert');
  guest.send({ type: 'joinRoom', code });
  assert.equal(guest.take('error').code, 'roomExpired');
  assert.equal(t.clock.pending(), 0, 'keine Timer übrig');
});

test('Abbruch durch den Gastgeber macht den Code ungültig', () => {
  const t = setup();
  const host = t.hello('Anna');
  host.send({ type: 'createRoom' });
  const { code } = host.take('roomCreated');
  host.send({ type: 'leave' });
  const guest = t.hello('Bert');
  guest.send({ type: 'joinRoom', code });
  assert.equal(guest.take('error').code, 'roomExpired');
  assert.equal(t.clock.pending(), 0);
});

test('neuer Raum ersetzt den wartenden eigenen Raum', () => {
  const t = setup();
  const host = t.hello('Anna');
  host.send({ type: 'createRoom' });
  const first = host.take('roomCreated').code;
  host.send({ type: 'createRoom' });
  const second = host.take('roomCreated').code;
  const guest = t.hello('Bert');
  guest.send({ type: 'joinRoom', code: first });
  assert.equal(guest.take('error').code, 'roomExpired');
  guest.send({ type: 'joinRoom', code: second });
  guest.take('matched');
});

test('Code-Raten: höchstens 5 falsche Codes pro Minute', () => {
  const t = setup();
  const host = t.hello('Anna');
  host.send({ type: 'createRoom' });
  const { code } = host.take('roomCreated');
  const g = t.hello('Gauner');
  const wrong = ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE', 'FFFF'].filter((c) => c !== code).slice(0, 5);
  for (const c of wrong) { g.send({ type: 'joinRoom', code: c }); assert.equal(g.take('error').code, 'roomNotFound'); }
  g.send({ type: 'joinRoom', code });
  assert.equal(g.take('error').code, 'rateLimit', 'auch der richtige Code wird gesperrt');
  t.clock.advance(MIN);
  g.send({ type: 'joinRoom', code });
  g.take('matched');
});

// --- Platzierung

test('Platzierung: ungültige Flotten werden abgelehnt', () => {
  const t = setup();
  const { host } = t.pair();
  const bad = [
    FLEET_A.slice(0, 4), // Schiff fehlt
    FLEET_A.map((s, i) => (i === 1 ? { ...s, row: 1 } : s)), // berührt Schiff 0
    FLEET_A.map((s, i) => (i === 0 ? { ...s, col: 6 } : s)), // ragt über den Rand
    FLEET_A.map((s, i) => (i === 4 ? { ...s, index: 3 } : s)), // Index doppelt
    FLEET_A.map((s, i) => (i === 2 ? { ...s, orientation: 'x' } : s)),
    'Galeone',
  ];
  for (const ships of bad) {
    host.send({ type: 'placeFleet', ships });
    assert.equal(host.take('error').code, 'invalid', JSON.stringify(ships));
  }
  host.send({ type: 'placeFleet', ships: FLEET_A });
  host.none('error');
  host.send({ type: 'placeFleet', ships: FLEET_A });
  assert.equal(host.take('error').code, 'invalid', 'nur einmal');
});

test('Start erst, wenn beide platziert haben; der Server lost aus', () => {
  const starters = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const t = setup({ seed });
    const { host, guest } = t.pair();
    host.send({ type: 'placeFleet', ships: FLEET_A });
    host.none('start'); guest.none('start');
    guest.send({ type: 'placeFleet', ships: FLEET_A });
    const { first } = host.take('start');
    assert.ok(first === 0 || first === 1);
    assert.deepEqual(guest.take('start'), { type: 'start', first });
    assert.deepEqual(host.take('turn'), { type: 'turn', seat: first });
    starters.add(first);
  }
  assert.equal(starters.size, 2, 'beide Seiten beginnen mal');
});

test('vor dem Kampf sind Schüsse ungültig', () => {
  const t = setup();
  const { host } = t.pair();
  host.send({ type: 'shoot', col: 0, row: 0 });
  assert.equal(host.take('error').code, 'invalid');
});

// --- Kampf

test('Zugrecht: nur wer dran ist, darf schießen', () => {
  const t = setup();
  const { target } = t.battle();
  target.send({ type: 'shoot', col: 5, row: 5 });
  assert.equal(target.take('error').code, 'invalid');
});

test('Fehlschuss: Ergebnis an beide, Zug wechselt', () => {
  const t = setup();
  const { shooter, target, first } = t.battle();
  shooter.send({ type: 'shoot', col: 9, row: 9 });
  const expected = { type: 'shotResult', shooter: first, col: 9, row: 9, result: 'miss' };
  assert.deepEqual(shooter.take('shotResult'), expected);
  assert.deepEqual(target.take('shotResult'), expected);
  assert.deepEqual(shooter.take('turn'), { type: 'turn', seat: 1 - first });
  target.take('turn');
  target.send({ type: 'shoot', col: 9, row: 9 });
  assert.equal(target.take('shotResult').shooter, 1 - first, 'gleiche Zelle aufs andere Brett ist erlaubt');
});

test('Treffer: erneut schießen; doppelte Zelle ist ungültig', () => {
  const t = setup();
  const { shooter, target, first } = t.battle();
  shooter.send({ type: 'shoot', col: 0, row: 0 });
  assert.equal(target.take('shotResult').result, 'hit');
  assert.deepEqual(target.take('turn'), { type: 'turn', seat: first });
  shooter.clear();
  shooter.send({ type: 'shoot', col: 0, row: 0 });
  assert.equal(shooter.take('error').code, 'invalid');
  shooter.none('shotResult');
});

test('versenkt: Schiffsinfo im Ergebnis', () => {
  const t = setup();
  const { shooter, target, first } = t.battle();
  shooter.send({ type: 'shoot', col: 0, row: 8 });
  shooter.send({ type: 'shoot', col: 1, row: 8 });
  target.take('shotResult');
  const sunk = target.take('shotResult');
  assert.deepEqual(sunk, {
    type: 'shotResult', shooter: first, col: 1, row: 8, result: 'sunk',
    ship: { index: 4, col: 0, row: 8, orientation: 'h', length: 2 },
  });
});

test('kein Leak: Nachrichten verraten keine unversenkten Schiffe', () => {
  const t = setup();
  const { shooter, target } = t.battle();
  shooter.send({ type: 'shoot', col: 0, row: 0 }); // Treffer, nicht versenkt
  shooter.send({ type: 'shoot', col: 9, row: 9 });
  target.send({ type: 'shoot', col: 2, row: 2 });
  for (const c of [shooter, target]) {
    for (const m of c.all) {
      const keys = Object.keys(m);
      assert.ok(!keys.some((k) => ['ships', 'board', 'fleet', 'cells', 'grid'].includes(k)), JSON.stringify(m));
      if (m.type === 'shotResult') {
        if (m.result === 'sunk') assert.ok(m.ship);
        else assert.deepEqual(keys.sort(), ['col', 'result', 'row', 'shooter', 'type']);
      }
    }
  }
});

test('komplette Partie bis zum Sieg mit Statistik und Spielstand', () => {
  const t = setup();
  const { shooter, target, first } = t.battle('Anna', 'Bert');
  // Erst ein paar Schüsse beider Seiten, damit die Statistik beider etwas enthält.
  shooter.send({ type: 'shoot', col: 9, row: 1 }); // daneben -> Zugwechsel
  target.send({ type: 'shoot', col: 0, row: 0 }); // Treffer -> bleibt dran
  target.send({ type: 'shoot', col: 9, row: 9 }); // daneben -> Zugwechsel
  for (const { col, row } of CELLS_A) { t.clock.advance(500); shooter.send({ type: 'shoot', col, row }); }
  const over = target.take('gameOver');
  const stats = [];
  stats[first] = { shots: 1 + CELLS_A.length, hits: CELLS_A.length };
  stats[1 - first] = { shots: 2, hits: 1 };
  const score = [0, 0];
  score[first] = 1;
  assert.deepEqual(over, { type: 'gameOver', winner: first, reason: 'allSunk', stats, score });
  assert.deepEqual(shooter.take('gameOver'), over);
  shooter.send({ type: 'shoot', col: 5, row: 5 });
  assert.equal(shooter.take('error').code, 'invalid', 'nach Spielende kein Schuss mehr');
});

test('Aufgeben im Kampf -> Sieg für den Gegner', () => {
  const t = setup();
  const { shooter, target, first } = t.battle();
  target.send({ type: 'resign' });
  const over = shooter.take('gameOver');
  assert.equal(over.winner, first);
  assert.equal(over.reason, 'resign');
  assert.deepEqual(target.take('gameOver'), over);
});

test('Verlassen im Kampf zählt als Aufgabe', () => {
  const t = setup();
  const { shooter, target, first } = t.battle();
  target.send({ type: 'leave' });
  const over = shooter.take('gameOver');
  assert.equal(over.winner, first);
  assert.equal(over.reason, 'resign');
});

test('Verbindungsabbruch im Kampf -> kampfloser Sieg (fled)', () => {
  const t = setup();
  const { shooter, target, first } = t.battle();
  target.disconnect();
  const over = shooter.take('gameOver');
  assert.equal(over.winner, first);
  assert.equal(over.reason, 'fled');
});

test('Abbruch in der Platzierung -> abandoned ohne Sieger', () => {
  const t = setup();
  const { host, guest } = t.pair();
  guest.disconnect();
  const over = host.take('gameOver');
  assert.equal(over.reason, 'abandoned');
  assert.equal(over.winner, null);
  assert.deepEqual(over.score, [0, 0]);
});

test('Gegner verlässt nach Spielende -> opponentStatus left; leerer Raum wird geschlossen', () => {
  const t = setup();
  const { host, guest, code } = t.battle();
  host.send({ type: 'resign' });
  host.take('gameOver'); guest.take('gameOver');
  guest.send({ type: 'leave' });
  assert.deepEqual(host.take('opponentStatus'), { type: 'opponentStatus', status: 'left' });
  host.send({ type: 'leave' });
  const late = t.hello('Spät');
  late.send({ type: 'joinRoom', code });
  assert.equal(late.take('error').code, 'roomExpired');
  // nach dem Verlassen ist ein neuer Raum möglich
  host.send({ type: 'createRoom' });
  host.take('roomCreated');
});

// --- Validierung & Limits

test('ungültige Nachrichten -> error invalid', () => {
  const t = setup({ limits: { maxViolations: 100 } });
  const { shooter } = t.battle();
  const bad = [
    'kein json', '[]', '{"type":"nope"}', '{"type":"__proto__"}',
    { type: 'shoot', col: 10, row: 0 }, { type: 'shoot', col: '1', row: 0 }, { type: 'shoot', col: 1.5, row: 0 }, { type: 'shoot' },
    { type: 'queue' }, // gehört zu Etappe 6
    JSON.stringify({ type: 'hello', name: 'x'.repeat(MAX_MESSAGE_BYTES) }),
  ];
  for (const m of bad) {
    shooter.send(m);
    assert.equal(shooter.take('error').code, 'invalid', String(typeof m === 'string' ? m.slice(0, 40) : JSON.stringify(m)));
  }
  shooter.none('shotResult');
  assert.ok(!shooter.closed);
});

test('wiederholte Verstöße führen zur Trennung', () => {
  const t = setup();
  const { shooter, target } = t.battle();
  for (let i = 0; i < 10; i++) { shooter.send('{'); t.clock.advance(100); }
  assert.ok(shooter.closed);
  assert.equal(target.take('gameOver').reason, 'fled');
});

test('Nachrichtenrate: mehr als 20 pro Sekunde wird verworfen', () => {
  const t = setup();
  const c = t.hello('Hektik');
  for (let i = 0; i < 25; i++) c.send({ type: 'leave' }); // ohne Raum: harmlos
  c.send({ type: 'createRoom' });
  assert.equal(c.inbox.filter((m) => m.type === 'error' && m.code === 'rateLimit').length, 1, 'nur einmal gemeldet');
  c.none('roomCreated');
  assert.ok(!c.closed);
  t.clock.advance(1000);
  c.clear();
  c.send({ type: 'createRoom' });
  c.take('roomCreated');
  c.none('error');
});
