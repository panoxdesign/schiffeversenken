// Shared-Bereich: Board-Ergänzungen, Protokoll-Helfer, KI-Gegner (ohne three.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../shared/Board.js';
import { FLEET, RULES, BOARD_SIZE } from '../shared/rules.js';
import { CODE_ALPHABET, C2S, normalizeCode, sanitizeName, validateFleet, fleetOf, parseMessage } from '../shared/protocol.js';
import { randomPirateName, distinctNames } from '../shared/names.js';
import { AIOpponent } from '../src/game/opponents/AIOpponent.js';

const LENGTHS = FLEET.map((f) => f.length);
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mk = () => new Board({ size: BOARD_SIZE, noTouching: RULES.noTouching });

test('completeRandom ergänzt nur fehlende Schiffe', () => {
  const rng = mulberry32(3);
  for (let i = 0; i < 200; i++) {
    const b = mk();
    b.place(0, 5, 2, 4, 'h');
    b.place(3, 3, 9, 0, 'v');
    assert.equal(b.completeRandom(LENGTHS, rng), true);
    assert.deepEqual(b.ships[0].cells[0], { col: 2, row: 4 });
    assert.equal(b.ships[3].orientation, 'v');
    assert.ok(validateFleet(fleetOf(b)), 'gültige Flotte');
  }
  const full = mk();
  full.randomize(LENGTHS, rng);
  const before = JSON.stringify(fleetOf(full));
  assert.equal(full.completeRandom(LENGTHS, rng), true);
  assert.equal(JSON.stringify(fleetOf(full)), before, 'vollständige Flotte bleibt');
  assert.equal(mk().completeRandom(LENGTHS, rng), true, 'leeres Brett');
});

test('Wissens-Brett: Schüsse und versenkte Schiffe', () => {
  const kb = mk();
  kb.recordShot(0, 0, false);
  kb.recordShot(4, 4, true);
  assert.ok(kb.wasShot(0, 0) && kb.wasShot(4, 4) && !kb.wasShot(1, 1));
  assert.equal(kb.shipAt(4, 4), -1, 'Treffer verrät kein Schiff');
  kb.recordSunk(4, 2, 4, 4, 'v');
  assert.equal(kb.shipAt(4, 5), 4);
  assert.ok(kb.wasShot(4, 5));
  assert.equal(kb.sunkCount(), 1);
  assert.equal(kb.neighborsOf(4).length, 10);
});

test('Protokoll: Codes, Namen, Nachrichten, Flotten', () => {
  assert.equal(CODE_ALPHABET.length, 31);
  for (const ch of '0O1IL') assert.ok(!CODE_ALPHABET.includes(ch));
  assert.equal(normalizeCode(' k7qx '), 'K7QX');
  assert.equal(normalizeCode('K0QX'), null);
  assert.equal(normalizeCode('K7Q'), null);
  assert.equal(sanitizeName('  Käpt\'n\u0007 Rotbart der Schreckliche '), 'Käpt\'n Rotbart d');
  assert.equal(sanitizeName('   '), '');
  assert.equal(sanitizeName(42), '');
  assert.deepEqual(parseMessage('{"type":"shoot","col":1,"row":2,"x":1}', C2S), { type: 'shoot', col: 1, row: 2, x: 1 });
  assert.equal(parseMessage('{"type":"nope"}', C2S), null);
  assert.equal(parseMessage('{"type":"toString"}', C2S), null);
  assert.equal(parseMessage('[1]', C2S), null);
  assert.equal(parseMessage('{kaputt', C2S), null);
  assert.equal(parseMessage(JSON.stringify({ type: 'hello', name: 'x'.repeat(3000) }), C2S), null);

  const b = mk();
  b.randomize(LENGTHS, mulberry32(9));
  const fleet = fleetOf(b);
  assert.ok(validateFleet(fleet));
  assert.equal(validateFleet(fleet.slice(1)), null, 'unvollständig');
  assert.equal(validateFleet([...fleet.slice(1), { ...fleet[1] }]), null, 'Index doppelt');
  assert.equal(validateFleet(fleet.map((s, i) => (i ? s : { ...s, col: 1.5 }))), null, 'keine Ganzzahl');
  assert.equal(validateFleet(fleet.map((s, i) => (i ? s : { ...s, orientation: 'x' }))), null);
  const touching = [
    { index: 0, col: 0, row: 0, orientation: 'h' }, { index: 1, col: 0, row: 1, orientation: 'h' },
    { index: 2, col: 0, row: 4, orientation: 'h' }, { index: 3, col: 0, row: 6, orientation: 'h' }, { index: 4, col: 0, row: 8, orientation: 'h' },
  ];
  assert.equal(validateFleet(touching), null, 'Berührungsverbot');
});

test('KI-Gegner: Schnittstelle bis zum Sieg beider Seiten', async () => {
  const rng = mulberry32(11);
  const mine = mk();
  mine.randomize(LENGTHS, rng);
  const opp = new AIOpponent({ difficulty: 'hard', rng });
  assert.deepEqual(await opp.submitFleet(fleetOf(mine)), { first: 'player' });

  // eigene Schüsse: Ergebnis ohne Positionen, außer bei 'sunk'
  let sunk = 0;
  for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) {
    const res = await opp.shoot(c, r);
    if (res.result === 'sunk') {
      sunk++;
      assert.deepEqual(Object.keys(res.ship).sort(), ['col', 'index', 'length', 'orientation', 'row']);
      assert.equal(res.ship.length, LENGTHS[res.ship.index]);
    } else assert.deepEqual(Object.keys(res), ['result']);
  }
  assert.equal(sunk, FLEET.length);

  // gegnerische Schüsse decken sich mit der Auswertung auf der eigenen Flotte
  const seen = new Set();
  while (!mine.allSunk()) {
    const s = await opp.nextShot();
    assert.ok(s && !seen.has(s.row * 10 + s.col));
    seen.add(s.row * 10 + s.col);
    assert.equal(mine.receiveShot(s.col, s.row).result, s.result);
  }
});

test('Piratennamen: max. 16 Zeichen, gleiche Namen unterscheidbar', () => {
  const rng = mulberry32(5);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const n = randomPirateName(rng);
    assert.ok(n.length <= 16 && n === sanitizeName(n), n);
    seen.add(n);
  }
  assert.ok(seen.size > 50);
  assert.deepEqual(distinctNames('Rotbart', 'Jule'), ['Rotbart', 'Jule']);
  assert.deepEqual(distinctNames('Rotbart', 'Rotbart'), ['Rotbart', 'Rotbart II']);
  const [, b] = distinctNames('Käpt\'n Säbelzahn', 'Käpt\'n Säbelzahn');
  assert.equal(b, 'Käpt\'n Säbelz II');
});
