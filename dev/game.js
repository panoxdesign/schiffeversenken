// Testseite für GameController mit lokalen Mini-Stubs (unabhängig von den echten Modulen).
import * as THREE from 'three';
import { Engine } from '../src/core/Engine.js';
import { BOARD_CENTER, CELL, BOARD_SIZE, FLAGSHIP_POSITION, FLEET } from '../src/config.js';
import { GameController } from '../src/game/GameController.js';

const engine = new Engine(document.getElementById('app'));
const root = document.getElementById('ui-root');
engine.scene.background = new THREE.Color(0x1d4a6e);
engine.scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2));
const water = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), new THREE.MeshBasicMaterial({ color: 0x1f6f9a }));
water.rotation.x = -Math.PI / 2; water.position.y = -0.05; engine.scene.add(water);

const SP = +(new URLSearchParams(location.search).get('speed') || 1); // Tempo-Faktor (kleiner = schneller)
const log = [];
const world = { setMood: (m) => log.push('mood:' + m), getWaterHeight: (x, z) => Math.sin(x * 0.3 + engine.time) * 0.3 };

class BV {
  constructor(side) {
    this.side = side; this.center = BOARD_CENTER[side].clone();
    const g = new THREE.GridHelper(CELL * BOARD_SIZE, BOARD_SIZE, 0xffffff, 0x88aacc);
    g.position.copy(this.center).setY(0.02); engine.scene.add(g);
    this.hover = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.5 }));
    this.hover.rotation.x = -Math.PI / 2; this.hover.visible = false; engine.scene.add(this.hover);
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 }));
    this.ghost.visible = false; engine.scene.add(this.ghost);
    this.markers = []; this.hoverCalls = 0;
  }
  cellToWorld(c, r, t = new THREE.Vector3()) { return t.set(this.center.x + (c - 4.5) * CELL, 0, this.center.z + (r - 4.5) * CELL); }
  worldToCell(p) {
    const c = Math.floor((p.x - this.center.x) / CELL + 5), r = Math.floor((p.z - this.center.z) / CELL + 5);
    return c < 0 || r < 0 || c >= BOARD_SIZE || r >= BOARD_SIZE ? null : { col: c, row: r };
  }
  setHover(c, r, mode) {
    this.hoverCalls++;
    this.hover.visible = !!mode;
    if (mode) { this.cellToWorld(c, r, this.hover.position); this.hover.position.y = 0.05; this.hover.material.color.set(mode === 'aim' ? 0xffff00 : 0xff0000); }
  }
  showGhost(len, c, r, o, valid) {
    this.ghost.visible = true;
    const a = this.cellToWorld(c, r), b = this.cellToWorld(o === 'h' ? c + len - 1 : c, o === 'v' ? r + len - 1 : r);
    this.ghost.position.copy(a).add(b).multiplyScalar(0.5).setY(0.4);
    this.ghost.scale.set(o === 'h' ? len * CELL - 0.3 : 1.4, 1, o === 'v' ? len * CELL - 0.3 : 1.4);
    this.ghost.material.color.set(valid ? 0x00ff00 : 0xff0000);
  }
  hideGhost() { this.ghost.visible = false; }
  _mark(c, r, color, y = 0.1) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 12), new THREE.MeshBasicMaterial({ color }));
    this.cellToWorld(c, r, m.position); m.position.y = y; engine.scene.add(m); this.markers.push(m);
  }
  markMiss(c, r) { this._mark(c, r, 0xffffff); }
  markHit(c, r) { this._mark(c, r, 0xff3300, 0.2); }
  markBlocked(c, r) { this._mark(c, r, 0x445566, 0.03); }
  setActive() {} setLabelsVisible() {}
  clearMarkers() { for (const m of this.markers) engine.scene.remove(m); this.markers.length = 0; }
}
const boards = { player: new BV('player'), enemy: new BV('enemy') };

let shipCount = 0;
class Ship {
  constructor(length, side) {
    shipCount++; this.length = length; this.side = side; this.damaged = new Set();
    this.object3D = new THREE.Mesh(new THREE.BoxGeometry(length * CELL - 0.4, 1, 1.4), new THREE.MeshBasicMaterial({ color: side === 'player' ? 0xc89b5a : 0x222222 }));
    engine.scene.add(this.object3D); this.o = 'h';
  }
  place(board, c, r, o) {
    const a = board.cellToWorld(c, r), b = board.cellToWorld(o === 'h' ? c + this.length - 1 : c, o === 'v' ? r + this.length - 1 : r);
    this.object3D.position.copy(a).add(b).multiplyScalar(0.5).setY(0.5); this.object3D.rotation.y = o === 'h' ? 0 : Math.PI / 2;
    this.o = o; this.a = a; this.dir = new THREE.Vector3(o === 'h' ? CELL : 0, 0, o === 'v' ? CELL : 0);
  }
  setVisible(v) { this.object3D.visible = v; }
  damage(i) { this.damaged.add(i); this.object3D.material.color.offsetHSL(0, 0, -0.04); }
  getCellWorldPosition(i, t) { return t.copy(this.a).addScaledVector(this.dir, i).setY(1.5 + Math.sin(engine.time * 2) * 0.2); }
  sink() { return new Promise((res) => { const t0 = engine.time; const off = engine.onUpdate(() => { const k = (engine.time - t0) / (2 * SP); this.object3D.position.y = 0.5 - k * 2; if (k >= 1) { this.object3D.visible = false; off(); res(); } }); }); }
  reset() {} dispose() { shipCount--; engine.scene.remove(this.object3D); this.object3D.geometry.dispose(); }
}
const shipFactory = {
  createShip: (l, s) => new Ship(l, s),
  createFlagship(side) {
    const pos = FLAGSHIP_POSITION[side];
    const m = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 3), new THREE.MeshBasicMaterial({ color: side === 'player' ? 0xeeddaa : 0x111111 }));
    m.position.copy(pos).setY(2); engine.scene.add(m);
    return { getCannonPosition: (t, out) => out.copy(pos).setY(4), fireRecoil() { m.position.x += side === 'player' ? -0.5 : 0.5; setTimeout(() => m.position.copy(pos).setY(2), 150); } };
  },
};

let fireCount = 0, particles = [];
const fx = {
  fireCannon(from, to, { flightTime = 1 } = {}) {
    flightTime *= SP;
    return new Promise((res) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshBasicMaterial({ color: 0 }));
      engine.scene.add(ball); const t0 = engine.time;
      const off = engine.onUpdate(() => {
        const k = Math.min(1, (engine.time - t0) / flightTime);
        ball.position.lerpVectors(from, to, k); ball.position.y += Math.sin(k * Math.PI) * 8;
        if (k >= 1) { off(); engine.scene.remove(ball); res(); }
      });
    });
  },
  _puff(pos, color, life = 0.8) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.copy(pos); engine.scene.add(m); const t0 = engine.time;
    const off = engine.onUpdate(() => { const k = (engine.time - t0) / (life * SP); m.scale.setScalar(1 + k * 2); m.material.opacity = 1 - k; if (k >= 1) { off(); engine.scene.remove(m); } });
    particles.push(off);
  },
  splash(p) { this._puff(p, 0xaaddff); }, explosion(p) { this._puff(p, 0xff8800); },
  startFire(pos) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 6), new THREE.MeshBasicMaterial({ color: 0xff5500 }));
    m.position.copy(pos); engine.scene.add(m); fireCount++;
    return { setPosition: (v) => m.position.copy(v).setY(v.y + 0.8), stop() { engine.scene.remove(m); fireCount--; } };
  },
  sinkEffect(p) { this._puff(p, 0xffffff, 1.5); }, celebrate(p) { this._puff(p.clone().setY(8), 0xffdd00, 2); },
  clearAll() {},
};

const views = { menu: [0, 50, 70, 0, 0, 0], placement: [-12, 28, 24, -12, 0, 0], player: [-12, 28, 24, -12, 0, 0], enemy: [12, 28, 24, 12, 0, 0], overview: [0, 45, 50, 0, 0, 0], victory: [0, 30, 40, 0, 0, 0], defeat: [-12, 20, 30, -12, 0, 0] };
const cameraRig = {
  shakes: 0, parallax: 0,
  setView(name, dur = 1.6) {
    dur *= SP;
    const v = views[name] || views.overview; const cam = engine.camera;
    const p0 = cam.position.clone(), l0 = this._look ? this._look.clone() : new THREE.Vector3(), l1 = new THREE.Vector3(v[3], v[4], v[5]), p1 = new THREE.Vector3(v[0], v[1], v[2]);
    this._look = l0.clone(); const t0 = engine.time; this._tok = (this._tok || 0) + 1; const tok = this._tok;
    return new Promise((res) => {
      const off = engine.onUpdate(() => {
        const k = Math.min(1, (engine.time - t0) / Math.max(0.001, dur)); const e = k * k * (3 - 2 * k);
        if (tok !== this._tok) { off(); res(); return; }
        cam.position.lerpVectors(p0, p1, e); this._look.lerpVectors(l0, l1, e); cam.lookAt(this._look);
        if (k >= 1) { off(); res(); }
      }, 90);
    });
  },
  shake() { this.shakes++; }, setPointerParallax() { this.parallax++; },
};

const audio = { played: {}, play(n) { this.played[n] = (this.played[n] || 0) + 1; }, playMusic(n) { this.music = n; } };

const hud = document.createElement('div'); hud.style.cssText = 'position:absolute;left:8px;top:8px;background:#0008;padding:6px;white-space:pre'; root.appendChild(hud);
const ui = {
  onPauseRequested: null, calls: {}, last: {},
  _c(n, a) { this.calls[n] = (this.calls[n] || 0) + 1; this.last[n] = a; },
  showMainMenu(o) { this._c('showMainMenu'); this.menu = o; }, hideMainMenu() { this._c('hideMainMenu'); },
  showPlacement(o) { this._c('showPlacement'); this.placement = o; }, updatePlacement(s) { this._c('updatePlacement', s); }, hidePlacement() { this._c('hidePlacement'); },
  showHUD() {}, hideHUD() {}, setTurn(t) { this._c('setTurn', t); }, updateFleetStatus(s) { this._c('fleet', s); }, updateStats(s) { this._c('stats', s); },
  announce(t, k) { this._c('announce', t + ' [' + k + ']'); }, setCoordinate(l) { this._c('coord', l); },
  showGameOver(o) { this._c('gameover', o.won); this.gameOver = o; }, hideGameOver() {}, showPause(o) { this._c('pause'); this.pauseOpts = o; }, hidePause() { this._c('hidePause'); },
};
engine.onUpdate(() => {
  const l = ui.last;
  hud.textContent = `turn: ${JSON.stringify(l.setTurn)}  announce: ${l.announce}  coord: ${l.coord}\nstats: ${JSON.stringify(l.stats)}\nships:${shipCount} fires:${fireCount}`;
}, 99);

const controller = new GameController({ engine, world, boards, shipFactory, fx, cameraRig, audio, ui });
engine.start();
controller.start();
controller.debug.setTimeScale(SP);
window.__game = { engine, world, boards, shipFactory, fx, cameraRig, audio, ui, controller, stats: () => ({ shipCount, fireCount }) };
