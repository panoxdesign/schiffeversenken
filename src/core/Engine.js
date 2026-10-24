// Renderer, Szene, Kamera, Hauptschleife und adaptive Auflösung.
import * as THREE from 'three';
import { QUALITY_PRESETS } from '../config.js';
import { bus } from './EventBus.js';

function detectQuality() {
  const params = new URLSearchParams(location.search);
  const forced = params.get('quality');
  if (forced && QUALITY_PRESETS[forced]) return forced;
  try {
    const saved = localStorage.getItem('freibeuter.quality');
    if (saved && QUALITY_PRESETS[saved]) return saved;
  } catch (_) { /* ignorieren */ }
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile) return cores >= 8 ? 'medium' : 'low';
  return cores >= 6 ? 'high' : 'medium';
}

export class Engine {
  /** @param {HTMLElement} container */
  constructor(container) {
    this.container = container;
    this.qualityName = detectQuality();
    /** Aktives Qualitäts-Preset (siehe config.js QUALITY_PRESETS). */
    this.quality = QUALITY_PRESETS[this.qualityName];

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.quality.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = false; // bewusst: keine Shadow-Maps (Performance)
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
    this.camera.position.set(0, 40, 60);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.camera); // erlaubt an die Kamera gehängte Objekte

    /** Gesamtzeit in Sekunden (pausiert nie, wird für Wellen genutzt). */
    this.time = 0;
    this.delta = 0;
    this._updaters = [];
    this._resizers = [];
    this._last = performance.now();
    this._running = false;

    // Adaptive Auflösung
    this._basePixelRatio = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio);
    this.pixelRatio = this._basePixelRatio;
    this._frameAccum = 0;
    this._frameCount = 0;
    this._goodSeconds = 0;

    this._fpsEl = null;
    if (new URLSearchParams(location.search).has('fps')) this._createFpsMeter();

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._onResize();

    this._tick = this._tick.bind(this);
  }

  /**
   * Registriert eine Update-Funktion fn(dt, time). Niedrigere priority läuft zuerst.
   * Gibt eine Funktion zum Abmelden zurück.
   */
  onUpdate(fn, priority = 0) {
    const entry = { fn, priority };
    this._updaters.push(entry);
    this._updaters.sort((a, b) => a.priority - b.priority);
    return () => {
      const i = this._updaters.indexOf(entry);
      if (i >= 0) this._updaters.splice(i, 1);
    };
  }

  /** fn(width, height, aspect) bei Größenänderung. Wird sofort einmal aufgerufen. */
  onResize(fn) {
    this._resizers.push(fn);
    fn(this.width, this.height, this.width / this.height);
    return () => {
      const i = this._resizers.indexOf(fn);
      if (i >= 0) this._resizers.splice(i, 1);
    };
  }

  /** Qualitätsstufe wechseln (Antialias greift erst nach Neuladen). */
  setQuality(name) {
    if (!QUALITY_PRESETS[name]) return;
    this.qualityName = name;
    this.quality = QUALITY_PRESETS[name];
    try { localStorage.setItem('freibeuter.quality', name); } catch (_) { /* ignorieren */ }
    this._basePixelRatio = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio);
    this._setPixelRatio(this._basePixelRatio);
    bus.emit('quality', this.quality);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    this.renderer.setAnimationLoop(this._tick);
  }

  /** Shader vorkompilieren, um Ruckler beim ersten Auftauchen zu vermeiden. */
  precompile() {
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch (e) {
      console.warn('precompile', e);
    }
  }

  _tick() {
    const now = performance.now();
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (dt > 0.1) dt = 0.1; // Tab-Wechsel etc.
    this.delta = dt;
    this.time += dt;

    for (let i = 0; i < this._updaters.length; i++) this._updaters[i].fn(dt, this.time);
    this.renderer.render(this.scene, this.camera);

    this._adapt(dt);
  }

  _adapt(dt) {
    this._frameAccum += dt;
    this._frameCount++;
    if (this._frameAccum < 1) return;
    const avg = this._frameAccum / this._frameCount;
    const fps = 1 / avg;
    if (this._fpsEl) {
      const info = this.renderer.info.render;
      this._fpsEl.textContent = `${fps.toFixed(0)} fps | dpr ${this.pixelRatio.toFixed(2)} | ${info.calls} calls | ${(info.triangles / 1000).toFixed(0)}k tris | ${this.qualityName}`;
    }
    this._frameAccum = 0;
    this._frameCount = 0;

    const min = Math.min(this.quality.minPixelRatio, this._basePixelRatio);
    if (fps < 52 && this.pixelRatio > min) {
      this._goodSeconds = 0;
      this._setPixelRatio(Math.max(min, this.pixelRatio - (fps < 40 ? 0.2 : 0.1)));
    } else if (fps > 58) {
      this._goodSeconds++;
      if (this._goodSeconds >= 4 && this.pixelRatio < this._basePixelRatio) {
        this._goodSeconds = 0;
        this._setPixelRatio(Math.min(this._basePixelRatio, this.pixelRatio + 0.1));
      }
    } else {
      this._goodSeconds = 0;
    }
  }

  _setPixelRatio(pr) {
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.width, this.height, false);
  }

  _onResize() {
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    for (const fn of this._resizers) fn(this.width, this.height, this.width / this.height);
  }

  _createFpsMeter() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:9999;font:12px monospace;color:#0f0;background:rgba(0,0,0,.6);padding:3px 6px;pointer-events:none;border-radius:3px';
    document.body.appendChild(el);
    this._fpsEl = el;
  }
}
