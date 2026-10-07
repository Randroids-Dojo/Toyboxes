// Rideable scooter and go-kart. Arcade handling: easy to steer, quick to
// stop, forgiving against walls. On a race track karts also get a grip
// limit in corners, drifting with a mini-turbo, and boosts.

import * as THREE from 'three';
import { blob, cached, mesh, plastic, roundBox } from './kit';
import { clamp, damp, resolveCircle, type Collider } from './physics';
import { KART_BOOST } from '../shared/track';

export type VehicleKind = 'scooter' | 'kart';

export interface Tuning {
  maxSpeed: number;
  reverse: number;
  accel: number;
  brake: number;
  drag: number;
  turn: number;
  radius: number;
  seatY: number;
}

/** Sideways grip on a race track, m/s squared: higher while drifting. */
const RACE_GRIP = 11;
const DRIFT_GRIP = 19;
/** Seconds of drifting for the first and second mini-turbo. */
export const DRIFT_STAGES = [0.6, 1.4];

const TUNING: Record<VehicleKind, Tuning> = {
  kart: { maxSpeed: 14, reverse: 4.5, accel: 9, brake: 22, drag: 2.2, turn: 2.3, radius: 0.85, seatY: 0.42 },
  scooter: { maxSpeed: 8.5, reverse: 2.5, accel: 5.5, brake: 16, drag: 1.6, turn: 2.8, radius: 0.5, seatY: 0.16 },
};

export class Vehicle {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly seat = new THREE.Group();
  /** Handling numbers. Race karts give themselves their own copy to tune. */
  t: Tuning;
  pos = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  steer = 0;
  ridden = false;
  /** 1 on tarmac; lower on grass, which caps speed and acceleration. */
  grip = 1;
  /** Held still, e.g. on the grid before a race starts. */
  frozen = false;
  readonly home: { x: number; z: number; yaw: number };
  protected wheels: THREE.Object3D[] = [];
  protected frontPivots: THREE.Object3D[] = [];
  protected lean = 0;
  bumped = 0;
  /** Race track rules: corner grip, drifting and boosts. */
  racing = false;
  /** Seconds of boost left. */
  boost = 0;
  /** Drift direction (1 left, -1 right) or 0. */
  drift = 0;
  /** Seconds spent in the current drift. */
  driftTime = 0;
  /** Set when a drift ends with a mini-turbo: 1 or 2. Read and cleared by the track. */
  turbo = 0;
  /** The last throttle input, for rocket starts. */
  throttleIn = 0;
  /** Visual slide angle while drifting. */
  protected slide = 0;
  /** How fast a drift charges its mini-turbo (1 is normal). */
  driftRate = 1;
  /** A drift's turn: share of full turn with the stick centred, and how much steering into or out of it adds. */
  protected driftArc = { base: 0.45, into: 0.55, out: 0.3 };

  constructor(
    readonly kind: VehicleKind,
    readonly id: string,
    x: number,
    z: number,
    yaw: number,
    color: string,
  ) {
    this.t = TUNING[kind];
    this.home = { x, z, yaw };
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.root.add(this.body);
    if (kind === 'kart') this.buildKart(color);
    else this.buildScooter(color);
    const shadow = blob(kind === 'kart' ? 2.6 : 1.4);
    shadow.scale.z *= kind === 'kart' ? 1.3 : 1.6;
    this.root.add(shadow);
    this.sync();
  }

  protected wheel(r: number, w: number): THREE.Mesh {
    const g = cached(`wheel${r}${w}`, () => new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2));
    return mesh(g, plastic('#24212e', { rough: 0.85 }));
  }

  protected buildKart(color: string): void {
    const paint = plastic(color, { rough: 0.45 });
    const dark = plastic('#2b2738', { rough: 0.7 });
    this.body.add(mesh(roundBox(1.15, 0.22, 1.9, 0.08), dark, 0, 0.24, 0));
    this.body.add(mesh(roundBox(1.0, 0.32, 0.7, 0.12), paint, 0, 0.42, 0.62));
    this.body.add(mesh(roundBox(0.9, 0.5, 0.18, 0.08), paint, 0, 0.58, -0.38));
    this.body.add(mesh(roundBox(1.3, 0.12, 0.28, 0.05), paint, 0, 0.3, 1.02));
    this.body.add(mesh(roundBox(1.4, 0.1, 0.3, 0.05), dark, 0, 0.62, -0.92));
    const wheelGeo: [number, number, boolean][] = [
      [-0.62, 0.62, true],
      [0.62, 0.62, true],
      [-0.66, -0.62, false],
      [0.66, -0.62, false],
    ];
    for (const [x, z, front] of wheelGeo) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.24, z);
      const w = this.wheel(front ? 0.22 : 0.26, front ? 0.2 : 0.28);
      pivot.add(w);
      this.body.add(pivot);
      this.wheels.push(w);
      if (front) this.frontPivots.push(pivot);
    }
    const column = mesh(cached('col', () => new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8)), dark, 0, 0.62, 0.42);
    column.rotation.x = -0.9;
    this.body.add(column);
    const wheel = mesh(cached('swheel', () => new THREE.TorusGeometry(0.16, 0.035, 8, 20)), dark, 0, 0.78, 0.28);
    wheel.rotation.x = -0.6;
    this.body.add(wheel);
    this.seat.position.set(0, this.t.seatY, -0.18);
    this.body.add(this.seat);
  }

  private buildScooter(color: string): void {
    const paint = plastic(color, { rough: 0.4 });
    const dark = plastic('#2b2738', { rough: 0.7 });
    this.body.add(mesh(roundBox(0.32, 0.07, 0.95, 0.03), paint, 0, 0.14, -0.05));
    const stem = mesh(cached('stem', () => new THREE.CylinderGeometry(0.035, 0.035, 0.95, 8)), dark, 0, 0.6, 0.43);
    stem.rotation.x = -0.18;
    this.body.add(stem);
    const bar = mesh(cached('bar', () => new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8).rotateZ(Math.PI / 2)), dark, 0, 1.06, 0.52);
    this.body.add(bar);
    for (const x of [-0.3, 0.3]) this.body.add(mesh(roundBox(0.1, 0.07, 0.07, 0.03), paint, x, 1.06, 0.52));
    const front = new THREE.Group();
    front.position.set(0, 0.1, 0.45);
    const fw = this.wheel(0.1, 0.07);
    front.add(fw);
    this.body.add(front);
    const rw = this.wheel(0.1, 0.07);
    rw.position.set(0, 0.1, -0.5);
    this.body.add(rw);
    this.wheels.push(fw, rw);
    this.frontPivots.push(front);
    this.seat.position.set(0, this.t.seatY, -0.12);
    this.body.add(this.seat);
  }

  /**
   * One physics step. `throttle` -1..1 (negative brakes, then reverses),
   * `steer` -1..1 (positive turns left), `brake` 0..1 extra braking.
   */
  drive(dt: number, throttle: number, steer: number, brake: number, colliders: Collider[]): void {
    const t = this.t;
    this.throttleIn = throttle;
    if (this.frozen) {
      this.speed = 0;
      this.drift = 0;
      this.steer += (steer - this.steer) * damp(10, dt);
      for (const p of this.frontPivots) p.rotation.y = this.steer * 0.45;
      this.sync();
      return;
    }
    if (this.racing) brake = this.driftInput(dt, steer, brake);
    const boosting = this.boost > 0;
    this.boost = Math.max(0, this.boost - dt);
    const top = t.maxSpeed * this.grip * (boosting ? KART_BOOST : 1);
    if (boosting && this.speed < top) this.speed = Math.min(top, this.speed + 26 * dt);
    if (brake > 0.05) {
      const s = Math.sign(this.speed);
      this.speed -= s * t.brake * brake * dt;
      if (Math.sign(this.speed) !== s) this.speed = 0;
    }
    if (throttle > 0.02) {
      if (this.speed < 0) this.speed += t.brake * throttle * dt;
      else if (this.speed < top) this.speed += t.accel * (0.55 + 0.45 * this.grip) * throttle * (1 - (this.speed / top) ** 2) * dt;
    } else if (throttle < -0.02) {
      if (this.speed > 0.3) this.speed -= t.brake * -throttle * dt;
      else this.speed = Math.max(-t.reverse, this.speed - t.accel * 0.7 * -throttle * dt);
    } else {
      const s = Math.sign(this.speed);
      this.speed -= s * t.drag * dt;
      if (Math.sign(this.speed) !== s) this.speed = 0;
    }
    // Running wide onto grass scrubs speed down to what the grass allows; a boost fades gently.
    if (this.speed > top) this.speed = Math.max(top, this.speed - (this.grip < 1 ? 14 : 5) * dt);
    this.speed = clamp(this.speed, -t.reverse, t.maxSpeed * (this.racing ? KART_BOOST : 1));
    this.steer += (steer - this.steer) * damp(10, dt);
    // Turn rate builds with speed, then eases off near top speed for stability.
    const v = Math.abs(this.speed);
    const grip = Math.min(1, v / 3) * (1 - 0.35 * Math.min(1, v / t.maxSpeed));
    let rate = this.steer * t.turn * grip;
    if (this.drift) {
      // Steering into the drift tightens it, steering out widens it, but it always turns.
      const into = this.steer * this.drift;
      const a = this.driftArc;
      rate = this.drift * t.turn * 1.1 * (into >= 0 ? a.base + a.into * into : a.base + a.out * into);
    }
    // Tyres only hold so much in a corner: too fast and the kart runs wide.
    if (this.racing && v > 1) {
      const cap = (this.drift ? DRIFT_GRIP : RACE_GRIP) / v;
      rate = clamp(rate, -cap, cap);
    }
    this.yaw += rate * Math.sign(this.speed || 1) * dt;
    this.slide += ((this.drift ? this.drift * 0.38 : 0) - this.slide) * damp(8, dt);

    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    // Things lower than the kart (a kerb under a raised deck) pass under it.
    const hit = resolveCircle(this.pos, t.radius, colliders, this.pos.y);
    if (hit) {
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const into = -(fx * hit.nx + fz * hit.nz) * Math.sign(this.speed);
      if (into > 0.25 && v > 2.5) this.bumped = v;
      // Glancing hits keep most speed so walls guide rather than stop you.
      this.speed *= 1 - 0.75 * Math.max(0, into);
    }
    const leanTarget = this.kind === 'scooter' ? -this.steer * Math.min(1, v / 5) * 0.32 : -this.steer * Math.min(1, v / 8) * 0.06;
    this.lean += (leanTarget - this.lean) * damp(8, dt);
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / (this.kind === 'kart' ? 0.24 : 0.1);
    for (const p of this.frontPivots) p.rotation.y = this.steer * 0.45;
    this.sync();
  }

  /** Coasting to a stop with nobody aboard. */
  idle(dt: number, colliders: Collider[]): void {
    if (Math.abs(this.speed) > 0.01) this.drive(dt, 0, 0, 0.4, colliders);
  }

  /**
   * Holding brake while turning at speed starts a drift instead of braking.
   * Letting go after long enough gives a mini-turbo. Returns the brake to apply.
   */
  protected driftInput(dt: number, steer: number, brake: number): number {
    if (!this.drift) {
      if (brake > 0.5 && Math.abs(steer) > 0.3 && this.speed > 8 && this.grip >= 1) {
        this.drift = Math.sign(steer);
        this.driftTime = 0;
      }
      return this.drift ? 0 : brake;
    }
    if (brake > 0.5 && this.speed > 5.5 && this.grip >= 1) {
      this.driftTime += dt * this.driftRate;
      // A drift bleeds a little speed.
      this.speed -= 1.2 * dt;
      return 0;
    }
    const stage = this.grip >= 1 ? DRIFT_STAGES.filter((s) => this.driftTime >= s).length : 0;
    if (stage) {
      this.boost = Math.max(this.boost, stage === 2 ? 1.0 : 0.5);
      this.turbo = stage;
    }
    this.drift = 0;
    this.driftTime = 0;
    return 0;
  }

  /** 0 none, 1 or 2 when a mini-turbo is charged. */
  get driftStage(): number {
    return this.drift ? DRIFT_STAGES.filter((s) => this.driftTime >= s).length : 0;
  }

  sync(): void {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.body.rotation.y = this.slide;
    this.body.rotation.z = this.lean;
  }

  park(): void {
    this.pos.set(this.home.x, 0, this.home.z);
    this.yaw = this.home.yaw;
    this.speed = 0;
    this.steer = 0;
    this.lean = 0;
    this.drift = 0;
    this.boost = 0;
    this.slide = 0;
    this.sync();
  }

  get velocity(): { x: number; z: number } {
    return { x: Math.sin(this.yaw) * this.speed, z: Math.cos(this.yaw) * this.speed };
  }
}
