// Zentrale Spielkonfiguration – gemeinsame Konstanten für alle Module.
// Änderungen hier nur durch den Integrator (siehe ARCHITECTURE.md).
import * as THREE from 'three';

/** Kantenlänge einer Spielfeldzelle in Welteinheiten. */
export const CELL = 2;
/** Spielfeld ist BOARD_SIZE x BOARD_SIZE Zellen. */
export const BOARD_SIZE = 10;
/** Halbe Brettbreite in Welteinheiten. */
export const BOARD_HALF = (CELL * BOARD_SIZE) / 2;

/** Mittelpunkte der beiden Spielfelder (auf Wasserhöhe y=0). */
export const BOARD_CENTER = {
  player: new THREE.Vector3(-12, 0, 0),
  enemy: new THREE.Vector3(12, 0, 0),
};

/** Position der (nicht treffbaren) Flaggschiffe, von denen die Kanonen feuern. */
export const FLAGSHIP_POSITION = {
  player: new THREE.Vector3(-34, 0, 2),
  enemy: new THREE.Vector3(34, 0, 2),
};

/** Spaltenbeschriftung (x-Richtung) und Zeilenbeschriftung (z-Richtung). */
export const COL_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
export const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

/** Flotte: Reihenfolge = Reihenfolge im Platzierungsmenü. */
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

export const DIFFICULTIES = {
  easy: { name: 'Leichtmatrose' },
  normal: { name: 'Bootsmann' },
  hard: { name: 'Kapitän' },
};

/** Qualitätsstufen. Module lesen engine.quality (eines dieser Objekte). */
export const QUALITY_PRESETS = {
  low: {
    name: 'low',
    maxPixelRatio: 1,
    minPixelRatio: 0.6,
    antialias: false,
    oceanSegments: 96,
    particleScale: 0.5,
    clouds: false,
    birds: 4,
    detail: 0, // 0 = niedrig, 1 = mittel, 2 = hoch (Geometrie-Detail)
  },
  medium: {
    name: 'medium',
    maxPixelRatio: 1.5,
    minPixelRatio: 0.75,
    antialias: true,
    oceanSegments: 160,
    particleScale: 0.75,
    clouds: true,
    birds: 8,
    detail: 1,
  },
  high: {
    name: 'high',
    maxPixelRatio: 2,
    minPixelRatio: 0.85,
    antialias: true,
    oceanSegments: 224,
    particleScale: 1,
    clouds: true,
    birds: 12,
    detail: 2,
  },
};
