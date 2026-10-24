// GPU-Partikelsystem: instanzierte Quads, Bewegung komplett im Vertex-Shader.
// Pro Partikel: Startwerte + Geburtszeit als Attribute, Farbe/Alpha über Lebenszeit aus einer Ramp-LUT.
import * as THREE from 'three';
import { WAVES_GLSL } from '../world/waves.js';
import { valueNoise2D } from '../core/noise.js';

/** Zeilen der Farb-Ramp-Textur. */
export const RAMP = {
  FIRE: 0, FIREBALL: 1, SMOKE_DARK: 2, SMOKE_WHITE: 3, SPARK: 4, WATER: 5, MIST: 6, GLOW: 7,
  EMBER: 8, BUBBLE: 9, FOAM: 10, SMOKE_TRAIL: 11, SHOCK: 12, FOAM2: 13, GOLD_GLINT: 14,
  FW0: 16, // 16..23: Feuerwerksfarben (rot, gold, grün, blau, magenta, weiß, cyan, orange)
};
export const FW_COLORS = 8;
const ROWS = 24;
const RAMP_W = 64;

/** Sprite-Formen (Fragment-Shader). */
export const SHAPE = { PUFF: 0, GLOW: 1, STREAK: 2, RING: 3, DROP: 4, BUBBLE: 5 };

const KEYS = {
  [RAMP.FIRE]: [[0, 1, 0.8, 0.35, 0], [0.07, 1, 0.7, 0.25, 0.95], [0.3, 1, 0.45, 0.1, 0.85], [0.65, 0.75, 0.16, 0.04, 0.5], [1, 0.2, 0.03, 0.01, 0]],
  [RAMP.FIREBALL]: [[0, 1, 0.8, 0.3, 0], [0.06, 1, 0.75, 0.25, 1], [0.25, 0.95, 0.38, 0.07, 0.95], [0.5, 0.35, 0.09, 0.03, 0.85], [0.75, 0.05, 0.045, 0.04, 0.55], [1, 0.03, 0.03, 0.03, 0]],
  [RAMP.SMOKE_DARK]: [[0, 0.1, 0.085, 0.07, 0], [0.08, 0.12, 0.1, 0.085, 0.7], [0.45, 0.085, 0.078, 0.07, 0.5], [1, 0.05, 0.05, 0.05, 0]],
  [RAMP.SMOKE_WHITE]: [[0, 0.95, 0.9, 0.82, 0], [0.06, 0.98, 0.94, 0.86, 0.92], [0.5, 0.78, 0.76, 0.72, 0.6], [1, 0.62, 0.62, 0.62, 0]],
  [RAMP.SPARK]: [[0, 1, 0.95, 0.7, 1], [0.35, 1, 0.58, 0.18, 1], [0.8, 0.8, 0.2, 0.03, 0.6], [1, 0.4, 0.05, 0, 0]],
  [RAMP.WATER]: [[0, 0.8, 0.95, 1, 0], [0.06, 0.9, 1, 1, 0.9], [0.6, 0.65, 0.88, 0.95, 0.7], [1, 0.55, 0.8, 0.9, 0]],
  [RAMP.MIST]: [[0, 0.92, 1, 1, 0], [0.12, 0.93, 1, 1, 0.6], [0.6, 0.8, 0.93, 0.95, 0.35], [1, 0.75, 0.9, 0.93, 0]],
  [RAMP.GLOW]: [[0, 1, 1, 0.9, 1], [0.4, 1, 0.72, 0.3, 0.6], [1, 0.5, 0.1, 0, 0]],
  [RAMP.EMBER]: [[0, 1, 0.75, 0.25, 0], [0.08, 1, 0.6, 0.15, 1], [0.7, 0.85, 0.25, 0.05, 0.75], [1, 0.25, 0.02, 0, 0]],
  [RAMP.BUBBLE]: [[0, 0.9, 1, 1, 0], [0.1, 0.95, 1, 1, 0.9], [0.85, 0.9, 1, 1, 0.8], [1, 1, 1, 1, 0]],
  [RAMP.FOAM]: [[0, 0.95, 1, 1, 0], [0.1, 0.95, 1, 1, 0.9], [0.5, 0.88, 0.97, 0.98, 0.55], [1, 0.8, 0.93, 0.95, 0]],
  [RAMP.SMOKE_TRAIL]: [[0, 0.9, 0.88, 0.84, 0], [0.1, 0.88, 0.86, 0.82, 0.4], [0.5, 0.7, 0.7, 0.68, 0.22], [1, 0.6, 0.6, 0.6, 0]],
  [RAMP.SHOCK]: [[0, 1, 0.85, 0.55, 0.9], [0.4, 1, 0.55, 0.2, 0.5], [1, 0.6, 0.15, 0.05, 0]],
  [RAMP.FOAM2]: [[0, 0.95, 1, 1, 0], [0.12, 0.96, 1, 1, 0.85], [0.7, 0.88, 0.96, 0.97, 0.6], [1, 0.8, 0.92, 0.95, 0]],
  [RAMP.GOLD_GLINT]: [[0, 1, 0.95, 0.6, 0], [0.2, 1, 0.9, 0.45, 1], [1, 1, 0.6, 0.1, 0]],
};
// Feuerwerksfarben: weißglühend → Farbe → dunkel
const FW = [[1, 0.05, 0.04], [1, 0.62, 0.05], [0.1, 0.9, 0.15], [0.08, 0.35, 1], [0.95, 0.1, 0.8], [1, 1, 1], [0.05, 0.85, 0.95], [1, 0.33, 0.02]];
FW.forEach((c, i) => {
  KEYS[RAMP.FW0 + i] = [[0, 1, 1, 0.92, 1], [0.1, c[0], c[1], c[2], 1], [0.6, c[0] * 0.9, c[1] * 0.9, c[2] * 0.9, 0.95], [1, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0]];
});

let shared = null;
function getShared() {
  if (shared) return shared;
  // Ramp-LUT
  const data = new Uint8Array(RAMP_W * ROWS * 4);
  for (let row = 0; row < ROWS; row++) {
    const k = KEYS[row];
    for (let x = 0; x < RAMP_W; x++) {
      const t = x / (RAMP_W - 1);
      let c = [0, 0, 0, 0];
      if (k) {
        let i = 0;
        while (i < k.length - 2 && t > k[i + 1][0]) i++;
        const a = k[i], b = k[i + 1];
        const u = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0] || 1)));
        const s = u * u * (3 - 2 * u);
        c = [0, 1, 2, 3].map((j) => a[j + 1] + (b[j + 1] - a[j + 1]) * s);
      }
      const o = (row * RAMP_W + x) * 4;
      for (let j = 0; j < 4; j++) data[o + j] = Math.round(Math.min(1, Math.max(0, c[j])) * 255);
    }
  }
  const ramp = new THREE.DataTexture(data, RAMP_W, ROWS, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.LinearFilter;
  ramp.wrapS = ramp.wrapT = THREE.ClampToEdgeWrapping;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;

  // Kachelbares Rauschen (R, G unabhängig)
  const N = 128;
  const nd = new Uint8Array(N * N * 4);
  const fbmP = (x, y, seed) => {
    let amp = 0.5, f = 1, s = 0, nrm = 0;
    for (let o = 0; o < 5; o++) {
      s += amp * valueNoise2D(x * f, y * f, seed + o * 13, 6 * f, 6 * f);
      nrm += amp; amp *= 0.5; f *= 2;
    }
    return s / nrm;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x / N) * 6, v = (y / N) * 6;
      const o = (y * N + x) * 4;
      const a = fbmP(u, v, 3), b = fbmP(u, v, 71);
      // Kontrast anheben
      nd[o] = Math.round(Math.min(1, Math.max(0, (a - 0.5) * 1.6 + 0.5)) * 255);
      nd[o + 1] = Math.round(Math.min(1, Math.max(0, (b - 0.5) * 1.6 + 0.5)) * 255);
      nd[o + 2] = 0; nd[o + 3] = 255;
    }
  }
  const noise = new THREE.DataTexture(nd, N, N, THREE.RGBAFormat);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
  noise.minFilter = THREE.LinearMipmapLinearFilter;
  noise.magFilter = THREE.LinearFilter;
  noise.generateMipmaps = true;
  noise.needsUpdate = true;
  shared = { ramp, noise };
  return shared;
}

const VERT = /* glsl */ `
precision highp float;
attribute vec4 aA; // pos.xyz, birth
attribute vec4 aB; // vel.xyz, life
attribute vec4 aC; // size0, size1, rot0, rotSpeed
attribute vec4 aD; // ramp, gravity, drag, turbulence
attribute vec4 aE; // wind, flat, shape, bright
uniform float uTime;
uniform vec3 uWind;
uniform float uStretch;
varying vec2 vUv;
varying vec4 vInfo;
varying float vSeed;
${WAVES_GLSL}
float h11(float n) { return fract(sin(n * 91.345) * 47453.5453); }
void main() {
  float age = uTime - aA.w;
  float life = aB.w;
  vUv = position.xy;
  if (age < 0.0 || age >= life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vInfo = vec4(0.0); vSeed = 0.0; return; }
  float t = age / life;
  float id = float(gl_InstanceID);
  float s1 = h11(id), s2 = h11(id + 17.3), s3 = h11(id + 41.7);
  float drag = aD.z;
  float k = drag > 0.001 ? (1.0 - exp(-drag * age)) / drag : age;
  vec3 p = aA.xyz + aB.xyz * k + vec3(0.0, aD.y * 0.5 * age * age, 0.0) + uWind * (aE.x * 0.5 * age * age);
  if (aD.w > 0.0) {
    float amp = aD.w * sqrt(age);
    p += amp * vec3(sin(age * 1.9 + s1 * 40.0), 0.6 * sin(age * 1.4 + s2 * 30.0), cos(age * 1.7 + s3 * 50.0));
  }
  float ease = 1.0 - (1.0 - t) * (1.0 - t);
  float size = mix(aC.x, aC.y, ease);
  float rot = aC.z + aC.w * age;
  float cr = cos(rot), sr = sin(rot);
  vec2 c = position.xy;
  vInfo = vec4(t, aD.x, aE.z, aE.w);
  vSeed = s1;
  if (aE.y > 0.5) {
    vec2 q = vec2(c.x * cr - c.y * sr, c.x * sr + c.y * cr) * size;
    vec3 wp = p + vec3(q.x, 0.0, q.y);
    wp.y += gerstnerHeight(wp.xz, uTime) + 0.16;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  } else {
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vec2 q;
    if (aE.z > 1.5 && aE.z < 2.5) {
      vec3 cv = aB.xyz * exp(-drag * age) + vec3(0.0, aD.y * age, 0.0) + uWind * aE.x * age;
      vec2 vv = (viewMatrix * vec4(cv, 0.0)).xy;
      float sp = length(vv);
      vec2 dir = sp > 1e-3 ? vv / sp : vec2(1.0, 0.0);
      float len = size + sp * uStretch;
      q = dir * (c.x * len) + vec2(-dir.y, dir.x) * (c.y * size);
    } else {
      q = vec2(c.x * cr - c.y * sr, c.x * sr + c.y * cr) * size;
    }
    mv.xy += q;
    gl_Position = projectionMatrix * mv;
  }
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uRamp;
uniform sampler2D uNoise;
varying vec2 vUv;
varying vec4 vInfo;
varying float vSeed;
void main() {
  float t = vInfo.x;
  float shape = vInfo.z;
  vec2 uv = vUv;
  float r = length(uv);
  float a = 0.0;
  float shade = 1.0;
  if (shape < 0.5) {
    if (r > 1.0) discard;
    vec2 nuv = uv * 0.42 + vSeed * vec2(7.3, 3.1);
    float n = texture2D(uNoise, nuv).r;
    float n2 = texture2D(uNoise, nuv * 2.7 + 0.37).g;
    float dens = (1.0 - r) * 1.55 + (n - 0.5) * 1.0 + (n2 - 0.5) * 0.45 - t * 0.3;
    a = smoothstep(0.0, 0.6, dens) * smoothstep(1.0, 0.7, r);
    // Pseudo-Volumen: Selbstverschattung aus verschobenem Rauschen (Licht von links oben)
    float nl = texture2D(uNoise, nuv + vec2(-0.04, 0.05)).r;
    shade = clamp(0.8 + (n - nl) * 2.4 + (1.0 - r) * 0.12, 0.45, 1.15);
  } else if (shape < 1.5) {
    if (r > 1.0) discard;
    a = exp(-r * r * 3.2) * smoothstep(1.0, 0.75, r);
    a = min(1.0, a + exp(-r * r * 14.0) * 0.6);
  } else if (shape < 2.5) {
    float ax = abs(uv.x), ay = abs(uv.y);
    a = pow(max(0.0, 1.0 - ax), 1.6) * smoothstep(1.0, 0.0, ay);
    a = a * a * (1.4 - ax * 0.4);
    a = min(1.0, a * 1.4);
  } else if (shape < 3.5) {
    if (r > 1.0) discard;
    vec2 nuv = uv * 0.9 + vSeed * 5.0;
    float n = texture2D(uNoise, nuv).r;
    float n2 = texture2D(uNoise, nuv * 2.1).g;
    float ring = smoothstep(0.5, 0.82, r) * smoothstep(1.0, 0.86, r);
    float inner = (1.0 - r) * 0.4;
    a = (ring * (0.55 + n * 0.9) + inner * n2) * smoothstep(0.35, 0.55, n + 0.25 + ring * 0.3);
    a = min(1.0, a);
  } else if (shape < 4.5) {
    if (r > 1.0) discard;
    a = smoothstep(1.0, 0.55, r);
  } else {
    if (r > 1.0) discard;
    float rim = smoothstep(0.6, 0.9, r) * smoothstep(1.0, 0.93, r);
    float hl = exp(-pow(length(uv - vec2(-0.35, 0.35)) * 3.5, 2.0));
    a = rim * 0.9 + (1.0 - r) * 0.12 + hl * 0.8;
  }
  vec4 col = texture2D(uRamp, vec2(t, (vInfo.y + 0.5) / ${ROWS}.0));
  gl_FragColor = vec4(col.rgb * (vInfo.w * shade), col.a * a);
  if (gl_FragColor.a < 0.004) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const ATTRS = ['aA', 'aB', 'aC', 'aD', 'aE'];

export class ParticlePool {
  /**
   * @param {object} engine
   * @param {{capacity:number, additive:boolean, renderOrder?:number, wind:THREE.Vector3}} opts
   */
  constructor(engine, opts) {
    this.engine = engine;
    this.capacity = opts.capacity;
    this.cursor = 0;
    this.high = 0;
    this._dmin = Infinity;
    this._dmax = -1;
    const n = this.capacity;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.arrays = {};
    this.attrs = {};
    for (const name of ATTRS) {
      const arr = new Float32Array(n * 4);
      this.arrays[name] = arr;
      const at = new THREE.InstancedBufferAttribute(arr, 4);
      at.setUsage(THREE.DynamicDrawUsage);
      this.attrs[name] = at;
      geo.setAttribute(name, at);
    }
    // alles initial „tot"
    const A = this.arrays.aA, B = this.arrays.aB;
    for (let i = 0; i < n; i++) { A[i * 4 + 3] = -1e6; B[i * 4 + 3] = 0.01; }
    geo.instanceCount = 0;
    this.geometry = geo;
    const { ramp, noise } = getShared();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWind: { value: opts.wind },
        uStretch: { value: 0.07 },
        uRamp: { value: ramp },
        uNoise: { value: noise },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.renderOrder || 10;
    engine.scene.add(this.mesh);
  }

  /**
   * Partikel erzeugen. pr = statisches Preset, size = Radius-Faktor, delay = Sekunden bis zum Erscheinen.
   */
  spawn(pr, x, y, z, vx, vy, vz, life, size = 1, delay = 0) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.capacity;
    if (i + 1 > this.high) this.high = i + 1;
    if (i < this._dmin) this._dmin = i;
    if (i > this._dmax) this._dmax = i;
    const o = i * 4;
    const { aA, aB, aC, aD, aE } = this.arrays;
    aA[o] = x; aA[o + 1] = y; aA[o + 2] = z; aA[o + 3] = this.engine.time + delay;
    aB[o] = vx; aB[o + 1] = vy; aB[o + 2] = vz; aB[o + 3] = life;
    aC[o] = pr.s0 * size; aC[o + 1] = pr.s1 * size;
    aC[o + 2] = pr.rotRand === false ? 0 : Math.random() * 6.2832;
    aC[o + 3] = (Math.random() - 0.5) * 2 * pr.rotSpd;
    aD[o] = pr.ramp; aD[o + 1] = pr.grav; aD[o + 2] = pr.drag; aD[o + 3] = pr.turb;
    aE[o] = pr.wind; aE[o + 1] = pr.flat ? 1 : 0; aE[o + 2] = pr.shape; aE[o + 3] = pr.bright;
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
    this.geometry.instanceCount = this.high;
    if (this._dmax < 0) return;
    // Dirty-Bereiche sammeln sich bis zum Upload (three vereinigt sie dort)
    const start = this._dmin * 4;
    const count = (this._dmax - this._dmin + 1) * 4;
    for (const name of ATTRS) {
      const at = this.attrs[name];
      if (at.updateRanges.length > 32) { at.clearUpdateRanges(); at.addUpdateRange(0, at.array.length); } else at.addUpdateRange(start, count);
      at.needsUpdate = true;
    }
    this._dmin = Infinity;
    this._dmax = -1;
  }

  clear() {
    const A = this.arrays.aA;
    for (let i = 0; i < this.capacity; i++) A[i * 4 + 3] = -1e6;
    this._dmin = 0;
    this._dmax = this.capacity - 1;
    this.cursor = 0;
    this.high = 0;
  }
}

/** Preset-Fabrik (statische Objekte, keine Allokation beim Spawnen). */
export function preset(ramp, shape, s0, s1, o = {}) {
  return {
    ramp, shape, s0, s1,
    grav: o.grav || 0, drag: o.drag || 0, turb: o.turb || 0, wind: o.wind || 0,
    rotSpd: o.rotSpd || 0, bright: o.bright === undefined ? 1 : o.bright, flat: !!o.flat,
    rotRand: o.rotRand,
  };
}
