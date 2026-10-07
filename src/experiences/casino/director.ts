// The camera director: seat framings when you sit at a game (eased in and
// out), and cinematic moves for the bonus flight and jackpot ceremonies. On
// the low tier and with Reduce motion, flights become cuts.

import * as THREE from 'three';
import type { CameraShot } from '../../world/space';

export interface Framing {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov?: number;
}

interface Cine {
  keys: { t: number; f: Framing }[];
  t: number;
  dur: number;
  cut: boolean;
  skippable: number;
  resolve: () => void;
  skipLabel: string;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function smooth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

export class Director {
  private seat: Framing | null = null;
  /** A framing that applies when no seat is taken (standing at Old Lucky). */
  private auto: Framing | null = null;
  private autoMax = 0.85;
  private seatBlend = 0;
  private seatMax = 0.92;
  private cine: Cine | null = null;
  private out: CameraShot = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  private lastSeat: Framing | null = null;

  constructor(private opts: { cuts: () => boolean }) {}

  /** Frames a game while you play it (null lets go). `strength` is how far towards the framing the camera moves. */
  setSeat(f: Framing | null, strength = 0.92): void {
    this.seat = f;
    if (f) {
      this.lastSeat = f;
      this.seatMax = strength;
    }
  }

  /** A framing that holds only while no game panel has a seat. */
  setAuto(f: Framing | null, strength = 0.85): void {
    this.auto = f;
    if (f) this.autoMax = strength;
  }

  get seated(): boolean {
    return !!this.seat;
  }

  get playing(): boolean {
    return !!this.cine;
  }

  /** The point the cutaway should keep clear: the cinematic's subject, else null (the player). */
  get focus(): THREE.Vector3 | null {
    if (this.cine) return this.out.target;
    const f = this.seat ?? this.auto;
    if (f && this.seatBlend > 0.5) return f.target;
    return null;
  }

  /**
   * Plays keyframes (times in seconds from 0). Resolves when it ends or is
   * skipped. A cut holds each key instead of flying between them.
   */
  play(keys: { t: number; f: Framing }[], opts: { skippableAfter?: number; skipLabel?: string } = {}): Promise<void> {
    this.cine?.resolve();
    return new Promise((resolve) => {
      this.cine = { keys, t: 0, dur: keys[keys.length - 1].t, cut: this.opts.cuts(), skippable: opts.skippableAfter ?? 0, resolve, skipLabel: opts.skipLabel ?? 'Skip' };
    });
  }

  skip(): void {
    const c = this.cine;
    if (!c || c.t < c.skippable) return;
    this.cine = null;
    c.resolve();
  }

  stop(): void {
    const c = this.cine;
    this.cine = null;
    c?.resolve();
  }

  private sample(c: Cine): Framing {
    const k = c.keys;
    if (c.t <= k[0].t) return k[0].f;
    for (let i = 0; i < k.length - 1; i++) {
      if (c.t <= k[i + 1].t) {
        if (c.cut) return k[i].f;
        const u = smooth((c.t - k[i].t) / Math.max(1e-3, k[i + 1].t - k[i].t));
        const a = k[i].f;
        const b = k[i + 1].f;
        this.out.position.copy(a.pos).lerp(b.pos, u);
        this.out.target.copy(a.target).lerp(b.target, u);
        return { pos: this.out.position.clone(), target: this.out.target.clone(), fov: (a.fov ?? 55) + ((b.fov ?? 55) - (a.fov ?? 55)) * u };
      }
    }
    return k[k.length - 1].f;
  }

  shot(dt: number): CameraShot | null {
    const c = this.cine;
    if (c) {
      c.t += dt;
      if (c.t >= c.dur) {
        this.cine = null;
        c.resolve();
      } else {
        const f = this.sample(c);
        this.out.position.copy(f.pos);
        this.out.target.copy(f.target);
        this.out.fov = f.fov;
        this.out.blend = 1;
        this.out.lockPlayer = true;
        this.out.skip = c.t >= c.skippable ? () => this.skip() : undefined;
        this.out.skipLabel = c.skipLabel;
        return this.out;
      }
    }
    const active = this.seat ?? this.auto;
    if (active) this.lastSeat = active;
    const want = this.seat ? this.seatMax : this.auto ? this.autoMax : 0;
    this.seatBlend += (want - this.seatBlend) * Math.min(1, dt * 3.2);
    if (this.seatBlend < 0.01 || !this.lastSeat) return null;
    const f = active ?? this.lastSeat;
    this.out.position.copy(f.pos);
    this.out.target.copy(f.target);
    this.out.fov = f.fov;
    this.out.blend = smooth(this.seatBlend);
    this.out.lockPlayer = false;
    this.out.skip = undefined;
    return this.out;
  }
}

/** A framing from a camera position and a point to look at. */
export function frame(px: number, py: number, pz: number, tx: number, ty: number, tz: number, fov?: number): Framing {
  return { pos: tmpA.set(px, py, pz).clone(), target: tmpB.set(tx, ty, tz).clone(), fov };
}
