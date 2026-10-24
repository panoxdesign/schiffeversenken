// Alle Soundeffekte als Synthese-Funktionen: fn(ctx, out, rev, t, v, p) → Dauer in s.
// ctx: beliebiger BaseAudioContext (auch Offline), out: Ziel-Node, rev: Hall-Eingang (oder null),
// t: Startzeit, v: Lautstärke, p: Tonhöhen-Faktor.
import { R, osc, gainN, filt, noiseSrc, ad, sweep, chain, shaper, finish, bubble, EPS } from './dsp.js';
import { concertina, fiddle, bass, drum } from './instruments.js';

const mix = (ctx, v) => gainN(ctx, v);

/** Gemeinsame Kanonen-Synthese. far=true → dumpf/entfernt. */
function boom(ctx, out, rev, t, v, p, far) {
  const m = mix(ctx, (far ? 0.5 : 0.53) * v);
  const dur = far ? 3.6 : 3.2;
  // Sinus-Pitch-Drop (der „Wumms“)
  const th = osc(ctx, 'sine', (far ? 95 : 150) * p, t, 1);
  th.frequency.exponentialRampToValueAtTime(32 * p, t + 0.5);
  const tg = gainN(ctx, 0); ad(tg, t, 1, far ? 0.012 : 0.003, far ? 0.7 : 0.6); chain(th, tg, m);
  // gefiltertes Rauschen, übersteuert
  const n = noiseSrc(ctx, 'white', t, 1.4);
  const lp = filt(ctx, 'lowpass', 3000, 0.7);
  sweep(lp.frequency, t, far ? 700 : 3200, far ? 90 : 140, far ? 0.9 : 0.75);
  const ng = gainN(ctx, 0); ad(ng, t, far ? 0.5 : 0.7, far ? 0.015 : 0.002, 0.85);
  chain(n, lp, shaper(ctx, 3), ng, m);
  // Knall-Transient
  if (!far) {
    const c = noiseSrc(ctx, 'white', t, 0.12), hp = filt(ctx, 'highpass', 1400, 0.7), cg = gainN(ctx, 0);
    ad(cg, t, 0.55, 0.001, 0.035); chain(c, hp, cg, m);
  }
  // tiefes Grollen
  const r = noiseSrc(ctx, 'brown', t, 2.2), rl = filt(ctx, 'lowpass', far ? 90 : 130, 0.9), rg = gainN(ctx, 0);
  ad(rg, t + 0.03, far ? 1.5 : 1.7, 0.05, 1.7); chain(r, rl, rg, m);
  finish(m, out, rev, far ? 0.9 : 0.6);
  return dur;
}

const SOUNDS = {
  cannon: (ctx, out, rev, t, v, p) => boom(ctx, out, rev, t, v, p, false),
  cannonFar: (ctx, out, rev, t, v, p) => boom(ctx, out, rev, t, v, p, true),

  whistle(ctx, out, rev, t, v, p) {
    const dur = 1.5, m = mix(ctx, 0.3 * v);
    const f0 = 1500 * p;
    const o = osc(ctx, 'sine', f0, t, dur), o2 = osc(ctx, 'triangle', f0 * 2.01, t, dur);
    for (const x of [o.frequency]) {
      x.setValueAtTime(f0, t); x.exponentialRampToValueAtTime(f0 * 1.35, t + 0.3); x.exponentialRampToValueAtTime(f0 * 0.38, t + dur * 0.95);
    }
    o2.frequency.setValueAtTime(f0 * 2, t); o2.frequency.exponentialRampToValueAtTime(f0 * 2.7, t + 0.3); o2.frequency.exponentialRampToValueAtTime(f0 * 0.76, t + dur * 0.95);
    const vib = osc(ctx, 'sine', 13, t, dur), vg = gainN(ctx, 22 * p); vib.connect(vg); vg.connect(o.frequency);
    const g = gainN(ctx, 0); const g2 = gainN(ctx, 0.15);
    chain(o, g); chain(o2, g2, g);
    const n = noiseSrc(ctx, 'white', t, dur), bp = filt(ctx, 'bandpass', f0, 14), ng = gainN(ctx, 2.2);
    sweep(bp.frequency, t, f0, f0 * 1.35, 0.3); bp.frequency.exponentialRampToValueAtTime(f0 * 0.38, t + dur * 0.95);
    chain(n, bp, ng, g);
    const p_ = g.gain; p_.setValueAtTime(EPS, t); p_.linearRampToValueAtTime(1, t + 0.35); p_.setValueAtTime(1, t + 0.4); p_.linearRampToValueAtTime(EPS, t + dur - 0.05);
    g.connect(m); finish(m, out, rev, 0.25);
    return dur;
  },

  splash(ctx, out, rev, t, v, p) {
    const dur = 1.6, m = mix(ctx, 0.85 * v);
    const n = noiseSrc(ctx, 'white', t, 1.2), bp = filt(ctx, 'bandpass', 1500 * p, 0.8), g = gainN(ctx, 0);
    sweep(bp.frequency, t, 1800 * p, 380 * p, 0.7); ad(g, t, 0.9, 0.012, 0.5); chain(n, bp, g, m);
    const n2 = noiseSrc(ctx, 'white', t + 0.02, 1.3), hp = filt(ctx, 'highpass', 4500, 0.6), g2 = gainN(ctx, 0); // Gischt
    ad(g2, t + 0.02, 0.28, 0.03, 0.9); chain(n2, hp, g2, m);
    const o = osc(ctx, 'sine', 190 * p, t, 0.4); sweep(o.frequency, t, 190 * p, 60 * p, 0.2); // dumpfes „Plong“
    const og = gainN(ctx, 0); ad(og, t, 0.8, 0.004, 0.2); chain(o, og, m);
    for (let i = 0; i < 9; i++) bubble(ctx, m, t + 0.06 + i * R(0.06, 0.11) + i * i * 0.01, R(380, 1400) * p, R(0.12, 0.3) * (1 - i / 11));
    finish(m, out, rev, 0.35);
    return dur;
  },

  explosion(ctx, out, rev, t, v, p) {
    const dur = 3.4, m = mix(ctx, 0.43 * v);
    const th = osc(ctx, 'sine', 120 * p, t, 1.2); sweep(th.frequency, t, 120 * p, 28 * p, 0.7);
    const tg = gainN(ctx, 0); ad(tg, t, 1, 0.003, 0.9); chain(th, tg, m);
    const n = noiseSrc(ctx, 'white', t, 1.6), lp = filt(ctx, 'lowpass', 3000, 0.7); sweep(lp.frequency, t, 5000, 200, 1.2);
    const ng = gainN(ctx, 0); ad(ng, t, 0.95, 0.002, 1.2); chain(n, lp, shaper(ctx, 4), ng, m);
    const cr = noiseSrc(ctx, 'white', t, 0.2), chp = filt(ctx, 'highpass', 1800, 0.6), cg = gainN(ctx, 0); ad(cg, t, 0.8, 0.001, 0.06); chain(cr, chp, cg, m);
    const r = noiseSrc(ctx, 'brown', t, 2.8), rl = filt(ctx, 'lowpass', 110, 0.9), rg = gainN(ctx, 0); ad(rg, t, 1.8, 0.08, 2.3); chain(r, rl, rg, m);
    // Holzsplittern: viele kurze, schmale Rauschimpulse
    for (let i = 0; i < 26; i++) {
      const tt = t + 0.04 + Math.pow(Math.random(), 1.6) * 1.5, c = noiseSrc(ctx, 'white', tt, 0.1);
      const b = filt(ctx, 'bandpass', R(700, 3800), R(4, 12)), x = gainN(ctx, 0); ad(x, tt, R(0.1, 0.35), 0.001, R(0.015, 0.05)); chain(c, b, x, m);
    }
    // Glut-Knistern
    for (let i = 0; i < 16; i++) { const tt = t + 0.8 + Math.random() * 1.8, c = noiseSrc(ctx, 'white', tt, 0.05), h = filt(ctx, 'highpass', 3500), x = gainN(ctx, 0); ad(x, tt, R(0.04, 0.12), 0.001, 0.01); chain(c, h, x, m); }
    finish(m, out, rev, 0.5);
    return dur;
  },

  woodHit(ctx, out, rev, t, v, p) {
    const dur = 0.7, m = mix(ctx, 0.8 * v);
    const o = osc(ctx, 'triangle', 230 * p, t, 0.3); sweep(o.frequency, t, 230 * p, 140 * p, 0.12);
    const g = gainN(ctx, 0); ad(g, t, 0.7, 0.002, 0.14); chain(o, g, m);
    const o2 = osc(ctx, 'sine', 560 * p, t, 0.2), g2 = gainN(ctx, 0); ad(g2, t, 0.25, 0.001, 0.07); chain(o2, g2, m);
    const n = noiseSrc(ctx, 'white', t, 0.2), bp = filt(ctx, 'bandpass', 1100 * p, 2.5), ng = gainN(ctx, 0); ad(ng, t, 0.8, 0.001, 0.05); chain(n, bp, ng, m);
    for (let i = 0; i < 4; i++) { const tt = t + 0.03 + i * R(0.03, 0.07), c = noiseSrc(ctx, 'white', tt, 0.05), b = filt(ctx, 'bandpass', R(1500, 3500), 7), x = gainN(ctx, 0); ad(x, tt, 0.2, 0.001, 0.02); chain(c, b, x, m); }
    finish(m, out, rev, 0.2);
    return dur;
  },

  sink(ctx, out, rev, t, v, p) {
    const dur = 3.6, m = mix(ctx, 0.56 * v);
    // Knarzen des Holzes
    for (let k = 0; k < 4; k++) creak(ctx, m, t + k * 0.5 + R(0, 0.15), R(0.35, 0.7), 1 - k * 0.15, p);
    // gurgelndes Rauschen, Tiefpass fällt (Abtauchen)
    const n = noiseSrc(ctx, 'brown', t, dur), lp = filt(ctx, 'lowpass', 800, 1.4); sweep(lp.frequency, t, 900, 90, 3.2);
    const g = gainN(ctx, 0); const gp = g.gain; gp.setValueAtTime(EPS, t); gp.linearRampToValueAtTime(1.6, t + 0.6); gp.setValueAtTime(1.6, t + 1.4); gp.exponentialRampToValueAtTime(EPS, t + 3.4);
    const lfo = osc(ctx, 'sine', 6.5, t, dur), lg = gainN(ctx, 0.5); lfo.connect(lg); lg.connect(g.gain);
    chain(n, lp, g, m);
    // Blasen: Tonhöhe sinkt mit der Zeit
    for (let i = 0; i < 38; i++) {
      const x = Math.pow(Math.random(), 0.8), tt = t + 0.2 + x * 2.9;
      bubble(ctx, m, tt, R(500, 1500) * (1 - x * 0.7) * p, R(0.12, 0.3) * (1 - x * 0.5), R(0.05, 0.14));
    }
    // dumpfes Absinken + großes Glucksen am Ende
    const o = osc(ctx, 'sine', 70 * p, t, dur); sweep(o.frequency, t, 70 * p, 28, 3); const og = gainN(ctx, 0); ad(og, t, 0.6, 0.5, 2.6); chain(o, og, m);
    bubble(ctx, m, t + 2.6, 220 * p, 0.55, 0.28);
    bubble(ctx, m, t + 2.95, 160 * p, 0.4, 0.2);
    finish(m, out, rev, 0.35);
    return dur;
  },

  bubbles(ctx, out, rev, t, v, p) {
    const dur = 1.8, m = mix(ctx, 0.9 * v);
    for (let i = 0; i < 18; i++) bubble(ctx, m, t + Math.pow(Math.random(), 1.3) * 1.4, R(350, 1800) * p, R(0.2, 0.5), R(0.04, 0.13));
    const n = noiseSrc(ctx, 'pink', t, 1.6), lp = filt(ctx, 'lowpass', 500, 0.8), g = gainN(ctx, 0); ad(g, t, 0.12, 0.3, 1.2); chain(n, lp, g, m);
    finish(m, out, rev, 0.25);
    return dur;
  },

  click(ctx, out, rev, t, v, p) {
    const m = mix(ctx, 0.7 * v);
    const o = osc(ctx, 'triangle', 1300 * p, t, 0.1); sweep(o.frequency, t, 1300 * p, 520 * p, 0.04);
    const g = gainN(ctx, 0); ad(g, t, 0.6, 0.001, 0.045); chain(o, g, m);
    const c = noiseSrc(ctx, 'white', t, 0.03), h = filt(ctx, 'highpass', 3000), cg = gainN(ctx, 0); ad(cg, t, 0.3, 0.0005, 0.012); chain(c, h, cg, m);
    const o2 = osc(ctx, 'sine', 200 * p, t, 0.1), g2 = gainN(ctx, 0); ad(g2, t, 0.35, 0.002, 0.06); chain(o2, g2, m);
    finish(m, out, rev, 0.08);
    return 0.2;
  },

  hover(ctx, out, rev, t, v, p) {
    const m = mix(ctx, 0.5 * v);
    const o = osc(ctx, 'sine', 1900 * p, t, 0.08), g = gainN(ctx, 0); ad(g, t, 0.16, 0.008, 0.04); chain(o, g, m);
    const c = noiseSrc(ctx, 'white', t, 0.03), h = filt(ctx, 'highpass', 4500), cg = gainN(ctx, 0); ad(cg, t, 0.1, 0.002, 0.012); chain(c, h, cg, m);
    finish(m, out, null, 0);
    return 0.12;
  },

  place(ctx, out, rev, t, v, p) {
    const m = mix(ctx, 0.85 * v);
    const o = osc(ctx, 'sine', 170 * p, t, 0.4); sweep(o.frequency, t, 170 * p, 78 * p, 0.14);
    const g = gainN(ctx, 0); ad(g, t, 0.9, 0.002, 0.2); chain(o, g, m);
    const o2 = osc(ctx, 'triangle', 420 * p, t, 0.2), g2 = gainN(ctx, 0); ad(g2, t, 0.3, 0.001, 0.08); chain(o2, g2, m);
    const n = noiseSrc(ctx, 'white', t, 0.15), bp = filt(ctx, 'bandpass', 700 * p, 1.5), ng = gainN(ctx, 0); ad(ng, t, 0.5, 0.001, 0.06); chain(n, bp, ng, m);
    // leises Wasserplätschern hinterher
    const w = noiseSrc(ctx, 'white', t + 0.08, 0.4), wb = filt(ctx, 'bandpass', 900, 0.7), wg = gainN(ctx, 0); ad(wg, t + 0.08, 0.1, 0.05, 0.25); chain(w, wb, wg, m);
    finish(m, out, rev, 0.25);
    return 0.7;
  },

  rotate(ctx, out, rev, t, v, p) {
    const m = mix(ctx, 0.7 * v);
    creak(ctx, m, t, 0.28, 0.9, p * 1.2);
    const n = noiseSrc(ctx, 'pink', t, 0.3), bp = filt(ctx, 'bandpass', 1400, 1), g = gainN(ctx, 0); ad(g, t, 0.18, 0.08, 0.2); chain(n, bp, g, m);
    const o = osc(ctx, 'sine', 140 * p, t + 0.22, 0.2), og = gainN(ctx, 0); ad(og, t + 0.22, 0.4, 0.003, 0.09); chain(o, og, m);
    finish(m, out, rev, 0.15);
    return 0.6;
  },

  error(ctx, out, rev, t, v, p) {
    const m = mix(ctx, 0.5 * v), lp = filt(ctx, 'lowpass', 1100, 0.8); lp.connect(m);
    [[0, 233], [0.13, 175]].forEach(([d, f]) => {
      for (const det of [1, 1.011]) {
        const o = osc(ctx, 'square', f * p * det, t + d, 0.2), g = gainN(ctx, 0); ad(g, t + d, 0.45, 0.005, 0.14); chain(o, g, lp);
      }
    });
    finish(m, out, rev, 0.1);
    return 0.5;
  },

  bell(ctx, out, rev, t, v, p) {
    const dur = 4, m = mix(ctx, 0.5 * v), base = 620 * p;
    // inharmonische Partialtöne einer Glocke: [Frequenzverhältnis, Pegel, Abklingzeit]
    [[0.5, 0.5, 2.8], [1, 1, 3.2], [1.19, 0.6, 2.2], [1.56, 0.4, 1.8], [2, 0.55, 1.6], [2.74, 0.45, 1.1], [3.76, 0.3, 0.8], [5.4, 0.2, 0.5], [6.8, 0.12, 0.35]].forEach(([r, a, d]) => {
      const o = osc(ctx, 'sine', base * r * R(0.998, 1.002), t, d + 0.3), g = gainN(ctx, 0); ad(g, t, a * 0.45, 0.002, d); chain(o, g, m);
    });
    const n = noiseSrc(ctx, 'white', t, 0.06), bp = filt(ctx, 'bandpass', 3000, 1.2), ng = gainN(ctx, 0); ad(ng, t, 0.3, 0.001, 0.02); chain(n, bp, ng, m);
    finish(m, out, rev, 0.6);
    return dur;
  },

  coins(ctx, out, rev, t, v, p) {
    const dur = 1.6, m = mix(ctx, 0.5 * v);
    for (let i = 0; i < 11; i++) {
      const tt = t + i * 0.045 + Math.pow(Math.random(), 1.5) * 0.45, f = R(2600, 4300) * p;
      [[1, 0.5], [1.504, 0.3], [2.76, 0.18]].forEach(([r, a]) => {
        const o = osc(ctx, 'sine', f * r, tt, 0.4), g = gainN(ctx, 0); ad(g, tt, a * R(0.4, 1), 0.001, R(0.12, 0.3)); chain(o, g, m);
      });
      const c = noiseSrc(ctx, 'white', tt, 0.02), h = filt(ctx, 'highpass', 6000), cg = gainN(ctx, 0); ad(cg, tt, 0.08, 0.0005, 0.01); chain(c, h, cg, m);
    }
    finish(m, out, rev, 0.4);
    return dur;
  },

  victory(ctx, out, rev, t, v, p) {
    const e = 0.215, m = mix(ctx, 0.8 * v);
    const mel = [[62, 0, 1], [66, 1, 1], [69, 2, 2], [69, 4, 1], [71, 5, 1], [69, 6, 1], [66, 7, 1], [74, 8, 3], [71, 11, 1], [69, 12, 2], [66, 14, 2],
      [67, 16, 1], [69, 17, 1], [71, 18, 2], [69, 20, 1], [67, 21, 1], [66, 22, 1], [64, 23, 1], [62, 24, 6]];
    const fr = (n) => 440 * Math.pow(2, (n - 69) / 12) * p;
    for (const [n, s, d] of mel) {
      concertina(ctx, m, t + s * e, fr(n), d * e * 0.95, 0.34, { bright: 1.6, trem: 5.5 });
      concertina(ctx, m, t + s * e, fr(n + 12), d * e * 0.95, 0.08, { bright: 1.2 });
    }
    // Begleitung: Akkorde auf 0,8,16,24 und Bass
    const ch = [[0, [50, 57, 62, 66]], [8, [50, 57, 62, 66]], [12, [47, 54, 59, 62]], [16, [43, 50, 55, 59]], [20, [45, 52, 57, 61]], [24, [50, 57, 62, 66, 69]]];
    ch.forEach(([s, notes], i) => {
      const next = ch[i + 1] ? ch[i + 1][0] : 30;
      notes.forEach((n) => concertina(ctx, m, t + s * e, fr(n), (next - s) * e * 0.95, 0.1, { bright: 0.8 }));
    });
    for (let s = 0; s < 24; s += 4) bass(ctx, m, t + s * e, fr(s < 12 ? 38 : s < 16 ? 35 : s < 20 ? 43 : 33), e * 3, 0.5);
    bass(ctx, m, t + 24 * e, fr(38), e * 5, 0.55);
    for (let s = 0; s < 24; s += 3) drum(ctx, m, t + s * e, s % 6 === 0 ? 'hit' : 'soft', 0.4);
    for (let i = 0; i < 6; i++) drum(ctx, m, t + (21 + i * 0.5) * e, 'soft', 0.3);
    drum(ctx, m, t + 24 * e, 'hit', 0.7);
    SOUNDS.bell(ctx, m, rev, t + 24 * e, 0.6, p * 1.5);
    SOUNDS.coins(ctx, m, rev, t + 25 * e, 0.7, 1);
    finish(m, out, rev, 0.45);
    return 30 * e + 1.5;
  },

  defeat(ctx, out, rev, t, v, p) {
    const e = 0.3, m = mix(ctx, 0.8 * v);
    const fr = (n) => 440 * Math.pow(2, (n - 69) / 12) * p;
    const mel = [[74, 0, 2], [72, 2, 2], [69, 4, 2], [70, 6, 1], [69, 7, 1], [65, 8, 4], [64, 12, 2], [62, 14, 7]];
    for (const [n, s, d] of mel) {
      concertina(ctx, m, t + s * e, fr(n), d * e, 0.3, { bright: 0.55, trem: 4.2 });
      fiddle(ctx, m, t + s * e, fr(n - 12), d * e, 0.1);
    }
    [[0, [50, 57, 62]], [6, [46, 53, 58]], [8, [50, 57, 62]], [14, [50, 57, 62]]].forEach(([s, notes], i, a) => {
      const nx = a[i + 1] ? a[i + 1][0] : 21;
      notes.forEach((n) => concertina(ctx, m, t + s * e, fr(n), (nx - s) * e, 0.1, { bright: 0.4, trem: 3.5 }));
    });
    [[0, 38], [4, 38], [8, 34], [12, 36], [14, 38]].forEach(([s, n]) => bass(ctx, m, t + s * e, fr(n), 3 * e, 0.5));
    drum(ctx, m, t, 'hit', 0.5); drum(ctx, m, t + 8 * e, 'soft', 0.4); drum(ctx, m, t + 14 * e, 'hit', 0.5);
    SOUNDS.bell(ctx, m, rev, t, 0.45, p * 0.55);
    SOUNDS.bell(ctx, m, rev, t + 4 * e, 0.35, p * 0.55);
    SOUNDS.bell(ctx, m, rev, t + 14 * e, 0.45, p * 0.5);
    finish(m, out, rev, 0.55);
    return 21 * e + 2.5;
  },
};

/** Holzknarren: Sägezahn mit zufällig wanderndem Pitch durch Bandpass. */
export function creak(ctx, out, t, dur, vol = 1, p = 1) {
  const o = osc(ctx, 'sawtooth', 90 * p, t, dur + 0.05), f = o.frequency;
  let tt = t, fq = R(60, 130) * p; f.setValueAtTime(fq, t);
  while (tt < t + dur) { tt += R(0.03, 0.09); fq = Math.max(40, fq * R(0.8, 1.3)); f.linearRampToValueAtTime(fq, tt); }
  const bp = filt(ctx, 'bandpass', R(500, 900), 6), bp2 = filt(ctx, 'peaking', 1600, 3); bp2.gain.value = 8;
  const g = gainN(ctx, 0); const gp = g.gain; gp.setValueAtTime(0, t); gp.linearRampToValueAtTime(0.5 * vol, t + dur * 0.25);
  let x = t + dur * 0.25; while (x < t + dur * 0.8) { x += R(0.02, 0.06); gp.linearRampToValueAtTime(vol * R(0.25, 0.6), x); }
  gp.linearRampToValueAtTime(0, t + dur);
  const n = noiseSrc(ctx, 'white', t, dur), nb = filt(ctx, 'bandpass', 1200, 4), ng = gainN(ctx, 0.12); chain(n, nb, ng, g);
  chain(o, bp, bp2, g); g.connect(out);
}

export const SOUND_NAMES = Object.keys(SOUNDS);
export const SOUND_FNS = SOUNDS;
