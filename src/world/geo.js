// Kleine Geometrie-Helfer: alles nicht-indiziert, mit Vertex-Colors, damit mergeGeometries funktioniert.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Macht Geometrie merge-fähig: nicht-indiziert, nur position/normal/color(/aSway). */
export function finish(geo, color, sway = null) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  }
  const n = g.attributes.position.count;
  if (color && !g.attributes.color) {
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  if (sway !== null) {
    const a = new Float32Array(n).fill(sway);
    g.setAttribute('aSway', new THREE.BufferAttribute(a, 1));
  }
  return g;
}

/** Wendet Position/Rotation(Y,X,Z)/Skalierung an. */
export function xform(geo, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

/** Per-Vertex einfärben: fn(x,y,z,nx,ny,nz,outColor) */
export function paint(geo, fn) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  let col = geo.attributes.color;
  if (!col) {
    col = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geo.setAttribute('color', col);
  }
  const out = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    out.setRGB(1, 1, 1);
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i), out);
    col.setXYZ(i, out.r, out.g, out.b);
  }
  return geo;
}

/** Röhre entlang Punkten (Array von Vector3) mit Radien; indiziert + Normalen berechnet. */
export function tube(points, radii, sides, colorFn) {
  const n = points.length;
  const pos = [];
  const col = [];
  const idx = [];
  const T = new THREE.Vector3();
  const U = new THREE.Vector3();
  const W = new THREE.Vector3();
  const c = new THREE.Color();
  const axis = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(i - 1, 0)];
    const b = points[Math.min(i + 1, n - 1)];
    T.subVectors(b, a).normalize();
    U.crossVectors(T, axis).normalize();
    W.crossVectors(T, U).normalize();
    colorFn(i / (n - 1), c);
    for (let j = 0; j < sides; j++) {
      const ang = (j / sides) * Math.PI * 2;
      const cs = Math.cos(ang) * radii[i];
      const sn = Math.sin(ang) * radii[i];
      pos.push(points[i].x + U.x * cs + W.x * sn, points[i].y + U.y * cs + W.y * sn, points[i].z + U.z * cs + W.z * sn);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      const cc = (i + 1) * sides + j;
      const d = (i + 1) * sides + ((j + 1) % sides);
      idx.push(a, cc, b, b, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
