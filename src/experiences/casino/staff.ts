// The boat's brass automatons: Penny the purser, Rivet the dealer, Spinner
// the croupier, Monty the doorman, Captain Cog, and the Paddle Wheel Three
// (Ivory on piano, Strum on banjo, Oompa on tuba). One rig for all: a torso,
// a head that turns to look at you, two arms for gestures, and glowing eyes
// (every eye on the boat in one instanced mesh). They speak in short bubbles.

import * as THREE from 'three';
import { h } from '../../ui/ui';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batch } from './batch';
import { C, type Mats } from './materials';

export type StaffId = 'penny' | 'rivet' | 'spinner' | 'monty' | 'captain' | 'ivory' | 'strum' | 'oompa';
export type Gesture = 'wave' | 'deal' | 'point' | 'shrug' | 'applaud' | 'spin' | 'tip' | 'play' | null;

interface Look {
  body: string;
  trim: string;
  hat: 'bowler' | 'visor' | 'cap' | 'boater' | 'bonnet' | 'none';
  hatColor: string;
  eye: string;
  /** Height of the shoulders (taller automatons stand behind tables). */
  tall: number;
}

const LOOKS: Record<StaffId, Look> = {
  penny: { body: '#2b6f9e', trim: C.brassMatte, hat: 'bonnet', hatColor: '#d8574a', eye: '#9fe8ff', tall: 1.0 },
  rivet: { body: '#7a2a22', trim: C.brassMatte, hat: 'bowler', hatColor: '#1d1830', eye: '#8fffc0', tall: 1.05 },
  spinner: { body: '#1d4f55', trim: C.brassMatte, hat: 'visor', hatColor: '#2f8f5a', eye: '#ffd27a', tall: 1.05 },
  monty: { body: '#3a2a6a', trim: C.brassMatte, hat: 'cap', hatColor: '#1d1830', eye: '#ff9a7a', tall: 1.15 },
  captain: { body: '#f4e7cc', trim: C.brassMatte, hat: 'cap', hatColor: '#13212b', eye: '#9fe8ff', tall: 1.15 },
  ivory: { body: '#6a2c1d', trim: C.brassMatte, hat: 'boater', hatColor: '#f2e2b0', eye: '#ffd27a', tall: 0.85 },
  strum: { body: '#2f6a3a', trim: C.brassMatte, hat: 'boater', hatColor: '#f2e2b0', eye: '#8fffc0', tall: 0.95 },
  oompa: { body: '#8a5a1a', trim: C.brassMatte, hat: 'boater', hatColor: '#f2e2b0', eye: '#ff9a7a', tall: 0.95 },
};

const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();

/**
 * Merges each part's pieces into one skinned geometry, every vertex bound
 * fully to its part's bone, so a whole automaton is a single draw call.
 */
function skinned(parts: { batch: Batch; bone: number; at: THREE.Vector3 }[]): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  for (const p of parts) {
    for (const [, geos] of p.batch.drain()) {
      for (const g of geos) {
        g.translate(p.at.x, p.at.y, p.at.z);
        const n = g.attributes.position.count;
        const idx = new Uint16Array(n * 4);
        const wt = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
          idx[i * 4] = p.bone;
          wt[i * 4] = 1;
        }
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
        list.push(g);
      }
    }
  }
  const merged = mergeGeometries(list)!;
  for (const g of list) g.dispose();
  return merged;
}

export class Automaton {
  readonly root = new THREE.Group();
  readonly head = new THREE.Bone();
  readonly armL = new THREE.Bone();
  readonly armR = new THREE.Bone();
  private mesh: THREE.SkinnedMesh;
  private gesture: Gesture = null;
  private gT = 0;
  private gDur = 1;
  private lookYaw = 0;
  private lookTarget: THREE.Vector3 | null = null;
  private baseYaw: number;
  private t = Math.random() * 10;
  /** Seated band members bob on the beat instead of breathing. */
  seated = false;
  instrument: THREE.Object3D | null = null;

  constructor(
    readonly id: StaffId,
    m: Mats,
    x: number,
    z: number,
    yaw: number,
    readonly eyes: { left: THREE.Object3D; right: THREE.Object3D },
  ) {
    const L = LOOKS[id];
    this.baseYaw = yaw;
    this.root.position.set(x, 0, z);
    this.root.rotation.y = yaw;
    const sh = 0.9 + L.tall * 0.6;
    // Torso: a brass base, a barrel body, a waistcoat front and a bow tie.
    const b = new Batch();
    b.add(new THREE.CylinderGeometry(0.34, 0.4, 0.14, 18), m.trim, 0, 0.07, 0, 0, 0, 0, L.trim);
    b.add(new THREE.CylinderGeometry(0.16, 0.22, sh - 0.95, 12), m.trim, 0, 0.14 + (sh - 0.95) / 2, 0, 0, 0, 0, '#3a3a44');
    b.add(new THREE.CapsuleGeometry(0.3, 0.42, 6, 16), m.trim, 0, sh - 0.42, 0, 0, 0, 0, L.body);
    b.add(new THREE.CylinderGeometry(0.31, 0.31, 0.06, 18), m.trim, 0, sh - 0.66, 0, 0, 0, 0, L.trim);
    b.add(new THREE.BoxGeometry(0.28, 0.4, 0.06), m.trim, 0, sh - 0.4, 0.28, 0, 0, 0, '#f4e7cc');
    for (let i = 0; i < 3; i++) b.add(new THREE.SphereGeometry(0.025, 8, 6), m.trim, 0, sh - 0.3 - i * 0.1, 0.315, 0, 0, 0, L.trim);
    b.add(new THREE.BoxGeometry(0.18, 0.07, 0.05), m.trim, 0, sh - 0.12, 0.31, 0, 0, 0, '#d8382c');
    b.add(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 10), m.trim, 0, sh + 0.02, 0, 0, 0, 0, L.trim);
    // A wind-up key on the back.
    b.add(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 6).rotateX(Math.PI / 2), m.trim, 0, sh - 0.35, -0.38, 0, 0, 0, L.trim);
    b.add(new THREE.TorusGeometry(0.08, 0.022, 6, 12), m.trim, 0.06, sh - 0.35, -0.48, 0, Math.PI / 2, 0, L.trim);
    b.add(new THREE.TorusGeometry(0.08, 0.022, 6, 12), m.trim, -0.06, sh - 0.35, -0.48, 0, Math.PI / 2, 0, L.trim);
    // Head: a brass dome with a dark face glass; the hat on top.
    this.head.position.y = sh + 0.3;
    const hb = new Batch();
    hb.add(new THREE.SphereGeometry(0.24, 18, 14), m.trim, 0, 0, 0, 0, 0, 0, L.trim);
    hb.add(new THREE.SphereGeometry(0.2, 16, 12, -Math.PI / 2.6, Math.PI / 1.3, Math.PI / 3.2, Math.PI / 2.6), m.trim, 0, 0, 0.055, 0, 0, 0, '#1d1830');
    hb.add(new THREE.TorusGeometry(0.245, 0.02, 6, 24).rotateX(Math.PI / 2), m.trim, 0, -0.04, 0, 0, 0, 0, '#a8782c');
    for (const sx of [-1, 1]) hb.add(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12).rotateZ(Math.PI / 2), m.trim, sx * 0.25, 0, 0, 0, 0, 0, '#a8782c');
    switch (L.hat) {
      case 'bowler':
        hb.add(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.trim, 0, 0.16, 0, 0, 0, 0, L.hatColor);
        hb.add(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 20), m.trim, 0, 0.16, 0, 0, 0, 0, L.hatColor);
        break;
      case 'boater':
        hb.add(new THREE.CylinderGeometry(0.2, 0.2, 0.13, 20), m.trim, 0, 0.24, 0, 0, 0, 0, L.hatColor);
        hb.add(new THREE.CylinderGeometry(0.205, 0.205, 0.04, 20), m.trim, 0, 0.21, 0, 0, 0, 0, '#d8382c');
        hb.add(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 22), m.trim, 0, 0.18, 0, 0, 0, 0, L.hatColor);
        break;
      case 'cap':
        hb.add(new THREE.CylinderGeometry(0.25, 0.21, 0.14, 20), m.trim, 0, 0.24, 0, 0, 0, 0, L.hatColor);
        hb.add(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20), m.trim, 0, 0.17, 0, 0, 0, 0, L.trim);
        hb.add(new THREE.BoxGeometry(0.24, 0.02, 0.12), m.trim, 0, 0.17, 0.2, 0, 0, 0, '#1d1830');
        hb.add(new THREE.SphereGeometry(0.035, 8, 6), m.trim, 0, 0.25, 0.22, 0, 0, 0, L.trim);
        break;
      case 'visor':
        hb.add(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 20, 1, false, -Math.PI / 2, Math.PI), m.trim, 0, 0.12, 0.08, 0, 0, 0, L.hatColor);
        hb.add(new THREE.TorusGeometry(0.235, 0.02, 6, 24).rotateX(Math.PI / 2), m.trim, 0, 0.13, 0, 0, 0, 0, L.hatColor);
        break;
      case 'bonnet':
        hb.add(new THREE.SphereGeometry(0.26, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), m.trim, 0, 0.04, -0.02, 0, 0, 0, L.hatColor);
        hb.add(new THREE.TorusGeometry(0.2, 0.03, 6, 20).rotateX(0.3), m.trim, 0, 0.1, 0.1, 0, 0, 0, '#f4e7cc');
        break;
      case 'none':
        hb.add(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 6), m.trim, 0, 0.3, 0, 0, 0, 0, L.trim);
        break;
    }
    // Eyes follow the head; they are instances in the shared glow mesh.
    this.eyes.left.position.set(-0.075, 0.03, 0.235);
    this.eyes.right.position.set(0.075, 0.03, 0.235);
    this.head.add(this.eyes.left, this.eyes.right);
    // Arms: a shoulder ball, upper arm, forearm and a mitten hand.
    const arms: Batch[] = [];
    for (const [g, sx] of [[this.armL, -1], [this.armR, 1]] as const) {
      g.position.set(sx * 0.36, sh - 0.2, 0);
      const ab = new Batch();
      arms.push(ab);
      ab.add(new THREE.SphereGeometry(0.09, 12, 8), m.trim, 0, 0, 0, 0, 0, 0, L.trim);
      ab.add(new THREE.CylinderGeometry(0.055, 0.05, 0.3, 10), m.trim, 0, -0.17, 0, 0, 0, 0, L.body);
      ab.add(new THREE.SphereGeometry(0.06, 10, 8), m.trim, 0, -0.33, 0, 0, 0, 0, L.trim);
      ab.add(new THREE.CylinderGeometry(0.05, 0.045, 0.28, 10), m.trim, 0, -0.48, 0, 0, 0, 0, '#3a3a44');
      ab.add(new THREE.SphereGeometry(0.075, 12, 8).scale(1, 1.1, 0.8), m.trim, 0, -0.66, 0, 0, 0, 0, '#f4e7cc');
    }
    // One skinned mesh: bone 0 the body, then the head and the two arms.
    const rootBone = new THREE.Bone();
    rootBone.add(this.head, this.armL, this.armR);
    const geo = skinned([
      { batch: b, bone: 0, at: new THREE.Vector3() },
      { batch: hb, bone: 1, at: this.head.position.clone() },
      { batch: arms[0], bone: 2, at: this.armL.position.clone() },
      { batch: arms[1], bone: 3, at: this.armR.position.clone() },
    ]);
    this.mesh = new THREE.SkinnedMesh(geo, m.trim);
    this.mesh.add(rootBone);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton([rootBone, this.head, this.armL, this.armR]));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    geo.computeBoundingSphere();
    this.mesh.boundingSphere = geo.boundingSphere!.clone();
    this.mesh.boundingSphere.radius += 0.6;
    this.root.add(this.mesh);
  }

  /** World point a bubble hangs from. */
  bubbleAt(out: THREE.Vector3): THREE.Vector3 {
    return this.head.getWorldPosition(out).add(tmpV.set(0, 0.55, 0));
  }

  lookAt(p: THREE.Vector3 | null): void {
    this.lookTarget = p;
  }

  play(g: Gesture, seconds = 1.2): void {
    this.gesture = g;
    this.gT = 0;
    this.gDur = seconds;
  }

  get busy(): boolean {
    return this.gesture !== null && this.gesture !== 'play';
  }

  update(dt: number, beat: number): void {
    this.t += dt;
    // Head turns towards a target within reach, else idles.
    let want = Math.sin(this.t * 0.5) * 0.25;
    if (this.lookTarget) {
      const wp = this.root.getWorldPosition(tmpV);
      const yaw = Math.atan2(this.lookTarget.x - wp.x, this.lookTarget.z - wp.z) - this.baseYaw;
      const w = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      if (Math.abs(w) < 1.4) want = w;
    }
    this.lookYaw += (want - this.lookYaw) * Math.min(1, dt * 4);
    this.head.rotation.y = this.lookYaw;
    if (this.seated) {
      const bob = Math.abs(Math.sin(beat * Math.PI));
      this.head.position.y = 0.9 + LOOKS[this.id].tall * 0.6 + 0.3 + bob * 0.04;
      this.head.rotation.z = Math.sin(beat * Math.PI) * 0.08;
    } else {
      this.head.position.y = 0.9 + LOOKS[this.id].tall * 0.6 + 0.3 + Math.sin(this.t * 2) * 0.012;
    }
    // Gestures.
    let lx = 0.1;
    let lz = 0;
    let rx = 0.1;
    let rz = 0;
    if (this.gesture) {
      this.gT += dt;
      const k = Math.min(1, this.gT / this.gDur);
      const env = Math.sin(k * Math.PI);
      switch (this.gesture) {
        case 'wave':
          rz = 2.4 * env;
          rx = 0.2;
          this.armR.rotation.y = Math.sin(this.gT * 12) * 0.4 * env;
          break;
        case 'deal':
          rx = -1.1 * env;
          rz = -0.3 * env;
          break;
        case 'point':
          rx = -1.4 * env;
          break;
        case 'shrug':
          lz = -0.7 * env;
          rz = 0.7 * env;
          lx = rx = -0.6 * env;
          break;
        case 'applaud': {
          const clap = Math.abs(Math.sin(this.gT * 10));
          lx = rx = -1.2 * env;
          lz = (-0.5 + clap * 0.35) * env;
          rz = (0.5 - clap * 0.35) * env;
          break;
        }
        case 'spin':
          rx = -0.9 * env;
          rz = Math.sin(this.gT * 8) * 0.5 * env;
          break;
        case 'tip':
          rx = -2.6 * env;
          rz = 0.4 * env;
          break;
        case 'play': {
          // Band members play on the beat until told otherwise.
          const b = beat * Math.PI;
          lx = -0.9 + Math.sin(b) * 0.25;
          rx = -0.9 + Math.sin(b + Math.PI) * 0.25;
          lz = -0.25;
          rz = 0.25 + Math.abs(Math.sin(b * 2)) * 0.15;
          break;
        }
      }
      if (k >= 1 && this.gesture !== 'play') this.gesture = null;
    }
    this.armL.rotation.x += (lx - this.armL.rotation.x) * Math.min(1, dt * 10);
    this.armL.rotation.z += (lz - this.armL.rotation.z) * Math.min(1, dt * 10);
    this.armR.rotation.x += (rx - this.armR.rotation.x) * Math.min(1, dt * 10);
    this.armR.rotation.z += (rz - this.armR.rotation.z) * Math.min(1, dt * 10);
    if (!this.gesture || this.gesture !== 'wave') this.armR.rotation.y *= 0.9;
  }
}

interface Bubble {
  el: HTMLElement;
  /** An automaton, or a fixed point in the world (a telegraph that talks). */
  who: Automaton | THREE.Vector3;
  left: number;
}

/** Every automaton, their eyes and their speech bubbles. */
export class Staff {
  readonly all = new Map<StaffId, Automaton>();
  private eyeMesh: THREE.InstancedMesh;
  private eyeSlots: THREE.Object3D[] = [];
  private bubbles: Bubble[] = [];
  private layer: HTMLElement;
  private owned: { dispose(): void }[] = [];

  constructor(
    private scene: THREE.Scene,
    private m: Mats,
    hud: HTMLElement,
    private camera: THREE.Camera,
    spots: [StaffId, number, number, number][],
  ) {
    const geo = new THREE.SphereGeometry(0.045, 10, 8).scale(1, 1.2, 0.6);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.6, roughness: 0.3 });
    this.owned.push(geo, mat);
    this.eyeMesh = new THREE.InstancedMesh(geo, mat, spots.length * 2);
    this.eyeMesh.frustumCulled = false;
    scene.add(this.eyeMesh);
    let k = 0;
    for (const [id, x, z, yaw] of spots) {
      const left = new THREE.Object3D();
      const right = new THREE.Object3D();
      this.eyeSlots.push(left, right);
      const a = new Automaton(id, m, x, z, yaw, { left, right });
      scene.add(a.root);
      this.all.set(id, a);
      const c = new THREE.Color(LOOKS[id].eye);
      this.eyeMesh.setColorAt(k++, c);
      this.eyeMesh.setColorAt(k++, c);
    }
    this.layer = h('div', { class: 'gp-bubbles' });
    hud.appendChild(this.layer);
  }

  get(id: StaffId): Automaton | undefined {
    return this.all.get(id);
  }

  /** A short line over an automaton's head, for a few seconds. */
  say(id: StaffId, text: string, seconds = 3.2): void {
    const who = this.all.get(id);
    if (!who) return;
    for (const b of this.bubbles.filter((x) => x.who === who)) b.left = Math.min(b.left, 0.2);
    const el = h('div', { class: 'gp-bubble', role: 'status' }, text);
    this.layer.appendChild(el);
    this.bubbles.push({ el, who, left: seconds });
  }

  /** A bubble over a point in the world, for things that are not staff. */
  sayAt(at: THREE.Vector3, text: string, seconds = 4): void {
    const el = h('div', { class: 'gp-bubble', role: 'status' }, text);
    this.layer.appendChild(el);
    this.bubbles.push({ el, who: at.clone(), left: seconds });
  }

  update(dt: number, beat: number, look: THREE.Vector3 | null): void {
    for (const a of this.all.values()) {
      if (!a.seated) a.lookAt(look && a.root.position.distanceTo(look) < 6 ? look : null);
      a.update(dt, beat);
    }
    this.eyeSlots.forEach((o, i) => {
      o.updateWorldMatrix(true, false);
      this.eyeMesh.setMatrixAt(i, tmpM.copy(o.matrixWorld));
    });
    this.eyeMesh.instanceMatrix.needsUpdate = true;
    const v = new THREE.Vector3();
    const W = innerWidth;
    const H = innerHeight;
    this.bubbles = this.bubbles.filter((b) => {
      b.left -= dt;
      if (b.left <= 0) {
        b.el.remove();
        return false;
      }
      if (b.who instanceof THREE.Vector3) v.copy(b.who);
      else b.who.bubbleAt(v);
      v.project(this.camera);
      const behind = v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2;
      b.el.style.opacity = behind ? '0' : String(Math.min(1, b.left * 3));
      // Kept wholly on screen, even when the speaker is at the edge of the view.
      const bw = b.el.offsetWidth / 2 + 8;
      const x = Math.min(W - bw, Math.max(bw, ((v.x + 1) / 2) * W));
      // Above the prompt pill along the bottom.
      const y = Math.min(H - 90, Math.max(b.el.offsetHeight + 8, ((1 - v.y) / 2) * H));
      b.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      return true;
    });
  }

  /** Builds the band's instruments on the stage. */
  instruments(): void {
    const m = this.m;
    const b = new Batch();
    const ivory = this.all.get('ivory');
    if (ivory) {
      // An upright piano behind Ivory.
      const p = ivory.root.position;
      const yaw = ivory.root.rotation.y;
      const g = new THREE.Group();
      g.position.copy(p);
      g.rotation.y = yaw;
      g.updateMatrixWorld();
      const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, col: string) => b.addMatrix(geo, m.trim, new THREE.Matrix4().makeTranslation(x, y, z).premultiply(g.matrixWorld), col);
      add(new THREE.BoxGeometry(1.4, 1.25, 0.5), 0, 0.88, 0.75, C.mahogany);
      add(new THREE.BoxGeometry(1.3, 0.06, 0.28), 0, 0.98, 0.42, '#f4e7cc');
      for (let i = 0; i < 8; i++) add(new THREE.BoxGeometry(0.05, 0.03, 0.16), -0.55 + i * 0.16, 1.02, 0.42, '#1d1830');
      add(new THREE.BoxGeometry(1.42, 0.06, 0.55), 0, 1.53, 0.75, C.mahoganyLit);
      add(new THREE.BoxGeometry(0.6, 0.06, 0.4), 0, 0.5, 0.0, C.mahoganyLit);
    }
    const strum = this.all.get('strum');
    if (strum) {
      const banjo = new THREE.Group();
      const bb = new Batch();
      bb.add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 20).rotateX(Math.PI / 2), m.trim, 0, 0, 0, 0, 0, 0, C.ivory);
      bb.add(new THREE.TorusGeometry(0.2, 0.025, 6, 20), m.trim, 0, 0, 0, 0, 0, 0, C.brassMatte);
      bb.add(new THREE.BoxGeometry(0.06, 0.6, 0.03), m.trim, 0, 0.4, 0, 0, 0, 0, C.mahogany);
      bb.build(banjo);
      banjo.rotation.z = -0.9;
      banjo.position.set(0, 1.25, 0.36);
      strum.root.add(banjo);
      strum.instrument = banjo;
    }
    const oompa = this.all.get('oompa');
    if (oompa) {
      const tuba = new THREE.Group();
      const tb = new Batch();
      tb.add(new THREE.TorusGeometry(0.22, 0.07, 10, 24), m.brass, 0, 0, 0);
      // The bell is open, so it is drawn from both sides by a second, inward-facing copy.
      tb.add(new THREE.CylinderGeometry(0.28, 0.08, 0.4, 20, 1, true), m.brass, 0.1, 0.42, 0);
      tb.add(new THREE.CylinderGeometry(0.27, 0.07, 0.39, 20, 1, true).scale(-1, 1, 1), m.brass, 0.1, 0.42, 0);
      tb.build(tuba);
      tuba.position.set(0.05, 1.3, 0.34);
      tuba.rotation.y = 0.4;
      oompa.root.add(tuba);
      oompa.instrument = tuba;
    }
    b.build(this.scene);
  }

  dispose(): void {
    this.layer.remove();
    this.eyeMesh.dispose();
    for (const o of this.owned) o.dispose();
  }
}
