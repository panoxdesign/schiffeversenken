// Spielregeln – gemeinsam für Client und Server (kein three.js, kein ws).

/** Spielfeld ist BOARD_SIZE x BOARD_SIZE Zellen. */
export const BOARD_SIZE = 10;

/** Flotte: Reihenfolge = Reihenfolge im Platzierungsmenü = Flottenindex. */
export const FLEET = [
  { id: 'galeone', name: 'Galeone', length: 5 },
  { id: 'fregatte', name: 'Fregatte', length: 4 },
  { id: 'brigg', name: 'Brigg', length: 3 },
  { id: 'schoner', name: 'Schoner', length: 3 },
  { id: 'schaluppe', name: 'Schaluppe', length: 2 },
];

export const RULES = {
  /** Klassische deutsche Regel: Schiffe dürfen sich nicht berühren (auch nicht diagonal). */
  noTouching: true,
  /** Bei Treffer darf erneut geschossen werden. */
  shootAgainOnHit: true,
};
