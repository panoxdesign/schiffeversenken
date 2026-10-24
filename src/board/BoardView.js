// Schwimmendes Spielfeld: wellenfolgendes Gitter (Shader), Holzrahmen mit Fässern, Beschriftung, Marker.
import * as THREE from 'three';
import { BOARD_CENTER, CELL, BOARD_SIZE, BOARD_HALF, COL_LABELS, ROW_LABELS } from '../config.js';
import { getWaveHeight, getWaveNormal, WAVES_GLSL } from '../world/waves.js';
import { MeshBuilder, rgb } from '../ships/MeshBuilder.js';
import { getWoodTextures } from '../ships/textures.js';
import { createLabelAtlas } from './labels.js';
import { createMarkerKits } from './markers.js';

const GRID_Y = 0.07;

const GRID_VERT = /* glsl */ `
${WAVES_GLSL}
uniform float uTime;
uniform vec2 uCenter;
varying vec2 vBoard;
varying float vWaveH;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vBoard = (wp.xz - uCenter) / ${CELL.toFixed(1)} + vec2(${(BOARD_SIZE / 2).toFixed(1)});
  vec3 n;
  vec3 d = gerstnerDisplace(wp.xz, uTime, n);
  vWaveH = d.y;
  vec3 p = wp.xyz + d + vec3(0.0, ${GRID_Y}, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const GRID_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uLine;
uniform vec3 uFill;
uniform float uActive;
uniform vec3 uHover;      // col,row,mode(0 aus,1 aim,2 invalid)
uniform vec4 uGhost;      // col,row,len,orient(0 h / 1 v)
uniform float uGhostState; // 0 aus, 1 gueltig, 2 ungueltig
varying vec2 vBoard;
varying float vWaveH;

void main() {
  vec2 g = vBoard;
  vec2 aa2 = fwidth(g);
  float aa = max(max(aa2.x, aa2.y), 1e-4);
  vec2 cell = floor(g);
  vec2 fr = fract(g);
  vec2 dEdge = min(fr, 1.0 - fr);
  float dl = min(dEdge.x, dEdge.y);
  // Rand dicker
  float border = min(min(g.x, g.y), min(${BOARD_SIZE.toFixed(1)} - g.x, ${BOARD_SIZE.toFixed(1)} - g.y));
  float w0 = 0.020 + 0.010 * uActive + 0.02 * (1.0 - smoothstep(0.0, 0.06, border));
  float core = 1.0 - smoothstep(w0, w0 + aa * 1.2, dl);
  float glow = exp(-dl * dl / 0.0030) * 0.30;
  float distFade = 1.0 / (1.0 + aa * 0.9);
  float shimmer = 0.80 + 0.20 * sin(g.x * 1.1 + g.y * 0.7 - uTime * 0.9);
  float lineA = (core * 0.78 + glow) * shimmer * (0.9 + 0.5 * uActive);
  lineA *= mix(0.55, 1.0, distFade);

  // Zellen leicht getönt, Schachbrett-Andeutung, Wellenkamm heller
  float checker = mod(cell.x + cell.y, 2.0);
  float fillA = 0.085 + 0.035 * checker + 0.05 * uActive + 0.35 * max(0.0, vWaveH) * 0.15;
  vec3 col = uFill * fillA * 0.0 + uFill;
  float alpha = fillA;
  col = mix(col, uLine, clamp(lineA, 0.0, 1.0));
  alpha = alpha + (1.0 - alpha) * clamp(lineA, 0.0, 1.0);

  // Platzierungs-Vorschau
  if (uGhostState > 0.5) {
    bool inside;
    if (uGhost.w < 0.5) inside = (cell.y == uGhost.y && cell.x >= uGhost.x && cell.x < uGhost.x + uGhost.z);
    else inside = (cell.x == uGhost.x && cell.y >= uGhost.y && cell.y < uGhost.y + uGhost.z);
    if (inside) {
      vec3 gc = uGhostState < 1.5 ? vec3(0.25, 1.0, 0.5) : vec3(1.0, 0.18, 0.12);
      float pulse = 0.5 + 0.5 * sin(uTime * 5.0);
      float edge = 1.0 - smoothstep(0.0, 0.08 + aa, dl);
      float a = 0.30 + 0.12 * pulse + 0.45 * edge;
      col = mix(col, gc, a);
      alpha = max(alpha, 0.45 + 0.2 * edge);
    }
  }

  // Zielmarkierung
  if (uHover.z > 0.5 && cell.x == uHover.x && cell.y == uHover.y) {
    vec2 lc = fr - 0.5;
    float r = length(lc);
    bool bad = uHover.z > 1.5;
    vec3 hc = bad ? vec3(1.0, 0.15, 0.10) : vec3(1.0, 0.86, 0.42);
    float pulse = 0.5 + 0.5 * sin(uTime * 6.0);
    float rr = 0.34 + 0.025 * pulse;
    float ring = 1.0 - smoothstep(0.018, 0.018 + aa * 1.5, abs(r - rr));
    float ang = atan(lc.y, lc.x) + uTime * (bad ? 0.0 : 1.2);
    float ticks = smoothstep(0.82, 0.9, cos(ang * 4.0)) * step(0.40, r) * step(r, 0.49);
    float cross1 = (1.0 - smoothstep(0.010, 0.010 + aa * 1.5, abs(lc.x))) * step(0.10, abs(lc.y)) * step(abs(lc.y), 0.27);
    float cross2 = (1.0 - smoothstep(0.010, 0.010 + aa * 1.5, abs(lc.y))) * step(0.10, abs(lc.x)) * step(abs(lc.x), 0.27);
    float mark = max(max(ring, ticks), max(cross1, cross2));
    if (bad) {
      float d1 = abs(lc.x - lc.y) * 0.7071, d2 = abs(lc.x + lc.y) * 0.7071;
      float xm = (1.0 - smoothstep(0.022, 0.022 + aa * 1.5, min(d1, d2))) * step(r, 0.30);
      mark = max(mark, xm);
    }
    float halo = (0.16 + 0.14 * pulse) * (1.0 - smoothstep(0.1, 0.5, r));
    col = mix(col, hc, clamp(halo + mark, 0.0, 1.0));
    alpha = max(alpha, clamp(0.35 + halo + mark, 0.0, 1.0));
  }

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Injiziert Gerstner-Verschiebung (Weltkoordinaten, Mesh bei Identität) in ein Standard-Material. */
function injectWaves(mat, timeUniform) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WAVES_GLSL}\nuniform float uTime;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 wvN;
        vec3 wvD = gerstnerDisplace(position.xz, uTime, wvN);
        objectNormal = normalize(objectNormal + 0.9 * (wvN - vec3(0.0, 1.0, 0.0)));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed += wvD;`);
  };
  mat.customProgramCacheKey = () => 'boardWave';
}

const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class BoardView {
  constructor(engine, world, side) {
    this.engine = engine;
    this.world = world;
    this.side = side;
    this.center = BOARD_CENTER[side].clone();
    this.timeU = { value: 0 };
    this.group = new THREE.Group();
    this.group.name = `board-${side}`;
    engine.scene.add(this.group);
    const enemy = side === 'enemy';

    // ---------------------------------------------------------- Gitter
    const seg = BOARD_SIZE * 5;
    const gg = new THREE.PlaneGeometry(BOARD_SIZE * CELL, BOARD_SIZE * CELL, seg, seg);
    gg.rotateX(-Math.PI / 2);
    this.gridMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.timeU,
        uCenter: { value: new THREE.Vector2(this.center.x, this.center.z) },
        uLine: { value: new THREE.Color(enemy ? 0xffc890 : 0xb4ecff) },
        uFill: { value: new THREE.Color(enemy ? 0xff6a3c : 0x3ab8d8) },
        uActive: { value: 0 },
        uHover: { value: new THREE.Vector3(0, 0, 0) },
        uGhost: { value: new THREE.Vector4(0, 0, 1, 0) },
        uGhostState: { value: 0 },
      },
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.grid = new THREE.Mesh(gg, this.gridMat);
    this.grid.position.copy(this.center);
    this.grid.renderOrder = 2;
    this.grid.frustumCulled = false;
    this.group.add(this.grid);

    // ---------------------------------------------------------- Rahmen
    this._buildFrame(enemy);

    // ---------------------------------------------------------- Beschriftung
    this._buildLabels();

    // ---------------------------------------------------------- Marker
    this.markers = createMarkerKits(this);

    this.active = false;
    this._activeAmt = 0;
    this._hover = { col: -1, row: -1, mode: 0 };
    this._off = engine.onUpdate((dt, t) => this._update(dt, t), 10);
  }

  // ------------------------------------------------------------ Koordinaten
  cellToWorld(col, row, target = new THREE.Vector3()) {
    return target.set(this.center.x + (col - 4.5) * CELL, 0, this.center.z + (row - 4.5) * CELL);
  }

  worldToCell(p) {
    const col = Math.floor((p.x - this.center.x) / CELL + 5);
    const row = Math.floor((p.z - this.center.z) / CELL + 5);
    if (col < 0 || row < 0 || col >= BOARD_SIZE || row >= BOARD_SIZE) return null;
    return { col, row };
  }

  // ------------------------------------------------------------ Zustand
  setHover(col, row, mode) {
    const u = this.gridMat.uniforms.uHover.value;
    if (!mode || col == null || row == null || col < 0 || row < 0 || col >= BOARD_SIZE || row >= BOARD_SIZE) {
      u.set(0, 0, 0);
      return;
    }
    u.set(col, row, mode === 'invalid' ? 2 : 1);
  }

  showGhost(length, col, row, orientation, valid) {
    this.gridMat.uniforms.uGhost.value.set(col, row, length, orientation === 'v' ? 1 : 0);
    this.gridMat.uniforms.uGhostState.value = valid ? 1 : 2;
  }

  hideGhost() { this.gridMat.uniforms.uGhostState.value = 0; }

  markMiss(col, row) { this.markers.miss.add(col, row, this.engine.time); this.markers.rings.spawn(col, row, this.engine.time, 0); }
  markHit(col, row) { this.markers.hit.add(col, row, this.engine.time); this.markers.rings.spawn(col, row, this.engine.time, 1); }
  markBlocked(col, row) { this.markers.blocked.add(col, row, this.engine.time); }

  setActive(v) { this.active = !!v; }

  setLabelsVisible(v) { this.labels.visible = !!v; }

  clearMarkers() {
    this.markers.miss.clear();
    this.markers.hit.clear();
    this.markers.blocked.clear();
    this.markers.rings.clear();
  }

  dispose() {
    this._off && this._off();
    this.engine.scene.remove(this.group);
  }

  // ------------------------------------------------------------ Aufbau
  _buildFrame(enemy) {
    const wood = getWoodTextures();
    const B = new MeshBuilder();
    const cx = this.center.x, cz = this.center.z;
    const woodC = enemy ? rgb('#8a5a3c') : rgb('#c89560');
    const darkC = enemy ? rgb('#5a3a28') : rgb('#9a6a3c');
    const ropeC = enemy ? rgb('#a8281c') : rgb('#e8dcc0');
    const brass = rgb('#e0b040');
    const half = BOARD_HALF + 0.38; // Balken-Mittellinie
    const bw = 0.52, bh = 0.2, y0 = -0.07;
    const nSeg = 56;
    const sides = [
      { ax: 'x', fix: -half }, { ax: 'x', fix: half }, { ax: 'z', fix: -half }, { ax: 'z', fix: half },
    ];
    B.auxDefault = [0, 0, 0];
    const wpt = (ax, s, off, y, c, o, u, v, col) => {
      // s: Position entlang; off: Querversatz zur Mittellinie
      const fixv = ax === 'x' ? cz + c : cx + c;
      if (ax === 'x') { o[0] = cx + s; o[2] = fixv + off; } else { o[0] = fixv + off; o[2] = cz + s; }
      o[1] = y; o[3] = u; o[4] = v;
      o[5] = col[0]; o[6] = col[1]; o[7] = col[2];
    };
    for (const sd of sides) {
      const len = 2 * (half + bw / 2);
      const sgn = Math.sign(sd.fix);
      // Oberseite, Außenseite, Innenseite (3 Flächen)
      const faces = [
        (i, j, o) => { const s = -len / 2 + (i / nSeg) * len; wpt(sd.ax, s, (j - 0.5) * bw, y0 + bh, sd.fix, o, s / 3.0, j * 0.3, woodC); },
        (i, j, o) => { const s = -len / 2 + (i / nSeg) * len; wpt(sd.ax, s, sgn * bw / 2, y0 + j * bh, sd.fix, o, s / 3.0, 0.2 + j * 0.2, darkC); },
        (i, j, o) => { const s = -len / 2 + (i / nSeg) * len; wpt(sd.ax, s, -sgn * bw / 2, y0 + j * bh, sd.fix, o, s / 3.0, 0.2 + j * 0.2, darkC); },
      ];
      for (const f of faces) B.grid(nSeg, 1, f);
      // Tauwerk-Wicklungen
      for (let k = 0; k < 8; k++) {
        const s = -len / 2 + 1.4 + k * ((len - 2.8) / 7);
        const ax = sd.ax;
        const px = ax === 'x' ? cx + s : cx + sd.fix;
        const pz = ax === 'x' ? cz + sd.fix : cz + s;
        if (ax === 'x') B.box(px, y0 + bh / 2 + 0.02, pz, 0.14, bh + 0.05, bw + 0.06, ropeC);
        else B.box(px, y0 + bh / 2 + 0.02, pz, bw + 0.06, bh + 0.05, 0.14, ropeC);
      }
    }
    // Eckpfosten mit Messingkappen
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = cx + sx * half, pz = cz + sz * half;
        B.box(px, y0 + bh / 2 + 0.07, pz, bw + 0.16, bh + 0.2, bw + 0.16, darkC);
        B.sphere(px, y0 + bh + 0.2, pz, 0.15, 8, brass, 0.8);
      }
    }
    const geo = B.toGeometry({ color: true });
    const mat = new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normalMap, vertexColors: true, roughness: 0.78, metalness: 0.0, emissive: new THREE.Color(enemy ? 0xff5a20 : 0xffb050), emissiveIntensity: 0, side: THREE.DoubleSide });
    injectWaves(mat, this.timeU);
    this.frameMat = mat;
    this.frame = new THREE.Mesh(geo, mat);
    this.frame.frustumCulled = false;
    this.group.add(this.frame);

    // Fässer an den Ecken + kleine Bojen an den Seitenmitten (Instanced, bewegen sich per CPU mit den Wellen)
    const BB = new MeshBuilder();
    const hoop = rgb('#2a2a2e');
    const staveC = rgb('#c89050');
    const prof = [[0.0, -0.3], [0.2, -0.3], [0.27, -0.22], [0.31, -0.08], [0.32, 0.0], [0.31, 0.08], [0.27, 0.22], [0.2, 0.3], [0.0, 0.3]];
    BB.lathe(0, 0, 0, prof, 10, (i) => (i === 2 || i === 6 ? hoop : staveC));
    BB.cyl(0, 0.28, 0, 0, 0.75, 0, 0.02, 0.02, 4, rgb('#4a3020'), true);
    // Laterne/Fähnchen an der Stange
    BB.quad([0, 0.75, 0.0], [0.34, 0.68, 0.0], [0.34, 0.5, 0.0], [0, 0.45, 0.0], enemy ? rgb('#b02a1c') : rgb('#2a56b0'));
    const bgeo = BB.toGeometry({ color: true });
    const bmat = new THREE.MeshStandardMaterial({ map: wood.map, vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    this.floaters = new THREE.InstancedMesh(bgeo, bmat, 8);
    this.floaters.frustumCulled = false;
    this._floatPos = [];
    const off = half + 1.0;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this._floatPos.push({ x: cx + sx * off, z: cz + sz * off, s: 1.25, ph: Math.random() * 6 });
    for (const [sx, sz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) this._floatPos.push({ x: cx + sx * (half + 0.95), z: cz + sz * (half + 0.95), s: 0.85, ph: Math.random() * 6 });
    const col = new THREE.Color();
    for (let i = 0; i < 8; i++) {
      col.set(i < 4 ? 0xffffff : (enemy ? 0xffb0a0 : 0xa8d0ff));
      this.floaters.setColorAt(i, col);
    }
    this.floaters.instanceColor.needsUpdate = true;
    this.group.add(this.floaters);
  }

  _buildLabels() {
    const atlas = createLabelAtlas(COL_LABELS, ROW_LABELS);
    const enemy = this.side === 'enemy';
    const cx = this.center.x, cz = this.center.z;
    const pos = [], uv = [], cen = [], idx = [];
    const tilt = 1.0;
    const rx = [1, 0, 0];
    const ux = [0, Math.sin(tilt), -Math.cos(tilt)];
    const size = 1.05;
    const addPlaque = (x, z, k) => {
      const y = 0.4;
      const c = [x, y, z];
      const cols = 5, rowsN = 4;
      const u0 = (k % cols) / cols, v0 = 1 - (Math.floor(k / cols) + 1) / rowsN;
      const du = 1 / cols, dv = 1 / rowsN;
      const base = pos.length / 3;
      for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
        pos.push(x + rx[0] * a * size, y + ux[1] * b * size, z + ux[2] * b * size);
        cen.push(c[0], c[1], c[2]);
        uv.push(u0 + (a + 0.5) * du, v0 + (b + 0.5) * dv);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const zS = cz + BOARD_HALF + 1.9;
    const xO = cx + (enemy ? 1 : -1) * (BOARD_HALF + 1.9);
    for (let i = 0; i < BOARD_SIZE; i++) addPlaque(cx + (i - 4.5) * CELL, zS, 10 + i);
    for (let j = 0; j < BOARD_SIZE; j++) addPlaque(xO, cz + (j - 4.5) * CELL, j);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aCenter', new THREE.Float32BufferAttribute(cen, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.timeU, uMap: { value: atlas } },
      vertexShader: `${WAVES_GLSL}
        uniform float uTime; attribute vec3 aCenter; varying vec2 vUv;
        void main() { vUv = uv; vec3 n; vec3 d = gerstnerDisplace(aCenter.xz, uTime, n);
          gl_Position = projectionMatrix * viewMatrix * vec4(position + d, 1.0); }`,
      fragmentShader: `uniform sampler2D uMap; varying vec2 vUv;
        void main() { vec4 c = texture2D(uMap, vUv); if (c.a < 0.45) discard; gl_FragColor = vec4(c.rgb * 1.15, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.DoubleSide,
    });
    this.labels = new THREE.Mesh(g, mat);
    this.labels.frustumCulled = false;
    this.group.add(this.labels);
  }

  // ------------------------------------------------------------ Update
  _update(dt, t) {
    this.timeU.value = t;
    // Aktiv-Hervorhebung weich
    const target = this.active ? 1 : 0;
    this._activeAmt += (target - this._activeAmt) * (1 - Math.exp(-dt * 5));
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    this.gridMat.uniforms.uActive.value = this._activeAmt * (0.65 + 0.35 * pulse);
    this.frameMat.emissiveIntensity = this._activeAmt * (0.05 + 0.12 * pulse);

    // Fässer/Bojen
    const fl = this.floaters;
    for (let i = 0; i < this._floatPos.length; i++) {
      const f = this._floatPos[i];
      const h = getWaveHeight(f.x, f.z, t);
      getWaveNormal(f.x, f.z, t, _n);
      _q.setFromUnitVectors(_up, _n);
      const yaw = Math.sin(t * 0.4 + f.ph) * 0.25 + f.ph;
      _qy.setFromAxisAngle(_up, yaw);
      _q.multiply(_qy);
      _p.set(f.x, h - 0.09 * f.s + 0.04 * Math.sin(t * 1.7 + f.ph), f.z);
      _s.set(f.s, f.s, f.s);
      _m.compose(_p, _q, _s);
      fl.setMatrixAt(i, _m);
    }
    fl.instanceMatrix.needsUpdate = true;

    const mk = this.markers;
    mk.miss.update(t);
    mk.hit.update(t);
    mk.blocked.update(t);
    mk.rings.update(t);
  }
}
