// Prozedurale Canvas-Texturen für Schiffe: Planken-Holz (+Normalmap), Segel-Atlas (Spieler/Gegner).
import * as THREE from 'three';
import { createRng } from '../core/noise.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(tex, srgb) {
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

let woodCache = null;
/** Kachelbare Planken-Textur (helle Basis, wird per Vertex-Color eingefärbt) + Normalmap. */
export function getWoodTextures() {
  if (woodCache) return woodCache;
  const W = 512, H = 512;
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext('2d');
  const rng = createRng(77);
  const planks = 16;
  const ph = H / planks;
  const height = new Float32Array(W * H).fill(0.6);
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    // Plankensegmente mit Stoßfugen
    let x = -rng() * 300;
    while (x < W) {
      const len = 180 + rng() * 260;
      const tone = 0.72 + rng() * 0.26;
      const warm = rng() * 0.12;
      const x1 = x + len;
      const r = Math.round(255 * tone), g = Math.round(255 * (tone - 0.05 - warm * 0.4)), b = Math.round(255 * (tone - 0.15 - warm));
      for (const off of [0, -W, W]) {
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x + off, y0, len, ph);
        // Maserung
        for (let k = 0; k < 9; k++) {
          const gy = y0 + 2 + rng() * (ph - 4);
          ctx.strokeStyle = `rgba(60,35,15,${0.05 + rng() * 0.12})`;
          ctx.lineWidth = 0.6 + rng() * 1.2;
          ctx.beginPath();
          ctx.moveTo(x + off, gy);
          const segs = 6;
          for (let s = 1; s <= segs; s++) ctx.lineTo(x + off + (len * s) / segs, gy + (rng() - 0.5) * 2.2);
          ctx.stroke();
        }
        // Astloch
        if (rng() < 0.35) {
          const kx = x + off + len * (0.2 + rng() * 0.6), ky = y0 + ph * (0.3 + rng() * 0.4);
          ctx.fillStyle = 'rgba(50,28,12,0.55)';
          ctx.beginPath();
          ctx.ellipse(kx, ky, 5 + rng() * 4, 2.5 + rng() * 1.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // Nägel an Stoßfuge
        ctx.fillStyle = 'rgba(30,20,12,0.7)';
        ctx.fillRect(x + off + 5, y0 + ph * 0.25, 2, 2);
        ctx.fillRect(x + off + 5, y0 + ph * 0.7, 2, 2);
        ctx.fillRect(x + off + len - 7, y0 + ph * 0.25, 2, 2);
        ctx.fillRect(x + off + len - 7, y0 + ph * 0.7, 2, 2);
        // Stoßfuge
        ctx.fillStyle = 'rgba(20,10,5,0.75)';
        ctx.fillRect(x + off + len - 1, y0, 2, ph);
      }
      x = x1;
    }
    // Fugen zwischen Plankenreihen
    ctx.fillStyle = 'rgba(20,10,5,0.8)';
    ctx.fillRect(0, y0, W, 2);
    ctx.fillStyle = 'rgba(255,230,190,0.18)';
    ctx.fillRect(0, y0 + 2, W, 1);
  }
  // Gesamtschmutz
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(30,20,10,${rng() * 0.06})`;
    ctx.beginPath();
    ctx.ellipse(rng() * W, rng() * H, 10 + rng() * 40, 4 + rng() * 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Höhenkarte aus Luminanz -> Normalmap
  const img = ctx.getImageData(0, 0, W, H).data;
  for (let i = 0; i < W * H; i++) height[i] = (img[i * 4] + img[i * 4 + 1] + img[i * 4 + 2]) / 765;
  const ncv = makeCanvas(W, H);
  const nctx = ncv.getContext('2d');
  const nd = nctx.createImageData(W, H);
  const str = 2.2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const xl = height[y * W + ((x - 1 + W) % W)], xr = height[y * W + ((x + 1) % W)];
      const yu = height[((y - 1 + H) % H) * W + x], yd = height[((y + 1) % H) * W + x];
      let nx = (xl - xr) * str, ny = (yd - yu) * str, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const o = (y * W + x) * 4;
      nd.data[o] = (nx * 0.5 + 0.5) * 255;
      nd.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      nd.data[o + 2] = (nz * 0.5 + 0.5) * 255;
      nd.data[o + 3] = 255;
    }
  }
  nctx.putImageData(nd, 0, 0);
  const map = new THREE.CanvasTexture(cv);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const normalMap = new THREE.CanvasTexture(ncv);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  woodCache = { map: finish(map, true), normalMap: finish(normalMap, false) };
  return woodCache;
}

// ---------------------------------------------------------------------------
// Segel-Atlas 1024x512:
//   A (u 0..0.5,  v 0..1)       Segel mit Wappen        (Canvas x 0..512,  y 0..512)
//   B (u 0.5..0.75, v 0..1)     schlichtes Segel        (x 512..768)
//   C (u 0.75..1, v 0.5..1)     Flagge                  (x 768..1024, y 0..256)
//   D (u 0.75..1, v 0..0.5)     Laterne (leuchtend)     (x 768..1024, y 256..512)
export const SAIL_UV = {
  emblem: [0.004, 0.01, 0.496, 0.99],
  plain: [0.504, 0.01, 0.746, 0.99],
  flag: [0.754, 0.51, 0.996, 0.99],
  lantern: [0.754, 0.01, 0.996, 0.49],
};

function paintCloth(ctx, x, y, w, h, enemy, rng) {
  const base = enemy ? [34, 31, 33] : [236, 224, 196];
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  const sh = (k) => `rgb(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k)})`;
  g.addColorStop(0, sh(enemy ? 1.05 : 1.0));
  g.addColorStop(0.7, sh(enemy ? 0.9 : 0.94));
  g.addColorStop(1, sh(enemy ? 0.75 : 0.8));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // Webstruktur
  ctx.fillStyle = enemy ? 'rgba(255,255,255,0.04)' : 'rgba(80,60,30,0.07)';
  for (let yy = 0; yy < h; yy += 3) ctx.fillRect(x, y + yy, w, 1);
  ctx.fillStyle = enemy ? 'rgba(255,255,255,0.025)' : 'rgba(80,60,30,0.05)';
  for (let xx = 0; xx < w; xx += 3) ctx.fillRect(x + xx, y, 1, h);
  // Flecken
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = enemy ? `rgba(90,80,70,${rng() * 0.08})` : `rgba(120,90,50,${rng() * 0.10})`;
    ctx.beginPath();
    ctx.ellipse(x + rng() * w, y + rng() * h, 8 + rng() * 40, 6 + rng() * 30, rng() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Bahnen-Nähte
  const panels = Math.max(3, Math.round(w / 85));
  for (let p = 1; p < panels; p++) {
    const px = x + (w * p) / panels;
    ctx.fillStyle = enemy ? 'rgba(0,0,0,0.55)' : 'rgba(90,65,35,0.45)';
    ctx.fillRect(px - 1, y, 2, h);
    ctx.fillStyle = enemy ? 'rgba(160,150,140,0.35)' : 'rgba(255,250,235,0.5)';
    for (let yy = 4; yy < h; yy += 9) ctx.fillRect(px + 2, y + yy, 1.5, 4);
  }
  // Reffbänder
  for (const fy of [0.3, 0.62]) {
    ctx.fillStyle = enemy ? 'rgba(0,0,0,0.5)' : 'rgba(90,65,35,0.35)';
    ctx.fillRect(x, y + h * fy, w, 3);
    ctx.fillStyle = enemy ? 'rgba(140,125,110,0.9)' : 'rgba(110,80,45,0.85)';
    for (let xx = 10; xx < w; xx += 22) {
      ctx.beginPath();
      ctx.arc(x + xx, y + h * fy + 1.5, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Flicken
  const patches = enemy ? 6 : 4;
  for (let i = 0; i < patches; i++) {
    const pw = 36 + rng() * 40, ph = 30 + rng() * 40;
    const px = x + 16 + rng() * (w - pw - 32), py = y + 24 + rng() * (h - ph - 60);
    ctx.save();
    ctx.translate(px + pw / 2, py + ph / 2);
    ctx.rotate((rng() - 0.5) * 0.12);
    ctx.fillStyle = enemy ? `rgb(${50 + rng() * 25},${44 + rng() * 20},${40 + rng() * 20})` : `rgb(${200 + rng() * 25},${180 + rng() * 25},${140 + rng() * 25})`;
    ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = enemy ? 'rgba(200,190,170,0.7)' : 'rgba(70,45,25,0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-pw / 2 + 3, -ph / 2 + 3, pw - 6, ph - 6);
    ctx.restore();
  }
  ctx.setLineDash([]);
}

function ragged(ctx, x, y, w, h, enemy, rng) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  // Unterkante ausgefranst
  const depth = enemy ? 46 : 14;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  let cx = x;
  while (cx < x + w) {
    const nx = cx + 8 + rng() * 22;
    ctx.lineTo(cx, y + h - rng() * depth);
    ctx.lineTo(Math.min(nx, x + w), y + h - rng() * depth * 0.3);
    cx = nx;
  }
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
  if (enemy) {
    // Risse und Löcher
    for (let i = 0; i < 5; i++) {
      const tx = x + 30 + rng() * (w - 60), ty = y + h * (0.35 + rng() * 0.5), len = 40 + rng() * 80;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + 5 + rng() * 6, ty + len * 0.5);
      ctx.lineTo(tx + (rng() - 0.5) * 8, ty + len);
      ctx.lineTo(tx - 3 - rng() * 3, ty + len * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.ellipse(x + 20 + rng() * (w - 40), y + 40 + rng() * (h - 90), 3 + rng() * 7, 3 + rng() * 6, rng() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function compassRose(ctx, cx, cy, R) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#1f3566';
  ctx.fillStyle = '#1f3566';
  ctx.lineWidth = R * 0.07;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = R * 0.03;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.82, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2, r0 = R * 0.82, r1 = R * (i % 4 === 0 ? 0.95 : 0.89);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }
  const star = (n, len, wid, fillA, fillB) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const px = -sa * wid, py = ca * wid;
      ctx.fillStyle = fillA;
      ctx.beginPath();
      ctx.moveTo(ca * len, sa * len);
      ctx.lineTo(px, py);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = fillB;
      ctx.beginPath();
      ctx.moveTo(ca * len, sa * len);
      ctx.lineTo(-px, -py);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
    }
  };
  star(4, R * 0.78, R * 0.13, '#1f3566', '#b3261e');
  ctx.rotate(Math.PI / 4);
  star(4, R * 0.5, R * 0.1, '#1f3566', '#d8c9a0');
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#d4a935';
  ctx.beginPath(); ctx.arc(0, 0, R * 0.08, 0, Math.PI * 2); ctx.fill();
  // Nordpfeil
  ctx.fillStyle = '#b3261e';
  ctx.beginPath();
  ctx.moveTo(0, -R * 1.18); ctx.lineTo(R * 0.1, -R * 1.02); ctx.lineTo(-R * 0.1, -R * 1.02); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function anchor(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = s * 0.1;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, -s * 0.8, s * 0.14, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -s * 0.66); ctx.lineTo(0, s * 0.8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-s * 0.32, -s * 0.42); ctx.lineTo(s * 0.32, -s * 0.42); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, s * 0.35, s * 0.55, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s * 0.52, s * 0.62); ctx.lineTo(-s * 0.68, s * 0.5); ctx.lineTo(-s * 0.42, s * 0.46); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(s * 0.52, s * 0.62); ctx.lineTo(s * 0.68, s * 0.5); ctx.lineTo(s * 0.42, s * 0.46); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function skull(ctx, cx, cy, s, bone, dark) {
  ctx.save();
  ctx.translate(cx, cy);
  // gekreuzte Knochen
  ctx.strokeStyle = bone;
  ctx.fillStyle = bone;
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.17;
  for (const sg of [-1, 1]) {
    const dx = Math.cos(0.62) * s * 1.05 * sg, dy = Math.sin(0.62) * s * 1.05;
    ctx.beginPath(); ctx.moveTo(-dx, -dy + s * 0.18); ctx.lineTo(dx, dy + s * 0.18); ctx.stroke();
    for (const e of [-1, 1]) {
      const ex = dx * e, ey = (dy * e) + s * 0.18;
      ctx.beginPath(); ctx.arc(ex - 0.12 * s * sg * e * 0 + (-0.04 * s), ey - s * 0.09, s * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + 0.04 * s, ey + s * 0.1, s * 0.13, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Schädel
  ctx.fillStyle = bone;
  ctx.beginPath(); ctx.ellipse(0, -s * 0.12, s * 0.58, s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.34, s * 0.2);
  ctx.quadraticCurveTo(-s * 0.36, s * 0.62, -s * 0.2, s * 0.64);
  ctx.lineTo(s * 0.2, s * 0.64);
  ctx.quadraticCurveTo(s * 0.36, s * 0.62, s * 0.34, s * 0.2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = dark;
  for (const sg of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(sg * s * 0.24, -s * 0.08, s * 0.17, s * 0.19, sg * 0.15, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(0, s * 0.08); ctx.lineTo(s * 0.09, s * 0.3); ctx.lineTo(-s * 0.09, s * 0.3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = s * 0.04;
  ctx.beginPath(); ctx.moveTo(-s * 0.24, s * 0.46); ctx.lineTo(s * 0.24, s * 0.46); ctx.stroke();
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(i * s * 0.1, s * 0.4); ctx.lineTo(i * s * 0.1, s * 0.62); ctx.stroke();
  }
  ctx.restore();
}

const sailCache = {};
/** { map, emissiveMap } für 'player' | 'enemy'. */
export function getSailTextures(side) {
  if (sailCache[side]) return sailCache[side];
  const enemy = side === 'enemy';
  const rng = createRng(enemy ? 913 : 311);
  const cv = makeCanvas(1024, 512);
  const ctx = cv.getContext('2d');

  // A: Wappensegel
  paintCloth(ctx, 0, 0, 512, 512, enemy, rng);
  if (enemy) {
    ctx.save();
    ctx.translate(256, 235);
    ctx.scale(1, 0.72);
    skull(ctx, 0, 0, 175, '#e8dfc8', '#141012');
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(256, 240);
    ctx.scale(1, 0.72);
    compassRose(ctx, 0, 0, 170);
    ctx.restore();
    ctx.strokeStyle = 'rgba(31,53,102,0.8)';
    ctx.lineWidth = 6;
    ctx.strokeRect(18, 18, 476, 476);
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, 452, 452);
    ctx.fillStyle = 'rgba(179,38,30,0.85)';
    ctx.fillRect(18, 436, 476, 22);
  }
  ragged(ctx, 0, 0, 512, 512, enemy, rng);

  // B: schlichtes Segel
  paintCloth(ctx, 512, 0, 256, 512, enemy, rng);
  if (!enemy) {
    ctx.strokeStyle = 'rgba(31,53,102,0.6)';
    ctx.lineWidth = 5;
    ctx.strokeRect(526, 14, 228, 484);
  }
  ragged(ctx, 512, 0, 256, 512, enemy, rng);

  // C: Flagge
  ctx.fillStyle = enemy ? '#14100f' : '#1f3d85';
  ctx.fillRect(768, 0, 256, 256);
  ctx.strokeStyle = enemy ? '#7d1c14' : '#d4a935';
  ctx.lineWidth = 8;
  ctx.strokeRect(772, 4, 248, 248);
  if (enemy) skull(ctx, 768 + 128, 120, 62, '#efe6d0', '#14100f');
  else anchor(ctx, 768 + 128, 128, 80, '#f1e8cf');

  // D: Laterne
  const lg = ctx.createRadialGradient(896, 384, 4, 896, 384, 120);
  lg.addColorStop(0, '#fff5c8');
  lg.addColorStop(0.5, enemy ? '#ff9a3c' : '#ffc460');
  lg.addColorStop(1, enemy ? '#c9531a' : '#d98b2b');
  ctx.fillStyle = lg;
  ctx.fillRect(768, 256, 256, 256);

  // Emissiv: Laternen hell, Stoff dezent (Licht scheint durch)
  const ecv = makeCanvas(512, 256);
  const ectx = ecv.getContext('2d');
  ectx.drawImage(cv, 0, 0, 512, 256);
  ectx.globalCompositeOperation = 'multiply';
  const k = enemy ? 0.05 : 0.2;
  const kk = Math.round(255 * k);
  ectx.fillStyle = `rgb(${kk},${kk},${kk})`;
  ectx.fillRect(0, 0, 512, 256);
  ectx.globalCompositeOperation = 'source-over';
  ectx.fillStyle = enemy ? '#ff8a2a' : '#ffc060';
  ectx.fillRect(384, 128, 128, 128);

  const map = new THREE.CanvasTexture(cv);
  const emissiveMap = new THREE.CanvasTexture(ecv);
  sailCache[side] = { map: finish(map, true), emissiveMap: finish(emissiveMap, true) };
  return sailCache[side];
}
