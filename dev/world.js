// Testseite für das World-Modul. URL: ?cam=menu|board|boardL|low|side|island  &mood=menu|battle|victory|defeat  &nodummy  &fps  &quality=low|medium|high
import * as THREE from 'three';
import { Engine } from '../src/core/Engine.js';
import { World } from '../src/world/World.js';
import { BOARD_CENTER, FLAGSHIP_POSITION, CELL, BOARD_SIZE } from '../src/config.js';

const params = new URLSearchParams(location.search);
const engine = new Engine(document.getElementById('app'));
const t0 = performance.now();
const world = new World(engine);
console.log('World erstellt in ' + (performance.now() - t0).toFixed(0) + ' ms');

const CAMS = {
  menu: { pos: [0, 40, 45], look: [0, 0, 0] },
  board: { pos: [12, 26, 26], look: [12, 0, 0] },
  boardL: { pos: [-12, 26, 26], look: [-12, 0, 0] },
  low: { pos: [0, 6, 46], look: [0, 9, -60] },
  side: { pos: [-70, 14, 30], look: [20, 4, -40] },
  island: { pos: [30, 14, -36], look: [62, 8, -74] },
  light: { pos: [-48, 12, -40], look: [-66, 8, -64] },
};
function setCam(name) {
  const c = CAMS[name] || CAMS.menu;
  engine.camera.position.set(...c.pos);
  engine.camera.lookAt(...c.look);
}
setCam(params.get('cam') || 'menu');
window.setCam = setCam;
window.world = world;
window.engine = engine;
if (params.get('mood')) world.setMood(params.get('mood'), true);

// Dummy-Schiffe/Bretter, um Freihalte-Bereiche und Beleuchtung (Standard-Material + Environment) zu beurteilen
if (!params.has('nodummy')) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.7, metalness: 0.05 });
  const sail = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9, side: THREE.DoubleSide });
  const dummies = [];
  for (const side of ['player', 'enemy']) {
    const p = FLAGSHIP_POSITION[side];
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 16), mat); hull.position.y = 0.6; g.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 14, 8), mat); mast.position.y = 9; g.add(mast);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(7, 9), sail); s.position.set(0, 10, 0.2); g.add(s);
    g.position.set(p.x, 0, p.z);
    engine.scene.add(g); dummies.push(g);
    const c = BOARD_CENTER[side];
    const board = new THREE.Mesh(new THREE.PlaneGeometry(CELL * BOARD_SIZE, CELL * BOARD_SIZE), new THREE.MeshBasicMaterial({ color: side === 'player' ? 0x3377ff : 0xff5533, transparent: true, opacity: 0.18 }));
    board.rotation.x = -Math.PI / 2; board.position.set(c.x, 0.3, c.z);
    engine.scene.add(board);
  }
  const small = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 6), mat);
  engine.scene.add(small);
  engine.onUpdate((dt, t) => { for (const g of dummies) g.position.y = world.getWaterHeight(g.position.x, g.position.z) + 0.3; small.position.set(-12, world.getWaterHeight(-12, 0) + 0.4, 0); });
}

engine.precompile();
engine.start();
window.__ready = true;
