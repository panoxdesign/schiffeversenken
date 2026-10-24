// Welt: Himmel, Ozean, Licht, Inseln, Treibgut, Möwen, Stimmungen (Modul A).
import * as THREE from 'three';
import { getWaveHeight } from './waves.js';
import { Sky, createSkyUniforms } from './Sky.js';
import { Ocean } from './Ocean.js';
import { Islands } from './Islands.js';
import { Props } from './Props.js';
import { ISLANDS } from './layout.js';
import { bus } from '../core/EventBus.js';

const C = (h) => new THREE.Color(h);

/** Stimmungs-Presets (sRGB-Hex). Zahlen werden weich überblendet. */
const MOODS = {
  menu: {
    horizon: '#ff9a58', mid: '#c98aa2', zenith: '#1f3f85', sun: '#ffc884',
    hemiSky: '#9db4e0', hemiGround: '#2a4a50', deep: '#0a4766', shallow: '#20a6a8', sss: '#25c9a0', sea: '#0b2e3a',
    sunI: 3.2, hemiI: 1.0, exposure: 1.0, envI: 0.9, cloudDark: 1.0, cloudCover: 0.5, fogNear: 150, fogFar: 780,
    sunAz: 14, sunEl: 21,
  },
  battle: {
    horizon: '#ff7a45', mid: '#b9607f', zenith: '#1d2f6a', sun: '#ffae62',
    hemiSky: '#8d9cc8', hemiGround: '#2a3f46', deep: '#08455f', shallow: '#1a9096', sss: '#2fd0a8', sea: '#09262f',
    sunI: 3.0, hemiI: 0.92, exposure: 0.98, envI: 0.85, cloudDark: 0.85, cloudCover: 0.62, fogNear: 140, fogFar: 700,
    sunAz: 24, sunEl: 15,
  },
  victory: {
    horizon: '#ffb04e', mid: '#f08e7c', zenith: '#335fb0', sun: '#ffd28c',
    hemiSky: '#b4c6ee', hemiGround: '#3a5a58', deep: '#052838', shallow: '#1ca39a', sss: '#40e0b0', sea: '#103a48',
    sunI: 3.5, hemiI: 1.05, exposure: 1.0, envI: 0.95, cloudDark: 0.9, cloudCover: 0.4, fogNear: 170, fogFar: 840,
    sunAz: 8, sunEl: 25,
  },
  defeat: {
    horizon: '#c24a30', mid: '#6c3548', zenith: '#161c3a', sun: '#e86a40',
    hemiSky: '#7a6470', hemiGround: '#2a2a2e', deep: '#0b2f3c', shallow: '#206468', sss: '#2a8a78', sea: '#101c22',
    sunI: 1.8, hemiI: 0.7, exposure: 0.88, envI: 0.6, cloudDark: 0.55, cloudCover: 0.8, fogNear: 100, fogFar: 520,
    sunAz: 30, sunEl: 7,
  },
};

const COLOR_KEYS = ['horizon', 'mid', 'zenith', 'sun', 'hemiSky', 'hemiGround', 'deep', 'shallow', 'sss', 'sea'];
const NUM_KEYS = ['sunI', 'hemiI', 'exposure', 'envI', 'cloudDark', 'cloudCover', 'fogNear', 'fogFar', 'sunAz', 'sunEl'];

/** Nähert three.js' ACES+sRGB für eine Farbe an → Nebelfarbe, die zum getonemappten Himmel passt. */
function aceSrgb(c, exposure, out) {
  const e = exposure / 0.6;
  const r0 = c.r * e, g0 = c.g * e, b0 = c.b * e;
  let r = 0.59719 * r0 + 0.35458 * g0 + 0.04823 * b0;
  let g = 0.076 * r0 + 0.90834 * g0 + 0.01566 * b0;
  let b = 0.0284 * r0 + 0.13383 * g0 + 0.83777 * b0;
  const fit = (v) => { const a = v * (v + 0.0245786) - 0.000090537; const d = v * (0.983729 * v + 0.432951) + 0.238081; return a / d; };
  r = fit(r); g = fit(g); b = fit(b);
  const R = 1.60475 * r - 0.53108 * g - 0.07367 * b;
  const G = -0.10208 * r + 1.10813 * g - 0.00605 * b;
  const B = -0.00327 * r - 0.07276 * g + 1.07602 * b;
  const enc = (v) => { v = Math.min(1, Math.max(0, v)); return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };
  return out.setRGB(enc(R), enc(G), enc(B), THREE.LinearSRGBColorSpace);
}

export class World {
  /** @param {import('../core/Engine.js').Engine} engine */
  constructor(engine) {
    this.engine = engine;
    const scene = engine.scene;

    this.sunDirection = new THREE.Vector3(0, 0.3, -1).normalize();
    this.sunColor = new THREE.Color();
    this.skyUniforms = createSkyUniforms(this.sunDirection, this.sunColor);
    const U = this.skyUniforms;

    // Stimmung: aktuelle Werte (Farben sind direkt die Shader-Uniforms) + Ziel
    this._cur = {
      horizon: U.uHorizon.value, mid: U.uMid.value, zenith: U.uZenith.value, sun: this.sunColor, sea: U.uSea.value,
      hemiSky: new THREE.Color(), hemiGround: new THREE.Color(),
      deep: new THREE.Color(), shallow: new THREE.Color(), sss: new THREE.Color(),
    };
    for (const k of NUM_KEYS) this._cur[k] = MOODS.menu[k];
    this._tgt = {};
    this._moods = {};
    for (const name of Object.keys(MOODS)) {
      const m = {};
      for (const k of COLOR_KEYS) m[k] = C(MOODS[name][k]);
      for (const k of NUM_KEYS) m[k] = MOODS[name][k];
      this._moods[name] = m;
    }
    for (const k of COLOR_KEYS) { this._cur[k].copy(this._moods.menu[k]); }
    this._tgt = this._moods.menu;
    this.mood = 'menu';
    this._fogTmp = new THREE.Color();

    // Licht (keine Schatten)
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = false;
    scene.add(this.hemi, this.sun, this.sun.target);

    scene.fog = new THREE.Fog(0xffffff, 150, 780);

    // Himmel + Umgebung
    this._applyMood(0, true);
    this.sky = new Sky(engine, U);
    scene.add(this.sky.mesh);
    scene.background = null;
    scene.environment = this.sky.buildEnvironment(engine.renderer);
    scene.environmentIntensity = this._cur.envI;

    // Ozean (braucht Inselpositionen für Flachwasser)
    const approx = ISLANDS.map((d) => ({ x: d.x, z: d.z, radius: d.radius * 0.78 }));
    this.ocean = new Ocean(engine, U, approx);
    this.islands = new Islands(engine, { detailTex: this.ocean.detailTex, timeUniform: U.uTime });
    this.props = new Props(engine, U);

    // Ozean-Farben gehören zur Stimmung
    const ou = this.ocean.uniforms;
    this._cur.deep = ou.uDeep.value.copy(this._moods.menu.deep);
    this._cur.shallow = ou.uShallow.value.copy(this._moods.menu.shallow);
    this._cur.sss = ou.uSSS.value.copy(this._moods.menu.sss);

    this._offQ = bus.on('quality', (q) => this.sky.setQuality(q));
    this._offU = engine.onUpdate((dt, time) => {
      U.uTime.value = time;
      this._stepMood(dt);
    }, 0);
    this._applyMood(0, true);
  }

  /** Wellenhöhe an (x,z) – identisch zur GPU-Version. */
  getWaterHeight(x, z) { return getWaveHeight(x, z, this.engine.time); }

  /** 'menu' | 'battle' | 'victory' | 'defeat' – weicher Übergang (≈2 s). */
  setMood(name, instant = false) {
    const m = this._moods[name];
    if (!m) return;
    this.mood = name;
    this._tgt = m;
    if (instant) {
      for (const k of COLOR_KEYS) this._cur[k].copy(m[k]);
      for (const k of NUM_KEYS) this._cur[k] = m[k];
      this._applyMood(0, true);
    }
  }

  _stepMood(dt) {
    const k = 1 - Math.exp(-dt * 1.4);
    const cur = this._cur, tgt = this._tgt;
    for (let i = 0; i < COLOR_KEYS.length; i++) { const key = COLOR_KEYS[i]; cur[key].lerp(tgt[key], k); }
    for (let i = 0; i < NUM_KEYS.length; i++) { const key = NUM_KEYS[i]; cur[key] += (tgt[key] - cur[key]) * k; }
    this._applyMood();
  }

  _applyMood() {
    const c = this._cur;
    const az = THREE.MathUtils.degToRad(c.sunAz), el = THREE.MathUtils.degToRad(c.sunEl);
    const ce = Math.cos(el);
    this.sunDirection.set(Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce);
    this.sun.position.copy(this.sunDirection).multiplyScalar(100);
    this.sun.color.copy(c.sun);
    this.sun.intensity = c.sunI;
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = c.hemiI;
    const u = this.skyUniforms;
    u.uCloudDark.value = c.cloudDark;
    u.uCloudCover.value = c.cloudCover;
    const scene = this.engine.scene;
    this.engine.renderer.toneMappingExposure = c.exposure;
    scene.environmentIntensity = c.envI;
    if (scene.fog) {
      scene.fog.near = c.fogNear;
      scene.fog.far = c.fogFar;
      this._fogTmp.copy(c.horizon).multiplyScalar(0.95);
      aceSrgb(this._fogTmp, c.exposure, scene.fog.color);
    }
  }
}
