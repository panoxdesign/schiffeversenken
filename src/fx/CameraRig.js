// Kamerasteuerung: Views mit Easing (Position + Blickziel getrennt), Fit an Aspect, Shake, Parallaxe, Idle-Schaukeln.
import * as THREE from 'three';
import { BOARD_CENTER } from '../config.js';

const DEG = Math.PI / 180;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// Sichtbare Brettfläche inkl. Beschriftungsrand
const BOARD_HALF_VIS = 10 + 1.5;
// Freiraum für HUD (NDC-Anteil): oben 10 % / unten 12 % der Bildhöhe
const HUD_TOP = 0.1;
const HUD_BOTTOM = 0.12;

/** Pose = Kameraposition + Blickziel. */
class Pose {
  constructor() { this.px = 0; this.py = 0; this.pz = 0; this.lx = 0; this.ly = 0; this.lz = 0; }
  set(px, py, pz, lx, ly, lz) { this.px = px; this.py = py; this.pz = pz; this.lx = lx; this.ly = ly; this.lz = lz; return this; }
  copy(o) { return this.set(o.px, o.py, o.pz, o.lx, o.ly, o.lz); }
}

export class CameraRig {
  constructor(engine) {
    this.engine = engine;
    this.camera = engine.camera;
    this.aspect = engine.width / engine.height || 1.6;

    this._from = new Pose();
    this._to = new Pose();
    this._cur = new Pose();
    this._viewName = 'overview';
    this._static = {}; // gefittete statische Posen
    this._progress = 1;
    this._duration = 0;
    this._resolve = null;
    this._clock = 0; // lokale Zeit für dynamische Views
    this._viewTime = 0;

    this._trauma = 0;
    this._shakeT = 0;
    this._px = 0; this._py = 0; // Parallaxe Ziel
    this._sx = 0; this._sy = 0; // geglättet
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._qt = new THREE.Quaternion();
    this._tmp = new Pose();

    this._offResize = engine.onResize((w, h, a) => { this.aspect = a; this._rebuild(); });
    this._rebuild();
    this._from.copy(this._evalView('overview', this._to));
    this._cur.copy(this._to);
    this._apply(0);
    this._offUpdate = engine.onUpdate((dt) => this.update(dt), 90);
  }

  // ---------------------------------------------------------------- Fit
  /**
   * Abstand D entlang der Blickrichtung (Neigung pitch, Kamera bei +z), so dass das Rechteck
   * (cx,cz,hx,hz) komplett im nutzbaren Bildbereich liegt.
   */
  _fit(cx, cz, hx, hz, pitch, margin = 1, shift = 0, useWidth = true) {
    const cam = this.camera;
    const ty = Math.tan((cam.fov * DEG) / 2);
    const tx = ty * this.aspect;
    const sp = Math.sin(pitch), cp = Math.cos(pitch);
    // Blickrichtung f (Kamera -> Ziel) = (0, -sp, -cp); right = (1,0,0); up = (0, cp, -sp)
    const yTop = 1 - 2 * HUD_TOP, yBot = 1 - 2 * HUD_BOTTOM;
    let D = 0;
    for (let i = 0; i < 4; i++) {
      const xc = i & 1 ? hx : -hx;
      const dz = (i & 2 ? hz : -hz) - shift; // relativ zum (verschobenen) Ziel
      const yc = dz * -sp;
      const depthRel = dz * -cp; // Tiefe relativ zum Ziel
      if (useWidth) D = Math.max(D, Math.abs(xc) / (tx * margin) - depthRel);
      D = Math.max(D, yc / (ty * yTop * margin) - depthRel);
      D = Math.max(D, -yc / (ty * yBot * margin) - depthRel);
    }
    return D;
  }

  _pitchFor(aspect, landscape, portrait) {
    const t = clamp((aspect - 0.55) / (1.4 - 0.55), 0, 1);
    return lerp(portrait, landscape, t) * DEG;
  }

  _staticPose(out, cx, cz, hx, hz, pitchDeg, pitchPortraitDeg, margin = 0.95) {
    const pitch = this._pitchFor(this.aspect, pitchDeg, pitchPortraitDeg);
    // Blickziel längs z verschieben, bis der Abstand minimal ist (Brett füllt den nutzbaren Bereich optimal)
    // Blickziel so verschieben, dass oben/unten gleich viel Luft bleibt (nur vertikale Bedingungen),
    // dann den Abstand inkl. Breite bestimmen.
    let bestV = Infinity, bs = 0;
    for (let k = -60; k <= 60; k++) {
      const sh = (k / 60) * hz;
      const d = this._fit(cx, cz, hx, hz, pitch, margin, sh, false);
      if (d < bestV - 1e-6) { bestV = d; bs = sh; }
    }
    const best = this._fit(cx, cz, hx, hz, pitch, margin, bs, true);
    const D = best + 0.3;
    const sp = Math.sin(pitch), cp = Math.cos(pitch);
    const tz = cz + bs;
    return out.set(cx, sp * D, tz + cp * D, cx, 0, tz);
  }

  _rebuild() {
    const s = this._static;
    const pc = BOARD_CENTER.player, ec = BOARD_CENTER.enemy;
    s.player = this._staticPose(new Pose(), pc.x, pc.z, BOARD_HALF_VIS + 0.5, BOARD_HALF_VIS + 0.5, 52, 66);
    s.placement = this._staticPose(new Pose(), pc.x, pc.z, BOARD_HALF_VIS, BOARD_HALF_VIS, 56, 70);
    s.placementEnemy = this._staticPose(new Pose(), ec.x, ec.z, BOARD_HALF_VIS, BOARD_HALF_VIS, 56, 70); // Hot-Seat Spieler 2
    s.enemy = this._staticPose(new Pose(), ec.x, ec.z, BOARD_HALF_VIS + 0.5, BOARD_HALF_VIS + 0.5, 52, 66);
    s.overview = this._staticPose(new Pose(), 0, 0, BOARD_HALF_VIS + 12, BOARD_HALF_VIS + 0.5, 44, 62);
  }

  /** Posen der Views (dynamisch oder statisch) → out. */
  _evalView(name, out) {
    const t = this.engine.time;
    const s = this._static;
    switch (name) {
      case 'menu': {
        // langsamer, endloser filmischer Schwenk über die gesamte Szene
        const a = t * 0.045;
        const sway = Math.sin(a) * 0.9;
        const cx = Math.sin(a * 0.8 + 0.6) * 22;
        const R = 46 + Math.sin(a * 0.7) * 8 + (this.aspect < 1 ? 26 : 0);
        const ang = sway * 0.7;
        const h = 9 + Math.sin(a * 1.3 + 1) * 2.5;
        const lx = cx * 0.6, ly = 2.5, lz = 0;
        return out.set(cx + Math.sin(ang) * R * 0.55, h, Math.cos(ang) * R, lx, ly, lz);
      }
      case 'victory': {
        const p = BOARD_CENTER.player;
        const ang = -0.55 + (this._viewTime * 0.05) % TAU2;
        const Rr = 27 + (this.aspect < 1 ? 14 : 0);
        const h = 6 + Math.sin(this._viewTime * 0.3) * 1.2;
        return out.set(p.x + Math.sin(ang) * Rr, h, p.z + Math.cos(ang) * Rr, p.x, 2.2, p.z);
      }
      case 'defeat': {
        const p = BOARD_CENTER.player;
        const ang = 0.3 + Math.sin(this._viewTime * 0.07) * 0.25;
        const Rr = 44 + (this.aspect < 1 ? 20 : 0) + Math.min(8, this._viewTime * 0.5);
        const h = 30 + Math.sin(this._viewTime * 0.2) * 1;
        return out.set(p.x + Math.sin(ang) * Rr * 0.5, h, p.z + Math.cos(ang) * Rr * 0.85, p.x, 0, p.z);
      }
      default: {
        const st = s[name] || s.overview;
        return out.copy(st);
      }
    }
  }

  // ---------------------------------------------------------------- API
  /** Wechselt weich (Position und Blickziel) zur View. Unterbrechbar. */
  setView(name, duration = 1.6) {
    if (this._resolve) { const r = this._resolve; this._resolve = null; r(); }
    this._from.copy(this._cur);
    this._viewName = name;
    this._viewTime = 0;
    this._duration = Math.max(0, duration);
    this._progress = this._duration === 0 ? 1 : 0;
    if (this._duration === 0) {
      this._evalView(name, this._to);
      this._cur.copy(this._to);
      this._apply(0);
      return Promise.resolve();
    }
    return new Promise((res) => { this._resolve = res; });
  }

  /** Abklingendes Wackeln (strength ~0..2). */
  shake(strength = 1) {
    this._trauma = Math.min(1.6, this._trauma + strength * 0.6);
  }

  /** nx, ny in -1..1 */
  setPointerParallax(nx, ny) {
    this._px = clamp(nx || 0, -1, 1);
    this._py = clamp(ny || 0, -1, 1);
  }

  // ---------------------------------------------------------------- Update
  update(dt) {
    this._viewTime += dt;
    this._evalView(this._viewName, this._to);
    if (this._progress < 1) {
      this._progress = Math.min(1, this._progress + dt / this._duration);
      const e = easeInOutCubic(this._progress);
      const f = this._from, t = this._to, c = this._cur;
      c.px = lerp(f.px, t.px, e); c.py = lerp(f.py, t.py, e); c.pz = lerp(f.pz, t.pz, e);
      // Blickziel etwas verzögert/versetzt, wirkt filmischer
      const el = easeInOutCubic(clamp(this._progress * 1.08, 0, 1));
      c.lx = lerp(f.lx, t.lx, el); c.ly = lerp(f.ly, t.ly, el); c.lz = lerp(f.lz, t.lz, el);
      if (this._progress >= 1 && this._resolve) { const r = this._resolve; this._resolve = null; r(); }
    } else {
      this._cur.copy(this._to);
    }
    this._apply(dt);
  }

  _apply(dt) {
    const cam = this.camera;
    const c = this._cur;
    const time = this.engine.time;

    // Parallaxe glätten
    const k = 1 - Math.exp(-dt * 3);
    this._sx += (this._px - this._sx) * k;
    this._sy += (this._py - this._sy) * k;

    // Basisorientierung
    this._look.set(c.lx, c.ly, c.lz);
    this._fwd.set(c.lx - c.px, c.ly - c.py, c.lz - c.pz).normalize();
    this._right.set(this._fwd.z * -1, 0, this._fwd.x).normalize(); // fwd x up(0,1,0)
    this._up.crossVectors(this._right, this._fwd);

    let ox = 0, oy = 0, oz = 0;
    // Parallaxe (max ~0.6)
    ox += this._right.x * this._sx * 0.6 + this._up.x * this._sy * 0.35;
    oy += this._right.y * this._sx * 0.6 + this._up.y * this._sy * 0.35;
    oz += this._right.z * this._sx * 0.6 + this._up.z * this._sy * 0.35;
    // Schiffs-Schaukeln (sehr subtil)
    oy += Math.sin(time * 0.7) * 0.05 + Math.sin(time * 1.13 + 1.3) * 0.025;
    ox += Math.sin(time * 0.5 + 0.4) * 0.04;
    let roll = Math.sin(time * 0.62) * 0.0035;
    let pitchJit = Math.sin(time * 0.83 + 2.0) * 0.0018;
    let yawJit = 0;

    // Shake (Trauma-Modell, nicht kumulativ driftend: Offsets werden jede Frame neu aus der Basis berechnet)
    if (this._trauma > 0.001) {
      this._trauma = Math.max(0, this._trauma - dt * 1.3);
      this._shakeT += dt * 38;
      const s = Math.min(1, this._trauma);
      const a = s * s;
      const t = this._shakeT;
      const nx = Math.sin(t * 1.0) * 0.6 + Math.sin(t * 2.31 + 1.7) * 0.4;
      const ny = Math.sin(t * 1.17 + 3.1) * 0.6 + Math.sin(t * 2.07 + 0.3) * 0.4;
      const nz = Math.sin(t * 0.93 + 5.2) * 0.6 + Math.sin(t * 1.91 + 2.2) * 0.4;
      ox += (this._right.x * nx + this._up.x * ny) * 0.55 * a;
      oy += (this._right.y * nx + this._up.y * ny) * 0.55 * a;
      oz += (this._right.z * nx + this._up.z * ny) * 0.55 * a;
      roll += nz * 0.022 * a;
      pitchJit += ny * 0.012 * a;
      yawJit += nx * 0.012 * a;
    }

    cam.position.set(c.px + ox, c.py + oy, c.pz + oz);
    cam.up.set(0, 1, 0);
    cam.lookAt(this._look);
    this._euler.set(pitchJit, yawJit, roll, 'YXZ');
    this._qt.setFromEuler(this._euler);
    cam.quaternion.multiply(this._qt);
  }

  dispose() {
    this._offUpdate && this._offUpdate();
    this._offResize && this._offResize();
  }
}

const TAU2 = Math.PI * 2;
