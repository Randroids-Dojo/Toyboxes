// Show first: while you roam, the robots play. A bots-only laser tag match
// runs in Comet Yard (seen through its glass) and two duelists spar on the
// beat in the Blade Ring, so every game is seen before it is tried. Both only
// run when you are near, and the yard idles on the low tier.

import * as THREE from 'three';
import { ARENA } from '../../shared/neon/arena';
import type { Tier } from '../../world/space';
import { DUELISTS as LOOKS, Robot, tagBot } from './robots';
import { blaster, prismBlade } from './style';
import { TagSim } from './tag-sim';
import { RING } from './station';
import { C } from './util';
import type { Fx } from './world';

const DT = 1 / 60;

export class AttractYard {
  private sim: TagSim | null = null;
  private bots: { id: number; robot: Robot }[] = [];
  private bolts: THREE.InstancedMesh;
  private acc = 0;
  private seed = 101;
  private dummy = new THREE.Object3D();
  private tier: Tier = 'medium';
  active = false;

  constructor(
    private scene: THREE.Scene,
    private fx: Fx,
  ) {
    const g = new THREE.CapsuleGeometry(0.06, 0.8, 2, 6);
    g.rotateX(Math.PI / 2);
    this.bolts = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff }), 32);
    this.bolts.count = 0;
    this.bolts.frustumCulled = false;
    scene.add(this.bolts);
  }

  setQuality(t: Tier): void {
    this.tier = t;
  }

  private start(): void {
    this.sim = new TagSim({ layout: 'prism', size: 3, diff: 'normal', captain: false, seed: this.seed++, duration: 600, echo: false, bpm: 124 });
    // Nobody controls the cyan player: it sits the match out.
    const p = this.sim.player;
    p.outT = 1e9;
    p.x = 0;
    p.z = -21;
    for (const a of this.sim.agents) {
      if (a.player) continue;
      const robot = tagBot(a.team, false);
      robot.root.scale.multiplyScalar(0.86);
      robot.handR.add(blaster(a.team === 'cyan' ? C.cyan : C.pink));
      this.scene.add(robot.root);
      this.bots.push({ id: a.id, robot });
    }
  }

  private stop(): void {
    for (const b of this.bots) {
      this.scene.remove(b.robot.root);
      b.robot.dispose();
    }
    this.bots = [];
    this.sim = null;
    this.bolts.count = 0;
  }

  /** `near` says whether the yard is worth running (you are close and no game is on). */
  update(dt: number, beat: number, near: boolean): void {
    if (!near) {
      if (this.sim) this.stop();
      this.active = false;
      return;
    }
    if (!this.sim) this.start();
    this.active = true;
    const sim = this.sim!;
    // On the low tier the bots stand and bob instead of playing.
    if (this.tier !== 'low') {
      this.acc += Math.min(0.1, dt);
      while (this.acc >= DT) {
        this.acc -= DT;
        sim.beat = beat;
        sim.step(DT);
        for (const e of sim.take()) {
          if (e.k === 'tag') {
            const v = sim.agents[e.a];
            this.fx.sparks.burst({ at: { x: v.x, y: 1.1, z: v.z }, count: 16, speed: [2, 5], color: [v.team === 'cyan' ? C.cyan : C.pink, C.white], life: [0.2, 0.4], size: [0.05, 0.1] });
          }
        }
      }
    }
    for (const b of this.bots) {
      const a = sim.agents[b.id];
      const r = b.robot;
      r.root.visible = a.outT <= 0;
      r.root.position.set(a.x, 0, a.z);
      r.root.rotation.y = a.yaw;
      r.rig.rotation.x = Math.min(0.25, Math.hypot(a.vx, a.vz) * 0.05);
      r.armR.rotation.x += ((a.teleT > 0 || a.state === 'engage' ? -1.55 : -0.3) - r.armR.rotation.x) * Math.min(1, dt * 10);
      r.setGlow(a.teleT > 0 ? 2 : 1);
      r.idle(dt, beat, 0.5);
    }
    const n = Math.min(32, sim.bolts.length);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const b = sim.bolts[i];
      this.dummy.position.set(b.x, 1.1, b.z);
      this.dummy.rotation.set(0, Math.atan2(b.vx, b.vz), 0);
      this.dummy.updateMatrix();
      this.bolts.setMatrixAt(i, this.dummy.matrix);
      this.bolts.setColorAt(i, c.setHex(b.team === 'cyan' ? C.cyan : C.pink).lerp(new THREE.Color(0xffffff), 0.4).multiplyScalar(2));
    }
    this.bolts.count = n;
    this.bolts.instanceMatrix.needsUpdate = true;
    if (this.bolts.instanceColor) this.bolts.instanceColor.needsUpdate = true;
    // A long match: start a fresh one now and then.
    if (sim.time > 240) {
      this.stop();
      this.start();
    }
  }

  dispose(): void {
    this.stop();
    this.scene.remove(this.bolts);
  }
}

/** Two duelists sparring on the beat in the middle of the Blade Ring. */
export class Spar {
  private a: Robot;
  private b: Robot;
  private group = new THREE.Group();
  private lastBeat = -1;

  constructor(
    scene: THREE.Scene,
    private fx: Fx,
  ) {
    this.a = new Robot({ ...LOOKS[0].look });
    this.b = new Robot({ head: 'dome', body: 0x1d3a6a, trim: C.cyan, badge: 'circle', scale: 0.9 });
    for (const [r, x, yaw, color] of [
      [this.a, RING.x - 1.3, Math.PI / 2, LOOKS[0].blade],
      [this.b, RING.x + 1.3, -Math.PI / 2, C.cyan],
    ] as const) {
      r.root.position.set(x, 0, 0);
      r.root.rotation.y = yaw;
      const blade = prismBlade(color, 0.9);
      blade.rotation.x = Math.PI;
      r.handR.add(blade);
      this.group.add(r.root);
    }
    scene.add(this.group);
  }

  set visible(v: boolean) {
    this.group.visible = v;
  }

  update(dt: number, beat: number): void {
    if (!this.group.visible) return;
    const bi = Math.floor(beat);
    const ph = beat - bi;
    // On every second beat one of them strikes and the other parries.
    const attackerA = Math.floor(beat / 2) % 2 === 0;
    const swing = Math.exp(-ph * 5);
    for (const [r, att] of [
      [this.a, attackerA],
      [this.b, !attackerA],
    ] as const) {
      r.idle(dt, beat, 0.6);
      const target = att ? (bi % 2 === 0 ? -2.3 + swing * 1.8 : -1.3) : -1.6 - swing * 0.4;
      r.armR.rotation.x += (target - r.armR.rotation.x) * Math.min(1, dt * 14);
      r.rig.rotation.x = att ? 0.12 * swing : -0.08 * swing;
    }
    if (bi !== this.lastBeat) {
      this.lastBeat = bi;
      if (bi % 2 === 0) this.fx.sparks.burst({ at: { x: RING.x, y: 1.4, z: 0 }, count: 10, speed: [1.5, 4], color: [C.white, C.gold], life: [0.15, 0.3], size: [0.04, 0.08] });
    }
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.a.dispose();
    this.b.dispose();
  }
}

/** Whether a point is close enough to Comet Yard to bother running its bots. */
export function nearYard(x: number, z: number): boolean {
  const dx = Math.max(ARENA.x0 - x, 0, x - ARENA.x1);
  const dz = Math.max(ARENA.z0 - z, 0, z - ARENA.z1);
  return Math.hypot(dx, dz) < 35;
}
