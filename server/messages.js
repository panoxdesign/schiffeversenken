// Feldprüfung der Client-Nachrichten je Typ. Die tiefe Prüfung der Flotte macht `validateFleet` im Match.
import { C2S, parseMessage, isInt, isCell } from '../shared/protocol.js';
import { FLEET } from '../shared/rules.js';

const any = () => true;
const optString = (v, max) => v === undefined || (typeof v === 'string' && v.length <= max);

/**
 * Vom Server-Kern unterstützte Typen mit ihrer Feldprüfung.
 * queue, leaveQueue, emote und rematch folgen mit Etappe 6 und gelten bis dahin als ungültig.
 */
const FIELDS = {
  [C2S.hello]: (m) => isInt(m.version, 0, 1_000_000) && optString(m.name, 256) && optString(m.token, 128),
  [C2S.createRoom]: any,
  [C2S.joinRoom]: (m) => typeof m.code === 'string' && m.code.length <= 16,
  [C2S.placeFleet]: (m) => Array.isArray(m.ships) && m.ships.length === FLEET.length,
  [C2S.shoot]: (m) => isCell(m.col, m.row),
  [C2S.leave]: any,
  [C2S.resign]: any,
};

/**
 * Rohdaten -> geprüfte Client-Nachricht, oder null (kein JSON, zu groß, unbekannter/nicht unterstützter Typ, falsche Felder).
 * @param {unknown} raw
 */
export function readClientMessage(raw) {
  const msg = parseMessage(raw, C2S);
  if (!msg) return null;
  const check = Object.hasOwn(FIELDS, msg.type) ? FIELDS[msg.type] : null;
  return check && check(msg) ? msg : null;
}
