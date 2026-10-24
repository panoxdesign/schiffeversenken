// Testseite für Effects + CameraRig (Stub-Welt, Gitter).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Engine } from '../src/core/Engine.js';
import { Effects } from '../src/fx/Effects.js';
import { CameraRig } from '../src/fx/CameraRig.js';
import { BOARD_CENTER, FLAGSHIP_POSITION } from '../src/config.js';
import { getWaveHeight, WAVES_GLSL } from '../src/world/waves.js';

const q = new URLSearchParams(location.search);
if (q.has('nohud')) document.body.classList.add('nohud');

const engine = new Engine(document.getElementById('app'));
const scene = engine.scene;
scene.background = new THREE.Color(0xd9a37a);
scene.fog = new THREE.Fog(0xd9a37a, 80, 400);
scene.add(new THREE.HemisphereLight(0xffe2c0, 0x2a4a60, 1.2));
const sun = new THREE.DirectionalLight(0xffd3a0, 2.2);
sun.position.set(-30, 40, 20);
scene.add(sun);
const pm = new THREE.PMREMGenerator(engine.renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;

// Stub-Ozean
const ocean = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400, 200, 200).rotateX(-Math.PI / 2),
  new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `uniform float uTime; varying vec3 vN; varying vec3 vW; ${WAVES_GLSL}
      void main(){ vec3 n; vec3 d = gerstnerDisplace(position.xz, uTime, n); vec3 p = position + d; vN = n; vW = p; gl_Position = projectionMatrix*viewMatrix*vec4(p,1.); }`,
    fragmentShader: `varying vec3 vN; varying vec3 vW;
      void main(){ float l = dot(normalize(vN), normalize(vec3(-0.5,0.8,0.3)))*0.5+0.5; vec3 c = mix(vec3(0.02,0.12,0.18), vec3(0.12,0.38,0.42), l); gl_FragColor = vec4(c,1.); }`,
  }),
);
ocean.frustumCulled = false;
scene.add(ocean);
engine.onUpdate((dt, t) => { ocean.material.uniforms.uTime.value = t; }, 0);

// Brett-Gitter (20x20) mit Rand
for (const key of ['player', 'enemy']) {
  const c = BOARD_CENTER[key];
  const grid = new THREE.GridHelper(20, 10, key === 'player' ? 0x44ff88 : 0xff6644, 0xffffff);
  grid.position.set(c.x, 0.8, c.z);
  scene.add(grid);
  const m = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(23, 0.01, 23)), new THREE.LineBasicMaterial({ color: 0xffff00 }));
  m.position.set(c.x, 0.8, c.z);
  scene.add(m);
}
// Marker-Boxen für Flaggschiffe
for (const key of ['player', 'enemy']) {
  const p = FLAGSHIP_POSITION[key];
  const b = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 9), new THREE.MeshStandardMaterial({ color: key === 'player' ? 0x6a4a2a : 0x222222 }));
  b.position.set(p.x, 1.5, p.z);
  scene.add(b);
}

const world = { getWaterHeight: (x, z) => getWaveHeight(x, z, engine.time) };
const fx = new Effects(engine, world);
const rig = new CameraRig(engine);
rig._static.wide = { px: 0, py: 22, pz: 72, lx: 0, ly: 5, lz: 0 }; // nur Dev: Weitwinkel-Ansicht
rig._static.muz = { px: -22, py: 7, pz: 16, lx: -30, ly: 3, lz: 2 };
rig._static.flight = { px: -5, py: 16, pz: 55, lx: -5, ly: 6, lz: 0 };
rig._static.close = { px: 12, py: 9, pz: 20, lx: 12, ly: 1.5, lz: 0 };
rig._static.fwcam = { px: -12, py: 14, pz: 44, lx: -12, ly: 12, lz: 0 };
rig.setView('overview', 0);
if (!q.has('manual')) engine.start();
// Deterministischer Zeitschritt für Screenshots (?manual): window.stepSim(sekunden)
window.stepSim = (sec, dt = 1 / 30) => {
  const n = Math.max(1, Math.round(sec / dt));
  for (let i = 0; i < n; i++) {
    engine.delta = dt; engine.time += dt;
    for (const u of engine._updaters.slice()) u.fn(dt, engine.time);
  }
  engine.renderer.render(scene, engine.camera);
  return engine.renderer.info.render.calls;
};

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const fires = [];
const api = {
  engine, fx, rig,
  testCannon(side = 'player', cell = [5, 4]) {
    const from = side === 'player' ? v(-32, 3.2, 2) : v(32, 3.2, 2);
    const c = BOARD_CENTER[side === 'player' ? 'enemy' : 'player'];
    const to = v(c.x + (cell[0] - 4.5) * 2, 0, c.z + (cell[1] - 4.5) * 2);
    to.y = world.getWaterHeight(to.x, to.z);
    return fx.fireCannon(from, to);
  },
  async testShot(hit = true) {
    await api.testCannon('player');
    const c = BOARD_CENTER.enemy;
    const p = v(c.x + 1, 0.8, c.z + 1);
    if (hit) { fx.explosion(p, 1); fires.push(fx.startFire(v(p.x, 0.8, p.z), 1)); rig.shake(0.6); } else fx.splash(v(p.x, 0, p.z));
  },
  testSplash(x = BOARD_CENTER.enemy.x, z = 0) { fx.splash(v(x, 0, z)); },
  testExplosion(x = BOARD_CENTER.enemy.x, z = 0, s = 1) { fx.explosion(v(x, 0.8, z), s); rig.shake(0.7); },
  testFire(x = BOARD_CENTER.enemy.x, z = 0, n = 3) {
    for (let i = 0; i < n; i++) fires.push(fx.startFire(v(x + (i - (n - 1) / 2) * 2, 0.8, z), 1));
  },
  stopFires() { fires.splice(0).forEach((f) => f.stop()); },
  testSink(x = BOARD_CENTER.enemy.x, z = 0, len = 4, o = 'h') { fx.sinkEffect(v(x, 0, z), len, o); },
  testCelebrate() { fx.celebrate(BOARD_CENTER.player.clone()); },
  setView(n, d = 1.6) { return rig.setView(n, d); },
  shake(s = 1) { rig.shake(s); },
  clear() { fx.clearAll(); fires.length = 0; },
};
Object.assign(window, api);
window.__ready = true;

const hud = document.getElementById('hud');
for (const [label, fn] of [
  ['cannon', () => api.testCannon()], ['shot hit', () => api.testShot(true)], ['shot miss', () => api.testShot(false)],
  ['splash', () => api.testSplash()], ['explosion', () => api.testExplosion()], ['fire', () => api.testFire()],
  ['stopfire', () => api.stopFires()], ['sink', () => api.testSink()], ['celebrate', () => api.testCelebrate()],
  ['shake', () => api.shake(1)], ['clear', () => api.clear()],
  ...['menu', 'placement', 'player', 'enemy', 'overview', 'victory', 'defeat'].map((n) => [n, () => api.setView(n)]),
]) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = fn;
  hud.appendChild(b);
}
window.addEventListener('pointermove', (e) => rig.setPointerParallax((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1)));
