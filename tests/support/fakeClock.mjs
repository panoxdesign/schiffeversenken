// Vorspulbare Uhr für Server-Tests: gleiche Schnittstelle wie server/runtime.js (now, setTimeout, clearTimeout).

export function fakeClock(start = 1_000_000) {
  let now = start;
  let seq = 0;
  const timers = new Map(); // id -> { at, fn }

  const nextDue = (end) => {
    let best = null;
    for (const [id, t] of timers) {
      if (t.at > end) continue;
      if (!best || t.at < best.t.at || (t.at === best.t.at && id < best.id)) best = { id, t };
    }
    return best;
  };

  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = ++seq;
      timers.set(id, { at: now + Math.max(0, ms), fn });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    /** Zeit vorspulen; fällige Timer laufen in zeitlicher Reihenfolge. */
    advance(ms) {
      const end = now + ms;
      for (let due = nextDue(end); due; due = nextDue(end)) {
        timers.delete(due.id);
        now = due.t.at;
        due.t.fn();
      }
      now = end;
    },
    pending: () => timers.size,
  };
}

/** Seedbarer Zufall (wie in den übrigen Tests). */
export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
