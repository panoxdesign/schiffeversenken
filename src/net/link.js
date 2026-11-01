// Einladungslink: Client-URL mit ?join=<CODE>. Beim Start ausgewertet und danach aus der Adresszeile entfernt.
const PARAM = 'join';

export function inviteLink(code, base = 'http://localhost/') {
  const u = new URL(base);
  u.search = '';
  u.hash = '';
  u.searchParams.set(PARAM, code);
  return u.toString();
}

/**
 * Liest den Code aus der Adresse und entfernt ihn (damit ein Neuladen nicht erneut beitritt).
 * @returns {string|null} roher Code oder null
 */
export function takeJoinCode(loc = globalThis.location, history = globalThis.history) {
  if (!loc) return null;
  const u = new URL(loc.href);
  const code = u.searchParams.get(PARAM);
  if (code === null) return null;
  u.searchParams.delete(PARAM);
  try { history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch { /* ignorieren */ }
  return code;
}

/** WebSocket-Adresse: VITE_SERVER_URL (http[s]://…) oder derselbe Host unter /ws (Dev: Vite-Proxy). */
export function serverWsUrl(serverUrl, loc = globalThis.location) {
  const u = serverUrl ? new URL('/ws', serverUrl) : new URL('/ws', loc.href);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.toString();
}
