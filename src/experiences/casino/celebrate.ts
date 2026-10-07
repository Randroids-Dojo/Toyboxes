// Win ceremonies, sized by the win. "Win" means more back than you bet: a
// bet coming back gets a soft ding and a note, never win effects. Nothing
// flashes faster than three times a second, and Reduce motion drops shake,
// orbits and strobes.

import * as THREE from 'three';
import type { Hud, PostFX } from '../kit';
import type { ExperienceCtx } from '../common';
import { formatCredits } from '../common';
import { sound } from './audio';
import type { Director, Framing } from './director';
import type { Fx } from './fx';
import type { Lights } from './lighting';

export type Tier = 'loss' | 'back' | 'small' | 'nice' | 'big' | 'mega';

/** The size of a result: paid back against what was staked. */
export function winTier(paid: number, staked: number): Tier {
  if (paid <= 0) return 'loss';
  if (paid <= staked) return 'back';
  const m = paid / staked;
  if (m >= 50) return 'mega';
  if (m >= 15) return 'big';
  if (m >= 5) return 'nice';
  return 'small';
}

export interface WinOpts {
  paid: number;
  staked: number;
  /** Where the payout comes from (the coin tray, a table's centre). */
  at: THREE.Vector3;
  /** Which way coins fly. */
  dir: { x: number; z: number };
  /** A line for the toast, e.g. "Three bells". */
  label?: string;
  /** Leave big wins' coins on the floor here (Old Lucky only). */
  pile?: boolean;
  /** No coin burst (cards). */
  quiet?: boolean;
}

export interface JackpotOpts {
  kind: 'MINI' | 'MAJOR' | 'GRAND';
  mult: number;
  credits: number;
  bet: number;
  /** Camera keys orbiting the machine, built by the caller. */
  orbit: Framing[];
  at: THREE.Vector3;
  /** The banner, when it is not a jackpot (a royal flush gets the same ceremony). */
  title?: string;
  /** For the GRAND: a view over the stern for the fireworks, cut to after the orbit. */
  stern?: Framing;
  /** Called when the GRAND sets the River Wheel spinning by itself. */
  onGrand?: () => void;
}

export class Ceremonies {
  /** What is playing now, for debugInfo. */
  current: { kind: string; t: number } | null = null;
  private bulbBoost = 0;

  constructor(
    private ctx: ExperienceCtx,
    private kit: Hud,
    private fx: Fx,
    private lights: Lights,
    private post: PostFX,
    private director: Director,
  ) {}

  /** 0 to 1: how hard the decorative bulbs should be chasing right now. */
  get boost(): number {
    return this.bulbBoost;
  }

  update(dt: number): void {
    this.bulbBoost = Math.max(0, this.bulbBoost - dt * 0.35);
    if (this.current) this.current.t += dt;
    this.lights.glow = Math.max(0, this.lights.glow - dt * 0.12);
  }

  /** Plays the effects for a result and returns its tier. */
  win(o: WinOpts): Tier {
    const tier = winTier(o.paid, o.staked);
    const rm = this.ctx.reduceMotion();
    const pop = (size = 1.4, color = '#ffd24a') => {
      this.kit.pop(`+${formatCredits(o.paid)}`, { x: o.at.x, y: o.at.y + 0.6, z: o.at.z }, { color, size, life: 1.3, rise: 1.6 });
      // Place it now rather than on the next step.
      this.kit.update(0);
    };
    switch (tier) {
      case 'loss':
        return tier;
      case 'back': {
        sound.betBack();
        const what = o.paid === o.staked ? 'your bet comes back' : `${formatCredits(o.paid)} of your ${formatCredits(o.staked)} comes back`;
        this.ctx.ui.toast(o.label ? `${o.label}: ${what}` : what.charAt(0).toUpperCase() + what.slice(1));
        return tier;
      }
      case 'small':
        if (!o.quiet) this.fx.coinBurst(o.at, 12, o.dir, { speed: 2.2, up: 2.4 });
        sound.coins(o.paid);
        pop(1.3);
        this.bulbBoost = Math.max(this.bulbBoost, 0.4);
        if (o.label) this.ctx.ui.toast(`${o.label}: you win ${formatCredits(o.paid)}`, 'good');
        return tier;
      case 'nice':
        if (!o.quiet) this.fx.coinBurst(o.at, 40, o.dir, { speed: 2.8, up: 3.2, spread: 1.3 });
        sound.coins(o.paid);
        pop(1.7);
        this.bulbBoost = Math.max(this.bulbBoost, 0.7);
        if (!rm) this.ctx.shake(0.12);
        this.ctx.ui.toast(`${o.label ? `${o.label}: ` : ''}you win ${formatCredits(o.paid)}`, 'good');
        return tier;
      case 'big':
        this.fountain(o, 3, 34);
        sound.coins(o.paid);
        sound.whistle(false);
        sound.fanfare('big');
        pop(2.1);
        this.bulbBoost = 1;
        this.post.pulse(0.5);
        if (!rm) this.ctx.shake(0.22);
        this.kit.banner('BIG WIN', { sub: `${formatCredits(o.paid)} play credits`, color: '#ffd24a', ms: 2200 });
        return tier;
      case 'mega':
        this.fountain(o, 4, 60);
        if (o.pile) this.fx.coinBurst(o.at, 90, o.dir, { speed: 4.2, up: 4.5, spread: 1.6, keep: true });
        sound.coins(o.paid);
        sound.whistle(true);
        sound.fanfare('grand');
        pop(2.6);
        this.bulbBoost = 1;
        this.lights.glow = 1;
        this.post.pulse(0.8);
        if (!rm) this.ctx.shake(0.32);
        this.kit.banner('MEGA WIN', { sub: `${formatCredits(o.paid)} play credits`, color: '#ffd24a', ms: 2600, size: 'xl' });
        return tier;
    }
  }

  /** A fountain of coins over a few seconds, in waves. */
  private fountain(o: WinOpts, seconds: number, perWave: number): void {
    const waves = Math.round(seconds * 3);
    for (let i = 0; i < waves; i++) {
      setTimeout(() => this.fx.coinBurst(o.at, perWave / 3, o.dir, { speed: 3, up: 5, spread: 1.2 }), i * 333);
    }
    this.fx.glow.burst({ at: o.at, count: 30, shape: 'up', speed: [1, 3], color: [0xffd24a, 0xffa040], size: [0.2, 0.45], life: [0.6, 1.2], gravity: -1 });
  }

  /**
   * MINI, MAJOR and GRAND. MINI is a short burst; MAJOR dims the room and
   * orbits the machine; GRAND adds confetti and fireworks and can be skipped
   * after three seconds.
   */
  async jackpot(o: JackpotOpts): Promise<void> {
    const rm = this.ctx.reduceMotion();
    this.current = { kind: o.kind, t: 0 };
    const label = o.title ?? `${o.kind} JACKPOT`;
    if (o.kind === 'MINI') {
      sound.fanfare('big');
      sound.coins(o.credits);
      this.bulbBoost = 1;
      this.post.pulse(0.6);
      this.kit.banner(label, { sub: `${o.mult}x your bet: ${formatCredits(o.credits)}`, color: '#ffd24a', ms: 2800 });
      for (let i = 0; i < 9; i++) setTimeout(() => this.fx.coinBurst(o.at, 30, { x: 0, z: 1 }, { speed: 3, up: 5, spread: 1.4 }), i * 330);
      await new Promise((r) => setTimeout(r, 3000));
      this.current = null;
      return;
    }
    const grand = o.kind === 'GRAND';
    this.lights.dim = 0.3;
    sound.whistle(true);
    sound.fanfare('grand');
    this.post.pulse(1);
    this.bulbBoost = 1;
    this.kit.letterbox(true);
    this.kit.banner(label, { sub: `${o.mult}x your bet: ${formatCredits(o.credits)}`, color: '#ffd24a', ms: grand ? 5200 : 3800, size: 'xl' });
    const total = grand ? 12 : 6;
    const orbitT = grand && o.stern ? 7 : total;
    const keys = rm || o.orbit.length < 2 ? [{ t: 0, f: o.orbit[0] }, { t: orbitT, f: o.orbit[0] }] : o.orbit.map((f, i) => ({ t: (i / (o.orbit.length - 1)) * orbitT, f }));
    if (grand && o.stern) {
      // A cut to the stern for the fireworks over the river, then back to the machine.
      keys.push({ t: orbitT + 0.01, f: o.stern }, { t: total - 1.2, f: o.stern }, { t: total - 1.19, f: o.orbit[o.orbit.length - 1] }, { t: total, f: o.orbit[o.orbit.length - 1] });
      o.onGrand?.();
    }
    const timers: number[] = [];
    const every = (ms: number, count: number, f: (i: number) => void) => {
      for (let i = 0; i < count; i++) timers.push(window.setTimeout(() => f(i), i * ms));
    };
    every(330, Math.round(total * 3), () => this.fx.coinBurst(o.at, grand ? 26 : 18, { x: 0, z: 1 }, { speed: 3.5, up: 5.5, spread: 1.5, keep: true }));
    every(800, Math.round(total / 0.8), () => this.fx.steam.burst({ at: { x: o.at.x + (Math.random() - 0.5) * 3, y: 8.8, z: o.at.z - 0.5 }, count: 18, shape: 'up', speed: [1.5, 3], color: 0xf4f0ea, size: [0.6, 1.2], sizeEnd: 2.4, life: [1.4, 2.2], gravity: -0.6, alpha: 0.5 }));
    if (grand) {
      every(500, 20, (i) => {
        const x = -8 + (i % 5) * 4;
        this.fx.confetti.burst({ at: { x, y: 5.6, z: (i % 2 ? -1 : 1) * 3.5 }, count: 70, shape: 'cone', dir: { x: 0, y: -1, z: 0 }, spread: 0.9, speed: [2, 5], color: [0xffd24a, 0xd8574a], size: [0.12, 0.2], life: [2.5, 3.5], gravity: 3, drag: 1.2, sizeEnd: 1 });
      });
      every(700, 14, () => {
        const at = { x: 26 + Math.random() * 20, y: 18 + Math.random() * 10, z: (Math.random() - 0.5) * 40 };
        this.fx.sparks.burst({ at, count: 120, shape: 'sphere', speed: [6, 12], color: [0xffd24a, Math.random() < 0.5 ? 0xff5a3c : 0x9fd8ff], life: [1.0, 1.6], size: [0.25, 0.45], gravity: 4, drag: 0.8 });
        sound.thunk();
      });
    }
    await this.director.play(keys, { skippableAfter: grand ? 3 : 1.5 });
    for (const t of timers) clearTimeout(t);
    this.kit.letterbox(false);
    this.lights.dim = 1;
    this.lights.glow = 1;
    this.current = null;
  }
}
