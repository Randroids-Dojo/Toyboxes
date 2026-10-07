// The player's look and moves in Club Nova: a library of dance moves and
// blade poses driven through the avatar's PoseFn, glow suits hung on the
// avatar's bones, the prism blade and the toy blaster.

import * as THREE from 'three';
import type { AvatarBones, PoseFn } from '../../world/avatar';
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

/** A prism blade: hilt, a glowing blade and a halo. Points up its local +y. */
export function prismBlade(color: number, len = 1.0): THREE.Group {
  const g = new THREE.Group();
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0x2a2440, roughness: 0.3, metalness: 0.7 }));
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 6, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2) }));
  guard.rotation.x = Math.PI / 2;
  guard.position.y = 0.11;
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, len, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55).multiplyScalar(2.6) }));
  blade.position.y = 0.12 + len / 2;
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, len + 0.06, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.y = blade.position.y;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(0.5, len * 1.3, 1);
  halo.position.y = blade.position.y;
  g.add(hilt, guard, blade, glow, halo);
  g.userData.blade = blade;
  g.userData.color = color;
  return g;
}

/** Points a blade held in the avatar's hand forward along the arm. */
export function inHand(blade: THREE.Object3D): THREE.Object3D {
  const holder = new THREE.Group();
  blade.rotation.x = Math.PI;
  holder.add(blade);
  return holder;
}

/** The toy blaster for laser tag. */
export function blaster(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a2450, roughness: 0.35, metalness: 0.3 }));
  body.position.set(0, -0.02, 0.1);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2) }));
  tip.rotation.x = Math.PI / 2;
  tip.position.set(0, 0, 0.3);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.025, 0.24), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.8) }));
  strip.position.set(0, 0.035, 0.1);
  g.add(body, tip, strip);
  g.rotation.x = Math.PI / 2;
  return g;
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
  private parts: { obj: THREE.Object3D; parent: THREE.Object3D }[] = [];
  private mats: THREE.MeshBasicMaterial[] = [];
  private suit: SuitId = 'starter';
  private glow = 1;
  private helmet = false;

  constructor(private bones: () => AvatarBones) {}

  wear(suit: SuitId, helmet = false): void {
    this.remove();
    this.suit = suit;
    this.helmet = helmet;
    const b = this.bones();
    const [c1, c2] = SUIT_COLORS[suit];
    const m1 = new THREE.MeshBasicMaterial({ color: new THREE.Color(c1).multiplyScalar(2) });
    const m2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(c2).multiplyScalar(2) });
    this.mats = [m1, m2];
    const add = (obj: THREE.Object3D, parent: THREE.Object3D) => {
      parent.add(obj);
      this.parts.push({ obj, parent });
    };
    // Belt and collar around the torso.
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.02, 6, 28), m1);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1, 0.68, 1);
    belt.position.y = -0.2;
    add(belt, b.torso);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.02), suit === 'retro' ? m2 : m1);
    chest.position.set(0, 0.02, 0.172);
    add(chest, b.torso);
    if (suit === 'retro' || suit === 'circuit' || suit === 'supernova') {
      for (const s of [-1, 1]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.02), m2);
        stripe.position.set(s * 0.13, 0, 0.17);
        stripe.rotation.z = suit === 'circuit' ? s * 0.3 : 0;
        add(stripe, b.torso);
      }
    }
    // Cuffs on the arms and stripes down the legs.
    for (const arm of [b.armL, b.armR]) {
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.016, 6, 16), m2);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.34;
      add(cuff, arm);
    }
    for (const leg of [b.legL, b.legR]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.42, 0.02), m1);
      stripe.position.set(0, -0.24, 0.095);
      add(stripe, leg);
      const ankle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.016, 6, 16), m2);
      ankle.rotation.x = Math.PI / 2;
      ankle.position.y = -0.44;
      add(ankle, leg);
    }
    if (suit === 'supernova') {
      const plate = new THREE.Mesh(new THREE.CircleGeometry(0.22, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.gold).multiplyScalar(1.6), side: THREE.DoubleSide }));
      plate.position.set(0, 0.06, -0.175);
      add(plate, b.torso);
    }
    if (suit === 'mirror') {
      const sequins = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.1, flatShading: true }));
      sequins.position.set(0.1, 0.12, 0.17);
      add(sequins, b.torso);
    }
    if (helmet) {
      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.31, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshStandardMaterial({ color: 0x8a7cff, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.4, depthWrite: false }));
      visor.position.y = 0.02;
      add(visor, b.head);
      const ant = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), m2);
      ant.position.set(0, 0.36, 0);
      add(ant, b.head);
    }
  }

  /** Brightness: 0 tagged out, 1 normal, more on Perfects. */
  setGlow(v: number): void {
    this.glow = v;
  }

  update(dt: number, time: number, beat: number): void {
    const [c1, c2] = SUIT_COLORS[this.suit];
    const ph = beat - Math.floor(beat);
    const k = (0.75 + 0.4 * Math.exp(-ph * 5)) * this.glow * 2;
    void dt;
    if (this.suit === 'nebula') {
      const h = (time * 0.15) % 1;
      this.mats[0]?.color.setHSL(0.72 + Math.sin(time) * 0.08, 1, 0.55).multiplyScalar(k);
      this.mats[1]?.color.setHSL((h + 0.85) % 1, 1, 0.6).multiplyScalar(k);
    } else {
      this.mats[0]?.color.setHex(c1).multiplyScalar(k);
      this.mats[1]?.color.setHex(c2).multiplyScalar(k);
    }
  }

  get current(): { suit: SuitId; helmet: boolean } {
    return { suit: this.suit, helmet: this.helmet };
  }

  remove(): void {
    for (const p of this.parts) {
      p.parent.remove(p.obj);
      p.obj.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
        }
      });
    }
    for (const m of this.mats) m.dispose();
    this.parts = [];
    this.mats = [];
  }
}
