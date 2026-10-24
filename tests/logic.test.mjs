import test from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../src/game/Board.js';
import { AI } from '../src/game/AI.js';
import { FLEET, RULES, BOARD_SIZE } from '../src/config.js';

const LENGTHS = FLEET.map((f) => f.length);
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mk = () => new Board({ size: BOARD_SIZE, noTouching: RULES.noTouching });

function assertValid(b) {
  const occupied = new Map();
  assert.equal(b.ships.filter(Boolean).length, LENGTHS.length);
  for (const s of b.ships) {
    assert.equal(s.cells.length, s.length);
    assert.equal(s.length, LENGTHS[s.index]);
    for (const c of s.cells) {
      assert.ok(c.col >= 0 && c.row >= 0 && c.col < BOARD_SIZE && c.row < BOARD_SIZE);
      const k = c.row * 100 + c.col;
      assert.ok(!occupied.has(k), 'Überlappung');
      occupied.set(k, s.index);
    }
  }
  if (RULES.noTouching) {
    for (const [k, idx] of occupied) {
      const c = k % 100, r = Math.floor(k / 100);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const o = occupied.get((r + dr) * 100 + c + dc);
        assert.ok(o === undefined || o === idx, 'Berührung');
      }
    }
  }
}

test('Platzierung: Grenzen, Überlappung, Berührung', () => {
  const b = new Board({ size: 10, noTouching: true });
  assert.equal(b.canPlace(5, 6, 0, 'h'), false);
  assert.equal(b.canPlace(5, 5, 0, 'h'), true);
  assert.equal(b.canPlace(3, 0, 8, 'v'), false);
  assert.equal(b.canPlace(3, -1, 0, 'h'), false);
  assert.ok(b.place(0, 3, 2, 2, 'h'));
  assert.equal(b.canPlace(2, 2, 2, 'v'), false, 'Überlappung');
  assert.equal(b.canPlace(2, 5, 2, 'v'), false, 'seitlich berührt');
  assert.equal(b.canPlace(2, 6, 2, 'v'), true);
  assert.equal(b.canPlace(2, 1, 3, 'h'), false, 'diagonal/seitlich berührt');
  assert.equal(b.canPlace(2, 5, 3, 'v'), false, 'diagonale Berührung');
  assert.equal(b.canPlace(2, 6, 3, 'v'), true);
  assert.equal(b.canPlace(2, 2, 4, 'h'), true);
  assert.equal(b.canPlace(2, 2, 3, 'h'), false);
  const loose = new Board({ size: 10, noTouching: false });
  loose.place(0, 3, 2, 2, 'h');
  assert.equal(loose.canPlace(2, 2, 3, 'h'), true);
  assert.equal(loose.canPlace(2, 2, 2, 'v'), false);
});

test('place/remove/shipAt/verschieben', () => {
  const b = mk();
  assert.ok(b.place(1, 4, 0, 0, 'v'));
  assert.equal(b.shipAt(0, 3), 1);
  assert.equal(b.shipAt(0, 4), -1);
  assert.ok(b.place(1, 4, 5, 5, 'h'), 'Verschieben');
  assert.equal(b.shipAt(0, 0), -1);
  assert.equal(b.shipAt(8, 5), 1);
  assert.ok(b.canPlace(4, 4, 5, 'h', 1), 'eigene Position ignorieren');
  assert.ok(b.remove(1));
  assert.equal(b.shipAt(8, 5), -1);
  assert.equal(b.remove(1), false);
});

test('Schüsse: miss/hit/sunk/repeat, allSunk, Nachbarn', () => {
  const b = mk();
  b.place(0, 2, 3, 3, 'h');
  b.place(1, 3, 3, 7, 'h');
  assert.equal(b.receiveShot(0, 0).result, 'miss');
  assert.equal(b.receiveShot(0, 0).result, 'repeat');
  const h = b.receiveShot(3, 3);
  assert.equal(h.result, 'hit'); assert.equal(h.shipIndex, 0); assert.equal(h.cellIndex, 0);
  assert.equal(b.receiveShot(3, 3).result, 'repeat');
  const s = b.receiveShot(4, 3);
  assert.equal(s.result, 'sunk'); assert.equal(s.cells.length, 2); assert.equal(s.cellIndex, 1);
  assert.equal(b.allSunk(), false);
  assert.equal(b.neighborsOf(0).length, 10); // 4x3 - 2
  for (const [c, r] of [[3, 7], [4, 7], [5, 7]]) b.receiveShot(c, r);
  assert.equal(b.allSunk(), true);
  assert.equal(b.receiveShot(-1, 0).result, 'repeat');
});

test('randomize: 10.000x gültig', () => {
  const rng = mulberry32(1);
  const b = mk();
  for (let i = 0; i < 10000; i++) {
    assert.ok(b.randomize(LENGTHS, rng));
    assertValid(b);
  }
});

test('randomize: Math.random und enge Flotte terminieren', () => {
  const b = mk();
  for (let i = 0; i < 200; i++) { b.randomize(LENGTHS); assertValid(b); }
  const big = new Board({ size: 10, noTouching: true });
  const t = Date.now();
  big.randomize([5, 5, 4, 4, 3, 3, 2, 2], mulberry32(3)); // evtl. nur Teilerfolg, darf aber nie hängen
  assert.ok(Date.now() - t < 2000);
});

function playGame(difficulty, rng) {
  const b = mk();
  b.randomize(LENGTHS, rng);
  const ai = new AI(difficulty, rng, { fleet: LENGTHS, size: BOARD_SIZE, noTouching: RULES.noTouching });
  const seen = new Set();
  let shots = 0;
  while (!b.allSunk()) {
    assert.ok(shots < 100, 'terminiert nicht');
    const s = ai.chooseShot();
    assert.ok(s, 'kein Schuss');
    const k = s.row * 10 + s.col;
    assert.ok(!seen.has(k), `Doppelschuss ${difficulty}`);
    seen.add(k);
    const r = b.receiveShot(s.col, s.row);
    assert.notEqual(r.result, 'repeat');
    ai.notify(s.col, s.row, r.result, r.cells);
    shots++;
  }
  return shots;
}

const RANGES = { easy: [55, 85], normal: [45, 62], hard: [36, 52] };
for (const diff of ['easy', 'normal', 'hard']) {
  test(`KI ${diff}: 300 Partien`, () => {
    const rng = mulberry32(42 + diff.length);
    let total = 0;
    for (let i = 0; i < 300; i++) total += playGame(diff, rng);
    const avg = total / 300;
    console.log(`  KI ${diff}: Ø ${avg.toFixed(1)} Schüsse`);
    assert.ok(avg >= RANGES[diff][0] && avg <= RANGES[diff][1], `Ø ${avg} außerhalb ${RANGES[diff]}`);
  });
}

test('KI hard schlägt normal schlägt easy', () => {
  const avg = (d) => { const rng = mulberry32(7); let t = 0; for (let i = 0; i < 100; i++) t += playGame(d, rng); return t / 100; };
  const e = avg('easy'), n = avg('normal'), h = avg('hard');
  assert.ok(h < n && n < e, `${h} ${n} ${e}`);
});
