// Interactive toys. Owners place them; every visit simulates them locally from
// their saved spots, so a kick never changes the shared layout.

import * as THREE from 'three';
import type { PropPlacement } from '../shared/model';
import { cached, keep, mesh, plastic, roundBox, signTexture } from './kit';
import { box, circle, resolveCircle, type Collider } from './physics';

export interface Mover {
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  h: number;
  kind: 'player' | 'vehicle';
}

export type ToyEvent =
  | { type: 'goal'; x: number; z: number }
  | { type: 'strike'; x: number; z: number }
  | { type: 'pins'; count: number; x: number; z: number }
  | { type: 'target'; bullseye: boolean; x: number; z: number }
  | { type: 'bounce'; strength: number; x: number; z: number }
  | { type: 'knock'; x: number; z: number };

const BALL_R = 0.28;
const GRAVITY = 20;

function local(x: number, z: number, ox: number, oz: number, rot: number): { lx: number; lz: number } {
  const dx = x - ox;
  const dz = z - oz;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

function world(lx: number, lz: number, ox: number, oz: number, rot: number): { x: number; z: number } {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: ox + lx * c + lz * s, z: oz - lx * s + lz * c };
}

// ---------------------------------------------------------------------------
// Meshes

function soccerGeometry(): THREE.BufferGeometry {
  return cached('soccer', () => {
    const g = new THREE.IcosahedronGeometry(BALL_R, 2);
    const pos = g.getAttribute('position');
    const t = (1 + Math.sqrt(5)) / 2;
    const corners = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());
    const colors: number[] = [];
    const v = new THREE.Vector3();
    const dark = new THREE.Color('#25213a');
    const light = new THREE.Color('#fbf8f0');
    for (let i = 0; i < pos.count; i += 3) {
      let near = false;
      for (let k = 0; k < 3 && !near; k++) {
        v.fromBufferAttribute(pos, i + k).normalize();
        near = corners.some((c) => c.distanceToSquared(v) < 1e-4);
      }
      const col = near ? dark : light;
      for (let k = 0; k < 3; k++) colors.push(col.r, col.g, col.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    // Round normals so the ball looks smooth despite flat colour patches.
    const normals: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      normals.push(v.x, v.y, v.z);
    }
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return g;
  });
}

const ballMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }));

let netTex: THREE.CanvasTexture | null = null;
function netMaterial(): THREE.MeshStandardMaterial {
  if (!netTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 5;
    g.strokeRect(0, 0, 64, 64);
    netTex = keep(new THREE.CanvasTexture(c));
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    netTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9 });
}

function netPlane(w: number, h: number): THREE.Mesh {
  const mat = netMaterial();
  mat.map = mat.map!.clone();
  mat.map.userData.keep = false;
  mat.map.repeat.set(w * 5, h * 5);
  mat.map.needsUpdate = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.castShadow = false;
  return m;
}

function pinGeometry(): THREE.BufferGeometry {
  return cached('pin', () => {
    const pts = [
      [0, 0], [0.07, 0.0], [0.09, 0.08], [0.1, 0.18], [0.08, 0.3], [0.045, 0.37], [0.05, 0.43], [0.055, 0.48], [0.03, 0.53], [0, 0.545],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(pts, 14);
  });
}

const LETTERS = 'TOYBXES';
const BLOCK_COLORS = ['#e8574a', '#f4b740', '#4aa3df', '#3fb68b', '#8a6bd1', '#f58a6b'];

function blockMaterial(i: number): THREE.MeshStandardMaterial {
  const color = BLOCK_COLORS[i % BLOCK_COLORS.length];
  const tex = signTexture(LETTERS[i % LETTERS.length], 1, 1, { bg: color, fg: '#fffaf0', border: '#fffaf0', radius: 0.12 });
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
}

let targetTex: THREE.CanvasTexture | null = null;
function targetMaterial(): THREE.MeshStandardMaterial {
  if (!targetTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const rings = ['#e8574a', '#fffaf0', '#e8574a', '#fffaf0', '#f4b740'];
    rings.forEach((col, i) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(128, 128, 128 - i * 26, 0, Math.PI * 2);
      g.fill();
    });
    targetTex = keep(new THREE.CanvasTexture(c));
    targetTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshStandardMaterial({ map: targetTex, roughness: 0.6, emissive: new THREE.Color('#ffd27a'), emissiveIntensity: 0 });
}

// ---------------------------------------------------------------------------
// Simulated toys

class Ball {
  readonly mesh: THREE.Mesh;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly home = new THREE.Vector3();
  resetAt = 0;
  idle = 0;
  constructor(x: number, z: number) {
    this.mesh = mesh(soccerGeometry(), ballMat);
    this.home.set(x, BALL_R, z);
    this.reset();
  }
  reset(): void {
    this.pos.copy(this.home);
    this.vel.set(0, 0, 0);
    this.resetAt = 0;
    this.mesh.position.copy(this.pos);
  }
}

const GOAL = { hw: 1.5, crossH: 1.5, depth: 1.0, post: 0.07 };

class Goal {
  readonly group = new THREE.Group();
  readonly colliders: Collider[] = [];
  private net = new THREE.Group();
  ripple = 0;
  cooldown = 0;
  constructor(readonly x: number, readonly z: number, readonly rot: number) {
    const white = plastic('#fbf8f0', { rough: 0.35 });
    const postGeo = cached('post', () => new THREE.CylinderGeometry(GOAL.post, GOAL.post, GOAL.crossH, 10));
    for (const sx of [-1, 1]) {
      this.group.add(mesh(postGeo, white, sx * GOAL.hw, GOAL.crossH / 2, 0));
      const back = mesh(cached('backpost', () => new THREE.CylinderGeometry(0.04, 0.04, GOAL.crossH, 8)), white, sx * GOAL.hw, GOAL.crossH / 2, -GOAL.depth);
      this.group.add(back);
    }
    const bar = mesh(cached('bar3', () => new THREE.CylinderGeometry(GOAL.post, GOAL.post, GOAL.hw * 2 + GOAL.post * 2, 10).rotateZ(Math.PI / 2)), white, 0, GOAL.crossH, 0);
    this.group.add(bar);
    const back = netPlane(GOAL.hw * 2, GOAL.crossH);
    back.position.set(0, GOAL.crossH / 2, -GOAL.depth);
    const top = netPlane(GOAL.hw * 2, GOAL.depth);
    top.rotation.x = -Math.PI / 2;
    top.position.set(0, GOAL.crossH, -GOAL.depth / 2);
    this.net.add(back, top);
    for (const sx of [-1, 1]) {
      const side = netPlane(GOAL.depth, GOAL.crossH);
      side.rotation.y = Math.PI / 2;
      side.position.set(sx * GOAL.hw, GOAL.crossH / 2, -GOAL.depth / 2);
      this.net.add(side);
    }
    this.group.add(this.net);
    this.group.position.set(x, 0, z);
    this.group.rotation.y = rot;

    const add = (lx: number, lz: number, hw: number, hd: number, bounce: number) => {
      const w = world(lx, lz, x, z, rot);
      this.colliders.push(box(w.x, w.z, hw, hd, rot, GOAL.crossH + 0.05, bounce, false));
    };
    for (const sx of [-1, 1]) {
      const p = world(sx * GOAL.hw, 0, x, z, rot);
      this.colliders.push(circle(p.x, p.z, GOAL.post + 0.02, GOAL.crossH + 0.1, 0.6, false));
      add(sx * (GOAL.hw + 0.03), -GOAL.depth / 2, 0.04, GOAL.depth / 2, 0.12);
    }
    add(0, -GOAL.depth - 0.03, GOAL.hw + 0.05, 0.05, 0.08);
  }

  animate(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.ripple > 0) {
      this.ripple = Math.max(0, this.ripple - dt);
      const k = this.ripple * Math.sin(this.ripple * 40) * 0.12;
      this.net.scale.set(1, 1, 1 + Math.abs(k) * 1.5);
    } else {
      this.net.scale.set(1, 1, 1);
    }
  }
}

interface Pin {
  mesh: THREE.Group;
  hx: number;
  hz: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  tilt: number;
  dir: number;
  down: boolean;
  delay: number;
}

function makePinMesh(cone: boolean): THREE.Group {
  const g = new THREE.Group();
  if (cone) {
    g.add(mesh(cached('cone', () => new THREE.ConeGeometry(0.2, 0.55, 16).translate(0, 0.3, 0)), plastic('#ff7a2e', { rough: 0.5 })));
    g.add(mesh(cached('conestripe', () => new THREE.CylinderGeometry(0.105, 0.135, 0.09, 16).translate(0, 0.32, 0)), plastic('#fbf8f0'), 0, 0, 0, { cast: false }));
    g.add(mesh(roundBox(0.46, 0.05, 0.46, 0.02), plastic('#ff7a2e', { rough: 0.5 }), 0, 0.025, 0));
  } else {
    g.add(mesh(pinGeometry(), plastic('#fbf8f0', { rough: 0.3 })));
    g.add(mesh(cached('pinband', () => new THREE.CylinderGeometry(0.05, 0.055, 0.035, 12).translate(0, 0.4, 0)), plastic('#e8574a', { rough: 0.3 }), 0, 0, 0, { cast: false }));
  }
  return g;
}

class Knockables {
  readonly group = new THREE.Group();
  readonly pins: Pin[] = [];
  private since = 0;
  private resetIn = 0;
  private firstDown = false;
  private hitR: number;
  constructor(readonly kind: 'pins' | 'cone', readonly x: number, readonly z: number, readonly rot: number) {
    this.hitR = kind === 'cone' ? 0.2 : 0.1;
    const spots: [number, number][] = [];
    if (kind === 'cone') spots.push([0, 0]);
    else {
      const gap = 0.3;
      for (let row = 0; row < 4; row++) {
        for (let i = 0; i <= row; i++) spots.push([(i - row / 2) * gap, 0.45 - row * gap * 0.87]);
      }
    }
    for (const [lx, lz] of spots) {
      const w = world(lx, lz, x, z, rot);
      const m = makePinMesh(kind === 'cone');
      this.group.add(m);
      this.pins.push({ mesh: m, hx: w.x, hz: w.z, x: w.x, z: w.z, vx: 0, vz: 0, tilt: 0, dir: 0, down: false, delay: 0 });
    }
    this.reset();
  }

  reset(): void {
    for (const p of this.pins) {
      Object.assign(p, { x: p.hx, z: p.hz, vx: 0, vz: 0, tilt: 0, down: false, delay: 0 });
      p.mesh.scale.setScalar(1);
    }
    this.firstDown = false;
    this.since = 0;
    this.resetIn = 0;
    this.sync();
  }

  private sync(): void {
    for (const p of this.pins) {
      p.mesh.position.set(p.x, 0, p.z);
      // Tip over towards `dir`: rotate about the horizontal axis perpendicular to it.
      p.mesh.rotation.set(0, 0, 0);
      p.mesh.rotateOnWorldAxis(new THREE.Vector3(Math.cos(p.dir), 0, -Math.sin(p.dir)), p.tilt);
    }
  }

  private topple(p: Pin, dirX: number, dirZ: number, speed: number, delay = 0): void {
    if (p.down) return;
    p.down = true;
    p.delay = delay;
    p.dir = Math.atan2(dirX, dirZ);
    const s = Math.min(6, speed * 0.45 + 0.6);
    p.vx = Math.sin(p.dir) * s;
    p.vz = Math.cos(p.dir) * s;
    if (!this.firstDown) {
      this.firstDown = true;
      this.since = 0;
    }
  }

  /** Returns true if something was knocked. */
  hit(x: number, z: number, r: number, vx: number, vz: number, y: number): boolean {
    let any = false;
    const speed = Math.hypot(vx, vz);
    if (speed < 0.8 || y > (this.kind === 'cone' ? 0.55 : 0.5)) return false;
    for (const p of this.pins) {
      if (p.down) continue;
      const dx = p.x - x;
      const dz = p.z - z;
      if (dx * dx + dz * dz < (r + this.hitR) ** 2) {
        this.topple(p, vx / speed * 0.7 + (dx || 0.01) * 0.6, vz / speed * 0.7 + (dz || 0.01) * 0.6, speed);
        any = true;
      }
    }
    return any;
  }

  step(dt: number, events: ToyEvent[], ballsMoving: boolean): void {
    let fallen = 0;
    for (const p of this.pins) {
      if (!p.down) continue;
      fallen++;
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      p.tilt = Math.min(Math.PI / 2, p.tilt + dt * 7);
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      const f = Math.max(0, 1 - 3.5 * dt);
      p.vx *= f;
      p.vz *= f;
      // A falling pin takes its neighbours with it.
      if (p.tilt > 0.5) {
        for (const q of this.pins) {
          if (q.down) continue;
          const dx = q.x - p.x;
          const dz = q.z - p.z;
          if (dx * dx + dz * dz < 0.36 * 0.36) this.topple(q, dx + Math.sin(p.dir) * 0.3, dz + Math.cos(p.dir) * 0.3, Math.hypot(p.vx, p.vz) + 1.2, 0.04);
        }
      }
    }
    if (this.firstDown) this.since += dt;
    if (this.resetIn > 0) {
      this.resetIn -= dt;
      const k = Math.max(0, this.resetIn / 0.4);
      for (const p of this.pins) if (p.down) p.mesh.scale.setScalar(k);
      if (this.resetIn <= 0) this.reset();
      return;
    }
    const all = fallen === this.pins.length;
    const settle = this.kind === 'cone' ? 4 : 3.5;
    if (this.firstDown && ((all && this.since > 1.6) || (this.since > settle && !ballsMoving) || this.since > 9)) {
      if (this.kind === 'pins') {
        if (all) events.push({ type: 'strike', x: this.x, z: this.z });
        else events.push({ type: 'pins', count: fallen, x: this.x, z: this.z });
      }
      this.resetIn = 0.4;
    }
    this.sync();
  }
}

class Target {
  readonly group = new THREE.Group();
  readonly collider: Collider;
  private faceMat: THREE.MeshStandardMaterial;
  flash = 0;
  constructor(readonly x: number, readonly z: number, readonly rot: number) {
    const wood = plastic('#9a6b47', { rough: 0.8 });
    this.faceMat = targetMaterial();
    // Cylinder groups: side, top cap (turned to face +z), bottom cap.
    const face = new THREE.Mesh(
      cached('tface', () => new THREE.CylinderGeometry(0.62, 0.62, 0.08, 32).rotateX(Math.PI / 2)),
      [plastic('#fbf8f0'), this.faceMat, wood],
    );
    face.position.set(0, 0.95, 0);
    face.castShadow = true;
    this.group.add(face);
    for (const sx of [-0.35, 0.35]) {
      const leg = mesh(roundBox(0.08, 0.95, 0.08, 0.03), wood, sx, 0.47, -0.12);
      leg.rotation.x = -0.12;
      this.group.add(leg);
    }
    this.group.position.set(x, 0, z);
    this.group.rotation.y = rot;
    this.collider = box(x, z, 0.64, 0.08, rot, 1.6, 0.55, false);
  }

  /** Checks a ball against the target face. */
  check(b: Ball, events: ToyEvent[]): void {
    if (this.flash > 0.5) return;
    const { lx, lz } = local(b.pos.x, b.pos.z, this.x, this.z, this.rot);
    if (Math.abs(lz) > BALL_R + 0.1) return;
    const dy = b.pos.y - 0.95;
    const d = Math.hypot(lx, dy);
    if (d > 0.62 + BALL_R * 0.3) return;
    const speed = b.vel.length();
    if (speed < 2) return;
    this.flash = 1;
    events.push({ type: 'target', bullseye: d < 0.2, x: this.x, z: this.z });
  }

  animate(dt: number): void {
    this.flash = Math.max(0, this.flash - dt * 1.4);
    this.faceMat.emissiveIntensity = this.flash * 0.9;
  }
}

// ---------------------------------------------------------------------------

export class Toys {
  readonly group = new THREE.Group();
  /** Solid toys the player and vehicles bump into. */
  readonly colliders: Collider[] = [];
  /** Same, plus goal nets, for the ball. */
  private ballColliders: Collider[] = [];
  private balls: Ball[] = [];
  private goals: Goal[] = [];
  private knock: Knockables[] = [];
  private targets: Target[] = [];
  private touchCooldown = 0;

  /** One container per placement so the arrange editor can slide toys without a rebuild. */
  readonly containers = new Map<string, { obj: THREE.Group; x0: number; z0: number }>();

  constructor(readonly placements: PropPlacement[]) {
    let blockIndex = 0;
    for (const p of placements) {
      const box3 = new THREE.Group();
      this.containers.set(p.id, { obj: box3, x0: p.x, z0: p.z });
      this.group.add(box3);
      switch (p.kind) {
        case 'ball': {
          const b = new Ball(p.x, p.z);
          this.balls.push(b);
          box3.add(b.mesh);
          break;
        }
        case 'goal': {
          const g = new Goal(p.x, p.z, p.rot);
          this.goals.push(g);
          box3.add(g.group);
          this.ballColliders.push(...g.colliders);
          // Players walk around the frame but can step into the mouth.
          this.colliders.push(...g.colliders);
          break;
        }
        case 'pins':
        case 'cone': {
          const k = new Knockables(p.kind, p.x, p.z, p.rot);
          this.knock.push(k);
          box3.add(k.group);
          break;
        }
        case 'crate': {
          const m = mesh(roundBox(0.9, 0.9, 0.9, 0.08), blockMaterial(blockIndex++), p.x, 0.45, p.z);
          m.rotation.y = p.rot;
          box3.add(m);
          const c = box(p.x, p.z, 0.45, 0.45, p.rot, 0.9, 0.6, false);
          this.colliders.push(c);
          this.ballColliders.push(c);
          break;
        }
        case 'target': {
          const t = new Target(p.x, p.z, p.rot);
          this.targets.push(t);
          box3.add(t.group);
          this.colliders.push(t.collider);
          this.ballColliders.push(t.collider);
          break;
        }
      }
    }
  }

  /** Editor only: shows a placement at a new spot without rebuilding. */
  preview(p: PropPlacement): void {
    const c = this.containers.get(p.id);
    if (c) c.obj.position.set(p.x - c.x0, 0, p.z - c.z0);
  }

  get hasBall(): boolean {
    return this.balls.length > 0;
  }

  /** Nearest ball to a point, for prompts and the kick. */
  nearestBall(x: number, z: number): { dist: number; x: number; z: number } | null {
    let best: Ball | null = null;
    let bd = Infinity;
    for (const b of this.balls) {
      const d = Math.hypot(b.pos.x - x, b.pos.z - z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best ? { dist: bd, x: best.pos.x, z: best.pos.z } : null;
  }

  /**
   * Kicks the nearest ball in front of the player. Returns true on contact.
   * A miss still plays the kick animation; the caller decides on feedback.
   */
  kick(x: number, z: number, yaw: number, power = 1): boolean {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let best: Ball | null = null;
    let bd = 1.7;
    for (const b of this.balls) {
      const dx = b.pos.x - x;
      const dz = b.pos.z - z;
      const d = Math.hypot(dx, dz);
      const ahead = (dx * fx + dz * fz) / (d || 1);
      if (d < bd && (ahead > 0.1 || d < 0.75) && b.pos.y < 1.2) {
        bd = d;
        best = b;
      }
    }
    if (!best) return false;
    const dx = best.pos.x - x;
    const dz = best.pos.z - z;
    const d = Math.hypot(dx, dz) || 1;
    // Mostly where the player faces, nudged by where the ball actually is.
    const kx = fx * 0.8 + (dx / d) * 0.2;
    const kz = fz * 0.8 + (dz / d) * 0.2;
    const kl = Math.hypot(kx, kz);
    const speed = 11.5 * power;
    best.vel.set((kx / kl) * speed, 3.6 * power, (kz / kl) * speed);
    best.idle = 0;
    return true;
  }

  reset(): void {
    for (const b of this.balls) b.reset();
    for (const k of this.knock) k.reset();
  }

  step(dt: number, movers: Mover[], worldColliders: Collider[]): ToyEvent[] {
    const events: ToyEvent[] = [];
    const now = performance.now();
    this.touchCooldown = Math.max(0, this.touchCooldown - dt);
    const solids = this.ballColliders.length ? worldColliders.concat(this.ballColliders) : worldColliders;
    let ballsMoving = false;

    for (const b of this.balls) {
      if (b.resetAt && now >= b.resetAt) b.reset();
      const prev = { x: b.pos.x, z: b.pos.z };
      b.vel.y -= GRAVITY * dt;
      b.pos.addScaledVector(b.vel, dt);
      if (b.pos.y < BALL_R) {
        b.pos.y = BALL_R;
        if (b.vel.y < -1.5) {
          if (b.vel.y < -4) events.push({ type: 'bounce', strength: Math.min(1, -b.vel.y / 10), x: b.pos.x, z: b.pos.z });
          b.vel.y = -b.vel.y * 0.55;
        } else b.vel.y = 0;
      }
      const onGround = b.pos.y <= BALL_R + 0.01;
      const hs = Math.hypot(b.vel.x, b.vel.z);
      if (hs > 0) {
        const decel = (onGround ? 1.9 : 0.15) + hs * (onGround ? 0.22 : 0.05);
        const k = Math.max(0, hs - decel * dt) / hs;
        b.vel.x *= k;
        b.vel.z *= k;
      }

      const hit = resolveCircle(b.pos, BALL_R, solids, b.pos.y - BALL_R);
      if (hit) {
        const vn = b.vel.x * hit.nx + b.vel.z * hit.nz;
        if (vn < 0) {
          const e = hit.collider.bounce;
          b.vel.x -= (1 + e) * vn * hit.nx;
          b.vel.z -= (1 + e) * vn * hit.nz;
          if (-vn > 3) events.push({ type: 'bounce', strength: Math.min(1, -vn / 12), x: b.pos.x, z: b.pos.z });
        }
      }

      for (const m of movers) {
        if (b.pos.y - BALL_R > m.h) continue;
        const dx = b.pos.x - m.x;
        const dz = b.pos.z - m.z;
        const rr = BALL_R + m.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-4;
        const nx = dx / d;
        const nz = dz / d;
        b.pos.x = m.x + nx * rr;
        b.pos.z = m.z + nz * rr;
        const rel = (b.vel.x - m.vx) * nx + (b.vel.z - m.vz) * nz;
        if (rel < 0) {
          const e = m.kind === 'vehicle' ? 0.9 : 0.35;
          b.vel.x -= (1 + e) * rel * nx;
          b.vel.z -= (1 + e) * rel * nz;
          if (m.kind === 'vehicle' && -rel > 4) {
            b.vel.y += -rel * 0.25;
            events.push({ type: 'bounce', strength: Math.min(1, -rel / 12), x: b.pos.x, z: b.pos.z });
          }
        }
      }

      for (const o of this.balls) {
        if (o === b) continue;
        const dx = b.pos.x - o.pos.x;
        const dz = b.pos.z - o.pos.z;
        const dy = b.pos.y - o.pos.y;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 0 && d2 < (BALL_R * 2) ** 2) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const nz = dz / d;
          const ny = dy / d;
          const push = (BALL_R * 2 - d) / 2;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
          o.pos.x -= nx * push;
          o.pos.z -= nz * push;
          const rel = (b.vel.x - o.vel.x) * nx + (b.vel.y - o.vel.y) * ny + (b.vel.z - o.vel.z) * nz;
          if (rel < 0) {
            const j = -rel * 0.9;
            b.vel.x += j * nx;
            b.vel.y += j * ny;
            b.vel.z += j * nz;
            o.vel.x -= j * nx;
            o.vel.y -= j * ny;
            o.vel.z -= j * nz;
          }
        }
      }

      for (const g of this.goals) this.goalCheck(g, b, prev, events, now);
      for (const k of this.knock) {
        if (k.hit(b.pos.x, b.pos.z, BALL_R, b.vel.x, b.vel.z, b.pos.y - BALL_R)) {
          b.vel.x *= 0.85;
          b.vel.z *= 0.85;
          events.push({ type: 'knock', x: b.pos.x, z: b.pos.z });
        }
      }
      for (const t of this.targets) t.check(b, events);

      // Rolling: spin about the axis perpendicular to travel.
      const hs2 = Math.hypot(b.vel.x, b.vel.z);
      if (hs2 > 0.01) {
        const axis = new THREE.Vector3(b.vel.z / hs2, 0, -b.vel.x / hs2);
        b.mesh.rotateOnWorldAxis(axis, (hs2 * dt) / BALL_R);
      }
      if (hs2 > 0.4 || b.pos.y > BALL_R + 0.05) {
        ballsMoving = true;
        b.idle = 0;
      } else {
        b.vel.x = b.vel.z = 0;
        b.idle += dt;
      }
      if (!Number.isFinite(b.pos.x) || Math.abs(b.pos.x) > 80 || Math.abs(b.pos.z) > 80) b.reset();
      b.mesh.position.copy(b.pos);
    }

    for (const m of movers) {
      for (const k of this.knock) {
        if (k.hit(m.x, m.z, m.r, m.vx, m.vz, 0) && this.touchCooldown <= 0) {
          events.push({ type: 'knock', x: m.x, z: m.z });
          this.touchCooldown = 0.15;
        }
      }
    }
    for (const k of this.knock) k.step(dt, events, ballsMoving);
    for (const g of this.goals) g.animate(dt);
    for (const t of this.targets) t.animate(dt);
    return events;
  }

  private goalCheck(g: Goal, b: Ball, prev: { x: number; z: number }, events: ToyEvent[], now: number): void {
    const cur = local(b.pos.x, b.pos.z, g.x, g.z, g.rot);
    // Crossbar: a horizontal cylinder across the mouth.
    if (Math.abs(cur.lx) < GOAL.hw) {
      const dy = b.pos.y - GOAL.crossH;
      const dz = cur.lz;
      const d = Math.hypot(dy, dz);
      const rr = BALL_R + GOAL.post;
      if (d < rr && d > 1e-4) {
        const ny = dy / d;
        const nzl = dz / d;
        const push = rr - d;
        b.pos.y += ny * push;
        const w = world(cur.lx, cur.lz + nzl * push, g.x, g.z, g.rot);
        b.pos.x = w.x;
        b.pos.z = w.z;
        // Reflect the velocity in the bar's local frame.
        const c = Math.cos(g.rot);
        const s = Math.sin(g.rot);
        const vlz = b.vel.x * s + b.vel.z * c;
        const vn = b.vel.y * ny + vlz * nzl;
        if (vn < 0) {
          b.vel.y -= 1.6 * vn * ny;
          const dvl = -1.6 * vn * nzl;
          b.vel.x += dvl * s;
          b.vel.z += dvl * c;
          events.push({ type: 'bounce', strength: Math.min(1, -vn / 8), x: b.pos.x, z: b.pos.z });
        }
      }
    }
    // Roof net keeps a rising ball inside.
    if (Math.abs(cur.lx) < GOAL.hw && cur.lz < 0 && cur.lz > -GOAL.depth && b.pos.y > GOAL.crossH - BALL_R && b.pos.y < GOAL.crossH && b.vel.y > 0) {
      b.vel.y *= -0.2;
      b.pos.y = GOAL.crossH - BALL_R;
    }
    if (g.cooldown > 0 || b.resetAt) return;
    const before = local(prev.x, prev.z, g.x, g.z, g.rot);
    const inMouth = Math.abs(cur.lx) < GOAL.hw - BALL_R * 0.4 && b.pos.y < GOAL.crossH;
    if (inMouth && before.lz >= -BALL_R && cur.lz < -BALL_R && cur.lz > -GOAL.depth - 0.2) {
      g.cooldown = 2;
      g.ripple = 0.7;
      b.resetAt = now + 1800;
      events.push({ type: 'goal', x: g.x, z: g.z });
    }
  }
}
