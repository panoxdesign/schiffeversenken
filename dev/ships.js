// Testseite für Modul B (Schiffe & Spielfeld). URL: /dev/ships.html?cam=close|board|all|flag&fps&quality=low
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Engine } from '../src/core/Engine.js';
import { BoardView } from '../src/board/BoardView.js';
import { ShipFactory } from '../src/ships/ShipFactory.js';
import { WAVES_GLSL } from '../src/world/waves.js';
import { FLEET } from '../src/config.js';

const params = new URLSearchParams(location.search);
const engine = new Engine(document.getElementById('app'));

// --- einfache Test-Welt (Himmelsfarbe, Licht, Wasser mit gleicher Wellenfunktion)
const scene = engine.scene;
scene.background = new THREE.Color(0x7aa0c0);
scene.fog = new THREE.Fog(0x7aa0c0, 80, 260);
const pmrem = new THREE.PMREMGenerator(engine.renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x405060, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe2b0, 2.6);
sun.position.set(-30, 40, 30);
scene.add(sun);

const timeU = { value: 0 };
const waterGeo = new THREE.PlaneGeometry(160, 100, 320, 200);
waterGeo.rotateX(-Math.PI / 2);
const water = new THREE.Mesh(waterGeo, new THREE.ShaderMaterial({
  uniforms: { uTime: timeU },
  vertexShader: `${WAVES_GLSL}
    uniform float uTime; varying vec3 vN; varying vec3 vW;
    void main() { vec3 n; vec3 d = gerstnerDisplace(position.xz, uTime, n); vN = n; vec3 p = position + d; vW = p;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
  fragmentShader: `varying vec3 vN; varying vec3 vW;
    void main() { vec3 L = normalize(vec3(-0.5, 0.7, 0.5)); float d = max(dot(normalize(vN), L), 0.0);
      vec3 V = normalize(cameraPosition - vW); float f = pow(1.0 - max(dot(V, normalize(vN)), 0.0), 3.0);
      vec3 col = mix(vec3(0.02, 0.18, 0.28), vec3(0.05, 0.38, 0.5), d * 0.7) + f * vec3(0.35, 0.5, 0.6);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
}));
scene.add(water);
engine.onUpdate((dt, t) => { timeU.value = t; }, 0);

const world = { getWaterHeight: () => 0 };
const boards = { player: new BoardView(engine, world, 'player'), enemy: new BoardView(engine, world, 'enemy') };
const factory = new ShipFactory(engine, world);

const ships = { player: [], enemy: [] };
const layout = [
  [0, 0, 'h'], [1, 2, 'h'], [0, 4, 'h'], [4, 4, 'h'], [8, 6, 'h'],
];
const layoutV = [
  [1, 0, 'v'], [3, 0, 'v'], [5, 0, 'v'], [7, 0, 'v'], [9, 0, 'v'],
];
FLEET.forEach((f, i) => {
  for (const side of ['player', 'enemy']) {
    const s = factory.createShip(f.length, side);
    const l = side === 'player' ? layout[i] : layoutV[i];
    s.place(boards[side], l[0], l[1] === 0 && side === 'player' ? 1 : l[1], l[2]);
    ships[side].push(s);
  }
});
// Spieler: Reihen so, dass nichts überlappt
const prow = [[0, 0], [0, 2], [0, 4], [5, 4], [3, 7]];
FLEET.forEach((f, i) => ships.player[i].place(boards.player, prow[i][0], prow[i][1], 'h'));
const flags = { player: factory.createFlagship('player'), enemy: factory.createFlagship('enemy') };
boards.player.setActive(true);
if (params.has('solo')) {
  const keep = ships[params.get('side') || 'player'][+(params.get('ship') || 0)];
  for (const side of ['player', 'enemy']) ships[side].forEach((s) => s.setVisible(s === keep));
  flags.player.setVisible(false); flags.enemy.setVisible(false);
}

// --- Kamera
const cam = engine.camera;
const camMode = params.get('cam') || 'board';
const look = new THREE.Vector3();
function setCam(mode) {
  const p = new THREE.Vector3();
  if (mode === 'close') {
    const s = ships[params.get('side') || 'player'][+(params.get('ship') || 0)];
    const c = s.getCellWorldPosition((s.length - 1) / 2, new THREE.Vector3());
    const d = +(params.get('d') || 9);
    const az = +(params.get('az') || 0.9);
    p.set(c.x + Math.sin(az) * d, c.y + d * 0.35, c.z + Math.cos(az) * d);
    look.set(c.x, c.y + 1.2, c.z);
  } else if (mode === 'at') {
    const x = +params.get('x'), z = +params.get('z');
    p.set(x + 1.5, 2.2, z + 3.2); look.set(x, 0.2, z);
  } else if (mode === 'mk') {
    p.set(12, 12, 13); look.set(12, 0, 0);
  } else if (mode === 'all') {
    p.set(0, 38, 62); look.set(0, 0, 0);
  } else if (mode === 'flag') {
    const f = flags[params.get('side') || 'player'];
    const c = f.object3D.position;
    const az = +(params.get('az') || 1.0);
    p.set(c.x + Math.sin(az) * 24, 8, c.z + Math.cos(az) * 24); look.set(c.x, 3, c.z);
  } else {
    p.set(12, 26, 26); look.set(0, 0, 0);
  }
  cam.position.copy(p);
  cam.lookAt(look);
}
setCam(camMode);
engine.onUpdate(() => {}, 90);
const bar = document.getElementById('bar');
for (const m of ['close', 'board', 'all', 'flag']) {
  const b = document.createElement('button');
  b.textContent = m;
  b.onclick = () => { params.set('cam', m); setCam(m); };
  bar.appendChild(b);
}

// --- Testfunktionen
const cells = () => { const a = []; for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) a.push([c, r]); return a; };
window.testMarkers = () => {
  const b = boards.enemy;
  b.clearMarkers();
  [[2, 2], [5, 5], [7, 1], [1, 8], [9, 9], [4, 0], [6, 7], [3, 4]].forEach(([c, r]) => b.markMiss(c, r));
  [[0, 3], [1, 3], [2, 3], [8, 4], [8, 5]].forEach(([c, r]) => b.markHit(c, r));
  [[5, 3], [5, 4], [6, 3], [6, 4]].forEach(([c, r]) => b.markBlocked(c, r));
  b.setHover(7, 7, 'aim');
  const p = boards.player;
  p.clearMarkers();
  [[3, 3], [6, 6]].forEach(([c, r]) => p.markMiss(c, r));
  [[1, 1]].forEach(([c, r]) => p.markHit(c, r));
  p.showGhost(3, 2, 6, 'h', true);
  p.setHover(8, 2, 'invalid');
  void cells;
};
window.testGhost = (valid = true) => { boards.player.showGhost(4, 4, 8, 'h', valid); };
window.testDamage = () => {
  for (const side of ['player', 'enemy']) ships[side].forEach((s) => { for (let i = 0; i < s.length; i += 2) s.damage(i); });
};
window.testSink = () => ships.player[0].sink().then(() => console.log('sunk done'));
window.testSinkAll = () => { for (const s of ships.enemy) s.sink(); };
window.testFire = () => { flags.player.fireRecoil(); flags.enemy.fireRecoil(); };
window.testReset = () => { for (const side of ['player', 'enemy']) ships[side].forEach((s) => s.reset()); };
window.setCam = (mode, extra) => { for (const k in extra || {}) params.set(k, extra[k]); setCam(mode); };
window.__t = { engine, boards, factory, ships, flags, cam };

engine.start();
if (params.has('markers')) window.testMarkers();
if (params.has('damage')) window.testDamage();
setTimeout(() => {
  const i = engine.renderer.info;
  let st = 0; for (const e of factory._cache.values()) st += (e.hull.index.count + e.sails.index.count) / 3;
  console.log('SHIPTRIS_UNIQUE', Math.round(st), [...factory._cache.entries()].map(([k, e]) => k + ':' + Math.round((e.hull.index.count + e.sails.index.count) / 3)).join(' '));
  console.log(`INFO calls=${i.render.calls} tris=${i.render.triangles} geos=${i.memory.geometries} tex=${i.memory.textures} quality=${engine.qualityName}`);
}, 2500);
setTimeout(() => {
  const mk = boards.enemy.markers;
  for (const k of ['miss', 'hit', 'blocked']) {
    const g = mk[k].mesh.geometry; g.computeBoundingBox();
    console.log('MK', k, mk[k].count, mk[k].mesh.count, JSON.stringify(g.boundingBox), g.attributes.position.count, g.index.count);
  }
}, 1500);
// Standbild der Untergangsanimation bei Fortschritt p (0..1); friert alle Schiffe ein
window.testSinkPose = (p, idx = 0) => {
  const s = ships.player[idx];
  s.sink();
  s.sinkT = p * 3;
  factory._ships.length = 0;
  s._apply(engine.time);
};
