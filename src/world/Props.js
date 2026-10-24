// Treibende Fässer und Kisten (InstancedMesh, schaukeln mit den Wellen) + Möwen (Vertex-Shader-Flügel).
import * as THREE from 'three';
import { getWaveHeight, getWaveNormal } from './waves.js';
import { createRng } from '../core/noise.js';
import { finish, paint, xform } from './geo.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLOATERS } from './layout.js';
import { bus } from '../core/EventBus.js';

function barrelGeometry(detail) {
  const pts = [];
  const prof = [[0.0, -0.5], [0.34, -0.5], [0.4, -0.3], [0.45, 0], [0.4, 0.3], [0.34, 0.5], [0.0, 0.5]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, detail >= 1 ? 12 : 8);
  g.computeVertexNormals();
  const wood = new THREE.Color('#7a5230');
  const dark = new THREE.Color('#4a3019');
  const iron = new THREE.Color('#2e2c2a');
  const fg = finish(g);
  paint(fg, (x, y, z, nx, ny, nz, out) => {
    const ang = Math.atan2(z, x);
    const stave = 0.85 + 0.15 * Math.sin(ang * 12);
    out.copy(wood).lerp(dark, 0.15).multiplyScalar(stave);
    const hoop = Math.abs(y + 0.32) < 0.045 || Math.abs(y - 0.32) < 0.045 || Math.abs(y) < 0.04;
    if (hoop) out.copy(iron);
    if (Math.abs(y) > 0.495) out.copy(dark);
  });
  return fg;
}

function crateGeometry() {
  const g = new THREE.BoxGeometry(1, 0.8, 1);
  const fg = finish(g);
  const wood = new THREE.Color('#8a6038');
  const dark = new THREE.Color('#4d3520');
  paint(fg, (x, y, z, nx, ny, nz, out) => {
    out.copy(wood);
    const plank = Math.floor((y + 0.4) / 0.2);
    out.multiplyScalar(0.88 + 0.12 * ((plank * 37) % 3) / 2);
    const edge = Math.abs(Math.abs(x) - 0.5) < 0.07 && Math.abs(Math.abs(z) - 0.5) < 0.07;
    const frame = (Math.abs(y) > 0.33) || edge;
    if (frame) out.copy(dark).lerp(wood, 0.3);
  });
  return fg;
}

// ---------------- Möwen ----------------
const BIRD_VERT = /* glsl */ `
uniform float uTime;
attribute vec4 aOrbit; // cx, cz, radius, omega
attribute vec4 aMisc;  // phase, height, bob, scale
attribute float aTone;
varying float vTone;
varying float vShade;
#include <fog_pars_vertex>
void main() {
  float ph = aMisc.x;
  float ang = aOrbit.w * uTime + ph;
  float sgn = sign(aOrbit.w);
  vec3 c = vec3(aOrbit.x + cos(ang) * aOrbit.z, aMisc.y + sin(uTime * 0.6 + ph * 2.0) * aMisc.z, aOrbit.y + sin(ang) * aOrbit.z);
  vec3 F = normalize(vec3(-sin(ang) * sgn, 0.0, cos(ang) * sgn));
  vec3 Rr = vec3(-F.z, 0.0, F.x);
  vec3 lp = position * aMisc.w;
  float flap = sin(uTime * (7.0 + fract(ph) * 2.0) + ph * 5.0);
  float glide = smoothstep(0.6, 1.0, sin(uTime * 0.4 + ph * 3.0)); // gelegentlich gleiten
  float wing = abs(lp.z);
  lp.y += wing * (flap * 0.55 * (1.0 - glide * 0.85) + 0.12) * aMisc.w * step(0.001, wing);
  lp.y -= sgn * lp.z * 0.12; // Querlage in die Kurve
  vec3 wp = c + F * lp.x + Rr * lp.z + vec3(0.0, 1.0, 0.0) * lp.y;
  vTone = aTone;
  vShade = 0.75 + 0.25 * flap * sign(lp.z);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const BIRD_FRAG = /* glsl */ `
uniform vec3 uSunCol;
uniform vec3 uMid;
uniform vec3 uHorizon;
varying float vTone;
varying float vShade;
#include <fog_pars_fragment>
void main() {
  vec3 base = mix(vec3(0.16, 0.17, 0.19), vec3(0.92, 0.9, 0.86), vTone);
  vec3 lit = uSunCol * 0.65 + uHorizon * 0.3 + uMid * 0.25 + vec3(0.1);
  gl_FragColor = vec4(base * lit * vShade, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function birdGeometry() {
  // Vorwärts = +x, Spannweite entlang z. Körper + 2 Flügel (je 3 Segmente).
  const pos = [];
  const tone = [];
  const tri = (a, b, c, ta, tb, tc) => { pos.push(...a, ...b, ...c); tone.push(ta, tb, tc); };
  // Körper (flache Raute)
  const nose = [0.55, 0, 0], tail = [-0.5, 0.0, 0], l = [0.05, 0.03, 0.09], r = [0.05, 0.03, -0.09], top = [0.05, 0.12, 0];
  tri(nose, l, top, 1, 1, 1); tri(nose, top, r, 1, 1, 1);
  tri(l, tail, top, 1, 0.9, 1); tri(top, tail, r, 1, 0.9, 1);
  tri(nose, r, l, 0.9, 0.9, 0.9); tri(l, r, tail, 0.9, 0.9, 0.9);
  for (const sd of [1, -1]) {
    const sec = [
      { x0: 0.25, x1: -0.2, z: 0.08 },
      { x0: 0.18, x1: -0.28, z: 0.75 },
      { x0: 0.0, x1: -0.35, z: 1.5 },
      { x0: -0.35, x1: -0.55, z: 2.0 },
    ];
    for (let i = 0; i < sec.length - 1; i++) {
      const a = sec[i], b = sec[i + 1];
      const ta = i === sec.length - 2 ? 0.1 : 1, tb = i === sec.length - 2 ? 0.0 : 1;
      const A0 = [a.x0, 0.02, sd * a.z], A1 = [a.x1, 0.02, sd * a.z];
      const B0 = [b.x0, 0.02, sd * b.z], B1 = [b.x1, 0.02, sd * b.z];
      const t0 = i >= 1 ? (i === 2 ? 0.25 : 0.85) : 1;
      const t1 = i >= 1 ? (i === 2 ? 0.0 : 0.6) : 1;
      if (sd > 0) { tri(A0, A1, B1, t0, t0, t1); tri(A0, B1, B0, t0, t1, t1); tri(A0, B1, A1, t0, t1, t0); tri(A0, B0, B1, t0, t1, t1); }
      else { tri(A0, B1, A1, t0, t1, t0); tri(A0, B0, B1, t0, t1, t1); tri(A0, A1, B1, t0, t0, t1); tri(A0, B1, B0, t0, t1, t1); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aTone', new THREE.Float32BufferAttribute(tone, 1));
  return g;
}

export class Props {
  constructor(engine, skyUniforms) {
    this.engine = engine;
    this.scene = engine.scene;
    const detail = engine.quality.detail;
    this.group = new THREE.Group();

    // --- Fässer & Kisten ---
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const barrels = FLOATERS.filter((f) => f.type === 'barrel');
    const crates = FLOATERS.filter((f) => f.type === 'crate');
    this.sets = [];
    const mk = (geo, list, scale, lift) => {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      const rng = createRng(list.length * 31 + 5);
      const data = list.map((f) => ({
        x: f.x, z: f.z, yaw: rng() * 6.28, ph: rng() * 20, sc: scale * (0.85 + rng() * 0.4),
        tiltAxis: rng() * 6.28, drift: 0.8 + rng() * 1.4, spin: (rng() - 0.5) * 0.08,
      }));
      this.group.add(mesh);
      this.sets.push({ mesh, data, lift });
    };
    mk(barrelGeometry(detail), barrels, 1.15, -0.12);
    mk(crateGeometry(), crates, 1.0, 0.0);

    this._n = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._qy = new THREE.Quaternion();
    this._qt = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._up = new THREE.Vector3(0, 1, 0);

    // --- Möwen ---
    this.maxBirds = 12;
    const bg = birdGeometry();
    const inst = new THREE.InstancedBufferGeometry();
    inst.index = bg.index;
    inst.setAttribute('position', bg.attributes.position);
    inst.setAttribute('aTone', bg.attributes.aTone);
    const N = this.maxBirds;
    const orbit = new Float32Array(N * 4);
    const misc = new Float32Array(N * 4);
    const rng = createRng(77);
    // Kreisbahnen nur hinten (z<-30) und weit seitlich (|x|>41)
    const centers = [
      [-58, -10, 13], [60, -6, 12], [-14, -52, 16], [26, -58, 14], [-70, -34, 15], [72, -40, 14],
      [-52, 26, 10], [58, 30, 11], [8, -70, 18], [-36, -48, 12], [44, -52, 13], [0, -44, 10],
    ];
    for (let i = 0; i < N; i++) {
      const c = centers[i];
      orbit.set([c[0], c[1], c[2], (0.14 + rng() * 0.12) * (rng() < 0.5 ? -1 : 1)], i * 4);
      misc.set([rng() * 6.28, 14 + rng() * 16, 0.8 + rng() * 1.2, 0.85 + rng() * 0.5], i * 4);
    }
    inst.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(orbit, 4));
    inst.setAttribute('aMisc', new THREE.InstancedBufferAttribute(misc, 4));
    inst.instanceCount = Math.min(N, engine.quality.birds);
    this.birdGeo = inst;
    this.birdMat = new THREE.ShaderMaterial({
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
        uTime: skyUniforms.uTime,
        uSunCol: skyUniforms.uSunCol,
        uMid: skyUniforms.uMid,
        uHorizon: skyUniforms.uHorizon,
      }),
      vertexShader: BIRD_VERT,
      fragmentShader: BIRD_FRAG,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.birds = new THREE.Mesh(inst, this.birdMat);
    this.birds.frustumCulled = false;
    this.group.add(this.birds);

    this.scene.add(this.group);
    this._offQ = bus.on('quality', (q) => { this.birdGeo.instanceCount = Math.min(N, q.birds); });
    this._offU = engine.onUpdate((dt, t) => this.update(t), 0);
    this.update(0);
  }

  update(t) {
    const n = this._n, p = this._p, q = this._q, qy = this._qy, qt = this._qt, s = this._s, m = this._m;
    for (let k = 0; k < this.sets.length; k++) {
      const { mesh, data, lift } = this.sets[k];
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const x = d.x + Math.sin(t * 0.07 * d.drift + d.ph) * d.drift * 1.6;
        const z = d.z + Math.cos(t * 0.06 * d.drift + d.ph * 1.3) * d.drift * 1.4;
        const y = getWaveHeight(x, z, t);
        getWaveNormal(x, z, t, n);
        qt.setFromUnitVectors(this._up, n);
        qy.setFromAxisAngle(this._up, d.yaw + t * d.spin);
        q.copy(qt).multiply(qy);
        p.set(x, y + lift * d.sc + 0.02, z);
        s.set(d.sc, d.sc, d.sc);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
