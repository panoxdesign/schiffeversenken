// Gepoolte InstancedMeshes: Kanonenkugeln, Holzsplitter/Treibgut, Goldmünzen. Keine Allokation pro Frame.
import * as THREE from 'three';

const _o = new THREE.Object3D();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _col = new THREE.Color();
const _axis = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function makeMesh(scene, geo, mat, count) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  for (let i = 0; i < count; i++) m.setMatrixAt(i, ZERO);
  m.instanceMatrix.needsUpdate = true;
  scene.add(m);
  return m;
}

/** Kanonenkugeln (ballistischer Bogen). */
export class BallPool {
  constructor(scene, count = 8) {
    this.count = count;
    const geo = new THREE.SphereGeometry(0.36, 12, 9);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b1b1e, metalness: 0.75, roughness: 0.38 });
    this.mesh = makeMesh(scene, geo, mat, count);
    this.active = new Uint8Array(count);
    this.t = new Float32Array(count);
    this.ft = new Float32Array(count);
    this.H = new Float32Array(count);
    this.P = new Float32Array(count * 6); // from, to
    this.trail = new Float32Array(count);
    this.resolve = new Array(count).fill(null);
    this.cursor = 0;
    this.dirty = false;
    this._pos = [0, 0, 0];
  }

  launch(fx, fy, fz, tx, ty, tz, ft, H, resolve) {
    let i = -1;
    for (let k = 0; k < this.count; k++) { const j = (this.cursor + k) % this.count; if (!this.active[j]) { i = j; break; } }
    if (i < 0) { i = this.cursor; if (this.resolve[i]) this.resolve[i](); }
    this.cursor = (i + 1) % this.count;
    this.active[i] = 1; this.t[i] = 0; this.ft[i] = ft; this.H[i] = H; this.trail[i] = 0;
    const o = i * 6;
    this.P[o] = fx; this.P[o + 1] = fy; this.P[o + 2] = fz; this.P[o + 3] = tx; this.P[o + 4] = ty; this.P[o + 5] = tz;
    this.resolve[i] = resolve;
  }

  /** Position von Kugel i bei u in [0,1] (in out-Array). */
  posAt(i, u, out) {
    const o = i * 6, P = this.P;
    out[0] = P[o] + (P[o + 3] - P[o]) * u;
    out[1] = P[o + 1] + (P[o + 4] - P[o + 1]) * u + 4 * this.H[i] * u * (1 - u);
    out[2] = P[o + 2] + (P[o + 5] - P[o + 2]) * u;
    return out;
  }

  /** onTrail(x,y,z,speed) wird je Kugel pro Frame gerufen; onImpact(i) beim Einschlag. */
  update(dt, onTrail) {
    let any = false;
    const p = this._pos;
    for (let i = 0; i < this.count; i++) {
      if (!this.active[i]) continue;
      any = true;
      this.t[i] += dt;
      let u = this.t[i] / this.ft[i];
      if (u >= 1) {
        this.active[i] = 0;
        this.mesh.setMatrixAt(i, ZERO);
        const r = this.resolve[i];
        this.resolve[i] = null;
        this.dirty = true;
        if (r) r();
        continue;
      }
      this.posAt(i, u, p);
      _o.position.set(p[0], p[1], p[2]);
      _o.scale.setScalar(1);
      _o.rotation.set(0, 0, 0);
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
      this.dirty = true;
      onTrail(p[0], p[1], p[2], dt);
    }
    if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = any; }
  }

  clear() {
    for (let i = 0; i < this.count; i++) {
      this.active[i] = 0;
      this.mesh.setMatrixAt(i, ZERO);
      const r = this.resolve[i];
      this.resolve[i] = null;
      if (r) r();
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Holzsplitter: fliegen ballistisch, schwimmen dann eine Weile und versinken. */
export class DebrisPool {
  constructor(scene, count = 96) {
    this.count = count;
    const geo = new THREE.BoxGeometry(0.62, 0.07, 0.13);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
    this.mesh = makeMesh(scene, geo, mat, count);
    this.mesh.setColorAt(0, _col.set(0x5a3a1f));
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, _col.set(0x5a3a1f));
    this.state = new Uint8Array(count); // 0 tot, 1 Flug, 2 schwimmt, 3 sinkt
    this.p = new Float32Array(count * 3);
    this.v = new Float32Array(count * 3);
    this.e = new Float32Array(count * 3); // Euler
    this.w = new Float32Array(count * 3); // Drehrate
    this.size = new Float32Array(count);
    this.tm = new Float32Array(count); // Zeit im Zustand
    this.floatTime = new Float32Array(count);
    this.cursor = 0;
    this.dirty = false;
    this.colorDirty = false;
  }

  spawn(x, y, z, vx, vy, vz, floatTime = 3, size = 1) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.count;
    this.state[i] = 1; this.tm[i] = 0; this.floatTime[i] = floatTime; this.size[i] = size * (0.6 + Math.random() * 0.9);
    const o = i * 3;
    this.p[o] = x; this.p[o + 1] = y; this.p[o + 2] = z;
    this.v[o] = vx; this.v[o + 1] = vy; this.v[o + 2] = vz;
    this.e[o] = Math.random() * 6.28; this.e[o + 1] = Math.random() * 6.28; this.e[o + 2] = Math.random() * 6.28;
    this.w[o] = (Math.random() - 0.5) * 16; this.w[o + 1] = (Math.random() - 0.5) * 12; this.w[o + 2] = (Math.random() - 0.5) * 16;
    // Holzfarben: dunkel/hell, vereinzelt verkohlt
    const k = Math.random();
    if (k < 0.2) _col.setRGB(0.04, 0.03, 0.025);
    else _col.setHSL(0.07 + Math.random() * 0.03, 0.5, 0.05 + Math.random() * 0.09);
    this.mesh.setColorAt(i, _col);
    this.colorDirty = true;
  }

  update(dt, time, getWater, onWater, windX, windZ) {
    let any = false;
    for (let i = 0; i < this.count; i++) {
      const st = this.state[i];
      if (!st) continue;
      any = true;
      const o = i * 3;
      const p = this.p, v = this.v, e = this.e, w = this.w;
      this.tm[i] += dt;
      let scale = this.size[i];
      if (st === 1) {
        v[o + 1] -= 11 * dt;
        p[o] += v[o] * dt; p[o + 1] += v[o + 1] * dt; p[o + 2] += v[o + 2] * dt;
        e[o] += w[o] * dt; e[o + 1] += w[o + 1] * dt; e[o + 2] += w[o + 2] * dt;
        const wh = getWater(p[o], p[o + 2]);
        if (p[o + 1] < wh && v[o + 1] < 0) {
          this.state[i] = 2; this.tm[i] = 0;
          if (onWater) onWater(p[o], wh, p[o + 2], i);
          v[o] *= 0.1; v[o + 2] *= 0.1;
        }
      } else {
        const tmv = this.tm[i];
        // Rotation beruhigt sich, Teil legt sich flach
        const k = Math.min(1, dt * 3);
        e[o] += (0 - e[o]) * k; e[o + 2] += (0 - e[o + 2]) * k;
        e[o + 1] += w[o + 1] * 0.15 * dt;
        p[o] += (windX * 0.25 + v[o] * Math.exp(-tmv * 3)) * dt;
        p[o + 2] += (windZ * 0.25 + v[o + 2] * Math.exp(-tmv * 3)) * dt;
        let y = getWater(p[o], p[o + 2]);
        if (st === 2 && tmv > this.floatTime[i]) { this.state[i] = 3; this.tm[i] = 0; }
        if (this.state[i] === 3) {
          const f = Math.min(1, this.tm[i] / 1.2);
          scale *= 1 - f;
          y -= f * 0.15;
          if (f >= 1) { this.state[i] = 0; this.mesh.setMatrixAt(i, ZERO); this.dirty = true; continue; }
        }
        p[o + 1] = y + 0.02;
      }
      _o.position.set(p[o], p[o + 1], p[o + 2]);
      _o.rotation.set(e[o], e[o + 1], e[o + 2]);
      _o.scale.setScalar(scale);
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
      this.dirty = true;
    }
    if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = any; }
    if (this.colorDirty) { this.mesh.instanceColor.needsUpdate = true; this.colorDirty = false; }
  }

  clear() {
    this.state.fill(0);
    for (let i = 0; i < this.count; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Goldmünzen-Regen. */
export class CoinPool {
  constructor(scene, count = 64) {
    this.count = count;
    const geo = new THREE.CylinderGeometry(0.24, 0.24, 0.05, 16, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffc433, metalness: 1, roughness: 0.3, emissive: 0x7a4a00, emissiveIntensity: 0.55, envMapIntensity: 1.4,
    });
    this.mesh = makeMesh(scene, geo, mat, count);
    this.mesh.setColorAt(0, _col.set(0xffffff));
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, _col.set(0xffffff));
    this.alive = new Uint8Array(count);
    this.p = new Float32Array(count * 3);
    this.start = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.spin = new Float32Array(count);
    this.ang = new Float32Array(count);
    this.ax = new Float32Array(count * 3);
    this.phase = new Float32Array(count);
    this.cursor = 0;
    this.dirty = false;
    this.colorDirty = false;
  }

  spawn(x, y, z, startTime) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.count;
    this.alive[i] = 1;
    const o = i * 3;
    this.p[o] = x; this.p[o + 1] = y; this.p[o + 2] = z;
    this.start[i] = startTime;
    this.vy[i] = -Math.random() * 2;
    this.spin[i] = 5 + Math.random() * 9;
    this.ang[i] = Math.random() * 6.28;
    _axis.set(Math.random() - 0.5, Math.random() * 0.4 + 0.2, Math.random() - 0.5).normalize();
    this.ax[o] = _axis.x; this.ax[o + 1] = _axis.y; this.ax[o + 2] = _axis.z;
    this.phase[i] = Math.random() * 6.28;
    _col.setHSL(0.11 + Math.random() * 0.03, 0.9, 0.78 + Math.random() * 0.22);
    this.mesh.setColorAt(i, _col);
    this.colorDirty = true;
  }

  /** onWater(x,y,z) bei Wasserkontakt, onGlint(x,y,z) gelegentlich für Funkeln. */
  update(dt, time, getWater, onWater, onGlint) {
    let any = false;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      any = true;
      if (time < this.start[i]) continue;
      const o = i * 3;
      const p = this.p;
      this.vy[i] = Math.max(-6.5, this.vy[i] - 9 * dt);
      p[o + 1] += this.vy[i] * dt;
      p[o] += Math.sin(time * 1.6 + this.phase[i]) * 0.9 * dt + 0.35 * dt;
      p[o + 2] += Math.cos(time * 1.3 + this.phase[i]) * 0.6 * dt - 0.15 * dt;
      this.ang[i] += this.spin[i] * dt;
      if (Math.random() < dt * 1.2) onGlint(p[o], p[o + 1], p[o + 2]);
      const wh = getWater(p[o], p[o + 2]);
      if (p[o + 1] < wh) {
        this.alive[i] = 0;
        this.mesh.setMatrixAt(i, ZERO);
        this.dirty = true;
        onWater(p[o], wh, p[o + 2]);
        continue;
      }
      _q.setFromAxisAngle(_axis.set(this.ax[o], this.ax[o + 1], this.ax[o + 2]), this.ang[i]);
      _o.position.set(p[o], p[o + 1], p[o + 2]);
      _o.quaternion.copy(_q);
      _o.scale.setScalar(1);
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
      this.dirty = true;
    }
    if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = any; }
    if (this.colorDirty) { this.mesh.instanceColor.needsUpdate = true; this.colorDirty = false; }
  }

  clear() {
    this.alive.fill(0);
    for (let i = 0; i < this.count; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
