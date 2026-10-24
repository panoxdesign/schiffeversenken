// Kleiner Geometrie-Baukasten: sammelt Vertices (pos, uv, color, aux) und Primitive.
// Alles läuft nur beim Aufbau (Allokationen erlaubt), nie pro Frame.
import * as THREE from 'three';

const _c = new THREE.Color();
/** Linearer RGB-Tripel aus sRGB-Hex (z. B. '#aa7733'). */
export function rgb(hex, k = 1) {
  _c.set(hex);
  return [Math.min(1, _c.r * k), Math.min(1, _c.g * k), Math.min(1, _c.b * k)];
}
export function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.col = [];
    this.aux = [];
    this.idx = [];
    this.n = 0;
    this.m = null; // optionale Transformationsmatrix
    this.auxDefault = [1, 0, 0];
    this._v = new THREE.Vector3();
  }

  vertex(x, y, z, u, v, c, a) {
    if (this.m) {
      this._v.set(x, y, z).applyMatrix4(this.m);
      x = this._v.x; y = this._v.y; z = this._v.z;
    }
    this.pos.push(x, y, z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    const ad = a || this.auxDefault;
    this.aux.push(ad[0], ad[1], ad[2]);
    return this.n++;
  }

  tri(a, b, c) { this.idx.push(a, b, c); }
  quadIdx(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  /** Gitter nu x nv Zellen; fn(i, j, out) füllt out = [x,y,z,u,v,r,g,b,a0,a1,a2]. */
  grid(nu, nv, fn) {
    const out = [0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0];
    const base = this.n;
    const tmpC = [0, 0, 0];
    const tmpA = [0, 0, 0];
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        out[8] = this.auxDefault[0]; out[9] = this.auxDefault[1]; out[10] = this.auxDefault[2];
        fn(i, j, out);
        tmpC[0] = out[5]; tmpC[1] = out[6]; tmpC[2] = out[7];
        tmpA[0] = out[8]; tmpA[1] = out[9]; tmpA[2] = out[10];
        this.vertex(out[0], out[1], out[2], out[3], out[4], tmpC, tmpA);
      }
    }
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = base + i * (nv + 1) + j;
        const b = base + (i + 1) * (nv + 1) + j;
        const c = base + (i + 1) * (nv + 1) + j + 1;
        const d = base + i * (nv + 1) + j + 1;
        this.idx.push(a, b, c, a, c, d);
      }
    }
  }

  /** Beliebiges Viereck (Punkte als [x,y,z]) mit planarem UV (u0..u1, v0..v1). */
  quad(p0, p1, p2, p3, color, uv = [0, 0, 1, 1]) {
    const a = this.vertex(p0[0], p0[1], p0[2], uv[0], uv[1], color);
    const b = this.vertex(p1[0], p1[1], p1[2], uv[2], uv[1], color);
    const c = this.vertex(p2[0], p2[1], p2[2], uv[2], uv[3], color);
    const d = this.vertex(p3[0], p3[1], p3[2], uv[0], uv[3], color);
    this.quadIdx(a, b, c, d);
  }

  box(cx, cy, cz, sx, sy, sz, color, uvScale = 1) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const s = uvScale;
    const P = (x, y, z) => [cx + x, cy + y, cz + z];
    // +x, -x, +y, -y, +z, -z
    this.quad(P(hx, -hy, -hz), P(hx, -hy, hz), P(hx, hy, hz), P(hx, hy, -hz), color, [0, 0, sz * s, sy * s]);
    this.quad(P(-hx, -hy, hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(-hx, hy, hz), color, [0, 0, sz * s, sy * s]);
    this.quad(P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz), color, [0, 0, sx * s, sz * s]);
    this.quad(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, -hy, -hz), P(-hx, -hy, -hz), color, [0, 0, sx * s, sz * s]);
    this.quad(P(hx, -hy, hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(hx, hy, hz), color, [0, 0, sx * s, sy * s]);
    this.quad(P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz), color, [0, 0, sx * s, sy * s]);
  }

  /** Konisches Rohr von p0 nach p1. */
  cyl(x0, y0, z0, x1, y1, z1, r0, r1, seg, color, caps = true, color1 = null) {
    const axis = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
    const len = axis.length();
    axis.normalize();
    const up = Math.abs(axis.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t1 = new THREE.Vector3().crossVectors(axis, up).normalize();
    const t2 = new THREE.Vector3().crossVectors(axis, t1).normalize();
    const c1 = color1 || color;
    this.grid(1, seg, (i, j, o) => {
      const a = (j / seg) * Math.PI * 2;
      const r = i === 0 ? r0 : r1;
      const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      const bx = i === 0 ? x0 : x1, by = i === 0 ? y0 : y1, bz = i === 0 ? z0 : z1;
      o[0] = bx + t1.x * ca + t2.x * sa;
      o[1] = by + t1.y * ca + t2.y * sa;
      o[2] = bz + t1.z * ca + t2.z * sa;
      o[3] = (j / seg) * 0.5;
      o[4] = i * len * 0.5;
      const cc = i === 0 ? color : c1;
      o[5] = cc[0]; o[6] = cc[1]; o[7] = cc[2];
    });
    if (caps) {
      for (let e = 0; e < 2; e++) {
        const r = e === 0 ? r0 : r1;
        if (r <= 0) continue;
        const bx = e === 0 ? x0 : x1, by = e === 0 ? y0 : y1, bz = e === 0 ? z0 : z1;
        const cc = e === 0 ? color : c1;
        const centre = this.vertex(bx, by, bz, 0.25, 0.25, cc);
        const ring = [];
        for (let j = 0; j < seg; j++) {
          const a = (j / seg) * Math.PI * 2;
          const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
          ring.push(this.vertex(bx + t1.x * ca + t2.x * sa, by + t1.y * ca + t2.y * sa, bz + t1.z * ca + t2.z * sa, 0.25 + Math.cos(a) * 0.2, 0.25 + Math.sin(a) * 0.2, cc));
        }
        for (let j = 0; j < seg; j++) this.tri(centre, ring[j], ring[(j + 1) % seg]);
      }
    }
  }

  /** Drehkörper um die Y-Achse. profile = [[r, y], ...]; colorFn(k) optional pro Profilpunkt. */
  lathe(cx, cy, cz, profile, seg, colorFn) {
    const n = profile.length - 1;
    this.grid(n, seg, (i, j, o) => {
      const a = (j / seg) * Math.PI * 2;
      const [r, y] = profile[i];
      o[0] = cx + Math.cos(a) * r;
      o[1] = cy + y;
      o[2] = cz + Math.sin(a) * r;
      o[3] = (j / seg) * 0.6;
      o[4] = y * 0.6;
      const c = colorFn(i);
      o[5] = c[0]; o[6] = c[1]; o[7] = c[2];
    });
  }

  sphere(cx, cy, cz, r, seg, color, sy = 1) {
    const prof = [];
    const rings = Math.max(3, Math.round(seg * 0.6));
    for (let i = 0; i <= rings; i++) {
      const a = (i / rings) * Math.PI;
      prof.push([Math.sin(a) * r, -Math.cos(a) * r * sy]);
    }
    this.lathe(cx, cy, cz, prof, seg, () => color);
  }

  toGeometry({ color = true, aux = null } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (aux) g.setAttribute(aux, new THREE.Float32BufferAttribute(this.aux, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeVertexNormals();
    return g;
  }
}
