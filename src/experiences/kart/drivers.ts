// The computer drivers: seven toy characters who sit in their karts, steer
// with both hands, look into corners, cheer, sulk and get dizzy. Each one is
// merged into six draw calls (body, head, eyes, a wiggling part, two arms).

import * as THREE from 'three';
import type { BodyId } from '../../shared/kart/rules';
import { Shape, ball, cone, cyl, rbox, torus } from './build/shape';

export type DriverKind = 'robot' | 'frog' | 'cat' | 'duck' | 'dino' | 'octopus' | 'bear';

export interface DriverDef {
  id: string;
  kind: DriverKind;
  name: string;
  /** Who they are, in a few words, for menus. */
  tag: string;
  /** Kart paint. */
  kart: string;
  body: BodyId;
  /** Share of top speed on the straights. */
  skill: number;
  /** How hard it brakes for corners: higher carries more speed. */
  nerve: number;
  /** Favourite side of the road, metres (left positive). */
  lane: number;
  /** How readily it dives for a gap or a boost pad, 0..1. */
  daring: number;
  /** How it uses items. */
  items: 'patient' | 'eager' | 'marbles' | 'defensive' | 'aggressive' | 'juggler' | 'fair';
  /** How much its line wanders, metres. */
  wander: number;
}

export const DRIVERS: DriverDef[] = [
  { id: 'bolt', kind: 'robot', name: 'Bolt', tag: 'Robot. Takes the perfect line.', kart: '#7d8aa3', body: 'chunky', skill: 0.97, nerve: 0.99, lane: 0.6, daring: 0.5, items: 'patient', wander: 0.1 },
  { id: 'hopper', kind: 'frog', name: 'Hopper', tag: 'Frog guy. Dives for every gap.', kart: '#3fb68b', body: 'zippy', skill: 0.96, nerve: 1.0, lane: -1.4, daring: 0.9, items: 'eager', wander: 0.3 },
  { id: 'mittens', kind: 'cat', name: 'Mittens', tag: 'Cat in goggles. Brakes late.', kart: '#ef6fa0', body: 'zippy', skill: 0.95, nerve: 0.99, lane: 1.6, daring: 0.7, items: 'marbles', wander: 0.2 },
  { id: 'puddles', kind: 'duck', name: 'Puddles', tag: 'Duck in a sailor cap. Steady.', kart: '#f4b740', body: 'classic', skill: 0.935, nerve: 0.95, lane: -0.4, daring: 0.3, items: 'defensive', wander: 0.15 },
  { id: 'stomp', kind: 'dino', name: 'Stomp', tag: 'Little dino. Loves a bump.', kart: '#8a6bd1', body: 'chunky', skill: 0.955, nerve: 0.99, lane: 1.0, daring: 0.8, items: 'aggressive', wander: 0.25 },
  { id: 'ink', kind: 'octopus', name: 'Ink', tag: 'Octopus. Nobody knows her line.', kart: '#5b6ee1', body: 'classic', skill: 0.95, nerve: 0.98, lane: -1.0, daring: 0.6, items: 'juggler', wander: 0.9 },
  { id: 'barnaby', kind: 'bear', name: 'Barnaby', tag: 'Teddy bear. The champion.', kart: '#f5c542', body: 'classic', skill: 0.985, nerve: 1.01, lane: 0.2, daring: 0.55, items: 'fair', wander: 0.05 },
];

export function driverById(id: string): DriverDef | undefined {
  return DRIVERS.find((d) => d.id === id);
}

export type Mood = 'drive' | 'cheer' | 'sulk' | 'dizzy' | 'wave';

const SKIN: Record<DriverKind, string> = { robot: '#aab4c6', frog: '#5cbf63', cat: '#f2994a', duck: '#ffd24a', dino: '#ef6f5a', octopus: '#ff7f9e', bear: '#b07a52' };
const BELLY: Record<DriverKind, string> = { robot: '#5d6a82', frog: '#e9f2b8', cat: '#fff3e0', duck: '#fff3c4', dino: '#ffd9a8', octopus: '#ffc2d2', bear: '#f2d6b0' };
/** Head height above the seat, so tall heads still clear the kart. */
const HEAD_Y = 0.82;

function eyesInto(s: Shape, r: number, spread: number, y: number, z: number, pupil = '#1d1830'): void {
  for (const sx of [-1, 1]) {
    s.at(ball(r, 12, 10), '#fffaf0', sx * spread, y, z);
    s.at(ball(r * 0.52, 10, 8), pupil, sx * spread, y + r * 0.08, z + r * 0.6);
    s.at(ball(r * 0.16, 6, 5), '#ffffff', sx * spread + r * 0.18, y + r * 0.3, z + r * 0.85);
  }
}

export class Driver {
  readonly root = new THREE.Group();
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private wiggle = new THREE.Group();
  private eyes: THREE.Mesh;
  private stars: THREE.Group;
  private time = Math.random() * 10;
  private nextBlink = 2 + Math.random() * 3;
  readonly meshes: THREE.Mesh[] = [];

  constructor(readonly def: DriverDef) {
    const k = def.kind;
    const skin = SKIN[k];
    const belly = BELLY[k];
    // ---- Body: hips on the seat, legs forward under the dash.
    const body = new Shape();
    if (k === 'robot') {
      body.at(rbox(0.5, 0.48, 0.34, 0.07), skin, 0, 0.4, 0);
      body.at(rbox(0.3, 0.2, 0.04, 0.02), belly, 0, 0.42, 0.17);
      body.at(ball(0.035, 8, 6), '#ff5a4a', -0.07, 0.46, 0.195);
      body.at(ball(0.035, 8, 6), '#3fe07a', 0.07, 0.46, 0.195);
    } else {
      body.at(ball(0.29, 14, 10), skin, 0, 0.38, 0, 0, 0, 0, 1, 1.05, 0.82);
      body.at(ball(0.2, 12, 9), belly, 0, 0.35, 0.12, 0, 0, 0, 1, 1.1, 0.6);
    }
    if (k === 'bear') {
      // The champion's red sash.
      body.at(rbox(0.1, 0.62, 0.5, 0.03), '#e8574a', 0, 0.42, 0.02, 0, 0, 0.75);
    }
    if (k === 'duck') body.at(rbox(0.36, 0.06, 0.3, 0.03), '#4aa3df', 0, 0.62, 0.0);
    if (k === 'octopus') {
      for (const sx of [-1, 1]) body.at(rbox(0.12, 0.12, 0.5, 0.06), skin, sx * 0.13, 0.12, 0.26, 0, 0, 0);
    } else {
      for (const sx of [-1, 1]) body.at(rbox(0.17, 0.17, 0.5, 0.07), k === 'robot' ? '#5d6a82' : skin, sx * 0.13, 0.12, 0.28);
    }
    const bodyMesh = body.mesh('plastic');
    this.root.add(bodyMesh);
    this.meshes.push(bodyMesh);

    // ---- Arms: pivot at the shoulder, hanging down the -y axis.
    const armColor = k === 'robot' ? '#5d6a82' : skin;
    const len = k === 'dino' ? 0.28 : 0.4;
    for (const [g, sx] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      const a = new Shape();
      if (k === 'octopus') {
        // Tentacles curl round the wheel.
        a.at(rbox(0.1, len * 0.55, 0.1, 0.05), armColor, 0, -len * 0.27, 0);
        a.at(rbox(0.09, len * 0.5, 0.09, 0.045), armColor, sx * -0.03, -len * 0.7, 0.03, 0.3, 0, 0);
        a.at(ball(0.05, 8, 6), '#ffc2d2', 0, -len * 0.6, 0.05);
      } else {
        a.at(rbox(0.12, len, 0.12, 0.05), armColor, 0, -len / 2, 0);
        a.at(ball(0.075, 10, 8), k === 'robot' ? '#aab4c6' : k === 'bear' ? '#f2d6b0' : armColor, 0, -len, 0);
      }
      const m = a.mesh('plastic');
      g.add(m);
      this.meshes.push(m);
      g.position.set(sx * 0.3, 0.58, 0.02);
      this.root.add(g);
    }

    // ---- Head, eyes and the wiggly part.
    this.head.position.set(0, HEAD_Y, 0);
    this.root.add(this.head);
    const hs = new Shape();
    const es = new Shape();
    const ws = new Shape();
    this.buildHead(k, skin, hs, es, ws);
    const headMesh = hs.mesh('plastic');
    this.head.add(headMesh);
    this.meshes.push(headMesh);
    this.eyes = es.mesh(k === 'robot' ? 'glow' : 'gloss', { cast: false });
    // Blink around the eyes' own middle.
    this.eyes.geometry.computeBoundingBox();
    const bb = this.eyes.geometry.boundingBox!;
    const eyeY = (bb.min.y + bb.max.y) / 2;
    this.eyes.geometry.translate(0, -eyeY, 0);
    this.eyes.position.y = eyeY;
    this.head.add(this.eyes);
    this.meshes.push(this.eyes);
    if (ws.parts.length) {
      const wm = ws.mesh('plastic');
      this.wiggle.add(wm);
      this.meshes.push(wm);
      this.head.add(this.wiggle);
    }

    // Dizzy stars, shown only when spun out.
    this.stars = new THREE.Group();
    const st = new Shape();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      st.at(new THREE.OctahedronGeometry(0.07, 0), '#ffd24a', Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
    }
    const sm = st.mesh('glow', { cast: false });
    this.stars.add(sm);
    this.stars.position.y = 0.42;
    this.stars.visible = false;
    this.head.add(this.stars);
  }

  private buildHead(k: DriverKind, skin: string, h: Shape, e: Shape, w: Shape): void {
    if (k === 'robot') {
      h.at(rbox(0.5, 0.4, 0.42, 0.09), skin, 0, 0.05, 0);
      h.at(rbox(0.4, 0.19, 0.04, 0.04), '#1d1830', 0, 0.07, 0.205);
      for (const sx of [-1, 1]) h.at(cyl(0.055, 0.055, 0.07, 10), '#5d6a82', sx * 0.27, 0.05, 0, 0, 0, Math.PI / 2);
      for (const sx of [-1, 1]) e.at(rbox(0.09, 0.075, 0.03, 0.015), '#7ef0ff', sx * 0.09, 0.07, 0.23);
      e.at(rbox(0.16, 0.025, 0.03, 0.01), '#7ef0ff', 0, -0.05, 0.23);
      w.at(cyl(0.015, 0.015, 0.22, 6), '#5d6a82', 0, 0.11, 0);
      w.at(ball(0.05, 10, 8), '#ffd24a', 0, 0.24, 0);
      this.wiggle.position.set(0, 0.25, 0);
      return;
    }
    if (k === 'frog') {
      h.at(ball(0.28, 14, 10), skin, 0, 0.02, 0.02, 0, 0, 0, 1.28, 0.8, 1);
      for (const sx of [-1, 1]) h.at(ball(0.12, 12, 9), skin, sx * 0.15, 0.21, 0.06);
      h.at(torus(0.17, 0.02, 6, 16, Math.PI), '#2b5a35', 0, -0.05, 0.21, 0, 0, Math.PI, 1, 0.45, 1);
      // Cheek blush.
      for (const sx of [-1, 1]) h.at(ball(0.05, 8, 6), '#ff9aa8', sx * 0.22, -0.02, 0.17, 0, 0, 0, 1, 0.6, 0.5);
      h.at(torus(0.3, 0.035, 6, 22), '#e8574a', 0, 0.1, 0, Math.PI / 2, 0, 0, 1.15, 1, 1);
      eyesInto(e, 0.09, 0.15, 0.25, 0.12);
      for (const sx of [-1, 1]) w.at(rbox(0.05, 0.03, 0.22, 0.012), '#e8574a', sx * 0.05, 0, -0.11, 0, sx * 0.3, 0);
      this.wiggle.position.set(0, 0.1, -0.31);
      return;
    }
    if (k === 'cat') {
      h.at(ball(0.28, 14, 10), skin, 0, 0.03, 0);
      for (const sx of [-1, 1]) {
        h.at(cone(0.1, 0.19, 4), skin, sx * 0.15, 0.28, 0, 0, 0, -sx * 0.25);
        h.at(cone(0.055, 0.1, 4), '#f7a8c0', sx * 0.15, 0.26, 0.045, 0, 0, -sx * 0.25);
      }
      h.at(ball(0.13, 12, 9), '#fff3e0', 0, -0.05, 0.17);
      h.at(ball(0.035, 8, 6), '#e86f8a', 0, 0.0, 0.3);
      for (const sx of [-1, 1])
        for (const dy of [-0.02, 0.03]) h.at(rbox(0.18, 0.012, 0.012, 0.005), '#fffaf0', sx * 0.2, dy - 0.03, 0.22, 0, 0, sx * dy * 4);
      h.at(torus(0.28, 0.025, 6, 22), '#2b2738', 0, 0.12, 0, Math.PI / 2 - 0.35, 0, 0);
      for (const sx of [-1, 1]) h.at(cyl(0.065, 0.065, 0.045, 14), '#7ef0ff', sx * 0.09, 0.21, 0.21, Math.PI / 2 - 0.35, 0, 0);
      eyesInto(e, 0.065, 0.105, 0.08, 0.215);
      // The tail hangs from the head group so it swishes behind the seat.
      w.at(rbox(0.075, 0.075, 0.55, 0.035), skin, 0, 0.18, -0.12, -0.9, 0, 0);
      w.at(ball(0.06, 8, 6), '#fff3e0', 0, 0.38, -0.32);
      this.wiggle.position.set(0, -0.47, -0.26);
      return;
    }
    if (k === 'duck') {
      h.at(ball(0.26, 14, 10), skin, 0, 0.04, 0);
      h.at(rbox(0.22, 0.075, 0.2, 0.035), '#f58a3b', 0, -0.03, 0.27);
      h.at(rbox(0.2, 0.04, 0.17, 0.02), '#e0702a', 0, -0.075, 0.26);
      h.at(cyl(0.17, 0.19, 0.09, 18), '#fffaf0', 0, 0.24, -0.02);
      h.at(torus(0.18, 0.02, 6, 20), '#4aa3df', 0, 0.21, -0.02, Math.PI / 2, 0, 0);
      eyesInto(e, 0.058, 0.1, 0.1, 0.2);
      for (const r of [-0.4, 0, 0.4]) w.at(rbox(0.03, 0.14, 0.05, 0.012), skin, Math.sin(r) * 0.06, 0.05, 0, 0, 0, r);
      this.wiggle.position.set(0, 0.29, -0.02);
      return;
    }
    if (k === 'dino') {
      h.at(ball(0.26, 14, 10), skin, 0, 0.04, -0.02);
      h.at(rbox(0.32, 0.21, 0.28, 0.09), skin, 0, -0.02, 0.2);
      for (const sx of [-0.08, 0, 0.08]) h.at(cone(0.022, 0.05, 5), '#fffaf0', sx, -0.13, 0.32, Math.PI, 0, 0);
      for (const sx of [-1, 1]) h.at(ball(0.02, 6, 5), '#8a3b2e', sx * 0.06, 0.07, 0.34);
      eyesInto(e, 0.065, 0.12, 0.15, 0.13);
      [0.25, 0.12, -0.02].forEach((z, i) => w.at(cone(0.065, 0.15, 5), '#ffd24a', 0, 0.27 - i * 0.04, -z - 0.05, -0.5 - i * 0.25, 0, 0));
      return;
    }
    if (k === 'octopus') {
      h.at(ball(0.3, 16, 12), skin, 0, 0.1, -0.03, 0, 0, 0, 1, 1.25, 1);
      for (const [x, y, z] of [
        [0.16, 0.3, 0.14],
        [-0.12, 0.38, 0.1],
        [0.02, 0.2, 0.26],
        [-0.22, 0.12, 0.16],
      ])
        h.at(ball(0.035, 8, 6), '#ffc2d2', x, y, z);
      h.at(torus(0.06, 0.016, 6, 12, Math.PI), '#7a2a4a', 0, -0.06, 0.26, 0, 0, Math.PI);
      eyesInto(e, 0.075, 0.11, 0.08, 0.22);
      // Two free tentacles wave hello.
      for (const sx of [-1, 1]) {
        w.at(rbox(0.09, 0.4, 0.09, 0.045), skin, sx * 0.42, -0.25, 0.05, 0, 0, sx * 0.7);
        w.at(ball(0.055, 8, 6), skin, sx * 0.56, -0.08, 0.05);
      }
      this.wiggle.position.set(0, -0.15, 0);
      return;
    }
    // Bear: round ears, a cream muzzle, gold goggles on the brow.
    h.at(ball(0.28, 14, 10), skin, 0, 0.03, 0);
    for (const sx of [-1, 1]) {
      h.at(ball(0.1, 10, 8), skin, sx * 0.21, 0.24, -0.02);
      h.at(ball(0.055, 8, 6), '#f2d6b0', sx * 0.21, 0.24, 0.04);
    }
    h.at(ball(0.13, 12, 9), '#f2d6b0', 0, -0.06, 0.2, 0, 0, 0, 1.1, 0.85, 0.8);
    h.at(ball(0.045, 8, 6), '#3a2418', 0, -0.01, 0.31);
    h.at(torus(0.28, 0.025, 6, 22), '#7a4a2a', 0, 0.12, 0, Math.PI / 2 - 0.3, 0, 0);
    for (const sx of [-1, 1]) h.at(cyl(0.07, 0.07, 0.05, 14), '#f5c542', sx * 0.1, 0.2, 0.21, Math.PI / 2 - 0.3, 0, 0);
    eyesInto(e, 0.055, 0.1, 0.07, 0.235, '#2a1a10');
  }

  /** `steer` -1..1 (left positive), `speed` m/s. */
  animate(dt: number, steer: number, speed: number, mood: Mood): void {
    this.time += dt;
    const t = this.time;
    const k = this.def.kind;
    this.stars.visible = mood === 'dizzy';
    if (mood === 'dizzy') this.stars.rotation.y = t * 9;
    if (mood === 'cheer') {
      this.armL.rotation.set(Math.PI - 0.2, 0, 0.35 + Math.sin(t * 9) * 0.15);
      this.armR.rotation.set(Math.PI - 0.2, 0, -0.35 - Math.sin(t * 9) * 0.15);
      this.head.position.y = HEAD_Y + Math.abs(Math.sin(t * 7)) * 0.06;
      this.head.rotation.set(-0.2, Math.sin(t * 3) * 0.3, 0);
    } else if (mood === 'wave') {
      this.armL.rotation.set(-1.05, 0, 0.18);
      this.armR.rotation.set(Math.PI - 0.3, 0, -0.5 - Math.sin(t * 10) * 0.35);
      this.head.position.y = HEAD_Y;
      this.head.rotation.set(-0.1, 0.4, 0.1);
    } else if (mood === 'sulk') {
      this.armL.rotation.set(-0.7, 0, 0.2);
      this.armR.rotation.set(-0.7, 0, -0.2);
      this.head.position.y = HEAD_Y - 0.02;
      this.head.rotation.set(0.35, 0, Math.sin(t * 1.3) * 0.08);
    } else if (mood === 'dizzy') {
      this.armL.rotation.set(-0.4, 0, 0.6 + Math.sin(t * 8) * 0.2);
      this.armR.rotation.set(-0.4, 0, -0.6 - Math.sin(t * 8 + 1) * 0.2);
      this.head.position.y = HEAD_Y;
      this.head.rotation.set(Math.sin(t * 6) * 0.15, Math.sin(t * 5) * 0.3, Math.cos(t * 6) * 0.2);
    } else {
      // Hands on the wheel, turning it; heads lean and look into the corner.
      const reach = k === 'dino' ? -1.35 : -1.05;
      this.armL.rotation.set(reach - steer * 0.25, 0, 0.18);
      this.armR.rotation.set(reach + steer * 0.25, 0, -0.18);
      const buzz = Math.min(1, speed / 14) * Math.sin(t * 31) * 0.008;
      this.head.position.y = HEAD_Y + buzz;
      this.head.rotation.set(-Math.min(1, speed / 14) * 0.08, steer * 0.35, steer * 0.12);
    }
    const w = this.wiggle;
    if (k === 'robot') w.rotation.z = Math.sin(t * 6) * 0.15 - steer * 0.3;
    else if (k === 'cat') w.rotation.y = Math.sin(t * 3) * 0.5;
    else if (k === 'frog') w.rotation.x = 0.3 + Math.sin(t * 18) * 0.25 * Math.min(1, speed / 8);
    else if (k === 'octopus') {
      w.rotation.z = Math.sin(t * 2.6) * 0.25;
      w.rotation.x = Math.sin(t * 3.3) * 0.2;
    } else w.rotation.z = Math.sin(t * 5) * 0.12;
    this.nextBlink -= dt;
    const closing = this.nextBlink < 0.12 && this.nextBlink > 0;
    this.eyes.scale.y = closing ? 0.15 : 1;
    if (this.nextBlink <= 0) this.nextBlink = 2 + Math.random() * 4;
  }
}
