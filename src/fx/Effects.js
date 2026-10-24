// Effekte: Kanonen, Splash, Explosionen, Feuer, Untergang, Feuerwerk.
// Zwei Partikel-Pools (additiv + alpha) + drei Mesh-Pools => 5 Draw-Calls.
import * as THREE from 'three';
import { CELL } from '../config.js';
import { ParticlePool, preset, RAMP, SHAPE, FW_COLORS } from './ParticleSystem.js';
import { BallPool, DebrisPool, CoinPool } from './MeshPools.js';

const R = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const MAX_FIRES = 20;
const MAX_ROCKETS = 12;
const WIND = new THREE.Vector3(0.55, 0, -0.22);

// ---- Presets (statisch, werden nur gelesen) ----
const P = {
  // Mündung
  glow: preset(RAMP.GLOW, SHAPE.GLOW, 0.7, 1, { bright: 2.2, rotSpd: 0 }),
  tongue: preset(RAMP.FIRE, SHAPE.PUFF, 0.6, 1, { drag: 5, bright: 1.8, rotSpd: 4 }),
  gunSmoke: preset(RAMP.SMOKE_WHITE, SHAPE.PUFF, 0.25, 1, { grav: 0.25, drag: 1.8, turb: 0.3, wind: 1, rotSpd: 0.5 }),
  gunSmokeSlow: preset(RAMP.SMOKE_WHITE, SHAPE.PUFF, 0.4, 1, { grav: 0.5, drag: 0.8, turb: 0.35, wind: 1, rotSpd: 0.4 }),
  trail: preset(RAMP.SMOKE_TRAIL, SHAPE.PUFF, 0.5, 1, { drag: 0.5, turb: 0.12, wind: 0.6, rotSpd: 0.6 }),
  spark: preset(RAMP.SPARK, SHAPE.STREAK, 1, 0.55, { grav: -10, drag: 0.5, bright: 2.2 }),
  // Explosion
  fireCore: preset(RAMP.FIRE, SHAPE.PUFF, 0.45, 1, { drag: 2.6, grav: 1.2, rotSpd: 2, bright: 1.05 }),
  fireball: preset(RAMP.FIREBALL, SHAPE.PUFF, 0.5, 1, { drag: 2.4, grav: 1.4, wind: 0.3, rotSpd: 1, turb: 0.15 }),
  smokeDark: preset(RAMP.SMOKE_DARK, SHAPE.PUFF, 0.4, 1, { drag: 1.3, grav: 0.9, turb: 0.3, wind: 1, rotSpd: 0.5 }),
  ember: preset(RAMP.EMBER, SHAPE.GLOW, 1, 0.6, { grav: 0.3, drag: 0.5, turb: 0.5, wind: 1, bright: 1.8 }),
  shock: preset(RAMP.SHOCK, SHAPE.RING, 0.15, 1, { flat: true, bright: 1.2 }),
  // Wasser
  waterStreak: preset(RAMP.WATER, SHAPE.STREAK, 1, 0.7, { grav: -14, drag: 0.15, bright: 1 }),
  waterDrop: preset(RAMP.WATER, SHAPE.DROP, 1, 0.8, { grav: -14, drag: 0.1 }),
  mistCol: preset(RAMP.MIST, SHAPE.PUFF, 0.5, 1, { drag: 0.9, grav: -3, wind: 0.3, rotSpd: 0.6, turb: 0.15 }),
  mistBase: preset(RAMP.MIST, SHAPE.PUFF, 0.5, 1, { drag: 1.5, grav: 0.1, wind: 0.5, rotSpd: 0.5 }),
  foamRing: preset(RAMP.FOAM, SHAPE.RING, 0.1, 1, { flat: true, rotSpd: 0.2 }),
  foamPatch: preset(RAMP.FOAM2, SHAPE.PUFF, 0.7, 1, { flat: true, drag: 0.8, wind: 0.15, rotSpd: 0.15 }),
  bubble: preset(RAMP.BUBBLE, SHAPE.BUBBLE, 1, 1, { grav: -6, drag: 0.1, rotRand: false }),
  // Feuer
  flame: preset(RAMP.FIRE, SHAPE.PUFF, 0.65, 0.18, { grav: 1.6, drag: 0.5, turb: 0.1, wind: 0.6, rotSpd: 1.6, bright: 0.22 }),
  flameCore: preset(RAMP.FIRE, SHAPE.PUFF, 0.7, 0.25, { grav: 1.2, drag: 0.3, bright: 0.2, rotSpd: 2 }),
  fireSmoke: preset(RAMP.SMOKE_DARK, SHAPE.PUFF, 0.3, 1, { grav: 0.35, drag: 0.35, turb: 0.25, wind: 1, rotSpd: 0.4 }),
  // Feuerwerk
  fwFlash: preset(RAMP.GLOW, SHAPE.GLOW, 1, 1.3, { bright: 1.0 }),
  fwTrail: preset(RAMP.SPARK, SHAPE.GLOW, 1, 0.3, { grav: -2.5, drag: 0.6, bright: 1.6 }),
  glint: preset(RAMP.GOLD_GLINT, SHAPE.GLOW, 1, 0.3, { bright: 1.8 }),
};
const FWP = [];
for (let i = 0; i < FW_COLORS; i++) {
  FWP.push({
    streak: preset(RAMP.FW0 + i, SHAPE.STREAK, 1, 0.6, { grav: -3.2, drag: 1.7, bright: 1.0 }),
    willow: preset(RAMP.FW0 + i, SHAPE.STREAK, 0.9, 0.5, { grav: -5, drag: 1.5, bright: 1.0 }),
    dot: preset(RAMP.FW0 + i, SHAPE.GLOW, 1, 0.2, { grav: -3, drag: 1.4, bright: 0.9, turb: 0.1 }),
  });
}

export class Effects {
  constructor(engine, world) {
    this.engine = engine;
    this.world = world;
    const scene = engine.scene;
    this.add = new ParticlePool(engine, { capacity: 4000, additive: true, renderOrder: 21, wind: WIND });
    this.alp = new ParticlePool(engine, { capacity: 4000, additive: false, renderOrder: 20, wind: WIND });
    this.add.material.uniforms.uStretch.value = 0.13;
    this.alp.material.uniforms.uStretch.value = 0.12;
    this.balls = new BallPool(scene, 8);
    this.debris = new DebrisPool(scene, 96);
    this.coins = new CoinPool(scene, 64);

    // EIN dauerhaftes Licht (nur intensity wird animiert -> keine Shader-Neukompilierung)
    this.light = new THREE.PointLight(0xffa050, 0, 50, 2);
    this.light.position.set(0, 5, 0);
    scene.add(this.light);
    this._lightI = 0;

    this._timers = [];
    this._fires = [];
    for (let i = 0; i < MAX_FIRES; i++) {
      this._fires.push({ active: false, token: 0, x: 0, y: 0, z: 0, scale: 1, stopping: false, stopT: 0, born: 0, aF: 0, aC: 0, aS: 0, aE: 0 });
    }
    this._fireToken = 1;
    this._rockets = [];
    for (let i = 0; i < MAX_ROCKETS; i++) this._rockets.push({ active: false, t: 0, ft: 1, sx: 0, sy: 0, sz: 0, tx: 0, ty: 0, tz: 0, color: 0, type: 0, acc: 0, sm: 0 });

    // vorgebundene Callbacks (keine Closures pro Frame)
    this._getWater = (x, z) => this.world.getWaterHeight(x, z);
    this._trailCb = (x, y, z, dt) => {
      const n = dt * 100 * this._ps();
      let k = Math.floor(n);
      if (Math.random() < n - k) k++;
      for (; k > 0; k--) this.alp.spawn(P.trail, x + R(-0.1, 0.1), y + R(-0.1, 0.1), z + R(-0.1, 0.1), R(-0.2, 0.2), R(-0.1, 0.4), R(-0.2, 0.2), R(0.9, 1.5), R(0.4, 0.62));
    };
    this._debrisWaterCb = (x, y, z) => this._miniSplash(x, z, 0.8);
    this._coinWaterCb = (x, y, z) => this._miniSplash(x, z, 0.6);
    this._glintCb = (x, y, z) => this.add.spawn(P.glint, x, y, z, 0, 0, 0, R(0.25, 0.45), R(0.25, 0.45));

    this._offUpdate = engine.onUpdate((dt, time) => this.update(dt, time), 20);
  }

  _ps() { return this.engine.quality.particleScale; }
  /** Partikelanzahl nach Qualität (mindestens 1). */
  _n(n) { return Math.max(1, Math.round(n * this._ps())); }
  /** Größenausgleich bei geringerer Partikelzahl. */
  _sz() { return 1 + (1 - this._ps()) * 0.3; }

  _later(delay, fn) { this._timers.push({ t: this.engine.time + delay, fn }); }

  _flash(x, y, z, intensity, r, g, b) {
    if (intensity >= this._lightI * 0.6) this.light.position.set(x, y, z);
    if (intensity > this._lightI) {
      this._lightI = intensity;
      this.light.color.setRGB(r, g, b);
    }
  }

  // ------------------------------------------------------------------ Kanone
  fireCannon(from, to, opts = {}) {
    const dx = to.x - from.x, dz = to.z - from.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist, nz = dz / dist;
    const ft = opts.flightTime || 1.1 + 0.7 * Math.min(1, Math.max(0, (dist - 12) / 45));
    const H = Math.min(18, Math.max(8, dist * 0.3));
    this._muzzle(from.x, from.y, from.z, nx, nz);
    return new Promise((resolve) => {
      this.balls.launch(from.x, from.y, from.z, to.x, to.y, to.z, ft, H, resolve);
    });
  }

  _muzzle(x, y, z, nx, nz) {
    const add = this.add, alp = this.alp, s = this._sz();
    const mx = x + nx * 0.5, mz = z + nz * 0.5;
    add.spawn(P.glow, mx, y, mz, nx * 2, 0.3, nz * 2, 0.13, 1.6);
    add.spawn(P.glow, mx + nx * 1.2, y, mz + nz * 1.2, nx * 3, 0.3, nz * 3, 0.22, 3.2);
    for (let i = 0; i < 5; i++) {
      const sp = R(9, 16);
      add.spawn(P.tongue, mx, y, mz, nx * sp + R(-1.2, 1.2), R(-0.3, 1.2), nz * sp + R(-1.2, 1.2), R(0.15, 0.28), R(0.5, 0.85));
    }
    for (let i = this._n(10); i > 0; i--) {
      const sp = R(6, 18);
      add.spawn(P.spark, mx, y, mz, nx * sp + R(-3, 3), R(-1, 4), nz * sp + R(-3, 3), R(0.3, 0.7), R(0.08, 0.14));
    }
    for (let i = this._n(18); i > 0; i--) {
      const sp = R(2.5, 9);
      alp.spawn(P.gunSmoke, mx + nx * R(0, 1), y + R(-0.1, 0.3), mz + nz * R(0, 1), nx * sp + R(-2.6, 2.6), R(0.1, 2.4), nz * sp + R(-2.6, 2.6), R(2.4, 4.6), R(1.3, 2.9) * s, R(0, 0.06));
    }
    for (let i = this._n(8); i > 0; i--) {
      alp.spawn(P.gunSmokeSlow, mx, y, mz, nx * R(0.5, 2.5) + R(-0.6, 0.6), R(0.4, 1.2), nz * R(0.5, 2.5) + R(-0.6, 0.6), R(3, 4.8), R(1, 1.9) * s);
    }
    this._flash(mx, y + 0.5, mz, 450, 1, 0.62, 0.28);
  }

  // ------------------------------------------------------------------ Splash
  splash(pos, scale = 1) {
    const add = this.add, alp = this.alp, s = this._sz();
    const x = pos.x, z = pos.z;
    const y = this.world.getWaterHeight(x, z);
    // Wasserstrahlen
    for (let i = this._n(36); i > 0; i--) {
      const vy = R(8, 14) * scale, a = R(0, TAU), sp = R(0.2, 2.8) * scale;
      alp.spawn(P.waterStreak, x + Math.cos(a) * 0.2, y, z + Math.sin(a) * 0.2, Math.cos(a) * sp, vy, Math.sin(a) * sp, (2 * vy / 14) * 0.97, R(0.1, 0.17), R(0, 0.08));
    }
    // Wassersäule aus Gischt
    for (let i = this._n(18); i > 0; i--) {
      const vy = R(5, 10.5) * scale, a = R(0, TAU), sp = R(0.2, 1.7) * (1.25 - (vy / scale - 5) / 5.5 * 0.9);
      alp.spawn(P.mistCol, x, y + 0.1, z, Math.cos(a) * sp, vy, Math.sin(a) * sp, R(1, 1.7), R(0.9, 1.6) * scale * s, R(0, 0.1));
    }
    // Gischtnebel am Fuß
    for (let i = this._n(10); i > 0; i--) {
      const a = R(0, TAU), sp = R(1.5, 4.5) * scale;
      alp.spawn(P.mistBase, x, y + 0.2, z, Math.cos(a) * sp, R(0.3, 1.8), Math.sin(a) * sp, R(1.3, 2.3), R(1.2, 2.1) * scale * s, R(0.04, 0.35));
    }
    // Ringe und Schaum
    alp.spawn(P.foamRing, x, 0, z, 0, 0, 0, 1.6, 5.8 * scale);
    alp.spawn(P.foamRing, x, 0, z, 0, 0, 0, 1.25, 3.6 * scale, 0.14);
    for (let i = this._n(7); i > 0; i--) {
      const a = R(0, TAU), r = R(0.3, 2.4) * scale;
      alp.spawn(P.foamPatch, x + Math.cos(a) * r, 0, z + Math.sin(a) * r, Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, R(2.2, 3.6), R(0.9, 1.7) * scale, R(0.1, 0.45));
    }
    // Nachfallende Tropfen
    for (let i = this._n(10); i > 0; i--) {
      const vy = R(3, 6.5) * scale, a = R(0, TAU), sp = R(0.5, 3) * scale;
      alp.spawn(P.waterDrop, x, y + 0.3, z, Math.cos(a) * sp, vy, Math.sin(a) * sp, (2 * vy / 14) * 0.95, R(0.07, 0.13), R(0.25, 0.6));
    }
  }

  _miniSplash(x, z, k) {
    const y = this.world.getWaterHeight(x, z);
    this.alp.spawn(P.foamRing, x, 0, z, 0, 0, 0, 0.8, 1.5 * k);
    for (let i = this._n(4); i > 0; i--) {
      const vy = R(2.5, 4.5), a = R(0, TAU), sp = R(0.3, 1.2);
      this.alp.spawn(P.waterDrop, x, y + 0.1, z, Math.cos(a) * sp, vy, Math.sin(a) * sp, (2 * vy / 14) * 0.95, R(0.06, 0.1) * k);
    }
    this.alp.spawn(P.mistCol, x, y + 0.1, z, 0, R(1.5, 3), 0, R(0.6, 1), R(0.4, 0.7) * k);
  }

  // --------------------------------------------------------------- Explosion
  explosion(pos, scale = 1) {
    const add = this.add, alp = this.alp, S = scale, sz = this._sz();
    const x = pos.x, y = pos.y, z = pos.z;
    const wy = this.world.getWaterHeight(x, z);
    add.spawn(P.glow, x, y + 0.4 * S, z, 0, 0, 0, 0.16, 4.5 * S);
    add.spawn(P.glow, x, y + 0.4 * S, z, 0, 0, 0, 0.35, 3.2 * S);
    // Feuerball: additiver Kern + Alpha-Hülle (gelb -> orange -> rot -> schwarz)
    for (let i = this._n(11); i > 0; i--) {
      const sp = R(1.5, 5) * S, a = R(0, TAU), e = R(-0.3, 1.0);
      const c = Math.sqrt(1 - e * e);
      add.spawn(P.fireCore, x + R(-0.4, 0.4) * S, y + R(0, 0.5) * S, z + R(-0.4, 0.4) * S, Math.cos(a) * c * sp, e * sp + 1, Math.sin(a) * c * sp, R(0.5, 0.95), R(1.4, 2.4) * S * sz);
    }
    for (let i = this._n(14); i > 0; i--) {
      const sp = R(1.5, 5.5) * S, a = R(0, TAU), e = R(-0.2, 1.0);
      const c = Math.sqrt(1 - e * e);
      alp.spawn(P.fireball, x + R(-0.5, 0.5) * S, y + R(0, 0.6) * S, z + R(-0.5, 0.5) * S, Math.cos(a) * c * sp, e * sp + 1.2, Math.sin(a) * c * sp, R(0.9, 1.5), R(1.6, 2.7) * S * sz, R(0, 0.05));
    }
    // Funken
    for (let i = this._n(46); i > 0; i--) {
      const sp = R(5, 17) * S, a = R(0, TAU), e = R(-0.1, 1);
      const c = Math.sqrt(1 - e * e);
      add.spawn(P.spark, x, y + 0.3, z, Math.cos(a) * c * sp, e * sp * 0.9 + 2, Math.sin(a) * c * sp, R(0.6, 1.5), R(0.07, 0.13) * Math.sqrt(S));
    }
    // Glut
    for (let i = this._n(16); i > 0; i--) {
      const sp = R(1, 5) * S, a = R(0, TAU);
      add.spawn(P.ember, x, y + 0.4, z, Math.cos(a) * sp, R(2, 6) * S, Math.sin(a) * sp, R(1.4, 2.8), R(0.1, 0.2));
    }
    // Rauchpilz: Stiel + Schirm
    for (let i = this._n(9); i > 0; i--) {
      alp.spawn(P.smokeDark, x + R(-0.4, 0.4), y + 0.3, z + R(-0.4, 0.4), R(-0.4, 0.4), R(5, 8.5) * S, R(-0.4, 0.4), R(3.4, 5), R(1.3, 2.1) * S * sz, R(0.05, 0.7));
    }
    for (let i = this._n(14); i > 0; i--) {
      const a = R(0, TAU), sp = R(1.6, 4.2) * S;
      alp.spawn(P.smokeDark, x, y + 1, z, Math.cos(a) * sp, R(6.5, 9) * S, Math.sin(a) * sp, R(4, 6), R(2, 3.2) * S * sz, R(0.3, 0.9));
    }
    // Splitter
    const nd = Math.round(8 + 6 * Math.sqrt(S));
    for (let i = 0; i < nd; i++) {
      const a = R(0, TAU), sp = R(2, 6.5) * Math.sqrt(S);
      this.debris.spawn(x, y + 0.3, z, Math.cos(a) * sp, R(5, 10.5) * Math.sqrt(S), Math.sin(a) * sp, R(2.5, 4), 0.9 * Math.sqrt(S));
    }
    // Druckwelle auf dem Wasser
    add.spawn(P.shock, x, 0, z, 0, 0, 0, 0.55, 6.5 * S);
    alp.spawn(P.foamRing, x, 0, z, 0, 0, 0, 1.3, 4.5 * S, 0.08);
    this._flash(x, y + 1.5, z, 800 * Math.min(2, S), 1, 0.55, 0.2);
  }

  // ------------------------------------------------------------------- Feuer
  startFire(pos, scale = 1) {
    let rec = null;
    for (let i = 0; i < MAX_FIRES; i++) if (!this._fires[i].active) { rec = this._fires[i]; break; }
    if (!rec) { // ältestes Feuer recyceln
      rec = this._fires[0];
      for (let i = 1; i < MAX_FIRES; i++) if (this._fires[i].born < rec.born) rec = this._fires[i];
    }
    const token = this._fireToken++;
    rec.active = true; rec.token = token; rec.x = pos.x; rec.y = pos.y; rec.z = pos.z; rec.scale = scale;
    rec.stopping = false; rec.born = this.engine.time; rec.aF = rec.aC = rec.aS = rec.aE = 0;
    const engine = this.engine;
    return {
      stop() { if (rec.token === token && !rec.stopping) { rec.stopping = true; rec.stopT = engine.time; } },
      setPosition(v) { if (rec.token === token) { rec.x = v.x; rec.y = v.y; rec.z = v.z; } },
    };
  }

  _updateFires(dt, time) {
    const add = this.add, alp = this.alp, ps = this._ps(), sz = this._sz();
    for (let i = 0; i < MAX_FIRES; i++) {
      const f = this._fires[i];
      if (!f.active) continue;
      let k = 1;
      if (f.stopping) {
        k = 1 - (time - f.stopT) / 1.8;
        if (k <= 0) { f.active = false; continue; }
      }
      const S = f.scale;
      const em = dt * ps * k;
      f.aF += em * 16; f.aC += em * 3.5; f.aS += em * 3.6; f.aE += em * 1.6;
      while (f.aF >= 1) {
        f.aF -= 1;
        const a = R(0, TAU), r = Math.random() * 0.4 * S;
        add.spawn(P.flame, f.x + Math.cos(a) * r, f.y + 0.1 * S, f.z + Math.sin(a) * r, R(-0.15, 0.15), R(2.4, 4.0) * S * (0.5 + 0.5 * k), R(-0.2, 0.2), R(0.65, 1.1), R(0.7, 1.05) * S * sz * (0.6 + 0.4 * k));
      }
      while (f.aC >= 1) {
        f.aC -= 1;
        add.spawn(P.flameCore, f.x + R(-0.15, 0.15) * S, f.y + 0.15 * S, f.z + R(-0.15, 0.15) * S, 0, R(1.2, 2.2) * S, 0, R(0.35, 0.55), R(0.45, 0.65) * S * sz);
      }
      while (f.aS >= 1) {
        f.aS -= 1;
        alp.spawn(P.fireSmoke, f.x + R(-0.25, 0.25) * S, f.y + 0.8 * S, f.z + R(-0.25, 0.25) * S, R(-0.2, 0.2), R(1.3, 2.1) * S, R(-0.2, 0.2), R(2.8, 4.2), R(0.55, 0.9) * S * sz * 2.4, 0);
      }
      while (f.aE >= 1) {
        f.aE -= 1;
        add.spawn(P.ember, f.x + R(-0.3, 0.3) * S, f.y + 0.4 * S, f.z + R(-0.3, 0.3) * S, R(-0.6, 0.6), R(1.5, 3.2) * S, R(-0.6, 0.6), R(1.2, 2.2), R(0.05, 0.1) * S);
      }
    }
  }

  // ------------------------------------------------------------------ Untergang
  sinkEffect(pos, length, orientation = 'h') {
    const ax = orientation === 'v' ? 0 : 1, az = 1 - ax;
    const half = (length * CELL) / 2;
    const cx = pos.x, cz = pos.z, alp = this.alp, sz = this._sz();
    const wh = (x, z) => this.world.getWaterHeight(x, z);
    // Schaumteppich
    for (let i = this._n(length * 7); i > 0; i--) {
      const u = R(-half, half), w = R(-1.1, 1.1);
      alp.spawn(P.foamPatch, cx + ax * u + az * w, 0, cz + az * u + ax * w, R(-0.2, 0.2), 0, R(-0.2, 0.2), R(3.5, 6), R(1.1, 1.9) * sz, R(0, 2.4));
    }
    for (let i = 0; i < Math.max(2, length - 1); i++) {
      const u = R(-half * 0.8, half * 0.8);
      alp.spawn(P.foamRing, cx + ax * u, 0, cz + az * u, 0, 0, 0, R(1.6, 2.4), R(3, 4.5), R(0.1, 2.6));
    }
    // Blasen (platzen an der Oberfläche)
    for (let i = this._n(length * 16); i > 0; i--) {
      const u = R(-half, half), w = R(-0.9, 0.9);
      const x = cx + ax * u + az * w, z = cz + az * u + ax * w;
      alp.spawn(P.bubble, x, wh(x, z) + 0.25, z, R(-0.2, 0.2), R(1.2, 2.4), R(-0.2, 0.2), R(0.5, 0.8), R(0.1, 0.22), R(0, 3.3));
    }
    for (let i = this._n(length * 3); i > 0; i--) {
      const u = R(-half, half);
      const x = cx + ax * u, z = cz + az * u;
      alp.spawn(P.mistCol, x, wh(x, z), z, R(-0.3, 0.3), R(1.5, 3), R(-0.3, 0.3), R(1, 1.5), R(0.5, 0.9) * sz, R(0, 3));
    }
    // „Gulp" am Ende
    for (let i = this._n(10); i > 0; i--) {
      const u = R(-half * 0.4, half * 0.4), a = R(0, TAU), sp = R(0.5, 2);
      alp.spawn(P.mistCol, cx + ax * u, wh(cx, cz), cz + az * u, Math.cos(a) * sp, R(3, 7), Math.sin(a) * sp, R(1.1, 1.8), R(1.2, 2) * sz, R(2.5, 3.1));
    }
    // Treibgut
    const nd = 6 + length * 3;
    for (let i = 0; i < nd; i++) {
      const u = R(-half, half), w = R(-0.8, 0.8);
      const x = cx + ax * u + az * w, z = cz + az * u + ax * w;
      const a = R(0, TAU), sp = R(0.5, 2.5);
      const spawn = () => this.debris.spawn(x, wh(x, z) + 0.2, z, Math.cos(a) * sp, R(3, 7), Math.sin(a) * sp, R(7, 11), 1.0);
      if (i < nd / 2) spawn(); else this._later(R(0.3, 3), spawn);
    }
  }

  // ------------------------------------------------------------------ Feier
  celebrate(pos) {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const delay = i * 0.85 + R(0, 0.4);
      this._later(delay, () => {
        const sx = pos.x + R(-9, 9), sz = pos.z + R(-5, 3);
        this._launchRocket(sx, pos.y + 0.5, sz, sx + R(-3, 3), pos.y + R(13, 21), sz + R(-3, 2), i);
      });
    }
    // Münzregen
    const t0 = this.engine.time;
    for (let i = 0; i < 56; i++) this.coins.spawn(pos.x + R(-11, 11), pos.y + R(15, 23), pos.z + R(-7, 5), t0 + R(0.3, 7));
  }

  _launchRocket(sx, sy, sz, tx, ty, tz, idx) {
    let r = null;
    for (let i = 0; i < MAX_ROCKETS; i++) if (!this._rockets[i].active) { r = this._rockets[i]; break; }
    if (!r) return;
    r.active = true; r.t = 0; r.ft = R(1.0, 1.35);
    r.sx = sx; r.sy = sy; r.sz = sz; r.tx = tx; r.ty = ty; r.tz = tz;
    r.color = Math.floor(Math.random() * FW_COLORS);
    r.type = idx % 5 === 3 ? 1 : idx % 4 === 2 ? 2 : 0; // 0 Kugel, 1 Ring, 2 Weide
    r.acc = 0; r.sm = 0;
    this._flash(sx, sy + 1, sz, 120, 1, 0.8, 0.4);
    this.add.spawn(P.glow, sx, sy, sz, 0, 2, 0, 0.3, 1.2);
  }

  _updateRockets(dt) {
    const ps = this._ps();
    for (let i = 0; i < MAX_ROCKETS; i++) {
      const r = this._rockets[i];
      if (!r.active) continue;
      r.t += dt;
      const u = Math.min(1, r.t / r.ft);
      const e = 1 - (1 - u) * (1 - u);
      const x = r.sx + (r.tx - r.sx) * u + Math.sin(r.t * 30) * 0.05;
      const y = r.sy + (r.ty - r.sy) * e;
      const z = r.sz + (r.tz - r.sz) * u;
      r.acc += dt * 70 * ps;
      while (r.acc >= 1) {
        r.acc -= 1;
        this.add.spawn(P.fwTrail, x + R(-0.05, 0.05), y, z + R(-0.05, 0.05), R(-0.4, 0.4), R(-2, -0.5), R(-0.4, 0.4), R(0.4, 0.8), R(0.1, 0.17));
      }
      r.sm += dt * 14 * ps;
      while (r.sm >= 1) { r.sm -= 1; this.alp.spawn(P.trail, x, y, z, R(-0.2, 0.2), R(-0.5, 0.1), R(-0.2, 0.2), R(1.2, 2), R(0.2, 0.35)); }
      if (u >= 1) { r.active = false; this._burst(x, y, z, r.color, r.type); }
    }
  }

  _burst(x, y, z, color, type) {
    const add = this.add, alp = this.alp;
    const c2 = (color + 1 + Math.floor(Math.random() * (FW_COLORS - 1))) % FW_COLORS;
    const A = FWP[color], B = FWP[c2];
    const col = [[1, 0.2, 0.15], [1, 0.75, 0.25], [0.3, 1, 0.35], [0.3, 0.6, 1], [1, 0.3, 0.95], [1, 1, 1], [0.3, 1, 1], [1, 0.55, 0.15]][color];
    add.spawn(P.fwFlash, x, y, z, 0, 0, 0, 0.3, 3.2);
    this._flash(x, y, z, 900, col[0], col[1], col[2]);
    if (type === 0) {
      const V = R(10, 13);
      for (let i = this._n(100); i > 0; i--) {
        const zz = R(-1, 1), a = R(0, TAU), rr = Math.sqrt(1 - zz * zz), sp = V * (0.72 + 0.28 * Math.random());
        const P_ = i % 4 === 0 ? B : A;
        alp.spawn(P_.streak, x, y, z, Math.cos(a) * rr * sp, zz * sp, Math.sin(a) * rr * sp, R(2.0, 2.7), R(0.2, 0.28));
      }
      for (let i = this._n(24); i > 0; i--) {
        const zz = R(-1, 1), a = R(0, TAU), rr = Math.sqrt(1 - zz * zz), sp = V * R(0.2, 0.55);
        add.spawn(A.dot, x, y, z, Math.cos(a) * rr * sp, zz * sp, Math.sin(a) * rr * sp, R(1.2, 2.2), R(0.14, 0.22), R(0, 0.4));
      }
    } else if (type === 1) {
      const V = R(10, 12);
      const tilt = R(-0.5, 0.5);
      for (let i = this._n(60); i > 0; i--) {
        const a = (i / 60) * TAU + R(-0.03, 0.03), sp = V * R(0.95, 1.05);
        const ca = Math.cos(a) * sp, sa = Math.sin(a) * sp;
        alp.spawn(A.streak, x, y, z, ca, sa * Math.cos(tilt), sa * Math.sin(tilt) * 0.6 + R(-0.4, 0.4), R(1.9, 2.4), R(0.2, 0.27));
      }
      for (let i = this._n(24); i > 0; i--) {
        const zz = R(-1, 1), a = R(0, TAU), rr = Math.sqrt(1 - zz * zz), sp = R(2, 5);
        add.spawn(B.dot, x, y, z, Math.cos(a) * rr * sp, zz * sp, Math.sin(a) * rr * sp, R(1, 1.8), R(0.15, 0.22));
      }
    } else {
      const W = FWP[1];
      for (let i = this._n(80); i > 0; i--) {
        const zz = R(-1, 1), a = R(0, TAU), rr = Math.sqrt(1 - zz * zz), sp = R(5, 8.5);
        alp.spawn(W.willow, x, y, z, Math.cos(a) * rr * sp, zz * sp, Math.sin(a) * rr * sp, R(3.0, 4.0), R(0.15, 0.21));
      }
    }
  }

  // ------------------------------------------------------------------ Update
  update(dt, time) {
    // Timer
    const tm = this._timers;
    for (let i = tm.length - 1; i >= 0; i--) {
      if (time >= tm[i].t) {
        const fn = tm[i].fn;
        tm[i] = tm[tm.length - 1];
        tm.pop();
        fn();
      }
    }
    this.balls.update(dt, this._trailCb);
    this.debris.update(dt, time, this._getWater, this._debrisWaterCb, WIND.x, WIND.z);
    this.coins.update(dt, time, this._getWater, this._coinWaterCb, this._glintCb);
    this._updateFires(dt, time);
    this._updateRockets(dt);
    // Licht
    if (this._lightI > 0.5) {
      this._lightI *= Math.exp(-dt * 9);
      this.light.intensity = this._lightI;
    } else if (this.light.intensity !== 0) {
      this._lightI = 0;
      this.light.intensity = 0;
    }
    this.alp.update(time);
    this.add.update(time);
  }

  clearAll() {
    this._timers.length = 0;
    for (const f of this._fires) f.active = false;
    for (const r of this._rockets) r.active = false;
    this.balls.clear();
    this.debris.clear();
    this.coins.clear();
    this.add.clear();
    this.alp.clear();
    this._lightI = 0;
    this.light.intensity = 0;
  }

  dispose() {
    this._offUpdate && this._offUpdate();
    this.clearAll();
  }
}
