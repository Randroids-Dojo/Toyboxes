// Items: capsule rows across the road, the roulette, and what each item
// does. Springs boost; a bouncy ball rolls down your lane; marbles scatter
// behind you; a soap bubble blocks one hit; a paper plane glides to the kart
// one place ahead. Hits never chain (immunity), nothing stops a kart dead,
// and nothing targets the leader from far behind.

import * as THREE from 'three';
import { BOOSTS, rollItem, type ItemId } from '../../shared/kart/rules';
import { HW, type Circuit } from './circuit';
import { Shape, ball, finish, rbox } from './build/shape';
import type { Racer } from './racer';
import { beachBall } from './build/props';

export interface ItemEvents {
  pickup(r: Racer): void;
  landed(r: Racer, id: ItemId): void;
  used(r: Racer, id: ItemId): void;
  hit(target: Racer, by: Racer | null, kind: 'spin' | 'marbles', blocked: boolean, at: THREE.Vector3): void;
  bounce(at: THREE.Vector3, speed: number): void;
}

interface Capsule {
  s: number;
  off: number;
  x: number;
  z: number;
  y: number;
  hidden: number;
}

interface Ball {
  s: number;
  off: number;
  y: number;
  speed: number;
  life: number;
  owner: Racer;
  vOff: number;
}

interface Marble {
  x: number;
  z: number;
  y: number;
  life: number;
  vx: number;
  vz: number;
  owner: Racer;
}

interface Plane {
  s: number;
  off: number;
  y: number;
  target: Racer;
  owner: Racer;
  life: number;
}

const CAPSULE_ROWS = [-3.3, -1.1, 1.1, 3.3];

export class Items {
  readonly group = new THREE.Group();
  private capsules: Capsule[] = [];
  private balls: Ball[] = [];
  private marbles: Marble[] = [];
  private planes: Plane[] = [];
  private capMesh: THREE.InstancedMesh;
  private ballMesh: THREE.InstancedMesh;
  private marbleMesh: THREE.InstancedMesh;
  private planeMesh: THREE.InstancedMesh;
  private bubbleMesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private t = 0;
  enabled = true;

  constructor(
    private c: Circuit,
    private rnd: () => number,
    private ev: ItemEvents,
  ) {
    // A two-tone toy capsule with a question mark.
    const cap = new Shape();
    cap.at(ball(0.55, 14, 7), '#fffaf0', 0, 0.02, 0, 0, 0, 0, 1, 0.9, 1);
    cap.at(new THREE.SphereGeometry(0.56, 14, 7, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#ffd24a', 0, 0, 0);
    cap.at(rbox(0.12, 0.4, 0.12, 0.05), '#e8574a', 0, 0.12, 0.5);
    cap.at(ball(0.07, 6, 5), '#e8574a', 0, -0.2, 0.52);
    const capGeo = cap.geometry();
    this.capMesh = new THREE.InstancedMesh(capGeo, finish('gloss'), 64);
    this.capMesh.castShadow = true;
    this.capMesh.frustumCulled = false;
    this.ballMesh = new THREE.InstancedMesh(beachBall(0.5).geometry(), finish('gloss'), 16);
    this.ballMesh.frustumCulled = false;
    this.ballMesh.castShadow = true;
    const mg = new THREE.SphereGeometry(0.18, 10, 8);
    this.marbleMesh = new THREE.InstancedMesh(mg, new THREE.MeshStandardMaterial({ roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.88 }), 60);
    this.marbleMesh.frustumCulled = false;
    const pl = new Shape();
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.9, -0.7, 0.05, -0.6, 0, -0.12, -0.5, 0, 0, 0.9, 0, -0.12, -0.5, 0.7, 0.05, -0.6], 3));
    wing.computeVertexNormals();
    pl.add(wing, '#fffaf0');
    const back = wing.clone();
    back.scale(1, -1, 1);
    pl.add(back, '#e8e2f6');
    this.planeMesh = new THREE.InstancedMesh(pl.geometry(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }), 8);
    this.planeMesh.frustumCulled = false;
    this.bubbleMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1.35, 20, 14),
      new THREE.MeshStandardMaterial({ color: '#bff4ff', emissive: new THREE.Color('#7ef0ff'), emissiveIntensity: 0.25, transparent: true, opacity: 0.32, roughness: 0.05, depthWrite: false }),
      8,
    );
    this.bubbleMesh.frustumCulled = false;
    this.bubbleMesh.renderOrder = 3;
    this.group.add(this.capMesh, this.ballMesh, this.marbleMesh, this.planeMesh, this.bubbleMesh);
    for (const s of c.capsules)
      for (const off of CAPSULE_ROWS) {
        const q = c.at(s, off);
        this.capsules.push({ s, off, x: q.x, z: q.z, y: q.y, hidden: 0 });
      }
  }

  reset(): void {
    this.balls = [];
    this.marbles = [];
    this.planes = [];
    for (const k of this.capsules) k.hidden = 0;
  }

  /** Capsules and bubbles; whether any capsule rows are shown at all. */
  show(on: boolean): void {
    this.group.visible = on;
  }

  /** The kart one place ahead of r, for the plane. */
  private ahead(r: Racer, racers: Racer[]): Racer | null {
    const sorted = [...racers].sort((a, b) => a.place - b.place);
    const i = sorted.indexOf(r);
    return i > 0 ? sorted[i - 1] : null;
  }

  /** Uses r's item. */
  use(r: Racer, racers: Racer[]): void {
    const id = r.item;
    if (!id || r.roulette > 0) return;
    const k = r.kart;
    if (id === 'spring' || id === 'triple') {
      k.boost = Math.max(k.boost, BOOSTS.spring);
      if (id === 'triple' && r.itemCount > 1) r.itemCount--;
      else r.item = null;
    } else if (id === 'ball') {
      this.balls.push({ s: r.s + 2.2, off: r.off, y: k.pos.y + 0.5, speed: Math.max(24, k.speed + 8), life: 3.5, owner: r, vOff: 0 });
      r.item = null;
    } else if (id === 'marbles') {
      const fx = Math.sin(k.yaw);
      const fz = Math.cos(k.yaw);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        this.marbles.push({ x: k.pos.x - fx * 2 + Math.cos(a) * 0.9, z: k.pos.z - fz * 2 + Math.sin(a) * 0.9, y: k.pos.y + 0.6, life: 15, vx: Math.cos(a) * 1.5 - fx * 2, vz: Math.sin(a) * 1.5 - fz * 2, owner: r });
      }
      if (this.marbles.length > 60) this.marbles.splice(0, this.marbles.length - 60);
      r.item = null;
    } else if (id === 'bubble') {
      k.bubble = 8;
      r.item = null;
    } else if (id === 'plane') {
      const target = this.ahead(r, racers);
      r.item = null;
      if (target) this.planes.push({ s: r.s + 1, off: r.off, y: k.pos.y + 2.5, target, owner: r, life: 9 });
    }
    this.ev.used(r, id);
  }

  /** Seconds until a plane or ball reaches r, if one is coming. */
  threat(r: Racer): number | null {
    for (const p of this.planes) if (p.target === r) return Math.max(0, this.c.path.delta(p.s, r.s)) / 30;
    for (const b of this.balls) {
      const d = this.c.path.delta(b.s, r.s);
      if (d > 0 && d < 20 && Math.abs(b.off - r.off) < 1.6 && b.owner !== r) return d / b.speed;
    }
    return null;
  }

  /** Where marbles and balls sit, for the computer drivers to steer round. */
  danger(s: number): { off: number; width: number } | null {
    for (const b of this.balls) if (Math.abs(this.c.path.delta(b.s, s)) < 6) return { off: b.off, width: 1.6 };
    for (const m of this.marbles) {
      const n = this.c.path.nearest(m.x, m.z);
      if (Math.abs(this.c.path.delta(n.s, s)) < 4) return { off: n.offset, width: 1.6 };
    }
    return null;
  }

  update(dt: number, racers: Racer[], racing: boolean): void {
    this.t += dt;
    const c = this.c;
    // ---- Capsules: drive through one with an empty slot.
    for (const k of this.capsules) {
      k.hidden = Math.max(0, k.hidden - dt);
      if (k.hidden > 0 || !this.enabled || !racing) continue;
      for (const r of racers) {
        if (r.grab || r.finishedAt !== null) continue;
        const p = r.kart.pos;
        if (Math.abs(p.x - k.x) > 1.6 || Math.abs(p.z - k.z) > 1.6) continue;
        if (Math.hypot(p.x - k.x, p.z - k.z) > 1.35 || Math.abs(p.y - k.y) > 1.5) continue;
        k.hidden = 1.5;
        if (!r.item && r.roulette <= 0) {
          r.roulette = 1.0;
          this.ev.pickup(r);
        }
        break;
      }
    }
    // ---- Roulettes land.
    for (const r of racers) {
      if (r.roulette <= 0) continue;
      r.roulette -= dt;
      if (r.roulette <= 0) {
        r.roulette = 0;
        r.item = rollItem(r.place, racers.length, this.rnd());
        r.itemCount = r.item === 'triple' ? 3 : 1;
        r.ai.holdFor = 0;
        this.ev.landed(r, r.item);
      }
    }
    // ---- Balls roll down their lane, bounce off the rails.
    this.balls = this.balls.filter((b) => {
      b.life -= dt;
      b.s += b.speed * dt;
      b.off += b.vOff * dt;
      b.vOff *= 1 - dt * 0.5;
      if (Math.abs(b.off) > HW - 0.6) {
        b.off = Math.sign(b.off) * (HW - 0.6);
        b.vOff = -Math.sign(b.off) * 3;
        this.ev.bounce(this.pos(b.s, b.off, b.y), b.speed);
      }
      const ground = c.profile.h(b.s);
      b.y += (ground + 0.5 + Math.abs(Math.sin(this.t * 9 + b.s)) * 0.6 - b.y) * Math.min(1, dt * 12);
      for (const r of racers) {
        if (r === b.owner && b.life > 3.2) continue;
        if (r.grab) continue;
        const d = Math.abs(c.path.delta(r.s, b.s));
        if (d < 1.3 && Math.abs(r.off - b.off) < 1.3 && Math.abs(r.kart.pos.y - b.y + 0.5) < 1.4) {
          // Karts still flashing from a hit let it pass.
          if (r.kart.immune > 0 && r.kart.bubble <= 0) continue;
          const landed = r.kart.hit('spin');
          this.ev.hit(r, b.owner, 'spin', !landed, this.pos(b.s, b.off, b.y));
          return false;
        }
      }
      return b.life > 0;
    });
    // ---- Marbles settle, scatter when hit.
    this.marbles = this.marbles.filter((m) => {
      m.life -= dt;
      m.x += m.vx * dt;
      m.z += m.vz * dt;
      m.vx *= 1 - dt * 3;
      m.vz *= 1 - dt * 3;
      const n = c.path.nearest(m.x, m.z);
      const g = c.profile.ground(n.s, n.offset) + 0.18;
      m.y += (g - m.y) * Math.min(1, dt * 10);
      for (const r of racers) {
        if (r.grab || (r === m.owner && m.life > 14.4)) continue;
        const p = r.kart.pos;
        if (Math.hypot(p.x - m.x, p.z - m.z) < 1.1 && Math.abs(p.y - m.y) < 1) {
          if (r.kart.immune > 0 && r.kart.bubble <= 0) continue;
          const blocked = !r.kart.hit('marbles');
          this.ev.hit(r, m.owner, 'marbles', blocked, new THREE.Vector3(m.x, m.y, m.z));
          // The bag scatters: nearby marbles roll away.
          for (const o of this.marbles) if (Math.hypot(o.x - m.x, o.z - m.z) < 2.5) o.life = Math.min(o.life, 0.4);
          return false;
        }
      }
      return m.life > 0;
    });
    // ---- Planes glide along the road to their target.
    this.planes = this.planes.filter((p) => {
      p.life -= dt;
      const t = p.target;
      const d = c.path.delta(p.s, t.s);
      p.s += Math.min(30 * dt, Math.max(0, d) + 0.5);
      p.off += (t.off - p.off) * Math.min(1, dt * (d < 15 ? 6 : 1.5));
      const want = c.profile.h(p.s) + (d < 6 ? 1 + d * 0.3 : 3);
      p.y += (want - p.y) * Math.min(1, dt * 4);
      if (d < 1.2 || t.finishedAt !== null) {
        if (t.finishedAt === null && !(t.kart.immune > 0 && t.kart.bubble <= 0)) {
          const blocked = !t.kart.hit('spin');
          this.ev.hit(t, p.owner, 'spin', blocked, t.kart.pos.clone());
        }
        return false;
      }
      return p.life > 0;
    });
    this.draw(racers);
  }

  private pos(s: number, off: number, y: number): THREE.Vector3 {
    const q = this.c.at(s, off);
    return new THREE.Vector3(q.x, y, q.z);
  }

  private draw(racers: Racer[]): void {
    let i = 0;
    for (const k of this.capsules) {
      const shown = this.enabled && k.hidden <= 0;
      const pop = k.hidden > 0 && k.hidden < 0.3 ? 1 - k.hidden / 0.3 : 1;
      if (!shown && k.hidden >= 0.3) continue;
      this.e.set(0, this.t * 2 + k.off, Math.sin(this.t * 3 + k.off) * 0.2);
      this.q.setFromEuler(this.e);
      const sc = (shown ? 1 : pop) * (1 + Math.sin(this.t * 6 + k.off) * 0.04);
      this.m.compose(this.v.set(k.x, k.y + 1.0 + Math.sin(this.t * 2.5 + k.off) * 0.15, k.z), this.q, this.one.clone().setScalar(sc));
      this.capMesh.setMatrixAt(i++, this.m);
    }
    this.capMesh.count = i;
    this.capMesh.instanceMatrix.needsUpdate = true;
    i = 0;
    for (const b of this.balls) {
      const q = this.c.at(b.s, b.off);
      this.e.set(this.t * 14, 0, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(q.x, b.y, q.z), this.q, this.one.clone().setScalar(1));
      this.ballMesh.setMatrixAt(i++, this.m);
    }
    this.ballMesh.count = i;
    this.ballMesh.instanceMatrix.needsUpdate = true;
    i = 0;
    const cols = ['#7ef0ff', '#ff8fd1', '#b6ff8a', '#ffd24a', '#8a6bd1'];
    for (const m of this.marbles) {
      this.m.makeTranslation(m.x, m.y, m.z);
      this.marbleMesh.setMatrixAt(i, this.m);
      this.marbleMesh.setColorAt(i, new THREE.Color(cols[i % cols.length]));
      i++;
    }
    this.marbleMesh.count = i;
    this.marbleMesh.instanceMatrix.needsUpdate = true;
    if (this.marbleMesh.instanceColor) this.marbleMesh.instanceColor.needsUpdate = true;
    i = 0;
    for (const p of this.planes) {
      const q = this.c.at(p.s, p.off);
      this.e.set(Math.sin(this.t * 4) * 0.1, q.heading, Math.sin(this.t * 3) * 0.25, 'YXZ');
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(q.x, p.y, q.z), this.q, this.one.clone().setScalar(1.2));
      this.planeMesh.setMatrixAt(i++, this.m);
    }
    this.planeMesh.count = i;
    this.planeMesh.instanceMatrix.needsUpdate = true;
    i = 0;
    for (const r of racers) {
      if (r.kart.bubble <= 0 || !r.kart.root.visible) continue;
      const wob = 1 + Math.sin(this.t * 7 + i) * 0.04;
      const fade = r.kart.bubble < 1.5 ? (Math.sin(this.t * 20) > 0 ? 1 : 0.85) : 1;
      this.m.makeScale(wob * fade, wob * 0.85 * fade, wob * 1.1 * fade).setPosition(r.kart.pos.x, r.kart.pos.y + 0.7, r.kart.pos.z);
      this.bubbleMesh.setMatrixAt(i++, this.m);
    }
    this.bubbleMesh.count = i;
    this.bubbleMesh.instanceMatrix.needsUpdate = true;
  }

  /** For the HUD: whether a plane is homing in on r within 1.5 s. */
  incoming(r: Racer): boolean {
    return this.planes.some((p) => p.target === r && this.c.path.delta(p.s, r.s) < 45);
  }

  debug() {
    return { capsules: this.capsules.length, visible: this.capsules.filter((k) => k.hidden <= 0).length, balls: this.balls.length, marbles: this.marbles.length, planes: this.planes.length };
  }

  /** Capsule positions, for playtests. */
  capsuleSpots(): { s: number; off: number }[] {
    return this.capsules.map((k) => ({ s: k.s, off: k.off }));
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    for (const m of [this.capMesh, this.ballMesh, this.marbleMesh, this.planeMesh, this.bubbleMesh]) m.geometry.dispose();
    (this.marbleMesh.material as THREE.Material).dispose();
    (this.planeMesh.material as THREE.Material).dispose();
    (this.bubbleMesh.material as THREE.Material).dispose();
  }
}

