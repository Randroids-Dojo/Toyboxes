// A race kart: the town kart's handling (grip limit, drifts, mini-turbos,
// boosts) with a body you choose, a simulated height for crests and jumps,
// spin-outs, tricks in the air, and the assists and remote layout that let
// every device drive it. The player's kart reads its own assists here; the
// computer drivers pass their inputs straight through.

import * as THREE from 'three';
import { BODIES, CLASSES, HITS, type Body, type BodyId, type SpeedClass } from '../../shared/kart/rules';
import { type Collider } from '../../world/physics';
import { Vehicle } from '../../world/vehicles';
import { Shape, ball, cyl, finish, rbox, torus } from './build/shape';

export interface Assists {
  /** Gas is always on unless you pull back. */
  autoGas: boolean;
  /** Hold a full turn at speed to slide; straighten up to cash in. */
  easyDrift: boolean;
  /** Near the road edge, the steering pulls you back a little. */
  steerAssist: boolean;
  /** TV remote: OK drifts, Up uses the item. */
  remote: boolean;
}

export type Hit = 'spin' | 'marbles' | 'tail';

const WHEELS: [number, number, boolean][] = [
  [-0.62, 0.62, true],
  [0.62, 0.62, true],
  [-0.66, -0.62, false],
  [0.66, -0.62, false],
];

export class RaceKart extends Vehicle {
  bodyId: BodyId = 'classic';
  paint: string;
  /** Simulated height: in the air, vertical speed, and the ground below. */
  air = false;
  vy = 0;
  groundY = 0;
  airTime = 0;
  /** Set on landing to how hard it was (m/s down), read and cleared by the world. */
  landed = 0;
  /** Spin-out left, seconds, and its visual angle. */
  spinT = 0;
  private spinAng = 0;
  private spinRate = 0;
  /** No more hits until this runs out. */
  immune = 0;
  /** Soap bubble shield left, seconds. */
  bubble = 0;
  /** Trick in the air: time left in the animation and which. */
  trickT = 0;
  trickKind: 'flip' | 'roll' = 'flip';
  /** A trick landed cleanly earns a boost on touchdown. */
  trickDone = false;
  private hopT = 0;
  private squashT = 0;
  /** The player's kart reads assists; computer karts don't. */
  player = false;
  assists: Assists = { autoGas: false, easyDrift: false, steerAssist: false, remote: false };
  /** Remote layout: the drift toggled on with OK. */
  remoteDrift = false;
  private easyFor = 0;
  private easyOn = false;
  private lastSteer = 0;
  private lastSteerAge = 9;
  /** The drift button is still held after a drift ended: it never turns into a brake. */
  private brakeLatch = false;
  /** How long the drift button has been held, for a forgiving drift start. */
  private brakeHeld = 0;
  /** Playtests: something else drives this kart (the computer drivers' brain). */
  auto: ((dt: number) => { throttle: number; steer: number; brake: number }) | null = null;
  /** Signed sideways offset from the centre line, set by the world each step. */
  edgeOff = 0;
  /** Whether the kart is on the road surface (not grass or sand). */
  onRoad = true;
  /** Visual-only rigs. */
  readonly wheelNodes: THREE.Object3D[] = [];
  readonly exhaust: THREE.Vector3[] = [];
  private shadow: THREE.Object3D | null;
  readonly bodyMesh: THREE.Mesh;

  constructor(id: string, x: number, z: number, yaw: number, paint: string, body: BodyId, cls: SpeedClass = CLASSES.battery) {
    super('kart', id, x, z, yaw, paint);
    this.paint = paint;
    this.racing = true;
    this.t = { ...this.t };
    // With the stick centred a drift follows a normal corner; steer in to tighten, out to widen.
    this.driftArc = { base: 0.3, into: 0.62, out: 0.25 };
    // Swap the town kart's parts for this body.
    this.body.clear();
    this.wheels.length = 0;
    this.frontPivots.length = 0;
    this.shadow = this.root.children.find((c) => c !== this.body) ?? null;
    this.bodyMesh = new THREE.Mesh();
    this.body.add(this.bodyMesh);
    for (const [wx, wz, front] of WHEELS) {
      const pivot = new THREE.Object3D();
      pivot.position.set(wx, 0.24, wz);
      const w = new THREE.Object3D();
      w.userData.r = front ? 0.22 : 0.26;
      w.userData.w = front ? 0.2 : 0.28;
      pivot.add(w);
      this.body.add(pivot);
      this.wheels.push(w);
      this.wheelNodes.push(w);
      if (front) this.frontPivots.push(pivot);
    }
    this.seat.position.set(0, this.t.seatY, -0.18);
    this.body.add(this.seat);
    this.setup(body, paint, cls);
  }

  /** Body shape, paint and speed class. */
  setup(bodyId: BodyId, paint: string, cls: SpeedClass): void {
    this.bodyId = bodyId;
    this.paint = paint;
    const b = BODIES[bodyId];
    this.applyClass(cls, b);
    this.bodyMesh.geometry.dispose();
    const shape = buildBody(bodyId, paint);
    const m = shape.mesh('plastic');
    this.bodyMesh.geometry = m.geometry;
    this.bodyMesh.material = m.material;
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    const big = bodyId === 'chunky';
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      this.wheelNodes[i].userData.r = front ? (big ? 0.24 : 0.22) : big ? 0.3 : bodyId === 'zippy' ? 0.25 : 0.26;
      this.wheelNodes[i].userData.w = front ? 0.2 : big ? 0.32 : 0.28;
    }
    this.exhaust.length = 0;
    for (const sx of [-0.2, 0.2]) this.exhaust.push(new THREE.Vector3(sx, 0.42, -1.12));
  }

  applyClass(cls: SpeedClass, b: Body = BODIES[this.bodyId]): void {
    this.t.maxSpeed = cls.top * b.top;
    this.t.accel = cls.accel * b.accel;
    this.t.turn = 2.3 * b.turn;
    this.driftRate = b.charge;
  }

  get body_(): Body {
    return BODIES[this.bodyId];
  }

  /** A hit from an item or hazard. Returns false when immune or shielded. */
  hit(kind: Hit): boolean {
    if (this.immune > 0) return false;
    if (this.bubble > 0) {
      this.bubble = 0;
      this.immune = 0.6;
      return false;
    }
    const h = HITS[kind === 'spin' ? 'spin' : kind === 'marbles' ? 'marbles' : 'tail'];
    this.speed *= h.keep;
    this.boost = 0;
    this.drift = 0;
    this.driftTime = 0;
    this.remoteDrift = false;
    const stun = h.stun * (kind === 'spin' ? this.body_.spin : 1);
    this.spinT = stun;
    this.spinRate = kind === 'spin' ? (Math.PI * 2) / stun : 0;
    this.immune = HITS.immune + stun;
    return true;
  }

  /** Starts a trick if in the air and not already doing one. */
  trick(): boolean {
    if (!this.air || this.trickT > 0 || this.trickDone || this.vy < -6) return false;
    this.trickKind = Math.random() < 0.5 ? 'flip' : 'roll';
    this.trickT = 0.45;
    this.trickDone = true;
    return true;
  }

  /** Remote layout: OK starts a drift toward the last steer, or cashes it in. */
  toggleRemoteDrift(): 'start' | 'end' | null {
    if (this.remoteDrift || this.drift) {
      this.remoteDrift = false;
      return 'end';
    }
    const dir = Math.abs(this.steer) > 0.25 ? Math.sign(this.steer) : this.lastSteerAge < 0.6 ? this.lastSteer : 0;
    if (!dir || this.speed < 8 || !this.onRoad || this.air) return null;
    this.drift = dir;
    this.driftTime = 0;
    this.remoteDrift = true;
    return 'start';
  }

  drive(dt: number, throttle: number, steer: number, brake: number, colliders: Collider[]): void {
    if (this.auto && !this.frozen) ({ throttle, steer, brake } = this.auto(dt));
    this.immune = Math.max(0, this.immune - dt);
    this.bubble = Math.max(0, this.bubble - dt);
    if (Math.abs(steer) > 0.3) {
      this.lastSteer = Math.sign(steer);
      this.lastSteerAge = 0;
    } else this.lastSteerAge += dt;
    if (this.player && !this.frozen) {
      // Still holding drift after the drift ended (off the road, or too slow): ignore it until let go.
      if (brake < 0.5) this.brakeLatch = false;
      if (this.brakeLatch) brake = 0;
      this.brakeHeld = brake > 0.5 ? this.brakeHeld + dt : 0;
      const a = this.assists;
      if (a.autoGas && throttle > -0.35) throttle = 1;
      if (a.remote) {
        brake = this.remoteDrift ? 1 : 0;
        if (this.remoteDrift && !this.drift) this.remoteDrift = false;
      } else if (a.easyDrift && brake < 0.5) {
        const wantSlide = Math.abs(steer) > 0.9 && this.speed > 9 && this.onRoad;
        this.easyFor = wantSlide ? this.easyFor + dt : 0;
        if (!this.easyOn && this.easyFor > 0.3) this.easyOn = true;
        if (this.easyOn && (Math.abs(steer) < 0.2 || steer * this.drift < -0.3 || (!this.drift && this.easyFor === 0))) this.easyOn = false;
        if (this.easyOn) brake = 1;
      }
      if (a.steerAssist && Math.abs(this.edgeOff) > 3.4 && !this.drift) {
        const pull = Math.min(1, (Math.abs(this.edgeOff) - 3.4) / 1.5) * 0.3;
        // Left of centre is positive: steer right (negative) to come back.
        steer = Math.max(-1, Math.min(1, steer - Math.sign(this.edgeOff) * pull));
      }
    }
    if (this.spinT > 0) {
      this.spinT = Math.max(0, this.spinT - dt);
      this.spinAng += this.spinRate * dt;
      throttle = 0;
      steer = 0;
      brake = 0.3;
      if (this.spinT === 0) this.spinAng = 0;
    }
    if (this.air) {
      steer *= 0.3;
      brake = 0;
      throttle = 0;
      this.drift = 0;
    }
    const drifting = this.drift !== 0;
    super.drive(dt, throttle, steer, brake, colliders);
    if (this.player && drifting && !this.drift && brake > 0.5) this.brakeLatch = true;
    if (this.drift && this.driftTime < dt * 1.5 && !this.air) this.hopT = 0.22;
  }

  /**
   * The player's drift press is forgiving: a turn from just before the press
   * counts, and a press waits a moment for the turn before it brakes.
   */
  protected override driftInput(dt: number, steer: number, brake: number): number {
    const fresh = this.player && !this.drift && brake > 0.5 && this.brakeHeld < 0.25;
    if (fresh && Math.abs(steer) <= 0.3 && this.lastSteerAge < 0.25) steer = this.lastSteer;
    const out = super.driftInput(dt, steer, brake);
    return fresh && !this.drift && this.brakeHeld < 0.2 && this.speed > 8 ? 0 : out;
  }

  /** Vertical motion over the ground height for this step. Returns the landing speed on touchdown, else 0. */
  stepHeight(dt: number, ground: number, gap: boolean): number {
    this.groundY = ground;
    const g = 14;
    if (!this.air) {
      const prev = this.pos.y;
      // The ground drops away faster than gravity can follow: take off.
      const drop = prev - ground;
      if (drop > 0.08 || (gap && prev > ground + 0.02)) {
        this.air = true;
        this.airTime = 0;
        this.trickDone = false;
        return 0;
      }
      this.vy = (ground - prev) / Math.max(dt, 1e-4);
      this.pos.y = ground;
      return 0;
    }
    this.airTime += dt;
    this.vy -= g * dt;
    this.pos.y += this.vy * dt;
    if (this.trickT > 0) this.trickT = Math.max(0, this.trickT - dt);
    if (this.pos.y <= ground) {
      const impact = -this.vy;
      this.pos.y = ground;
      this.air = false;
      this.vy = 0;
      this.squashT = 0.25;
      this.landed = Math.max(0.01, impact);
      return this.landed;
    }
    return 0;
  }

  /** Launch speed up a ramp: carry the ground's climb into the air. */
  get climb(): number {
    return this.vy;
  }

  sync(): void {
    super.sync();
    if (!this.bodyMesh) return;
    this.hopT = Math.max(0, this.hopT - 1 / 60);
    this.squashT = Math.max(0, this.squashT - 1 / 60);
    const hop = this.hopT > 0 ? Math.sin((1 - this.hopT / 0.22) * Math.PI) * 0.25 : 0;
    this.body.position.y = hop;
    this.body.rotation.y += this.spinAng;
    if (this.trickT > 0) {
      const t = 1 - this.trickT / 0.45;
      const a = (1 - Math.cos(t * Math.PI)) * Math.PI;
      if (this.trickKind === 'flip') this.body.rotation.x = -a;
      else this.body.rotation.z += a;
    } else this.body.rotation.x = this.air ? Math.max(-0.35, Math.min(0.35, -this.vy * 0.03)) : 0;
    const sq = this.squashT > 0 ? Math.sin((this.squashT / 0.25) * Math.PI) * 0.18 : 0;
    this.body.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.3);
    if (this.shadow) {
      this.shadow.position.y = this.groundY - this.pos.y + 0.03;
      const k = Math.max(0.4, 1 - (this.pos.y - this.groundY) * 0.15);
      this.shadow.scale.set(2.6 * k, 1, 2.6 * 1.3 * k);
    }
  }

  setShadowBlob(on: boolean): void {
    if (this.shadow) this.shadow.visible = on;
  }

  /** Back to the ground and calm, e.g. on the grid or after the Grabber. */
  reset(): void {
    this.air = false;
    this.vy = 0;
    this.spinT = 0;
    this.spinAng = 0;
    this.trickT = 0;
    this.remoteDrift = false;
    this.easyOn = false;
    this.speed = 0;
    this.steer = 0;
    this.drift = 0;
    this.driftTime = 0;
    this.boost = 0;
    this.body.rotation.set(0, 0, 0);
  }
}

/** The kart body for a body type in a paint colour, as one merged shape. */
export function buildBody(id: BodyId, paint: string): Shape {
  const s = new Shape();
  const dark = '#2b2738';
  const trim = '#fffaf0';
  const chrome = '#c9c6d6';
  // Shared: the floor pan, the seat, the wheel and its column.
  s.at(rbox(1.12, 0.16, 1.85, 0.06), dark, 0, 0.22, 0);
  s.at(rbox(0.62, 0.5, 0.16, 0.07), dark, 0, 0.6, -0.42, -0.12, 0, 0);
  s.at(rbox(0.6, 0.1, 0.5, 0.04), dark, 0, 0.36, -0.22);
  s.at(cyl(0.035, 0.035, 0.5, 8), dark, 0, 0.62, 0.42, -0.9, 0, 0);
  s.at(torus(0.16, 0.035, 6, 16), dark, 0, 0.78, 0.28, -0.6, 0, 0);
  // Engine block and twin exhausts at the back.
  s.at(rbox(0.5, 0.26, 0.32, 0.05), '#4a4658', 0, 0.42, -0.86);
  for (const sx of [-0.2, 0.2]) s.at(cyl(0.06, 0.07, 0.24, 10), chrome, sx, 0.42, -1.04, Math.PI / 2, 0, 0);
  if (id === 'classic') {
    s.at(rbox(1.0, 0.32, 0.72, 0.12), paint, 0, 0.42, 0.62);
    s.at(rbox(0.18, 0.33, 0.6, 0.06), trim, 0, 0.425, 0.64);
    s.at(rbox(1.3, 0.12, 0.28, 0.05), paint, 0, 0.3, 1.02);
    for (const sx of [-1, 1]) s.at(rbox(0.22, 0.24, 0.9, 0.08), paint, sx * 0.52, 0.34, -0.1);
    s.at(rbox(1.4, 0.08, 0.3, 0.04), paint, 0, 0.74, -0.98);
    for (const sx of [-0.55, 0.55]) s.at(rbox(0.06, 0.26, 0.2, 0.02), dark, sx, 0.6, -0.98);
  } else if (id === 'zippy') {
    // A low wedge with a tall tail fin.
    s.at(rbox(0.9, 0.22, 0.95, 0.08), paint, 0, 0.36, 0.55, 0.1, 0, 0);
    s.at(rbox(0.14, 0.23, 0.8, 0.05), trim, 0, 0.365, 0.57, 0.1, 0, 0);
    s.at(rbox(1.16, 0.08, 0.24, 0.04), paint, 0, 0.26, 1.04);
    for (const sx of [-1, 1]) s.at(rbox(0.16, 0.18, 0.95, 0.07), paint, sx * 0.5, 0.31, -0.12);
    s.at(rbox(0.08, 0.62, 0.5, 0.04), paint, 0, 0.84, -0.88, 0.25, 0, 0);
    s.at(rbox(0.09, 0.2, 0.3, 0.03), trim, 0, 1.0, -0.98, 0.25, 0, 0);
  } else {
    // A round bumper tub.
    s.at(rbox(1.24, 0.42, 1.0, 0.2), paint, 0, 0.42, 0.42);
    s.at(rbox(1.26, 0.1, 0.4, 0.05), trim, 0, 0.6, 0.45);
    s.at(torus(0.78, 0.09, 8, 28), '#3a3448', 0, 0.3, 0, Math.PI / 2, 0, 0, 0.92, 1.3, 1);
    for (const sx of [-1, 1]) s.at(rbox(0.28, 0.3, 0.95, 0.12), paint, sx * 0.55, 0.38, -0.25);
    s.at(rbox(0.9, 0.2, 0.2, 0.08), paint, 0, 0.66, -0.98);
    s.at(ball(0.09, 8, 6), '#ffd24a', -0.42, 0.52, 0.93);
    s.at(ball(0.09, 8, 6), '#ffd24a', 0.42, 0.52, 0.93);
  }
  // Headlights for every body.
  if (id !== 'chunky') for (const sx of [-0.3, 0.3]) s.at(ball(0.07, 8, 6), '#fff6d0', sx, 0.46, id === 'zippy' ? 1.0 : 0.98);
  return s;
}

/** All the wheels of every kart in one draw call. */
export class WheelPool {
  readonly mesh: THREE.InstancedMesh;
  private karts: RaceKart[] = [];
  private m = new THREE.Matrix4();
  private sc = new THREE.Matrix4();

  constructor(parent: THREE.Object3D, max = 40) {
    const s = new Shape();
    s.at(cyl(1, 1, 1, 14), '#24212e', 0, 0, 0, 0, 0, Math.PI / 2);
    s.at(cyl(0.55, 0.55, 1.04, 10), '#d8d4e0', 0, 0, 0, 0, 0, Math.PI / 2);
    s.at(cyl(0.2, 0.2, 1.08, 6), '#8a86a0', 0, 0, 0, 0, 0, Math.PI / 2);
    // Tread blocks.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      // Plain boxes: rounded ones would cost a thousand triangles per wheel.
      s.at(rbox(0.9, 0.2, 0.22, 0), '#1a1824', 0, Math.cos(a) * 0.96, Math.sin(a) * 0.96, a, 0, 0);
    }
    const geo = s.geometry();
    this.mesh = new THREE.InstancedMesh(geo, finish('plastic'), max);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  set(karts: RaceKart[]): void {
    this.karts = karts;
  }

  update(): void {
    let i = 0;
    for (const k of this.karts) {
      if (!k.root.visible) continue;
      k.root.updateMatrixWorld(true);
      for (const w of k.wheelNodes) {
        const r = w.userData.r as number;
        const wd = w.userData.w as number;
        this.m.copy(w.matrixWorld).multiply(this.sc.makeScale(wd, r, r));
        this.mesh.setMatrixAt(i++, this.m);
      }
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}
