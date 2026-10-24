// Ozean: Gerstner-Vertex-Displacement (waves.js), Fresnel, Himmelsreflexion, Sonnenglanz,
// Subsurface, Schaum, Detail-Normalen, Horizont-Nebel. Ein Draw-Call.
import * as THREE from 'three';
import { WAVES_GLSL } from './waves.js';
import { NOISE_GLSL, fbm2D } from '../core/noise.js';
import { SKY_GLSL } from './Sky.js';
import { bus } from '../core/EventBus.js';

const HALF_X = 50;
const HALF_Z = 30;

/** Tileable Detail-Textur: RG = Normal-Tilt (0.5 = flach), A = „Schaumspitzen“-Adern. */
function makeDetailTexture(renderer) {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const h = new Float32Array(S * S);
  const lace = new Float32Array(S * S);
  const cells = 6;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const u = (i / S) * cells;
      const v = (j / S) * cells;
      const f = fbm2D(u, v, 5, 3, cells, cells);
      const r = 1 - Math.abs(2 * fbm2D(u, v, 4, 9, cells, cells) - 1);
      h[j * S + i] = f * 0.65 + r * 0.35;
      lace[j * S + i] = Math.pow(r, 6);
    }
  }
  let maxT = 1e-6;
  const tx = new Float32Array(S * S);
  const ty = new Float32Array(S * S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const l = h[j * S + ((i + S - 1) % S)];
      const r = h[j * S + ((i + 1) % S)];
      const d = h[((j + S - 1) % S) * S + i];
      const u = h[((j + 1) % S) * S + i];
      const x = -(r - l);
      const y = -(u - d);
      tx[j * S + i] = x;
      ty[j * S + i] = y;
      maxT = Math.max(maxT, Math.abs(x), Math.abs(y));
    }
  }
  const norm = 0.5 / (maxT * 0.55);
  for (let k = 0; k < S * S; k++) {
    const x = Math.max(-1, Math.min(1, tx[k] * norm));
    const y = Math.max(-1, Math.min(1, ty[k] * norm));
    data[k * 4] = Math.round((x * 0.5 + 0.5) * 255);
    data[k * 4 + 1] = Math.round((y * 0.5 + 0.5) * 255);
    data[k * 4 + 2] = 255;
    data[k * 4 + 3] = Math.round(Math.min(1, lace[k]) * 255);
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Gitter: dichtes Rechteck [-50,50]x[-30,30] + geometrisch wachsende Rahmen bis zum Horizont.
 * Rahmen teilen sich die Randvertices des inneren Gitters (keine T-Kreuzungen/Nähte).
 */
export function buildOceanGeometry(segX) {
  const nx = segX;
  const nz = Math.max(8, Math.round(segX * 0.6));
  const innerCount = (nx + 1) * (nz + 1);
  // Perimeter-Indizes (gegen den Uhrzeigersinn von oben: -z Kante nach +x, dann +x Kante nach +z ...)
  const vi = (i, j) => j * (nx + 1) + i;
  const perim = [];
  for (let i = 0; i < nx; i++) perim.push(vi(i, 0));
  for (let j = 0; j < nz; j++) perim.push(vi(nx, j));
  for (let i = nx; i > 0; i--) perim.push(vi(i, nz));
  for (let j = nz; j > 0; j--) perim.push(vi(0, j));
  const P = perim.length;

  const K = 30;
  const scales = [1];
  let step = 0.012;
  let s = 1;
  for (let k = 0; k < K; k++) { s += step; scales.push(s); step *= 1.24; }

  // Perimeter-Dezimierung nach außen (Stride 1 → 2 → 4), sofern teilbar
  const strideOf = (k) => {
    let st = k > 18 ? 4 : k > 9 ? 2 : 1;
    while (st > 1 && P % st !== 0) st >>= 1;
    return st;
  };
  const ringStart = [0];
  const ringCount = [P];
  let total = innerCount;
  for (let k = 1; k <= K; k++) {
    ringStart[k] = total;
    ringCount[k] = P / strideOf(k);
    total += ringCount[k];
  }
  const pos = new Float32Array(total * 3);
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const o = vi(i, j) * 3;
      pos[o] = -HALF_X + (i / nx) * HALF_X * 2;
      pos[o + 2] = -HALF_Z + (j / nz) * HALF_Z * 2;
    }
  }
  for (let k = 1; k <= K; k++) {
    const st = P / ringCount[k];
    for (let m = 0; m < ringCount[k]; m++) {
      const src = perim[m * st] * 3;
      const o = (ringStart[k] + m) * 3;
      pos[o] = pos[src] * scales[k];
      pos[o + 2] = pos[src + 2] * scales[k];
    }
  }
  const idx = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = vi(i, j), b = vi(i + 1, j), c = vi(i, j + 1), d = vi(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  }
  const ringIndex = (k, m) => (k === 0 ? perim[m % P] : ringStart[k] + (m % ringCount[k]));
  for (let k = 1; k <= K; k++) {
    const n = ringCount[k];
    if (ringCount[k - 1] === n) {
      for (let m = 0; m < n; m++) {
        const a = ringIndex(k - 1, m), b = ringIndex(k - 1, m + 1);
        const c = ringIndex(k, m), d = ringIndex(k, m + 1);
        idx.push(a, b, d, a, d, c);
      }
    } else {
      // Übergang: 2 feine Segmente innen -> 1 grobes außen
      for (let m = 0; m < n; m++) {
        const a0 = ringIndex(k - 1, 2 * m), a1 = ringIndex(k - 1, 2 * m + 1), a2 = ringIndex(k - 1, 2 * m + 2);
        const c = ringIndex(k, m), d = ringIndex(k, m + 1);
        idx.push(a0, a1, c, a1, d, c, a1, a2, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(total > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4000);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-4000, -2, -4000), new THREE.Vector3(4000, 2, 4000));
  return g;
}

const VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec2 vRest;
#include <fog_pars_vertex>
${WAVES_GLSL}
void main() {
  vec3 p = position;
  vec3 n;
  vec3 d = gerstnerDisplace(p.xz, uTime, n);
  float fade = 1.0 - smoothstep(110.0, 320.0, length(p.xz));
  d *= fade;
  vec3 wp = p + d;
  vWorld = wp;
  vRest = p.xz;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSSS;
uniform sampler2D uDetail;
uniform vec4 uIslands[6];
varying vec3 vWorld;
varying vec2 vRest;
#include <fog_pars_fragment>
${WAVES_GLSL}
${NOISE_GLSL}
${SKY_GLSL}
void main() {
  vec3 P = vWorld;
  vec3 toCam = cameraPosition - P;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec3 L = uSunDir;

  // Detail-Normalen: zwei scrollende Ebenen, Mipmaps glätten in der Ferne
  float near = 1.0 - smoothstep(70.0, 420.0, dist);
  vec2 uv1 = P.xz * 0.072 + vec2(uTime * 0.012, uTime * 0.008);
  vec2 uv2 = (mat2(0.8, -0.6, 0.6, 0.8) * P.xz) * 0.19 + vec2(-uTime * 0.021, uTime * 0.014);
  vec4 t1 = texture2D(uDetail, uv1);
  vec4 t2 = texture2D(uDetail, uv2);
  vec2 tilt = ((t1.xy * 2.0 - 1.0) * 0.13 + (t2.xy * 2.0 - 1.0) * 0.09) * (0.35 + 0.65 * near);
  // Wellen-Normale pro Pixel (exakt, unabhängig von der Gitterdichte)
  vec3 wn0;
  vec3 wd = gerstnerDisplace(vRest, uTime, wn0);
  float wfade = 1.0 - smoothstep(110.0, 320.0, length(vRest));
  vec3 wn = normalize(mix(vec3(0.0, 1.0, 0.0), wn0, wfade));
  float vH = wd.y / 0.62 * wfade;
  float vCrest = smoothstep(0.45, 0.95, vH) * wfade;
  vec3 N = normalize(vec3(wn.x + tilt.x, wn.y, wn.z + tilt.y));

  float NdV = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.025 + 0.975 * pow(1.0 - NdV, 5.0);
  fres = clamp(fres + 0.05 * pow(1.0 - NdV, 2.0), 0.0, 0.92);

  vec3 R = reflect(-V, normalize(mix(vec3(0.0, 1.0, 0.0), N, 0.35)));
  R.y = max(R.y, 0.0);
  vec3 refl = skyBase(R);
  refl = mix(refl, uZenith * 1.3 + uMid * 0.25 + vec3(0.03), 0.4);

  // Flachwasser um Inseln
  float shore = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 isl = uIslands[i];
    float dd = length(P.xz - isl.xy);
    shore = max(shore, 1.0 - smoothstep(isl.z * 0.82, isl.z * 1.5, dd));
  }

  float h01 = clamp(vH * 0.5 + 0.5, 0.0, 1.0);
  vec3 body = mix(uDeep, uShallow, 0.2 + 0.55 * h01 * h01);
  body = mix(body, uShallow * vec3(1.0, 1.25, 1.1), shore * 0.85);
  float dif = max(dot(N, L), 0.0);
  body *= (uZenith * 0.7 + uMid * 0.35 + uSunCol * (0.4 + 0.6 * dif) * 0.45 + 0.22);

  body += uShallow * (uZenith * 1.1 + uMid * 0.5 + vec3(0.12)) * 0.75 * (0.4 + 0.6 * NdV);
  // Subsurface: Licht scheint durch Kämme Richtung Kamera
  float back = pow(clamp(dot(-V, L), 0.0, 1.0), 3.0);
  float sss = back * smoothstep(0.15, 0.95, h01) * (0.45 + 0.55 * (1.0 - NdV));
  vec3 col = body + uSSS * uSunCol * sss * 1.9 + uSSS * (uZenith + uMid * 0.4) * 0.22 * NdV;
  col = mix(col, refl, fres);

  // scharfer Sonnenglanz
  float RL = max(dot(R, L), 0.0);
  float spec = pow(RL, 1800.0) * 22.0 + pow(RL, 260.0) * 1.8 + pow(RL, 28.0) * 0.28;
  spec *= smoothstep(0.0, 0.12, L.y) * (0.45 + 0.55 * near);
  col += uSunCol * spec;

  // Schaum: Kämme + Spitzen-Adern + großräumiges Rauschen
  #ifdef OCEAN_LOW
    float fn = vnoise(P.xz * 0.33 + vec2(uTime * 0.04, -uTime * 0.02)) * 0.9 + 0.05;
  #else
    float fn = fbm(P.xz * 0.33 + vec2(uTime * 0.04, -uTime * 0.02));
  #endif
  float lace = t1.a * 0.55 + t2.a * 0.45;
  float cov = vCrest * (0.4 + fn * 0.8);
  float pat = lace * 0.8 + (t1.a + t2.a) * 0.15;
  float foam = smoothstep(0.35, 0.75, cov * 0.6 + pat * 0.7 - 0.1) * smoothstep(0.05, 0.3, vCrest) * (0.25 + 0.75 * near);
  foam += shore * 0.0;
  vec3 foamCol = vec3(0.85, 0.9, 0.9) * (uMid * 0.6 + uSunCol * (0.35 + 0.65 * dif) * 0.9 + 0.12);
  col = mix(col, foamCol, clamp(foam, 0.0, 1.0) * 0.6);

  // Nebel: Farbe = Himmel am Horizont in Blickrichtung (nahtloser Übergang)
  vec3 hd = normalize(vec3(-toCam.x, 0.0, -toCam.z) + vec3(1e-5));
  vec3 fogCol = skyBase(hd);
  float ff = smoothstep(fogNear, fogFar, vFogDepth);
  col = mix(col, fogCol, ff);

  col += (hash12(gl_FragCoord.xy) - 0.5) * (1.5 / 255.0);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Ocean {
  /**
   * @param {object} engine
   * @param {object} skyUniforms gemeinsame Himmels-Uniforms
   * @param {Array<{x,z,radius}>} islands für Flachwasser-Tönung (max 6)
   */
  constructor(engine, skyUniforms, islands = []) {
    this.engine = engine;
    this.detailTex = makeDetailTexture(engine.renderer);

    const isl = [];
    for (let i = 0; i < 6; i++) {
      const d = islands[i];
      isl.push(d ? new THREE.Vector4(d.x, d.z, d.radius, 0) : new THREE.Vector4(1e5, 1e5, 1, 0));
    }
    const uniforms = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), skyUniforms, {
      uDeep: { value: new THREE.Color(0x03222e) },
      uShallow: { value: new THREE.Color(0x138a86) },
      uSSS: { value: new THREE.Color(0x1fc6a0) },
      uDetail: { value: this.detailTex },
      uIslands: { value: isl },
    });
    this.uniforms = uniforms;
    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
    });
    this._setDefines(engine.quality);
    this._segments = engine.quality.oceanSegments;
    this.mesh = new THREE.Mesh(buildOceanGeometry(this._segments), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
    engine.scene.add(this.mesh);

    this._offQ = bus.on('quality', (q) => {
      this._setDefines(q);
      if (q.oceanSegments !== this._segments) {
        this._segments = q.oceanSegments;
        this.mesh.geometry.dispose();
        this.mesh.geometry = buildOceanGeometry(this._segments);
      }
    });
    this._offU = engine.onUpdate((dt, time) => { this.uniforms.uTime.value = time; }, 0);
  }

  _setDefines(q) {
    const low = q.detail === 0;
    if (low !== !!this.material.defines.OCEAN_LOW) {
      if (low) this.material.defines.OCEAN_LOW = 1; else delete this.material.defines.OCEAN_LOW;
      this.material.needsUpdate = true;
    }
  }

  dispose() {
    this._offQ && this._offQ();
    this._offU && this._offU();
    this.engine.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.detailTex.dispose();
  }
}
