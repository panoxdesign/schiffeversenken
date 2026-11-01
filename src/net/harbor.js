// Weck-Ping zum Spielserver („Hafen“). Ein schlafender Free-Server braucht beim ersten Aufruf eine Weile;
// der Client pingt ihn darum schon beim Öffnen des Hauptmenüs und meldet den Zustand:
//   'unknown' (noch nicht geprüft) -> 'waking' (Antwort dauert) -> 'ready' | 'down' (aufgegeben, ohne Netz).
// Im Zustand 'down' wird still alle 30 s nachgeprüft.
import { systemClock } from '../../shared/clock.js';
// Ping und Uhr werden injiziert (Tests ohne Netz und ohne echte Wartezeiten).

/**
 * @param {{ ping: () => Promise<unknown>, clock?: import('../../shared/clock.js').Clock, offline?: () => boolean,
 *           onStatus?: (status: string) => void, slowMs?: number, retryMs?: number, giveUpMs?: number,
 *           freshMs?: number, recheckMs?: number }} opts
 *   offline: Gerät ohne Netz -> sofort 'down'; slowMs: ab dann „erwacht“; retryMs: Pause nach Fehlschlag;
 *   giveUpMs: danach 'down' (auch bei hängendem Ping); freshMs: so lange gilt 'ready' ohne neuen Ping;
 *   recheckMs: Abstand der stillen Nachprüfung im Zustand 'down'.
 */
export function watchHarbor({
  ping, clock = systemClock, offline = () => false, onStatus = () => {},
  slowMs = 1500, retryMs = 3000, giveUpMs = 90_000, freshMs = 60_000, recheckMs = 30_000,
}) {
  let status = 'unknown';
  let run = 0; // laufende Prüfung (0 = keine)
  let seq = 0;
  let lastOk = -Infinity;
  let recheck = null;
  const timers = new Set(); // Timer der laufenden Prüfung

  const set = (s) => { if (s !== status) { status = s; onStatus(s); } };
  const later = (fn, ms) => { const h = clock.setTimeout(() => { timers.delete(h); fn(); }, ms); timers.add(h); };

  function finish(s) {
    run = 0;
    for (const h of timers) clock.clearTimeout(h);
    timers.clear();
    if (s === 'ready') lastOk = clock.now();
    set(s);
    if (s === 'down') recheck = clock.setTimeout(() => { recheck = null; check(); }, recheckMs);
  }

  function attempt(id) {
    ping().then(
      () => { if (run === id || status !== 'ready') finish('ready'); }, // auch ein später Erfolg zählt
      () => {
        if (run !== id) return;
        if (offline()) finish('down');
        else later(() => attempt(id), retryMs);
      },
    );
  }

  /** Prüft (bzw. weckt) den Hafen, außer er war gerade erst bereit oder eine Prüfung läuft schon. */
  function check() {
    if (run || (status === 'ready' && clock.now() - lastOk < freshMs)) return;
    if (recheck) { clock.clearTimeout(recheck); recheck = null; }
    const id = run = ++seq;
    later(() => { if (status !== 'down') set('waking'); }, slowMs); // still nachprüfen, ohne zu flackern
    later(() => finish('down'), giveUpMs);
    attempt(id);
  }

  return { get status() { return status; }, check };
}

/** GET /health mit Zeitlimit -> { ok, players, version }; wirft bei Fehler oder Zeitüberschreitung. */
export async function fetchHealth(url, { timeoutMs = 20_000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error(`Hafen antwortet mit ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}
