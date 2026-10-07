// The player's look and moves in Club Nova: a library of dance moves and
// blade poses driven through the avatar's PoseFn, glow suits hung on the
// avatar's bones, the prism blade and the toy blaster.

import * as THREE from 'three';
import type { AvatarBones, PoseFn } from '../../world/avatar';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { C, haloTexture } from './util';

// ---------------------------------------------------------------------------
// Moves

export type MoveId =
  | 'point'
  | 'clap'
  | 'step'
  | 'wave'
  | 'spin'
  | 'robot'
  | 'jump'
  | 'slide'
  | 'pump'
  | 'twist'
  | 'star'
  | 'shuffle'
  | 'swing'
  | 'shimmy'
  | 'kick'
  | 'bow'
  | 'cheer'
  | 'glide';

/** Moves for ordinary hits, cycled so a phrase looks like a routine. */
export const HIT_MOVES: MoveId[] = ['step', 'clap', 'point', 'pump', 'shuffle', 'wave', 'twist', 'robot', 'swing', 'shimmy', 'slide', 'kick'];
export const FREESTYLE: Record<'up' | 'down' | 'left' | 'right', MoveId> = { up: 'jump', down: 'robot', left: 'slide', right: 'spin' };

const ease = (k: number) => Math.sin(Math.min(1, Math.max(0, k)) * Math.PI);
const out = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

function applyMove(b: AvatarBones, m: MoveId, k: number, side: number): void {
  const e = ease(k);
  const o = out(k * 2);
  switch (m) {
    case 'point':
      b.armR.rotation.set(-2.6 * o, 0, -0.5 * side);
      b.armL.rotation.set(0.3, 0, 0.9 * o);
      b.rig.rotation.z = 0.12 * e * side;
      b.legR.rotation.z = -0.25 * e;
      b.head.rotation.z = 0.2 * e;
      break;
    case 'clap': {
      const c = Math.abs(Math.sin(k * Math.PI * 2));
      b.armL.rotation.set(-2.7, 0, 0.5 * c + 0.1);
      b.armR.rotation.set(-2.7, 0, -0.5 * c - 0.1);
      b.rig.position.y = 0.06 * e;
      break;
    }
    case 'step':
      b.rig.position.x = 0.12 * side * e;
      b.legL.rotation.z = 0.35 * e * (side > 0 ? 1 : 0.3);
      b.legR.rotation.z = -0.35 * e * (side < 0 ? 1 : 0.3);
      b.armL.rotation.set(-0.8 * e, 0, 0.5);
      b.armR.rotation.set(-0.8 * e, 0, -0.5);
      b.rig.rotation.y = 0.3 * side * e;
      break;
    case 'wave': {
      const w = Math.sin(k * Math.PI * 4);
      b.armR.rotation.set(-2.9 * o, 0, -0.3 + w * 0.4);
      b.armL.rotation.set(-2.9 * o, 0, 0.3 + w * 0.4);
      b.rig.rotation.z = w * 0.08;
      break;
    }
    case 'spin':
      b.rig.rotation.y = out(k) * Math.PI * 2 * side;
      b.armL.rotation.set(0, 0, 1.4 * e);
      b.armR.rotation.set(0, 0, -1.4 * e);
      b.rig.position.y = 0.05 * e;
      break;
    case 'robot':
      b.armL.rotation.set(-1.57 * o, 0, 0);
      b.armR.rotation.set(k < 0.5 ? 0 : -1.57, 0, 0);
      b.head.rotation.y = k < 0.5 ? 0.5 : -0.5;
      b.rig.rotation.y = k < 0.5 ? 0.2 : -0.2;
      break;
    case 'jump':
      b.rig.position.y = 0.38 * e;
      b.armL.rotation.set(-2.8 * e, 0, 0.6);
      b.armR.rotation.set(-2.8 * e, 0, -0.6);
      b.legL.rotation.x = -0.7 * e;
      b.legR.rotation.x = -0.2 * e;
      break;
    case 'slide':
      b.rig.position.x = 0.25 * side * e;
      b.rig.rotation.z = -0.25 * side * e;
      b.armL.rotation.set(0, 0, 1.5 * e);
      b.armR.rotation.set(0, 0, -1.5 * e);
      b.legL.rotation.z = 0.4 * e;
      b.legR.rotation.z = -0.4 * e;
      break;
    case 'pump': {
      const p = Math.abs(Math.sin(k * Math.PI * 2));
      b.armR.rotation.set(-2.2 - p * 0.6, 0, -0.2);
      b.armL.rotation.set(-0.5, 0, 0.3);
      b.rig.position.y = 0.08 * p;
      b.head.rotation.x = -0.15 * p;
      break;
    }
    case 'twist': {
      const t = Math.sin(k * Math.PI * 2);
      b.rig.rotation.y = 0.5 * t;
      b.legL.rotation.y = -0.4 * t;
      b.legR.rotation.y = -0.4 * t;
      b.armL.rotation.set(-1.0, 0, 0.6);
      b.armR.rotation.set(-1.0, 0, -0.6);
      b.rig.position.y = -0.06 * e;
      break;
    }
    case 'star':
      b.armL.rotation.set(0, 0, 2.3 * o);
      b.armR.rotation.set(0, 0, -2.3 * o);
      b.legL.rotation.z = 0.45 * o;
      b.legR.rotation.z = -0.45 * o;
      b.rig.position.y = 0.2 * e;
      b.head.rotation.x = -0.25 * o;
      break;
    case 'shuffle': {
      const s = Math.sin(k * Math.PI * 2);
      b.legL.rotation.x = 0.5 * s;
      b.legR.rotation.x = -0.5 * s;
      b.armL.rotation.set(-0.6 * s, 0, 0.3);
      b.armR.rotation.set(0.6 * s, 0, -0.3);
      b.rig.position.x = 0.08 * s;
      break;
    }
    case 'swing': {
      const s = Math.sin(k * Math.PI * 2);
      b.armL.rotation.set(-1.2 + s, 0, 0.4);
      b.armR.rotation.set(-1.2 - s, 0, -0.4);
      b.rig.rotation.z = 0.1 * s;
      break;
    }
    case 'shimmy': {
      const s = Math.sin(k * Math.PI * 8) * e;
      b.armL.rotation.set(-0.3, 0, 0.9);
      b.armR.rotation.set(-0.3, 0, -0.9);
      b.rig.rotation.y = 0.18 * s;
      b.rig.position.y = -0.05 * e;
      break;
    }
    case 'kick':
      b.legR.rotation.x = -1.4 * e;
      b.armL.rotation.set(-1.2 * e, 0, 0.4);
      b.armR.rotation.set(0.4 * e, 0, -0.6);
      b.rig.rotation.x = 0.1 * e;
      break;
    case 'bow':
      b.rig.rotation.x = 0.6 * o;
      b.armR.rotation.set(-1.2 * o, 0, 0.4);
      b.armL.rotation.set(0.5 * o, 0, 0.3);
      b.head.rotation.x = 0.3 * o;
      break;
    case 'cheer': {
      const c = Math.sin(k * Math.PI * 6);
      b.armL.rotation.set(-2.9 + c * 0.2, 0, 0.35);
      b.armR.rotation.set(-2.9 - c * 0.2, 0, -0.35);
      b.rig.position.y = Math.max(0, Math.sin(k * Math.PI * 4)) * 0.18;
      break;
    }
    case 'glide':
      b.rig.position.x = Math.sin(k * Math.PI * 2) * 0.3;
      b.legL.rotation.x = Math.sin(k * Math.PI * 4) * 0.4;
      b.legR.rotation.x = -Math.sin(k * Math.PI * 4) * 0.4;
      b.armL.rotation.set(-0.4, 0, 0.8);
      b.armR.rotation.set(0.3, 0, -0.5);
      b.rig.rotation.z = Math.sin(k * Math.PI * 2) * 0.12;
      break;
  }
}

/** A groove bounce on the beat, under the moves. */
function groove(b: AvatarBones, beat: number, amount: number): void {
  const ph = beat - Math.floor(beat);
  const bob = Math.exp(-ph * 5) * 0.06 * amount;
  b.rig.position.y += bob - 0.03 * amount;
  b.legL.rotation.x += -0.12 * amount * Math.exp(-ph * 5);
  b.legR.rotation.x += -0.12 * amount * Math.exp(-ph * 5);
  b.head.rotation.x += Math.exp(-ph * 6) * 0.12 * amount;
  const sway = Math.sin(beat * Math.PI) * 0.06 * amount;
  b.rig.rotation.z += sway;
  b.armL.rotation.z += 0.15 * amount;
  b.armR.rotation.z -= 0.15 * amount;
  b.armL.rotation.x += Math.sin(beat * Math.PI) * 0.25 * amount;
  b.armR.rotation.x -= Math.sin(beat * Math.PI) * 0.25 * amount;
}

/**
 * Drives the avatar from the beat: a groove bounce plus the latest move.
 * Hand the `pose` to ctx.pose while dancing.
 */
export class Dancer {
  private move: MoveId | null = null;
  private moveAt = 0;
  private moveLen = 0.5;
  private side = 1;
  private hold: MoveId | null = null;
  private next = 0;
  /** Beat getter (the clock's draw beat). */
  beat: () => number = () => 0;
  /** 0 standing still, 1 dancing. */
  energy = 1;
  reduceMotion = false;
  /** Wobble after a miss. */
  private wobble = 0;
  private time = 0;

  readonly pose: PoseFn = (b, _t, dt) => {
    this.time += dt;
    this.wobble = Math.max(0, this.wobble - dt * 2);
    const beat = this.beat();
    groove(b, beat, this.energy * (this.reduceMotion ? 0.4 : 1));
    if (this.hold) {
      applyMove(b, this.hold, (this.time * 0.8) % 1, this.side);
    } else if (this.move) {
      const k = (this.time - this.moveAt) / this.moveLen;
      if (k >= 1) this.move = null;
      else applyMove(b, this.move, k, this.side);
    }
    if (this.wobble > 0) {
      b.rig.rotation.z += Math.sin(this.time * 30) * 0.08 * this.wobble;
      b.head.rotation.z += Math.sin(this.time * 24) * 0.2 * this.wobble;
    }
  };

  /** Plays a move now, over `seconds`. */
  play(m: MoveId, seconds = 0.5): void {
    this.move = m;
    this.moveAt = this.time;
    this.moveLen = seconds;
    this.side = -this.side;
  }

  /** The next move of the routine. */
  hit(seconds = 0.45): MoveId {
    const m = HIT_MOVES[this.next++ % HIT_MOVES.length];
    this.play(m, seconds);
    return m;
  }

  holdMove(m: MoveId | null): void {
    this.hold = m;
  }

  stumble(): void {
    this.wobble = 1;
  }
}

// ---------------------------------------------------------------------------
// Blade poses for duels: guard directions and strikes.

export type Dir = 'high' | 'low' | 'left' | 'right' | 'thrust';
export const DIRS: Dir[] = ['high', 'left', 'low', 'right', 'thrust'];

export class Fencer {
  private act: { kind: 'parry' | 'strike' | 'whiff' | 'bind' | 'push' | 'hit' | 'bow' | 'win'; dir: Dir; at: number } | null = null;
  private time = 0;
  beat: () => number = () => 0;

  readonly pose: PoseFn = (b, _t, dt) => {
    this.time += dt;
    const beat = this.beat();
    // Ready stance: side-on, blade forward, knees soft.
    b.rig.rotation.y = -0.5;
    b.rig.position.y = -0.06 + Math.exp(-(beat - Math.floor(beat)) * 5) * 0.03;
    b.legL.rotation.set(-0.35, 0, 0.18);
    b.legR.rotation.set(0.3, 0, -0.12);
    b.armR.rotation.set(-1.25, 0.2, -0.15);
    b.armL.rotation.set(-0.3, 0, 0.55);
    b.head.rotation.y = 0.45;
    const a = this.act;
    if (!a) return;
    const k = (this.time - a.at) / (a.kind === 'bind' ? 9 : a.kind === 'bow' || a.kind === 'win' ? 1.6 : 0.32);
    if (k >= 1 && a.kind !== 'bind' && a.kind !== 'bow' && a.kind !== 'win') {
      this.act = null;
      return;
    }
    const e = ease(Math.min(1, k));
    const o = out(Math.min(1, k * 2.5));
    switch (a.kind) {
      case 'parry': {
        const r = guardRot(a.dir);
        b.armR.rotation.set(-1.25 + (r[0] + 1.25) * o * (1 - Math.max(0, k - 0.6) * 2), r[1] * o, r[2] * o);
        b.rig.rotation.y = -0.5 + 0.2 * e;
        b.rig.position.x = -0.06 * e;
        break;
      }
      case 'strike': {
        const lunge = Math.sin(Math.min(1, k) * Math.PI);
        b.rig.position.z = 0.25 * lunge;
        b.legL.rotation.x = -0.8 * lunge;
        b.armR.rotation.set(-1.6 - 0.6 * lunge, 0, -0.4 * lunge);
        b.rig.rotation.y = -0.3;
        break;
      }
      case 'whiff':
        b.armR.rotation.set(-2.4 + 2.2 * o, 0, -0.6);
        b.rig.rotation.z = Math.sin(k * 20) * 0.08;
        break;
      case 'bind':
        b.armR.rotation.set(-1.7, 0, -0.1);
        b.armL.rotation.set(-1.5, 0, -0.6);
        b.rig.position.z = 0.08 + Math.sin(this.time * 40) * 0.01;
        b.legL.rotation.x = -0.6;
        b.legR.rotation.x = 0.5;
        break;
      case 'push':
        b.armR.rotation.set(-1.8, 0, -0.1);
        b.armL.rotation.set(-1.6, 0, -0.5);
        b.rig.position.z = 0.3 * ease(k);
        break;
      case 'hit':
        b.rig.rotation.x = -0.25 * e;
        b.rig.position.z = -0.15 * e;
        b.head.rotation.x = -0.3 * e;
        break;
      case 'bow':
        b.rig.rotation.y = 0;
        b.rig.rotation.x = 0.55 * out(Math.min(1, k));
        b.armR.rotation.set(-0.8, 0, 0.5);
        b.armL.rotation.set(0.3, 0, 0.2);
        b.head.rotation.y = 0;
        break;
      case 'win':
        b.rig.rotation.y = 0;
        b.armR.rotation.set(-2.9 * out(Math.min(1, k)), 0, -0.3);
        b.armL.rotation.set(0, 0, 0.9);
        b.head.rotation.y = 0;
        b.head.rotation.x = -0.2;
        break;
    }
  };

  play(kind: 'parry' | 'strike' | 'whiff' | 'bind' | 'push' | 'hit' | 'bow' | 'win', dir: Dir = 'high'): void {
    this.act = { kind, dir, at: this.time };
  }

  clear(): void {
    this.act = null;
  }
}

/** Arm rotation for a guard in each direction. */
export function guardRot(d: Dir): [number, number, number] {
  switch (d) {
    case 'high':
      return [-2.7, 0, -0.9];
    case 'low':
      return [-0.6, 0, -0.5];
    case 'left':
      return [-1.5, 0, 0.7];
    case 'right':
      return [-1.4, 0, -1.2];
    case 'thrust':
      return [-1.55, 0.5, 0];
  }
}

// ---------------------------------------------------------------------------
// Props

/** Paints a geometry with one vertex colour (so parts can share one material). */
function tint(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(k)) geo.deleteAttribute(k);
  return geo;
}


/** A prism blade: hilt, a glowing blade and a halo. Points up its local +y. Two draws (three with the halo). */
export function prismBlade(color: number, len = 1.0): THREE.Group {
  const g = new THREE.Group();
  const bright = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55).multiplyScalar(2.6);
  const body = mergeGeometries([
    tint(new THREE.CylinderGeometry(0.035, 0.04, 0.22, 10), new THREE.Color(0x2a2440)),
    tint(new THREE.TorusGeometry(0.06, 0.016, 6, 16).rotateX(Math.PI / 2).translate(0, 0.11, 0), new THREE.Color(color).multiplyScalar(2)),
    tint(new THREE.CylinderGeometry(0.022, 0.03, len, 10).translate(0, 0.12 + len / 2, 0), bright),
  ])!;
  const blade = new THREE.Mesh(body, new THREE.MeshBasicMaterial({ vertexColors: true }));
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, len + 0.06, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.y = 0.12 + len / 2;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(0.5, len * 1.3, 1);
  halo.position.y = glow.position.y;
  g.add(blade, glow, halo);
  g.userData.blade = blade;
  g.userData.color = color;
  // The prism blade cycles through the rainbow.
  if (color === 0xffffff) {
    const gm = glow.material as THREE.MeshBasicMaterial;
    const hm = halo.material as THREE.SpriteMaterial;
    glow.onBeforeRender = () => {
      const t = performance.now() / 1000;
      gm.color.setHSL((t * 0.4) % 1, 1, 0.55).multiplyScalar(1.8);
      hm.color.setHSL((t * 0.4) % 1, 1, 0.6);
    };
  }
  return g;
}

/** Points a blade held in the avatar's hand forward along the arm. */
export function inHand(blade: THREE.Object3D): THREE.Object3D {
  const holder = new THREE.Group();
  blade.rotation.x = Math.PI;
  holder.add(blade);
  return holder;
}

/** The toy blaster for laser tag: one mesh. */
export function blaster(color: number): THREE.Object3D {
  const c = new THREE.Color(color).multiplyScalar(2);
  const geo = mergeGeometries([
    tint(new THREE.BoxGeometry(0.1, 0.12, 0.3).translate(0, -0.02, 0.1), new THREE.Color(0x2a2450)),
    tint(new THREE.CylinderGeometry(0.035, 0.04, 0.12, 10).rotateX(Math.PI / 2).translate(0, 0, 0.3), c),
    tint(new THREE.BoxGeometry(0.105, 0.025, 0.24).translate(0, 0.035, 0.1), c),
  ])!;
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  m.rotation.x = Math.PI / 2;
  return m;
}

// ---------------------------------------------------------------------------
// Suits: glowing trims hung on the avatar's bones.

export type SuitId = 'starter' | 'retro' | 'circuit' | 'mirror' | 'nebula' | 'comet' | 'supernova';

const SUIT_COLORS: Record<SuitId, [number, number]> = {
  starter: [C.lilac, C.cyan],
  retro: [C.pink, C.cyan],
  circuit: [C.lime, C.cyan],
  mirror: [0xffffff, C.lilac],
  nebula: [C.uv, C.pink],
  comet: [C.cyan, C.white],
  supernova: [C.gold, C.white],
};

export class Outfit {
  /** Lower on the low tier (no bloom). */
  scale = 1;
  private parts: { obj: THREE.Object3D; parent: THREE.Object3D }[] = [];
  private mat: THREE.MeshBasicMaterial | null = null;
  private extraMats: THREE.Material[] = [];
  private suit: SuitId = 'starter';
  private glow = 1;
  private helmet = false;

  constructor(private bones: () => AvatarBones) {}

  /** Trims are merged per bone into one mesh each (vertex colours, one material). */
  wear(suit: SuitId, helmet = false): void {
    this.remove();
    this.suit = suit;
    this.helmet = helmet;
    const b = this.bones();
    const [c1, c2] = SUIT_COLORS[suit];
    const col1 = new THREE.Color(c1);
    const col2 = new THREE.Color(c2);
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2, 2, 2) });
    const perBone = new Map<THREE.Object3D, THREE.BufferGeometry[]>();
    const put = (bone: THREE.Object3D, g: THREE.BufferGeometry, c: THREE.Color) => {
      const list = perBone.get(bone) ?? [];
      list.push(tint(g, c));
      perBone.set(bone, list);
    };
    const add = (obj: THREE.Object3D, parent: THREE.Object3D) => {
      parent.add(obj);
      this.parts.push({ obj, parent });
    };
    // Belt and chest line on the torso.
    put(b.torso, new THREE.TorusGeometry(0.27, 0.02, 6, 28).rotateX(Math.PI / 2).scale(1, 1, 0.68).translate(0, -0.2, 0), col1);
    put(b.torso, new THREE.BoxGeometry(0.04, 0.4, 0.02).translate(0, 0.02, 0.172), suit === 'retro' ? col2 : col1);
    if (suit === 'retro' || suit === 'circuit' || suit === 'supernova') {
      for (const side of [-1, 1]) put(b.torso, new THREE.BoxGeometry(0.03, 0.42, 0.02).rotateZ(suit === 'circuit' ? side * 0.3 : 0).translate(side * 0.13, 0, 0.17), col2);
    }
    // Cuffs on the arms and stripes down the legs.
    for (const arm of [b.armL, b.armR]) put(arm, new THREE.TorusGeometry(0.08, 0.016, 6, 16).rotateX(Math.PI / 2).translate(0, -0.34, 0), col2);
    for (const leg of [b.legL, b.legR]) {
      put(leg, new THREE.BoxGeometry(0.02, 0.42, 0.02).translate(0, -0.24, 0.095), col1);
      put(leg, new THREE.TorusGeometry(0.1, 0.016, 6, 16).rotateX(Math.PI / 2).translate(0, -0.44, 0), col2);
    }
    if (helmet) put(b.head, new THREE.SphereGeometry(0.05, 8, 6).translate(0, 0.36, 0), col2);
    for (const [bone, list] of perBone) {
      const m = new THREE.Mesh(mergeGeometries(list)!, this.mat);
      for (const g of list) g.dispose();
      add(m, bone);
    }
    if (suit === 'supernova') {
      const pm = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.gold).multiplyScalar(1.6), side: THREE.DoubleSide });
      this.extraMats.push(pm);
      const plate = new THREE.Mesh(new THREE.CircleGeometry(0.22, 10), pm);
      plate.position.set(0, 0.06, -0.175);
      add(plate, b.torso);
    }
    if (suit === 'mirror') {
      const sm = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.1, flatShading: true });
      this.extraMats.push(sm);
      const sequins = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), sm);
      sequins.position.set(0.1, 0.12, 0.17);
      add(sequins, b.torso);
    }
    if (helmet) {
      const vm = new THREE.MeshStandardMaterial({ color: 0x8a7cff, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.4, depthWrite: false });
      this.extraMats.push(vm);
      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.31, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), vm);
      visor.position.y = 0.02;
      add(visor, b.head);
    }
  }

  /** Brightness: 0 tagged out, 1 normal, more on Perfects. */
  setGlow(v: number): void {
    this.glow = v;
  }

  update(dt: number, time: number, beat: number): void {
    if (!this.mat) return;
    const ph = beat - Math.floor(beat);
    const k = (0.75 + 0.4 * Math.exp(-ph * 5)) * this.glow * 2 * this.scale;
    if (this.suit === 'nebula') this.mat.color.setHSL((0.72 + Math.sin(time * 0.8) * 0.12 + 1) % 1, 0.6, 0.6).multiplyScalar(k * 1.6);
    else this.mat.color.setScalar(k);
    // A flash eases back to normal (dimming stays until set again).
    if (this.glow > 1) this.glow = Math.max(1, this.glow - dt * 2);
  }

  get current(): { suit: SuitId; helmet: boolean } {
    return { suit: this.suit, helmet: this.helmet };
  }

  remove(): void {
    for (const p of this.parts) {
      p.parent.remove(p.obj);
      if (p.obj instanceof THREE.Mesh) p.obj.geometry.dispose();
    }
    this.mat?.dispose();
    for (const m of this.extraMats) m.dispose();
    this.mat = null;
    this.extraMats = [];
    this.parts = [];
  }
}
