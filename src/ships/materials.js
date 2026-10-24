// Geteilte Materialien für alle Schiffe (ein Shader-Programm je Typ, Texturen werden wiederverwendet).
import * as THREE from 'three';
import { getWoodTextures, getSailTextures } from './textures.js';

/** Gemeinsame Zeit für Segel-/Flaggenshader (wird von der Factory einmal pro Frame gesetzt). */
export const shipTime = { value: 0 };

let cache = null;

export function getShipMaterials() {
  if (cache) return cache;
  const wood = getWoodTextures();
  const hull = new THREE.MeshStandardMaterial({
    map: wood.map,
    normalMap: wood.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const makeSail = (side) => {
    const tex = getSailTextures(side);
    const m = new THREE.MeshStandardMaterial({
      map: tex.map,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: tex.emissiveMap,
      roughness: 0.95,
      metalness: 0.0,
      side: THREE.DoubleSide,
      alphaTest: 0.5,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = shipTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aSail;
          uniform float uTime;
          varying float vDmg;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vDmg = aSail.y;
          if (aSail.z < 0.5) {
            float ph = uTime * 1.9 + position.y * 1.3 + position.z * 1.1 + position.x * 0.8;
            float gust = 0.5 + 0.5 * sin(uTime * 0.5 + position.x * 0.35 + position.z * 0.2);
            transformed += normalize(objectNormal) * aSail.x * (0.07 * sin(ph) + 0.04 * sin(ph * 2.3 + 1.7) + 0.06 * gust);
          } else if (aSail.z < 1.5) {
            float ph = uTime * 7.0 - position.x * 4.5 + position.y * 2.0;
            transformed.z += aSail.x * sin(ph);
            transformed.y += aSail.x * 0.25 * sin(ph * 1.3 + 1.0);
          }`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vDmg;
          float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float sNoise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y);
          }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          if (vDmg > 0.001) {
            float nn = sNoise(vMapUv * 26.0) * 0.6 + sNoise(vMapUv * 70.0) * 0.4;
            float e = vDmg * 0.44 - nn;
            if (e > 0.0) discard;
            diffuseColor.rgb *= 1.0 - 0.8 * smoothstep(-0.2, 0.0, e);
          }`);
    };
    m.customProgramCacheKey = () => 'shipSail';
    return m;
  };

  const line = new THREE.LineBasicMaterial({ color: 0x1c140d });
  cache = { hull, sail: { player: makeSail('player'), enemy: makeSail('enemy') }, line };
  return cache;
}
