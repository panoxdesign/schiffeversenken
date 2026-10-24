// Dauerhafte Meeres-Atmosphäre: Brandung, Wind, gelegentliches Knarren und Möwen.
import { R, osc, gainN, filt, noiseSrc, getNoise, chain } from './dsp.js';
import { creak } from './sounds.js';

/** Möwenschrei: 2–4 „kja“-Silben, Säge durch Formantfilter mit Pitch-Bogen. */
export function gull(ctx, out, t, vol = 0.2, p = 1) {
  const syl = Math.floor(R(2, 5)); let tt = t;
  const f0 = R(1350, 1800) * p;
  for (let i = 0; i < syl; i++) {
    const d = R(0.26, 0.46) * (1 - i * 0.06), f = f0 * (1 - i * 0.04);
    const o = osc(ctx, 'sawtooth', f * 0.8, tt, d + 0.05);
    o.frequency.exponentialRampToValueAtTime(f * 1.4, tt + d * 0.3); o.frequency.exponentialRampToValueAtTime(f * 0.72, tt + d);
    const vib = osc(ctx, 'sine', R(26, 36), tt, d + 0.05), vg = gainN(ctx, f * 0.05); vib.connect(vg); vg.connect(o.frequency);
    const g = gainN(ctx, 0); const gp = g.gain; gp.setValueAtTime(0, tt); gp.linearRampToValueAtTime(vol, tt + 0.03); gp.exponentialRampToValueAtTime(vol * 0.5, tt + d * 0.6); gp.linearRampToValueAtTime(0, tt + d);
    const b1 = filt(ctx, 'bandpass', 2100, 3), b2 = filt(ctx, 'bandpass', 4200, 5), g2 = gainN(ctx, 0.5), m = gainN(ctx, 1);
    o.connect(b1); o.connect(b2); b2.connect(g2); b1.connect(m); g2.connect(m);
    const n = noiseSrc(ctx, 'white', tt, d + 0.05), nb = filt(ctx, 'bandpass', 3200, 2), ng = gainN(ctx, 0.25); chain(n, nb, ng, m);
    m.connect(g); g.connect(out);
    tt += d + R(0.06, 0.16);
  }
  return tt - t;
}

export class Ambience {
  constructor(ctx, out, rev, panFactory) {
    this.ctx = ctx; this.out = out; this.rev = rev; this.running = false; this.timers = []; this.nodes = [];
  }
  _loop(kind, offset) {
    const s = this.ctx.createBufferSource(); s.buffer = getNoise(this.ctx, kind); s.loop = true; s.start(0, offset); this.nodes.push(s); return s;
  }
  _lfo(freq, depth, target) {
    const o = osc(this.ctx, 'sine', freq, this.ctx.currentTime, 1e6), g = gainN(this.ctx, depth); o.connect(g); g.connect(target); this.nodes.push(o); return o;
  }
  start() {
    if (this.running) return; this.running = true;
    const ctx = this.ctx, bus = gainN(ctx, 0); this.bus = bus; bus.connect(this.out);
    bus.gain.setValueAtTime(0, ctx.currentTime); bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 4);
    // Grundrauschen des Meeres (braun) mit langsamer Brandung
    const sea = this._loop('brown', 0.3), seaLp = filt(ctx, 'lowpass', 520, 0.6), seaG = gainN(ctx, 0.5);
    chain(sea, seaLp, seaG, bus); this._lfo(0.11, 0.2, seaG.gain); this._lfo(0.05, 120, seaLp.frequency);
    // Brandungs-Rauschen (rosa), andere Phase
    const surf = this._loop('pink', 2.1), surfBp = filt(ctx, 'bandpass', 800, 0.5), surfG = gainN(ctx, 0.12);
    chain(surf, surfBp, surfG, bus); this._lfo(0.073, 0.1, surfG.gain); this._lfo(0.073, 300, surfBp.frequency);
    // Wind
    const wind = this._loop('pink', 4.0), windBp = filt(ctx, 'bandpass', 380, 1.4), windG = gainN(ctx, 0.12);
    chain(wind, windBp, windG, bus); this._lfo(0.043, 0.07, windG.gain); this._lfo(0.031, 160, windBp.frequency);
    this._schedule('creak', 3, 8); this._schedule('gull', 6, 16);
  }
  _schedule(kind, min, max) {
    const id = setTimeout(() => {
      if (!this.running) return;
      const ctx = this.ctx, t = ctx.currentTime + 0.05;
      if (ctx.state === 'running') {
        const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        const dest = pan || this.out; if (pan) { pan.pan.value = R(-0.8, 0.8); pan.connect(this.out); }
        let d;
        if (kind === 'creak') { d = R(0.5, 1.3); const g = gainN(ctx, R(0.05, 0.12)); g.connect(dest); creak(ctx, g, t, d, 1, R(0.8, 1.2)); }
        else { const g = gainN(ctx, 1); g.connect(dest); d = gull(ctx, g, t, R(0.04, 0.09), R(0.85, 1.15)); }
        setTimeout(() => { try { pan && pan.disconnect(); } catch (e) { /* */ } }, (d + 1) * 1000);
      }
      this._schedule(kind, min, max);
    }, R(min, max) * 1000 * (kind === 'gull' ? 1.6 : 1));
    this.timers.push(id);
  }
  stop() { this.running = false; this.timers.forEach(clearTimeout); this.timers = []; this.nodes.forEach((n) => { try { n.stop(); } catch (e) { /* */ } }); this.nodes = []; }
}
