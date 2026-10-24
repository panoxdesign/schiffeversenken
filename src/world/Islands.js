// Prozedurale Szenerie: Inseln (Strand, Grün, Felsen, Palmen), Fort, Leuchtturm, Brandungsfelsen.
// Alles wird beim Start zu wenigen statischen Meshes gemerged (Terrain, Laub, Lichter, Schaum, Glühen).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, fbm2D, valueNoise2D } from '../core/noise.js';
import { WAVES_GLSL } from './waves.js';
import { NOISE_GLSL } from '../core/noise.js';
import { finish, xform, paint, tube } from './geo.js';
import { ISLANDS, ROCKS } from './layout.js';

const C = (hex) => new THREE.Color(hex);
const lerpC = (a, b, t, out) => out.copy(a).lerp(b, t);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const COL = {
  wetSand: C('#8c7955'),
  sand: C('#d6bd8a'),
  sandHi: C('#e8d3a0'),
  grassDark: C('#2c5a24'),
  grassLight: C('#5d8a2c'),
  grassDry: C('#8c9a45'),
  rock: C('#6d6358'),
  rockDark: C('#4a443f'),
  rockLight: C('#8c8174'),
  stone: C('#a89f90'),
  stoneDark: C('#7d7568'),
  roof: C('#a2412a'),
  white: C('#e9e4da'),
  red: C('#b83a2e'),
  wood: C('#5e4228'),
  woodDark: C('#3c2a1a'),
  trunkA: C('#6b4c2f'),
  trunkB: C('#503820'),
  leafBase: C('#285e22'),
  leafTip: C('#5f9a2e'),
  leafDry: C('#7f9a32'),
  iron: C('#2b2b2e'),
};

/** Höhenfunktion einer Insel in lokalen Koordinaten. */
function makeHeightFn(def) {
  const seed = def.seed;
  const H = def.height;
  const R = def.radius;
  const rad = (th) => R * (0.82 + 0.38 * fbm2D(Math.cos(th) * 1.3 + seed * 0.7, Math.sin(th) * 1.3 + seed * 0.3, 3, seed));
  const plateau = def.plateau || null; // {x,z,r,y}
  const fn = (lx, lz) => {
    const r = Math.hypot(lx, lz);
    const th = Math.atan2(lz, lx);
    const u = Math.min(1, Math.max(0, 1 - r / rad(th)));
    const prof = u * u * (3 - 2 * u);
    let y = -1.9 + (H + 1.9) * Math.pow(prof, 1.05);
    const n = fbm2D(lx * 0.085 + seed * 3.1, lz * 0.085 + seed * 1.7, 4, seed) - 0.5;
    y += n * H * 1.0 * smooth(0.08, 0.45, u);
    const n2 = valueNoise2D(lx * 0.4 + seed, lz * 0.4, seed + 5) - 0.5;
    y += n2 * 0.5 * smooth(0.1, 0.4, u);
    if (plateau) {
      const d = Math.hypot(lx - plateau.x, lz - plateau.z);
      y += (plateau.y - y) * (1 - smooth(plateau.r, plateau.r * 1.9, d));
    }
    return y;
  };
  fn.rad = rad;
  return fn;
}

function buildTerrain(def, hFn) {
  const RINGS = 20;
  const SEG = 56;
  const pos = [];
  pos.push(0, hFn(0, 0), 0);
  for (let i = 1; i <= RINGS; i++) {
    const rr = i / RINGS;
    for (let a = 0; a < SEG; a++) {
      const th = (a / SEG) * Math.PI * 2;
      const rad = hFn.rad(th) * rr;
      const x = Math.cos(th) * rad;
      const z = Math.sin(th) * rad;
      pos.push(x, hFn(x, z), z);
    }
  }
  const idx = [];
  const ring = (i, a) => 1 + (i - 1) * SEG + (a % SEG);
  for (let a = 0; a < SEG; a++) idx.push(0, ring(1, a + 1), ring(1, a));
  for (let i = 1; i < RINGS; i++) {
    for (let a = 0; a < SEG; a++) {
      const i0 = ring(i, a), i1 = ring(i, a + 1), o0 = ring(i + 1, a), o1 = ring(i + 1, a + 1);
      idx.push(i0, i1, o1, i0, o1, o0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const tmp = new THREE.Color();
  const seed = def.seed;
  paint(g, (x, y, z, nx, ny, nz, out) => {
    const nn = valueNoise2D(x * 0.35 + seed, z * 0.35, seed);
    const nb = fbm2D(x * 0.07 + seed, z * 0.07, 3, seed + 2);
    if (y < 0.35) {
      lerpC(COL.wetSand, COL.sand, smooth(-0.2, 0.35, y), out);
    } else if (y < 1.5) {
      lerpC(COL.sand, COL.sandHi, nn, out);
      const gt = smooth(0.95, 1.7, y + (nb - 0.5) * 1.2);
      lerpC(out, lerpC(COL.grassDry, COL.grassLight, nn, tmp), gt, out);
    } else {
      lerpC(COL.grassDark, COL.grassLight, smooth(0.25, 0.75, nb * 0.7 + nn * 0.5), out);
      out.lerp(COL.grassDry, smooth(0.5, 0.9, nb) * 0.45);
    }
    // steile Hänge = Fels
    const rockiness = smooth(0.82, 0.62, ny);
    if (rockiness > 0) out.lerp(lerpC(COL.rock, COL.rockLight, nn, tmp), rockiness * (y > 2.2 ? 1 : y > 1.0 ? 0.55 : 0.08));
    if (y < -0.3) out.multiplyScalar(0.7);
  });
  return finish(g);
}

function makeRockGeo(seed, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = valueNoise2D(x * 1.6 + z * 1.1 + seed, y * 1.8 + z * 0.9, seed) - 0.5;
    const n2 = valueNoise2D(x * 3.7 + seed * 2, z * 3.3 + y * 2.1, seed + 3) - 0.5;
    const s = 1 + n * 0.7 + n2 * 0.25;
    pos.setXYZ(i, x * s, y * s, z * s);
  }
  g.computeVertexNormals();
  return g;
}

function paintRock(g, seed, mossy) {
  const tmp = new THREE.Color();
  paint(g, (x, y, z, nx, ny, nz, out) => {
    const nn = valueNoise2D(x * 0.8 + seed, z * 0.8 + y * 0.5, seed);
    lerpC(COL.rockDark, COL.rockLight, nn * 0.8 + ny * 0.2, out);
    if (mossy && ny > 0.55 && y > 0.3) out.lerp(COL.grassDark, 0.65);
    if (y < 0.15) out.multiplyScalar(0.62); // nasse Basis
  });
  return g;
}

/** Palme: gebogener Stamm + Wedel. Schreibt in parts.foliage. */
function addPalm(parts, rng, x, y, z, scale, detail) {
  const Ht = (4.8 + rng() * 2.6) * scale;
  const bend = Ht * (0.18 + rng() * 0.28);
  const ang = rng() * Math.PI * 2;
  const bx = Math.cos(ang), bz = Math.sin(ang);
  const segs = 8;
  const pts = [];
  const radii = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const sx = bend * t * t;
    const wob = Math.sin(t * 5 + rng()) * 0.05 * Ht * 0;
    pts.push(new THREE.Vector3(x + bx * sx + wob, y + Ht * (t - 0.12 * t * t), z + bz * sx));
    radii.push((0.3 - 0.14 * t) * scale);
  }
  const trunk = tube(pts, radii, 6, (t, out) => {
    const band = Math.floor(t * Ht / (0.38 * scale)) % 2;
    out.copy(band ? COL.trunkA : COL.trunkB);
    out.multiplyScalar(0.85 + 0.3 * t);
  });
  const trunkG = finish(trunk, null, 0);
  const sw = trunkG.attributes.aSway;
  const tp = trunkG.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const hh = (tp.getY(i) - y) / Ht;
    sw.setX(i, hh * hh * 0.55);
  }
  parts.foliage.push(trunkG);

  const top = pts[segs];
  const nF = detail >= 2 ? 9 : detail === 1 ? 8 : 6;
  const SEGS = detail >= 2 ? 6 : 5;
  const verts = [];
  const cols = [];
  const sways = [];
  const idxs = [];
  const tmp = new THREE.Color();
  const leafTint = rng();
  for (let f = 0; f < nF; f++) {
    const phi = (f / nF) * Math.PI * 2 + rng() * 0.5;
    const dx = Math.cos(phi), dz = Math.sin(phi);
    const px = -dz, pz = dx;
    const L = (2.9 + rng() * 1.1) * scale;
    const rise = 0.35 + rng() * 0.5;
    const droop = 0.9 + rng() * 0.5;
    const base = verts.length / 3;
    for (let s = 0; s <= SEGS; s++) {
      const t = s / SEGS;
      const cx = top.x + dx * L * t;
      const cz = top.z + dz * L * t;
      const cy = top.y + 0.15 + L * (rise * t - droop * t * t) * 0.9;
      const w = (0.62 * scale) * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * t)), 0.7) * (1 - 0.35 * t) + 0.02;
      const fold = 0.28 * w;
      verts.push(cx - px * w, cy - fold, cz - pz * w, cx, cy, cz, cx + px * w, cy - fold, cz + pz * w);
      lerpC(COL.leafBase, COL.leafTip, Math.pow(t, 0.8), tmp);
      if (leafTint > 0.7) tmp.lerp(COL.leafDry, 0.35 * t);
      for (let k = 0; k < 3; k++) {
        const m = k === 1 ? 1.12 : 1;
        cols.push(tmp.r * m, tmp.g * m, tmp.b * m);
        sways.push(0.55 + 0.45 * t);
      }
      if (s > 0) {
        const a = base + (s - 1) * 3, b = base + s * 3;
        idxs.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sways, 1));
  g.setIndex(idxs);
  g.computeVertexNormals();
  parts.foliage.push(g.toNonIndexed());
}

function addBush(parts, rng, x, y, z, s) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  xform(g, 0, 0, 0, rng() * 6, s * (1 + rng() * 0.6), s * (0.55 + rng() * 0.3), s * (1 + rng() * 0.6));
  xform(g, x, y + s * 0.15, z);
  const tint = rng();
  const fg = finish(g, null, 0.25);
  paint(fg, (px, py, pz, nx, ny, nz, out) => {
    lerpC(COL.grassDark, COL.grassLight, 0.25 + 0.5 * tint + ny * 0.25, out);
  });
  parts.foliage.push(fg);
}

// ---------- Gebäude ----------
function box(list, w, h, d, x, y, z, color, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  xform(g, x, y + h / 2, z, ry);
  list.push(finish(g, color));
}
function cyl(list, rt, rb, h, seg, x, y, z, color, ry = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  xform(g, x, y + h / 2, z, ry);
  list.push(finish(g, color));
}

function jitter(c, rng, a = 0.1) {
  const k = 1 + (rng() - 0.5) * a * 2;
  return c.clone().multiplyScalar(k);
}

function buildFort(parts, rng, ox, oy, oz, yaw) {
  const T = [];
  const stone = COL.stone;
  const W = 7;
  // Sockel
  box(T, 16.5, 2.4, 16.5, 0, -2, 0, COL.stoneDark);
  // Mauern (Vorderseite +z mit Torlücke)
  const wallH = 3.4;
  const thick = 1.5;
  box(T, 5.6, wallH, thick, -4.2, 0, W, jitter(stone, rng));
  box(T, 5.6, wallH, thick, 4.2, 0, W, jitter(stone, rng));
  box(T, 3, 1.2, thick, 0, 2.2, W, jitter(stone, rng));
  box(T, 2.6, 2.3, 1.2, 0, 0, W - 0.2, C('#1b130d'));
  box(T, 14, wallH, thick, 0, 0, -W, jitter(stone, rng));
  box(T, thick, wallH, 14, -W, 0, 0, jitter(stone, rng));
  box(T, thick, wallH, 14, W, 0, 0, jitter(stone, rng));
  // Zinnen
  const cren = (x, z, ry) => box(T, 0.85, 0.9, thick + 0.1, x, wallH, z, jitter(COL.stone, rng, 0.12), ry);
  for (let i = -6; i <= 6; i += 1.75) {
    if (Math.abs(i) > 1.9) cren(i, W, 0);
    cren(i, -W, 0);
    cren(W, i, Math.PI / 2);
    cren(-W, i, Math.PI / 2);
  }
  // Türme
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      cyl(T, 2.0, 2.2, 6.4, 10, sx * W, 0, sz * W, jitter(COL.stone, rng, 0.08));
      cyl(T, 2.45, 2.45, 0.55, 10, sx * W, 6.4, sz * W, COL.stoneDark);
      cyl(T, 0.0, 2.55, 2.9, 10, sx * W, 6.95, sz * W, COL.roof);
    }
  }
  // Bergfried
  box(T, 6, 8, 6, 0, 0, -1.5, jitter(stone, rng, 0.05));
  box(T, 6.6, 0.5, 6.6, 0, 8, -1.5, COL.stoneDark);
  const roofG = new THREE.CylinderGeometry(0, 5.0, 3.6, 4);
  xform(roofG, 0, 8.5 + 1.8, -1.5, Math.PI / 4);
  T.push(finish(roofG, COL.roof));
  // Fahnenmast
  cyl(T, 0.09, 0.09, 4.2, 5, 0, 12.1, -1.5, COL.woodDark);
  // Kanonen auf der Mauer
  for (const cx of [-5.4, -3.2, 3.2, 5.4]) {
    const g = new THREE.CylinderGeometry(0.22, 0.28, 1.5, 8);
    xform(g, cx, wallH + 0.25, W + 0.55, 0, 1, 1, 1, Math.PI / 2 - 0.12);
    T.push(finish(g, COL.iron));
  }
  // Fenster (leuchtend)
  const lamps = parts.lamps;
  const L2 = [];
  for (const wx of [-1.7, 0, 1.7]) {
    box(L2, 0.6, 1.0, 0.12, wx, 4.4, 1.55, C('#ffb860'));
  }
  box(L2, 2.6, 0.12, 0.1, 0, 0.0, W + 0.6, C('#ff9a3c')); // Torfackel-Schimmer
  for (const g of L2) lamps.push(g);

  const m = new THREE.Matrix4().makeRotationY(yaw);
  m.setPosition(ox, oy, oz);
  for (const g of T) { g.applyMatrix4(m); parts.terrain.push(g); }
  for (const g of L2) g.applyMatrix4(m);
  // Flagge (Laub-Material, schwingt)
  const flag = new THREE.PlaneGeometry(2.6, 1.5, 4, 1);
  xform(flag, 1.3, 15.2, 0, 0);
  flag.translate(0, 0, -1.5);
  const fg = finish(flag, C('#1a1612'));
  const sw = new Float32Array(fg.attributes.position.count);
  for (let i = 0; i < sw.length; i++) sw[i] = Math.max(0, fg.attributes.position.getX(i) - 0.2) * 0.5;
  fg.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  fg.applyMatrix4(m);
  parts.foliage.push(fg);
  parts.glow.push(new THREE.Vector3(0, 4.4, 1.6).applyMatrix4(m), new THREE.Vector3(0, 1.3, W + 0.9).applyMatrix4(m));
}

function buildLighthouse(parts, rng, ox, oy, oz, yaw) {
  const T = [];
  T.push(finish(xform(new THREE.CylinderGeometry(3.0, 3.4, 2.6, 14), 0, -1.4, 0), COL.stoneDark));
  const bands = [COL.white, COL.red, COL.white, COL.red];
  const H = 13;
  const bh = H / 4;
  for (let i = 0; i < 4; i++) {
    const r0 = 2.05 - (i / 4) * 0.8;
    const r1 = 2.05 - ((i + 1) / 4) * 0.8;
    cyl(T, r1, r0, bh, 16, 0, 1.2 + i * bh, 0, bands[i]);
  }
  const top = 1.2 + H;
  cyl(T, 2.0, 1.4, 0.45, 16, 0, top, 0, COL.iron);
  cyl(T, 1.5, 1.5, 0.2, 14, 0, top + 0.45, 0, COL.woodDark);
  cyl(T, 0.0, 1.55, 1.3, 14, 0, top + 2.15, 0, COL.red);
  cyl(T, 0.12, 0.12, 0.9, 6, 0, top + 3.4, 0, COL.iron);
  // Wärterhaus
  box(T, 3.4, 2.4, 3.0, 4.2, -0.1, 1.2, COL.white, 0.2);
  const roof = new THREE.CylinderGeometry(0, 2.9, 1.5, 4);
  xform(roof, 4.2, 2.3 + 0.75, 1.2, Math.PI / 4 + 0.2);
  T.push(finish(roof, COL.roof));
  box(T, 0.7, 1.2, 0.2, 4.0, -0.1, 2.75, COL.woodDark, 0.2);
  // Laterne (leuchtend)
  const lamp = [];
  cyl(lamp, 0.9, 0.9, 1.5, 12, 0, top + 0.65, 0, C('#ffe2a0'));
  for (const g of lamp) parts.lamps.push(g);
  const m = new THREE.Matrix4().makeRotationY(yaw);
  m.setPosition(ox, oy, oz);
  for (const g of T) { g.applyMatrix4(m); parts.terrain.push(g); }
  for (const g of lamp) g.applyMatrix4(m);
  const lampPos = new THREE.Vector3(0, top + 1.4, 0).applyMatrix4(m);
  parts.glow.push(lampPos);
  parts.beams.push(lampPos.clone());
}

function makeBeamGeometry() {
  // Zwei gegenüberliegende Strahlen, je als Kreuz aus zwei Dreiecken (Additiv, verblasst nach außen)
  const pos = [];
  const col = [];
  const len = 70;
  const w = 1.6;
  const add = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    col.push(0.1, 0.07, 0.03, 0, 0, 0, 0, 0, 0);
  };
  for (const dir of [1, -1]) {
    add(0, 0, 0, dir * len, 0, -w * 2.2, dir * len, 0, w * 2.2);
    add(0, 0, 0, dir * len, -w * 1.4, 0, dir * len, w * 1.4, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.15, 'rgba(255,200,120,0.7)');
  g.addColorStop(0.5, 'rgba(255,150,60,0.18)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- Schaumsaum (folgt den Wellen) ----------
const SHORE_VERT = /* glsl */ `
uniform float uTime;
attribute float aAlpha;
varying float vAlpha;
varying vec2 vXZ;
#include <fog_pars_vertex>
${WAVES_GLSL}
void main() {
  vec3 wp = position;
  float fade = 1.0 - smoothstep(110.0, 320.0, length(wp.xz));
  wp.y = gerstnerHeight(wp.xz, uTime) * fade + 0.07;
  vAlpha = aAlpha;
  vXZ = wp.xz;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const SHORE_FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D uDetail;
uniform vec3 uFoamLight;
varying float vAlpha;
varying vec2 vXZ;
#include <fog_pars_fragment>
void main() {
  float l = texture2D(uDetail, vXZ * 0.11 + vec2(uTime * 0.01, -uTime * 0.008)).a;
  float l2 = texture2D(uDetail, vXZ * 0.23 - vec2(uTime * 0.012, 0.0)).a;
  float pulse = 0.78 + 0.22 * sin(uTime * 0.9 + vXZ.x * 0.15 + vXZ.y * 0.1);
  float a = smoothstep(0.12, 0.7, vAlpha * 0.85 + (l * 0.6 + l2 * 0.4) * 0.65 - 0.25) * vAlpha * pulse;
  gl_FragColor = vec4(uFoamLight, a * 0.9);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function ringGeometry(contours) {
  // contours: Array<{cx,cz,pts:[{x,z,nx,nz}]}> → 3 Vertex-Ringe pro Kontur
  const pos = [];
  const alp = [];
  const idx = [];
  const prof = [[-0.7, 0.55], [0.1, 1.0], [1.3, 0.55], [3.2, 0.0]];
  for (const c of contours) {
    const n = c.pts.length;
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const p = c.pts[i];
      for (const [off, a] of prof) {
        pos.push(p.x + p.nx * off, 0, p.z + p.nz * off);
        alp.push(a);
      }
    }
    const K = prof.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      for (let k = 0; k < K - 1; k++) {
        const a = base + i * K + k, b = base + j * K + k, c2 = base + i * K + k + 1, d = base + j * K + k + 1;
        idx.push(a, b, d, a, d, c2); // Material ist DoubleSide
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alp, 1));
  g.setIndex(idx);
  return g;
}

export class Islands {
  /**
   * @param {object} engine
   * @param {object} opts { detailTex, uniformsShared: {uMid?, ...}, timeUniform }
   */
  constructor(engine, opts) {
    this.engine = engine;
    this.group = new THREE.Group();
    this.timeU = opts.timeUniform;
    const detail = engine.quality.detail;
    const parts = { terrain: [], foliage: [], lamps: [], glow: [], beams: [] };
    const contours = [];
    this.info = [];

    // --- Inseln ---
    for (const def0 of ISLANDS) {
      const def = { ...def0 };
      const rng = createRng(def.seed * 977 + 13);
      // Plateaus für Bauwerke (lokal im Zentrum)
      if (def.feature === 'fort') def.plateau = { x: 0, z: 0, r: 10, y: def.height * 0.62 };
      if (def.feature === 'lighthouse') def.plateau = { x: 0, z: 0, r: 6, y: def.height * 0.7 };
      const hFn = makeHeightFn(def);
      const terr = buildTerrain(def, hFn);
      terr.translate(def.x, 0, def.z);
      parts.terrain.push(terr);

      // Küstenlinie (y=0) für Schaum
      const A = 72;
      const pts = [];
      for (let a = 0; a < A; a++) {
        const th = (a / A) * Math.PI * 2;
        const R = hFn.rad(th);
        let lo = 0.2, hi = 1.0;
        for (let it = 0; it < 22; it++) {
          const mid = (lo + hi) / 2;
          const yy = hFn(Math.cos(th) * R * mid, Math.sin(th) * R * mid);
          if (yy > 0) lo = mid; else hi = mid;
        }
        const rr = (lo + hi) / 2 * R;
        pts.push({ x: def.x + Math.cos(th) * rr, z: def.z + Math.sin(th) * rr, nx: Math.cos(th), nz: Math.sin(th) });
      }
      contours.push({ pts });
      this.info.push({ x: def.x, z: def.z, radius: pts.reduce((s, p) => s + Math.hypot(p.x - def.x, p.z - def.z), 0) / A });

      // Bauwerke
      const cx = def.x, cz = def.z;
      if (def.feature === 'fort') buildFort(parts, rng, cx, def.plateau.y, cz, def.yaw);
      if (def.feature === 'lighthouse') buildLighthouse(parts, rng, cx, def.plateau.y, cz, def.yaw);

      // Vegetation
      const palmN = Math.round(def.palms * [0.55, 0.85, 1][detail]);
      let placed = 0;
      let tries = 0;
      while (placed < palmN && tries < 400) {
        tries++;
        const th = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng()) * def.radius * 0.85;
        const lx = Math.cos(th) * rr, lz = Math.sin(th) * rr;
        const y = hFn(lx, lz);
        if (y < 0.8 || y > def.height * 0.62) continue;
        if (def.plateau && Math.hypot(lx - def.plateau.x, lz - def.plateau.z) < def.plateau.r * (def.feature === 'fort' ? 1.7 : 1.5)) continue;
        const sl = Math.hypot(hFn(lx + 0.8, lz) - hFn(lx - 0.8, lz), hFn(lx, lz + 0.8) - hFn(lx, lz - 0.8)) / 1.6;
        if (sl > 0.55) continue;
        addPalm(parts, rng, def.x + lx, y - 0.25, def.z + lz, 0.85 + rng() * 0.55, detail);
        placed++;
      }
      const bushN = [8, 14, 20][detail];
      placed = 0; tries = 0;
      while (placed < bushN && tries < 300) {
        tries++;
        const th = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng()) * def.radius * 0.85;
        const lx = Math.cos(th) * rr, lz = Math.sin(th) * rr;
        const y = hFn(lx, lz);
        if (y < 1.2) continue;
        if (def.plateau && Math.hypot(lx - def.plateau.x, lz - def.plateau.z) < def.plateau.r * 1.5) continue;
        addBush(parts, rng, def.x + lx, y, def.z + lz, 0.9 + rng() * 1.4);
        placed++;
      }
      // Felsbrocken auf der Insel
      const rockN = [3, 5, 7][detail];
      placed = 0; tries = 0;
      while (placed < rockN && tries < 300) {
        tries++;
        const th = rng() * Math.PI * 2;
        const rr = (0.35 + rng() * 0.55) * def.radius * 0.8;
        const lx = Math.cos(th) * rr, lz = Math.sin(th) * rr;
        const y = hFn(lx, lz);
        if (y < 0.1) continue;
        if (def.plateau && Math.hypot(lx - def.plateau.x, lz - def.plateau.z) < def.plateau.r * 1.4) continue;
        const s = 0.9 + rng() * 2.2;
        const g = makeRockGeo(def.seed + placed * 7, detail ? 1 : 0);
        xform(g, 0, 0, 0, rng() * 6, s * 1.2, s * 0.8, s);
        xform(g, def.x + lx, y + s * 0.15, def.z + lz);
        parts.terrain.push(paintRock(finish(g), def.seed + placed, true));
        placed++;
      }
    }

    // --- Brandungsfelsen im Wasser ---
    for (const r of ROCKS) {
      const rng = createRng(r.seed * 131 + 7);
      const n = 2 + (rng() * 2 | 0);
      for (let i = 0; i < n; i++) {
        const main = i === 0;
        const s = r.s * (main ? 1 : 0.4 + rng() * 0.35);
        const ox = main ? 0 : (rng() - 0.5) * r.s * 2.4;
        const oz = main ? 0 : (rng() - 0.5) * r.s * 2.4;
        const g = makeRockGeo(r.seed + i * 5, detail ? 1 : 0);
        xform(g, 0, 0, 0, rng() * 6, s * 0.95, s * (main ? 1.5 : 1.1), s * 0.95);
        xform(g, r.x + ox, s * 0.25, r.z + oz);
        parts.terrain.push(paintRock(finish(g), r.seed + i, false));
        const wr = s * 0.95;
        const pts = [];
        for (let a = 0; a < 20; a++) {
          const th = (a / 20) * Math.PI * 2;
          pts.push({ x: r.x + ox + Math.cos(th) * wr, z: r.z + oz + Math.sin(th) * wr, nx: Math.cos(th), nz: Math.sin(th) });
        }
        contours.push({ pts });
      }
    }

    // --- Materialien & Meshes ---
    const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const foliageMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const timeU = this.timeU;
    foliageMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeU;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSway;\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float swA = aSway;
          transformed.x += sin(uTime * 1.7 + position.x * 0.35 + position.z * 0.21) * swA * 0.2;
          transformed.z += cos(uTime * 1.3 + position.z * 0.3 + position.x * 0.27) * swA * 0.16;
          transformed.y += sin(uTime * 2.3 + position.x * 0.7 + position.z * 0.4) * swA * 0.05;`);
    };
    foliageMat.customProgramCacheKey = () => 'islandFoliage';

    const merge = (list) => {
      const g = mergeGeometries(list, false);
      g.computeBoundingSphere();
      return g;
    };
    const tMesh = new THREE.Mesh(merge(parts.terrain), terrainMat);
    const fMesh = new THREE.Mesh(merge(parts.foliage), foliageMat);
    tMesh.frustumCulled = false;
    fMesh.frustumCulled = false;
    this.group.add(tMesh, fMesh);
    this.terrainMesh = tMesh;

    const lampMesh = new THREE.Mesh(merge(parts.lamps.map((g) => (g.attributes.color ? g : finish(g)))), new THREE.MeshBasicMaterial({ vertexColors: true }));
    lampMesh.frustumCulled = false;
    this.group.add(lampMesh);
    // Lampenfarben HDR-ig anheben
    const lc = lampMesh.geometry.attributes.color;
    for (let i = 0; i < lc.count * 3; i++) lc.array[i] *= 2.4;

    // Schaumsaum
    const shoreMat = new THREE.ShaderMaterial({
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
        uTime: opts.timeUniform,
        uDetail: { value: opts.detailTex },
        uFoamLight: { value: new THREE.Color(1, 1, 1) },
      }),
      vertexShader: SHORE_VERT,
      fragmentShader: SHORE_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
    });
    this.shoreMat = shoreMat;
    const shore = new THREE.Mesh(ringGeometry(contours), shoreMat);
    shore.frustumCulled = false;
    shore.renderOrder = 2;
    this.group.add(shore);

    // Leuchten-Glühen
    const gp = new Float32Array(parts.glow.length * 3);
    parts.glow.forEach((v, i) => v.toArray(gp, i * 3));
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(gp, 3));
    this.glowMat = new THREE.PointsMaterial({
      map: makeGlowTexture(),
      size: 9,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      color: 0xffc080,
    });
    const glow = new THREE.Points(gg, this.glowMat);
    glow.frustumCulled = false;
    this.group.add(glow);

    // Leuchtfeuer-Strahlen
    this.beams = [];
    if (parts.beams.length) {
      const bg = makeBeamGeometry();
      const bm = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      for (const p of parts.beams) {
        const mesh = new THREE.Mesh(bg, bm);
        mesh.position.copy(p);
        mesh.frustumCulled = false;
        mesh.renderOrder = 3;
        this.group.add(mesh);
        this.beams.push(mesh);
      }
    }

    engine.scene.add(this.group);
    this._off = engine.onUpdate((dt, time) => {
      for (let i = 0; i < this.beams.length; i++) this.beams[i].rotation.y = time * 0.7;
      this.glowMat.opacity = 0.75 + 0.25 * Math.sin(time * 2.1);
    }, 0);
  }
}
