// The Golden Paddle's hull, decks, walls, ceilings and fixed furniture.
// Walls come in two versions, full and a skirting stub, so the dollhouse
// cutaway can drop whichever wall stands between the camera and the player.
// Static parts are merged per material per wall or zone.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batch } from './batch';
import {
  BAY,
  colliderGap,
  wallBoxes,
  CLERESTORY,
  COLUMNS,
  LOGBOOK,
  LOUNGE,
  LOUNGE_TABLES,
  PENNY,
  SALOON,
  SODA,
  STAGE,
  STERN,
  T,
  WALLS,
  WHEELHOUSE,
  wallLength,
  wallNormal,
  type Opening,
  type WallDef,
  type ZoneId,
} from './layout';
import { C, coffers, hullPaint, loungeCarpet, planks, saloonCarpet, wallpaper, canvasTex, type Mats } from './materials';

export interface WallView {
  def: WallDef;
  /** An empty group in the wall's frame for things hung on it (plaques, boards); hidden with the wall. */
  full: THREE.Group;
  stub: THREE.Group;
  /** Inward normal and a point on the wall, for the cutaway test. */
  n: { x: number; z: number };
  cut: boolean;
}

/** How many walls the cut uniform can hold. */
const MAX_WALLS = 16;

/**
 * A copy of a material whose vertices collapse away when their wall is cut
 * (or, for the skirting stubs, when it is not). Every wall of a room shares
 * one mesh per material, so the cutaway costs no extra draw calls.
 */
function cutMaterial<M extends THREE.Material>(base: M, cut: { value: number[] }): M {
  const m = base.clone() as M;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCut = cut;
    // A full wall part shows while its wall stands; a skirting stub part (wallStub 1) only while it is cut.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float wallId;\nattribute float wallStub;\nuniform float uCut[${MAX_WALLS}];`)
      .replace('#include <project_vertex>', `#include <project_vertex>\nif ((uCut[int(wallId + 0.5)] > 0.5) != (wallStub > 0.5)) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);`);
  };
  m.customProgramCacheKey = () => 'wall';
  return m;
}

export interface ColumnView {
  x: number;
  z: number;
  /** 1 standing, 0 shrunk out of the way of the camera. */
  fade: number;
}

export interface BoatView {
  group: THREE.Group;
  zones: Record<ZoneId, THREE.Group>;
  walls: WallView[];
  /** Ceilings and the clerestory, each with userData.ceiling (its lowest height). */
  ceilings: THREE.Object3D[];
  /** Drops a wall to its skirting (or puts it back). */
  setCut(i: number, cut: boolean): void;
  columns: ColumnView[];
  /** All columns in one instanced mesh; `setColumn` shrinks one away. */
  setColumn(i: number, fade: number): void;
  /** Window glass, tinted by the time of day. */
  glass: THREE.MeshStandardMaterial;
  /** Materials whose canvas scale depends on the tier. */
  floorMats: THREE.MeshStandardMaterial[];
  dispose(): void;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Wall-local matrix: origin at b, x runs from b to a, z points into the room. */
function wallMatrix(w: WallDef): THREE.Matrix4 {
  const a = Math.atan2(w.b.z - w.a.z, w.b.x - w.a.x);
  return new THREE.Matrix4().makeRotationY(-(a + Math.PI)).setPosition(w.b.x, 0, w.b.z);
}

/** Openings in wall-local x (measured from b). */
function localOpenings(w: WallDef): Opening[] {
  const len = wallLength(w);
  return w.openings.map((o) => ({ ...o, from: len - o.to, to: len - o.from })).sort((p, q) => p.from - q.from);
}

function archTo(p: THREE.Path, o: Opening, grow = 0, reverse = false): void {
  const mid = (o.from + o.to) / 2;
  const r = (o.to - o.from) / 2 + grow;
  if (o.arch) {
    if (reverse) p.absarc(mid, o.top, r, 0, Math.PI, false);
    else p.absarc(mid, o.top, r, Math.PI, 0, true);
  } else if (reverse) {
    p.lineTo(mid + r, o.top + grow);
    p.lineTo(mid - r, o.top + grow);
  } else {
    p.lineTo(mid - r, o.top + grow);
    p.lineTo(mid + r, o.top + grow);
  }
}

/** The wall's face: doors notch the outline, windows are holes. */
function wallShape(len: number, h: number, ops: Opening[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  for (const o of ops.filter((o) => o.sill < 0.01)) {
    s.lineTo(o.from, 0);
    s.lineTo(o.from, o.top);
    archTo(s, o);
    s.lineTo(o.to, 0);
  }
  s.lineTo(len, 0);
  s.lineTo(len, h);
  s.lineTo(0, h);
  s.closePath();
  for (const o of ops.filter((o) => o.sill >= 0.01)) {
    const p = new THREE.Path();
    p.moveTo(o.from, o.sill);
    p.lineTo(o.to, o.sill);
    p.lineTo(o.to, o.top);
    archTo(p, o, 0, true);
    p.lineTo(o.from, o.sill);
    s.holes.push(p);
  }
  return s;
}

/** The opening itself, for glass, or grown outwards for its frame. */
function openingShape(o: Opening, grow = 0): THREE.Shape {
  const s = new THREE.Shape();
  const top = o.top + (o.arch ? 0 : grow);
  s.moveTo(o.from - grow, o.sill - grow);
  s.lineTo(o.to + grow, o.sill - grow);
  s.lineTo(o.to + grow, top);
  if (o.arch) s.absarc((o.from + o.to) / 2, o.top, (o.to - o.from) / 2 + grow, 0, Math.PI, false);
  else s.lineTo(o.from - grow, top);
  s.lineTo(o.from - grow, o.sill - grow);
  return s;
}

/** A frame around an opening: an arched ring for windows, an inverted U for doors. */
function frameShape(o: Opening, width: number): THREE.Shape {
  const s = new THREE.Shape();
  const mid = (o.from + o.to) / 2;
  const r = (o.to - o.from) / 2;
  if (o.sill >= 0.01) {
    const outer = openingShape(o, width);
    outer.holes.push(openingShape(o, 0));
    return outer;
  }
  s.moveTo(o.from - width, 0);
  s.lineTo(o.from - width, o.top);
  if (o.arch) s.absarc(mid, o.top, r + width, Math.PI, 0, true);
  else {
    s.lineTo(o.from - width, o.top + width);
    s.lineTo(o.to + width, o.top + width);
  }
  s.lineTo(o.to + width, 0);
  s.lineTo(o.to, 0);
  s.lineTo(o.to, o.top);
  if (o.arch) s.absarc(mid, o.top, r, 0, Math.PI, false);
  else s.lineTo(o.from, o.top);
  s.lineTo(o.from, 0);
  s.closePath();
  return s;
}

/**
 * Solid runs along a wall between its door openings. `inset` trims the two
 * ends, so trim on walls that meet at a corner never overlaps.
 */
function solidRuns(len: number, ops: Opening[], inset = 0): [number, number][] {
  const runs: [number, number][] = [];
  let at = inset;
  for (const o of ops.filter((o) => o.sill < 0.01)) {
    if (o.from > at + 0.05) runs.push([at, o.from]);
    at = o.to;
  }
  if (len - inset > at + 0.05) runs.push([at, len - inset]);
  return runs;
}

/** The wainscot, rails, baseboard and crown on one face of a wall (face +1 inside, -1 the far side of a partition). */
/**
 * How far a wall's trim must stop short of each end so it never runs into a
 * neighbouring wall's solid (walls that close a corner run on into it).
 */
function trimInsets(w: WallDef, face: 1 | -1): [number, number] {
  const len = wallLength(w);
  const dx = (w.b.x - w.a.x) / len;
  const dz = (w.b.z - w.a.z) / len;
  const n = wallNormal(w);
  const others = WALLS.filter((o) => o !== w).flatMap(wallBoxes);
  const at = (d: number) => {
    // A point on the trim, just inside the room, `d` along from a.
    const x = w.a.x + dx * d + n.x * face * (T / 2 + 0.05);
    const z = w.a.z + dz * d + n.z * face * (T / 2 + 0.05);
    return others.some((c) => colliderGap(c, x, z) < 0);
  };
  let s = 0.08;
  while (s < 1.2 && at(s)) s += 0.02;
  let e = 0.08;
  while (e < 1.2 && at(len - e)) e += 0.02;
  // An end that runs into a neighbour stops at the neighbour's trim (0.15 proud of its face), so the two never overlap.
  return [s > 0.09 ? s + 0.11 : 0.12, e > 0.09 ? e + 0.11 : 0.12];
}

function trimFace(b: Batch, m: Mats, w: WallDef, ops: Opening[], sc: (typeof SCHEME)[keyof typeof SCHEME], face: 1 | -1): void {
  const len = wallLength(w);
  const H = w.height;
  const z0 = (T / 2) * face;
  const f = face;
  // Wall-local x runs from b to a, so the insets swap ends.
  const [ia, ib] = trimInsets(w, face);
  const runs = solidRuns(len, ops).map(([s0, s1]) => [Math.max(s0, ib), Math.min(s1, len - ia)] as [number, number]).filter(([s0, s1]) => s1 - s0 > 0.1);
  for (const [s0, s1] of runs) {
    const rl = s1 - s0;
    const cx = (s0 + s1) / 2;
    b.add(box(rl, 1.1, 0.05), m.trim, cx, 0.552, z0 + 0.03 * f, 0, 0, 0, sc.wains);
    b.add(box(rl, 0.16, 0.08), m.trim, cx, 0.082, z0 + 0.045 * f, 0, 0, 0, '#2a120c');
    b.add(box(rl, 0.07, 0.09), m.trim, cx, 1.135, z0 + 0.05 * f, 0, 0, 0, sc.rail);
    const n = Math.max(1, Math.floor(rl / 0.85));
    const pw = rl / n;
    for (let i = 0; i < n; i++) b.add(box(pw - 0.2, 0.62, 0.02), m.trim, s0 + pw * (i + 0.5), 0.6, z0 + 0.065 * f, 0, 0, 0, sc.panel);
  }
  b.add(box(len - ia - ib, 0.18, 0.14), m.trim, ib + (len - ia - ib) / 2, H - 0.09, z0 + 0.07 * f, 0, 0, 0, sc.crown);
}

const SCHEME: Record<WallDef['scheme'], { paper: string; ink: string; wains: string; panel: string; crown: string; rail: string; frame: string; outside: string }> = {
  saloon: { paper: C.teal, ink: 'rgba(244,231,204,0.10)', wains: C.mahogany, panel: C.mahoganyLit, crown: C.mahogany, rail: C.brassMatte, frame: C.ivory, outside: C.hull },
  bay: { paper: '#3a1420', ink: 'rgba(255,207,122,0.10)', wains: '#4a1a14', panel: '#6a2a1d', crown: C.brassMatte, rail: C.brassMatte, frame: C.brassMatte, outside: '#7a1f2a' },
  lounge: { paper: C.moonWall, ink: 'rgba(159,183,232,0.12)', wains: '#1c1f45', panel: '#2b3070', crown: '#c8d2ea', rail: '#c8d2ea', frame: '#c8d2ea', outside: C.hull },
  wheelhouse: { paper: '#7a4a2a', ink: 'rgba(40,20,10,0.12)', wains: '#4a2a18', panel: '#6a3f22', crown: C.brassMatte, rail: C.brassMatte, frame: '#f4e7cc', outside: C.hull },
};

// ---------------------------------------------------------------------------

export function buildBoat(m: Mats, texScale: number): BoatView {
  const group = new THREE.Group();
  group.name = 'boat';
  const zones = { saloon: new THREE.Group(), stern: new THREE.Group(), lounge: new THREE.Group(), wheelhouse: new THREE.Group(), bay: new THREE.Group() } as Record<ZoneId, THREE.Group>;
  for (const [k, g] of Object.entries(zones)) {
    g.name = k;
    group.add(g);
  }
  const owned: { dispose(): void }[] = [];
  const own = <X extends { dispose(): void }>(x: X): X => {
    owned.push(x);
    return x;
  };

  // ---- materials
  const papers = {} as Record<WallDef['scheme'], THREE.MeshStandardMaterial>;
  for (const k of Object.keys(SCHEME) as WallDef['scheme'][]) {
    const t = own(wallpaper(texScale, SCHEME[k].paper, SCHEME[k].ink, k.length));
    t.repeat.set(1, 1 / 1.5);
    papers[k] = own(new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
  }
  const backPapers = {} as Record<WallDef['scheme'], THREE.MeshStandardMaterial>;
  for (const k of Object.keys(SCHEME) as WallDef['scheme'][]) {
    backPapers[k] = own(papers[k].clone());
    backPapers[k].side = THREE.BackSide;
  }
  const glass = m.glass;

  // ---- floors (shape y is -z, so the shape reads like the plan)
  const floorMats: THREE.MeshStandardMaterial[] = [];
  const floor = (pts: [number, number][], tex: THREE.Texture, tile: number, zone: ZoneId, y = 0, rough = 0.95) => {
    const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = own(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2));
    tex.repeat.set(1 / tile, 1 / tile);
    const mat = own(new THREE.MeshStandardMaterial({ map: tex, roughness: rough }));
    floorMats.push(mat);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.y = y;
    mesh.receiveShadow = true;
    mesh.name = 'floor';
    zones[zone].add(mesh);
    return mesh;
  };
  // Neighbouring floors meet under the middle of each partition, so no gap shows in a doorway.
  floor([[SALOON.x0 - T / 2, SALOON.z0], [SALOON.x1 + T, SALOON.z0], [SALOON.x1 + T, SALOON.z1], [SALOON.x0 - T / 2, SALOON.z1]], own(saloonCarpet(texScale)), 2, 'saloon');
  floor([[BAY.x0, BAY.z0], [BAY.x1, BAY.z0], [BAY.x1, SALOON.z0], [BAY.x0, SALOON.z0]], own(planks(texScale, '#5a2a1a', 21)), 2, 'bay', 0, 0.5);
  floor([[STERN.x0, -8.3], [STERN.x1 + 0.4, -8.3], [STERN.x1 + 0.4, 8.3], [STERN.x0, 8.3]], own(planks(texScale, '#a87a4a', 4)), 2.4, 'stern', 0, 0.8);
  const lp: [number, number][] = [[SALOON.x0, -LOUNGE.halfAtSaloon], [SALOON.x0, LOUNGE.halfAtSaloon], [LOUNGE.x0, LOUNGE.halfAtBow], [LOUNGE.x0, -LOUNGE.halfAtBow]];
  const lf: [number, number][] = [[SALOON.x0 - T / 2, -LOUNGE.halfAtSaloon - T], [SALOON.x0 - T / 2, LOUNGE.halfAtSaloon + T], [LOUNGE.x0 - T / 2, LOUNGE.halfAtBow + T], [LOUNGE.x0 - T / 2, -LOUNGE.halfAtBow - T]];
  floor(lf, own(loungeCarpet(texScale)), 2, 'lounge');
  floor([[LOUNGE.x0 - T / 2, -WHEELHOUSE.halfAtLounge - T], [LOUNGE.x0 - T / 2, WHEELHOUSE.halfAtLounge + T], [WHEELHOUSE.x0 - T, WHEELHOUSE.halfAtBow + T], [WHEELHOUSE.x0 - T, -WHEELHOUSE.halfAtBow - T]], own(planks(texScale, '#8a5530', 8)), 2, 'wheelhouse', 0, 0.6);

  // ---- the hull below the deck, out to the water
  {
    const outline: [number, number][] = [
      [12.3, 9.45], [12.6, 8.4], [21.6, 8.4], [21.6, -8.4], [12.6, -8.4], [12.3, -9.45],
      [5.45, -9.45], [5.45, -12.95], [-5.45, -12.95], [-5.45, -9.45],
      [-12.3, -9.45], [-21, -6.95], [-28.5, -2.95], [-30.4, 0], [-28.5, 2.95], [-21, 6.95], [-12.3, 9.45],
    ];
    const s = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = own(new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -2.23, 0));
    const tex = own(hullPaint(texScale));
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, -1 / 2.2);
    tex.offset.set(0, 1 + 1.2 / 2.2 - 1);
    // Caps first (the deck under the floors, dark wood), then the painted sides.
    const hull = new THREE.Mesh(geo, [own(new THREE.MeshStandardMaterial({ color: '#3a2214', roughness: 0.9, visible: false })), own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }))]);
    hull.receiveShadow = true;
    group.add(hull);
    // The guard: a brass-capped rim at deck level, a hand's width proud of the hull.
    const rim = new Batch();
    for (let i = 0; i < outline.length; i++) {
      const [x0, z0] = outline[i];
      const [x1, z1] = outline[(i + 1) % outline.length];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const a = Math.atan2(z1 - z0, x1 - x0);
      rim.add(box(len + 0.2, 0.16, 0.22), m.trim, (x0 + x1) / 2, -0.1, (z0 + z1) / 2, 0, -a, 0, C.mahogany);
      rim.add(box(len + 0.2, 0.04, 0.26), m.trim, (x0 + x1) / 2, 0.005, (z0 + z1) / 2, 0, -a, 0, C.brassMatte);
    }
    rim.build(group, { cast: false });
  }

  // ---- walls, merged per room and material, cut away in the vertex shader
  const walls: WallView[] = [];
  const cutU = { value: new Array(MAX_WALLS).fill(0) };
  const cutMats = new Map<string, THREE.Material>();
  const cutOf = (base: THREE.Material) => {
    let m = cutMats.get(base.uuid);
    if (!m) {
      m = own(cutMaterial(base, cutU));
      cutMats.set(base.uuid, m);
    }
    return m;
  };
  /** Per room, per wall material: the parts in world space, tagged with their wall. */
  const collect = new Map<ZoneId, Map<THREE.Material, THREE.BufferGeometry[]>>();
  const gather = (zone: ZoneId, batch: Batch, matrix: THREE.Matrix4, index: number, stub: boolean) => {
    const byMat = collect.get(zone) ?? new Map<THREE.Material, THREE.BufferGeometry[]>();
    collect.set(zone, byMat);
    for (const [mat, list] of batch.drain()) {
      const cm = cutOf(mat);
      const out = byMat.get(cm) ?? [];
      for (const g of list) {
        g.applyMatrix4(matrix);
        g.setAttribute('wallId', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(index), 1));
        g.setAttribute('wallStub', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(stub ? 1 : 0), 1));
        out.push(g);
      }
      byMat.set(cm, out);
    }
  };
  for (const w of WALLS) {
    const len = wallLength(w);
    const ops = localOpenings(w);
    const sc = SCHEME[w.scheme];
    const H = w.height;
    const full = new THREE.Group();
    const stub = new THREE.Group();
    full.matrixAutoUpdate = stub.matrixAutoUpdate = false;
    full.matrix.copy(wallMatrix(w));
    stub.matrix.copy(full.matrix);
    full.name = `wall-${w.id}`;
    const b = new Batch();
    const shape = wallShape(len, H, ops);
    // Core, painted outside; the wallpaper skin sits just inside it.
    // Each core sits a hair higher than the last, so cores crossing at a corner never share their base plane.
    const base = (walls.length + 1) * 0.0012;
    b.add(new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -T / 2), m.trim, 0, base, 0, 0, 0, 0, sc.outside);
    const skin = new THREE.ShapeGeometry(shape, 10);
    const skinUv = skin.attributes.uv;
    // Wallpaper starts above the wainscot so the pattern lines up on every wall.
    for (let i = 0; i < skinUv.count; i++) skinUv.setY(i, skinUv.getY(i) - 1.15);
    b.add(skin, papers[w.scheme], 0, 0, T / 2 + 0.008);
    const z0 = T / 2;
    trimFace(b, m, w, ops, sc, 1);
    if (w.back) {
      // A partition: the far room's wallpaper, drawn from behind, and its trim.
      const back = new THREE.ShapeGeometry(shape, 10);
      const uv = back.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) - 1.15);
      b.add(back, backPapers[w.back], 0, 0, -T / 2 - 0.008);
      trimFace(b, m, w, ops, SCHEME[w.back], -1);
    }
    // Caps sit at slightly different heights so caps meeting at a corner never share a plane.
    b.add(box(len - 0.02, 0.1, T + 0.2), m.trim, len / 2, H + walls.length * 0.004, 0, 0, 0, 0, sc.crown);
    for (const o of ops) {
      if (o.glass) {
        b.add(new THREE.ExtrudeGeometry(frameShape(o, 0.12), { depth: 0.05, bevelEnabled: false, curveSegments: 10 }), m.trim, 0, 0, z0 + 0.012, 0, 0, 0, sc.frame);
        b.add(box(o.to - o.from + 0.4, 0.08, 0.18), m.trim, (o.from + o.to) / 2, o.sill - 0.08, z0 + 0.06, 0, 0, 0, sc.frame);
        b.add(new THREE.ShapeGeometry(openingShape(o), 10), glass, 0, 0, 0);
        // Mullions: a centre bar and a transom at the springing line.
        const mid = (o.from + o.to) / 2;
        const top = o.top + (o.arch ? (o.to - o.from) / 2 : 0);
        b.add(box(0.05, top - o.sill, 0.05), m.trim, mid, (o.sill + top) / 2, 0.03, 0, 0, 0, sc.frame);
        if (o.arch) b.add(box(o.to - o.from, 0.05, 0.05), m.trim, mid, o.top, 0.03, 0, 0, 0, sc.frame);
      } else if (o.sill < 0.01) {
        for (const side of [1, -1]) b.add(new THREE.ExtrudeGeometry(frameShape(o, 0.16), { depth: 0.06, bevelEnabled: false, curveSegments: 10 }), m.trim, 0, 0, side > 0 ? z0 + 0.012 : -z0 - 0.072, 0, 0, 0, side > 0 ? sc.frame : C.ivory);
      }
    }
    gather(w.zone, b, full.matrix, walls.length, false);
    // The stub: a skirting with a brass cap, broken at doors.
    const sb = new Batch();
    const lift = walls.length * 0.004;
    for (const [s0, s1] of solidRuns(len, ops)) {
      sb.add(box(s1 - s0, 0.34 + lift, T), m.trim, (s0 + s1) / 2, 0.172 + lift * 1.5, 0, 0, 0, 0, sc.wains);
      sb.add(box(s1 - s0 - 0.08, 0.035, T + 0.06), m.trim, (s0 + s1) / 2, 0.36 + lift * 2, 0, 0, 0, 0, '#a8782c');
    }
    gather(w.zone, sb, full.matrix, walls.length, true);
    stub.visible = false;
    zones[w.zone].add(full, stub);
    walls.push({ def: w, full, stub, n: wallNormal(w), cut: false });
  }
  for (const [zone, byMat] of collect) {
    for (const [mat, list] of byMat) {
      const merged = mergeGeometries(list);
      for (const g of list) g.dispose();
      if (!merged) continue;
      own(merged);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = !(mat as THREE.MeshStandardMaterial).transparent;
      mesh.receiveShadow = true;
      mesh.name = `walls-${zone}`;
      zones[zone].add(mesh);
    }
  }

  // ---- ceilings (single sided, facing down, so a high camera sees in)
  const ceiling = (s: THREE.Shape, y: number, tex: THREE.Texture, tile: number, zone: ZoneId, emissive = 0) => {
    const g = own(new THREE.ShapeGeometry(s).rotateX(Math.PI / 2));
    tex.repeat.set(1 / tile, 1 / tile);
    const mat = own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: new THREE.Color('#ffffff'), emissiveMap: emissive ? tex : null, emissiveIntensity: emissive }));
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.y = y;
    mesh.userData.ceiling = y;
    mesh.name = 'ceiling';
    zones[zone].add(mesh);
    ceilings.push(mesh);
    return mesh;
  };
  const ceilings: THREE.Object3D[] = [];
  const rect = (x0: number, z0: number, x1: number, z1: number) => new THREE.Shape([new THREE.Vector2(x0, z0), new THREE.Vector2(x1, z0), new THREE.Vector2(x1, z1), new THREE.Vector2(x0, z1)]);
  {
    // The clerestory runs down the middle and opens out over Old Lucky's bay,
    // so the machine's marquee and smokestacks can be seen from the saloon.
    const well: [number, number][] = [
      [CLERESTORY.x0, CLERESTORY.z0],
      [BAY.x0, CLERESTORY.z0],
      [BAY.x0, SALOON.z0],
      [BAY.x1, SALOON.z0],
      [BAY.x1, CLERESTORY.z0],
      [CLERESTORY.x1, CLERESTORY.z0],
      [CLERESTORY.x1, CLERESTORY.z1],
      [CLERESTORY.x0, CLERESTORY.z1],
    ];
    // The saloon ceiling wraps round the well as one notched outline (a hole would touch its edge).
    const s = new THREE.Shape(
      ([
        [SALOON.x0, SALOON.z0],
        [BAY.x0, SALOON.z0],
        [BAY.x0, CLERESTORY.z0],
        [CLERESTORY.x0, CLERESTORY.z0],
        [CLERESTORY.x0, CLERESTORY.z1],
        [CLERESTORY.x1, CLERESTORY.z1],
        [CLERESTORY.x1, CLERESTORY.z0],
        [BAY.x1, CLERESTORY.z0],
        [BAY.x1, SALOON.z0],
        [SALOON.x1 + T / 2, SALOON.z0],
        [SALOON.x1 + T / 2, SALOON.z1],
        [SALOON.x0, SALOON.z1],
      ] as [number, number][]).map(([x, z]) => new THREE.Vector2(x, z)),
    );
    ceiling(s, SALOON.height - 0.12, own(coffers(texScale)), 2, 'saloon');
    ceiling(new THREE.Shape(well.map(([x, z]) => new THREE.Vector2(x, z))), CLERESTORY.height, own(coffers(texScale, '#1d4f55', '#f4e7cc')), 2, 'saloon');
    // Clerestory band: little arched windows between the two ceilings, facing in.
    const band = own(
      canvasTex(512, 160, (g, W, Hh) => {
        g.fillStyle = '#e8dcc0';
        g.fillRect(0, 0, W, Hh);
        for (let i = 0; i < 4; i++) {
          const x = i * 128 + 24;
          g.fillStyle = '#2a4a6a';
          g.beginPath();
          g.moveTo(x, Hh - 22);
          g.lineTo(x, 62);
          g.arc(x + 40, 62, 40, Math.PI, 0);
          g.lineTo(x + 80, Hh - 22);
          g.closePath();
          g.fill();
          g.strokeStyle = '#c9973a';
          g.lineWidth = 6;
          g.stroke();
        }
        g.fillStyle = '#6a2c1d';
        g.fillRect(0, Hh - 12, W, 12);
        g.fillRect(0, 0, W, 8);
      }),
    );
    band.wrapS = THREE.RepeatWrapping;
    const bandMat = own(new THREE.MeshStandardMaterial({ map: band, roughness: 0.8, emissive: new THREE.Color('#ffffff'), emissiveMap: band, emissiveIntensity: 0.12 }));
    const bandBatch = new Batch();
    const hgt = CLERESTORY.height - (SALOON.height - 0.12);
    const yc = (CLERESTORY.height + SALOON.height - 0.12) / 2;
    const inside = (x: number, z: number) => {
      let c = false;
      for (let i = 0, j = well.length - 1; i < well.length; j = i++) {
        const [xi, zi] = well[i];
        const [xj, zj] = well[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
      }
      return c;
    };
    for (let i = 0; i < well.length; i++) {
      const [ax, az] = well[i];
      const [bx, bz] = well[(i + 1) % well.length];
      // The bay mouth stays open; a gilded header sits above it instead.
      if (az === SALOON.z0 && bz === SALOON.z0) continue;
      const len = Math.hypot(bx - ax, bz - az);
      let nx = (bz - az) / len;
      let nz = -(bx - ax) / len;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      if (!inside(mx + nx * 0.2, mz + nz * 0.2)) {
        nx = -nx;
        nz = -nz;
      }
      const g = new THREE.PlaneGeometry(len, hgt);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * (len / 4));
      // A centimetre into the well, clear of the wall caps below.
      bandBatch.add(g, bandMat, mx + nx * 0.01, yc, mz + nz * 0.01, 0, Math.atan2(nx, nz), 0);
    }
    for (const bm of bandBatch.build(zones.saloon, { cast: false })) {
      bm.userData.ceiling = SALOON.height - 0.12;
      ceilings.push(bm);
    }
    const header = own(
      canvasTex(1024, 160, (g, W, Hh) => {
        const grd = g.createLinearGradient(0, 0, 0, Hh);
        grd.addColorStop(0, '#4a0e18');
        grd.addColorStop(1, '#7a1424');
        g.fillStyle = grd;
        g.fillRect(0, 0, W, Hh);
        g.fillStyle = '#c9973a';
        g.fillRect(0, Hh - 16, W, 16);
        g.fillRect(0, 0, W, 8);
        for (let i = 0; i < 24; i++) {
          g.beginPath();
          g.arc((i + 0.5) * (W / 24), Hh - 16, 14, Math.PI, 0);
          g.fill();
        }
      }, false),
    );
    const hm = new THREE.Mesh(own(new THREE.PlaneGeometry(BAY.x1 - BAY.x0 + 0.6, BAY.height - CLERESTORY.height)), own(new THREE.MeshStandardMaterial({ map: header, roughness: 0.6 })));
    hm.position.set(0, (BAY.height + CLERESTORY.height) / 2, SALOON.z0 + 0.01);
    hm.userData.ceiling = CLERESTORY.height;
    zones.saloon.add(hm);
    ceilings.push(hm);
  }
  // The bay: a deep red night sky with a gilded sunburst over Old Lucky.
  ceiling(
    rect(BAY.x0, BAY.z0, BAY.x1, SALOON.z0 - T / 2),
    BAY.height - 0.12,
    own(
      canvasTex(512, 512, (g, W) => {
        g.fillStyle = '#2a0e16';
        g.fillRect(0, 0, W, W);
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          g.fillStyle = i % 2 ? 'rgba(224,172,69,0.35)' : 'rgba(224,172,69,0.12)';
          g.beginPath();
          g.moveTo(W / 2, W / 2);
          g.arc(W / 2, W / 2, W, a, a + Math.PI / 24);
          g.closePath();
          g.fill();
        }
      }),
    ),
    10,
    'bay',
  );
  {
    const lps = new THREE.Shape(lp.map(([x, z]) => new THREE.Vector2(x - (x === SALOON.x0 ? T : 0), z)));
    const starTex = own(
      canvasTex(512, 512, (g, W) => {
        g.fillStyle = '#141738';
        g.fillRect(0, 0, W, W);
        let s = 9;
        const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 90; i++) {
          g.fillStyle = `rgba(207,227,255,${0.3 + r() * 0.7})`;
          g.beginPath();
          g.arc(r() * W, r() * W, 0.8 + r() * 2.4, 0, Math.PI * 2);
          g.fill();
        }
      }),
    );
    ceiling(lps, LOUNGE.height - 0.12, starTex, 4, 'lounge', 0.5);
    const wps = new THREE.Shape([new THREE.Vector2(LOUNGE.x0 - T, -WHEELHOUSE.halfAtLounge), new THREE.Vector2(LOUNGE.x0 - T, WHEELHOUSE.halfAtLounge), new THREE.Vector2(WHEELHOUSE.x0, WHEELHOUSE.halfAtBow), new THREE.Vector2(WHEELHOUSE.x0, -WHEELHOUSE.halfAtBow)]);
    ceiling(wps, WHEELHOUSE.height - 0.12, own(planks(texScale, '#6a4026', 13)), 1.6, 'wheelhouse');
  }

  // ---- columns: cast iron with brass capitals, faded when they block the view
  const columns: ColumnView[] = [];
  let colMesh: THREE.InstancedMesh | null = null;
  const colM = new THREE.Matrix4();
  {
    const prof: THREE.Vector2[] = [];
    const H = SALOON.height - 0.12;
    const pts: [number, number][] = [[0, 0], [0.34, 0], [0.34, 0.1], [0.28, 0.18], [0.25, 0.3], [0.2, 0.5], [0.19, H - 0.75], [0.24, H - 0.55], [0.28, H - 0.45], [0.38, H - 0.3], [0.42, H - 0.12], [0.42, H], [0, H]];
    for (const [r, y] of pts) prof.push(new THREE.Vector2(r, y));
    const shaft = own(new THREE.LatheGeometry(prof, 18));
    // Colour the capital and base brass, the shaft iron, through vertex colours.
    const pos = shaft.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const fluting = new THREE.Color(C.ivory);
    const flute = new THREE.Color('#d8c9a8');
    const brass = new THREE.Color(C.brassMatte);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      // Alternate lathe segments read as fluting.
      const seg = Math.round(Math.atan2(pos.getZ(i), pos.getX(i)) / ((Math.PI * 2) / 18));
      const c = y < 0.31 || y > H - 0.6 ? brass : seg % 2 ? flute : fluting;
      col.set([c.r, c.g, c.b], i * 3);
    }
    shaft.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 }));
    colMesh = new THREE.InstancedMesh(shaft, mat, COLUMNS.length);
    COLUMNS.forEach((c, i) => {
      colMesh!.setMatrixAt(i, new THREE.Matrix4().makeTranslation(c.x, 0, c.z));
      columns.push({ x: c.x, z: c.z, fade: 1 });
    });
    colMesh.castShadow = true;
    colMesh.receiveShadow = true;
    zones.saloon.add(colMesh);
  }

  // ---- fixed furniture
  furnishSaloon(m, zones.saloon, own);
  furnishStern(m, zones.stern);
  furnishLounge(m, zones.lounge);

  return {
    group,
    zones,
    walls,
    ceilings,
    setCut(i: number, cut: boolean) {
      cutU.value[i] = cut ? 1 : 0;
    },
    columns,
    setColumn(i: number, fade: number) {
      const c = columns[i];
      const f = Math.max(0.0001, fade);
      colMesh!.setMatrixAt(i, colM.makeScale(f, 1, f).setPosition(c.x, 0, c.z));
      colMesh!.instanceMatrix.needsUpdate = true;
    },
    glass,
    floorMats,
    dispose() {
      for (const o of owned) o.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Furniture

function furnishSaloon(m: Mats, into: THREE.Group, own: <X extends { dispose(): void }>(x: X) => X): void {
  const b = new Batch();
  // Band stage: a quarter disc in the bow-starboard corner, with a brass lip.
  b.add(new THREE.CylinderGeometry(STAGE.r, STAGE.r, STAGE.h, 40, 1, false, 0, Math.PI / 2), m.trim, STAGE.x + 0.15, STAGE.h / 2, STAGE.z + 0.15, 0, 0, 0, C.mahoganyLit);
  b.add(new THREE.TorusGeometry(STAGE.r, 0.04, 8, 40, Math.PI / 2).rotateX(Math.PI / 2).rotateY(Math.PI / 2), m.trim, STAGE.x + 0.15, STAGE.h, STAGE.z + 0.15, 0, 0, 0, C.brassMatte);

  // Soda fountain bar along the starboard wall.
  const sx = (SODA.x0 + SODA.x1) / 2;
  const sw = SODA.x1 - SODA.x0;
  b.add(box(sw, 1.0, 0.8), m.trim, sx, 0.5, SODA.z, 0, 0, 0, C.mahogany);
  b.add(box(sw + 0.1, 0.06, 0.9), m.trim, sx, 1.03, SODA.z, 0, 0, 0, '#e8dcc0');
  for (let i = 0; i < 5; i++) b.add(box(sw / 5 - 0.12, 0.6, 0.02), m.trim, SODA.x0 + (i + 0.5) * (sw / 5), 0.5, SODA.z + 0.41, 0, 0, 0, C.mahoganyLit);
  for (let i = 0; i < 4; i++) {
    const x = SODA.x0 + 0.5 + i * 0.85;
    b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), m.trim, x, 1.25, SODA.z - 0.2, 0, 0, 0, C.brassMatte);
    b.add(new THREE.SphereGeometry(0.06, 10, 8), m.trim, x, 1.46, SODA.z - 0.2, 0, 0, 0, C.brassMatte);
    // Stools.
    b.add(new THREE.CylinderGeometry(0.04, 0.06, 0.7, 8), m.trim, x, 0.35, SODA.z + 0.85, 0, 0, 0, C.brassMatte);
    b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 16), m.trim, x, 0.74, SODA.z + 0.85, 0, 0, 0, C.coral);
  }
  // Bottles and glasses on a back shelf.
  b.add(box(sw, 0.05, 0.25), m.trim, sx, 1.9, SODA.z - 0.28, 0, 0, 0, C.mahogany);
  const bottle = ['#d8574a', '#e0ac45', '#3f9a7a', '#9fb7e8', '#f4e7cc'];
  for (let i = 0; i < 14; i++) b.add(new THREE.CylinderGeometry(0.05, 0.06, 0.28, 8), m.trim, SODA.x0 + 0.2 + i * 0.23, 2.07, SODA.z - 0.28, 0, 0, 0, bottle[i % bottle.length]);

  // Penny's cage: counter, brass bars and a little roof.
  const px = (PENNY.x0 + PENNY.x1) / 2;
  const pw = PENNY.x1 - PENNY.x0;
  b.add(box(pw, 1.05, 0.6), m.trim, px, 0.525, PENNY.z0 + 0.3, 0, 0, 0, C.mahogany);
  b.add(box(pw + 0.1, 0.06, 0.7), m.trim, px, 1.08, PENNY.z0 + 0.3, 0, 0, 0, C.mahoganyLit);
  for (let i = 0; i < 4; i++) b.add(box(pw / 4 - 0.15, 0.6, 0.02), m.trim, PENNY.x0 + (i + 0.5) * (pw / 4), 0.55, PENNY.z0 - 0.01, 0, 0, 0, C.mahoganyLit);
  for (let i = 0; i <= 16; i++) {
    const x = PENNY.x0 + 0.1 + i * ((pw - 0.2) / 16);
    if (Math.abs(x - px) < 0.4) continue;
    b.add(new THREE.CylinderGeometry(0.018, 0.018, 1.3, 6), m.trim, x, 1.75, PENNY.z0 + 0.12, 0, 0, 0, C.brassMatte);
  }
  b.add(box(pw, 0.06, 0.06), m.trim, px, 2.42, PENNY.z0 + 0.12, 0, 0, 0, C.brassMatte);
  b.add(box(pw + 0.3, 0.14, 1.9), m.trim, px, 2.6, (PENNY.z0 + PENNY.z1) / 2, 0, 0, 0, C.mahogany);
  b.add(box(pw + 0.1, 0.34, 0.05), m.trim, px, 2.84, PENNY.z0 - 0.03, 0, 0, 0, '#13212b');
  for (const sxx of [PENNY.x0, PENNY.x1]) b.add(box(0.14, 2.6, 0.14), m.trim, sxx, 1.3, PENNY.z0 + 0.12, 0, 0, 0, C.mahogany);
  // A safe and a coin scale behind the counter.
  b.add(box(0.8, 1.0, 0.6), m.trim, PENNY.x0 + 0.6, 0.5, PENNY.z1 - 0.45, 0, 0, 0, '#2a3b4a');
  b.add(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16).rotateX(Math.PI / 2), m.trim, PENNY.x0 + 0.6, 0.6, PENNY.z1 - 0.76, 0, 0, 0, C.brassMatte);

  // The Logbook nook: bookshelves along the port wall, two armchairs.
  const sh = LOGBOOK.shelves;
  const shw = sh.x1 - sh.x0;
  const shx = (sh.x0 + sh.x1) / 2;
  b.add(box(shw, 2.4, 0.06), m.trim, shx, 1.2, sh.z + 0.27, 0, 0, 0, C.mahogany);
  for (const sxx of [sh.x0, sh.x1, shx]) b.add(box(0.08, 2.4, 0.5), m.trim, sxx, 1.2, sh.z, 0, 0, 0, C.mahogany);
  const spine = ['#6a2c1d', '#1d4f55', '#c9973a', '#2b3070', '#8e4a2e', '#3f6a3a', '#a03a2a', '#e8dcc0'];
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 4; row++) {
    const y = 0.1 + row * 0.58;
    b.add(box(shw, 0.04, 0.48), m.trim, shx, y, sh.z, 0, 0, 0, C.mahoganyLit);
    let x = sh.x0 + 0.08;
    while (x < sh.x1 - 0.2) {
      if (Math.abs(x - shx) < 0.08) {
        x += 0.1;
        continue;
      }
      const w = 0.05 + rnd() * 0.05;
      const hgt = 0.32 + rnd() * 0.16;
      const lean = rnd() < 0.06 ? 0.2 : 0;
      b.add(box(w, hgt, 0.3), m.trim, x + w / 2, y + 0.02 + hgt / 2, sh.z - 0.02, 0, 0, lean, spine[Math.floor(rnd() * spine.length)]);
      x += w + 0.008 + (lean ? 0.06 : 0);
    }
  }
  b.add(box(shw + 0.2, 0.1, 0.56), m.trim, shx, 2.42, sh.z, 0, 0, 0, C.mahogany);
  for (const c of LOGBOOK.chairs) {
    const face = c.x < LOGBOOK.table.x ? Math.PI / 2 : -Math.PI / 2;
    const leather = '#7a2a22';
    const g = new THREE.Group();
    g.position.set(c.x, 0, c.z);
    g.rotation.y = face;
    g.updateMatrixWorld();
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, col: string) => {
      const mm = new THREE.Matrix4().makeTranslation(x, y, z).premultiply(g.matrixWorld);
      b.addMatrix(geo, m.trim, mm, col);
    };
    add(new THREE.BoxGeometry(0.9, 0.42, 0.85), 0, 0.3, 0, leather);
    add(new THREE.BoxGeometry(0.9, 0.75, 0.2), 0, 0.75, -0.38, leather);
    add(new THREE.BoxGeometry(0.16, 0.3, 0.85), -0.45, 0.6, 0, '#8a3a2e');
    add(new THREE.BoxGeometry(0.16, 0.3, 0.85), 0.45, 0.6, 0, '#8a3a2e');
    add(new THREE.BoxGeometry(0.8, 0.1, 0.75), 0, 0.53, 0.04, '#9a4a3a');
    for (const [lx, lz] of [[-0.36, -0.34], [0.36, -0.34], [-0.36, 0.34], [0.36, 0.34]]) add(new THREE.CylinderGeometry(0.035, 0.03, 0.1, 6), lx, 0.05, lz, C.brassMatte);
  }
  // Rugs under the logbook nook and the tables: separate decals, lifted off the carpet.
  b.build(into);
  const rug = own(
    canvasTex(512, 320, (g, W, Hh) => {
      g.fillStyle = '#7a2a22';
      g.fillRect(0, 0, W, Hh);
      g.strokeStyle = '#e0ac45';
      g.lineWidth = 10;
      g.strokeRect(20, 20, W - 40, Hh - 40);
      g.lineWidth = 3;
      g.strokeRect(40, 40, W - 80, Hh - 80);
      g.fillStyle = 'rgba(224,172,69,0.6)';
      g.beginPath();
      g.ellipse(W / 2, Hh / 2, 120, 70, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5a1a16';
      g.beginPath();
      g.ellipse(W / 2, Hh / 2, 100, 54, 0, 0, Math.PI * 2);
      g.fill();
    }, false),
  );
  const rugMat = own(new THREE.MeshStandardMaterial({ map: rug, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
  const rm = new THREE.Mesh(own(new THREE.PlaneGeometry(6.0, 3.6).rotateX(-Math.PI / 2)), rugMat);
  rm.position.set(LOGBOOK.table.x, 0.005, 5.9);
  rm.receiveShadow = true;
  into.add(rm);
}

function furnishStern(m: Mats, into: THREE.Group): void {
  const b = new Batch();
  // Rails: turned posts and a mahogany top rail along the sides and the stern.
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const a = Math.atan2(z1 - z0, x1 - x0);
    b.add(box(len, 0.08, 0.14), m.trim, (x0 + x1) / 2, 1.1, (z0 + z1) / 2, 0, -a, 0, C.mahogany);
    b.add(box(len, 0.05, 0.08), m.trim, (x0 + x1) / 2, 0.15, (z0 + z1) / 2, 0, -a, 0, C.mahogany);
    const n = Math.round(len / 0.22);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const big = i % 8 === 0;
      b.add(new THREE.CylinderGeometry(big ? 0.06 : 0.025, big ? 0.07 : 0.03, 0.95, 6), m.trim, x0 + (x1 - x0) * t, 0.62, z0 + (z1 - z0) * t, 0, 0, 0, big ? C.ivory : '#e8dcc0');
    }
  };
  rail(STERN.x0, STERN.z1 + 0.1, STERN.x1 + 0.1, STERN.z1 + 0.1);
  rail(STERN.x0, STERN.z0 - 0.1, STERN.x1 + 0.1, STERN.z0 - 0.1);
  rail(STERN.x1 + 0.1, STERN.z0 - 0.1, STERN.x1 + 0.1, STERN.z1 + 0.1);
  // Life rings on the rails.
  for (const [x, z, ry] of [[14.5, 8.15, 0], [18.5, -8.15, 0], [21.15, 4.5, Math.PI / 2]] as const) {
    for (let k = 0; k < 4; k++) b.add(new THREE.TorusGeometry(0.32, 0.08, 8, 12, Math.PI / 2), m.trim, x, 0.7, z, 0, ry, (k * Math.PI) / 2, k % 2 ? C.ivory : '#d8382c');
  }
  // Benches facing in.
  for (const [x, z] of [[14, 6.9], [18, 6.9], [14, -6.9], [18, -6.9]]) {
    b.add(box(2.2, 0.08, 0.5), m.trim, x, 0.48, z, 0, 0, 0, C.mahoganyLit);
    b.add(box(2.2, 0.5, 0.06), m.trim, x, 0.8, z + Math.sign(z) * 0.24, 0, 0, 0, C.mahoganyLit);
    for (const dx of [-0.95, 0.95]) b.add(box(0.08, 0.48, 0.45), m.trim, x + dx, 0.24, z, 0, 0, 0, C.iron);
  }
  // Masts for the festoon strings.
  for (const z of [-7.5, 7.5]) {
    b.add(new THREE.CylinderGeometry(0.09, 0.12, 6.4, 10), m.trim, 21, 3.2, z, 0, 0, 0, C.ivory);
    b.add(new THREE.SphereGeometry(0.16, 12, 8), m.trim, 21, 6.45, z, 0, 0, 0, C.brassMatte);
  }
  b.build(into);
}

function furnishLounge(m: Mats, into: THREE.Group): void {
  const b = new Batch();
  for (const t of LOUNGE_TABLES) {
    b.add(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 24), m.trim, t.x, 0.74, t.z, 0, 0, 0, '#1c1f45');
    b.add(new THREE.CylinderGeometry(0.05, 0.08, 0.72, 8), m.trim, t.x, 0.36, t.z, 0, 0, 0, '#c8d2ea');
    b.add(new THREE.CylinderGeometry(0.28, 0.32, 0.03, 16), m.trim, t.x, 0.015, t.z, 0, 0, 0, '#c8d2ea');
    // Two little velvet chairs each.
    for (const s of [-1, 1]) {
      const cx = t.x + s * 0.8;
      b.add(new THREE.CylinderGeometry(0.26, 0.24, 0.42, 14), m.trim, cx, 0.21, t.z, 0, 0, 0, '#3a3f8a');
      b.add(box(0.1, 0.5, 0.5), m.trim, cx + s * 0.22, 0.6, t.z, 0, 0, 0, '#3a3f8a');
    }
  }
  b.build(into);
}
