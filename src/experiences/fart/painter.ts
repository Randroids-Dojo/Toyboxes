// Static architecture is merged per material, with the colour and a soft
// baked shading (darker near the ground) in vertex colours, and texture
// coordinates in metres so tiling materials line up across the village.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tc = new THREE.Color();
const tv = new THREE.Vector3();
const tn = new THREE.Vector3();
const nm = new THREE.Matrix3();

export interface PaintOpts {
  /** Ground level for the baked shading (default 0); null turns it off. */
  base?: number | null;
  /** Metres per texture tile. */
  tile?: number;
  /** Keep the geometry's own UVs (signs, faces) instead of world tiling. */
  ownUv?: boolean;
}

export class Painter {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, color: number, m: THREE.Matrix4, o: PaintOpts = {}): void {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const n = pos.count;
    const col = new Float32Array(n * 3);
    tc.setHex(color);
    const base = o.base === undefined ? 0 : o.base;
    for (let i = 0; i < n; i++) {
      tv.fromBufferAttribute(pos, i);
      let k = 1;
      if (base !== null) {
        const t = Math.max(0, Math.min(1, (tv.y - base) / 1.4));
        k = 0.74 + 0.26 * (t * t * (3 - 2 * t));
      }
      col[i * 3] = tc.r * k;
      col[i * 3 + 1] = tc.g * k;
      col[i * 3 + 2] = tc.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!o.ownUv) {
      // Box-projected UVs in metres, chosen per face by its normal.
      const tile = o.tile ?? 2;
      const uv = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        tv.fromBufferAttribute(pos, i);
        tn.fromBufferAttribute(nor, i);
        const ax = Math.abs(tn.x);
        const ay = Math.abs(tn.y);
        const az = Math.abs(tn.z);
        let u: number;
        let v: number;
        if (ay >= ax && ay >= az) {
          u = tv.x;
          v = tv.z;
        } else if (ax >= az) {
          u = tv.z * Math.sign(tn.x || 1);
          v = tv.y;
        } else {
          u = -tv.x * Math.sign(tn.z || 1);
          v = tv.y;
        }
        uv[i * 2] = u / tile;
        uv[i * 2 + 1] = v / tile;
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    } else if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
    void nm;
  }

  box(mat: THREE.Material, color: number, x: number, y: number, z: number, w: number, h: number, d: number, o: PaintOpts & { rx?: number; ry?: number; rz?: number } = {}): void {
    this.add(new THREE.BoxGeometry(w, h, d), mat, color, mtx(x, y + h / 2, z, o.rx ?? 0, o.ry ?? 0, o.rz ?? 0), o);
  }

  build(into: THREE.Object3D, opts: { cast?: boolean; receive?: boolean; name?: string } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.parts) {
      const geo = mergeGeometries(list, false)!;
      for (const g of list) g.dispose();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = opts.cast ?? true;
      m.receiveShadow = opts.receive ?? true;
      if (opts.name) m.name = opts.name;
      into.add(m);
      out.push(m);
    }
    this.parts.clear();
    return out;
  }
}

export function mtx(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
}
