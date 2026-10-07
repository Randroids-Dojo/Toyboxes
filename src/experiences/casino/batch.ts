// Merges static parts into one mesh per material, so a whole room costs a
// handful of draw calls. Parts on the vertex-coloured trim material carry
// their colour in the geometry.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

export class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  /** Adds a part at a position and rotation (Euler XYZ), optionally coloured for the trim material. */
  add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, color?: string | THREE.Color, scale?: THREE.Vector3): void {
    tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), scale ?? ONE);
    this.addMatrix(geo, mat, tmpM, color);
  }

  addMatrix(geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4, color?: string | THREE.Color): void {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if ((mat as THREE.MeshStandardMaterial).vertexColors) {
      const c = new THREE.Color(color ?? '#ffffff');
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = c.r;
        arr[i * 3 + 1] = c.g;
        arr[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    }
    g.clearGroups();
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
  }

  /** Hands back the transformed parts without merging them (and forgets them). */
  drain(): Map<THREE.Material, THREE.BufferGeometry[]> {
    const out = this.parts;
    this.parts = new Map();
    return out;
  }

  get empty(): boolean {
    return this.parts.size === 0;
  }

  /** Builds one mesh per material into `into`. */
  build(into: THREE.Object3D, opts: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = opts.cast ?? true;
      m.receiveShadow = opts.receive ?? true;
      into.add(m);
      out.push(m);
    }
    this.parts.clear();
    return out;
  }
}
