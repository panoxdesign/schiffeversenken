// Echte Uhr (Browser und Node). Wer Zeit braucht, bekommt eine Uhr injiziert; Tests nutzen eine vorspulbare.

/** @typedef {{ now(): number, setTimeout(fn: () => void, ms: number): any, clearTimeout(handle: any): void }} Clock */

/** @type {Clock} */
export const systemClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle),
};
