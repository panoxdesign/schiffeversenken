// Netzwerk-Protokoll (Vertrag Client <-> Server) – gemeinsam genutzt, kein three.js, kein ws.
// JSON-Nachrichten mit Feld `type`; unbekannte Felder werden ignoriert. Details: spec/multiplayer.md.
import { BOARD_SIZE, FLEET, RULES } from './rules.js';
import { Board } from './Board.js';

/** Nur bei inkompatiblen Änderungen erhöhen. */
export const PROTOCOL_VERSION = 1;

/** Client -> Server */
export const C2S = Object.freeze({
  hello: 'hello', createRoom: 'createRoom', joinRoom: 'joinRoom', queue: 'queue', leaveQueue: 'leaveQueue',
  placeFleet: 'placeFleet', shoot: 'shoot', emote: 'emote', rematch: 'rematch', leave: 'leave', resign: 'resign',
});

/** Server -> Client */
export const S2C = Object.freeze({
  welcome: 'welcome', roomCreated: 'roomCreated', matched: 'matched', placementDeadline: 'placementDeadline',
  start: 'start', shotResult: 'shotResult', turn: 'turn', opponentStatus: 'opponentStatus', emote: 'emote',
  rematchOffer: 'rematchOffer', gameOver: 'gameOver', state: 'state', players: 'players', error: 'error',
});

export const ERROR_CODES = Object.freeze(['version', 'full', 'roomNotFound', 'roomFull', 'roomExpired', 'rateLimit', 'invalid']);
export const GAME_OVER_REASONS = Object.freeze(['allSunk', 'resign', 'timeout', 'fled', 'abandoned']);

export const MAX_MESSAGE_BYTES = 2048;
export const MAX_NAME_LENGTH = 16;

/** Raum-Codes: ohne verwechselbare Zeichen (0, O, 1, I, L) – 31 Zeichen. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

export const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
export const isCell = (col, row) => isInt(col, 0, BOARD_SIZE - 1) && isInt(row, 0, BOARD_SIZE - 1);

/** Groß-/Kleinschreibung egal; null, wenn kein gültiger Code. */
export function normalizeCode(input) {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** Getrimmt, ohne Steuerzeichen, max. 16 Zeichen; leer -> ''. */
export function sanitizeName(input) {
  if (typeof input !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return Array.from(input.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()).slice(0, MAX_NAME_LENGTH).join('').trim();
}

/**
 * Prüft eine Flotte im placeFleet-Format: [{ index, col, row, orientation }].
 * @returns {Board|null} das belegte Brett oder null, wenn ungültig.
 */
export function validateFleet(ships) {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return null;
  const board = new Board({ size: BOARD_SIZE, noTouching: RULES.noTouching });
  for (const s of ships) {
    if (!s || !isInt(s.index, 0, FLEET.length - 1) || board.isPlaced(s.index)) return null;
    if (!isCell(s.col, s.row) || (s.orientation !== 'h' && s.orientation !== 'v')) return null;
    if (!board.place(s.index, FLEET[s.index].length, s.col, s.row, s.orientation)) return null;
  }
  return board;
}

/** Flotte eines Bretts im placeFleet-Format. */
export function fleetOf(board) {
  return board.ships.filter(Boolean).map(({ index, col, row, orientation }) => ({ index, col, row, orientation }));
}

/**
 * Rohdaten -> Nachricht mit bekanntem Typ (Feldprüfung je Typ folgt im Server-Kern).
 * @param {string} raw
 * @param {Record<string,string>} types erlaubte Typen (C2S oder S2C)
 * @returns {object|null}
 */
export function parseMessage(raw, types) {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return null;
  let msg;
  try { msg = JSON.parse(raw); } catch { return null; }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || !Object.hasOwn(types, msg.type)) return null;
  return msg;
}
