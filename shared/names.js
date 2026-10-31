// Piratennamen: Vorschläge für Spielernamen (auch vom Server für leere Namen genutzt).
import { MAX_NAME_LENGTH } from './protocol.js';

const TITLES = ["Käpt'n", 'Maat', 'Smutje', 'Bootsmann', 'Lotse', 'Kanonier'];
const NICKS = ['Rotbart', 'Blaubart', 'Graubart', 'Säbelzahn', 'Klabauter', 'Pulverfass', 'Holzbein', 'Sturmvogel', 'Haifisch', 'Rumfass'];
const EPITHETS = ['Einaugen', 'Eisenhand', 'Goldzahn', 'Narben', 'Hakenhand', 'Salzbart'];
const FIRST = ['Jule', 'Hein', 'Grete', 'Klaas', 'Mette', 'Fiete', 'Anne', 'Jan', 'Wiebke', 'Ole'];

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/** Zufälliger Piratenname, z. B. „Käpt'n Rotbart“ oder „Einaugen-Jule“ (max. 16 Zeichen). */
export function randomPirateName(rng = Math.random) {
  for (;;) {
    const name = rng() < 0.5 ? `${pick(TITLES, rng)} ${pick(NICKS, rng)}` : `${pick(EPITHETS, rng)}-${pick(FIRST, rng)}`;
    if (name.length <= MAX_NAME_LENGTH) return name;
  }
}

/** Gleiche Namen unterscheidbar machen: der zweite erhält „II“. */
export function distinctNames(a, b) {
  if (a !== b) return [a, b];
  const suffix = ' II';
  return [a, Array.from(b).slice(0, MAX_NAME_LENGTH - suffix.length).join('') + suffix];
}
