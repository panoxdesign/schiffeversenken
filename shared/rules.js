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

/** Online-Zeiten in ms (spec/multiplayer.md, „Zeiten & Grenzwerte“). */
export const TIMES = Object.freeze({
  /** Zugzeit pro Schuss. */
  turnMs: 45_000,
  /** Puffer für die Schussanimation, bevor die Zugzeit läuft (bei „versenkt“ länger). */
  animMs: 3_000,
  sunkAnimMs: 5_000,
  /** Verpasste Züge in Folge bis zur Niederlage. */
  maxMissed: 3,
  /** Platzierungszeit; der Server randomisiert erst nach der Nachfrist hart. */
  placementMs: 120_000,
  placementSlackMs: 10_000,
  /** Schonfrist nach Verbindungsabbruch. */
  graceMs: 60_000,
  /** Warnphase der Sanduhr. */
  warnMs: 10_000,
});
