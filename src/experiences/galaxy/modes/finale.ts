// The finale: step off the Horizon stair's lip and fall into the black hole.
// A warp tunnel of the drawing's six streak colours, one beat of silence,
// then a white flash and the bloom: a new spiral galaxy where the black hole
// was, every constellation lit, and a small new black hole, hungry again.

import * as THREE from 'three';
import { BH, HUB, STAIR } from '../../../shared/galaxy-rules';
import type { CameraShot, Carry, PlayerState } from '../../../world/space';
import { music } from '../../kit';
import { gsfx, HORIZON_SONG } from '../audio';
import type { Galaxy } from '../index';
import type { Round } from './round';

const FALL = 2.6;
const TUNNEL = 4.2;
const DARK = 1.0;
const AFTER = 5.2;

export class Finale implements Round {
  readonly id = 'finale' as const;
  readonly boarded = false;
  private t = 0;
  private stage: 'fall' | 'tunnel' | 'dark' | 'bloom' | 'done' = 'fall';
  private from: THREE.Vector3;
  private camPos = new THREE.Vector3();
  private camTarget = new THREE.Vector3();
  private skippable: boolean;
  private bloomed = false;

  constructor(private g: Galaxy) {
    const lip = STAIR[STAIR.length - 1];
    this.from = new THREE.Vector3(g.player.x, lip.y, g.player.z);
    this.skippable = g.save.data.bloomed > 0;
    g.hud.letterbox(true);
    g.hud.objective(null);
    music.play(HORIZON_SONG, { fadeIn: 0.3 });
    gsfx.whoosh();
    g.ctx.squash(-0.3);
  }

  holdsTime(): boolean {
    return this.stage !== 'done';
  }

  carry(_h: number, p: PlayerState): Carry | null {
    void p;
    if (this.stage === 'done') return null;
    const hole = this.g.hole.centre;
    if (this.stage === 'fall') {
      const u = Math.min(1, this.t / FALL);
      const e = u * u;
      const at = this.from.clone().lerp(hole, e);
      at.y += Math.sin(u * Math.PI) * 3;
      return { x: at.x, y: at.y, z: at.z, yaw: Math.atan2(hole.x - this.from.x, hole.z - this.from.z), pose: u < 0.4 ? 'fly' : 'tumble', speed: 8 };
    }
    // Inside: keep the player out of sight in the middle of the hole until the bloom.
    if (this.stage !== 'bloom') return { x: hole.x, y: hole.y - 2, z: hole.z, yaw: 0, pose: 'float', speed: 0 };
    const a = HUB.arrival;
    return { x: a.x, y: 0, z: a.z, yaw: a.yaw, pose: 'cheer', speed: 0 };
  }

  shot(dt: number): CameraShot | null {
    if (this.stage === 'done') return null;
    const hole = this.g.hole.centre;
    let pos: THREE.Vector3;
    let target: THREE.Vector3;
    let fov = 60;
    if (this.stage === 'fall' || this.stage === 'tunnel' || this.stage === 'dark') {
      // Over your shoulder, over the photon ring, into the dark.
      const p = new THREE.Vector3(this.g.player.x, this.g.player.y + 1, this.g.player.z);
      const back = new THREE.Vector3().subVectors(p, hole).normalize();
      pos = p.clone().addScaledVector(back, 5).add(new THREE.Vector3(0, 2.4, 0));
      target = hole.clone();
      fov = 60 + Math.min(1, this.t / FALL) * 25;
    } else {
      // The bloom: high over the hub, looking out at the new galaxy.
      const u = Math.min(1, (this.t - FALL - TUNNEL - DARK) / AFTER);
      pos = new THREE.Vector3(-6 + u * 6, 30 - u * 8, 34 - u * 10);
      target = new THREE.Vector3(BH.x * 0.6, 18, BH.z - 10);
      fov = 62;
    }
    const k = this.stage === 'bloom' ? 1 : Math.min(1, dt * 6);
    if (this.t < 0.05 || this.stage === 'bloom') {
      this.camPos.copy(pos);
      this.camTarget.copy(target);
    } else {
      this.camPos.lerp(pos, k);
      this.camTarget.lerp(target, k);
    }
    return { position: this.camPos, target: this.camTarget, fov, lockPlayer: true, blend: 1, skip: this.skippable ? () => this.skip() : undefined, skipLabel: 'Skip' };
  }

  private skip(): void {
    if (!this.bloomed) this.bloom();
    this.end();
  }

  step(dt: number, p: PlayerState): void {
    void p;
    if (this.stage === 'done') return;
    this.t += dt;
    const g = this.g;
    const reduce = g.ctx.reduceMotion();
    if (this.stage === 'fall' && this.t >= FALL) {
      this.stage = 'tunnel';
      gsfx.warp();
      g.hud.flash('#ffffff', 300, 0.4);
    }
    if (this.stage === 'tunnel') {
      const u = (this.t - FALL) / TUNNEL;
      g.fade.tunnel = Math.min(1, u * 3, (1 - u) * 6);
      g.fade.spin = reduce ? 0 : 0.6 + u * 2.4;
      g.fade.amount = 0;
      if (u >= 1) {
        this.stage = 'dark';
        g.fade.tunnel = 0;
        g.fade.amount = 1;
        g.fade.color.set('#000000');
        music.stop(0.1);
      }
    } else if (this.stage === 'dark' && this.t >= FALL + TUNNEL + DARK) {
      this.stage = 'bloom';
      this.bloom();
    } else if (this.stage === 'bloom') {
      g.fade.amount = Math.max(0, g.fade.amount - dt * 0.8);
      if (this.t >= FALL + TUNNEL + DARK + AFTER) this.end();
    }
  }

  private bloom(): void {
    if (this.bloomed) return;
    this.bloomed = true;
    const g = this.g;
    g.fade.color.set('#ffffff');
    g.fade.amount = 1;
    g.fade.tunnel = 0;
    g.hud.flash('#ffffff', 900, 1);
    gsfx.bloom();
    g.save.update((d) => {
      d.bloomed += 1;
      d.reborn = true;
    });
    g.sky.setBloom(1);
    g.rebirth();
    g.hud.banner('Black hole bloom', { sub: `${g.ctx.name()}'s galaxy`, color: '#f4b740', size: 'xl', ms: 4200 });
    g.hubMusic();
    g.glows.burst({ at: { x: BH.x, y: BH.y, z: BH.z }, count: 400, speed: [10, 40], color: [0xf4b740, 0x8a6bd1], colorEnd: 0x3fb68b, size: [0.8, 2], life: [1.5, 3], drag: 0.4 });
  }

  private end(): void {
    if (this.stage === 'done') return;
    this.stage = 'done';
    const g = this.g;
    g.fade.amount = 0;
    g.fade.tunnel = 0;
    g.hud.letterbox(false);
    const a = HUB.arrival;
    g.ctx.teleport(a.x, a.z, a.yaw, 0);
    g.endRound();
    g.ctx.ui.toast('Nova medals are out there now. Try every challenge again.', 'good', 5000);
  }

  update(): void {}

  dispose(): void {
    this.g.fade.amount = 0;
    this.g.fade.tunnel = 0;
    this.g.hud.letterbox(false);
  }

  debug() {
    return { stage: this.stage, t: this.t };
  }
}
