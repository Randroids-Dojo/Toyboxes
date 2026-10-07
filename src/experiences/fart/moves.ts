// The player's toot moves on the engine's own physics: hops, scoots, air
// boosts and big ones are launches (ctx.impulse); hovers switch gravity off
// and hold a vertical speed. Every toot becomes an event the village hears.

import type { Action } from '../../input/input';
import type { PlayerState } from '../../world/space';
import type { ExperienceCtx } from '../common';
import type { CloudGas } from './sim/clouds';
import { FIZZY_CEILING, GAS, HOP_COST, SCOOT_COST, SCOOT_TIME, Tank, TootButton, boostVy, rocketCost, rocketVy, type Gas, type Move } from './sim/gas';
import { ChargeWhistle, fx, HoverToot, toot, type TootSize, type Voice } from './toots';

export interface TootEvent {
  gas: CloudGas;
  size: TootSize | 'hover';
  x: number;
  y: number;
  z: number;
  /** How far it is heard (0 for silent). */
  noise: number;
  /** How far it pushes props and birds. */
  push: number;
  /** Facing of the player, for pushes behind. */
  yaw: number;
}

export interface MoverHooks {
  onToot(e: TootEvent, move: Move['kind']): void;
  onEmpty(): void;
  onLand(fall: number, vy: number): void;
  voice(): Voice;
  /** Small dust and puff effects (from the world's renderer). */
  fx: {
    puffs(gas: CloudGas, at: { x: number; y: number; z: number }, n: number, dir: { x: number; y: number; z: number }, speed: number, size: number): void;
    ring(gas: CloudGas, at: { x: number; y: number; z: number }, n: number, speed: number, size: number): void;
    cloud(gas: CloudGas, at: { x: number; y: number; z: number }, big: number): void;
    word(text: string, at: { x: number; y: number; z: number }, color: string, size: number): void;
    dust(at: { x: number; y: number; z: number }, radius: number): void;
  };
}

export class Mover {
  readonly tank = new Tank();
  readonly btn = new TootButton();
  tapMode = false;
  /** Set by a press from any button this step. */
  private pressed: Action | null = null;
  private source: Action | null = null;
  private hoverY0 = 0;
  private hoverSound = new HoverToot();
  private whistle: ChargeWhistle | null = null;
  private scootT = 0;
  private scootDir = { x: 0, z: 0 };
  private shakeT = 0;
  private hoverPuffT = 0;
  private wasGrounded = true;
  private peakY = 0;
  private minVy = 0;
  /** Disabled during scripted moments (results, ceremony). */
  enabled = true;
  /** The gas cost the gauge should preview. */
  previewCost = 0;
  /** For debugInfo and tests. */
  readonly stats = { maxY: 0, startY: 0, boosts: 0, lastMove: '' as string, toots: 0, rockets: 0, hovering: false, charge: 0 };
  tumbleT = 0;
  private rocketUp = false;

  constructor(
    private ctx: ExperienceCtx,
    private hooks: MoverHooks,
  ) {}

  /** A toot button went down (Kick, Interact with nothing to use, or Jump in the air). */
  press(src: Action): void {
    if (!this.enabled) return;
    this.pressed = src;
    this.source = src;
  }

  get hovering(): boolean {
    return this.btn.hovering;
  }

  /** Gravity share for the engine (hovering holds its own vertical speed). */
  gravity(): number {
    return this.btn.hovering ? 0 : 1;
  }

  /** The prompt for the toot button right now. */
  label(p: PlayerState): string {
    if (this.tank.empty) return this.tank.gas ? 'Toot (empty)' : 'Toot';
    if (!p.grounded) return this.btn.hovering ? (this.tapMode ? 'Stop hovering' : 'Toot boost') : 'Toot boost (hold to hover)';
    if (Math.hypot(p.vx, p.vz) > 1.2) return 'Toot';
    return this.tapMode ? 'Toot (double tap for a big one)' : 'Toot (hold for a big one)';
  }

  step(h: number, p: PlayerState): void {
    const input = this.ctx.input;
    const held = this.source ? input.isHeld(this.source) : false;
    const moving = Math.hypot(p.vx, p.vz) > 1.2 || Math.hypot(input.move.x, input.move.y) > 0.35;
    const g = this.tank.gas;
    // Landing.
    if (p.grounded && !this.wasGrounded) {
      const fall = this.peakY - p.y;
      this.hooks.onLand(fall, this.minVy);
      if (fall > 6) {
        this.ctx.squash(0.45);
        fx.oof();
        this.hooks.fx.dust({ x: p.x, y: p.y, z: p.z }, 1.8);
        this.ctx.shake(0.2);
      } else if (fall > 2) {
        this.ctx.squash(0.25);
        this.hooks.fx.dust({ x: p.x, y: p.y, z: p.z }, 1.0);
      }
      this.peakY = p.y;
      this.minVy = 0;
    }
    if (p.grounded) {
      this.peakY = p.y;
      this.stats.startY = p.y;
    } else {
      this.peakY = Math.max(this.peakY, p.y);
      this.minVy = Math.min(this.minVy, p.vy);
    }
    this.stats.maxY = Math.max(this.stats.maxY, p.y - this.stats.startY);
    this.wasGrounded = p.grounded;

    const moves = this.enabled ? this.btn.step({ dt: h, pressed: !!this.pressed, held, grounded: p.grounded, moving, tapMode: this.tapMode, empty: this.tank.empty, gas: g }) : [];
    this.pressed = null;
    for (const m of moves) this.apply(m, p);

    // Charging: shake harder and harder, little leaks.
    if (this.btn.charging) {
      const c = this.btn.charge;
      this.stats.charge = c;
      this.whistle?.level(c);
      this.shakeT -= h;
      if (this.shakeT <= 0) {
        this.shakeT = 0.11 - c * 0.05;
        this.ctx.squash(0.05 + c * 0.12);
        if (Math.random() < 0.25 + c * 0.3) this.hooks.fx.puffs(g ?? 'beans', this.hip(p), 1, { x: 0, y: -0.2, z: 0 }, 0.6, 0.12);
      }
      this.previewCost = rocketCost(c);
    } else this.previewCost = 0;

    // Scoot burst: keep extra speed for a moment (walking control takes it back otherwise).
    if (this.scootT > 0) {
      this.scootT -= h;
      const k = Math.max(0, this.scootT / SCOOT_TIME);
      const burst = (g ? GAS[g].scootBurst : 6) * k;
      const add = burst * (1 - Math.exp(-12 * h));
      this.ctx.impulse(this.scootDir.x * add, 0, this.scootDir.z * add);
      if (Math.random() < 0.5) this.hooks.fx.puffs(g ?? 'beans', this.hip(p), 1, { x: -this.scootDir.x, y: 0, z: -this.scootDir.z }, 1.5, 0.16);
    }

    // Hover: hold a vertical speed, drain the tank, puff underneath.
    if (this.btn.hovering && g) {
      const s = GAS[g];
      this.tank.spend(s.hoverCost * h);
      this.hoverSound.set(this.tank.amount / 100);
      let vy = s.hoverVy;
      if (g === 'fizzy' && p.y - this.hoverY0 > FIZZY_CEILING) vy = 0;
      this.ctx.impulse(0, vy === 0 ? 0.0001 : vy, 0);
      this.hoverPuffT -= h;
      if (this.hoverPuffT <= 0) {
        this.hoverPuffT = 0.06;
        this.hooks.fx.puffs(g, { x: p.x, y: p.y + 0.2, z: p.z }, 1, { x: 0, y: -1, z: 0 }, 2.2, g === 'fizzy' ? 0.14 : 0.2);
        if (g === 'cabbage' && Math.random() < 0.15) this.hooks.fx.cloud('cabbage', { x: p.x, y: Math.max(0.6, p.y - 0.4), z: p.z }, 0.6);
      }
      this.hooks.onToot({ gas: g, size: 'hover', x: p.x, y: p.y, z: p.z, noise: 8 * h * 4, push: 1.5, yaw: p.yaw }, 'hover');
    }
    this.stats.hovering = this.btn.hovering;
    // The somersault at the top of a big one.
    if (this.rocketUp && !p.grounded && p.vy < 3 && !this.btn.hovering) {
      this.rocketUp = false;
      this.ctx.pose('tumble');
      this.tumbleT = 0.42;
    }
    if (p.grounded) this.rocketUp = false;
    if (this.tumbleT > 0) {
      this.tumbleT -= h;
      if (this.tumbleT <= 0 || p.grounded) {
        this.tumbleT = 0;
        this.ctx.pose(null);
      }
    }
  }

  private hip(p: PlayerState): { x: number; y: number; z: number } {
    return { x: p.x - Math.sin(p.yaw) * 0.22, y: p.y + 0.5, z: p.z - Math.cos(p.yaw) * 0.22 };
  }

  private apply(m: Move, p: PlayerState): void {
    const g = this.tank.gas;
    const voice = this.hooks.voice();
    const hip = this.hip(p);
    const back = { x: -Math.sin(p.yaw), y: -0.15, z: -Math.cos(p.yaw) };
    const word = (text: string, size = 1) => this.hooks.fx.word(text, { x: hip.x, y: hip.y + 0.6, z: hip.z }, g ? `#${GAS[g].colors[0].toString(16).padStart(6, '0')}` : '#ffffff', size);
    const ev = (size: TootSize, scale = 1): TootEvent => ({ gas: g!, size, x: hip.x, y: hip.y, z: hip.z, noise: (g ? GAS[g].noise : 0) * scale, push: (g ? GAS[g].push : 0) * scale, yaw: p.yaw });
    this.stats.lastMove = m.kind;
    switch (m.kind) {
      case 'empty':
        fx.eep();
        this.hooks.fx.puffs('squeeze', hip, 1, back, 0.6, 0.1);
        this.hooks.fx.word('eep.', { x: hip.x, y: hip.y + 0.4, z: hip.z }, '#fffdf5', 0.6);
        this.hooks.onEmpty();
        this.stopHover();
        return;
      case 'hop': {
        if (!g) return;
        this.tank.spend(HOP_COST);
        this.ctx.impulse(0, GAS[g].hopVy, 0);
        this.ctx.squash(-0.2);
        toot({ gas: g, size: g === 'fizzy' ? 'blip' : 'tap', voice });
        this.hooks.fx.puffs(g, hip, 8, back, 2.4, 0.2);
        this.hooks.fx.dust({ x: p.x, y: p.y, z: p.z }, 0.7);
        this.hooks.fx.cloud(g, hip, 0.8);
        word(wordFor(g, 'tap'));
        this.ctx.shake(0.05);
        this.hooks.onToot(ev('tap'), 'hop');
        break;
      }
      case 'scoot': {
        if (!g) return;
        this.tank.spend(SCOOT_COST);
        const sp = Math.hypot(p.vx, p.vz);
        this.scootDir = sp > 0.5 ? { x: p.vx / sp, z: p.vz / sp } : { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
        this.scootT = SCOOT_TIME;
        this.ctx.impulse(this.scootDir.x * GAS[g].scootBurst * 0.4, GAS[g].scootVy, this.scootDir.z * GAS[g].scootBurst * 0.4);
        this.ctx.squash(-0.15);
        toot({ gas: g, size: g === 'fizzy' ? 'blip' : 'scoot', voice });
        this.hooks.fx.puffs(g, hip, g === 'cabbage' ? 12 : 7, { x: -this.scootDir.x, y: -0.1, z: -this.scootDir.z }, 3, g === 'cabbage' ? 0.3 : 0.2);
        this.hooks.fx.cloud(g, hip, g === 'cabbage' ? 1.2 : 0.7);
        word(wordFor(g, 'scoot'), 0.9);
        this.hooks.onToot(ev('scoot'), 'scoot');
        break;
      }
      case 'boost': {
        if (!g) return;
        const cost = GAS[g].boostCost;
        this.tank.spend(cost);
        const vy = boostVy(g, p.vy);
        this.ctx.impulse(0, vy, 0);
        this.ctx.squash(-0.25);
        this.stats.boosts++;
        toot({ gas: g, size: g === 'fizzy' ? 'blip' : 'boost', voice });
        this.hooks.fx.ring(g, { x: p.x, y: p.y + 0.1, z: p.z }, g === 'fizzy' ? 6 : 10, 3, 0.22);
        this.hooks.fx.puffs(g, { x: p.x, y: p.y + 0.2, z: p.z }, 5, { x: 0, y: -1, z: 0 }, 3, 0.2);
        this.hooks.fx.cloud(g, { x: p.x, y: p.y, z: p.z }, 0.7);
        word(wordFor(g, 'boost'), g === 'fizzy' ? 0.7 : 1);
        this.ctx.shake(0.06);
        this.hooks.onToot(ev(g === 'fizzy' ? 'blip' : 'boost'), 'boost');
        break;
      }
      case 'charge':
        this.whistle = fx.chargeStart();
        this.ctx.pose('crouch');
        break;
      case 'chargeCancel':
        this.whistle?.stop();
        this.whistle = null;
        this.ctx.pose(null);
        break;
      case 'rocket': {
        if (!g) return;
        this.whistle?.stop();
        this.whistle = null;
        this.ctx.pose(null);
        const cost = rocketCost(m.charge);
        const enough = Math.min(1, this.tank.amount / cost);
        this.tank.spend(cost);
        const vy = rocketVy(g, m.charge) * (0.6 + 0.4 * enough);
        this.ctx.impulse(0, vy, 0);
        this.ctx.squash(-0.45);
        this.ctx.shake(0.25);
        this.stats.rockets++;
        toot({ gas: g, size: 'rocket', voice });
        fx.slideUp();
        this.hooks.fx.ring(g, { x: p.x, y: p.y + 0.15, z: p.z }, 18, 6, 0.32);
        this.hooks.fx.puffs(g, { x: p.x, y: p.y + 0.3, z: p.z }, 16, { x: 0, y: -1, z: 0 }, 4, 0.3);
        this.hooks.fx.cloud(g, { x: p.x, y: p.y + 0.6, z: p.z }, 1.8);
        this.hooks.fx.dust({ x: p.x, y: p.y, z: p.z }, 3);
        word(wordFor(g, 'rocket'), 1.5);
        this.tumbleT = 0;
        this.rocketUp = true;
        this.hooks.onToot(ev('rocket', 1.5), 'rocket');
        break;
      }
      case 'hover':
        if (m.on && g) {
          this.hoverY0 = p.y;
          this.hoverSound.start(g, voice);
          if (g === 'fizzy') this.ctx.pose('float');
          this.hooks.onToot(ev('boost', 0.6), 'hover');
        } else this.stopHover();
        break;
    }
    this.stats.toots++;
  }

  private stopHover(): void {
    if (this.hoverSound.on) this.hoverSound.stop();
    this.ctx.pose(null);
  }

  /** Clears held states (entering a trial, a cutscene). */
  reset(): void {
    this.btn.reset();
    this.whistle?.stop();
    this.whistle = null;
    this.stopHover();
    this.scootT = 0;
    this.pressed = null;
    this.source = null;
  }

  dispose(): void {
    this.reset();
  }
}

export function wordFor(g: Gas, size: string): string {
  if (size === 'rocket') return g === 'fizzy' ? 'FWEEEE!' : g === 'cabbage' ? 'BRRRAAAP!' : 'KA-PARP!';
  if (g === 'fizzy') return ['pip!', 'peep!', 'fip!', 'bip!'][Math.floor(Math.random() * 4)];
  if (g === 'cabbage') return ['BRRRP', 'FRRRT', 'PFFFT'][Math.floor(Math.random() * 3)];
  if (size === 'boost') return ['PARP!', 'BWAP!', 'PRRP!'][Math.floor(Math.random() * 3)];
  return ['TOOT!', 'PARP!', 'POOT!'][Math.floor(Math.random() * 3)];
}
