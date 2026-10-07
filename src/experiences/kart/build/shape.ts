// Geometry helpers for the kart world. Everything static is built from
// coloured parts and merged: one shared vertex-colour material per finish,
// and a Batch that merges parts by material and by 48 m cell so a whole
// circuit draws in a few dozen calls and far cells are culled.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type Finish = 'plastic' | 'matte' | 'gloss' | 'glow';

const finishes = new Map<Finish, THREE.Material>();

/** The shared vertex-colour material for a finish. 'glow' is unlit (night stickers, lamps). */
export function finish(f: Finish): THREE.Material {
  let m = finishes.get(f);
  if (!m) {
    if (f === 'glow') m = new THREE.MeshBasicMaterial({ vertexColors: true });
    else m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: f === 'gloss' ? 0.28 : f === 'plastic' ? 0.52 : 0.85, metalness: 0 });
    m.userData.keep = true;
    finishes.set(f, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();

function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.keep = true;
    geoCache.set(key, g);
  }
  return g;
}

/** Rounded box, cached. Small radius and one segment keep the triangle count low. */
export function rbox(w: number, h: number, d: number, r = 0.08, seg = 1): THREE.BufferGeometry {
  const rr = Math.min(r, Math.min(w, h, d) / 2 - 0.001);
  return cachedGeo(`rb|${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${rr.toFixed(3)}|${seg}`, () => (rr <= 0.002 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, seg, rr)));
}

export function cyl(rt: number, rb: number, h: number, seg = 12): THREE.BufferGeometry {
  return cachedGeo(`cy|${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
}

export function ball(r: number, ws = 12, hs = 9): THREE.BufferGeometry {
  return cachedGeo(`sp|${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
}

export function cone(r: number, h: number, seg = 10): THREE.BufferGeometry {
  return cachedGeo(`co|${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
}

export function torus(r: number, tube: number, rs = 8, ts = 18, arc = Math.PI * 2): THREE.BufferGeometry {
  return cachedGeo(`to|${r}|${tube}|${rs}|${ts}|${arc}`, () => new THREE.TorusGeometry(r, tube, rs, ts, arc));
}

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

/** A matrix from position, rotation (radians: roll z, then pitch x, then yaw y) and scale. */
export function xform(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  tmpE.set(rx, ry, rz, 'YXZ');
  tmpQ.setFromEuler(tmpE);
  return new THREE.Matrix4().compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
}

/** Copies a geometry into a plain non-indexed one with position, normal, uv and colour. */
function bake(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  g.applyMatrix4(m);
  // A mirrored transform turns faces inside out; flip them back.
  if (m.determinant() < 0) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const u = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 3) {
      for (const a of [p, n, u]) {
        const s = a.itemSize;
        for (let k = 0; k < s; k++) {
          const t = a.array[(i + 1) * s + k];
          (a.array as Float32Array)[(i + 1) * s + k] = a.array[(i + 2) * s + k];
          (a.array as Float32Array)[(i + 2) * s + k] = t;
        }
      }
    }
  }
  tmpC.set(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = tmpC.r;
    col[i * 3 + 1] = tmpC.g;
    col[i * 3 + 2] = tmpC.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * A model built from coloured parts. `mesh()` merges it into one draw call;
 * a Batch can take it whole and place it in the world.
 */
export class Shape {
  readonly parts: { geo: THREE.BufferGeometry; m: THREE.Matrix4; color: THREE.ColorRepresentation }[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m: THREE.Matrix4 = new THREE.Matrix4()): this {
    this.parts.push({ geo, m, color });
    return this;
  }

  /** Shorthand: a part at a position with an optional rotation and scale. */
  at(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): this {
    return this.add(geo, color, xform(x, y, z, rx, ry, rz, sx, sy, sz));
  }

  /** Adds another shape transformed by `m`. */
  put(other: Shape, m: THREE.Matrix4): this {
    for (const p of other.parts) this.parts.push({ geo: p.geo, m: m.clone().multiply(p.m), color: p.color });
    return this;
  }

  geometry(): THREE.BufferGeometry {
    const baked = this.parts.map((p) => bake(p.geo, p.m, p.color));
    const g = mergeGeometries(baked) ?? new THREE.BufferGeometry();
    for (const b of baked) b.dispose();
    g.computeBoundingSphere();
    return g;
  }

  mesh(f: Finish = 'plastic', opts: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh {
    const m = new THREE.Mesh(this.geometry(), finish(f));
    m.castShadow = opts.cast ?? true;
    m.receiveShadow = opts.receive ?? true;
    return m;
  }
}

interface Bucket {
  mat: THREE.Material;
  cast: boolean;
  receive: boolean;
  geos: THREE.BufferGeometry[];
  tris: number;
}

/**
 * Collects static geometry and merges it per material and per cell of the
 * world, so draw calls stay low and cells off screen are culled.
 */
export class Batch {
  private buckets = new Map<string, Bucket>();
  private matIds = new Map<THREE.Material, number>();

  constructor(private cell = 48) {}

  private bucket(mat: THREE.Material, x: number, z: number, cast: boolean, receive: boolean): Bucket {
    let id = this.matIds.get(mat);
    if (id === undefined) {
      id = this.matIds.size;
      this.matIds.set(mat, id);
    }
    const key = `${id}|${Math.floor(x / this.cell)}|${Math.floor(z / this.cell)}|${cast ? 1 : 0}|${receive ? 1 : 0}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { mat, cast, receive, geos: [], tris: 0 };
      this.buckets.set(key, b);
    }
    return b;
  }

  /** A shape placed in the world with vertex colours. */
  shape(s: Shape, m: THREE.Matrix4, f: Finish = 'plastic', opts: { cast?: boolean; receive?: boolean } = {}): void {
    const pos = new THREE.Vector3().setFromMatrixPosition(m);
    const b = this.bucket(finish(f), pos.x, pos.z, opts.cast ?? true, opts.receive ?? true);
    for (const p of s.parts) {
      const g = bake(p.geo, m.clone().multiply(p.m), p.color);
      b.tris += g.getAttribute('position').count / 3;
      b.geos.push(g);
    }
  }

  /** One coloured part placed directly. */
  part(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m: THREE.Matrix4, f: Finish = 'plastic', opts: { cast?: boolean; receive?: boolean } = {}): void {
    const pos = new THREE.Vector3().setFromMatrixPosition(m);
    const g = bake(geo, m, color);
    const b = this.bucket(finish(f), pos.x, pos.z, opts.cast ?? true, opts.receive ?? true);
    b.tris += g.getAttribute('position').count / 3;
    b.geos.push(g);
  }

  /** Geometry already in world space with its own material (textured things). */
  raw(geo: THREE.BufferGeometry, mat: THREE.Material, opts: { cast?: boolean; receive?: boolean; at?: { x: number; z: number } } = {}): void {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    g.computeBoundingBox();
    const c = opts.at ?? { x: (g.boundingBox!.min.x + g.boundingBox!.max.x) / 2, z: (g.boundingBox!.min.z + g.boundingBox!.max.z) / 2 };
    const b = this.bucket(mat, c.x, c.z, opts.cast ?? false, opts.receive ?? true);
    b.tris += g.getAttribute('position').count / 3;
    b.geos.push(g);
  }

  /** Merges everything into meshes under `parent`. Returns them for tier switches and audits. */
  build(parent: THREE.Object3D): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const b of this.buckets.values()) {
      if (!b.geos.length) continue;
      const g = mergeGeometries(b.geos);
      for (const x of b.geos) x.dispose();
      if (!g) continue;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, b.mat);
      m.castShadow = b.cast;
      m.receiveShadow = b.receive;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.userData.batch = true;
      parent.add(m);
      out.push(m);
    }
    this.buckets.clear();
    return out;
  }
}
