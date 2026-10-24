// Himmelskuppel (Shader) + PMREM-Umgebung. Gemeinsame Uniforms werden von Ocean/Vögeln mitbenutzt.
import * as THREE from 'three';
import { NOISE_GLSL } from '../core/noise.js';

/** Gemeinsame Uniform-Objekte (Referenzen werden von World per Mood animiert). */
export function createSkyUniforms(sunDir, sunCol) {
  return {
    uHorizon: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uZenith: { value: new THREE.Color() },
    uSea: { value: new THREE.Color() },
    uSunCol: { value: sunCol },
    uSunDir: { value: sunDir },
    uCloudDark: { value: 1 },
    uCloudCover: { value: 0.5 },
    uTime: { value: 0 },
  };
}

/** GLSL: Himmelsverlauf ohne Wolken/Sonnenscheibe – auch für Ozean-Reflexion und Horizont-Nebel. */
export const SKY_GLSL = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uMid;
uniform vec3 uZenith;
uniform vec3 uSunCol;
uniform vec3 uSunDir;

vec3 skyBase(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec2 sxz = normalize(uSunDir.xz + vec2(1e-5));
  vec2 dxz = normalize(d.xz + vec2(1e-5));
  float az = max(dot(sxz, dxz), 0.0);
  vec3 horizon = mix(uHorizon * 0.72, uHorizon * 1.18, pow(az, 3.0));
  vec3 col = mix(horizon, uMid, smoothstep(0.0, 0.32, h));
  col = mix(col, uZenith, smoothstep(0.1, 0.75, h));
  float sd = max(dot(normalize(d), uSunDir), 0.0);
  col += uSunCol * (pow(sd, 6.0) * 0.10 + pow(sd, 48.0) * 0.38);
  return col;
}
`;

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww; // immer auf der fernen Ebene, folgt der Kamera ohne Translation
}
`;

const FRAG = /* glsl */ `
varying vec3 vDir;
uniform float uTime;
uniform float uCloudDark;
uniform float uCloudCover;
uniform vec3 uSea;
${NOISE_GLSL}
${SKY_GLSL}
void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyBase(d);
  float sd = max(dot(d, uSunDir), 0.0);
  float occ = 0.0;
  #ifdef ENV
    col = mix(col, uSea, smoothstep(0.0, -0.3, d.y));
  #else
  if (d.y > 0.0) {
    float fade = smoothstep(0.012, 0.2, d.y);
    vec2 uv = d.xz / (d.y + 0.15);
    uv = vec2(uv.x * 0.6, uv.y * 0.9) * 1.7 + vec2(uTime * 0.006, uTime * 0.0022);
    float thr = 0.6 - uCloudCover * 0.22;
    #ifdef CLOUDS_HQ
      float c = fbm(uv);
      float c2 = fbm(uv + uSunDir.xz * 0.07);
      float dens = smoothstep(thr, thr + 0.2, c);
      float light = clamp(0.55 + (c - c2) * 5.0, 0.0, 1.0);
    #else
      float c = vnoise(uv) * 0.65 + vnoise(uv * 2.3) * 0.35;
      float dens = smoothstep(thr + 0.02, thr + 0.24, c);
      float light = 0.45 + 0.4 * pow(sd, 2.0);
    #endif
    vec3 litCol = uSunCol * 1.15 + uHorizon * 0.35 + vec3(0.12);
    vec3 shadeCol = (uMid * 0.45 + uZenith * 0.55) * 0.5;
    vec3 cc = mix(shadeCol, litCol, light) * uCloudDark;
    cc = mix(cc, uHorizon * 1.05, (1.0 - smoothstep(0.0, 0.3, d.y)) * 0.45);
    cc += uSunCol * pow(sd, 7.0) * 0.45 * dens;
    occ = dens * fade * 0.93;
    col = mix(col, cc, occ);
  }
  #endif
  float disc = smoothstep(0.99955, 0.99985, sd);
  #ifdef ENV
    col += uSunCol * disc * 5.0;
  #else
    col += uSunCol * disc * 12.0 * (1.0 - occ * 0.85) * step(0.0, d.y + 0.03);
  #endif
  col += (hash12(gl_FragCoord.xy) - 0.5) * (1.5 / 255.0);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Sky {
  constructor(engine, uniforms) {
    this.engine = engine;
    this.uniforms = uniforms;
    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this._applyQuality(engine.quality);
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 40, 20), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 999; // zuletzt: Early-Z spart Füllrate unter Wasser/Objekten
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
  }

  _applyQuality(q) {
    this.material.defines = { CLOUDS_HQ: q.clouds ? 1 : 0 };
    if (!q.clouds) delete this.material.defines.CLOUDS_HQ;
    this.material.needsUpdate = true;
  }

  setQuality(q) { this._applyQuality(q); }

  /** Einmalige PMREM-Umgebung aus dem aktuellen Himmel (ohne Wolken). */
  buildEnvironment(renderer) {
    const envScene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      defines: { ENV: 1 },
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat);
    mesh.frustumCulled = false;
    envScene.add(mesh);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(envScene, 0.03);
    pmrem.dispose();
    mesh.geometry.dispose();
    mat.dispose();
    return rt.texture;
  }
}
