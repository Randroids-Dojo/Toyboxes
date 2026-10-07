// The z-fight audit: finds horizontal faces that share a plane (within 3 mm)
// and overlap in plan by more than a square centimetre, the cause of
// flickering surfaces. Decals (polygon offset), additive glows and
// see-through layers are left out: they are drawn on purpose over others.
// The playtest asserts zero on every circuit and tier.

import * as THREE from 'three';

interface Tri {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  cx: number;
  cz: number;
  y: number;
  up: boolean;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  mesh: number;
}

const CELL = 2;
const DY = 0.003;
const MIN_AREA = 1e-4;

function skip(m: THREE.Mesh): boolean {
  if ((m as unknown as THREE.InstancedMesh).isInstancedMesh) return true;
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  return mats.every((mat) => (mat.polygonOffset && mat.polygonOffsetFactor < 0) || (mat.transparent && !mat.depthWrite) || mat.blending === THREE.AdditiveBlending || !m.visible);
}

/** Area of the overlap of two triangles in plan (clipping one by the other). */
function overlap(a: Tri, b: Tri): number {
  let poly: [number, number][] = [
    [a.ax, a.az],
    [a.bx, a.bz],
    [a.cx, a.cz],
  ];
  const clip: [number, number][] = [
    [b.ax, b.az],
    [b.bx, b.bz],
    [b.cx, b.cz],
  ];
  // Clip against b with b wound anticlockwise.
  const area2 = (clip[1][0] - clip[0][0]) * (clip[2][1] - clip[0][1]) - (clip[1][1] - clip[0][1]) * (clip[2][0] - clip[0][0]);
  if (area2 < 0) clip.reverse();
  for (let i = 0; i < 3 && poly.length; i++) {
    const [p, q] = [clip[i], clip[(i + 1) % 3]];
    const inside = (v: [number, number]) => (q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]) >= -1e-9;
    const out: [number, number][] = [];
    for (let k = 0; k < poly.length; k++) {
      const cur = poly[k];
      const prev = poly[(k + poly.length - 1) % poly.length];
      const ci = inside(cur);
      const pi = inside(prev);
      if (ci !== pi) {
        const dx = cur[0] - prev[0];
        const dz = cur[1] - prev[1];
        const den = (q[0] - p[0]) * dz - (q[1] - p[1]) * dx;
        if (Math.abs(den) > 1e-12) {
          const side = (q[0] - p[0]) * (prev[1] - p[1]) - (q[1] - p[1]) * (prev[0] - p[0]);
          const t = -side / den;
          out.push([prev[0] + dx * t, prev[1] + dz * t]);
        }
      }
      if (ci) out.push(cur);
    }
    poly = out;
  }
  let s = 0;
  for (let k = 0; k < poly.length; k++) {
    const [x1, z1] = poly[k];
    const [x2, z2] = poly[(k + 1) % poly.length];
    s += x1 * z2 - x2 * z1;
  }
  return Math.abs(s) / 2;
}

export function zAudit(root: THREE.Object3D, report?: (msg: string) => void): number {
  root.updateMatrixWorld(true);
  const tris: Tri[] = [];
  let meshId = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || skip(m)) return;
    const g = m.geometry as THREE.BufferGeometry;
    const pos = g.getAttribute('position');
    if (!pos) return;
    const idx = g.index;
    const n = idx ? idx.count : pos.count;
    const id = meshId++;
    for (let i = 0; i + 2 < n; i += 3) {
      const ia = idx ? idx.getX(i) : i;
      const ib = idx ? idx.getX(i + 1) : i + 1;
      const ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, ib).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, ic).applyMatrix4(m.matrixWorld);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      const nrm = ab.clone().cross(ac);
      const len = nrm.length();
      if (len < MIN_AREA * 2) continue;
      const ny = nrm.y / len;
      if (Math.abs(ny) < 0.995) continue;
      if (Math.abs(a.y - b.y) > DY || Math.abs(a.y - c.y) > DY) continue;
      tris.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, cx: c.x, cz: c.z, y: (a.y + b.y + c.y) / 3, up: ny > 0, minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x), minZ: Math.min(a.z, b.z, c.z), maxZ: Math.max(a.z, b.z, c.z), mesh: id });
    }
  });
  const grid = new Map<string, number[]>();
  tris.forEach((t, i) => {
    for (let x = Math.floor(t.minX / CELL); x <= Math.floor(t.maxX / CELL); x++)
      for (let z = Math.floor(t.minZ / CELL); z <= Math.floor(t.maxZ / CELL); z++) {
        const k = `${x}|${z}`;
        let l = grid.get(k);
        if (!l) grid.set(k, (l = []));
        l.push(i);
      }
  });
  const seen = new Set<string>();
  let count = 0;
  for (const list of grid.values()) {
    list.sort((i, j) => tris[i].y - tris[j].y);
    for (let i = 0; i < list.length; i++) {
      const A = tris[list[i]];
      for (let j = i + 1; j < list.length; j++) {
        const B = tris[list[j]];
        if (B.y - A.y > DY) break;
        if (A.up !== B.up) continue;
        if (A.maxX <= B.minX || B.maxX <= A.minX || A.maxZ <= B.minZ || B.maxZ <= A.minZ) continue;
        const key = list[i] < list[j] ? `${list[i]}|${list[j]}` : `${list[j]}|${list[i]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (overlap(A, B) > MIN_AREA) {
          count++;
          if (report && count <= 12) report(`overlap at ${A.ax.toFixed(2)},${A.y.toFixed(3)},${A.az.toFixed(2)} meshes ${A.mesh}/${B.mesh}`);
        }
      }
    }
  }
  return count;
}
