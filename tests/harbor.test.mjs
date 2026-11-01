// Weck-Ping zum Spielserver: Status „bereit“, „erwacht …“ oder „nicht erreichbar“ – mit vorspulbarer Uhr.
import test from 'node:test';
import assert from 'node:assert/strict';
import { watchHarbor } from '../src/net/harbor.js';
import { fakeClock } from './support/fakeClock.mjs';

const tick = () => new Promise((r) => setImmediate(r));

/** Ping, dessen Antworten der Test einzeln auflöst. */
function controlledPing() {
  const calls = [];
  const ping = () => new Promise((resolve, reject) => calls.push({ resolve, reject }));
  return { ping, calls, ok: async (players = 0) => { calls.at(-1).resolve({ ok: true, players }); await tick(); }, fail: async () => { calls.at(-1).reject(new Error('weg')); await tick(); } };
}

function setup({ offline = () => false } = {}) {
  const clock = fakeClock();
  const p = controlledPing();
  const seen = [];
  const harbor = watchHarbor({ ping: p.ping, clock, offline, onStatus: (s) => seen.push(s) });
  return { clock, p, seen, harbor };
}

test('Hafen antwortet schnell -> bereit, ohne „erwacht“', async () => {
  const { p, seen, harbor } = setup();
  harbor.check();
  await p.ok(3);
  assert.deepEqual(seen, ['ready']);
  assert.equal(harbor.status, 'ready');
});

test('Schlafender Hafen: erst „erwacht“, dann bereit', async () => {
  const { clock, p, seen, harbor } = setup();
  harbor.check();
  clock.advance(1500);
  assert.deepEqual(seen, ['waking']);
  await p.fail(); // während des Hochfahrens abgewiesen
  clock.advance(3000); // neuer Versuch
  assert.equal(p.calls.length, 2);
  await p.ok();
  assert.deepEqual(seen, ['waking', 'ready']);
});

test('Hafen bleibt stumm -> nach 90 s „nicht erreichbar“, erneute Prüfung beim nächsten Menü', async () => {
  const { clock, p, seen, harbor } = setup();
  const t0 = clock.now();
  harbor.check();
  for (let i = 0; i < 100 && harbor.status !== 'down'; i++) { await p.fail(); clock.advance(3000); }
  assert.deepEqual(seen, ['waking', 'down']);
  assert.ok(clock.now() - t0 <= 90_000, 'gibt nach spätestens 90 s auf');
  const tries = p.calls.length;
  harbor.check();
  assert.equal(p.calls.length, tries + 1, 'neuer Versuch');
  await p.ok();
  assert.equal(harbor.status, 'ready');
});

test('Gerade erst bereit -> kein neuer Ping; nach einer Minute schon', async () => {
  const { clock, p, harbor } = setup();
  harbor.check();
  await p.ok();
  harbor.check();
  assert.equal(p.calls.length, 1);
  clock.advance(60_000);
  harbor.check();
  assert.equal(p.calls.length, 2);
  harbor.check(); // läuft schon
  assert.equal(p.calls.length, 2);
});

test('Hängender Ping: spätestens nach 90 s „nicht erreichbar“', async () => {
  const { clock, harbor } = setup();
  harbor.check();
  clock.advance(90_000);
  assert.equal(harbor.status, 'down');
});

test('Ohne Internet: sofort „nicht erreichbar“, ohne „erwacht“', async () => {
  const { p, seen, harbor } = setup({ offline: () => true });
  harbor.check();
  await p.fail();
  assert.deepEqual(seen, ['down']);
});

test('„Nicht erreichbar“ prüft im Hintergrund nach, ohne zwischendurch „erwacht“ zu zeigen', async () => {
  const { clock, p, seen, harbor } = setup({ offline: () => true });
  harbor.check();
  await p.fail();
  clock.advance(30_000);
  assert.equal(p.calls.length, 2, 'neuer Ping nach 30 s');
  clock.advance(5_000);
  assert.deepEqual(seen, ['down']);
  await p.ok();
  assert.deepEqual(seen, ['down', 'ready']);
});
