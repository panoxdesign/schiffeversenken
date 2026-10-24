// Marker (Fehlschuss, Treffer, blockiert) als InstancedMesh + Wasserringe. Alles schwimmt mit den Wellen.
import * as THREE from 'three';
import { CELL, BOARD_SIZE } from '../config.js';
import { getWaveHeight, getWaveNormal, WAVES_GLSL } from '../world/waves.js';
import { MeshBuilder, rgb } from '../ships/MeshBuilder.js';

const CAP = BOARD_SIZE * BOARD_SIZE;
const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

class MarkerSet {
  constructor(board, geo, mat, opts) {
    this.board = board;
    this.opts = opts;
    this.mesh = new THREE.InstancedMesh(geo, mat, CAP);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    board.group.add(this.mesh);
    this.x = new Float32Array(CAP);
    this.z = new Float32Array(CAP);
    this.yaw = new Float32Array(CAP);
    this.birth = new Float32Array(CAP);
    this.keys = new Map();
    this.count = 0;
  }

  add(col, row, t) {
    const key = row * BOARD_SIZE + col;
    if (col < 0 || row < 0 || col >= BOARD_SIZE || row >= BOARD_SIZE) return;
    if (this.keys.has(key) || this.count >= CAP) return;
    const i = this.count++;
    this.keys.set(key, i);
    this.x[i] = this.board.center.x + (col - 4.5) * CELL;
    this.z[i] = this.board.center.z + (row - 4.5) * CELL;
    this.yaw[i] = ((col * 7 + row * 13) % 17) * 0.37;
    this.birth[i] = t;
    this.mesh.count = this.count;
  }

  clear() {
    this.count = 0;
    this.keys.clear();
    this.mesh.count = 0;
  }

  update(t) {
    const n = this.count;
    if (n === 0) return;
    const o = this.opts;
    for (let i = 0; i < n; i++) {
      const x = this.x[i], z = this.z[i];
      const age = t - this.birth[i];
      const h = getWaveHeight(x, z, t);
      getWaveNormal(x, z, t, _n);
      _q.setFromUnitVectors(_up, _n);
      _qy.setFromAxisAngle(_up, this.yaw[i] + o.spin * Math.sin(t * 0.5 + i));
      _q.multiply(_qy);
      let y = h + o.y + o.bob * Math.sin(t * 1.6 + i * 2.1);
      let sc = o.scale;
      if (age < 0.5) {
        const a = Math.max(0, age) / 0.5;
        if (o.drop) {
          const d = 1 - a;
          y += d * d * 1.6;
          if (a > 0.9) sc *= 1 + 0.15 * Math.sin((a - 0.9) * 10 * Math.PI);
        } else {
          const e = a - 1;
          sc *= 1 + 2.2 * e * e * e + 1.2 * e * e; // easeOutBack
        }
      }
      _p.set(x, y, z);
      _s.set(sc, sc, sc);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function buildMiss() {
  const B = new MeshBuilder();
  const white = rgb('#f4f4f0'), red = rgb('#d12a20'), dark = rgb('#4a3322'), wood = rgb('#b89a70');
  const prof = [];
  const rings = 8;
  for (let i = 0; i <= rings; i++) { const a = (i / rings) * Math.PI; prof.push([Math.sin(a) * 0.2, -Math.cos(a) * 0.19]); }
  B.lathe(0, 0.06, 0, prof, 10, (i) => (i === 3 || i === 4 ? red : white));
  B.cyl(0, 0.22, 0, 0, 0.68, 0, 0.02, 0.014, 5, dark, true);
  B.sphere(0, 0.7, 0, 0.045, 6, red);
  B.quad([0, 0.66, 0], [0.22, 0.6, 0], [0.22, 0.5, 0], [0, 0.5, 0], white);
  // Treibholz
  const m = new THREE.Matrix4().makeRotationY(0.6);
  B.m = m;
  B.box(0.36, 0.01, 0.12, 0.7, 0.05, 0.12, wood);
  B.box(0.28, 0.03, -0.05, 0.4, 0.04, 0.1, rgb('#8a6a48'));
  B.m = null;
  return B.toGeometry({ color: true });
}

function buildHit() {
  const B = new MeshBuilder();
  const char = rgb('#161210'), char2 = rgb('#241a14'), ember = rgb('#ff6a18'), red = rgb('#c4261a');
  const rot = (rx, ry, rz) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  B.auxDefault = [0.03, 0, 0];
  B.m = rot(0.0, 0.4, 0.12); B.box(0.0, 0.05, 0.0, 0.66, 0.07, 0.16, char);
  B.m = rot(0.1, -1.0, -0.1); B.box(0.05, 0.07, 0.05, 0.52, 0.06, 0.14, char2);
  B.m = rot(-0.12, 1.9, 0.2); B.box(-0.05, 0.1, -0.02, 0.46, 0.06, 0.12, char);
  B.auxDefault = [0.0, 0, 0];
  B.m = null;
  B.cyl(0.05, 0.05, -0.02, 0.25, 0.58, -0.1, 0.055, 0.035, 6, char2, true);
  B.cyl(-0.28, 0.0, 0.18, -0.28, 0.62, 0.18, 0.016, 0.014, 4, rgb('#3a2a1e'), true);
  B.quad([-0.28, 0.6, 0.18], [-0.02, 0.54, 0.18], [-0.02, 0.38, 0.18], [-0.28, 0.4, 0.18], red);
  // Glut
  B.auxDefault = [1.0, 0, 0];
  B.m = rot(0, 0.9, 0); B.box(0.06, 0.1, 0.02, 0.14, 0.04, 0.1, ember);
  B.m = rot(0, -0.4, 0); B.box(-0.14, 0.12, -0.04, 0.1, 0.04, 0.12, ember);
  B.m = rot(0, 0.2, 0); B.box(0.22, 0.1, 0.1, 0.08, 0.04, 0.08, ember);
  B.sphere(0.25, 0.6, -0.1, 0.05, 5, ember);
  B.m = null;
  return B.toGeometry({ color: true, aux: 'aAux' });
}

function buildBlocked() {
  const B = new MeshBuilder();
  B.cyl(0, 0, 0, 0, 0.03, 0, 0.34, 0.34, 14, rgb('#0a0e14'), true);
  const c = rgb('#252a34');
  B.m = new THREE.Matrix4().makeRotationY(Math.PI / 4); B.box(0, 0.045, 0, 0.62, 0.04, 0.08, c);
  B.m = new THREE.Matrix4().makeRotationY(-Math.PI / 4); B.box(0, 0.05, 0, 0.62, 0.04, 0.08, c);
  B.m = null;
  return B.toGeometry({ color: true });
}

function createRings(board) {
  const g = new THREE.RingGeometry(0.78, 1.0, 48, 1);
  g.rotateX(-Math.PI / 2);
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = g.index;
  ig.setAttribute('position', g.attributes.position);
  const CAPR = 48;
  const birth = new THREE.InstancedBufferAttribute(new Float32Array(CAPR).fill(-100), 1);
  const kind = new THREE.InstancedBufferAttribute(new Float32Array(CAPR), 1);
  ig.setAttribute('aBirth', birth);
  ig.setAttribute('aKind', kind);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: board.timeU },
    vertexShader: `${WAVES_GLSL}
      attribute float aBirth; attribute float aKind; uniform float uTime;
      varying float vA; varying float vR; varying float vK;
      void main() {
        float age = uTime - aBirth;
        vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float life = clamp(age / 1.8, 0.0, 1.0);
        float s = (0.25 + 1.55 * (1.0 - pow(1.0 - life, 2.2))) * ${(CELL * 0.62).toFixed(2)};
        vec3 wp = c + vec3(position.x * s, 0.0, position.z * s);
        vec3 n; vec3 d = gerstnerDisplace(wp.xz, uTime, n);
        wp += d + vec3(0.0, 0.1, 0.0);
        vA = (age < 0.0) ? 0.0 : (1.0 - life) * (1.0 - life) * smoothstep(0.0, 0.05, age);
        vR = length(position.xz);
        vK = aKind;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: `varying float vA; varying float vR; varying float vK;
      void main() {
        float a = vA * (1.0 - abs(vR - 0.89) / 0.115);
        if (a <= 0.003) discard;
        vec3 col = mix(vec3(0.92, 0.98, 1.0), vec3(1.0, 0.62, 0.28), vK);
        gl_FragColor = vec4(col, clamp(a * 0.9, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(ig, mat, CAPR);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.count = 0;
  mesh.visible = false;
  board.group.add(mesh);
  let next = 0, filled = 0, lastSpawn = -100;
  const mtx = new THREE.Matrix4();
  return {
    spawn(col, row, t, k) {
      const x = board.center.x + (col - 4.5) * CELL, z = board.center.z + (row - 4.5) * CELL;
      for (let r = 0; r < 2; r++) {
        mtx.makeTranslation(x, 0, z);
        mesh.setMatrixAt(next, mtx);
        birth.setX(next, t + r * 0.22);
        kind.setX(next, k);
        next = (next + 1) % CAPR;
        filled = Math.min(CAPR, filled + 1);
      }
      mesh.count = filled;
      mesh.instanceMatrix.needsUpdate = true;
      birth.needsUpdate = true;
      kind.needsUpdate = true;
      lastSpawn = t;
      mesh.visible = true;
    },
    clear() {
      birth.array.fill(-100);
      birth.needsUpdate = true;
      mesh.visible = false;
    },
    update(t) { if (mesh.visible && t - lastSpawn > 2.4) mesh.visible = false; },
  };
}

export function createMarkerKits(board) {
  const timeU = board.timeU;
  const missMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide });
  const hitMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide });
  hitMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeU;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aAux; varying float vGlow; varying float vPh;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aAux.x; vPh = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; varying float vGlow; varying float vPh;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.34, 0.07) * vGlow * (0.9 + 0.5 * sin(uTime * 6.0 + vPh) + 0.25 * sin(uTime * 13.0 + vPh * 2.0));`);
  };
  hitMat.customProgramCacheKey = () => 'boardHit';
  const blockedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  return {
    miss: new MarkerSet(board, buildMiss(), missMat, { y: -0.04, bob: 0.025, scale: 1.25, drop: true, spin: 0.2 }),
    hit: new MarkerSet(board, buildHit(), hitMat, { y: -0.03, bob: 0.02, scale: 1.6, drop: false, spin: 0.1 }),
    blocked: new MarkerSet(board, buildBlocked(), blockedMat, { y: 0.01, bob: 0.0, scale: 0.9, drop: false, spin: 0 }),
    rings: createRings(board),
  };
}
