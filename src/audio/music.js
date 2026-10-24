// Prozeduraler Seemannslied-Sequencer (6/8, d-Moll/Dorisch). Planung über AudioContext-Zeit.
import { gainN, filt, mtof, osc, ad, noiseSrc, chain, R } from './dsp.js';
import { concertina, fiddle, pluck, bass, drum } from './instruments.js';

const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
function midi(tok) {
  const m = /^([a-g])(#|b)?(\d)$/.exec(tok);
  return 12 * (parseInt(m[3], 10) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
/** "d4:2 f4:1 -:3" → [{s, m, d}] (s = Achtel im Takt, d = Länge in Achteln) */
function bar(str) {
  let s = 0; const out = [];
  for (const tk of str.trim().split(/\s+/)) {
    const [n, d] = tk.split(':'); const len = parseInt(d, 10);
    if (n !== '-') out.push({ s, m: midi(n), d: len });
    s += len;
  }
  return out;
}
// Akkorde: Töne (Mittellage) + Bass-Grundton + Quinte
const CH = {
  Dm: { t: [50, 53, 57], r: 38, f: 45 }, Gm: { t: [50, 55, 58], r: 43, f: 38 }, C: { t: [48, 52, 55], r: 36, f: 43 },
  Bb: { t: [50, 53, 58], r: 34, f: 41 }, A: { t: [49, 52, 57], r: 33, f: 40 }, F: { t: [48, 53, 57], r: 41, f: 36 },
};

// ---- Kompositionen: jede Sektion = 8 Takte [Akkord, Melodie] ----
const MENU = {
  step: 0.31, // Achtelnote in s (≈ 64 BPM punktierte Viertel)
  sections: [
    { name: 'A', lead: 'concertina', bars: [
      ['Dm', 'a4:3 g4:1 f4:2'], ['Dm', 'd4:3 e4:1 f4:2'], ['C', 'g4:3 e4:1 g4:2'], ['Dm', 'f4:3 e4:1 d4:2'],
      ['Bb', 'd5:3 c5:1 bb4:2'], ['C', 'c5:3 g4:1 e4:2'], ['A', 'e4:2 g4:1 a4:1 c#5:2'], ['Dm', 'd4:6'] ] },
    { name: 'B', lead: 'pluck', bars: [
      ['Dm', 'd5:3 c5:1 a4:2'], ['Gm', 'bb4:3 a4:1 g4:2'], ['Bb', 'f4:2 g4:1 bb4:3'], ['A', 'a4:3 g4:1 e4:2'],
      ['Dm', 'f4:1 a4:1 d5:1 f5:3'], ['C', 'e5:3 d5:1 c5:2'], ['A', 'c#5:3 e5:1 a4:2'], ['Dm', 'a4:3 d5:3'] ] },
    { name: 'C', lead: 'fiddle', bars: [
      ['F', 'a4:3 c5:3'], ['C', 'g4:3 e4:3'], ['Dm', 'f4:2 a4:1 d5:3'], ['A', 'c#5:3 e5:3'],
      ['Bb', 'd5:3 f5:3'], ['Gm', 'g5:2 f5:1 d5:3'], ['A', 'e5:3 c#5:3'], ['Dm', 'd5:6'] ] },
  ],
  order: [0, 1, 0, 2],
  pad: 0.11, bassVel: 0.34, drums: 'menu', pluckVel: 0.55,
};
const BATTLE = {
  step: 0.19, // ≈ 105 BPM punktierte Viertel
  sections: [
    { name: 'A', lead: 'concertina', bars: [
      ['Dm', 'd5:2 d5:1 c5:1 a4:1 c5:1'], ['Dm', 'd5:1 e5:1 f5:2 e5:1 d5:1'], ['C', 'e5:2 e5:1 d5:1 c5:1 d5:1'], ['C', 'e5:3 c5:3'],
      ['Bb', 'd5:2 d5:1 c5:1 bb4:1 c5:1'], ['A', 'a4:1 c#5:1 e5:2 d5:1 c#5:1'], ['Dm', 'd5:2 f5:1 e5:1 d5:1 a4:1'], ['A', 'a4:2 c#5:1 e5:3'] ] },
    { name: 'B', lead: 'fiddle', bars: [
      ['Gm', 'g4:2 g4:1 a4:1 bb4:1 a4:1'], ['Gm', 'g4:1 bb4:1 d5:2 c5:1 bb4:1'], ['Dm', 'a4:2 a4:1 bb4:1 a4:1 f4:1'], ['Dm', 'd4:3 f4:3'],
      ['Bb', 'f5:2 f5:1 e5:1 d5:1 bb4:1'], ['C', 'c5:2 e5:1 g5:3'], ['A', 'a5:2 g5:1 e5:1 c#5:1 e5:1'], ['Dm', 'd5:6'] ] },
    { name: 'C', lead: 'pluck', bars: [
      ['Dm', 'd5:1 a4:1 d5:1 f5:1 d5:1 a4:1'], ['Dm', 'e5:1 a4:1 e5:1 g5:1 e5:1 a4:1'], ['F', 'f5:1 c5:1 f5:1 a5:1 f5:1 c5:1'], ['C', 'g5:1 e5:1 c5:1 e5:1 g5:2'],
      ['Bb', 'bb4:1 d5:1 f5:1 d5:1 bb4:2'], ['A', 'a4:1 c#5:1 e5:1 a5:1 g5:1 e5:1'], ['Dm', 'f5:2 e5:1 d5:1 c5:1 a4:1'], ['A', 'a4:3 c#5:1 e5:2'] ] },
  ],
  order: [0, 1, 2, 1, 0, 2],
  pad: 0.1, bassVel: 0.5, drums: 'battle', pluckVel: 0.6,
};
export const SONGS = { menu: MENU, battle: BATTLE };

// Takte vorab zerlegen
function build(song) {
  const bars = [];
  song.order.forEach((si, k) => {
    const sec = song.sections[si];
    sec.bars.forEach(([ch, mel], b) => {
      bars.push({ chord: CH[ch], notes: bar(mel), lead: sec.lead, sec: k, first: b === 0, last: b === 7, secName: sec.name, idx: b });
    });
  });
  return bars;
}
const built = new Map();

export class Sequencer {
  constructor(ctx, out, rev, name) {
    this.ctx = ctx; this.out = out; this.rev = rev; this.name = name;
    this.song = SONGS[name]; if (!built.has(name)) built.set(name, build(this.song));
    this.bars = built.get(name); this.step = 0; this.next = 0;
    this.bus = gainN(ctx, 1); this.bus.connect(out); // Fade-/Mix-Punkt dieses Tracks
    this.revSend = gainN(ctx, 0.35); // Musik-Hallanteil (folgt dem Fade)
    if (rev) { this.bus.connect(this.revSend); this.revSend.connect(rev); }
  }
  get stepsTotal() { return this.bars.length * 6; }
  /** Plant einen Achtelschritt zur Zeit t. */
  scheduleStep(i, t) {
    const song = this.song, S = song.step, n = this.bars.length * 6;
    const g = i % n, bi = Math.floor(g / 6), s = g % 6, B = this.bars[bi], ch = B.chord;
    const ctx = this.ctx, out = this.bus, battle = this.name === 'battle';
    const sw = s % 3 === 1 ? 0.012 : 0; // minimale Swing-Verzögerung
    t += sw;
    // Akkordfläche / Begleitung
    if (battle) {
      if (s === 1 || s === 2 || s === 4 || s === 5) ch.t.forEach((m) => concertina(ctx, out, t, mtof(m), S * 0.55, song.pad * (s === 2 || s === 5 ? 1 : 0.7), { bright: 0.9, light: true }));
    } else if (s === 0) {
      ch.t.forEach((m) => concertina(ctx, out, t, mtof(m), S * 6 * 0.98, song.pad, { bright: 0.55, trem: 4.4, attack: 0.25, light: true }));
      concertina(ctx, out, t, mtof(ch.r + 12), S * 6 * 0.98, song.pad * 0.6, { bright: 0.3, trem: 4.4, attack: 0.3 });
    }
    // Bass
    if (battle) {
      if (s === 0) bass(ctx, out, t, mtof(ch.r), S * 1.6, song.bassVel);
      else if (s === 2) bass(ctx, out, t, mtof(ch.f), S * 0.9, song.bassVel * 0.75);
      else if (s === 3) bass(ctx, out, t, mtof(ch.r + 12), S * 1.6, song.bassVel * 0.8);
      else if (s === 5) bass(ctx, out, t, mtof(ch.f), S * 0.9, song.bassVel * 0.7);
    } else if (s === 0) bass(ctx, out, t, mtof(ch.r), S * 2.8, song.bassVel);
    else if (s === 3) bass(ctx, out, t, mtof(ch.f), S * 2.8, song.bassVel * 0.7);
    // Trommel
    if (battle) {
      if (s === 0) drum(ctx, out, t, 'hit', 0.62);
      else if (s === 2 || s === 5) drum(ctx, out, t, 'soft', 0.3);
      else if (s === 3) drum(ctx, out, t, 'hit', 0.45);
      if (s === 4 && B.idx % 2 === 1) drum(ctx, out, t, 'rim', 0.4);
      if (B.last && s >= 3) drum(ctx, out, t, 'soft', 0.35); // Fill
    } else {
      if (s === 0) drum(ctx, out, t, 'soft', 0.26);
      if (s === 3 && B.sec % 2 === 1) drum(ctx, out, t, 'soft', 0.16);
    }
    // Melodie
    for (const nt of B.notes) {
      if (nt.s !== s) continue;
      const f = mtof(nt.m), d = nt.d * S;
      if (B.lead === 'pluck') {
        pluck(ctx, out, t, f, d, song.pluckVel);
        if (!battle) concertina(ctx, out, t, f * 0.5, d * 0.95, 0.05, { bright: 0.4 });
      } else if (B.lead === 'fiddle') fiddle(ctx, out, t, f, d * 0.97, battle ? 0.26 : 0.22);
      else {
        concertina(ctx, out, t, f, d * 0.96, battle ? 0.3 : 0.26, { bright: battle ? 1.2 : 0.9, trem: battle ? 6 : 5 });
        if (!battle) pluck(ctx, out, t, f * 2, d, 0.12);
      }
    }
    // Arpeggio der Laute zwischen den Melodietönen (nur Menü, B-Teil) für Fluss
    if (!battle && B.lead === 'pluck' && (s === 2 || s === 5)) pluck(ctx, out, t, mtof(ch.t[s === 2 ? 1 : 2] + 12), S * 2, 0.16);
    return t;
  }
  dispose() { try { this.bus.disconnect(); this.revSend.disconnect(); } catch (e) { /* */ } }
}

/** Live-Player mit Lookahead-Scheduling, Crossfade zwischen Tracks. */
export class MusicPlayer {
  constructor(ctx, out, rev) { this.ctx = ctx; this.out = out; this.rev = rev; this.cur = null; this.name = 'none'; }
  play(name, fade = 2.2) {
    if (name === this.name) return;
    const ctx = this.ctx, now = ctx.currentTime, old = this.cur;
    if (old) {
      old.fade.gain.cancelScheduledValues(now); old.fade.gain.setValueAtTime(old.fade.gain.value, now);
      old.fade.gain.linearRampToValueAtTime(0, now + fade);
      old.stopped = true; clearInterval(old.timer);
      setTimeout(() => { old.seq.dispose(); }, (fade + 1.5) * 1000);
    }
    this.name = name; this.cur = null;
    if (name === 'none' || !SONGS[name]) return;
    const seq = new Sequencer(ctx, this.out, this.rev, name);
    const fadeNode = seq.bus;
    fadeNode.gain.setValueAtTime(0, now); fadeNode.gain.linearRampToValueAtTime(1, now + fade);
    const tr = { seq, fade: fadeNode, next: now + 0.1, step: 0, timer: 0, stopped: false };
    this.cur = tr;
    const LOOK = 1.4;
    const pump = () => {
      if (tr.stopped) return;
      const t = ctx.currentTime;
      if (tr.next < t) tr.next = t + 0.05; // nach Pause neu aufsetzen
      while (tr.next < t + LOOK) { seq.scheduleStep(tr.step, tr.next); tr.next += seq.song.step; tr.step++; }
    };
    pump(); tr.timer = setInterval(pump, 120);
  }
  dispose() { this.play('none', 0.3); }
}

/** Offline-Rendering einer Sequenz (für Selbsttests). */
export function renderMusic(ctx, out, rev, name, seconds) {
  const seq = new Sequencer(ctx, out, rev, name); let t = 0.05, i = 0;
  while (t < seconds) { seq.scheduleStep(i, t); t += seq.song.step; i++; }
  return seq;
}
