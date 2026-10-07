// Rock rain on Cinder: 60 seconds of meteors on a fixed, beat-aligned
// schedule. Each one is announced by a closing coral ring and a beam from
// the sky; a hit knocks you over and costs a shield, and tiles crack, then
// fall. Grab the star shards as they appear. The camera holds one view of
// the whole island so arrows always mean the same way on screen.

import * as THREE from 'three';
import { api } from '../../../net/api';
import { CINDER, METEOR_WARN, STORM_SECONDS, STORM_SHIELDS, novaFor, starsFor, stormSchedule, THRESHOLDS, type Meteor, type Shard } from '../../../shared/galaxy-rules';
import type { CameraShot, PlayerState } from '../../../world/space';
import { gsfx, STORM_SONG } from '../audio';
import { shortRound, type Galaxy } from '../index';
import * as S from '../shaders';
import type { Round } from './round';

type State = 'intro' | 'countdown' | 'run' | 'done';

interface LiveMeteor {
  m: Meteor;
  x: number;
  z: number;
  armed: boolean;
  landed: boolean;
}

interface LiveShard {
  s: Shard;
  x: number;
  z: number;
  taken: boolean;
}

const MAX_WARN = 16;

export class Storm implements Round {
  readonly id = 'storm' as const;
  readonly boarded = true;
  private state: State = 'intro';
  private t = 0;
  private seconds = shortRound(STORM_SECONDS);
  private sched = stormSchedule();
  private meteors: LiveMeteor[] = [];
  private nextMeteor = 0;
  private shards: LiveShard[] = [];
  private nextShard = 0;
  private score = 0;
  private shields = STORM_SHIELDS;
  private hitCooldown = 0;
  private warnMesh: THREE.InstancedMesh;
  private warnProg: Float32Array;
  private rocks: THREE.InstancedMesh;
  private beams: THREE.InstancedMesh;
  private shardMesh: THREE.InstancedMesh;
  private group = new THREE.Group();
  private m4 = new THREE.Matrix4();
  private start: { x: number; y: number; z: number; yaw: number };
  private shotPos = new THREE.Vector3();
  private shotTarget = new THREE.Vector3();
  private hitsTaken = 0;

  constructor(private g: Galaxy) {
    const sp = g.cinder.startSpot;
    this.start = { x: sp.x + 1.5, y: CINDER.top, z: sp.z, yaw: Math.PI / 2 };
    g.cinder.reset();
    g.ctx.teleport(this.start.x, this.start.z, this.start.yaw, CINDER.top);
    // Warnings: one draw call, progress per instance.
    const wg = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.warnProg = new Float32Array(MAX_WARN);
    wg.setAttribute('aProg', new THREE.InstancedBufferAttribute(this.warnProg, 1).setUsage(THREE.DynamicDrawUsage));
    this.warnMesh = new THREE.InstancedMesh(wg, new THREE.ShaderMaterial({ vertexShader: S.WARN_VERT, fragmentShader: S.WARN_FRAG, uniforms: { ...g.uniforms }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }), MAX_WARN);
    this.warnMesh.count = 0;
    this.warnMesh.frustumCulled = false;
    this.warnMesh.renderOrder = 4;
    const rockGeo = new THREE.IcosahedronGeometry(0.9, 0);
    this.rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: '#3a2c36', emissive: new THREE.Color('#ff6a2a'), emissiveIntensity: 1.1, flatShading: true }), MAX_WARN);
    this.rocks.count = 0;
    this.rocks.frustumCulled = false;
    this.beams = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.9, 40, 12, 1, true).translate(0, 20, 0), new THREE.ShaderMaterial({ vertexShader: S.BEAM_VERT, fragmentShader: S.BEAM_FRAG, uniforms: { ...g.uniforms, uColor: { value: new THREE.Color('#e8574a') }, uAlpha: { value: 0.5 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), MAX_WARN);
    this.beams.count = 0;
    this.beams.frustumCulled = false;
    this.beams.renderOrder = 5;
    this.shardMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: '#f4b740', emissive: new THREE.Color('#f4b740'), emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.3, flatShading: true }), 12);
    this.shardMesh.count = 0;
    this.shardMesh.frustumCulled = false;
    this.group.add(this.warnMesh, this.rocks, this.beams, this.shardMesh);
    g.scene.add(this.group);
    void g.hud
      .intro({
        key: 'galaxy-storm',
        title: 'Rock rain',
        tagline: 'Grab the star shards. Dodge the meteors.',
        tips: [
          { keys: ['move'], text: 'Step out of the red rings before the rock lands' },
          { keys: ['move'], text: 'Walk over gold shards to grab them' },
          { keys: ['move'], text: 'Cracked tiles fall when hit again' },
        ],
      })
      .then(() => this.countdown());
  }

  private countdown(): void {
    if (this.g.round !== this) return;
    this.state = 'countdown';
    this.g.hud.strip([
      { id: 'shards', label: 'Shards', value: '0' },
      { id: 'time', label: 'Time', value: String(this.seconds) },
      { id: 'shields', label: 'Shields', value: '●●●' },
    ]);
    void this.g.hud.countdown(3).then(() => {
      if (this.g.round !== this) return;
      this.state = 'run';
      this.t = 0;
      this.g.playSong(STORM_SONG);
    });
  }

  holdsTime(): boolean {
    return this.state === 'countdown' || this.state === 'run';
  }

  /** The whole island in one view, from behind the start pad. */
  shot(): CameraShot | null {
    if (this.state === 'done') return null;
    const portrait = innerWidth < innerHeight;
    const back = portrait ? 21 : 15;
    const up = portrait ? 19 : 13.5;
    const p = this.g.player;
    // Lean a little toward you so the frame feels alive.
    const tx = CINDER.x + (p.x - CINDER.x) * 0.25 + 1;
    const tz = CINDER.z + (p.z - CINDER.z) * 0.25;
    this.shotPos.set(CINDER.x - back + (p.x - CINDER.x) * 0.15, CINDER.top + up, CINDER.z + (p.z - CINDER.z) * 0.15);
    this.shotTarget.set(tx, CINDER.top - (portrait ? 1 : 0), tz);
    return { position: this.shotPos, target: this.shotTarget, fov: portrait ? 64 : 52, blend: 1 };
  }

  private scale(t: number): number {
    return t;
  }

  step(dt: number, p: PlayerState): void {
    if (this.state !== 'run') return;
    this.t += dt;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    const now = this.scale(this.t);
    // Warnings start 1.5 s before each impact.
    while (this.nextMeteor < this.sched.meteors.length && this.sched.meteors[this.nextMeteor].t - METEOR_WARN <= now) {
      const m = this.sched.meteors[this.nextMeteor++];
      let x = CINDER.x + m.dx;
      let z = CINDER.z + m.dz;
      if (m.aim) {
        // Aimed rocks fall where you stand when the warning starts (inside the island, off the spire).
        const dx = p.x - CINDER.x;
        const dz = p.z - CINDER.z;
        const d = Math.hypot(dx, dz);
        const r = Math.max(2.6, Math.min(CINDER.r - 1.2, d));
        x = CINDER.x + (d > 0.01 ? (dx / d) * r : r);
        z = CINDER.z + (d > 0.01 ? (dz / d) * r : 0);
      }
      this.meteors.push({ m, x, z, armed: true, landed: false });
      gsfx.meteor(METEOR_WARN);
    }
    for (const lm of this.meteors) {
      if (lm.landed || now < lm.m.t) continue;
      lm.landed = true;
      this.impact(lm, p);
    }
    this.meteors = this.meteors.filter((m) => !m.landed || now < m.m.t + 0.4);
    // Shards appear in sequence; each lasts four seconds.
    while (this.nextShard < this.sched.shards.length && this.sched.shards[this.nextShard].t <= now) {
      const s = this.sched.shards[this.nextShard++];
      let x = CINDER.x + s.dx;
      let z = CINDER.z + s.dz;
      // Never on a hole: move to the nearest whole tile.
      const ti = this.g.cinder.tileAt(x, z);
      if (ti >= 0 && this.g.cinder.tileState[ti].state !== 'whole' && this.g.cinder.tileState[ti].state !== 'cracked') {
        let best = -1;
        let bd = Infinity;
        this.g.cinder.tiles.forEach((t, i) => {
          const st = this.g.cinder.tileState[i].state;
          if (st === 'gone' || st === 'returning') return;
          const d = Math.hypot(CINDER.x + t.x - x, CINDER.z + t.z - z);
          if (d < bd) {
            bd = d;
            best = i;
          }
        });
        if (best >= 0) {
          x = CINDER.x + this.g.cinder.tiles[best].x;
          z = CINDER.z + this.g.cinder.tiles[best].z;
        }
      }
      this.shards.push({ s, x, z, taken: false });
      this.g.shock.emit({ x, y: CINDER.top + 0.05, z }, { color: 0xf4b740, radius: s.big ? 2.2 : 1.4, life: 0.5 });
    }
    for (const sh of this.shards) {
      if (sh.taken) continue;
      if (Math.hypot(p.x - sh.x, p.z - sh.z) < (sh.s.big ? 1.15 : 0.95) && Math.abs(p.y - CINDER.top) < 1.4) {
        sh.taken = true;
        const pts = sh.s.big ? 3 : 1;
        this.score += pts;
        gsfx.shard(sh.s.big);
        this.g.hud.set('shards', String(this.score), { tone: 'good' });
        this.g.hud.pop(`+${pts}`, { x: sh.x, y: CINDER.top + 1.2, z: sh.z }, { color: '#f4b740', size: sh.s.big ? 2 : 1.4 });
        this.g.glows.burst({ at: { x: sh.x, y: CINDER.top + 0.6, z: sh.z }, count: sh.s.big ? 50 : 22, shape: 'up', speed: [2, 6], color: [0xf4b740, 0xfff3c4], size: [0.15, 0.35], life: [0.4, 0.9], gravity: -1 });
        if (sh.s.big) this.g.hud.judge('Big shard!', '#f4b740');
      }
    }
    this.shards = this.shards.filter((s) => !s.taken && now < s.s.t + 4);
    const left = Math.max(0, this.seconds - this.t);
    this.g.hud.set('time', String(Math.ceil(left)), { bump: false, tone: left < 10 ? 'hot' : null });
    this.g.hud.bar('time', left / this.seconds, '#ff8a3d');
    if (left <= 0 || this.shields <= 0) void this.finish();
  }

  private impact(lm: LiveMeteor, p: PlayerState): void {
    const g = this.g;
    const at = { x: lm.x, y: CINDER.top + 0.1, z: lm.z };
    const d = Math.hypot(p.x - lm.x, p.z - lm.z);
    const near = Math.max(0, 1 - d / 14);
    gsfx.crunch(near);
    g.ctx.shake(0.12 + near * 0.35);
    g.shock.emit(at, { color: 0xff8a3d, radius: lm.m.r * 2.2, life: 0.5 });
    g.sparks.burst({ at, count: 40, shape: 'up', speed: [4, 10], color: [0xff8a3d, 0xffd27a], size: [0.15, 0.3], life: [0.4, 0.9], gravity: 8 });
    g.dust.burst({ at, count: 18, shape: 'ring', speed: [2, 5], color: 0x4a3a48, size: [0.6, 1.2], life: [0.5, 1], alpha: 0.6, drag: 1.5 });
    const fell = g.cinder.impact(lm.x, lm.z, lm.m.r);
    if (fell.length) gsfx.tileDrop();
    // Hit: knocked over and a shield gone (once per meteor, with a short grace).
    if (d < lm.m.r + 0.3 && Math.abs(p.y - CINDER.top) < 2.2 && this.hitCooldown <= 0 && !g.trav.busy) {
      this.hitCooldown = 1;
      this.loseShield('hit');
      const dx = d > 0.01 ? (p.x - lm.x) / d : 1;
      const dz = d > 0.01 ? (p.z - lm.z) / d : 0;
      let tx = p.x + dx * 3;
      let tz = p.z + dz * 3;
      const r = Math.hypot(tx - CINDER.x, tz - CINDER.z);
      if (r > CINDER.r - 1) {
        tx = CINDER.x + ((tx - CINDER.x) / r) * (CINDER.r - 1);
        tz = CINDER.z + ((tz - CINDER.z) / r) * (CINDER.r - 1);
      }
      g.trav.start({ kind: 'tumble', type: 'arc', t: 0, arc: { from: { x: p.x, y: p.y, z: p.z }, to: { x: tx, y: CINDER.top, z: tz }, apex: 1.4, duration: 0.6 }, eased: false, pose: 'tumble', yaw: p.yaw });
    }
  }

  private loseShield(why: 'hit' | 'fall'): void {
    const g = this.g;
    this.shields = Math.max(0, this.shields - 1);
    this.hitsTaken++;
    gsfx.hit();
    g.hud.flash('#e8574a', 300, 0.35);
    g.ctx.shake(0.4);
    g.hud.set('shields', '●'.repeat(this.shields) + '○'.repeat(STORM_SHIELDS - this.shields), { tone: 'bad' });
    g.hud.judge(why === 'hit' ? 'Ouch! -1 shield' : 'Fell! -1 shield', '#e8574a');
    g.sparks.burst({ at: { x: g.player.x, y: g.player.y + 1, z: g.player.z }, count: 40, speed: [3, 7], color: [0xbfe8ff, 0x6cc4ff], size: [0.1, 0.25], life: [0.3, 0.6] });
  }

  fell(): void {
    if (this.state === 'run') this.loseShield('fall');
  }

  checkpoint(): { x: number; y: number; z: number; yaw: number } | null {
    return this.start;
  }

  private async finish(): Promise<void> {
    if (this.state === 'done') return;
    this.state = 'done';
    const g = this.g;
    g.hud.bar('time', null);
    this.meteors = [];
    this.shards = [];
    const score = this.score;
    const stars = starsFor('storm', score);
    const prevBest = g.save.data.best.storm;
    const isBest = prevBest === null || score > prevBest;
    if (isBest) g.save.update((d) => (d.best.storm = score));
    g.hud.banner(this.shields > 0 ? 'Storm over!' : 'Out of shields', { color: '#ff8a3d', size: 'l' });
    g.ctx.pose(this.shields > 0 ? 'cheer' : null);
    const r = await api.score(g.ctx.roomId, g.ctx.area.id, g.ctx.browserId, g.ctx.name(), 'storm', score);
    if (r.ok) await g.loadBoards();
    else g.paintBoards();
    if (g.round !== this) return;
    const badges: string[] = [];
    if (isBest && score > 0) badges.push('New best!');
    if (this.hitsTaken === 0) badges.push('Untouched');
    if (g.save.data.bloomed && novaFor('storm', score)) badges.push('Nova!');
    if (!r.ok) badges.push('Not saved to the board');
    const next = THRESHOLDS.storm.stars[stars];
    const choice = await g.hud.results({
      title: stars === 3 ? 'Storm chaser' : 'Rock rain',
      subtitle: `${score} shards, ${this.shields} ${this.shields === 1 ? 'shield' : 'shields'} left`,
      stars,
      badges,
      rows: [
        { label: 'Shards', value: String(score), best: isBest },
        { label: 'Your best', value: String(Math.max(score, prevBest ?? 0)) },
        { label: 'Next star', value: next === undefined ? 'All three!' : `${next} shards` },
      ],
      board: { title: 'Most shards here', rows: g.boards.storm.slice(0, 5).map((x) => ({ name: x.name, value: String(x.value), you: x.you })) },
      buttons: [
        { id: 'again', label: 'Play again', primary: true },
        { id: 'home', label: 'Fly home' },
        { id: 'stay', label: 'Stay here' },
      ],
    });
    g.ctx.pose(null);
    const fresh = g.award('storm', stars);
    g.endRound();
    g.cinder.reset();
    await g.feedStars(fresh, new THREE.Vector3(g.player.x, CINDER.top + 2, g.player.z), 'storm');
    g.paintBoards();
    if (choice === 'again') g.startRound(new Storm(g));
    else if (choice === 'home') g.fly('hub', 'storm');
  }

  update(dt: number, time: number): void {
    void dt;
    const now = this.scale(this.t);
    let i = 0;
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (const lm of this.meteors) {
      if (i >= MAX_WARN) break;
      const prog = Math.min(1, Math.max(0, 1 - (lm.m.t - now) / METEOR_WARN));
      const r = lm.m.r;
      if (!lm.landed) {
        this.m4.makeScale(r, 1, r);
        this.m4.setPosition(lm.x, CINDER.top + 0.04, lm.z);
        this.warnMesh.setMatrixAt(i, this.m4);
        this.warnProg[i] = prog;
        // The rock falls along its beam, faster at the end.
        v.set(lm.x, CINDER.top + 0.6 + (1 - prog * prog) * 34, lm.z);
        q.setFromEuler(new THREE.Euler(time * 3 + i, time * 2, 0));
        sc.setScalar(0.6 + prog * 0.5);
        this.m4.compose(v, q, sc);
        this.rocks.setMatrixAt(i, this.m4);
        this.m4.makeScale(0.6 + prog, 1, 0.6 + prog);
        this.m4.setPosition(lm.x, CINDER.top, lm.z);
        this.beams.setMatrixAt(i, this.m4);
      } else {
        this.m4.makeScale(0, 0, 0);
        this.warnMesh.setMatrixAt(i, this.m4);
        this.rocks.setMatrixAt(i, this.m4);
        this.beams.setMatrixAt(i, this.m4);
        this.warnProg[i] = 0;
      }
      i++;
    }
    this.warnMesh.count = this.rocks.count = this.beams.count = i;
    this.warnMesh.instanceMatrix.needsUpdate = true;
    this.rocks.instanceMatrix.needsUpdate = true;
    this.beams.instanceMatrix.needsUpdate = true;
    (this.warnMesh.geometry.getAttribute('aProg') as THREE.BufferAttribute).needsUpdate = true;
    let k = 0;
    for (const sh of this.shards) {
      if (k >= 12) break;
      const age = now - sh.s.t;
      const blink = age > 3 ? (Math.sin(age * 30) > 0 ? 1 : 0.2) : 1;
      const appear = Math.min(1, age * 4);
      v.set(sh.x, CINDER.top + 0.7 + Math.sin(time * 3 + k) * 0.12, sh.z);
      q.setFromEuler(new THREE.Euler(0, time * 2.5 + k, 0));
      sc.setScalar((sh.s.big ? 1.6 : 1) * appear * blink);
      this.m4.compose(v, q, sc);
      this.shardMesh.setMatrixAt(k++, this.m4);
    }
    this.shardMesh.count = k;
    this.shardMesh.instanceMatrix.needsUpdate = true;
  }

  guide(): { at: THREE.Vector3; label: string } | null {
    if (this.state !== 'run') return null;
    // Point at the nearest shard.
    const p = this.g.playerPos;
    let best: LiveShard | null = null;
    let bd = Infinity;
    for (const s of this.shards) {
      const d = Math.hypot(s.x - p.x, s.z - p.z) - (s.s.big ? 4 : 0);
      if (!s.taken && d < bd) {
        bd = d;
        best = s;
      }
    }
    return best ? { at: new THREE.Vector3(best.x, CINDER.top + 0.3, best.z), label: '' } : null;
  }

  dispose(): void {
    this.g.hud.bar('time', null);
    this.g.scene.remove(this.group);
    for (const m of [this.warnMesh, this.rocks, this.beams, this.shardMesh]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }

  debug() {
    return { state: this.state, t: this.t, score: this.score, shields: this.shields, meteors: this.meteors.length, shards: this.shards.map((s) => ({ x: s.x, z: s.z, big: s.s.big })) };
  }
}
