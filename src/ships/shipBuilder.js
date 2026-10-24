// Prozeduraler Schiffsbau: Rumpf (Loft mit Sprung, Bugspriet, Heckkastell), Masten, Rahen, Segel, Takelage.
// Lokales Koordinatensystem: +x = Bug, +y = oben, +z = Steuerbord, y=0 = Wasserlinie, Ursprung = Mitte der belegten Zellen.
import * as THREE from 'three';
import { CELL } from '../config.js';
import { MeshBuilder, rgb, mixRgb } from './MeshBuilder.js';
import { SAIL_UV } from './textures.js';

const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

const PAL = {
  player: {
    hull: rgb('#d79a58'), under: rgb('#6a5a48'), band: rgb('#2a3a66'), wale: rgb('#f0c860'),
    deck: rgb('#e0b878'), rail: rgb('#b87a40'), mast: rgb('#b88450'), wall: rgb('#c9955a'),
    iron: rgb('#2c2c32'), brass: rgb('#f0b940'), glass: rgb('#ffcf80'), hatch: rgb('#6a4a2c'),
  },
  enemy: {
    hull: rgb('#6a5244'), under: rgb('#3a3028'), band: rgb('#0e0b0b'), wale: rgb('#a8281c'),
    deck: rgb('#8a6a4c'), rail: rgb('#42322a'), mast: rgb('#4e3a2c'), wall: rgb('#5a4638'),
    iron: rgb('#1c1a1c'), brass: rgb('#b08a38'), glass: rgb('#ff9a40'), hatch: rgb('#30241c'),
  },
};

export function buildShip({ cells, side, detail = 2, flagship = false, variant = 0 }) {
  const pal = PAL[side];
  const enemy = side === 'enemy';
  const Lc = flagship ? 15.4 : cells * CELL * 0.92;
  const B = flagship ? 3.7 : cells >= 4 ? 1.5 : cells === 3 ? 1.4 : 1.3;
  const hs = B / 1.5;
  const xs = -Lc / 2;
  const xb = Lc / 2 - (flagship ? 1.9 : 0.5 * hs);
  const Lh = xb - xs;
  const hr = 0.34 * hs; // Reling
  const hC = (cells >= 3 ? 0.72 : 0.5) * hs; // Heckkastell
  const tc = flagship ? 0.3 : cells >= 4 ? 0.27 : 0.3;
  const seg = detail === 0 ? 5 : detail === 1 ? 6 : 8;
  const step = (detail === 0 ? 0.5 : detail === 1 ? 0.38 : 0.3) * (flagship ? 1.8 : 1);
  const plankU = 3.2, plankV = 1.9;

  const halfB = (t) => {
    let b;
    if (t < 0.3) b = 0.55 + 0.45 * Math.sin((t / 0.3) * Math.PI * 0.5);
    else if (t < 0.55) b = 1;
    else b = 1 - Math.pow((t - 0.55) / 0.45, 2.1);
    return Math.max(0, b) * B * 0.5;
  };
  const keelY = (t) => -hs * (0.55 - 0.42 * Math.pow(t, 5) - 0.25 * Math.pow(1 - t, 3));
  const deckY = (t) => hs * (0.78 + 0.32 * Math.pow(t, 2.8) + 0.12 * Math.pow(1 - t, 2.2));
  const xoff = (t, s) =>
    0.7 * hs * Math.pow(Math.max(0, s), 1.8) * Math.pow(sstep(0.45, 1, t), 1.5) -
    0.35 * hs * sstep(0.3, 1, s) * (1 - sstep(0, 0.3, t));
  const widthShape = (s) => Math.pow(Math.sin(Math.min(1, Math.max(0, s)) * Math.PI * 0.5), 0.7) * (1 - 0.07 * sstep(0.72, 1, s));
  const raiseAt = (t) => (t <= tc + 1e-6 ? hC : 0);

  /** Punkt auf der Außenhaut bei Station t, absolute Höhe y, Seite (-1/+1), Aufbauhöhe raise. */
  const pt = (t, y, raise, sd) => {
    const yK = keelY(t), yR = deckY(t) + raise + hr;
    const s = (y - yK) / (yR - yK);
    return { x: xs + t * Lh + xoff(t, s), z: sd * halfB(t) * widthShape(s), s };
  };

  // ---------------------------------------------------------------- Rumpf
  const H = new MeshBuilder();
  const stations = [];
  const nA = Math.max(2, Math.ceil((tc * Lh) / step));
  const nB = Math.max(4, Math.ceil(((1 - tc) * Lh) / step));
  for (let i = 0; i <= nA; i++) stations.push({ t: (tc * i) / nA, raise: hC });
  for (let i = 0; i <= nB; i++) {
    const u = i / nB;
    stations.push({ t: tc + (1 - tc) * (u + 0.12 * Math.sin(u * Math.PI) * u * 0 ), raise: 0 });
  }
  const ns = stations.length;
  const rows = [
    { f: 0, c: pal.under },
    { f: 0.22, c: pal.under },
    { f: 0.4, c: mixRgb(pal.under, pal.hull, 0.45) },
    { f: 0.53, c: pal.hull },
    { f: 0.555, c: pal.band },
    { f: 0.8, c: pal.band },
    { f: 0.825, c: pal.wale },
    { f: 0.9, c: pal.hull },
    { f: 1, c: pal.hull },
    { rail: true, c: pal.rail },
  ];
  const K = rows.length;
  const rowY = (st, row) => {
    const yK = keelY(st.t), yD = deckY(st.t) + st.raise;
    return row.rail ? yD + hr : yK + row.f * (yD - yK);
  };

  // Außenhaut (um den Kiel herum)
  H.auxDefault = [1, 1, 0];
  H.grid(ns - 1, 2 * (K - 1), (i, j, o) => {
    const st = stations[i];
    const sd = j < K ? -1 : 1;
    const k = j < K ? K - 1 - j : j - (K - 1);
    const row = rows[k];
    const y = rowY(st, row);
    const p = pt(st.t, y, st.raise, sd);
    o[0] = p.x; o[1] = y; o[2] = p.z;
    o[3] = p.x / plankU;
    o[4] = (sd * ((y - keelY(st.t)) + 0.5 * Math.abs(p.z) * (1 - p.s))) / plankV;
    const c = row.c;
    // Alterung: leichte Variation entlang der Länge
    const v = 0.93 + 0.07 * Math.sin(p.x * 3.1 + y * 5.0);
    o[5] = c[0] * v; o[6] = c[1] * v; o[7] = c[2] * v;
  });

  // Innenwand der Reling, Relingskappe, Deck
  const railTh = 0.07 * hs;
  for (const sd of [-1, 1]) {
    H.auxDefault = [1, 0.3, 0];
    H.grid(ns - 1, 1, (i, j, o) => {
      const st = stations[i];
      const yD = deckY(st.t) + st.raise, yR = yD + hr;
      const top = j === 1;
      const y = top ? yR : yD;
      const pr = pt(st.t, yR, st.raise, sd);
      const pd = pt(st.t, y, st.raise, sd);
      const zi = sd * Math.max(0, Math.abs(pr.z) - railTh);
      o[0] = pd.x; o[1] = y; o[2] = zi;
      o[3] = pd.x / plankU; o[4] = (y * 0.7) / plankV;
      const c = pal.wall;
      o[5] = c[0]; o[6] = c[1]; o[7] = c[2];
    });
    H.grid(ns - 1, 1, (i, j, o) => {
      const st = stations[i];
      const yR = deckY(st.t) + st.raise + hr;
      const pr = pt(st.t, yR, st.raise, sd);
      o[0] = pr.x; o[1] = yR + 0.004;
      o[2] = j === 0 ? pr.z : sd * Math.max(0, Math.abs(pr.z) - railTh);
      o[3] = pr.x / plankU; o[4] = j * 0.2;
      const c = pal.rail;
      o[5] = c[0] * 1.05; o[6] = c[1] * 1.05; o[7] = c[2] * 1.05;
    });
  }
  H.auxDefault = [1, 0.3, 0];
  H.grid(ns - 1, 8, (i, j, o) => {
    const st = stations[i];
    const yD = deckY(st.t) + st.raise, yR = yD + hr;
    const pr = pt(st.t, yR, st.raise, 1);
    const pd = pt(st.t, yD, st.raise, 1);
    const zin = Math.max(0, Math.abs(pr.z) - railTh);
    const w = (j / 8) * 2 - 1;
    o[0] = pd.x; o[1] = yD + 0.05 * hs * (1 - w * w); o[2] = w * zin;
    o[3] = pd.x / plankU; o[4] = (w * zin) / plankV;
    const c = pal.deck;
    o[5] = c[0]; o[6] = c[1]; o[7] = c[2];
  });

  // Heckspiegel (Transom) – gefüllt
  H.auxDefault = [1, 1, 0];
  H.grid(K - 1, 1, (i, j, o) => {
    const st = stations[0];
    const row = rows[i];
    const y = rowY(st, row);
    const p = pt(0, y, hC, j === 0 ? -1 : 1);
    o[0] = p.x; o[1] = y; o[2] = p.z;
    o[3] = p.z / plankU; o[4] = y / plankV;
    const c = row.c;
    o[5] = c[0]; o[6] = c[1]; o[7] = c[2];
  });
  // Heckfenster
  {
    H.auxDefault = [0.5, 0, 0];
    const yD = deckY(0) + hC;
    const yw = yD - 0.3 * hs;
    const n = flagship ? 5 : cells >= 3 ? 3 : 2;
    const pw = pt(0, yw, hC, 1);
    const spacing = (pw.z * 1.5) / n;
    for (let k = 0; k < n; k++) {
      const zc = (k - (n - 1) / 2) * spacing;
      const ww = 0.2 * hs, wh = 0.2 * hs;
      H.box(pw.x - 0.006, yw, zc, 0.03, wh + 0.07 * hs, ww + 0.07 * hs, pal.iron);
      H.quad([pw.x - 0.026, yw - wh / 2, zc + ww / 2], [pw.x - 0.026, yw - wh / 2, zc - ww / 2], [pw.x - 0.026, yw + wh / 2, zc - ww / 2], [pw.x - 0.026, yw + wh / 2, zc + ww / 2], pal.glass);
    }
    // Zierleiste unter dem Heck
    H.box(pw.x - 0.01, yD - 0.02 * hs, 0, 0.04, 0.04 * hs, pw.z * 2 * 0.98, pal.wale);
  }

  // Front des Heckkastells
  {
    H.auxDefault = [1, 0, 0];
    const yA = deckY(tc), yB = yA + hC;
    const st = pt(tc, yA + 0.2 * hs, 0, 1);
    const zin = Math.abs(st.z) - railTh;
    const x = xs + tc * Lh;
    const c = pal.wall;
    H.grid(1, 8, (i, j, o) => {
      const w = (j / 8) * 2 - 1;
      o[0] = x; o[1] = i === 0 ? yA : yB; o[2] = w * zin;
      o[3] = (w * zin) / plankU; o[4] = i * 0.4;
      o[5] = c[0]; o[6] = c[1]; o[7] = c[2];
    });
    // Tür, Fenster
    H.box(x + 0.02, yA + hC * 0.38, 0, 0.04, hC * 0.72, 0.42 * hs, pal.hatch);
    H.box(x + 0.045, yA + hC * 0.4, 0.12 * hs, 0.03, 0.06, 0.04, pal.brass);
    for (const sd of [-1, 1]) {
      H.box(x + 0.03, yA + hC * 0.6, sd * zin * 0.6, 0.03, hC * 0.34, hC * 0.3, pal.iron);
      H.quad([x + 0.05, yA + hC * 0.46, sd * zin * 0.6 + hC * 0.12], [x + 0.05, yA + hC * 0.46, sd * zin * 0.6 - hC * 0.12], [x + 0.05, yA + hC * 0.74, sd * zin * 0.6 - hC * 0.12], [x + 0.05, yA + hC * 0.74, sd * zin * 0.6 + hC * 0.12], pal.glass);
    }
  }

  // ---------------------------------------------------------------- Kanonen & Stückpforten
  const cannons = [];
  const facing = side === 'player' ? 1 : -1;
  {
    const nPorts = flagship ? 8 : Math.max(0, Math.round(((0.8 - tc - 0.08) * Lh) / (1.05 * hs)));
    const t0 = tc + 0.09, t1 = 0.8;
    for (let k = 0; k < nPorts; k++) {
      const t = nPorts === 1 ? (t0 + t1) / 2 : t0 + ((t1 - t0) * k) / (nPorts - 1);
      for (const sd of [-1, 1]) {
        const yK = keelY(t), yD = deckY(t);
        const yp = yK + 0.675 * (yD - yK);
        const p = pt(t, yp, 0, sd);
        H.auxDefault = [0.6, 0.2, 0];
        H.box(p.x, yp, p.z + sd * 0.012, 0.3 * hs, 0.23 * hs, 0.05, pal.iron);
        const open = !flagship || sd === facing;
        if (open && (cells >= 3 || flagship)) {
          const len = (flagship ? 0.36 : 0.28) * hs;
          H.auxDefault = [0.3, 0, 0];
          H.cyl(p.x, yp - 0.01, p.z, p.x, yp - 0.01, p.z + sd * len, 0.085 * hs, 0.065 * hs, 7, pal.iron, true);
          H.cyl(p.x, yp - 0.01, p.z + sd * len * 0.96, p.x, yp - 0.01, p.z + sd * len * 1.04, 0.078 * hs, 0.078 * hs, 7, pal.brass, false);
          if (flagship && sd === facing) cannons.push([p.x, yp - 0.01, p.z + sd * len * 1.05]);
        }
      }
    }
  }

  // ---------------------------------------------------------------- Bugspriet, Galionsfigur, Ruder
  const bowDeckT = 0.97;
  const bowDeckY = deckY(bowDeckT);
  const bowX = xb + 0.7 * hs * 0.3;
  const tipX = xb + 1.05 * hs * (flagship ? 1.1 : 1);
  const tipY = bowDeckY + 0.72 * hs;
  H.auxDefault = [0.4, 0, 0];
  H.cyl(xb - 0.9 * hs, bowDeckY - 0.1 * hs, 0, tipX, tipY, 0, 0.075 * hs, 0.035 * hs, seg, pal.mast, true);
  // Galionsfigur: goldene Nase unter dem Bugspriet
  {
    const p = pt(0.995, keelY(1) + (deckY(1) - keelY(1)) * 0.78, 0, 1);
    H.cyl(p.x - 0.05, bowDeckY - 0.12 * hs, 0, p.x + 0.34 * hs, bowDeckY - 0.38 * hs, 0, 0.07 * hs, 0.02 * hs, 6, pal.brass, true);
    H.sphere(p.x + 0.05 * hs, bowDeckY - 0.1 * hs, 0, 0.1 * hs, 6, pal.brass, 1.2);
  }
  // Ruder
  {
    const yb = keelY(0) - 0.12 * hs, yt = deckY(0) + 0.1 * hs;
    const pr = pt(0, keelY(0) + 0.25 * hs, hC, 1);
    H.auxDefault = [0.2, 0, 0];
    H.box(pr.x - 0.12 * hs, (yb + yt) / 2 - 0.4 * hs, 0, 0.1 * hs, (yt - yb) * 0.8, 0.14 * hs, pal.hatch);
  }

  // ---------------------------------------------------------------- Masten
  const mastCount = flagship ? 3 : cells >= 4 ? 3 : cells === 3 ? 2 : 1;
  const Hm = flagship ? 12.4 : Math.min(7.6, 2.0 + 0.62 * Lh);
  const masts = [];
  if (mastCount === 3) {
    masts.push({ t: 0.72, H: Hm * 0.88, tiers: flagship || cells === 5 ? 3 : 2, square: true });
    masts.push({ t: 0.47, H: Hm, tiers: flagship || cells === 5 ? 3 : 2, square: true, emblem: true });
    masts.push({ t: 0.18, H: Hm * 0.74, tiers: 0, square: false });
  } else if (mastCount === 2) {
    if (variant % 2 === 0) {
      masts.push({ t: 0.66, H: Hm * 0.9, tiers: 2, square: true, emblem: true });
      masts.push({ t: 0.32, H: Hm, tiers: 2, square: true });
    } else {
      masts.push({ t: 0.66, H: Hm * 0.88, tiers: 0, square: false, schooner: true });
      masts.push({ t: 0.34, H: Hm, tiers: 0, square: false, schooner: true, emblem: true });
    }
  } else {
    masts.push({ t: 0.5, H: Hm, tiers: 2, square: true, emblem: true });
  }

  const S = new MeshBuilder(); // Segel, Flaggen, Laternen
  const lines = [];
  const L = (a, b) => lines.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  const sailNu = detail === 0 ? 5 : detail === 1 ? 7 : 10;
  const sailNv = detail === 0 ? 4 : detail === 1 ? 5 : 7;
  const white = [1, 1, 1];

  const sailGrid = (p00, p10, p01, p11, uvKey, nu, nv, bulge, freeFn, kind = 0, pinch = 0.06) => {
    const uv = SAIL_UV[uvKey];
    S.auxDefault = [0, 0, kind];
    S.grid(nu, nv, (i, j, o) => {
      const u = i / nu, v = j / nv;
      let x = lerp(lerp(p00[0], p10[0], u), lerp(p01[0], p11[0], u), v);
      let y = lerp(lerp(p00[1], p10[1], u), lerp(p01[1], p11[1], u), v);
      let z = lerp(lerp(p00[2], p10[2], u), lerp(p01[2], p11[2], u), v);
      const prof = bulge.prof(u, v);
      x += bulge.v[0] * prof; y += bulge.v[1] * prof; z += bulge.v[2] * prof;
      if (pinch) { const cz = lerp(p00[2] + p10[2], p01[2] + p11[2], v) * 0.5 * 0.5 + 0; z = cz + (z - cz) * (1 - pinch * prof); }
      o[0] = x; o[1] = y; o[2] = z;
      o[3] = uv[0] + u * (uv[2] - uv[0]);
      o[4] = uv[1] + v * (uv[3] - uv[1]);
      o[5] = 1; o[6] = 1; o[7] = 1;
      o[8] = freeFn(u, v) * hs; o[9] = 0; o[10] = kind;
    });
  };

  const squareProf = (u, v) => Math.pow(Math.sin(Math.PI * u), 0.8) * (1 - Math.pow(v, 2.2));
  const yardsOut = [];
  const rotM = (xm, a) => new THREE.Matrix4().makeTranslation(xm, 0, 0).multiply(new THREE.Matrix4().makeRotationY(a)).multiply(new THREE.Matrix4().makeTranslation(-xm, 0, 0));
  const rotPt = (xm, a, p) => {
    const dx = p[0] - xm, ca = Math.cos(a), sa = Math.sin(a);
    return [xm + dx * ca + p[2] * sa, p[1], -dx * sa + p[2] * ca];
  };
  let curBrace = 0;
  const addSquare = (xm, yb, yt, wTop, wBot, uvKey) => {
    const x = xm + 0.06 * hs;
    S.m = H.m = rotM(xm, curBrace);
    const c = 0.17 * wTop;
    sailGrid([x, yb, -wBot / 2], [x, yb, wBot / 2], [x, yt, -wTop / 2], [x, yt, wTop / 2], uvKey, sailNu, sailNv,
      { v: [c, 0, 0], prof: squareProf },
      (u, v) => (0.2 + 0.8 * (1 - v)) * (0.3 + 0.7 * Math.sin(Math.PI * u)));
    // Rah
    H.auxDefault = [0.3, 0, 0];
    H.cyl(xm + 0.06 * hs, yt, -wTop / 2 - 0.16 * hs, xm + 0.06 * hs, yt, wTop / 2 + 0.16 * hs, 0.04 * hs, 0.04 * hs, 5, pal.mast, true);
    S.m = H.m = null;
    yardsOut.push({ xm, yt, w: wTop, brace: curBrace });
    // Schoten: Unterecken zur Reling
    return x;
  };

  const mastInfo = [];
  masts.forEach((m, mi) => {
    const x = xs + m.t * Lh + xoff(m.t, 0.6);
    const y0 = deckY(m.t) + raiseAt(m.t);
    const Hh = m.H;
    const rm = (0.055 + 0.0105 * Lh * (flagship ? 0.75 : 1)) * (flagship ? 0.9 : 1);
    H.auxDefault = [0.4, 0, 0];
    H.cyl(x, y0 - 0.06, 0, x, y0 + Hh, 0, rm, rm * 0.5, seg, pal.mast, true);
    H.cyl(x, y0 + Hh, 0, x, y0 + Hh + 0.2 * hs + Hh * 0.05, 0, rm * 0.4, rm * 0.2, 5, pal.mast, true);
    const yTopPole = y0 + Hh + 0.2 * hs + Hh * 0.05;
    mastInfo.push({ x, y0, H: Hh, yTopPole, m });
    const bw = B * (mi === 0 ? 1.28 : 1.42) * (m.H / Hm > 0.95 ? 1.05 : 1);
    const wCourse = flagship ? B * 1.18 : bw;
    if (m.square) {
      curBrace = mi === 1 ? -0.5 : 0.55;
      const T = m.tiers;
      const tierDefs = T === 3
        ? [[0.17, 0.46, 1], [0.5, 0.74, 0.74], [0.78, 0.93, 0.5]]
        : [[0.17, 0.56, 1], [0.6, 0.9, 0.72]];
      tierDefs.forEach((td, ti) => {
        const yb = y0 + td[0] * Hh, yt = y0 + td[1] * Hh;
        const wt = wCourse * td[2];
        addSquare(x, yb, yt, wt * 0.96, wt * 1.08, ti === 0 && m.emblem ? 'emblem' : ti === 0 && flagship ? 'emblem' : 'plain');
      });
      // Marskorb
      H.auxDefault = [0.3, 0, 0];
      const yn = y0 + (T === 3 ? 0.76 : 0.575) * Hh * (T === 3 ? 0.97 : 1);
      if (m.emblem || flagship) {
        const cr = 0.2 * hs * (flagship ? 0.9 : 1);
        H.cyl(x, yn - 0.07 * hs, 0, x, yn + 0.07 * hs, 0, cr * 0.8, cr, 8, pal.hatch, true);
      }
    } else if (!m.schooner) {
      curBrace = 0;
      // Besan / Gaffelsegel
      const Ls = m.t * Lh + 0.35 * hs;
      const yb = y0 + 0.2 * Hh, yt = y0 + 0.82 * Hh;
      const c = 0.16 * Ls;
      sailGrid([x - 0.08 * hs, yb, 0.05], [x - Ls, yb + 0.02 * hs, 0.05], [x - 0.08 * hs, yt, 0.05], [x - Ls * 0.55, yt + 0.03 * hs, 0.05], 'plain', sailNu, sailNv,
        { v: [0, 0, c], prof: (u, v) => Math.sin(Math.PI * (0.15 + 0.8 * u)) * (1 - 0.3 * v) * Math.min(1, u * 3 + 0.15) },
        (u, v) => Math.min(1, 0.1 + u) * (0.4 + 0.6 * (1 - v * 0.5)), 0, 0.0);
      H.auxDefault = [0.3, 0, 0];
      H.cyl(x - 0.02, yb, 0, x - Ls - 0.05 * hs, yb + 0.02 * hs, 0, 0.04 * hs, 0.032 * hs, 5, pal.mast, true);
      H.cyl(x - 0.02, yt, 0, x - Ls * 0.55, yt + 0.03 * hs, 0, 0.035 * hs, 0.03 * hs, 5, pal.mast, true);
      L([x - Ls, yb + 0.02 * hs, 0], [xs + 0.15 * hs, deckY(0) + hC + hr, 0]);
    } else {
      // Schoner: Gaffelsegel an beiden Masten
      const aft = mi === 1;
      const Ls = (aft ? 0.3 : 0.28) * Lh + 0.2 * hs;
      const yb = y0 + 0.22 * Hh, yt = y0 + 0.85 * Hh;
      const c = 0.15 * Ls;
      sailGrid([x - 0.08 * hs, yb, 0.05], [x - Ls, yb + 0.02 * hs, 0.05], [x - 0.08 * hs, yt, 0.05], [x - Ls * 0.6, yt - 0.04 * hs, 0.05], m.emblem ? 'emblem' : 'plain', sailNu, sailNv,
        { v: [0, 0, c], prof: (u, v) => Math.sin(Math.PI * (0.15 + 0.8 * u)) * (1 - 0.3 * v) * Math.min(1, u * 3 + 0.15) },
        (u, v) => Math.min(1, 0.1 + u) * (0.4 + 0.6 * (1 - v * 0.5)), 0, 0.0);
      H.auxDefault = [0.3, 0, 0];
      H.cyl(x - 0.02, yb, 0, x - Ls - 0.05 * hs, yb + 0.02 * hs, 0, 0.04 * hs, 0.032 * hs, 5, pal.mast, true);
      H.cyl(x - 0.02, yt, 0, x - Ls * 0.6, yt - 0.04 * hs, 0, 0.035 * hs, 0.03 * hs, 5, pal.mast, true);
      const rx = x - Ls, rt = Math.max(0.02, (rx - xs) / Lh);
      const pr = pt(Math.min(0.99, rt), deckY(Math.min(0.99, rt)) + raiseAt(rt) + hr, raiseAt(rt), 1);
      L([x - Ls, yb + 0.02 * hs, 0], [pr.x, deckY(rt) + raiseAt(rt) + hr, 0]);
      // Toppsegel (kleines Rahsegel) nur am Vormast
      if (!aft) addSquare(x, y0 + 0.88 * Hh, y0 + 1.0 * Hh, B * 0.5, B * 0.55, 'plain');
    }

    // Wanten + Webeleinen
    const ya = y0 + 0.58 * Hh;
    const nS = 3;
    for (const sd of [-1, 1]) {
      const rp = [];
      for (let k = 0; k < nS; k++) {
        const t = Math.min(0.97, Math.max(0.03, m.t + (k - 1) * 0.045 * (flagship ? 0.8 : 1.2) * (8 / Lh)));
        const yR = deckY(t) + raiseAt(t) + hr;
        const p = pt(t, yR, raiseAt(t), sd);
        rp.push([p.x, yR, p.z * 0.97]);
        L([x, ya, sd * 0.04], rp[k]);
      }
      if (detail > 0) {
        for (let r = 1; r <= (detail === 2 ? 5 : 3); r++) {
          const f = r / ((detail === 2 ? 5 : 3) + 1);
          for (let k = 0; k < nS - 1; k++) {
            const a = [lerp(rp[k][0], x, f), lerp(rp[k][1], ya, f), lerp(rp[k][2], sd * 0.04, f)];
            const b = [lerp(rp[k + 1][0], x, f), lerp(rp[k + 1][1], ya, f), lerp(rp[k + 1][2], sd * 0.04, f)];
            L(a, b);
          }
        }
      }
      // Pardunen nach hinten
      const tb = Math.max(0.03, m.t - 0.14 * (8 / Lh));
      const pb = pt(tb, deckY(tb) + raiseAt(tb) + hr, raiseAt(tb), sd);
      L([x, y0 + 0.9 * Hh, sd * 0.03], [pb.x, deckY(tb) + raiseAt(tb) + hr, pb.z]);
    }
  });

  // Stagen
  mastInfo.forEach((mi, i) => {
    const next = mastInfo[i + 1];
    const nextFwd = mastInfo[i - 1];
    // Stag nach vorn
    if (i === 0) {
      L([mi.x, mi.y0 + mi.H * 0.97, 0], [tipX, tipY, 0]);
      L([mi.x, mi.y0 + mi.H * 0.7, 0], [xb - 0.1 * hs, bowDeckY + hr, 0]);
    } else {
      L([mi.x, mi.y0 + mi.H * 0.97, 0], [nextFwd.x, nextFwd.y0 + nextFwd.H * 0.55, 0]);
    }
    // Rahnocken -> Mastspitze (Toppnanten)
    void next;
  });
  yardsOut.forEach((yd) => {
    const mi = mastInfo.find((q) => q.x === yd.xm);
    for (const sd of [-1, 1]) {
      L([yd.xm + 0.06 * hs, mi.y0 + mi.H * 0.99, 0.02 * sd], rotPt(yd.xm, yd.brace, [yd.xm + 0.06 * hs, yd.yt, sd * (yd.w / 2 + 0.14 * hs)]));
    }
  });
  // Wasserstagen (Bugspriet)
  for (const sd of [-1, 1]) {
    const p = pt(0.93, bowDeckY - 0.15 * hs, 0, sd);
    L([tipX, tipY, 0], [p.x, bowDeckY - 0.1 * hs, p.z * 0.9]);
    L([tipX, tipY, 0], [p.x - 0.5 * hs, bowDeckY + hr, p.z * 0.6]);
  }

  // Fock(en)
  if (mastCount >= 1) {
    const fm = mastInfo[0];
    const jib = (x0, y0t, x1, y1h, x2, y2c, small) => {
      const len = Math.hypot(x1 - x0, y1h - y0t);
      sailGrid([x0, y0t, 0], [x2, y2c, 0], [x1, y1h, 0], [x1, y1h, 0], 'plain', sailNu, sailNv,
        { v: [0, 0, 0.07 * len], prof: (u, v) => Math.sin(Math.PI * u) * (1 - v * 0.6) },
        (u, v) => (0.3 + 0.7 * u) * (1 - v * 0.5), 0, 0);
      void small;
    };
    const fx = fm.x + 0.08 * hs;
    jib(tipX - 0.05 * hs, tipY - 0.03, fx, fm.y0 + fm.H * 0.6, xb - 0.55 * hs, bowDeckY + hr + 0.15 * hs);
    if (cells >= 4 || flagship) jib(tipX - 0.7 * hs, tipY - 0.35 * hs, fx, fm.y0 + fm.H * 0.42, xb - 0.9 * hs, bowDeckY + hr + 0.1 * hs, true);
  }

  // Flaggen
  const flagAt = (x, yp, fw, fh, tri) => {
    const uvKey = 'flag';
    S.auxDefault = [0, 0, 1];
    S.grid(detail === 0 ? 4 : 7, 2, (i, j, o) => {
      const u = i / (detail === 0 ? 4 : 7), v = j / 2;
      const hh = tri ? fh * (1 - u * 0.92) : fh * (1 - u * 0.15 * 0);
      const uvr = SAIL_UV[uvKey];
      o[0] = x + u * fw;
      o[1] = yp - fh * 0.5 + (v - 0.5) * hh;
      o[2] = 0.01;
      o[3] = uvr[0] + u * (uvr[2] - uvr[0]);
      o[4] = uvr[1] + v * (uvr[3] - uvr[1]);
      o[5] = 1; o[6] = 1; o[7] = 1;
      o[8] = u * u * fw * 0.3; o[9] = 0; o[10] = 1;
    });
  };
  mastInfo.forEach((mi, i) => {
    const main = i === (masts.length === 3 ? 1 : 0) || masts.length === 1;
    const fw = (main ? 1.15 : 0.8) * hs * (flagship ? 0.95 : 1);
    const fh = (main ? 0.55 : 0.34) * hs * (flagship ? 0.95 : 1);
    flagAt(mi.x, mi.yTopPole - 0.02 * hs - fh * 0.5, fw, fh, !main);
  });
  // Heckflagge (Ensign)
  {
    const yR = deckY(0.02) + hC + hr;
    const px = xs + 0.14 * hs + xoff(0.02, 1);
    const ph = (flagship ? 1.3 : 0.9) * hs;
    H.auxDefault = [0.3, 0, 0];
    H.cyl(px, yR - 0.02, 0, px, yR + ph, 0, 0.03 * hs, 0.02 * hs, 5, pal.mast, true);
    H.sphere(px, yR + ph + 0.03 * hs, 0, 0.045 * hs, 5, pal.brass);
    flagAt(px, yR + ph - 0.28 * hs, 1.0 * hs * (flagship ? 1.0 : 0.9), 0.52 * hs, false);
  }
  // Hecklaternen (leuchtend)
  {
    const lanterns = flagship ? [-1, 1] : cells >= 3 ? [-1, 1] : [0];
    const yR = deckY(0.03) + hC + hr;
    for (const sd of lanterns) {
      const pr = pt(0.03, yR, hC, sd === 0 ? 1 : sd);
      const lz = sd === 0 ? 0 : pr.z * 0.88;
      const lx = pr.x + 0.12 * hs;
      const ph = (flagship ? 0.7 : 0.5) * hs;
      const ls = (flagship ? 0.2 : 0.17) * hs;
      H.auxDefault = [0.3, 0, 0];
      H.cyl(lx, yR - 0.02, lz, lx, yR + ph, lz, 0.022 * hs, 0.022 * hs, 5, pal.iron, true);
      H.cyl(lx, yR + ph + ls * 1.45, lz, lx, yR + ph + ls * 1.9, lz, ls * 0.8, 0.01, 6, pal.iron, true);
      S.auxDefault = [0, 0, 2];
      const uvr = SAIL_UV.lantern;
      const cx = lx, cy = yR + ph + ls * 0.75, cz = lz;
      const h = ls / 2, hh = ls * 0.75;
      const f = (p0, p1, p2, p3) => S.quad(p0, p1, p2, p3, white, [uvr[0], uvr[1], uvr[2], uvr[3]]);
      f([cx + h, cy - hh, cz - h], [cx + h, cy - hh, cz + h], [cx + h, cy + hh, cz + h], [cx + h, cy + hh, cz - h]);
      f([cx - h, cy - hh, cz + h], [cx - h, cy - hh, cz - h], [cx - h, cy + hh, cz - h], [cx - h, cy + hh, cz + h]);
      f([cx + h, cy - hh, cz + h], [cx - h, cy - hh, cz + h], [cx - h, cy + hh, cz + h], [cx + h, cy + hh, cz + h]);
      f([cx - h, cy - hh, cz - h], [cx + h, cy - hh, cz - h], [cx + h, cy + hh, cz - h], [cx - h, cy + hh, cz - h]);
      f([cx - h, cy + hh, cz - h], [cx + h, cy + hh, cz - h], [cx + h, cy + hh, cz + h], [cx - h, cy + hh, cz + h]);
    }
  }

  // Deck-Details: Luken, Fässer, Steuerrad
  {
    H.auxDefault = [0.5, 0, 0];
    const gapT = mastCount >= 2 ? (masts[0].t + masts[1].t) / 2 : 0.7;
    const place = (t, f) => {
      const x = xs + t * Lh + xoff(t, 0.7);
      return [x, deckY(t) + raiseAt(t) + 0.04 * hs];
    };
    const [hx, hy] = place(gapT, 0);
    H.box(hx, hy + 0.04 * hs, 0, 0.55 * hs, 0.08 * hs, 0.5 * hs, pal.hatch);
    H.box(hx, hy + 0.085 * hs, 0, 0.47 * hs, 0.02 * hs, 0.42 * hs, pal.iron);
    if (cells >= 3) {
      const t2 = Math.min(0.92, masts[0].t + 0.12);
      const [bx, by] = place(t2, 0);
      const prof = [[0.05, 0], [0.13, 0.05], [0.17, 0.17], [0.16, 0.28], [0.1, 0.34]];
      const sc = hs;
      H.lathe(bx, by, 0.28 * hs, prof.map(([r, y]) => [r * sc, y * sc]), 8, (i) => (i % 2 === 0 ? pal.hatch : pal.mast));
      H.lathe(bx - 0.28 * hs, by, -0.2 * hs, prof.map(([r, y]) => [r * sc * 0.9, y * sc * 0.9]), 8, (i) => (i % 2 === 0 ? pal.hatch : pal.mast));
    }
    // Steuerrad auf dem Heckkastell
    const [wx, wy] = place(tc * 0.55, 0);
    H.cyl(wx, wy, 0, wx, wy + 0.2 * hs, 0, 0.04 * hs, 0.04 * hs, 5, pal.iron, true);
    H.cyl(wx, wy + 0.22 * hs, -0.03, wx, wy + 0.22 * hs, 0.03, 0.16 * hs, 0.16 * hs, 10, pal.hatch, true);
  }

  const hull = H.toGeometry({ color: true });
  const sails = S.toGeometry({ color: false, aux: 'aSail' });
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));

  let maxY = 0;
  mastInfo.forEach((mi) => { maxY = Math.max(maxY, mi.yTopPole + 0.6 * hs); });

  return {
    hull,
    hullAux: new Float32Array(H.aux),
    sails,
    lines: lineGeo,
    meta: { Lc, Lh, B, hs, xs, xb, cells, cannons, facing, height: maxY, tipX },
  };
}
