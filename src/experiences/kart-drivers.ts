// The computer drivers: toy characters who sit in their karts, steer with
// both hands, look into corners and cheer when they finish ahead of you.
// Each is a handful of rounded shapes so they stay cheap to draw.

import * as THREE from 'three';
import { cached, mesh, plastic, roundBox } from '../world/kit';

export type DriverKind = 'robot' | 'frog' | 'cat' | 'duck' | 'dino';

export interface DriverDef {
  kind: DriverKind;
  name: string;
  /** Kart paint. */
  kart: string;
  /** Share of top speed on the straights. */
  skill: number;
  /** How hard it brakes for corners: higher carries more speed. */
  nerve: number;
  /** Favourite side of the road, metres (left positive). */
  lane: number;
  /** How readily it dives for a gap or a boost pad, 0..1. */
  daring: number;
}

export const DRIVERS: DriverDef[] = [
  { kind: 'robot', name: 'Bolt', kart: '#7d8aa3', skill: 0.97, nerve: 0.99, lane: 0.6, daring: 0.5 },
  { kind: 'frog', name: 'Hopper', kart: '#3fb68b', skill: 0.96, nerve: 1.0, lane: -1.4, daring: 0.9 },
  { kind: 'cat', name: 'Mittens', kart: '#ef6fa0', skill: 0.95, nerve: 0.97, lane: 1.6, daring: 0.7 },
  { kind: 'duck', name: 'Puddles', kart: '#f4b740', skill: 0.93, nerve: 0.94, lane: -0.4, daring: 0.3 },
  { kind: 'dino', name: 'Rex', kart: '#8a6bd1', skill: 0.955, nerve: 0.99, lane: 1.0, daring: 0.8 },
];

function sphere(r: number, ws = 16, hs = 12): THREE.BufferGeometry {
  return cached(`dsph${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
}

function arm(color: string, len = 0.4, w = 0.12): THREE.Group {
  const pivot = new THREE.Group();
  pivot.add(mesh(roundBox(w, len, w, w * 0.45), plastic(color), 0, -len / 2, 0));
  return pivot;
}

/** Two googly eyes: white balls with dark pupils, facing +z. */
function eyes(r: number, spread: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, y, z);
  const white = plastic('#fffaf0', { rough: 0.3 });
  const dark = plastic('#1d1830', { rough: 0.3 });
  for (const sx of [-1, 1]) {
    g.add(mesh(sphere(r), white, sx * spread, 0, 0, { cast: false }));
    g.add(mesh(sphere(r * 0.5, 10, 8), dark, sx * spread, 0, r * 0.62, { cast: false }));
  }
  return g;
}

export type Mood = 'drive' | 'cheer' | 'sulk';

export class Driver {
  readonly root = new THREE.Group();
  private head = new THREE.Group();
  private armL: THREE.Group;
  private armR: THREE.Group;
  /** A part that wiggles on its own: an antenna, a tail, a crest. */
  private wiggle: THREE.Object3D | null = null;
  private blink: THREE.Object3D | null = null;
  private time = Math.random() * 10;
  private nextBlink = 2 + Math.random() * 3;

  constructor(readonly def: DriverDef) {
    // Seated like the player figure: hips on the seat, legs forward under the dash.
    const body = new THREE.Group();
    this.root.add(body);
    const main = { robot: '#aab4c6', frog: '#5cbf63', cat: '#f2994a', duck: '#ffd24a', dino: '#ef6f5a' }[def.kind];
    const belly = { robot: '#5d6a82', frog: '#e9f2b8', cat: '#fff3e0', duck: '#fff3c4', dino: '#ffd9a8' }[def.kind];
    const torso = def.kind === 'robot' ? mesh(roundBox(0.5, 0.5, 0.34, 0.06), plastic(main, { rough: 0.35 }), 0, 0.4, 0) : mesh(sphere(0.29, 16, 12), plastic(main), 0, 0.38, 0);
    if (def.kind !== 'robot') torso.scale.set(1, 1.05, 0.8);
    body.add(torso);
    const tummy = def.kind === 'robot' ? mesh(roundBox(0.3, 0.22, 0.04, 0.02), plastic(belly, { rough: 0.3 }), 0, 0.42, 0.17) : mesh(sphere(0.2, 14, 10), plastic(belly), 0, 0.35, 0.12);
    if (def.kind !== 'robot') tummy.scale.set(1, 1.1, 0.6);
    body.add(tummy);
    for (const sx of [-1, 1]) {
      const leg = mesh(roundBox(0.17, 0.17, 0.5, 0.07), plastic(def.kind === 'robot' ? '#5d6a82' : main), sx * 0.13, 0.12, 0.28);
      body.add(leg);
    }
    this.armL = arm(def.kind === 'robot' ? '#5d6a82' : main, def.kind === 'dino' ? 0.26 : 0.4);
    this.armR = arm(def.kind === 'robot' ? '#5d6a82' : main, def.kind === 'dino' ? 0.26 : 0.4);
    this.armL.position.set(-0.3, 0.58, 0.02);
    this.armR.position.set(0.3, 0.58, 0.02);
    body.add(this.armL, this.armR);
    this.head.position.set(0, 0.8, 0);
    body.add(this.head);
    this.buildHead(def.kind, main);
  }

  private buildHead(kind: DriverKind, main: string): void {
    const h = this.head;
    if (kind === 'robot') {
      const metal = plastic(main, { rough: 0.35 });
      h.add(mesh(roundBox(0.46, 0.36, 0.38, 0.08), metal, 0, 0.05, 0));
      h.add(mesh(roundBox(0.36, 0.17, 0.04, 0.04), plastic('#1d1830', { rough: 0.2 }), 0, 0.07, 0.19, { cast: false }));
      const glow = plastic('#7ef0ff', { emissive: '#4fe3ff', emissiveIntensity: 1.4 });
      const eyesG = new THREE.Group();
      eyesG.position.set(0, 0.07, 0.215);
      for (const sx of [-1, 1]) eyesG.add(mesh(roundBox(0.08, 0.07, 0.03, 0.015), glow, sx * 0.08, 0, 0, { cast: false }));
      h.add(eyesG);
      this.blink = eyesG;
      for (const sx of [-1, 1]) h.add(mesh(cached('dbolt', () => new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10).rotateZ(Math.PI / 2)), plastic('#5d6a82'), sx * 0.25, 0.05, 0));
      const ant = new THREE.Group();
      ant.position.set(0, 0.23, 0);
      ant.add(mesh(cached('dant', () => new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6)), plastic('#5d6a82'), 0, 0.11, 0));
      ant.add(mesh(sphere(0.045, 10, 8), plastic('#ffd24a', { emissive: '#ffb21e', emissiveIntensity: 1.2 }), 0, 0.24, 0, { cast: false }));
      h.add(ant);
      this.wiggle = ant;
      return;
    }
    if (kind === 'frog') {
      const skin = plastic(main);
      const skull = mesh(sphere(0.27), skin, 0, 0.02, 0.02);
      skull.scale.set(1.25, 0.78, 1);
      h.add(skull);
      for (const sx of [-1, 1]) h.add(mesh(sphere(0.11), skin, sx * 0.14, 0.2, 0.06));
      const e = eyes(0.085, 0.14, 0.23, 0.11);
      h.add(e);
      this.blink = e;
      const mouth = mesh(cached('dfmouth', () => new THREE.TorusGeometry(0.17, 0.018, 6, 20, Math.PI)), plastic('#2b5a35'), 0, -0.05, 0.2, { cast: false });
      mouth.rotation.z = Math.PI;
      mouth.scale.y = 0.45;
      h.add(mouth);
      // A red racing headband with tails that flutter.
      const band = mesh(cached('dfband', () => new THREE.TorusGeometry(0.29, 0.035, 6, 24)), plastic('#e8574a'), 0, 0.1, 0.0);
      band.rotation.x = Math.PI / 2;
      band.scale.set(1.15, 1, 1);
      h.add(band);
      const tails = new THREE.Group();
      tails.position.set(0, 0.1, -0.3);
      for (const sx of [-1, 1]) {
        const t = mesh(roundBox(0.05, 0.03, 0.2, 0.01), plastic('#e8574a'), sx * 0.05, 0, -0.1);
        t.rotation.y = sx * 0.3;
        tails.add(t);
      }
      h.add(tails);
      this.wiggle = tails;
      return;
    }
    if (kind === 'cat') {
      const fur = plastic(main);
      h.add(mesh(sphere(0.27), fur, 0, 0.03, 0));
      for (const sx of [-1, 1]) {
        const ear = mesh(cached('dear', () => new THREE.ConeGeometry(0.1, 0.18, 4)), fur, sx * 0.15, 0.27, 0);
        ear.rotation.z = -sx * 0.25;
        h.add(ear);
        const inner = mesh(cached('dearin', () => new THREE.ConeGeometry(0.055, 0.1, 4)), plastic('#f7a8c0'), sx * 0.15, 0.25, 0.04, { cast: false });
        inner.rotation.z = -sx * 0.25;
        h.add(inner);
      }
      h.add(mesh(sphere(0.13, 12, 10), plastic('#fff3e0'), 0, -0.05, 0.17));
      h.add(mesh(sphere(0.035, 8, 6), plastic('#e86f8a'), 0, 0.0, 0.29, { cast: false }));
      const e = eyes(0.06, 0.1, 0.08, 0.21);
      h.add(e);
      this.blink = e;
      for (const sx of [-1, 1])
        for (const dy of [-0.02, 0.03]) {
          const w = mesh(roundBox(0.18, 0.01, 0.01, 0.004), plastic('#fffaf0'), sx * 0.2, dy - 0.03, 0.22, { cast: false });
          w.rotation.z = sx * dy * 4;
          h.add(w);
        }
      // Racing goggles pushed up on the forehead.
      const strap = mesh(cached('dstrap', () => new THREE.TorusGeometry(0.275, 0.025, 6, 24)), plastic('#2b2738'), 0, 0.12, 0);
      strap.rotation.x = Math.PI / 2 - 0.35;
      h.add(strap);
      for (const sx of [-1, 1]) h.add(mesh(cached('dgog', () => new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14).rotateX(Math.PI / 2)), plastic('#7ef0ff', { rough: 0.1 }), sx * 0.08, 0.2, 0.2, { cast: false }));
      const tail = new THREE.Group();
      tail.position.set(0, -0.45, -0.25);
      const seg = mesh(roundBox(0.07, 0.07, 0.5, 0.03), fur, 0, 0.18, -0.12);
      seg.rotation.x = -0.9;
      tail.add(seg);
      h.add(tail);
      this.wiggle = tail;
      return;
    }
    if (kind === 'duck') {
      const feathers = plastic(main);
      h.add(mesh(sphere(0.25), feathers, 0, 0.04, 0));
      const beak = mesh(roundBox(0.2, 0.07, 0.18, 0.035), plastic('#f58a3b'), 0, -0.02, 0.25);
      h.add(beak);
      const e = eyes(0.055, 0.1, 0.1, 0.19);
      h.add(e);
      this.blink = e;
      const tuft = new THREE.Group();
      tuft.position.set(0, 0.28, 0);
      for (const r of [-0.4, 0, 0.4]) {
        const f = mesh(roundBox(0.03, 0.14, 0.05, 0.012), feathers, Math.sin(r) * 0.06, 0.05, 0);
        f.rotation.z = r;
        tuft.add(f);
      }
      h.add(tuft);
      // A little sailor-style cap.
      h.add(mesh(cached('dcap', () => new THREE.CylinderGeometry(0.16, 0.18, 0.08, 18)), plastic('#4aa3df'), 0, 0.22, -0.02));
      this.wiggle = tuft;
      return;
    }
    // Dino: long snout, little teeth, spikes down the back of the head.
    const scales = plastic(main);
    h.add(mesh(sphere(0.25), scales, 0, 0.04, -0.02));
    const snout = mesh(roundBox(0.3, 0.2, 0.26, 0.09), scales, 0, -0.02, 0.2);
    h.add(snout);
    const toothMat = plastic('#fffaf0');
    for (const sx of [-0.08, 0, 0.08]) {
      const tooth = mesh(cached('dtooth', () => new THREE.ConeGeometry(0.022, 0.05, 5)), toothMat, sx, -0.12, 0.31, { cast: false });
      tooth.rotation.x = Math.PI;
      h.add(tooth);
    }
    for (const sx of [-1, 1]) h.add(mesh(sphere(0.02, 6, 6), plastic('#8a3b2e'), sx * 0.06, 0.06, 0.33, { cast: false }));
    const e = eyes(0.06, 0.12, 0.14, 0.13);
    h.add(e);
    this.blink = e;
    const crest = new THREE.Group();
    const spike = plastic('#ffd24a');
    [0.25, 0.12, -0.02].forEach((z, i) => {
      const c = mesh(cached('dspike', () => new THREE.ConeGeometry(0.06, 0.14, 5)), spike, 0, 0.27 - i * 0.04, -z - 0.05);
      c.rotation.x = -0.5 - i * 0.25;
      crest.add(c);
    });
    h.add(crest);
    this.wiggle = crest;
  }

  /** `steer` -1..1 (left positive), `speed` m/s. */
  animate(dt: number, steer: number, speed: number, mood: Mood): void {
    this.time += dt;
    const t = this.time;
    if (mood === 'cheer') {
      // Both arms up and a happy bounce.
      this.armL.rotation.set(Math.PI - 0.2, 0, 0.35 + Math.sin(t * 9) * 0.15);
      this.armR.rotation.set(Math.PI - 0.2, 0, -0.35 - Math.sin(t * 9) * 0.15);
      this.head.position.y = 0.8 + Math.abs(Math.sin(t * 7)) * 0.06;
      this.head.rotation.set(-0.2, Math.sin(t * 3) * 0.3, 0);
    } else if (mood === 'sulk') {
      this.armL.rotation.set(-0.7, 0, 0.2);
      this.armR.rotation.set(-0.7, 0, -0.2);
      this.head.position.y = 0.78;
      this.head.rotation.set(0.35, 0, Math.sin(t * 1.3) * 0.08);
    } else {
      // Hands on the wheel, turning it; heads lean and look into the corner.
      const reach = this.def.kind === 'dino' ? -1.35 : -1.05;
      this.armL.rotation.set(reach - steer * 0.25, 0, 0.18);
      this.armR.rotation.set(reach + steer * 0.25, 0, -0.18);
      const buzz = Math.min(1, speed / 14) * Math.sin(t * 31) * 0.008;
      this.head.position.y = 0.8 + buzz;
      this.head.rotation.set(-Math.min(1, speed / 14) * 0.08, steer * 0.35, steer * 0.12);
    }
    if (this.wiggle) {
      if (this.def.kind === 'robot') this.wiggle.rotation.z = Math.sin(t * 6) * 0.15 - steer * 0.3;
      else if (this.def.kind === 'cat') this.wiggle.rotation.y = Math.sin(t * 3) * 0.5;
      else if (this.def.kind === 'frog') this.wiggle.rotation.x = 0.3 + Math.sin(t * 18) * 0.25 * Math.min(1, speed / 8);
      else this.wiggle.rotation.z = Math.sin(t * 5) * 0.12;
    }
    if (this.blink) {
      this.nextBlink -= dt;
      const closing = this.nextBlink < 0.12 && this.nextBlink > 0;
      this.blink.scale.y = closing ? 0.15 : 1;
      if (this.nextBlink <= 0) this.nextBlink = 2 + Math.random() * 4;
    }
  }
}
