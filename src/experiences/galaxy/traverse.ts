// Moving the player along scripted paths through the `carry` hook: star
// sling flights, bounce blossom hops, comet lanes, the star net's bubble,
// meteor tumbles and the finale's fall. Deterministic, so the boards stay fair.

import { arcAt, type Arc, type Spot3 } from '../../shared/galaxy-rules';
import type { Pose } from '../../world/avatar';
import type { Carry, MoveInput, PlayerState } from '../../world/space';

export type RideKind = 'sling' | 'hop' | 'lane' | 'net' | 'tumble' | 'comet' | 'fall' | 'warp';

interface Base {
  kind: RideKind;
  t: number;
  pose: Pose;
  onStart?: () => void;
  onEnd?: () => void;
  started?: boolean;
}

export type Ride =
  | (Base & { type: 'arc'; arc: Arc; eased: boolean; yaw?: number })
  | (Base & { type: 'path'; dur: number; at: (t: number) => Spot3; yaw?: (t: number) => number })
  | (Base & { type: 'hold'; dur: number; at: (t: number) => Spot3; yaw: number })
  | (Base & { type: 'custom'; step: (h: number, p: PlayerState, move: MoveInput) => Carry | null });

export class Traverse {
  ride: Ride | null = null;
  private queue: Ride[] = [];
  private last: Spot3 | null = null;
  private yaw = 0;

  get kind(): RideKind | null {
    return this.ride?.kind ?? null;
  }

  get busy(): boolean {
    return !!this.ride;
  }

  /** Starts a ride now, dropping anything queued. */
  start(...rides: Ride[]): void {
    this.ride = rides[0] ?? null;
    this.queue = rides.slice(1);
  }

  cancel(): void {
    this.ride = null;
    this.queue = [];
  }

  carry(h: number, p: PlayerState, move: MoveInput): Carry | null {
    const r = this.ride;
    if (!r) {
      this.last = null;
      return null;
    }
    if (!r.started) {
      r.started = true;
      this.yaw = p.yaw;
      this.last = { x: p.x, y: p.y, z: p.z };
      r.onStart?.();
    }
    r.t += h;
    let pos: Spot3;
    let done = false;
    let yaw: number | null = null;
    if (r.type === 'custom') {
      const c = r.step(h, p, move);
      if (!c) {
        this.finish(r);
        return this.ride ? this.carry(0, p, move) : null;
      }
      this.last = c;
      return c;
    } else if (r.type === 'arc') {
      const a = arcAt(r.arc, r.t, r.eased);
      pos = a;
      done = a.done;
      yaw = r.yaw ?? null;
    } else {
      const u = Math.min(1, r.t / r.dur);
      pos = r.at(u);
      done = r.t >= r.dur;
      yaw = r.type === 'hold' ? r.yaw : (r.yaw?.(u) ?? null);
    }
    const prev = this.last ?? pos;
    const dx = pos.x - prev.x;
    const dz = pos.z - prev.z;
    if (yaw === null) {
      if (Math.hypot(dx, dz) > 1e-4) this.yaw = Math.atan2(dx, dz);
    } else this.yaw = yaw;
    this.last = { ...pos };
    const speed = h > 0 ? Math.hypot(dx, dz) / h : 0;
    const out: Carry = { x: pos.x, y: pos.y, z: pos.z, yaw: this.yaw, pose: r.pose, speed };
    if (done) this.finish(r);
    return out;
  }

  private finish(r: Ride): void {
    if (this.ride !== r) return;
    this.ride = this.queue.shift() ?? null;
    r.onEnd?.();
  }
}
