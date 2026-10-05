// The player's toy figure: chunky limbs on pivots, a simple walk cycle,
// a kick swing and seated or standing riding poses.

import * as THREE from 'three';
import { blob, cached, mesh, plastic, roundBox } from './kit';

const SHIRTS = ['#e8574a', '#f4b740', '#4aa3df', '#3fb68b', '#8a6bd1', '#f58a6b', '#ef6fa0', '#2fb3b3'];

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

  /** The shadow stays on the ground while the figure is in the air. */
  setAir(height: number, airborne: boolean): void {
    this.air = Math.max(0, height);
    this.airborne = airborne;
  }

  /** `speed` in m/s on foot; `ride` picks a pose. */
  animate(dt: number, speed: number, ride: 'none' | 'scooter' | 'kart', reduceMotion: boolean): void {
    this.kickT = Math.max(0, this.kickT - dt);
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
    this.head.rotation.y = 0;
  }
}
