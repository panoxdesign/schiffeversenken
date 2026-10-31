// Zentrale Spielkonfiguration – gemeinsame Konstanten für alle Module.
// Änderungen hier nur durch den Integrator (siehe ARCHITECTURE.md).
import * as THREE from 'three';
import { BOARD_SIZE } from '../shared/rules.js';

// Regeln liegen im Shared-Bereich (auch vom Server genutzt) und werden hier unverändert weitergereicht.
export { BOARD_SIZE, FLEET, RULES } from '../shared/rules.js';

/** Kantenlänge einer Spielfeldzelle in Welteinheiten. */
export const CELL = 2;
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
