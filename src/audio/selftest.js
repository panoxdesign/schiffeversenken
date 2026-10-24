// Offline-Selbsttest: rendert jeden Sound/Song in einem OfflineAudioContext und prüft Peak/RMS/NaN/Clipping.
import { SOUND_FNS, SOUND_NAMES } from './sounds.js';
import { renderMusic } from './music.js';
import { makeImpulse, gainN } from './dsp.js';

const SR = 44100;
function analyze(buf) {
  let peak = 0, sum = 0, n = 0, nan = 0, clip = 0, last = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const x = d[i];
      if (x !== x || !isFinite(x)) { nan++; continue; }
      const a = Math.abs(x); if (a > peak) peak = a; if (a >= 0.99) clip++;
      sum += x * x; n++; if (a > 1e-4) last = Math.max(last, i);
    }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)), nan, clipFrac: clip / Math.max(1, n), tailSec: last / SR };
}
function setup(ctx, gain = 1) {
  const conv = ctx.createConvolver(); conv.buffer = makeImpulse(ctx, 2.6, 3.2);
  const rv = gainN(ctx, 0.7); conv.connect(rv);
  const m = gainN(ctx, gain); m.connect(ctx.destination); rv.connect(m);
  const rev = gainN(ctx, 1); rev.connect(conv);
  return { m, rev };
}

export async function runAudioSelfTest(opts = {}) {
  const music = opts.music !== false, sounds = opts.sounds !== false;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const rows = [];
  for (const name of sounds ? SOUND_NAMES : []) {
    const ctx = new OAC(2, SR * 12, SR), { m, rev } = setup(ctx);
    const dur = SOUND_FNS[name](ctx, m, rev, 0.02, 1, 1);
    const t0 = performance.now(), buf = await ctx.startRendering();
    const a = analyze(buf);
    const ok = a.nan === 0 && a.peak >= 0.05 && a.peak <= 1.0 && a.clipFrac < 0.002;
    rows.push({ name, dur: +dur.toFixed(2), peak: +a.peak.toFixed(3), rms: +a.rms.toFixed(4), nan: a.nan, clip: +a.clipFrac.toFixed(5), tail: +a.tailSec.toFixed(2), ms: Math.round(performance.now() - t0), ok });
  }
  if (music) for (const name of opts.songs || ['menu', 'battle']) {
    const secs = opts.secs || 40, ctx = new OAC(2, SR * (secs + 3), SR), { m, rev } = setup(ctx, 1);
    const bus = gainN(ctx, 0.5 * 0.36); bus.connect(m); // entspricht Musik-Bus bei Lautstärke 0.6
    renderMusic(ctx, bus, rev, name, secs);
    const t0 = performance.now(), buf = await ctx.startRendering(), a = analyze(buf);
    rows.push({ name: 'music:' + name, dur: secs, peak: +a.peak.toFixed(3), rms: +a.rms.toFixed(4), nan: a.nan, clip: +a.clipFrac.toFixed(5), tail: +a.tailSec.toFixed(2), ms: Math.round(performance.now() - t0), ok: a.nan === 0 && a.peak >= 0.05 && a.peak <= 1 && a.clipFrac < 0.002 });
  }
  return { allOk: rows.every((r) => r.ok), rows };
}
