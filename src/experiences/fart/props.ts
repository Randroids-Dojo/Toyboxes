// The knockable village: the tin tower, flying teacups, the Mayor's hat,
// gnomes, the washing, the bell and the fountain. Drawn in the figure batch,
// simulated by sim/props.ts, and reported to the mischief list.

import * as THREE from 'three';
import { at, compound, type Figures } from './figures';
import { BELL_TOWER, FOUNTAIN, GNOMES, WASHING } from './layout';
import { C } from './palette';
import type { Person } from './people';
import { Bodies, tinPyramid, type Body } from './sim/props';
import { rng, type Rng } from './sim/rng';
import { fx } from './toots';

const TIN_TABLE = { x: 4.6, z: 21.2, hw: 0.65, hd: 0.65, top: 0.8 };

const Cy = (rt: number, rb: number, h: number, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
const S = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);

export function registerProps(f: Figures): void {
  f.geo('tin', () => compound([[Cy(0.11, 0.11, 0.24, 14), 0xd8d8e0], [Cy(0.113, 0.113, 0.15, 14), C.tomato], [Cy(0.114, 0.114, 0.05, 14), 0xfff1d6]]));
  f.geo('gnome', () =>
    compound([
      [Cy(0.16, 0.2, 0.3, 12), 0x4aa3df, at(0, 0.15, 0)],
      [S(0.12), 0xffd9b8, at(0, 0.38, 0)],
      [S(0.13, 10, 8).scale(1, 1.2, 0.8), 0xffffff, at(0, 0.3, 0.07)],
      [new THREE.ConeGeometry(0.14, 0.32, 12), C.tomato, at(0, 0.6, -0.01, -0.15)],
      [S(0.035, 6, 4), 0xff9f8f, at(0, 0.38, 0.12)],
      [Cy(0.07, 0.08, 0.1, 8), 0x3b2b20, at(-0.08, 0.02, 0.03)],
      [Cy(0.07, 0.08, 0.1, 8), 0x3b2b20, at(0.08, 0.02, 0.03)],
    ]),
  );
  f.geo('shirt', () => compound([[new THREE.BoxGeometry(0.55, 0.6, 0.03), 0xffffff, at(0, -0.3, 0)], [new THREE.BoxGeometry(0.22, 0.25, 0.03), 0xffffff, at(-0.35, -0.1, 0, 0, 0, 0.6)], [new THREE.BoxGeometry(0.22, 0.25, 0.03), 0xffffff, at(0.35, -0.1, 0, 0, 0, -0.6)]]));
  f.geo('sock', () => compound([[new THREE.BoxGeometry(0.12, 0.42, 0.03), 0xffffff, at(0, -0.21, 0)], [new THREE.BoxGeometry(0.2, 0.1, 0.03), 0xffffff, at(0.05, -0.42, 0)]]));
  f.geo('bloomers', () => compound([[S(0.3, 12, 8).scale(1.3, 0.8, 0.15), 0xffffff, at(0, -0.25, 0)], [new THREE.BoxGeometry(0.62, 0.06, 0.05), 0xffffff, at(0, 0, 0)]]));
  f.geo('bubble', () => S(1, 12, 8));
}

interface PropRig {
  body: Body;
  id: number;
  geo: string;
  scale: number;
  /** Attached to a head (the Mayor's hat landing on someone). */
  on: Person | null;
  onT: number;
}

export interface PropEvents {
  tins(down: number): void;
  gnomes(down: number): void;
  laundry(): void;
  bell(): void;
  fountain(): void;
  hatLanded(on: string | null): void;
  sparkle(at: { x: number; y: number; z: number }, color: number, n?: number): void;
  steam(at: { x: number; y: number; z: number }): void;
  bubbles(at: { x: number; y: number; z: number }, n: number): void;
}

export class Props {
  readonly bodies = new Bodies();
  private rigs: PropRig[] = [];
  private tins: PropRig[] = [];
  private gnomes: PropRig[] = [];
  private laundry: PropRig[] = [];
  private r: Rng = rng(99);
  private tinReset = 0;
  private laundryDown = false;
  private laundryT = 0;
  bellSwing = 0;
  private bellCool = 0;
  private fountainCool = 0;
  hat: PropRig | null = null;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private lift = new THREE.Matrix4().makeTranslation(0, -0.3, 0);
  gnomesDown = 0;
  tinsDown = 0;

  constructor(
    private f: Figures,
    private ev: PropEvents,
  ) {
    for (const p of tinPyramid(TIN_TABLE.x, TIN_TABLE.top, TIN_TABLE.z)) this.tins.push(this.rig('tin', p.x, p.y, p.z, 0.12, 0xffffff, 1));
    GNOMES.forEach((g, i) => {
      const r = this.rig('gnome', g.x, g.y + 0.3, g.z, 0.3, [0xffffff, 0xd9f0ff, 0xfff0d0][i % 3], 1);
      r.body.ry = (i * 2.1) % 6.28;
      this.gnomes.push(r);
    });
    const kinds = ['shirt', 'sock', 'bloomers', 'sock', 'shirt'];
    const cols = [0xff9fbf, 0xffd45c, 0xffffff, 0x4aa3df, 0x9fe3c0];
    kinds.forEach((k, i) => {
      const z = WASHING.z0 + ((i + 0.5) / kinds.length) * (WASHING.z1 - WASHING.z0);
      const sag = Math.sin(((i + 0.5) / kinds.length) * Math.PI) * 0.35;
      const r = this.rig(k, WASHING.x, WASHING.y - sag, z, 0.25, cols[i], 1);
      r.body.ry = Math.PI / 2;
      r.body.floaty = true;
      this.laundry.push(r);
    });
  }

  private rig(geo: string, x: number, y: number, z: number, r: number, color: number, scale: number): PropRig {
    const body = this.bodies.add(geo === 'tin' ? 'tin' : geo === 'gnome' ? 'gnome' : geo === 'teacup' ? 'cup' : geo === 'tophat' ? 'hat' : 'laundry', x, y, z, r);
    const rig: PropRig = { body, id: this.f.add(geo, color), geo, scale, on: null, onT: 0 };
    this.rigs.push(rig);
    return rig;
  }

  /** What things rest on: the ground, the tin table, roofs for gnomes, other tins. */
  private floor = (x: number, z: number, y: number): number => {
    let f = 0;
    if (Math.abs(x - TIN_TABLE.x) < TIN_TABLE.hw && Math.abs(z - TIN_TABLE.z) < TIN_TABLE.hd && y >= TIN_TABLE.top - 0.05) f = TIN_TABLE.top;
    for (const g of GNOMES) if (g.y > 0 && Math.hypot(x - g.x, z - g.z) < 2.2 && y >= g.y - 0.1) f = Math.max(f, g.y);
    for (const t of this.tins) {
      const b = t.body;
      if (!b.rest || b.gone) continue;
      if (Math.abs(b.x - x) < 0.18 && Math.abs(b.z - z) < 0.18 && b.y + b.r <= y + 0.02 && b.y + b.r > f) f = b.y + b.r;
    }
    return f;
  };

  /** A toot or shockwave at a point: knock things about. */
  blast(x: number, y: number, z: number, push: number, gas: string): void {
    const strength = gas === 'fizzy' ? 2.5 : gas === 'cabbage' ? 3 : 5;
    const n = this.bodies.blast(x, y, z, push + 0.4, strength, this.r, ['tin', 'gnome']);
    if (n > 0) {
      fx.tin();
      this.tinReset = 0;
    }
    // The washing: within reach of the line.
    if (!this.laundryDown && Math.abs(x - WASHING.x) < push + 0.6 && z > WASHING.z0 - 1 && z < WASHING.z1 + 1 && Math.abs(y - (WASHING.y - 0.3)) < push + 0.6) {
      this.laundryDown = true;
      this.laundryT = 0;
      for (const l of this.laundry) {
        l.body.rest = false;
        l.body.vx = (this.r() - 0.5) * 2 - 1;
        l.body.vz = (this.r() - 0.5) * 2;
        l.body.vy = 1.5 + this.r();
        l.body.wy = (this.r() - 0.5) * 3;
      }
      fx.whoosh();
      this.ev.laundry();
    }
    // The bell.
    const bx = BELL_TOWER.x;
    const bz = BELL_TOWER.z;
    if (this.bellCool <= 0 && Math.hypot(x - bx, z - bz) < 3.2 && Math.abs(y - BELL_TOWER.bellY) < 2.6) {
      this.bellSwing = 1;
      this.bellCool = 1.5;
      fx.bell(true);
      this.ev.bell();
    }
  }

  /** A toot standing in the fountain: giant bubbles. */
  fountainToot(px: number, py: number, pz: number): boolean {
    if (this.fountainCool > 0) return false;
    if (Math.hypot(px - FOUNTAIN.x, pz - FOUNTAIN.z) > FOUNTAIN.r - 0.45 || py > 0.5) return false;
    this.fountainCool = 0.6;
    this.ev.bubbles({ x: px, y: FOUNTAIN.water, z: pz }, 14);
    fx.bubbles(8);
    fx.splash();
    this.ev.fountain();
    return true;
  }

  /** A teacup flies out of someone's hand. */
  cup(from: THREE.Vector3, yaw: number): void {
    const r = this.rig('teacup', from.x, from.y, from.z, 0.06, 0xffffff, 1.4);
    r.body.rest = false;
    r.body.vx = Math.sin(yaw) * 1.5 + (this.r() - 0.5);
    r.body.vz = Math.cos(yaw) * 1.5 + (this.r() - 0.5);
    r.body.vy = 5;
    r.body.wx = 9;
    r.body.wz = 4;
    fx.tink();
  }

  /** The Mayor's hat pops off, aimed at the nearest other head. */
  popHat(from: THREE.Vector3, target: THREE.Vector3 | null, to: Person | null): void {
    if (this.hat) return;
    // The hat's shape is built round a head centre; its brim sits 0.24 m above that point.
    const r = this.rig('tophat', from.x, from.y - 0.36, from.z, -0.22, 0xffffff, 0.3);
    r.body.rest = false;
    const tFlight = 1.1;
    if (target) {
      r.body.vx = (target.x - from.x) / tFlight;
      r.body.vz = (target.z - from.z) / tFlight;
      r.body.vy = (target.y + 0.15 - from.y) / tFlight + 0.5 * 18 * tFlight;
    } else {
      r.body.vx = (this.r() - 0.5) * 3;
      r.body.vz = (this.r() - 0.5) * 3;
      r.body.vy = 9;
    }
    r.body.wy = 14;
    (r as PropRig & { target?: Person | null }).target = to;
    this.hat = r;
    fx.pop();
  }

  step(dt: number): void {
    this.bellCool = Math.max(0, this.bellCool - dt);
    this.fountainCool = Math.max(0, this.fountainCool - dt);
    const hatTarget = this.hat ? (this.hat as PropRig & { target?: Person | null }).target ?? null : null;
    const { landed } = this.bodies.step(dt, (x, z, y) => {
      // The flying hat lands on its target's head.
      return this.floor(x, z, y);
    });
    // The hat: catch on the target's head when it comes down near it.
    if (this.hat && !this.hat.on && hatTarget && this.hat.body.vy < 0) {
      const hp = hatTarget.hatPos;
      if (Math.hypot(this.hat.body.x - hp.x, this.hat.body.z - hp.z) < 0.7 && this.hat.body.y < hp.y + 0.4) {
        this.hat.on = hatTarget;
        this.hat.onT = 0;
        fx.pop();
        this.ev.hatLanded(hatTarget.spec.id);
      }
    }
    if (this.hat) {
      const h = this.hat;
      if (h.on) {
        h.onT += dt;
        const hr = h.on.spec.height * 0.15;
        h.body.x = h.on.hatPos.x;
        h.body.y = h.on.hatPos.y - hr * 1.2;
        h.body.z = h.on.hatPos.z;
        h.body.rx = 0;
        h.body.rz = 0.18;
        h.scale = hr;
        h.body.ry = h.on.p.yaw;
        h.body.rest = true;
      }
      if ((h.on && h.onT > 9) || (!h.on && h.body.rest && h.body.still > 5)) {
        this.f.show(h.id, false);
        h.body.gone = true;
        this.hat = null;
        this.ev.hatLanded(null);
      }
    }
    for (const b of landed) {
      if (b.kind === 'tin') fx.tin();
      else if (b.kind === 'gnome') fx.clonk();
      else if (b.kind === 'cup') {
        fx.tink();
        this.ev.steam({ x: b.x, y: b.y, z: b.z });
      }
    }
    // Teacups disappear after a while; washing gets picked up.
    for (const r of this.rigs) {
      if (r.body.kind === 'cup' && r.body.rest && r.body.still > 3 && !r.body.gone) {
        r.body.gone = true;
        this.f.show(r.id, false);
        this.ev.sparkle({ x: r.body.x, y: r.body.y + 0.1, z: r.body.z }, 0xffffff, 6);
      }
    }
    // Tins: count the fallen, and Gran restacks after a while.
    const down = this.tins.filter((t) => t.body.y < TIN_TABLE.top - 0.05 || Math.hypot(t.body.x - TIN_TABLE.x, t.body.z - TIN_TABLE.z) > 0.8).length;
    if (down !== this.tinsDown) {
      this.tinsDown = down;
      this.ev.tins(down);
    }
    if (down > 0 && this.tins.every((t) => t.body.rest)) {
      this.tinReset += dt;
      if (this.tinReset > 25) this.restack();
    }
    const gd = this.gnomes.filter((g) => Math.abs(Math.cos(g.body.rx) * Math.cos(g.body.rz)) < 0.5 || !g.body.rest).length;
    if (gd !== this.gnomesDown) {
      this.gnomesDown = gd;
      this.ev.gnomes(gd);
    }
    if (this.laundryDown) {
      this.laundryT += dt;
      if (this.laundryT > 40) this.rehang();
    }
    this.bellSwing = Math.max(0, this.bellSwing - dt * 0.25);
  }

  restack(): void {
    this.tinReset = 0;
    tinPyramid(TIN_TABLE.x, TIN_TABLE.top, TIN_TABLE.z).forEach((p, i) => {
      const b = this.tins[i].body;
      Object.assign(b, { x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, rest: true, still: 0 });
    });
    this.ev.sparkle({ x: TIN_TABLE.x, y: 1.2, z: TIN_TABLE.z }, 0xffd24a, 10);
  }

  private rehang(): void {
    this.laundryDown = false;
    this.laundry.forEach((l, i) => {
      const z = WASHING.z0 + ((i + 0.5) / this.laundry.length) * (WASHING.z1 - WASHING.z0);
      const sag = Math.sin(((i + 0.5) / this.laundry.length) * Math.PI) * 0.35;
      Object.assign(l.body, { x: WASHING.x, y: WASHING.y - sag, z, vx: 0, vy: 0, vz: 0, rx: 0, ry: Math.PI / 2, rz: 0, wx: 0, wy: 0, wz: 0, rest: true });
    });
  }

  /** Writes every prop's matrix into the batch. */
  update(t: number): void {
    for (const r of this.rigs) {
      const b = r.body;
      if (b.gone) continue;
      let sway = 0;
      if (b.kind === 'laundry' && b.rest && !this.laundryDown) sway = Math.sin(t * 2.2 + b.id) * 0.12;
      this.e.set(b.rx + sway, b.ry, b.rz, 'YXZ');
      this.q.setFromEuler(this.e);
      // Gnomes tumble round their middle; their shape stands on its base.
      this.v.set(b.x, b.y, b.z);
      this.s.setScalar(r.scale);
      this.m.compose(this.v, this.q, this.s);
      if (b.kind === 'gnome') this.m.multiply(this.lift);
      this.f.set(r.id, this.m);
    }
  }

  get laundryIsDown(): boolean {
    return this.laundryDown;
  }
}
