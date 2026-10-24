// Synthetisierte Instrumente (Concertina, Laute/Karplus-Strong, Fiedel, Bass, Bodhrán).
import { EPS, R, osc, gainN, filt, noiseSrc, ad, sweep, chain, mtof } from './dsp.js';

/** Concertina/Akkordeon: verstimmte Sägezähne + Pulse, Tiefpass, leichtes Tremolo. */
export function concertina(ctx, out, t, f, dur, vel = 0.4, { trem = 5, bright = 1, attack = 0.035, light = false } = {}) {
  const end = t + dur + 0.25;
  const g = gainN(ctx, 0);
  const lp = filt(ctx, 'lowpass', Math.min(f * 5 * bright + 400, 5000), 0.6);
  const o1 = osc(ctx, 'sawtooth', f * 0.9965, t, dur + 0.25);
  const o2 = osc(ctx, 'sawtooth', f * 1.0035, t, dur + 0.25);
  const m = gainN(ctx, light ? 0.4 : 0.32);
  o1.connect(m); o2.connect(m); m.connect(lp);
  if (!light) { const o3 = osc(ctx, 'square', f, t, dur + 0.25), m3 = gainN(ctx, 0.2); o3.connect(m3); m3.connect(lp); }
  lp.connect(g);
  const p = g.gain;
  p.setValueAtTime(0, t); p.linearRampToValueAtTime(vel, t + attack);
  p.setValueAtTime(vel, t + Math.max(dur, attack + 0.01)); p.linearRampToValueAtTime(0, t + dur + 0.14);
  if (!light) { const lfo = osc(ctx, 'sine', trem * R(0.95, 1.05), t, dur + 0.25); const lg = gainN(ctx, vel * 0.13); lfo.connect(lg); lg.connect(g.gain); }
  g.connect(out);
  return end;
}

/** Fiedel: gestrichene, leicht angeraute Säge mit spätem Vibrato. */
export function fiddle(ctx, out, t, f, dur, vel = 0.3) {
  const g = gainN(ctx, 0);
  const o1 = osc(ctx, 'sawtooth', f * 0.998, t, dur + 0.3), o2 = osc(ctx, 'sawtooth', f * 1.002, t, dur + 0.3);
  const lp = filt(ctx, 'lowpass', Math.min(f * 4 + 600, 4200), 0.9);
  const bp = filt(ctx, 'peaking', 1500, 1.2); bp.gain.value = 5;
  const m = gainN(ctx, 0.4); o1.connect(m); o2.connect(m); chain(m, lp, bp, g); g.connect(out);
  const vib = osc(ctx, 'sine', 5.6, t, dur + 0.3);
  const vg = gainN(ctx, 0); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.009, t + Math.min(dur, 0.5));
  vib.connect(vg); vg.connect(o1.frequency); vg.connect(o2.frequency);
  const p = g.gain; p.setValueAtTime(0, t); p.linearRampToValueAtTime(vel, t + 0.07);
  p.setValueAtTime(vel * 0.9, t + dur); p.linearRampToValueAtTime(0, t + dur + 0.2);
}

const ksCache = new Map();
/** Karplus-Strong in einen Buffer gerechnet (WebAudio-Delay-Loops sind für hohe Töne zu träge). */
function ksBuffer(ctx, f) {
  const sr = ctx.sampleRate, N = Math.max(2, Math.round(sr / f)), key = sr + '_' + N;
  let e = ksCache.get(key);
  if (e) return e;
  const len = Math.floor(sr * 1.8), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
  for (let i = 1; i < N; i++) d[i] = 0.55 * d[i] + 0.45 * d[i - 1]; // weicher Anschlag
  const damp = 0.9965;
  for (let i = N; i < len; i++) d[i] = (d[i - N] + d[i - N + 1 < i ? i - N + 1 : i - N]) * 0.5 * damp;
  let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
  const k = 0.9 / (pk || 1); for (let i = 0; i < len; i++) d[i] *= k;
  e = { buf, fa: sr / N }; ksCache.set(key, e);
  return e;
}
/** Gezupfte Laute. */
export function pluck(ctx, out, t, f, dur, vel = 0.5) {
  const { buf, fa } = ksBuffer(ctx, f);
  const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = f / fa;
  const lp = filt(ctx, 'lowpass', 3800, 0.5);
  const g = gainN(ctx, vel);
  const rel = Math.max(dur * 1.6, 0.5);
  g.gain.setValueAtTime(vel, t); g.gain.setValueAtTime(vel, t + rel * 0.5); g.gain.linearRampToValueAtTime(0, t + rel + 0.3);
  s.connect(lp); lp.connect(g); g.connect(out);
  s.start(t); s.stop(t + rel + 0.35);
}

/** Zupfbass (Kontrabass-artig). */
export function bass(ctx, out, t, f, dur, vel = 0.5) {
  const g = gainN(ctx, 0);
  const o1 = osc(ctx, 'triangle', f, t, dur + 0.3), o2 = osc(ctx, 'sawtooth', f, t, dur + 0.3);
  const m2 = gainN(ctx, 0.3); o2.connect(m2);
  const lp = filt(ctx, 'lowpass', 700, 0.8); lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(220, t + 0.35);
  o1.connect(lp); m2.connect(lp); lp.connect(g); g.connect(out);
  ad(g, t, vel, 0.01, Math.max(dur, 0.25) * 1.1);
}

/** Bodhrán/Fasstrommel. kind: 'hit' | 'soft' | 'rim' */
export function drum(ctx, out, t, kind = 'hit', vel = 0.5) {
  if (kind === 'rim') {
    const n = noiseSrc(ctx, 'white', t, 0.08), bp = filt(ctx, 'bandpass', 2400, 2), g = gainN(ctx, 0);
    ad(g, t, vel * 0.5, 0.001, 0.05); chain(n, bp, g); g.connect(out); return;
  }
  const o = osc(ctx, 'sine', kind === 'soft' ? 110 : 125, t, 0.5);
  sweep(o.frequency, t, kind === 'soft' ? 110 : 125, 58, 0.18);
  const g = gainN(ctx, 0); ad(g, t, vel, 0.002, kind === 'soft' ? 0.18 : 0.3); o.connect(g); g.connect(out);
  const n = noiseSrc(ctx, 'white', t, 0.15), bp = filt(ctx, 'bandpass', 450, 0.8), ng = gainN(ctx, 0);
  ad(ng, t, vel * 0.55, 0.002, 0.07); chain(n, bp, ng); ng.connect(out);
}
export { mtof };
