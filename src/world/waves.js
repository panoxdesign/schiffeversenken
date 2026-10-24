// Gemeinsame Wellenfunktion (Gerstner) – EINZIGE Quelle der Wahrheit.
// JS-Version (CPU, für Schiffsbewegung) und GLSL-Version (GPU, für Ozean/Gitter)
// liefern identische Ergebnisse.

/** Wellenparameter: Richtung (normiert), Wellenlänge, Steilheit (0..1), Amplitude, Geschwindigkeitsfaktor */
export const WAVES = [
  { dir: [0.8, 0.6], wavelength: 34, steepness: 0.22, amplitude: 0.34, speed: 1.0 },
  { dir: [-0.35, 0.94], wavelength: 19, steepness: 0.2, amplitude: 0.18, speed: 1.0 },
  { dir: [0.97, -0.24], wavelength: 11, steepness: 0.18, amplitude: 0.09, speed: 1.0 },
  { dir: [-0.7, -0.71], wavelength: 6.5, steepness: 0.15, amplitude: 0.045, speed: 1.0 },
];

const G = 9.81;
const prepared = WAVES.map((w) => {
  const len = Math.hypot(w.dir[0], w.dir[1]);
  const k = (2 * Math.PI) / w.wavelength;
  return {
    dx: w.dir[0] / len,
    dz: w.dir[1] / len,
    k,
    a: w.amplitude,
    q: w.steepness,
    c: Math.sqrt(G / k) * w.speed,
  };
});

/**
 * Wellenhöhe (y) an Weltposition (x,z) zur Zeit t (Sekunden).
 * Horizontale Gerstner-Verschiebung wird für die Höhe vernachlässigt (kleine Steilheit).
 */
export function getWaveHeight(x, z, t) {
  let y = 0;
  for (let i = 0; i < prepared.length; i++) {
    const w = prepared[i];
    const f = w.k * (w.dx * x + w.dz * z - w.c * t);
    y += w.a * Math.sin(f);
  }
  return y;
}

/**
 * Normale der Wasseroberfläche an (x,z) → schreibt in target (THREE.Vector3 oder {x,y,z}).
 */
export function getWaveNormal(x, z, t, target) {
  let nx = 0;
  let nz = 0;
  let ny = 1;
  for (let i = 0; i < prepared.length; i++) {
    const w = prepared[i];
    const f = w.k * (w.dx * x + w.dz * z - w.c * t);
    const wa = w.k * w.a;
    const c = Math.cos(f);
    nx -= w.dx * wa * c;
    nz -= w.dz * wa * c;
    ny -= w.q * wa * Math.sin(f);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  target.x = nx / l;
  target.y = ny / l;
  target.z = nz / l;
  return target;
}

const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/**
 * GLSL-Chunk. Stellt bereit:
 *   vec3 gerstnerDisplace(vec2 xz, float t, out vec3 normal)
 *     → Verschiebung (dx, y, dz) relativ zur Ruheposition (xz, 0)
 *   float gerstnerHeight(vec2 xz, float t)
 */
export const WAVES_GLSL = /* glsl */ `
const int WAVE_COUNT = ${prepared.length};
const vec4 WAVE_DIR_K[WAVE_COUNT] = vec4[WAVE_COUNT](
${prepared.map((w) => `  vec4(${f(w.dx)}, ${f(w.dz)}, ${f(w.k)}, ${f(w.c)})`).join(',\n')}
);
const vec2 WAVE_AQ[WAVE_COUNT] = vec2[WAVE_COUNT](
${prepared.map((w) => `  vec2(${f(w.a)}, ${f(w.q)})`).join(',\n')}
);

vec3 gerstnerDisplace(vec2 xz, float t, out vec3 normal) {
  vec3 disp = vec3(0.0);
  vec3 n = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < WAVE_COUNT; i++) {
    vec4 dk = WAVE_DIR_K[i];
    vec2 aq = WAVE_AQ[i];
    float f = dk.z * (dot(dk.xy, xz) - dk.w * t);
    float s = sin(f);
    float c = cos(f);
    disp.x += aq.y * aq.x * dk.x * c;
    disp.z += aq.y * aq.x * dk.y * c;
    disp.y += aq.x * s;
    float wa = dk.z * aq.x;
    n.x -= dk.x * wa * c;
    n.z -= dk.y * wa * c;
    n.y -= aq.y * wa * s;
  }
  normal = normalize(n);
  return disp;
}

float gerstnerHeight(vec2 xz, float t) {
  float y = 0.0;
  for (int i = 0; i < WAVE_COUNT; i++) {
    vec4 dk = WAVE_DIR_K[i];
    y += WAVE_AQ[i].x * sin(dk.z * (dot(dk.xy, xz) - dk.w * t));
  }
  return y;
}
`;
