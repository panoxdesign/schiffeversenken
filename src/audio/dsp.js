// Kleine DSP-Helfer für die WebAudio-Synthese (alle nehmen beliebige BaseAudioContext).
export const EPS = 0.0001;
export const R = (a, b) => a + Math.random() * (b - a);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const noiseCache = new Map(); // sampleRate -> {white,pink,brown}
const NOISE_SECONDS = 6;

/** Rausch-Buffer (einmal pro Samplerate erzeugt, nahtlos loopbar durch Crossfade). */
export function getNoise(ctx, kind) {
  const sr = ctx.sampleRate;
  let set = noiseCache.get(sr);
  if (!set) { set = {}; noiseCache.set(sr, set); }
  if (set[kind]) return set[kind];
  const L = Math.floor(sr * NOISE_SECONDS), X = Math.floor(sr * 0.08);
  const raw = new Float32Array(L + X);
  if (kind === 'white') {
    for (let i = 0; i < raw.length; i++) raw[i] = Math.random() * 2 - 1;
  } else if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < raw.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < raw.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; raw[i] = last * 3.5; }
  }
  const buf = ctx.createBuffer(1, L, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < L; i++) d[i] = raw[i];
  for (let i = 0; i < X; i++) { const a = i / X; d[i] = raw[i] * a + raw[L + i] * (1 - a); } // Naht verblenden
  let peak = 0; for (let i = 0; i < L; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = 0.9 / (peak || 1); for (let i = 0; i < L; i++) d[i] *= k;
  set[kind] = buf;
  return buf;
}

export function noiseSrc(ctx, kind, t, dur) {
  const s = ctx.createBufferSource();
  s.buffer = getNoise(ctx, kind); s.loop = true;
  s.start(t, Math.random() * (NOISE_SECONDS - 1));
  s.stop(t + dur);
  return s;
}
export function osc(ctx, type, f, t, dur) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t + dur); return o;
}
export function gainN(ctx, v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }
export function filt(ctx, type, f, q = 0.7) {
  const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n;
}
/** Attack-Decay-Hüllkurve auf einem Gain-Node (linearer Anstieg, exponentieller Abfall). */
export function ad(g, t, peak, a, d) {
  const p = g.gain; p.cancelScheduledValues(t);
  p.setValueAtTime(EPS, t); p.linearRampToValueAtTime(Math.max(peak, EPS), t + a);
  p.exponentialRampToValueAtTime(EPS, t + a + d);
}
export function sweep(param, t, from, to, dur) {
  param.setValueAtTime(from, t); param.exponentialRampToValueAtTime(to, t + dur);
}
export function chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; }

const shaperCache = new Map();
export function shaper(ctx, amount = 4) {
  let c = shaperCache.get(amount);
  if (!c) {
    c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount); }
    shaperCache.set(amount, c);
  }
  const s = ctx.createWaveShaper(); s.curve = c; s.oversample = '2x'; return s;
}
/** Mix → Ziel (trocken) + optionaler Hall-Send. */
export function finish(node, dest, rev, send = 0) {
  node.connect(dest);
  if (rev && send > 0) { const s = node.context.createGain(); s.gain.value = send; node.connect(s); s.connect(rev); }
}
/** Blubberblase: kurzer Sinus mit steigender Tonhöhe. */
export function bubble(ctx, out, t, f, vol, dur = R(0.04, 0.12)) {
  const o = osc(ctx, 'sine', f, t, dur + 0.06);
  o.frequency.exponentialRampToValueAtTime(f * R(1.4, 2.1), t + dur);
  const g = gainN(ctx, 0); ad(g, t, vol, 0.004, dur);
  o.connect(g); g.connect(out);
}
/** Prozeduraler Hall-Impuls (Stereo, exponentiell abklingendes, nach hinten dunkler werdendes Rauschen). */
export function makeImpulse(ctx, seconds = 2.6, decay = 3.2) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const k = 0.55 * (1 - x) + 0.04; // Tiefpass wird mit der Zeit stärker
      lp += k * ((Math.random() * 2 - 1) - lp);
      const early = i < sr * 0.012 ? 0 : 1; // Pre-Delay
      d[i] = lp * Math.pow(1 - x, decay) * early * 1.6;
    }
  }
  return buf;
}
