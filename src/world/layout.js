// Statische Szenen-Anordnung (Inseln, Felsen, Treibgut). Freihalten: x∈[-24,24], z∈[-12,12], Flaggschiffe bei x=±34.

/** Ferne Inseln. radius = Gesamtradius inkl. Unterwasserhang (Land ~0.7 davon). */
export const ISLANDS = [
  { id: 'light', x: -66, z: -64, radius: 23, height: 8, seed: 11, feature: 'lighthouse', palms: 9, yaw: 0.3 },
  { id: 'fort', x: 62, z: -74, radius: 29, height: 10.5, seed: 23, feature: 'fort', palms: 10, yaw: -0.25 },
  { id: 'big', x: -6, z: -128, radius: 40, height: 15, seed: 5, feature: null, palms: 16, yaw: 0 },
  { id: 'west', x: -104, z: 4, radius: 23, height: 6.5, seed: 31, feature: null, palms: 9, yaw: 0 },
  { id: 'east', x: 100, z: -20, radius: 21, height: 5.5, seed: 47, feature: null, palms: 8, yaw: 0 },
];

/** Felsen im Wasser (Brandungsfelsen). s = Skalierung */
export const ROCKS = [
  { x: -30, z: -36, s: 3.2, seed: 3 },
  { x: 36, z: -40, s: 4.0, seed: 8 },
  { x: -50, z: -22, s: 2.6, seed: 13 },
  { x: 54, z: -30, s: 3.0, seed: 17 },
  { x: 20, z: -52, s: 3.6, seed: 21 },
  { x: -20, z: -56, s: 2.8, seed: 25 },
  { x: -58, z: 14, s: 3.4, seed: 29 },
  { x: 62, z: 12, s: 2.8, seed: 33 },
  { x: -64, z: 32, s: 2.4, seed: 37 },
  { x: 70, z: 34, s: 2.6, seed: 41 },
  { x: 0, z: -84, s: 4.4, seed: 45 },
];

/** Treibende Fässer/Kisten: type 'barrel' | 'crate' */
export const FLOATERS = [
  { type: 'barrel', x: -8, z: -19 },
  { type: 'crate', x: 11, z: -22 },
  { type: 'barrel', x: 3, z: -30 },
  { type: 'crate', x: -26, z: -26 },
  { type: 'barrel', x: 28, z: -18 },
  { type: 'barrel', x: -46, z: 8 },
  { type: 'crate', x: -49, z: -6 },
  { type: 'barrel', x: 47, z: 5 },
  { type: 'crate', x: 50, z: -12 },
  { type: 'barrel', x: -16, z: 24 },
  { type: 'crate', x: 20, z: 27 },
  { type: 'barrel', x: 40, z: 22 },
];
