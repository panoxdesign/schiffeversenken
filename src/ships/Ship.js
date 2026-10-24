// Schiff-Instanz: Transform, Wellenbewegung, Schaden, Untergang. Bug zeigt lokal nach +x.
import * as THREE from 'three';
import { CELL, FLAGSHIP_POSITION } from '../config.js';
import { getWaveHeight } from '../world/waves.js';
import { getShipMaterials } from './materials.js';

const _tmpV = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();

export class Ship {
  /**
   * @param {object} factory
   * @param {object} entry  Ergebnis von buildShip (geteilte Geometrien)
   * @param {number} length Zellen
   * @param {string} side
   */
  constructor(factory, entry, length, side) {
    this.factory = factory;
    this.engine = factory.engine;
    this.entry = entry;
    this.length = length;
    this.side = side;
    this.meta = entry.meta;
    const mats = getShipMaterials();

    this.object3D = new THREE.Group();
    this.object3D.name = `ship-${side}-${length}`;
    this.hullMesh = new THREE.Mesh(entry.hull, mats.hull);
    this.sailMesh = new THREE.Mesh(entry.sails, mats.sail[side]);
    this.lineMesh = new THREE.LineSegments(entry.lines, mats.line);
    this.object3D.add(this.hullMesh, this.sailMesh, this.lineMesh);
    for (const m of [this.hullMesh, this.sailMesh, this.lineMesh]) m.matrixAutoUpdate = true;
    this.engine.scene.add(this.object3D);
    this.object3D.rotation.order = 'YZX';

    this._ownGeo = false;
    this.damaged = new Array(length).fill(false);
    this.listTarget = 0;
    this.state = 'float'; // float | sinking | sunk
    this.placed = false;
    this.yaw = 0;
    this.base = new THREE.Vector3();
    this.heave = 0; this.pitch = 0; this.roll = 0; this.list = 0;
    this.phase = Math.random() * 10;
    this.sinkT = 0;
    this._sinkResolve = null;
    this.recoilT = 99;
    this.recoilAmp = 0;
    this.halfLen = this.meta.Lh * 0.38;
    this.halfBeam = this.meta.B * 0.42;
    this._disposed = false;
    this.object3D.visible = true;
  }

  // -------------------------------------------------------------- API
  place(board, col, row, orientation) {
    const a = board.cellToWorld(col, row, _tmpV);
    const ax = a.x, az = a.z;
    const b = board.cellToWorld(orientation === 'h' ? col + this.length - 1 : col, orientation === 'v' ? row + this.length - 1 : row, _tmpV);
    this.base.set((ax + b.x) / 2, 0, (az + b.z) / 2);
    this.yaw = orientation === 'h' ? 0 : -Math.PI / 2;
    this.placed = true;
    this.state = this.state === 'sunk' ? 'float' : this.state;
    this._snap();
  }

  setVisible(v) {
    const was = this.object3D.visible;
    this.object3D.visible = !!v;
    if (v && !was && this.placed && this.state !== 'sunk') this._snap();
  }

  getCellWorldPosition(index, target = new THREE.Vector3()) {
    const xi = (index - (this.length - 1) / 2) * CELL;
    target.set(xi, 0.9 * this.meta.hs, 0);
    this.object3D.updateMatrixWorld();
    return target.applyMatrix4(this.object3D.matrixWorld);
  }

  damage(index) {
    if (index < 0 || index >= this.length) return;
    this.damaged[index] = true;
    if (!this._listSign) this._listSign = Math.random() < 0.5 ? -1 : 1;
    this.listTarget = this._listSign * Math.min(0.2, Math.abs(this.listTarget) + 0.035);
    this._applyDamage();
  }

  sink() {
    if (this.state === 'sunk') return Promise.resolve();
    if (this.state === 'sinking') return this._sinkPromise;
    this.state = 'sinking';
    this.sinkT = 0;
    this.setVisible(true);
    this._sinkRoll = (this.listTarget !== 0 ? Math.sign(this.listTarget) : Math.random() < 0.5 ? -1 : 1);
    this._sinkPitch = Math.random() < 0.5 ? -1 : 1; // Bug- oder Heck-zuerst
    this._sinkPromise = new Promise((res) => { this._sinkResolve = res; });
    return this._sinkPromise;
  }

  reset() {
    this.damaged.fill(false);
    this.listTarget = 0;
    this._restoreShared();
    if (this.state !== 'float') {
      this.state = 'float';
      this.object3D.visible = true;
      if (this._sinkResolve) { this._sinkResolve(); this._sinkResolve = null; }
    }
    this.list = 0;
    if (this.placed) this._snap();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.factory._remove(this);
    this.engine.scene.remove(this.object3D);
    if (this._ownGeo) { this.hullMesh.geometry.dispose(); this.sailMesh.geometry.dispose(); }
    if (this._sinkResolve) { this._sinkResolve(); this._sinkResolve = null; }
  }

  // -------------------------------------------------------------- Schaden
  _ensureOwnGeo() {
    if (this._ownGeo) return;
    const e = this.entry;
    const hg = new THREE.BufferGeometry();
    hg.setIndex(e.hull.index);
    hg.setAttribute('uv', e.hull.attributes.uv);
    hg.setAttribute('normal', e.hull.attributes.normal);
    hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(e.hull.attributes.position.array), 3));
    hg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(e.hull.attributes.color.array), 3));
    hg.boundingSphere = e.hull.boundingSphere;
    const sg = new THREE.BufferGeometry();
    sg.setIndex(e.sails.index);
    sg.setAttribute('uv', e.sails.attributes.uv);
    sg.setAttribute('normal', e.sails.attributes.normal);
    sg.setAttribute('position', e.sails.attributes.position);
    sg.setAttribute('aSail', new THREE.BufferAttribute(new Float32Array(e.sails.attributes.aSail.array), 3));
    this.hullMesh.geometry = hg;
    this.sailMesh.geometry = sg;
    this._ownGeo = true;
    this.hullMesh.frustumCulled = false;
    this.sailMesh.frustumCulled = false;
  }

  _restoreShared() {
    if (!this._ownGeo) return;
    this.hullMesh.geometry.dispose();
    this.sailMesh.geometry.dispose();
    this.hullMesh.geometry = this.entry.hull;
    this.sailMesh.geometry = this.entry.sails;
    this._ownGeo = false;
  }

  _applyDamage() {
    this._ensureOwnGeo();
    const e = this.entry, hs = this.meta.hs;
    const hg = this.hullMesh.geometry, sg = this.sailMesh.geometry;
    const bp = e.hull.attributes.position.array, bc = e.hull.attributes.color.array, bn = e.hull.attributes.normal.array;
    const pos = hg.attributes.position.array, col = hg.attributes.color.array;
    const aux = e.hullAux;
    const cx = [];
    for (let i = 0; i < this.length; i++) if (this.damaged[i]) cx.push((i - (this.length - 1) / 2) * CELL);
    const n = bp.length / 3;
    const R = CELL * 0.72;
    for (let v = 0; v < n; v++) {
      const x = bp[v * 3], y = bp[v * 3 + 1], z = bp[v * 3 + 2];
      let burn = 0;
      for (let k = 0; k < cx.length; k++) {
        const dx = Math.abs(x - cx[k]) / R;
        if (dx < 1) {
          const f = 1 - dx * dx;
          const nz = 0.7 + 0.3 * Math.sin(y * 9.1 + z * 7.3 + k * 1.7) * Math.sin(x * 6.3 + z * 4.1 + k);
          burn = Math.max(burn, Math.min(1, f * 1.35 * nz));
        }
      }
      const w = burn * aux[v * 3];
      for (let c = 0; c < 3; c++) {
        const base = bc[v * 3 + c];
        col[v * 3 + c] = base + (0.025 - base) * Math.min(1, w * 0.92);
      }
      const d = 0.11 * hs * Math.pow(burn, 1.5) * aux[v * 3 + 1];
      pos[v * 3] = x - bn[v * 3] * d;
      pos[v * 3 + 1] = y - bn[v * 3 + 1] * d;
      pos[v * 3 + 2] = z - bn[v * 3 + 2] * d;
    }
    hg.attributes.position.needsUpdate = true;
    hg.attributes.color.needsUpdate = true;

    const sp = e.sails.attributes.position.array, sa = e.sails.attributes.aSail.array;
    const da = sg.attributes.aSail.array;
    const m = sp.length / 3;
    const Rs = CELL * 0.7;
    for (let v = 0; v < m; v++) {
      const x = sp[v * 3];
      let f = 0;
      for (let k = 0; k < cx.length; k++) {
        const dx = Math.abs(x - cx[k]) / Rs;
        if (dx < 1) f = Math.max(f, 1 - dx * dx);
      }
      da[v * 3] = sa[v * 3];
      da[v * 3 + 1] = sa[v * 3 + 2] < 0.5 ? Math.min(1, f * 1.0) : 0;
      da[v * 3 + 2] = sa[v * 3 + 2];
    }
    sg.attributes.aSail.needsUpdate = true;
  }

  // -------------------------------------------------------------- Bewegung
  _sample(t, out) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const fx = c, fz = -s, sx = s, sz = c;
    const px = this.base.x, pz = this.base.z;
    const hl = this.halfLen, hw = this.halfBeam;
    const hB = getWaveHeight(px + fx * hl, pz + fz * hl, t);
    const hS = getWaveHeight(px - fx * hl, pz - fz * hl, t);
    const hP = getWaveHeight(px - sx * hw, pz - sz * hw, t);
    const hR = getWaveHeight(px + sx * hw, pz + sz * hw, t);
    const hC = getWaveHeight(px, pz, t);
    out.heave = (hB + hS + hP + hR + 2 * hC) / 6;
    out.pitch = Math.atan2(hB - hS, 2 * hl) * 1.5;
    out.roll = Math.atan2(hP - hR, 2 * hw) * 1.3;
  }

  _snap() {
    const o = this.factory._scratch;
    this._sample(this.engine.time, o);
    this.heave = o.heave; this.pitch = o.pitch; this.roll = o.roll;
    this._apply(this.engine.time);
  }

  _apply(t) {
    const sway = 0.012 * Math.sin(t * 0.9 + this.phase);
    const ob = this.object3D;
    let y = this.heave + 0.04;
    let pitch = this.pitch, roll = this.roll + this.list + sway;
    let px = this.base.x, pz = this.base.z;
    if (this.recoilT < 3) {
      const r = this.recoilAmp * Math.exp(-this.recoilT * 2.6) * Math.cos(this.recoilT * 9);
      roll += -this.meta.facing * r * 0.05;
      pitch += r * 0.012;
      const k = -this.meta.facing * r * 0.3;
      px += Math.sin(this.yaw) * k; pz += Math.cos(this.yaw) * k;
    }
    if (this.state === 'sinking') {
      const p = Math.min(1, this.sinkT / 3);
      const e = p * p * (3 - 2 * p);
      const ee = p < 0.15 ? p * p * 0.5 : (p - 0.15) / 0.85;
      roll += this._sinkRoll * (1.15 * e + 0.05 * Math.sin(p * 9) * (1 - p));
      pitch += this._sinkPitch * 0.55 * Math.pow(p, 1.4);
      y = this.heave * (1 - p) - (this.meta.height + 1.2) * Math.pow(Math.max(0, ee), 1.5) - 0.4 * p;
    }
    ob.position.set(px, y, pz);
    ob.rotation.set(roll, this.yaw, pitch);
    ob.updateMatrixWorld();
  }

  _step(dt, t) {
    if (!this.placed || this.state === 'sunk') return;
    if (this.recoilT < 3) this.recoilT += dt;
    if (this.state === 'sinking') {
      this.sinkT += dt;
      if (this.sinkT >= 3) {
        this.state = 'sunk';
        this.object3D.visible = false;
        if (this._sinkResolve) { this._sinkResolve(); this._sinkResolve = null; }
        return;
      }
    }
    if (!this.object3D.visible) return;
    const o = this.factory._scratch;
    this._sample(t, o);
    const k = 1 - Math.exp(-dt * 4.5);
    this.heave += (o.heave - this.heave) * k;
    this.pitch += (o.pitch - this.pitch) * k;
    this.roll += (o.roll - this.roll) * k;
    this.list += (this.listTarget - this.list) * (1 - Math.exp(-dt * 1.5));
    this._apply(t);
  }
}

/** Dekoratives Flaggschiff mit Kanonenreihe. */
export class Flagship extends Ship {
  constructor(factory, entry, side) {
    super(factory, entry, 5, side);
    this.length = 5;
    this.base.copy(FLAGSHIP_POSITION[side]);
    this.yaw = side === 'player' ? 0.62 : Math.PI - 0.62;
    this.placed = true;
    this.halfLen = this.meta.Lh * 0.4;
    this.halfBeam = this.meta.B * 0.4;
    this._snap();
  }

  getCannonPosition(target, out = new THREE.Vector3()) {
    const cannons = this.meta.cannons;
    this.object3D.updateMatrixWorld();
    let best = 1e12;
    for (let i = 0; i < cannons.length; i++) {
      const c = cannons[i];
      _tmpV.set(c[0], c[1], c[2]).applyMatrix4(this.object3D.matrixWorld);
      const d = _tmpV.distanceToSquared(target);
      if (d < best) { best = d; _tmpV2.copy(_tmpV); }
    }
    return out.copy(_tmpV2);
  }

  fireRecoil() {
    this.recoilT = 0;
    this.recoilAmp = 1;
  }
}
