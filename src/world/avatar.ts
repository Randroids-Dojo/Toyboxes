// The player's toy figure: chunky limbs on pivots, a simple walk cycle,
// a kick swing and seated or standing riding poses.

import * as THREE from 'three';
import { blob, cached, mesh, plastic, roundBox } from './kit';

const SHIRTS = ['#e8574a', '#f4b740', '#4aa3df', '#3fb68b', '#8a6bd1', '#f58a6b', '#ef6fa0', '#2fb3b3'];

/**
 * Whole-body poses a world can ask for: flying and surfing for scripted
 * rides, floating and tumbling in space, dancing, cheering, sneaking in a
 * crouch, and aiming with the right hand forward.
 */
export type Pose = 'fly' | 'surf' | 'float' | 'tumble' | 'dance' | 'cheer' | 'crouch' | 'aim';

export function shirtFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SHIRTS[h % SHIRTS.length];
}

function limb(len: number, w: number, color: string): THREE.Group {
  const pivot = new THREE.Group();
  const m = mesh(roundBox(w, len, w, w * 0.45), plastic(color), 0, -len / 2, 0);
  pivot.add(m);
  return pivot;
}

export class Avatar {
  readonly root = new THREE.Group();
  /** Leans and bobs without moving the root (which carries the collider position). */
  private rig = new THREE.Group();
  private torso: THREE.Mesh;
  private head: THREE.Group;
  private armL: THREE.Group;
  private armR: THREE.Group;
  private legL: THREE.Group;
  private legR: THREE.Group;
  private shadow: THREE.Mesh;
  private phase = 0;
  private kickT = 0;
  /** Height of the feet above whatever is below, and whether in the air. */
  private air = 0;
  private airborne = false;
  private jumpT = 0;
  private shirtMat: THREE.MeshStandardMaterial;
  private pose: Pose | null = null;
  private poseT = 0;
  private swingT = 0;
  /** Where a held thing goes: the end of the right arm. */
  readonly hand = new THREE.Group();

  constructor(shirt: string) {
    this.shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.6 });
    const skin = '#f2c9a0';
    const pants = '#2f3a56';
    this.root.add(this.rig);
    this.torso = mesh(roundBox(0.5, 0.52, 0.32, 0.12), this.shirtMat, 0, 0.72, 0);
    this.rig.add(this.torso);

    this.head = new THREE.Group();
    this.head.position.set(0, 1.12, 0);
    const skull = mesh(cached('head', () => new THREE.SphereGeometry(0.26, 20, 14)), plastic(skin, { rough: 0.5 }));
    const eyeGeo = cached('eye', () => new THREE.SphereGeometry(0.04, 8, 6));
    const eyeMat = plastic('#1d1830', { rough: 0.3 });
    const eyeL = mesh(eyeGeo, eyeMat, -0.09, 0.03, 0.235, { cast: false });
    const eyeR = mesh(eyeGeo, eyeMat, 0.09, 0.03, 0.235, { cast: false });
    const cap = mesh(cached('cap', () => new THREE.SphereGeometry(0.27, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45)), this.shirtMat, 0, 0.02, 0);
    const brim = mesh(roundBox(0.34, 0.04, 0.2, 0.02), this.shirtMat, 0, 0.1, 0.22);
    this.head.add(skull, eyeL, eyeR, cap, brim);
    this.rig.add(this.head);

    this.armL = limb(0.42, 0.14, skin);
    this.armR = limb(0.42, 0.14, skin);
    this.armL.position.set(-0.33, 0.94, 0);
    this.armR.position.set(0.33, 0.94, 0);
    this.legL = limb(0.48, 0.18, pants);
    this.legR = limb(0.48, 0.18, pants);
    this.legL.position.set(-0.13, 0.48, 0);
    this.legR.position.set(0.13, 0.48, 0);
    this.rig.add(this.armL, this.armR, this.legL, this.legR);
    this.hand.position.set(0, -0.44, 0);
    this.armR.add(this.hand);

    this.shadow = blob(1.1);
    this.root.add(this.shadow);
  }

  setShirt(color: string): void {
    this.shirtMat.color.set(color);
  }

  kick(): void {
    this.kickT = 0.32;
  }

  jump(): void {
    this.jumpT = 0.18;
  }

  private squashA = 0;
  private squashT = 9;

  /** A cartoon squash and stretch: positive squashes down, negative stretches up. It wobbles back by itself. */
  squash(amount: number): void {
    this.squashA = Math.max(-0.6, Math.min(0.6, amount));
    this.squashT = 0;
  }

  /** A quick right-arm swing (a blade, a throw, a wave). */
  swing(): void {
    this.swingT = 0.3;
  }

  /** Holds a pose until cleared with null. */
  setPose(p: Pose | null): void {
    if (p !== this.pose) {
      this.pose = p;
      this.poseT = 0;
    }
  }

  /** Puts something in the right hand (null empties it). */
  hold(obj: THREE.Object3D | null): void {
    this.hand.clear();
    if (obj) this.hand.add(obj);
  }

  /** The shadow stays on the ground while the figure is in the air. */
  setAir(height: number, airborne: boolean): void {
    this.air = Math.max(0, height);
    this.airborne = airborne;
  }

  /** `speed` in m/s on foot; `ride` picks a pose. */
  animate(dt: number, speed: number, ride: 'none' | 'scooter' | 'kart', reduceMotion: boolean): void {
    this.kickT = Math.max(0, this.kickT - dt);
    this.squashT += dt;
    const sq = this.squashT > 1.5 ? 0 : this.squashA * Math.exp(-6 * this.squashT) * Math.cos(16 * this.squashT) * (reduceMotion ? 0.4 : 1);
    this.root.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    if (ride === 'kart') {
      this.rig.position.set(0, -0.32, 0);
      this.legL.rotation.x = this.legR.rotation.x = -1.35;
      this.armL.rotation.x = this.armR.rotation.x = -1.0;
      this.armL.rotation.z = 0.15;
      this.armR.rotation.z = -0.15;
      this.head.rotation.set(0, 0, 0);
      this.shadow.visible = false;
      return;
    }
    if (ride === 'scooter') {
      this.rig.position.set(0, 0.16, 0);
      this.legL.rotation.x = 0.12;
      this.legR.rotation.x = -0.18;
      this.armL.rotation.x = this.armR.rotation.x = -1.15;
      this.armL.rotation.z = 0.1;
      this.armR.rotation.z = -0.1;
      this.head.rotation.set(0, 0, 0);
      this.shadow.visible = false;
      return;
    }
    this.shadow.visible = true;
    this.shadow.position.y = 0.02 - this.air;
    const k = 1.1 * Math.max(0.45, 1 - this.air * 0.25);
    this.shadow.scale.set(k, 1, k);
    this.jumpT = Math.max(0, this.jumpT - dt);
    this.swingT = Math.max(0, this.swingT - dt);
    this.rig.rotation.set(0, 0, 0);
    this.armL.rotation.y = this.armR.rotation.y = 0;
    if (this.pose) {
      this.poseT += dt;
      this.posed(this.pose, this.poseT, speed, reduceMotion);
      this.swingOverlay();
      return;
    }
    if (this.airborne) {
      // Knees up, arms out: a toy mid-hop.
      this.legL.rotation.x = -0.7;
      this.legR.rotation.x = -0.25;
      this.armL.rotation.set(-0.4, 0, 0.9);
      this.armR.rotation.set(-0.4, 0, -0.9);
      this.rig.position.set(0, 0, 0);
      this.rig.rotation.x = 0.05;
      this.head.rotation.y = 0;
      return;
    }
    this.armL.rotation.z = 0.06;
    this.armR.rotation.z = -0.06;
    const moving = Math.min(1, speed / 4.2);
    this.phase += dt * (4 + speed * 2.1);
    const swing = Math.sin(this.phase) * 0.75 * moving;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    const bob = reduceMotion ? 0 : Math.abs(Math.cos(this.phase)) * 0.06 * moving;
    this.rig.position.set(0, bob, 0);
    this.rig.rotation.x = moving * 0.08;
    if (this.kickT > 0) {
      // Wind up, strike, follow through.
      const t = 1 - this.kickT / 0.32;
      const k = t < 0.35 ? -0.7 * (t / 0.35) : -0.7 + 2.0 * Math.min(1, (t - 0.35) / 0.3);
      this.legR.rotation.x = -k;
      this.armL.rotation.x = k * 0.5;
    }
    this.swingOverlay();
    this.head.rotation.y = 0;
  }

  private swingOverlay(): void {
    if (this.swingT <= 0) return;
    // Raise back, then slash down and across.
    const t = 1 - this.swingT / 0.3;
    const a = t < 0.3 ? -2.7 * (t / 0.3) : -2.7 + 2.5 * Math.min(1, (t - 0.3) / 0.35);
    this.armR.rotation.x = a;
    this.armR.rotation.z = -0.25 - Math.sin(t * Math.PI) * 0.5;
    this.rig.rotation.y = Math.sin(t * Math.PI) * -0.35;
  }

  private posed(p: Pose, t: number, speed: number, reduceMotion: boolean): void {
    const wob = reduceMotion ? 0.3 : 1;
    this.head.rotation.set(0, 0, 0);
    switch (p) {
      case 'fly':
        // Arms ahead, legs trailing, body along the flight.
        this.rig.position.set(0, 0.55, 0);
        this.rig.rotation.x = 1.25;
        this.armL.rotation.set(-2.9, 0, 0.18);
        this.armR.rotation.set(-2.9, 0, -0.18);
        this.legL.rotation.x = 0.12 + Math.sin(t * 9) * 0.08 * wob;
        this.legR.rotation.x = 0.04 - Math.sin(t * 9) * 0.08 * wob;
        this.head.rotation.x = -0.9;
        break;
      case 'surf':
        this.rig.position.set(0, -0.12, 0);
        this.rig.rotation.y = 0.9;
        this.legL.rotation.set(-0.5, 0, 0.35);
        this.legR.rotation.set(0.5, 0, -0.35);
        this.armL.rotation.set(0, 0, 1.25 + Math.sin(t * 3) * 0.1 * wob);
        this.armR.rotation.set(0, 0, -1.25 - Math.sin(t * 3) * 0.1 * wob);
        this.head.rotation.y = -0.9;
        break;
      case 'float': {
        // Spread out, turning slowly.
        this.rig.position.set(0, 0.2 + Math.sin(t * 1.6) * 0.06 * wob, 0);
        this.rig.rotation.z = Math.sin(t * 0.9) * 0.25 * wob;
        this.rig.rotation.x = Math.sin(t * 0.7) * 0.2 * wob;
        this.armL.rotation.set(0, 0, 1.9 + Math.sin(t * 2) * 0.15 * wob);
        this.armR.rotation.set(0, 0, -1.9 - Math.sin(t * 2) * 0.15 * wob);
        this.legL.rotation.set(0, 0, 0.35);
        this.legR.rotation.set(0, 0, -0.35);
        break;
      }
      case 'tumble':
        this.rig.position.set(0, 0.6, 0);
        this.rig.rotation.x = reduceMotion ? 0.6 : t * 9;
        this.armL.rotation.set(-1.2, 0, 1.1);
        this.armR.rotation.set(-1.2, 0, -1.1);
        this.legL.rotation.x = -1.1;
        this.legR.rotation.x = -0.6;
        break;
      case 'dance': {
        const b = t * 7.5;
        this.rig.position.set(0, Math.abs(Math.sin(b)) * 0.1 * wob, 0);
        this.rig.rotation.y = Math.sin(b * 0.5) * 0.35 * wob;
        this.armL.rotation.set(-1.6 + Math.sin(b) * 1.1, 0, 0.5);
        this.armR.rotation.set(-1.6 - Math.sin(b) * 1.1, 0, -0.5);
        this.legL.rotation.x = Math.max(0, Math.sin(b)) * -0.5;
        this.legR.rotation.x = Math.max(0, -Math.sin(b)) * -0.5;
        this.head.rotation.z = Math.sin(b) * 0.15 * wob;
        break;
      }
      case 'cheer': {
        const b = t * 6;
        this.rig.position.set(0, Math.max(0, Math.sin(b)) * 0.16 * wob, 0);
        this.armL.rotation.set(-2.9 + Math.sin(b * 2) * 0.2, 0, 0.35);
        this.armR.rotation.set(-2.9 - Math.sin(b * 2) * 0.2, 0, -0.35);
        this.legL.rotation.x = this.legR.rotation.x = 0;
        this.head.rotation.x = -0.25;
        break;
      }
      case 'crouch': {
        // Tiptoe: low, knees bent, arms tucked.
        const moving = Math.min(1, speed / 3);
        this.phase += 0.016 * (3 + speed * 2);
        const sw = Math.sin(this.phase) * 0.45 * moving;
        this.rig.position.set(0, -0.2, 0);
        this.rig.rotation.x = 0.35;
        this.legL.rotation.x = -0.6 + sw;
        this.legR.rotation.x = -0.6 - sw;
        this.armL.rotation.set(-0.9, 0, 0.35);
        this.armR.rotation.set(-0.9, 0, -0.35);
        this.head.rotation.x = -0.3;
        break;
      }
      case 'aim': {
        const moving = Math.min(1, speed / 4.2);
        this.phase += 0.016 * (4 + speed * 2.1);
        const sw = Math.sin(this.phase) * 0.6 * moving;
        this.legL.rotation.x = sw;
        this.legR.rotation.x = -sw;
        this.armL.rotation.set(-sw * 0.6, 0, 0.06);
        this.armR.rotation.set(-1.5, 0, 0);
        this.rig.position.set(0, 0, 0);
        break;
      }
    }
  }
}
