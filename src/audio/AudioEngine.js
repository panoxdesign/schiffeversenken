// Prozedurale Audio-Engine (WebAudio-Synthese, keine Dateien). API: siehe ARCHITECTURE.md Modul D.
import { SOUND_FNS, SOUND_NAMES } from './sounds.js';
import { MusicPlayer } from './music.js';
import { Ambience } from './ambience.js';
import { makeImpulse, gainN } from './dsp.js';

const KEY = 'freibeuter.volumes.v1';
const DEFAULTS = { master: 0.8, music: 0.6, sfx: 0.9 };
const curve = (v) => v * v; // wahrnehmungsnäher
const MAX_VOICES = 24;
const PRIORITY = new Set(['cannon', 'explosion', 'sink', 'victory', 'defeat', 'bell']);

export class AudioEngine {
  constructor() {
    this.ctx = null; this.unlocked = false;
    this.vol = { ...DEFAULTS };
    try { Object.assign(this.vol, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignorieren */ }
    for (const k of Object.keys(DEFAULTS)) { const v = Number(this.vol[k]); this.vol[k] = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULTS[k]; }
    this._wantMusic = 'none'; this._wantAmbience = false;
    this.voices = 0; this._last = {};
    this.names = SOUND_NAMES;
  }

  /** Erzeugt/resumt den AudioContext (erst nach User-Geste). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return; }
    const ctx = this.ctx;
    // Bus-Struktur: sfx/music → masterIn → Kompressor(Limiter) → master → Ausgang; Hall parallel
    this.masterIn = gainN(ctx, 1);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 24; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.22;
    this.master = gainN(ctx, 1);
    this.masterIn.connect(this.comp); this.comp.connect(this.master); this.master.connect(ctx.destination);
    this.sfxBus = gainN(ctx, 1); this.musicBus = gainN(ctx, 1);
    this.sfxBus.connect(this.masterIn); this.musicBus.connect(this.masterIn);
    this.conv = ctx.createConvolver(); this.conv.buffer = makeImpulse(ctx, 2.6, 3.2);
    this.revOut = gainN(ctx, 0.7); this.conv.connect(this.revOut); this.revOut.connect(this.masterIn);
    this.sfxRev = gainN(ctx, 1); this.musicRev = gainN(ctx, 1);
    this.sfxRev.connect(this.conv); this.musicRev.connect(this.conv);
    this._applyVolumes(true);
    this.music = new MusicPlayer(ctx, this.musicBus, this.musicRev);
    this.ambience = new Ambience(ctx, this.sfxBus, this.sfxRev);
    this.unlocked = true;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (this._wantMusic !== 'none') this.music.play(this._wantMusic, 3);
    if (this._wantAmbience) this.ambience.start();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && ctx.state === 'suspended') ctx.resume().catch(() => {}); });
  }

  _applyVolumes(immediate) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, tc = immediate ? 0.001 : 0.05;
    const set = (n, v) => n.gain.setTargetAtTime(v, t, tc);
    set(this.master, curve(this.vol.master));
    set(this.sfxBus, curve(this.vol.sfx));
    set(this.musicBus, curve(this.vol.music) * 0.5);
    set(this.sfxRev, curve(this.vol.sfx));
    set(this.musicRev, curve(this.vol.music) * 0.5);
  }
  setVolume(channel, v) {
    if (!(channel in DEFAULTS)) return;
    v = Math.min(1, Math.max(0, Number(v) || 0)); this.vol[channel] = v;
    try { localStorage.setItem(KEY, JSON.stringify(this.vol)); } catch (e) { /* ignorieren */ }
    this._applyVolumes(false);
  }
  getVolume(channel) { return channel in this.vol ? this.vol[channel] : 1; }

  play(name, { x = 0, volume = 1, pitch = 1 } = {}) {
    if (!this.unlocked) return 0;
    const fn = SOUND_FNS[name], ctx = this.ctx;
    if (!fn || ctx.state !== 'running') return 0;
    const now = performance.now();
    if (name === 'hover' && now - (this._last.hover || 0) < 70) return 0;
    if (this.voices >= (PRIORITY.has(name) ? MAX_VOICES + 8 : MAX_VOICES)) return 0;
    this._last[name] = now;
    try {
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const dest = pan || this.sfxBus;
      if (pan) { pan.pan.value = Math.max(-1, Math.min(1, (x || 0) / 40)); pan.connect(this.sfxBus); }
      const jitter = name === 'victory' || name === 'defeat' || name === 'bell' ? 1 : 1 + (Math.random() - 0.5) * 0.06;
      const dur = fn(ctx, dest, this.sfxRev, ctx.currentTime + 0.005, volume, pitch * jitter);
      this.voices++;
      setTimeout(() => { this.voices = Math.max(0, this.voices - 1); try { pan && pan.disconnect(); } catch (e) { /* */ } }, (dur + 0.4) * 1000);
      return dur;
    } catch (e) { console.warn('[audio]', name, e); return 0; }
  }

  startAmbience() {
    this._wantAmbience = true;
    if (this.unlocked) this.ambience.start();
  }
  playMusic(name = 'none') {
    this._wantMusic = name;
    if (this.unlocked) this.music.play(name);
  }
}
