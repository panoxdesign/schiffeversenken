// Headless-Kontext für GameController-Tests: Szene, UI, Audio als Mocks (kein DOM/WebGL nötig).
import * as THREE from 'three';

globalThis.window = globalThis.window || Object.assign(new EventTarget(), { innerWidth: 1280, innerHeight: 720 });
const { BOARD_CENTER, CELL } = await import('../../src/config.js');
export const { GameController } = await import('../../src/game/GameController.js');

export const until = async (fn) => { for (let i = 0; i < 400 && !fn(); i++) await new Promise((r) => setTimeout(r, 5)); };

export function makeCtx() {
  const calls = {};
  const count = (n) => (calls[n] = (calls[n] || 0) + 1);
  const dom = Object.assign(new EventTarget(), { setPointerCapture() {}, releasePointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) });
  const updaters = [];
  const engine = {
    renderer: { domElement: dom }, camera: new THREE.PerspectiveCamera(45, 16 / 9, 0.5, 500), width: 1280, height: 720, time: 0,
    onUpdate(fn) { updaters.push(fn); return () => updaters.splice(updaters.indexOf(fn), 1); },
  };
  engine.camera.position.set(-12, 30, 26); engine.camera.lookAt(-12, 0, 0); engine.camera.updateMatrixWorld(true);
  const mkBoard = (side) => ({
    center: BOARD_CENTER[side].clone(), ghost: null, markers: { hit: 0, miss: 0, blocked: 0 },
    cellToWorld(c, r, t = new THREE.Vector3()) { return t.set(this.center.x + (c - 4.5) * CELL, 0, this.center.z + (r - 4.5) * CELL); },
    worldToCell(p) { const c = Math.floor((p.x - this.center.x) / CELL + 5), r = Math.floor((p.z - this.center.z) / CELL + 5); return c < 0 || r < 0 || c > 9 || r > 9 ? null : { col: c, row: r }; },
    setHover() { count('hover'); }, showGhost(...a) { this.ghost = a; }, hideGhost() { this.ghost = null; },
    markHit() { this.markers.hit++; }, markMiss() { this.markers.miss++; }, markBlocked() { this.markers.blocked++; },
    clearMarkers() { this.markers = { hit: 0, miss: 0, blocked: 0 }; }, setActive() {}, setLabelsVisible() {},
  });
  let alive = 0, fires = 0;
  const ctx = {
    engine, world: { setMood: (m) => (calls.mood = m), getWaterHeight: () => 0 },
    boards: { player: mkBoard('player'), enemy: mkBoard('enemy') },
    shipFactory: {
      createShip(length) { alive++; return { length, place() {}, setVisible(v) { this.v = v; }, damage() {}, getCellWorldPosition(i, t) { return t.set(i, 1, 0); }, sink: () => Promise.resolve(), reset() {}, dispose() { alive--; } }; },
      createFlagship: () => ({ getCannonPosition: (t, o) => o.set(30, 3, 0), fireRecoil() {} }),
    },
    fx: { fireCannon: () => Promise.resolve(), splash() {}, explosion() {}, startFire() { fires++; return { setPosition() {}, stop() { fires--; } }; }, sinkEffect() {}, celebrate() {}, clearAll() {} },
    cameraRig: { setView: () => Promise.resolve(), shake() {}, setPointerParallax() {} },
    audio: { play: (n) => count('snd:' + n), playMusic() {} },
    ui: new Proxy({ onPauseRequested: null }, { get: (t, k) => (k in t ? t[k] : (...a) => { count(String(k)); (t.last = t.last || {})[k] = a[0]; if (k === 'showGameOver') t.gameOver = a[0]; if (k === 'showMainMenu') t.menu = a[0]; if (k === 'announce') (t.announced = t.announced || []).push(a[0]); return undefined; }), set: (t, k, v) => { t[k] = v; return true; } }),
  };
  return { ctx, calls, counters: () => ({ alive, fires }), updaters };
}

