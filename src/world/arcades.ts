// The two arcades on the ring road, each built as a landmark rather than a
// shop front. SpaceChakra is a lotus observatory: ivory petals open around a
// moon gate, and seven chakra rings orbit a spine up to a crystal. VibeCoded
// Games is the Stack: slabs shifted like indented lines of code, glowing
// code screens, an angle-bracket portal and a blinking cursor on top.
//
// Local space: the building faces +z, towards the plaza.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cached, mesh, plastic, roundBox, sign } from './kit';
import { box, circle, type Collider } from './physics';

export type LocalCollider = { kind: 'box'; x: number; z: number; hw: number; hd: number; rot: number; h: number } | { kind: 'circle'; x: number; z: number; r: number; h: number };

export interface ArcadeBuild {
  group: THREE.Group;
  /** Colliders in the building's local space; the town moves them into place. */
  colliders: LocalCollider[];
  /** Brightness by time of day is handled in animate(). */
  animate(t: number, night: number): void;
}

/** Turns local colliders into world ones for a building at (px, pz) turned by `rot` about y. */
export function placeColliders(local: LocalCollider[], px: number, pz: number, rot: number): Collider[] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return local.map((l) => {
    const x = px + l.x * c + l.z * s;
    const z = pz - l.x * s + l.z * c;
    return l.kind === 'box' ? box(x, z, l.hw, l.hd, rot + l.rot, l.h, 0.5, true) : circle(x, z, l.r, l.h, 0.5, true);
  });
}

/** Collects static parts by material and merges each material's parts into one mesh, to keep draw calls low. */
export class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    this.addMatrix(geo, mat, m);
  }

  addMatrix(geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4): void {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
  }

  build(into: THREE.Object3D, cast = true): void {
    for (const [mat, list] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(list)!, mat);
      m.castShadow = cast;
      m.receiveShadow = true;
      into.add(m);
    }
  }
}

/**
 * A lit sign colour: a dark body with a coloured glow, so it stays saturated
 * at night instead of washing out to pastel. Brightness follows the time of
 * day through `setGlow`.
 */
function glowMat(color: string, base = 0.8): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.4), emissive: new THREE.Color(color), emissiveIntensity: base, roughness: 0.35 });
  m.userData.glowBase = base;
  return m;
}

function setGlow(mats: THREE.MeshStandardMaterial[], night: number): void {
  for (const m of mats) m.emissiveIntensity = (m.userData.glowBase as number) * (0.85 + night * 0.45);
}

// ---------------------------------------------------------------------------
// SpaceChakra: the lotus observatory

/**
 * One cupped petal. Its centreline bends out from the base like a lotus
 * petal; v runs base to tip, u across. Colours fade from blush to ivory.
 */
function petal(len: number, width: number, flare: number, rise: number, cup: number): THREE.BufferGeometry {
  const NV = 14;
  const NU = 8;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const base = new THREE.Color('#f4c2cf');
  const tip = new THREE.Color('#fffaf2');
  const tmp = new THREE.Color();
  for (let i = 0; i <= NV; i++) {
    const v = i / NV;
    // Quadratic curve in (out, up): steep at the base, opening towards the tip.
    const a = 1 - v;
    const c1 = 0.04 * len;
    const out = 2 * a * v * c1 + v * v * flare;
    const up = 2 * a * v * (0.72 * rise) + v * v * rise;
    const tOut = 2 * a * c1 + 2 * v * (flare - c1);
    const tUp = 2 * a * (0.72 * rise) + 2 * v * (rise - 0.72 * rise);
    const tl = Math.hypot(tOut, tUp) || 1;
    // Inward normal of the curve (towards the axis and up).
    const nOut = -tUp / tl;
    const nUp = tOut / tl;
    // Broad through the middle, narrowing to a soft point.
    const hw = (width / 2) * Math.pow(Math.sin(Math.PI * Math.min(0.999, 0.04 + Math.pow(v, 0.8) * 0.96)), 0.55);
    tmp.copy(base).lerp(tip, Math.min(1, v * 1.3));
    for (let j = 0; j <= NU; j++) {
      const u = (j / NU) * 2 - 1;
      const dip = cup * (1 - u * u) * Math.sin(Math.PI * Math.min(1, v * 1.1));
      pos.push(u * hw, up + nUp * dip, out + nOut * dip);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let i = 0; i < NV; i++)
    for (let j = 0; j < NU; j++) {
      const p = i * (NU + 1) + j;
      idx.push(p, p + NU + 1, p + 1, p + 1, p + NU + 1, p + NU + 2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A ring of petals merged into one mesh. */
function petalRing(count: number, skipFront: boolean, r0: number, y0: number, len: number, width: number, flare: number, rise: number, cup: number, offset: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  for (let k = 0; k < count; k++) {
    const ang = offset + (k / count) * Math.PI * 2;
    if (skipFront && Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) < 0.3) continue;
    const g = petal(len, width, flare, rise, cup);
    m.makeRotationY(ang).setPosition(Math.sin(ang) * r0, y0, Math.cos(ang) * r0);
    g.applyMatrix4(m);
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

/** The view through the moon gate: a nebula with a bright core and stars. */
function spaceTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(150, 110, 8, 128, 128, 140);
  grad.addColorStop(0, '#fff6ff');
  grad.addColorStop(0.18, '#9fe8ff');
  grad.addColorStop(0.45, '#7a4fe0');
  grad.addColorStop(0.8, '#2a1060');
  grad.addColorStop(1, '#10062a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  let r = 9;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`;
    const s = rnd() < 0.1 ? 3 : 1.5;
    g.fillRect(rnd() * 256, rnd() * 256, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function spaceChakra(): ArcadeBuild {
  const group = new THREE.Group();
  const neon: THREE.MeshStandardMaterial[] = [];
  const stone = plastic('#e9e2d4', { rough: 0.85 });
  const gold = new THREE.MeshStandardMaterial({ color: '#e8b84a', roughness: 0.4, metalness: 0.25 });

  const solid = new Batch();
  // Plinth: two shallow stone steps.
  solid.add(new THREE.CylinderGeometry(5.0, 5.15, 0.18, 64), stone, 0, 0.09, 0);
  solid.add(new THREE.CylinderGeometry(4.3, 4.4, 0.18, 64), stone, 0, 0.27, 0);

  // The observatory drum: deep indigo glass with a gold cornice.
  const glass = new THREE.MeshStandardMaterial({ color: '#241a5c', roughness: 0.12, metalness: 0.35, emissive: new THREE.Color('#3b2a9a'), emissiveIntensity: 0.15 });
  group.add(mesh(cached('sc-drum', () => new THREE.CylinderGeometry(2.5, 2.7, 5.2, 48)), glass, 0, 0.36 + 2.6, 0));
  solid.add(new THREE.TorusGeometry(2.55, 0.12, 10, 64), gold, 0, 5.56, 0, Math.PI / 2);

  // Lotus: an outer ring open at the front for the gate, and an inner ring above the door.
  const petalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, emissive: new THREE.Color('#ffe0ea'), emissiveIntensity: 0.12 });
  const outer = new THREE.Mesh(cached('sc-outer', () => petalRing(8, true, 2.4, 0.3, 5.0, 3.3, 2.3, 4.7, 0.55, 0)), petalMat);
  const inner = new THREE.Mesh(cached('sc-inner', () => petalRing(8, false, 1.9, 3.5, 3.6, 2.4, 1.1, 3.9, 0.4, Math.PI / 8)), petalMat);
  // Thin double-sided shells: casting is fine, receiving makes them blotchy.
  outer.castShadow = inner.castShadow = true;
  group.add(outer, inner);

  // Moon gate on the drum, and a gold gateway carrying the sign in front of it.
  // The gate stands proud of the drum so the two surfaces never meet.
  solid.add(new THREE.TorusGeometry(1.45, 0.13, 12, 64), gold, 0, 1.85, 2.86);
  const portalMat = new THREE.MeshBasicMaterial({ map: spaceTexture() });
  group.add(mesh(cached('sc-portal', () => new THREE.CircleGeometry(1.36, 48)), portalMat, 0, 1.85, 2.8, { cast: false }));
  for (const sx of [-1, 1]) {
    solid.add(new THREE.CylinderGeometry(0.13, 0.17, 4.6, 16), gold, sx * 2.2, 0.36 + 2.3, 4.1);
    solid.add(new THREE.SphereGeometry(0.22, 16, 12), gold, sx * 2.2, 5.1, 4.1);
  }
  solid.add(roundBox(4.9, 0.16, 0.3, 0.05), gold, 0, 4.88, 4.1);
  const s = sign('SPACECHAKRA', 4.3, 0.95, { bg: '#1c1440', fg: '#ffe7fb', glow: '#ff6bd6', sub: 'ARCADE  ·  spacechakra.com', subColor: '#9fe8ff', border: '#d9a838', radius: 0.12 }, 0.6);
  s.position.set(0, 4.25, 4.12);
  group.add(s);

  // The spine and seven chakra rings, root to crown, each with a small orbiting world.
  solid.add(new THREE.CylinderGeometry(0.12, 0.34, 13.2, 16), gold, 0, 5.6 + 6.6, 0);
  solid.build(group);
  const chakras = ['#ff4d5e', '#ff9a3c', '#ffd24a', '#3fd68b', '#45b8ff', '#6a5cff', '#c77dff'];
  const rings: { pivot: THREE.Group; speed: number }[] = [];
  const ringMats: THREE.MeshStandardMaterial[] = [];
  chakras.forEach((c, i) => {
    const pivot = new THREE.Group();
    const y = 7.0 + i * 1.45;
    const R = 3.1 - i * 0.33;
    pivot.position.set(0, y, 0);
    pivot.rotation.z = (i % 2 ? 1 : -1) * (0.12 + i * 0.015);
    // A dark body with a coloured glow keeps the rings saturated instead of washing out at night.
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(0.35), emissive: new THREE.Color(c), emissiveIntensity: 0.6, roughness: 0.35 });
    ringMats.push(m);
    const ringAndWorld = new Batch();
    ringAndWorld.add(new THREE.TorusGeometry(R, 0.075 + (6 - i) * 0.01, 10, 72), m, 0, 0, 0, Math.PI / 2);
    ringAndWorld.add(new THREE.SphereGeometry(0.2, 16, 12), m, R, 0, 0);
    ringAndWorld.build(pivot, false);
    group.add(pivot);
    rings.push({ pivot, speed: (i % 2 ? -1 : 1) * (0.25 + i * 0.06) });
  });
  const crystalMat = glowMat('#f3e9ff', 1.0);
  neon.push(crystalMat);
  const crystal = mesh(cached('sc-crystal', () => new THREE.OctahedronGeometry(0.75, 0).scale(1, 1.7, 1)), crystalMat, 0, 19.6, 0);
  group.add(crystal);

  return {
    group,
    colliders: [
      // The whole plinth, so nobody stands half inside its steps.
      { kind: 'circle', x: 0, z: 0, r: 5.15, h: 8 },
    ],
    animate(t, night) {
      setGlow(neon, night);
      for (const r of rings) r.pivot.rotation.y = t * r.speed;
      crystal.rotation.y = t * 0.5;
      crystal.position.y = 19.6 + Math.sin(t * 0.9) * 0.18;
      // Petals catch a little of the rings' light after dark; the drum glows from inside.
      petalMat.emissiveIntensity = 0.12 + night * 0.1;
      glass.emissiveIntensity = 0.15 + night * 0.4;
      for (const m of ringMats) m.emissiveIntensity = 0.6 + night * 0.5;
    },
  };
}

// ---------------------------------------------------------------------------
// VibeCoded Games: the Stack

const SYNTAX = ['#2ee6d6', '#ff3d8b', '#ffd24a', '#9b7bff', '#7cf08c', '#f3efe4'];

/** A code minimap: rows of coloured token bars, indented, tiled vertically so it can scroll. */
function codeTexture(seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0d1428';
  g.fillRect(0, 0, 256, 512);
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  let indent = 0;
  for (let y = 10; y < 512; y += 18) {
    if (rnd() < 0.12) continue;
    indent = Math.max(0, Math.min(4, indent + (rnd() < 0.3 ? 1 : rnd() < 0.3 ? -1 : 0)));
    let x = 14 + indent * 18;
    const tokens = 1 + Math.floor(rnd() * 5);
    for (let k = 0; k < tokens && x < 240; k++) {
      const w = 14 + rnd() * 52;
      g.fillStyle = SYNTAX[Math.floor(rnd() * SYNTAX.length)];
      g.globalAlpha = 0.75 + rnd() * 0.25;
      g.fillRect(x, y, Math.min(w, 244 - x), 8);
      x += w + 8;
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function vibeCoded(): ArcadeBuild {
  const group = new THREE.Group();
  const neon: THREE.MeshStandardMaterial[] = [];
  // Pale stone that stays light in shade.
  const concrete = new THREE.MeshStandardMaterial({ color: '#efeae0', roughness: 0.85, emissive: new THREE.Color('#fff8ec'), emissiveIntensity: 0.1 });
  const podiumMat = plastic('#c9c4ba', { rough: 0.9 });

  const solid = new Batch();
  const lit = new Batch();

  // Podium and a recessed glass lobby.
  solid.add(roundBox(10.8, 0.3, 7.6, 0.04), podiumMat, 0, 0.15, 0);
  const lobbyGlass = new THREE.MeshStandardMaterial({ color: '#16233f', roughness: 0.1, metalness: 0.4, emissive: new THREE.Color('#1d5f78'), emissiveIntensity: 0.3 });
  solid.add(roundBox(8.6, 3.2, 5.6, 0.04), lobbyGlass, 0, 0.3 + 1.6, -0.4);
  for (const sx of [-1, 1]) solid.add(roundBox(0.35, 3.2, 0.35, 0.03), concrete, sx * 4.1, 1.9, 2.3);

  // The stack: slabs shifted like indented lines, each with an edge light and a code screen.
  const slabs: [number, number, number, number, number][] = [
    // width, depth, x, z, turn
    [10.2, 6.6, 0, 0, 0],
    [8.4, 6.0, 1.3, -0.2, 0.05],
    [7.2, 5.6, 2.3, -0.3, -0.04],
    [8.0, 5.2, 0.9, -0.4, 0.08],
    [6.4, 4.8, -0.6, -0.5, -0.06],
    [5.2, 4.4, 0.5, -0.6, 0.03],
  ];
  const edges = SYNTAX.slice(0, 4).map((c) => {
    const m = glowMat(c, 0.8);
    neon.push(m);
    return m;
  });
  const screens: THREE.CanvasTexture[] = [];
  const screenMats: THREE.MeshStandardMaterial[] = [];
  const at = (frame: THREE.Matrix4, x: number, y: number, z: number) => frame.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
  let top = 3.5;
  slabs.forEach(([w, d, x, z, turn], i) => {
    const h = 1.9;
    const frame = new THREE.Matrix4().makeRotationY(turn).setPosition(x, top + h / 2, z);
    // Each slab floats on a recessed light line, a reveal, so no two faces share a plane.
    const R = 0.14;
    solid.addMatrix(roundBox(w, h - R, d, 0.05), concrete, at(frame, 0, R / 2, 0));
    // The reveal is a ring just inside the slab's edge: a lit line from the side, concrete from below.
    const iw = w - 0.5;
    const id = d - 0.5;
    const band = 0.16;
    for (const [bw, bd, bx, bz] of [
      [iw, band, 0, id / 2 - band / 2],
      [iw, band, 0, -id / 2 + band / 2],
      [band, id - band * 2, iw / 2 - band / 2, 0],
      [band, id - band * 2, -iw / 2 + band / 2, 0],
    ] as const)
      lit.addMatrix(roundBox(bw, R + 0.02, bd, 0.02), edges[i % 4], at(frame, bx, -h / 2 + R / 2, bz));
    if (i > 0) {
      const tex = codeTexture(31 + i * 97);
      tex.repeat.set(1, 0.5);
      screens.push(tex);
      const sm = new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.5, roughness: 0.3 });
      screenMats.push(sm);
      const sw = w * 0.72;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, h * 0.62), sm);
      screen.applyMatrix4(at(frame, -w / 2 + sw / 2 + 0.35, 0.05, d / 2 + 0.02));
      group.add(screen);
    }
    top += h + 0.08;
  });

  // The sign on the first slab, above the lobby.
  const s = sign('VIBECODED GAMES', 8.2, 1.3, { bg: '#12183a', fg: '#fffaf0', glow: '#2ee6d6', sub: 'vibecoded.games', subColor: '#ffd24a', border: '#2ee6d6', radius: 0.12 }, 0.6);
  s.position.set(0, 3.5 + 0.95, 3.32);
  group.add(s);

  // A blinking cursor at the end of the last line.
  const cursorMat = glowMat('#f3efe4', 1.1);
  neon.push(cursorMat);
  const last = slabs[slabs.length - 1];
  const cursor = mesh(roundBox(0.45, 2.8, 0.45, 0.04), cursorMat, last[2] + last[0] / 2 - 0.6, top + 1.4, last[3] + 0.6);
  group.add(cursor);

  // The way in: a huge < > around the door, pointing outwards and open towards it,
  // leaving a 3 m way in between the arms.
  const tealMat = glowMat('#2ee6d6', 0.7);
  const pinkMat = glowMat('#ff3d8b', 0.7);
  neon.push(tealMat, pinkMat);
  const len = 2.4;
  const ang = 0.75;
  for (const [dir, bx, mat] of [
    [1, -3.14, tealMat],
    [-1, 3.14, pinkMat],
  ] as const)
    for (const sy of [1, -1]) lit.add(roundBox(0.55, len, 0.55, 0.06), mat, bx + (dir * Math.sin(ang) * len) / 2, 1.85 + (sy * Math.cos(ang) * len) / 2, 4.35, 0, 0, -dir * sy * ang);
  const doorMat = glowMat('#8ff5ea', 0.8);
  neon.push(doorMat);
  const doorGlass = new THREE.MeshStandardMaterial({ color: '#0e2233', roughness: 0.08, metalness: 0.5, emissive: new THREE.Color('#2ee6d6'), emissiveIntensity: 0.12 });
  solid.add(roundBox(2.2, 2.8, 0.08, 0.02), doorGlass, 0, 1.7, 2.42);
  for (const [w, h2, x, y] of [
    [2.4, 0.12, 0, 3.12],
    [0.12, 2.9, -1.14, 1.72],
    [0.12, 2.9, 1.14, 1.72],
    [0.06, 2.6, 0, 1.7],
  ] as const)
    lit.add(roundBox(w, h2, 0.14, 0.02), doorMat, x, y, 2.47);
  solid.build(group);
  lit.build(group, false);

  return {
    group,
    colliders: [
      { kind: 'box', x: 0, z: 0, hw: 5.4, hd: 3.8, rot: 0, h: 8 },
      { kind: 'box', x: -2.32, z: 4.35, hw: 0.84, hd: 0.35, rot: 0, h: 4 },
      { kind: 'box', x: 2.32, z: 4.35, hw: 0.84, hd: 0.35, rot: 0, h: 4 },
    ],
    animate(t, night) {
      setGlow(neon, night);
      screens.forEach((tex, i) => (tex.offset.y = (t * (0.02 + i * 0.006)) % 1));
      for (const m of screenMats) m.emissiveIntensity = 0.5 + night * 0.9;
      lobbyGlass.emissiveIntensity = 0.3 + night * 0.5;
      cursor.visible = t % 1.1 < 0.6;
    },
  };
}
