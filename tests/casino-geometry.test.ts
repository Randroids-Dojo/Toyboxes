// Builds the Golden Paddle's static geometry in Node (no renderer) and fails if
// triangles from different meshes are coplanar and overlap, which z-fights.

import * as THREE from 'three';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { installFakeCanvas } from './helpers/fake-canvas';

// Tolerances.
const COS_TOL = Math.cos((0.1 * Math.PI) / 180);
const PLANE_TOL = 0.001;
const AREA_TOL = 1e-4;
// Bucket sizes; lookups cover every bucket within tolerance.
const N_STEP = 0.01;
const D_STEP = 0.05;

interface Tri {
  /** Vertices, world space. */
  p: THREE.Vector3[];
  /** Facing normal (flipped for BackSide). */
  n: THREE.Vector3;
  d: number;
  mesh: number;
  double: boolean;
  /** Opaque and single sided, so it can hide things behind it. */
  solid: boolean;
  c: THREE.Vector3;
  lo: THREE.Vector3;
  hi: THREE.Vector3;
}

interface MeshInfo {
  label: string;
  /** The mesh object (and instance) this part belongs to. */
  obj: string;
  wall: number;
  part: 'full' | 'stub' | null;
}

let uninstall: () => void = () => undefined;
beforeAll(() => {
  uninstall = installFakeCanvas();
});
afterAll(() => uninstall());

/** Clips convex polygon `poly` by the half-plane left of edge a->b (CCW). */
function clip(poly: [number, number][], ax: number, ay: number, bx: number, by: number): [number, number][] {
  const out: [number, number][] = [];
  const side = (x: number, y: number) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  for (let i = 0; i < poly.length; i++) {
    const [px, py] = poly[i];
    const [qx, qy] = poly[(i + 1) % poly.length];
    const sp = side(px, py);
    const sq = side(qx, qy);
    if (sp >= 0) out.push([px, py]);
    if (sp >= 0 !== sq >= 0) {
      const t = sp / (sp - sq);
      out.push([px + (qx - px) * t, py + (qy - py) * t]);
    }
  }
  return out;
}

function area(poly: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

/** Separating axis test for two 2D triangles; true when they are apart. */
function separated(a: [number, number][], b: [number, number][]): boolean {
  for (const t of [a, b]) {
    for (let i = 0; i < 3; i++) {
      const [x0, y0] = t[i];
      const [x1, y1] = t[(i + 1) % 3];
      const ax = y0 - y1;
      const ay = x1 - x0;
      let amin = Infinity;
      let amax = -Infinity;
      let bmin = Infinity;
      let bmax = -Infinity;
      for (const [x, y] of a) {
        const v = x * ax + y * ay;
        amin = Math.min(amin, v);
        amax = Math.max(amax, v);
      }
      for (const [x, y] of b) {
        const v = x * ax + y * ay;
        bmin = Math.min(bmin, v);
        bmax = Math.max(bmax, v);
      }
      if (amax <= bmin + 1e-9 || bmax <= amin + 1e-9) return true;
    }
  }
  return false;
}

/** Area shared by two coplanar triangles and a point inside the shared part. */
function overlap(a: Tri, b: Tri): { area: number; at: THREE.Vector3 } {
  const n = a.n;
  const u = new THREE.Vector3();
  if (Math.abs(n.x) < 0.9) u.set(1, 0, 0);
  else u.set(0, 1, 0);
  u.cross(n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  const o = a.p[0];
  const to2 = (p: THREE.Vector3): [number, number] => {
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const dz = p.z - o.z;
    return [dx * u.x + dy * u.y + dz * u.z, dx * v.x + dy * v.y + dz * v.z];
  };
  let ta = a.p.map(to2);
  let tb = b.p.map(to2);
  const none = { area: 0, at: o };
  if (separated(ta, tb)) return none;
  if (area(ta) < 0) ta = [ta[0], ta[2], ta[1]];
  if (area(tb) < 0) tb = [tb[0], tb[2], tb[1]];
  let poly = ta;
  for (let i = 0; i < 3 && poly.length; i++) {
    const [ax, ay] = tb[i];
    const [bx, by] = tb[(i + 1) % 3];
    poly = clip(poly, ax, ay, bx, by);
  }
  if (poly.length < 3) return none;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of poly) {
    cx += x / poly.length;
    cy += y / poly.length;
  }
  return { area: Math.abs(area(poly)), at: o.clone().addScaledVector(u, cx).addScaledVector(v, cy) };
}

/** Generalised winding number of a point against triangles (about 1 inside a closed solid, 0 outside). */
function winding(p: THREE.Vector3, list: Tri[]): number {
  let sum = 0;
  for (const t of list) {
    const [a, b, c] = t.p;
    const ax = a.x - p.x, ay = a.y - p.y, az = a.z - p.z;
    const bx = b.x - p.x, by = b.y - p.y, bz = b.z - p.z;
    const cx = c.x - p.x, cy = c.y - p.y, cz = c.z - p.z;
    const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), lc = Math.hypot(cx, cy, cz);
    const num = ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    const den = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (ax * cx + ay * cy + az * cz) * lb + (bx * cx + by * cy + bz * cz) * la;
    sum += 2 * Math.atan2(num, den);
  }
  return sum / (4 * Math.PI);
}

/** Distance along a ray to a triangle, or Infinity (Moller-Trumbore). */
function rayTri(o: THREE.Vector3, dir: THREE.Vector3, t: Tri, max: number): number {
  const [p0, p1, p2] = t.p;
  const e1 = new THREE.Vector3().subVectors(p1, p0);
  const e2 = new THREE.Vector3().subVectors(p2, p0);
  const pv = new THREE.Vector3().crossVectors(dir, e2);
  const det = e1.dot(pv);
  if (Math.abs(det) < 1e-12) return Infinity;
  const sv = new THREE.Vector3().subVectors(o, p0);
  const u = sv.dot(pv) / det;
  if (u < 0 || u > 1) return Infinity;
  const qv = new THREE.Vector3().crossVectors(sv, e1);
  const v = dir.dot(qv) / det;
  if (v < 0 || u + v > 1) return Infinity;
  const d = e2.dot(qv) / det;
  return d > 1e-6 && d < max ? d : Infinity;
}

/** Diagnostic only: true when an opaque face within 2 cm in front, facing the same way, covers the point. */
function covered(p: THREE.Vector3, facing: THREE.Vector3, list: Tri[]): boolean {
  return list.some((t) => t.n.dot(facing) > 0.5 && rayTri(p, facing, t, 0.02) < Infinity);
}

/**
 * Diagnostic only: true when a point lies inside a closed solid of one of the
 * given meshes, below the deck, or on a downward face within 5 cm of the deck
 * (the camera never gets under it). Buried overlaps cannot flicker on screen.
 * Merged meshes may hold overlapping solids; the winding number still reads
 * 1 or more inside any of them.
 */
function buried(p: THREE.Vector3, facing: THREE.Vector3, groups: Tri[][]): boolean {
  if (p.y < -0.001) return true;
  if (facing.y < -0.5 && p.y < 0.05) return true;
  return groups.some((g) => winding(p, g) > 0.75);
}

it('the boat has no coplanar overlapping triangles across meshes', async () => {
  const t0 = performance.now();
  const { buildBoat } = await import('../src/experiences/casino/boat');
  const { makeMats } = await import('../src/experiences/casino/materials');
  const view = buildBoat(makeMats(), 0.5);
  view.group.updateMatrixWorld(true);

  // Which wall part each group is.
  const partOf = new Map<THREE.Object3D, { wall: number; part: 'full' | 'stub' }>();
  view.walls.forEach((w, i) => {
    partOf.set(w.full, { wall: i, part: 'full' });
    partOf.set(w.stub, { wall: i, part: 'stub' });
  });
  const whereOf = (o: THREE.Object3D): Omit<MeshInfo, 'label' | 'obj'> & { where: string } => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) {
      const wp = partOf.get(p);
      if (wp) return { ...wp, where: `wall-${view.walls[wp.wall].def.id}${wp.part === 'stub' ? '-stub' : ''}` };
      if (p.name) return { wall: -1, part: null, where: p.name };
    }
    return { wall: -1, part: null, where: '(unnamed)' };
  };
  const matName = (m: THREE.Material) => {
    const s = m as THREE.MeshStandardMaterial;
    const bits = [m.type];
    if (s.map) bits.push('map');
    if (s.vertexColors) bits.push('vertexColors');
    else if (s.color) bits.push(`#${s.color.getHexString()}`);
    if (m.side === THREE.BackSide) bits.push('BackSide');
    if (m.side === THREE.DoubleSide) bits.push('DoubleSide');
    return bits.join(' ');
  };

  const meshes: MeshInfo[] = [];
  const tris: Tri[] = [];
  let skipped = 0;
  let instanced = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const inst = new THREE.Matrix4();
  const world = new THREE.Matrix4();

  view.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position;
    if (!pos) return;
    const index = geo.index;
    const count = index ? index.count : pos.count;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = Array.isArray(mesh.material) && geo.groups.length ? geo.groups : [{ start: 0, count, materialIndex: 0 }];
    const where = whereOf(mesh);
    const im = (mesh as THREE.Mesh & { isInstancedMesh?: boolean }).isInstancedMesh ? (mesh as unknown as THREE.InstancedMesh) : null;
    const copies = im ? im.count : 1;
    if (im) instanced++;
    for (let k = 0; k < copies; k++) {
      if (im) {
        im.getMatrixAt(k, inst);
        world.multiplyMatrices(mesh.matrixWorld, inst);
      } else world.copy(mesh.matrixWorld);
      // Determinant below zero flips winding.
      const flip = world.determinant() < 0;
      for (const g of groups) {
        const mat = mats[g.materialIndex ?? 0];
        if (!mat) continue;
        const end = Math.min(count, g.start + g.count);
        if (mat.polygonOffset) {
          skipped += Math.floor((end - g.start) / 3);
          continue;
        }
        const meshId = meshes.length;
        meshes.push({ label: `${where.where} [${matName(mat)}]${im ? ` instance ${k}` : ''}`, obj: `${mesh.id}:${k}`, wall: where.wall, part: where.part });
        const side = mat.side;
        for (let i = g.start; i + 2 < end; i += 3) {
          const ia = index ? index.getX(i) : i;
          const ib = index ? index.getX(i + 1) : i + 1;
          const ic = index ? index.getX(i + 2) : i + 2;
          a.fromBufferAttribute(pos, ia).applyMatrix4(world);
          b.fromBufferAttribute(pos, ib).applyMatrix4(world);
          c.fromBufferAttribute(pos, ic).applyMatrix4(world);
          e1.subVectors(b, a);
          e2.subVectors(c, a);
          const n = new THREE.Vector3().crossVectors(e1, e2);
          const len = n.length();
          if (len < 1e-9) continue;
          n.divideScalar(len);
          if (flip) n.negate();
          if (side === THREE.BackSide) n.negate();
          const cen = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
          // Keep the vertex order counter-clockwise about the facing normal.
          const ccw = n.dot(new THREE.Vector3().crossVectors(e1, e2)) > 0;
          const lo = a.clone().min(b).min(c);
          const hi = a.clone().max(b).max(c);
          const solid = side !== THREE.DoubleSide && !mat.transparent;
          tris.push({ p: ccw ? [a.clone(), b.clone(), c.clone()] : [a.clone(), c.clone(), b.clone()], n, d: n.dot(cen), mesh: meshId, double: side === THREE.DoubleSide, solid, c: cen, lo, hi });
        }
      }
    }
  });
  // A wall's own full and stub never show together.
  const exclusive = (p: MeshInfo, q: MeshInfo) => p.wall >= 0 && p.wall === q.wall && p.part !== q.part;

  // Bucket by quantised normal and plane offset.
  const key = (x: number, y: number, z: number, d: number) => `${x},${y},${z},${d}`;
  const buckets = new Map<string, number[]>();
  const q = (v: number, s: number) => Math.round(v / s);
  tris.forEach((t, i) => {
    const k = key(q(t.n.x, N_STEP), q(t.n.y, N_STEP), q(t.n.z, N_STEP), q(t.d, D_STEP));
    const list = buckets.get(k);
    if (list) list.push(i);
    else buckets.set(k, [i]);
  });
  // Bucket indices along one axis that a value within tol could fall in.
  const near = (v: number, s: number, tol: number): number[] => {
    const out: number[] = [];
    for (let r = Math.round((v - tol) / s); r <= Math.round((v + tol) / s); r++) out.push(r);
    return out;
  };
  // A normal within 0.1 degrees differs by under 0.0018 per component.
  const nTol = 0.002;
  // That tilt moves the plane offset n.c by up to |c| times it, so widen the offset search.
  let reach = 0;
  for (const t of tris) for (const p of t.p) reach = Math.max(reach, p.length());
  const dTol = PLANE_TOL + reach * nTol;

  let candidates = 0;
  const hits: { i: number; j: number; area: number; at: THREE.Vector3 }[] = [];
  const check = (i: number, j: number, sign: 1 | -1) => {
    const ti = tris[i];
    const tj = tris[j];
    if (meshes[ti.mesh].obj === meshes[tj.mesh].obj) return;
    if (exclusive(meshes[ti.mesh], meshes[tj.mesh])) return;
    if (ti.n.dot(tj.n) * sign < COS_TOL) return;
    for (const p of tj.p) if (Math.abs(ti.n.dot(p) - ti.d) > PLANE_TOL) return;
    for (const p of ti.p) if (Math.abs(tj.n.dot(p) - tj.d) > PLANE_TOL) return;
    candidates++;
    const o = overlap(ti, tj);
    if (o.area > AREA_TOL) hits.push({ i, j, area: o.area, at: o.at });
  };
  const lookup = (n: THREE.Vector3, d: number, visit: (j: number) => void) => {
    for (const x of near(n.x, N_STEP, nTol))
      for (const y of near(n.y, N_STEP, nTol))
        for (const z of near(n.z, N_STEP, nTol))
          for (const dd of near(d, D_STEP, dTol)) {
            const list = buckets.get(key(x, y, z, dd));
            if (list) for (const j of list) visit(j);
          }
  };
  const flipped = new THREE.Vector3();
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];
    // Same facing: each pair once.
    lookup(t.n, t.d, (j) => {
      if (j > i) check(i, j, 1);
    });
    // Opposite facing only counts when one side is DoubleSide; visit from the DoubleSide one.
    if (t.double) {
      flipped.copy(t.n).negate();
      lookup(flipped, -t.d, (j) => {
        if (!tris[j].double || j > i) check(i, j, -1);
      });
    }
  }

  const ms = performance.now() - t0;
  console.log(`casino geometry: ${tris.length} triangles in ${meshes.length} mesh parts (${instanced} instanced), ${candidates} coplanar candidate pairs checked, ${skipped} polygon-offset decal triangles skipped, ${ms.toFixed(0)} ms`);

  const fmt = (v: THREE.Vector3) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
  // Diagnostic: is each overlap buried in solid geometry (hidden) or exposed?
  const visibleWith = (m: MeshInfo, p: MeshInfo, q: MeshInfo) => {
    if (m.part === 'stub') return (m.wall === p.wall && p.part === 'stub') || (m.wall === q.wall && q.part === 'stub');
    if (m.part === 'full') return !((m.wall === p.wall && p.part === 'stub') || (m.wall === q.wall && q.part === 'stub'));
    return true;
  };
  const byMesh = new Map<number, { tris: Tri[]; lo: THREE.Vector3; hi: THREE.Vector3 }>();
  for (const t of tris) {
    if (!t.solid) continue;
    const e = byMesh.get(t.mesh);
    if (e) {
      e.tris.push(t);
      e.lo.min(t.lo);
      e.hi.max(t.hi);
    } else byMesh.set(t.mesh, { tris: [t], lo: t.lo.clone(), hi: t.hi.clone() });
  }
  const probe = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const box3 = new THREE.Box3();
  const exposed = (h: (typeof hits)[number]) => {
    const ti = tris[h.i];
    const mi = meshes[ti.mesh];
    const mj = meshes[tris[h.j].mesh];
    const sides = ti.n.dot(tris[h.j].n) < 0 ? [1, -1] : [1];
    return sides.some((sd) => {
      probe.copy(h.at).addScaledVector(ti.n, 0.002 * sd);
      facing.copy(ti.n).multiplyScalar(sd);
      const groups: Tri[][] = [];
      for (const [id, e] of byMesh) if (visibleWith(meshes[id], mi, mj) && box3.set(e.lo, e.hi).expandByScalar(0.01).containsPoint(probe)) groups.push(e.tris);
      if (buried(probe, facing, groups)) return false;
      const near: Tri[] = [];
      for (const [id, e] of byMesh) if (visibleWith(meshes[id], mi, mj) && box3.set(e.lo, e.hi).expandByScalar(0.03).containsPoint(probe)) near.push(...e.tris);
      return !covered(probe, facing, near);
    });
  };
  // Group hits by mesh pair so the report is readable.
  const byPair = new Map<string, { count: number; shown: number; area: number; shownArea: number; sample: (typeof hits)[number] }>();
  for (const h of hits) {
    const mi = tris[h.i].mesh;
    const mj = tris[h.j].mesh;
    const k = mi < mj ? `${mi}|${mj}` : `${mj}|${mi}`;
    const open = exposed(h);
    const e = byPair.get(k) ?? { count: 0, shown: 0, area: 0, shownArea: 0, sample: h };
    if (open && !e.shown) e.sample = h;
    e.count++;
    e.area += h.area;
    if (open) {
      e.shown++;
      e.shownArea += h.area;
    }
    byPair.set(k, e);
  }
  const rows = [...byPair.values()].sort((p, q2) => q2.shownArea - p.shownArea || q2.area - p.area);
  const report = rows.slice(0, 10).map(({ count, shown, area: ar, shownArea, sample: { i, j, at } }) => {
    const ti = tris[i];
    const tj = tris[j];
    const state = shown ? `EXPOSED ${shown} of ${count} (${shownArea.toFixed(4)} m2)` : `buried ${count}`;
    return `${state}: ${meshes[ti.mesh].label} at ${fmt(ti.c)} vs ${meshes[tj.mesh].label} at ${fmt(tj.c)}, overlap near ${fmt(at)}, normal ${fmt(ti.n)}, ${ar.toFixed(4)} m2 in all`;
  });
  const shownPairs = rows.filter((r) => r.shown).length;
  view.dispose();
  if (report.length) console.log(`z-fighting: ${hits.length} triangle pairs in ${byPair.size} mesh pairs (${shownPairs} mesh pairs exposed; the rest are buried in solid geometry, below the deck or covered by a face just in front):\n${report.join('\n')}`);
  expect(report).toEqual([]);
});
