// Echte Uhr und kryptografischer Zufall für den Produktivbetrieb.
// Der Server-Kern bekommt beides injiziert; Tests nutzen eine vorspulbare Uhr und seedbaren Zufall.
import { webcrypto } from 'node:crypto';
import { systemClock } from '../shared/clock.js';

/** @typedef {import('../shared/clock.js').Clock} Clock */

/** @type {Clock} */
export const realClock = systemClock;

/** Gleichverteilte Zahl in [0, 1) aus kryptografischem Zufall (Raum-Codes und Tokens dürfen nicht erratbar sein). */
export function cryptoRng() {
  return webcrypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}
