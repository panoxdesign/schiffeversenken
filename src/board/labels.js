// Beschriftungs-Atlas: Messing-Plaketten mit Pergament und Serifenschrift (5x4 Felder à 128 px).
import * as THREE from 'three';

export function createLabelAtlas(colLabels, rowLabels) {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S * 5;
  cv.height = S * 4;
  const ctx = cv.getContext('2d');
  const all = [...rowLabels, ...colLabels];
  const FONT = "'IM Fell English', Georgia, 'Palatino Linotype', 'Times New Roman', serif";
  const draw = () => all.forEach((txt, k) => {
    const cx = (k % 5) * S + S / 2;
    const cy = Math.floor(k / 5) * S + S / 2;
    // Messingring
    const g = ctx.createLinearGradient(cx - 56, cy - 56, cx + 56, cy + 56);
    g.addColorStop(0, '#fbe08a');
    g.addColorStop(0.5, '#b9852a');
    g.addColorStop(1, '#6e4a14');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, 58, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2408';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 58, 0, Math.PI * 2); ctx.stroke();
    // Nieten
    ctx.fillStyle = '#4a300c';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 51, cy + Math.sin(a) * 51, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    // Pergamentscheibe
    const pg = ctx.createRadialGradient(cx - 8, cy - 10, 6, cx, cy, 44);
    pg.addColorStop(0, '#f6e8c4');
    pg.addColorStop(0.75, '#e2c88e');
    pg.addColorStop(1, '#b8945a');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(cx, cy, 43, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(70,40,10,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 43, 0, Math.PI * 2); ctx.stroke();
    // Zeichen
    ctx.fillStyle = '#2b1606';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = txt.length > 1 ? 44 : 56;
    ctx.font = `${fs}px ${FONT}`;
    ctx.fillText(txt, cx, cy + 3);
  });
  draw();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // Webfont ggf. noch nicht geladen: danach neu zeichnen
  document.fonts?.load(`56px 'IM Fell English'`).then((f) => {
    if (!f.length) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    draw();
    tex.needsUpdate = true;
  }).catch(() => {});
  return tex;
}
