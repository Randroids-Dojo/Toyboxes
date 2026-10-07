// The tummy and the moves: what each food does, what each toot costs, and the
// little state machine that turns one button (press, hold, release) into hops,
// scoots, boosts, big ones and hovers. Pure, so the move heights are tested.

export type Gas = 'beans' | 'fizzy' | 'cabbage';
export const GASES: Gas[] = ['beans', 'fizzy', 'cabbage'];

/** The engine's numbers (src/game/game.ts). */
export const GRAVITY = 24;
export const WALK = 6;
export const JUMP_SPEED = 7.6;

export interface GasSpec {
  name: string;
  food: string;
  hopVy: number;
  scootVy: number;
  /** Forward burst, m/s, fading over SCOOT_TIME. */
  scootBurst: number;
  /** Air boosts per airtime (Infinity for the fizzy flutter). */
  boosts: number;
  boostVy: number;
  rocketVy: [number, number];
  /** Vertical speed while hovering (negative sinks). */
  hoverVy: number;
  hoverCost: number;
  boostCost: number;
  /** How far the toot is heard, and how far it pushes things. */
  noise: number;
  push: number;
  /** Stink strength and how long the cloud lingers. */
  stink: number;
  stinkLife: number;
  colors: [number, number, number];
}

export const GAS: Record<Gas, GasSpec> = {
  beans: { name: 'Beans', food: 'Eat beans', hopVy: 6, scootVy: 4.4, scootBurst: 8, boosts: 2, boostVy: 10, rocketVy: [13, 20], hoverVy: -1, hoverCost: 30, boostCost: 15, noise: 12, push: 2.5, stink: 0.5, stinkLife: 4, colors: [0x8fd14f, 0xd4f58a, 0x5e9e2e] },
  fizzy: { name: 'Fizzy pop', food: 'Drink fizzy pop', hopVy: 5, scootVy: 4, scootBurst: 6, boosts: Infinity, boostVy: 4, rocketVy: [10, 15], hoverVy: 0.4, hoverCost: 22, boostCost: 6, noise: 7, push: 1.5, stink: 0.15, stinkLife: 1.5, colors: [0xff8fc8, 0x9fe3ff, 0xffc4e4] },
  cabbage: { name: 'Cabbage', food: 'Eat cabbage', hopVy: 4.5, scootVy: 3.6, scootBurst: 4, boosts: 1, boostVy: 6.9, rocketVy: [9, 13], hoverVy: -1.8, hoverCost: 18, boostCost: 15, noise: 9, push: 1.8, stink: 1, stinkLife: 12, colors: [0x9b7bd6, 0xb7e36a, 0x7a5cb8] },
};

export const HOP_COST = 8;
export const SCOOT_COST = 8;
export const SCOOT_TIME = 0.25;
/** A tap on the ground fires on release, or here at the latest. */
export const HOLD_START = 0.35;
export const CHARGE_FULL = 1.0;
/** Holding in the air this long turns a boost into a hover. */
export const HOVER_HOLD = 0.22;
export const DOUBLE_TAP = 0.3;
export const FIZZY_CEILING = 3;
export const CRUMB_REFILL = 15;
export const SQUEEZE_COST = 20;

export function rocketCost(charge: number): number {
  return 25 + 15 * clamp01(charge);
}

export function rocketVy(gas: Gas, charge: number): number {
  const [lo, hi] = GAS[gas].rocketVy;
  return lo + (hi - lo) * clamp01(charge);
}

/** The vertical speed after an air boost. */
export function boostVy(gas: Gas, vy: number): number {
  const s = GAS[gas];
  if (gas === 'fizzy') return Math.min(vy + s.boostVy, 5);
  // Best at the top of a jump: rising speed only carries over in part.
  return Math.max(vy, 0) * 0.3 + s.boostVy;
}

/** Apex height of a launch at vy. */
export function apex(vy: number): number {
  return (vy * vy) / (2 * GRAVITY);
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ---------------------------------------------------------------------------
// The tank

export class Tank {
  gas: Gas | null = null;
  amount = 0;

  eat(g: Gas): void {
    this.gas = g;
    this.amount = 100;
  }

  /** A puff crumb: tops up what you have, or gives a little beans. */
  crumb(): void {
    if (!this.gas) this.gas = 'beans';
    this.amount = Math.min(100, this.amount + CRUMB_REFILL);
  }

  has(cost: number): boolean {
    return !!this.gas && this.amount >= Math.min(cost, 4);
  }

  spend(cost: number): void {
    this.amount = Math.max(0, this.amount - cost);
  }

  get empty(): boolean {
    return !this.gas || this.amount <= 0.01;
  }
}

// ---------------------------------------------------------------------------
// One button to moves

export type Move =
  | { kind: 'hop' }
  | { kind: 'scoot' }
  | { kind: 'boost' }
  | { kind: 'rocket'; charge: number }
  | { kind: 'charge' }
  | { kind: 'chargeCancel' }
  | { kind: 'hover'; on: boolean }
  | { kind: 'empty' };

export interface ButtonIn {
  dt: number;
  /** A new press this step. */
  pressed: boolean;
  held: boolean;
  grounded: boolean;
  moving: boolean;
  tapMode: boolean;
  empty: boolean;
  gas: Gas | null;
}

export class TootButton {
  phase: 'idle' | 'pending' | 'charging' | 'airHold' | 'hover' = 'idle';
  t = 0;
  charge = 0;
  boostsUsed = 0;
  /** Tap mode: waiting to see if a second tap follows. */
  tapWait = -1;
  private wasGrounded = true;

  reset(): void {
    this.phase = 'idle';
    this.t = 0;
    this.charge = 0;
    this.tapWait = -1;
  }

  get hovering(): boolean {
    return this.phase === 'hover';
  }

  get charging(): boolean {
    return this.phase === 'charging';
  }

  step(i: ButtonIn): Move[] {
    const out: Move[] = [];
    if (i.grounded && !this.wasGrounded) this.boostsUsed = 0;
    if (i.grounded) this.boostsUsed = 0;
    this.wasGrounded = i.grounded;
    if (this.phase === 'hover' && (i.grounded || i.empty)) {
      this.phase = 'idle';
      out.push({ kind: 'hover', on: false });
    }
    if (this.phase === 'airHold' && i.grounded) this.phase = 'idle';
    if ((this.phase === 'pending' || this.phase === 'charging') && !i.grounded) {
      if (this.phase === 'charging') out.push({ kind: 'chargeCancel' });
      this.phase = 'idle';
    }
    if (i.pressed) {
      this.press(i, out);
      return out;
    }
    switch (this.phase) {
      case 'pending':
        this.t += i.dt;
        if (i.moving) {
          this.phase = 'idle';
          out.push({ kind: 'scoot' });
        } else if (!i.held) {
          this.phase = 'idle';
          out.push({ kind: 'hop' });
        } else if (this.t >= HOLD_START) {
          this.phase = 'charging';
          this.charge = 0;
          out.push({ kind: 'charge' });
        }
        break;
      case 'charging':
        this.t += i.dt;
        this.charge = clamp01((this.t - HOLD_START) / (CHARGE_FULL - HOLD_START));
        if (i.moving) {
          this.phase = 'idle';
          out.push({ kind: 'chargeCancel' }, { kind: 'scoot' });
        } else if (!i.held) {
          this.phase = 'idle';
          out.push({ kind: 'rocket', charge: this.charge });
        }
        break;
      case 'airHold':
        this.t += i.dt;
        if (!i.held) this.phase = 'idle';
        else if (this.t >= HOVER_HOLD) {
          this.phase = 'hover';
          out.push({ kind: 'hover', on: true });
        }
        break;
      case 'hover':
        if (!i.tapMode && !i.held) {
          this.phase = 'idle';
          out.push({ kind: 'hover', on: false });
        }
        break;
      default:
        break;
    }
    if (this.tapWait >= 0) {
      this.tapWait += i.dt;
      if (!i.grounded) this.tapWait = -1;
      else if (i.moving) {
        this.tapWait = -1;
        out.push({ kind: 'scoot' });
      } else if (this.tapWait > DOUBLE_TAP) {
        this.tapWait = -1;
        out.push({ kind: 'hop' });
      }
    }
    return out;
  }

  private press(i: ButtonIn, out: Move[]): void {
    if (i.empty || !i.gas) {
      if (this.phase === 'hover') out.push({ kind: 'hover', on: false });
      this.phase = 'idle';
      out.push({ kind: 'empty' });
      return;
    }
    if (!i.grounded) {
      if (this.phase === 'hover') {
        // Tap mode toggles the hover off; in hold mode a new press re-boosts.
        this.phase = 'idle';
        out.push({ kind: 'hover', on: false });
        if (i.tapMode) return;
      }
      if (this.boostsUsed < GAS[i.gas].boosts) {
        this.boostsUsed++;
        out.push({ kind: 'boost' });
        this.phase = i.tapMode ? 'idle' : 'airHold';
        this.t = 0;
      } else {
        this.phase = 'hover';
        out.push({ kind: 'hover', on: true });
      }
      return;
    }
    if (i.moving) {
      out.push({ kind: 'scoot' });
      return;
    }
    if (i.tapMode) {
      if (this.tapWait >= 0) {
        this.tapWait = -1;
        out.push({ kind: 'rocket', charge: 1 });
      } else this.tapWait = 0;
      return;
    }
    this.phase = 'pending';
    this.t = 0;
  }
}
