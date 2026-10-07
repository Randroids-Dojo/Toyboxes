// Laser tag in Comet Yard: you and the cyan bots against the magenta crew.
// OK fires at the locked target (a bracket shows exactly what it will hit);
// shots on the beat run cool and score more; mirrors bank shots; a close
// enemy bolt turns OK into a blade deflect. Moving is camera relative, and
// the lock-on camera frames you and your target so arrows alone can strafe.

import * as THREE from 'three';
import { music } from '../../audio/music';
import { ARENA, BASES, bankLine, circleHitsPiece, clearLine, inArena, LAYOUT_NAMES, spawnPoints, type LayoutId } from '../../shared/neon/arena';
import { BEAT_WINDOW, DEFLECT_WARN, pickLock, scoreTag, TAG_DIFF_NAMES, type TagDiff, type TagLog, type TagScore } from '../../shared/neon/tag';
import { box, circle, type Collider } from '../../world/physics';
import type { CameraShot, CaptureLabels, PlayerState, SpaceAction } from '../../world/space';
import type { ArenaView } from './arena-view';
import { Robot, tagBot } from './robots';
import { nova as snd } from './sounds';
import { blaster, prismBlade } from './style';
import { TagSim, type Agent, type TagConfig, type TagEvent } from './tag-sim';
import { C, HEX, haloTexture, smooth } from './util';
import type { Mode, Nova } from './world';

export interface TagOpts {
  diff: TagDiff;
  size: 2 | 3 | 4;
  layout: LayoutId;
  duration: number;
  captain: boolean;
  echo: boolean;
  /** Run the first-time practice target before the match. */
  practice: boolean;
  seed: number;
  onDone: (o: TagOutcome) => void;
}

export interface TagOutcome {
  score: TagScore | null;
  log: TagLog;
  won: boolean;
  quit: boolean;
  us: number;
  them: number;
}

interface BotView {
  agent: Agent;
  robot: Robot;
  gun: THREE.Object3D;
  stagger: number;
  dissolve: number;
  tele: number;
  aimLine: THREE.Line | null;
  shield: THREE.Mesh | null;
  mark: number;
}

const DT = 1 / 60;
const TEAM_HEX = { cyan: C.cyan, magenta: C.pink };

export class TagMode implements Mode {
  readonly kind = 'tag';
  sim: TagSim;
  private practiceSim: TagSim | null = null;
  private phase: 'intro' | 'practice' | 'count' | 'play' | 'end' | 'done' = 'intro';
  private t = 0;
  private acc = 0;
  private bots: BotView[] = [];
  private boltMesh: THREE.InstancedMesh;
  private boltGlow: THREE.InstancedMesh;
  private lock: { id: number; bank: boolean } | null = null;
  private bankLineObj: THREE.Line;
  private deflectRing: THREE.Mesh;
  private canDeflect = false;
  private blaster: THREE.Object3D;
  private blade: THREE.Object3D;
  private swingT = 0;
  private reticle: HTMLElement;
  private pipsEl: HTMLElement;
  private heatEl: HTMLElement;
  private powerEl: HTMLElement;
  private radar: HTMLCanvasElement;
  private edges: HTMLElement[] = [];
  private vignette: HTMLElement;
  private outEl: HTMLElement;
  private teles: { bot: number; until: number }[] = [];
  private countBeat = -1;
  private lastBeat = -1;
  private camPos = new THREE.Vector3();
  private camTarget = new THREE.Vector3();
  private lockBlend = 0;
  private practiceTags = 0;
  private endT = 0;
  private dummy = new THREE.Object3D();
  private radarTick = 0;
  private lastScore = { cyan: -1, magenta: -1, time: '' };
  private announcedSudden = false;
  private beatFlash = 0;
  private pendingSwing: { until: number; stamp: number } | null = null;
  private reflects = 0;
  private clickStart: { x: number; y: number; t: number } | null = null;
  private onDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button === 0) this.clickStart = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };
  private onUp = (e: PointerEvent) => {
    const c = this.clickStart;
    this.clickStart = null;
    if (!c || e.pointerType !== 'mouse' || this.nova.ctx.ui.isOpen) return;
    if (Math.hypot(e.clientX - c.x, e.clientY - c.y) < 8 && e.timeStamp - c.t < 260) this.fire(c.t);
  };

  constructor(
    private nova: Nova,
    private arena: ArenaView,
    private opts: TagOpts,
  ) {
    const cfg: TagConfig = { layout: opts.layout, size: opts.size, diff: opts.diff, captain: opts.captain, seed: opts.seed, duration: opts.duration, echo: opts.echo, bpm: 124 };
    this.sim = new TagSim(cfg);
    if (opts.practice) this.practiceSim = new TagSim({ ...cfg, practice: true });
    arena.setLayout(opts.layout);
    const scene = nova.scene;

    // Bolts: a bright core and a soft glow, instanced.
    const core = new THREE.CapsuleGeometry(0.05, 0.75, 2, 6);
    core.rotateX(Math.PI / 2);
    this.boltMesh = new THREE.InstancedMesh(core, new THREE.MeshBasicMaterial({ color: 0xffffff }), 64);
    const glow = new THREE.CapsuleGeometry(0.16, 0.9, 2, 6);
    glow.rotateX(Math.PI / 2);
    this.boltGlow = new THREE.InstancedMesh(glow, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }), 64);
    for (const m of [this.boltMesh, this.boltGlow]) {
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
    const lineMat = new THREE.LineDashedMaterial({ color: new THREE.Color(C.gold).multiplyScalar(1.6), dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.85 });
    this.bankLineObj = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), lineMat);
    this.bankLineObj.visible = false;
    this.bankLineObj.frustumCulled = false;
    scene.add(this.bankLineObj);
    this.deflectRing = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.white).multiplyScalar(2), transparent: true, opacity: 0.9 }));
    this.deflectRing.rotation.x = Math.PI / 2;
    this.deflectRing.visible = false;
    scene.add(this.deflectRing);

    // Player props.
    this.blaster = blaster(C.cyan);
    this.blade = prismBlade(nova.bladeColor(), 0.9);
    this.blade.rotation.x = Math.PI;
    nova.ctx.hold(this.blaster);

    // HUD.
    this.reticle = el('div', 'nova-reticle', el('i'), el('i'), el('i'), el('i'), el('b'));
    this.heatEl = el('div', 'heat', el('b'));
    this.powerEl = el('span', 'power');
    this.pipsEl = el('div', 'nova-pips', el('i'), el('i'), el('i'), this.heatEl, this.powerEl);
    this.radar = document.createElement('canvas');
    this.radar.width = this.radar.height = 192;
    const radarWrap = el('div', 'nova-radar');
    radarWrap.appendChild(this.radar);
    this.vignette = el('div', 'nova-vignette');
    this.outEl = el('div', 'nova-out');
    for (let i = 0; i < 3; i++) this.edges.push(el('div', 'nova-edge'));
    for (const e of this.edges) e.style.display = 'none';
    nova.layer.append(this.vignette, this.outEl, this.reticle, this.pipsEl, radarWrap, ...this.edges);
    nova.hud.strip([
      { id: 'cyan', label: 'Cyan', value: '0' },
      { id: 'time', label: 'Time', value: fmt(opts.duration), wide: true },
      { id: 'magenta', label: 'Magenta', value: '0' },
    ]);

    // Arrive on our base, facing the yard.
    const spawn = spawnPoints('cyan')[1];
    nova.ctx.teleport(spawn.x, spawn.z, spawn.yaw);
    nova.doorsShut = true;
    nova.playSong('comet', { loop: true, fadeIn: 0.5 });
    nova.hud.title('Laser tag', `${opts.size} vs ${opts.size} · ${TAG_DIFF_NAMES[opts.diff]} · ${LAYOUT_NAMES[opts.layout]}`, 2600);
    this.buildBots(this.practiceSim ?? this.sim);
    addEventListener('pointerdown', this.onDown, true);
    addEventListener('pointerup', this.onUp, true);
  }

  private buildBots(sim: TagSim): void {
    for (const b of this.bots) this.removeBot(b);
    this.bots = [];
    for (const a of sim.agents) {
      if (a.player) continue;
      const robot = tagBot(a.team, a.role === 'captain');
      robot.root.scale.multiplyScalar(0.86);
      const gun = blaster(TEAM_HEX[a.team]);
      robot.handR.add(gun);
      robot.root.position.set(a.x, 0, a.z);
      this.nova.scene.add(robot.root);
      let shield: THREE.Mesh | null = null;
      if (a.role === 'captain') {
        shield = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.8, 24, 1, true, -Math.PI / 3, (Math.PI * 2) / 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.pink).multiplyScalar(1.2), transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        shield.position.y = 1.0;
        robot.root.add(shield);
      }
      this.bots.push({ agent: a, robot, gun, stagger: 0, dissolve: 0, tele: 0, aimLine: null, shield, mark: 0 });
    }
  }

  private removeBot(b: BotView): void {
    this.nova.scene.remove(b.robot.root);
    b.robot.dispose();
    if (b.aimLine) this.nova.scene.remove(b.aimLine);
  }

  private get live(): TagSim {
    return this.phase === 'practice' && this.practiceSim ? this.practiceSim : this.sim;
  }

  capture(): CaptureLabels | null {
    if (this.phase === 'play' && this.sim.player.outT > 0) return { action: null, kick: null, jump: null };
    if (this.phase === 'end' || this.phase === 'count') return { action: null, kick: null, jump: null };
    return null;
  }

  holds(): boolean {
    return this.phase === 'play' || this.phase === 'count' || this.phase === 'practice';
  }

  colliders(): Collider[] {
    const out: Collider[] = [box(0, ARENA.z1 - 0.6, 3.6, 0.3, 0, 3, 0.5, false)];
    for (const b of this.bots) if (b.agent.outT <= 0) out.push(circle(b.agent.x, b.agent.z, b.agent.r, 1.5, 0.3, false));
    return out;
  }

  actions(p: PlayerState): SpaceAction[] {
    if (this.phase !== 'play' && this.phase !== 'practice') return [];
    if (this.live.player.outT > 0) return [];
    return [{ x: p.x, z: p.z, range: 6, label: this.canDeflect ? 'Deflect!' : 'Tag', short: this.canDeflect ? 'Deflect' : 'Tag', run: () => this.fire(this.nova.ctx.input.pressedAt('interact') ?? performance.now()) }];
  }

  kick(): { label: string; run: () => void } | null {
    if (this.phase !== 'play' && this.phase !== 'practice') return null;
    return { label: 'Blade', run: () => this.swing(this.nova.ctx.input.pressedAt('kick') ?? performance.now()) };
  }

  private onBeat(stamp: number): boolean {
    return Math.abs(this.nova.clock.beatError(stamp)) <= BEAT_WINDOW;
  }

  /** OK: deflect when a bolt is close, else fire at the lock. */
  private fire(stamp: number): void {
    const sim = this.live;
    if (sim.player.outT > 0 || (this.phase !== 'play' && this.phase !== 'practice')) return;
    if (this.canDeflect) {
      // Pressed on the warning: the blade swings when the bolt is in reach.
      if (sim.deflectable()) this.swing(stamp);
      else this.pendingSwing = { until: performance.now() + 700, stamp };
      return;
    }
    const beat = this.onBeat(stamp);
    let bank: { x: number; z: number } | null = null;
    if (this.lock?.bank) {
      const t = sim.agents[this.lock.id];
      const p = sim.player;
      const bl = bankLine(p.x, p.z, t.x, t.z, sim.pieces);
      if (bl) bank = { x: bl.px, z: bl.pz };
    }
    const bolt = sim.playerFire(beat, this.lock?.id ?? null, bank);
    if (!bolt) {
      if (sim.overheated > 0) snd.overheat();
      return;
    }
    snd.pew(beat);
    this.nova.ctx.swing();
    if (beat) {
      this.beatFlash = 0.25;
      this.nova.fx.rings.emit({ x: sim.player.x, y: 1.1, z: sim.player.z }, { color: C.lime, radius: 1.4, life: 0.35 });
      this.nova.hint('hint-beatshot', 'Shots on the beat stay cool');
    }
    const p = sim.player;
    this.nova.fx.sparks.burst({ at: { x: p.x + Math.sin(p.yaw) * 0.6, y: 1.15, z: p.z + Math.cos(p.yaw) * 0.6 }, count: beat ? 14 : 8, speed: [1.5, 4], color: beat ? [C.lime, C.white] : [C.cyan, C.white], life: [0.12, 0.25], size: [0.05, 0.1], shape: 'cone', dir: { x: Math.sin(p.yaw), y: 0, z: Math.cos(p.yaw) }, spread: 0.5 });
  }

  private swing(stamp: number): void {
    const sim = this.live;
    if (sim.player.outT > 0) return;
    this.swingT = 0.32;
    this.nova.ctx.hold(this.blade);
    this.nova.ctx.swing();
    const b = sim.playerSwing(this.onBeat(stamp));
    if (b) {
      snd.reflect();
      this.nova.hud.flash('#ffffff', 140, 0.22);
      this.nova.ctx.shake(0.15);
      this.nova.fx.sparks.burst({ at: { x: b.x, y: 1.1, z: b.z }, count: 26, speed: [2, 6], color: [C.white, C.cyan], life: [0.2, 0.45], size: [0.06, 0.14] });
    } else snd.whiff();
  }

  step(h: number, p: PlayerState): void {
    const n = this.nova;
    n.hud.update(h);
    if (this.phase !== 'play' && this.phase !== 'practice') return;
    const sim = this.live;
    this.acc += h;
    while (this.acc >= DT - 1e-9) {
      this.acc -= DT;
      sim.beat = n.clock.beatAt();
      if (sim.player.outT <= 0) sim.setPlayer(p.x, p.z, p.y, p.yaw, p.vx, p.vz);
      if (this.pendingSwing) {
        if (performance.now() > this.pendingSwing.until) this.pendingSwing = null;
        else if (sim.deflectable()) {
          const st = this.pendingSwing.stamp;
          this.pendingSwing = null;
          this.swing(st);
        }
      }
      sim.step(DT);
      for (const e of sim.take()) this.event(e);
    }
    if (this.phase === 'practice' && this.practiceTags >= 2) this.startCount();
    if (this.phase === 'play' && sim.over) this.end();
  }

  private event(e: TagEvent): void {
    const n = this.nova;
    const sim = this.live;
    const bot = (id: number) => this.bots.find((b) => b.agent.id === id);
    switch (e.k) {
      case 'fire':
        if (e.a !== 0) {
          const b = bot(e.a);
          if (b) {
            b.robot.armR.rotation.x = -1.9;
            if (b.agent.team !== 'cyan' && Math.hypot(b.agent.x - sim.player.x, b.agent.z - sim.player.z) < 16) snd.enemyPew();
          }
        }
        break;
      case 'telegraph': {
        const b = bot(e.a);
        if (b) {
          b.tele = sim.knobs.tele;
          b.robot.setFace('focused');
          if (e.target === 0) {
            this.teles.push({ bot: e.a, until: performance.now() + sim.knobs.tele * 1000 + 150 });
            snd.charge();
            if (this.opts.diff === 'easy') this.aimLine(b, e.target);
          }
        }
        break;
      }
      case 'hit': {
        const v = sim.agents[e.a];
        if (v.player) {
          snd.hurt();
          n.ctx.shake(0.22);
          this.vignette.classList.add('on');
          setTimeout(() => this.vignette.classList.remove('on'), 140);
          n.fx.sparks.burst({ at: { x: v.x, y: 1.2, z: v.z }, count: 16, speed: [2, 5], color: [C.pink, C.white], life: [0.2, 0.4], size: [0.06, 0.12] });
          n.hint('hint-cover', 'Move! Bolts can be dodged');
        } else {
          const b = bot(e.a);
          if (b) {
            b.stagger = 0.25;
            b.robot.setFace('surprised');
          }
          n.fx.sparks.burst({ at: { x: v.x, y: 1.1, z: v.z }, count: 14, speed: [2, 5], color: [TEAM_HEX[v.team], C.white], life: [0.2, 0.4], size: [0.05, 0.12] });
          if (e.by === 0) snd.tag();
        }
        break;
      }
      case 'block': {
        const v = sim.agents[e.a];
        n.fx.glow.burst({ at: { x: v.x, y: 1.1, z: v.z }, count: 10, shape: 'ring', speed: [1, 2.5], color: C.white, life: [0.2, 0.35], size: [0.15, 0.3] });
        break;
      }
      case 'tag': {
        const v = sim.agents[e.a];
        const at = { x: v.x, y: 2.0, z: v.z };
        if (e.by === 0) {
          if (this.phase === 'practice') {
            this.practiceTags++;
            n.hud.pop(this.practiceTags >= 2 ? 'Ready!' : 'Tagged!', at, { color: HEX.lime, size: 1.6 });
            snd.tag();
            break;
          }
          const pts = 100 + (e.kind === 'bank' ? 100 : 0) + (e.kind === 'reflect' ? 150 : 0) + (e.beat ? 50 : 0);
          const label = e.kind === 'bank' ? `Bank shot! +${pts}` : e.kind === 'reflect' ? `Reflect! +${pts}` : `+${pts}`;
          n.hud.pop(label, at, { color: e.kind === 'bank' ? HEX.gold : e.kind === 'reflect' ? HEX.white : e.beat ? HEX.lime : HEX.cyan, size: e.kind === 'shot' ? 1.4 : 1.7 });
          if (e.kind === 'bank') snd.bank();
          n.core.burst(0.4);
        } else if (e.assist) n.hud.pop('Assist +25', at, { color: HEX.cyan, size: 1.1 });
        if (v.player) {
          n.hud.banner('Tagged!', { sub: 'Glowing back in 3', color: HEX.pink, size: 'm', ms: 1600 });
          this.outEl.classList.add('on');
          n.outfit.setGlow(0.05);
          snd.out();
        } else {
          const b = bot(e.a);
          if (b) {
            b.dissolve = 0.0001;
            b.robot.setGlow(0);
            b.robot.setFace('dizzy');
          }
          snd.out();
        }
        break;
      }
      case 'respawn': {
        const a = sim.agents[e.a];
        if (a.player) {
          const s = spawnPoints('cyan')[1];
          n.ctx.teleport(s.x, s.z, s.yaw);
          this.outEl.classList.remove('on');
          n.outfit.setGlow(1.6);
          n.fx.rings.emit({ x: s.x, y: 0.05, z: s.z }, { color: C.cyan, radius: 2.5, life: 0.6 });
          snd.warp();
        } else {
          const b = bot(e.a);
          if (b) {
            b.dissolve = 0;
            b.robot.root.scale.setScalar(a.role === 'captain' ? 1.25 * 0.86 : 0.86);
            b.robot.setGlow(1);
            b.robot.setFace('happy');
            n.fx.rings.emit({ x: a.x, y: 0.05, z: a.z }, { color: TEAM_HEX[a.team], radius: 2, life: 0.5 });
          }
        }
        break;
      }
      case 'bounce':
        snd.bounce();
        n.fx.glow.burst({ at: { x: e.x, y: 1.1, z: e.z }, count: 10, shape: 'ring', speed: [1, 3], color: C.lilac, life: [0.2, 0.4], size: [0.2, 0.35] });
        break;
      case 'spark':
        n.fx.sparks.burst({ at: { x: e.x, y: 1.1, z: e.z }, count: 8, speed: [1, 3.5], color: [TEAM_HEX[e.team], C.white], life: [0.15, 0.3], size: [0.04, 0.09], gravity: 6 });
        break;
      case 'spawnPower':
        this.arena.showPower(e.pad, e.power);
        break;
      case 'pickup': {
        const pad = this.arena;
        for (let i = 0; i < 2; i++) if (!this.live.powers[i]) pad.showPower(i, null);
        if (e.a === 0) {
          snd.pickup();
          n.hud.banner(e.power === 'shield' ? 'Prism shield' : e.power === 'overdrive' ? 'Overdrive!' : 'Echo bolts', { sub: e.power === 'shield' ? 'Blocks three bolts' : e.power === 'overdrive' ? 'No heat for 8 seconds' : 'Bolts bounce twice', color: HEX.gold, size: 'm', ms: 1400 });
        }
        break;
      }
      case 'overheat':
        snd.overheat();
        n.hud.judge('Overheated!', HEX.orange);
        n.hint('hint-heat', 'Fire on the beat to stay cool');
        break;
      case 'mark': {
        const b = bot(e.target);
        if (b) b.mark = 1.5;
        break;
      }
      case 'reflect':
        this.reflects++;
        break;
    }
  }

  private aimLine(b: BotView, target: number): void {
    const t = this.live.agents[target];
    if (b.aimLine) this.nova.scene.remove(b.aimLine);
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(b.agent.x, 1.1, b.agent.z), new THREE.Vector3(t.x, 1.1, t.z)]);
    b.aimLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: new THREE.Color(C.pink).multiplyScalar(1.5), transparent: true, opacity: 0.6 }));
    this.nova.scene.add(b.aimLine);
  }

  private startCount(): void {
    if (this.phase === 'count') return;
    if (this.practiceSim) {
      this.practiceSim = null;
      this.buildBots(this.sim);
      this.nova.save.markSeen('tag-practice');
    }
    this.phase = 'count';
    this.countBeat = Math.ceil(this.nova.clock.beatAt()) + 1;
    const s = spawnPoints('cyan')[1];
    this.nova.ctx.teleport(s.x, s.z, s.yaw);
  }

  private end(): void {
    if (this.phase !== 'play') return;
    this.phase = 'end';
    this.endT = 0;
    const s = this.sim.score;
    const won = s.cyan > s.magenta;
    snd.scratch();
    this.nova.hud.banner(won ? 'Cyan wins!' : 'Magenta wins', { sub: `${s.cyan} to ${s.magenta}`, color: won ? HEX.cyan : HEX.pink, size: 'xl', ms: 2400 });
    if (won) {
      snd.cheer();
      this.nova.crowd.cheerNow(3);
    } else snd.aww();
    this.nova.fx.confetti.burst({ at: { x: 0, y: 5, z: won ? BASES.cyan.z - 2 : BASES.magenta.z + 2 }, count: 180, shape: 'up', speed: [4, 8], color: won ? [C.cyan, C.white] : [C.pink, C.white], size: [0.12, 0.2], life: [2, 3], gravity: 5, drag: 1.2 });
    for (const b of this.bots) b.robot.setFace((b.agent.team === 'cyan') === won ? 'cheer' : 'bow');
  }

  frame(dt: number, now: number, paused: boolean): void {
    const n = this.nova;
    this.t += dt;
    const sim = this.live;
    const beat = n.clock.drawBeat(now);
    if (!paused) {
      if (this.phase === 'intro' && this.t > 2.4) {
        if (this.practiceSim && !n.save.seen('tag-practice')) {
          this.phase = 'practice';
          const s = spawnPoints('cyan')[3];
          n.ctx.teleport(s.x, s.z, s.yaw);
          n.hint('hint-tag', `${controlWord(n)}: tag!`);
        } else this.startCount();
      }
      if (this.phase === 'count') {
        const bi = Math.floor(n.clock.beatAt(now));
        if (bi !== this.lastBeat) {
          this.lastBeat = bi;
          const k = bi - this.countBeat;
          if (k >= 0 && k < 3) {
            n.hud.banner(String(3 - k), { size: 'xl', ms: 450, color: HEX.white });
            snd.blip();
          } else if (k === 3) {
            n.hud.banner('GO!', { size: 'xl', ms: 700, color: HEX.cyan });
            snd.scratch();
            this.phase = 'play';
            n.crowd.cheerNow(1);
          }
        }
      }
      if (this.phase === 'end') {
        this.endT += dt;
        if (this.endT > 2.8) this.finish(false);
      }
    }
    // Bots.
    for (const b of this.bots) this.drawBot(b, dt, beat);
    this.drawBolts(sim);
    this.updateLock(sim);
    this.updateHud(sim, now, beat, dt);
    // Blade back to the hip after a swing.
    if (this.swingT > 0) {
      this.swingT -= dt;
      if (this.swingT <= 0) n.ctx.hold(this.blaster);
    }
    this.beatFlash = Math.max(0, this.beatFlash - dt);
    // The music feels the match: it thins out while you are tagged out.
    music.filter(sim.player.outT > 0 ? 900 : 20000, 0.3);
  }

  private drawBot(b: BotView, dt: number, beat: number): void {
    const a = b.agent;
    const r = b.robot;
    r.root.position.set(a.x, a.hop > 0 ? Math.sin((1 - a.hop / 0.45) * Math.PI) * 0.6 : 0, a.z);
    r.root.rotation.y = a.yaw;
    const sp = Math.hypot(a.vx, a.vz);
    r.rig.rotation.x = Math.min(0.25, sp * 0.05);
    b.stagger = Math.max(0, b.stagger - dt);
    if (b.stagger > 0) r.rig.rotation.x = -0.35 * (b.stagger / 0.25);
    r.idle(a.hitStop > 0 ? 0 : dt, beat, 0.5);
    const aiming = a.teleT > 0 || a.state === 'engage';
    r.armR.rotation.x += ((aiming ? -1.55 : -0.3) - r.armR.rotation.x) * Math.min(1, dt * 10);
    r.armL.rotation.x = -0.2 + Math.sin(beat * Math.PI) * 0.15;
    if (a.teleT > 0) {
      const flash = 0.5 + 0.5 * Math.sin(performance.now() / 40);
      r.setGlow(1 + flash * 1.4);
    } else if (a.outT <= 0 && b.dissolve === 0) r.setGlow(0.5 + (a.pips / a.maxPips) * 0.6);
    if (b.aimLine && a.teleT <= 0) {
      this.nova.scene.remove(b.aimLine);
      b.aimLine = null;
    }
    if (b.shield) b.shield.visible = a.firing <= 0 && a.outT <= 0;
    // Tagged out: spin, shrink and warp home.
    if (a.outT > 0) {
      b.dissolve += dt;
      const k = Math.min(1, b.dissolve / 0.6);
      r.root.rotation.y += k * 12;
      const s = (a.role === 'captain' ? 1.25 : 1) * 0.86 * (1 - k * 0.95);
      r.root.scale.setScalar(Math.max(0.01, s));
      r.root.visible = k < 1;
    } else r.root.visible = true;
    b.mark = Math.max(0, b.mark - dt);
  }

  private drawBolts(sim: TagSim): void {
    const list = sim.bolts;
    const n = Math.min(64, list.length);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const b = list[i];
      this.dummy.position.set(b.x, 1.1, b.z);
      this.dummy.rotation.set(0, Math.atan2(b.vx, b.vz), 0);
      this.dummy.scale.setScalar(b.beat ? 1.3 : 1);
      this.dummy.updateMatrix();
      this.boltMesh.setMatrixAt(i, this.dummy.matrix);
      this.boltGlow.setMatrixAt(i, this.dummy.matrix);
      const col = b.kind === 'reflect' ? C.white : b.kind === 'bank' && b.team === 'cyan' ? C.gold : b.beat ? C.lime : TEAM_HEX[b.team];
      c.setHex(col).lerp(new THREE.Color(0xffffff), 0.45).multiplyScalar(2.2);
      this.boltMesh.setColorAt(i, c);
      c.setHex(col).multiplyScalar(1.4);
      this.boltGlow.setColorAt(i, c);
    }
    for (const m of [this.boltMesh, this.boltGlow]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  private updateLock(sim: TagSim): void {
    const p = sim.player;
    if ((this.phase !== 'play' && this.phase !== 'practice') || p.outT > 0) {
      this.lock = null;
      this.bankLineObj.visible = false;
      this.deflectRing.visible = false;
      this.canDeflect = false;
      return;
    }
    const cands = sim.agents
      .filter((a) => a.team !== p.team && a.outT <= 0)
      .map((a) => {
        const visible = clearLine(p.x, p.z, a.x, a.z, sim.pieces, 1.2);
        const bank = !visible && !!bankLine(p.x, p.z, a.x, a.z, sim.pieces);
        return { id: a.id, x: a.x, z: a.z, visible, bank };
      });
    const before = this.lock?.id ?? null;
    this.lock = pickLock(p.x, p.z, p.yaw, this.nova.ctx.cameraYaw(), cands, before);
    if (this.lock && this.lock.id !== before) snd.blip();
    // Bank line.
    if (this.lock?.bank) {
      const t = sim.agents[this.lock.id];
      const bl = bankLine(p.x, p.z, t.x, t.z, sim.pieces);
      if (bl) {
        const g = this.bankLineObj.geometry;
        const pos = g.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, p.x, 1.1, p.z);
        pos.setXYZ(1, bl.px, 1.1, bl.pz);
        pos.setXYZ(2, t.x, 1.1, t.z);
        pos.needsUpdate = true;
        this.bankLineObj.computeLineDistances();
        this.bankLineObj.visible = true;
        this.nova.hint('hint-bank', 'Bank it off the mirror!');
      }
    } else this.bankLineObj.visible = false;
    // Deflect window.
    const was = this.canDeflect;
    this.canDeflect = !!sim.deflectable(DEFLECT_WARN);
    if (this.canDeflect && !was) {
      snd.deflectReady();
      this.nova.hint('hint-deflect', 'Now! Deflect it back');
    }
    this.deflectRing.visible = this.canDeflect;
    this.deflectRing.position.set(p.x, 1.1, p.z);
    this.deflectRing.scale.setScalar(1 + Math.sin(performance.now() / 50) * 0.08);
  }

  private updateHud(sim: TagSim, now: number, beat: number, dt: number): void {
    const n = this.nova;
    const cam = n.ctx.camera;
    // Reticle on the lock.
    const v = new THREE.Vector3();
    if (this.lock) {
      const t = sim.agents[this.lock.id];
      v.set(t.x, 1.1, t.z).project(cam);
      if (v.z < 1) {
        this.reticle.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px)`;
        this.reticle.classList.add('on');
      } else this.reticle.classList.remove('on');
      this.reticle.classList.toggle('bank', this.lock.bank);
    } else this.reticle.classList.remove('on');
    const ph = beat - Math.floor(beat);
    this.reticle.classList.toggle('beat', ph < 0.12 || ph > 0.92 || this.beatFlash > 0);
    // Pips, heat and power-ups.
    const p = sim.player;
    const pips = this.pipsEl.querySelectorAll('i');
    pips.forEach((el, i) => el.classList.toggle('off', i >= p.pips));
    (this.heatEl.firstChild as HTMLElement).style.transform = `scaleX(${sim.heat.toFixed(3)})`;
    this.heatEl.classList.toggle('hot', sim.overheated > 0);
    const power = p.overdrive > 0 ? `Overdrive ${Math.ceil(p.overdrive)}` : p.shield > 0 ? `Shield x${p.shield}` : '';
    if (this.powerEl.textContent !== power) this.powerEl.textContent = power;
    // Scores and time.
    const time = fmt(this.phase === 'play' ? sim.remaining : this.opts.duration);
    const s = this.sim.score;
    n.hud.set('cyan', String(s.cyan), { tone: s.cyan > s.magenta ? 'good' : null });
    n.hud.set('magenta', String(s.magenta));
    n.hud.set('time', this.sim.suddenGlow ? 'Sudden glow' : time, { bump: false, tone: this.phase === 'play' && sim.remaining <= 10 ? 'hot' : null });
    n.hud.bar('time', this.phase === 'play' ? sim.remaining / this.opts.duration : 1, sim.remaining <= 10 ? HEX.gold : HEX.cyan);
    if (s.cyan !== this.lastScore.cyan || s.magenta !== this.lastScore.magenta || time !== this.lastScore.time) {
      this.lastScore = { cyan: s.cyan, magenta: s.magenta, time };
      this.arena.paintBoards(s.cyan, s.magenta, time);
    }
    if (this.sim.suddenGlow && !this.announcedSudden) {
      this.announcedSudden = true;
      n.hud.banner('Sudden glow!', { sub: 'Next tag wins', color: HEX.gold, size: 'l', ms: 1800 });
      snd.rise();
    }
    // The last ten seconds beep on the beat.
    const bi = Math.floor(beat);
    if (this.phase === 'play' && sim.remaining <= 3.2 && sim.remaining > 0 && bi !== this.lastBeat) {
      this.lastBeat = bi;
      snd.blip();
    }
    // Edge arrows toward bots about to fire at you.
    this.teles = this.teles.filter((t) => t.until > now);
    for (let i = 0; i < this.edges.length; i++) {
      const e = this.edges[i];
      const tl = this.teles[i];
      if (!tl) {
        e.style.display = 'none';
        continue;
      }
      const a = sim.agents[tl.bot];
      v.set(a.x, 1.2, a.z).project(cam);
      const on = v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.9;
      if (on) {
        e.style.display = 'none';
        continue;
      }
      let dx = v.x;
      let dy = v.y;
      if (v.z >= 1) {
        dx = -dx;
        dy = -dy;
      }
      const ang = Math.atan2(dy, dx);
      const k = 0.92 / Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang)));
      const sx = ((Math.cos(ang) * k + 1) / 2) * innerWidth;
      const sy = ((1 - Math.sin(ang) * k) / 2) * innerHeight;
      e.style.display = 'block';
      e.style.transform = `translate(${sx}px, ${sy}px) rotate(${-ang + Math.PI / 2}rad)`;
    }
    // Radar every few frames.
    this.radarTick += dt;
    if (this.radarTick > 0.1) {
      this.radarTick = 0;
      this.drawRadar(sim);
    }
  }

  private drawRadar(sim: TagSim): void {
    const g = this.radar.getContext('2d')!;
    const W = 192;
    g.clearRect(0, 0, W, W);
    const sx = (x: number) => ((x - ARENA.x0) / (ARENA.x1 - ARENA.x0)) * (W - 24) + 12;
    const sz = (z: number) => ((z - ARENA.z0) / (ARENA.z1 - ARENA.z0)) * (W - 24) + 12;
    g.strokeStyle = 'rgba(180,156,255,0.6)';
    g.lineWidth = 3;
    g.strokeRect(12, 12, W - 24, W - 24);
    g.fillStyle = 'rgba(180,156,255,0.25)';
    for (const p of sim.pieces) {
      if (p.kind === 'pillar') {
        g.beginPath();
        g.arc(sx(p.x), sz(p.z), 7, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect(sx(p.x) - 3, sz(p.z) - 3, 6, 6);
    }
    const sees = sim.teamSees('cyan');
    for (const a of sim.agents) {
      if (a.outT > 0) continue;
      if (a.team === 'magenta' && !sees.has(a.id)) continue;
      g.fillStyle = a.player ? '#ffffff' : a.team === 'cyan' ? HEX.cyan : HEX.pink;
      g.beginPath();
      g.arc(sx(a.x), sz(a.z), a.player ? 8 : 6, 0, Math.PI * 2);
      g.fill();
      if (a.player) {
        g.strokeStyle = '#ffffff';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(sx(a.x), sz(a.z));
        g.lineTo(sx(a.x + Math.sin(a.yaw) * 3), sz(a.z + Math.cos(a.yaw) * 3));
        g.stroke();
      }
    }
  }

  shot(dt: number): CameraShot | null {
    const n = this.nova;
    const p = n.player();
    if (this.phase === 'intro') {
      const k = smooth(Math.min(1, this.t / 2.4));
      return { position: new THREE.Vector3(Math.sin(k * 1.2 - 0.6) * 12, 14 - k * 9, -35 + 22 * k), target: new THREE.Vector3(0, 1, -35 + 10 * k), blend: 1, lockPlayer: true, skip: () => (this.t = 9), skipLabel: 'Skip' };
    }
    if (this.phase === 'end') {
      const a = this.endT * 0.4;
      return { position: new THREE.Vector3(p.x + Math.sin(a) * 6, 3.2, p.z + Math.cos(a) * 6), target: new THREE.Vector3(p.x, 1.2, p.z), blend: Math.min(1, this.endT * 2) };
    }
    // Lock-on framing: you and your target.
    const sync = n.save.data.sync;
    const device = n.ctx.ui.device;
    const want = this.lock && sync.lockCam ? (device === 'kbm' ? 0.4 : 0.9) : 0;
    this.lockBlend += (want - this.lockBlend) * Math.min(1, dt * 3);
    if (this.lockBlend < 0.02) return null;
    const t = this.lock ? this.live.agents[this.lock.id] : null;
    if (t) {
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      const ux = dx / l;
      const uz = dz / l;
      const want3 = new THREE.Vector3(p.x - ux * 5.4 - uz * 1.1, 3.3, p.z - uz * 5.4 + ux * 1.1);
      const look = new THREE.Vector3(p.x + ux * Math.min(4, l * 0.4), 1.2, p.z + uz * Math.min(4, l * 0.4));
      if (this.camPos.lengthSq() === 0) {
        this.camPos.copy(want3);
        this.camTarget.copy(look);
      }
      this.camPos.lerp(want3, Math.min(1, dt * 4));
      this.camTarget.lerp(look, Math.min(1, dt * 6));
    }
    return { position: this.camPos.clone(), target: this.camTarget.clone(), blend: this.lockBlend };
  }

  private finish(quit: boolean): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    const s = this.sim.score;
    const log: TagLog = { diff: this.opts.diff, dur: Math.round(this.sim.time * 100) / 100, ev: this.sim.log, us: s.cyan, them: s.magenta, most: this.sim.mostTags().player && this.sim.player.tags > 0 };
    this.opts.onDone({ score: scoreTag(log), log, won: s.cyan > s.magenta, quit, us: s.cyan, them: s.magenta });
  }

  /**
   * Playtests: set up a moment, then real input plays it. `bank` freezes an
   * enemy where only a mirror bank reaches it from where you stand; `deflect`
   * sends a slow bolt at you; `out` leaves you one pip and sends a bolt.
   */
  debugSetup(kind: 'bank' | 'deflect' | 'out'): boolean {
    const sim = this.live;
    const p = sim.player;
    if (kind === 'bank') {
      const enemy = sim.agents.find((a) => a.team !== p.team && a.outT <= 0) ?? sim.agents.find((a) => a.team !== p.team);
      if (!enemy) return false;
      enemy.outT = 0;
      for (let px = -12; px <= 12; px += 1)
        for (let pz = -24; pz >= -33; pz -= 1)
          for (let ex = -12; ex <= 12; ex += 1.5)
            for (let ez = -47; ez <= -36; ez += 1.5) {
              if (!inArena(px, pz, 0.6) || !inArena(ex, ez, 0.6) || circleHitsPiece(px, pz, 0.6, sim.pieces) || circleHitsPiece(ex, ez, 0.7, sim.pieces)) continue;
              if (clearLine(px, pz, ex, ez, sim.pieces, 1.2)) continue;
              const bl = bankLine(px, pz, ex, ez, sim.pieces);
              if (!bl || bl.length > 20) continue;
              const yaw = Math.atan2(ex - px, ez - pz);
              enemy.x = ex;
              enemy.z = ez;
              enemy.frozen = true;
              enemy.pips = 1;
              enemy.shimmer = 0;
              for (const a of sim.agents) if (a !== enemy && !a.player) a.frozen = true;
              this.nova.ctx.teleport(px, pz, yaw);
              sim.setPlayer(px, pz, 0, yaw, 0, 0);
              this.lock = null;
              return true;
            }
      return false;
    }
    if (kind === 'out') {
      p.pips = 1;
      p.shimmer = 0;
      p.shield = 0;
    }
    return !!sim.debugIncoming(kind === 'out' ? 1.5 : 3.2, kind === 'out' ? 10 : 6);
  }

  /** Playtests: let the frozen bots move again. */
  debugThaw(): void {
    for (const a of this.live.agents) a.frozen = false;
  }

  /** Playtests: run the clock out now (the score stands). */
  debugEnd(): void {
    if (this.phase !== 'play') return;
    if (this.sim.score.cyan === this.sim.score.magenta) this.sim.score.cyan++;
    this.sim.time = this.sim.cfg.duration;
    this.sim.over = true;
  }

  /** Leaves the match early (pause menu). */
  abandon(): void {
    this.finish(true);
  }

  get playing(): boolean {
    return this.phase !== 'done' && this.phase !== 'end';
  }

  info(): Record<string, unknown> {
    const sim = this.live;
    const p = sim.player;
    return {
      phase: this.phase,
      time: sim.time,
      remaining: sim.remaining,
      score: sim.score,
      lock: this.lock,
      canDeflect: this.canDeflect,
      heat: sim.heat,
      overheated: sim.overheated,
      player: { x: p.x, z: p.z, pips: p.pips, out: p.outT, tags: p.tags },
      bots: sim.agents.filter((a) => !a.player).map((a) => ({ id: a.id, name: a.name, team: a.team, x: a.x, z: a.z, pips: a.pips, out: a.outT, state: a.state, tele: a.teleT })),
      bolts: sim.bolts.length,
      log: sim.log.length,
      practiceTags: this.practiceTags,
      reflects: this.reflects,
      layout: this.opts.layout,
    };
  }

  dispose(): void {
    const n = this.nova;
    for (const b of this.bots) this.removeBot(b);
    n.scene.remove(this.boltMesh, this.boltGlow, this.bankLineObj, this.deflectRing);
    this.reticle.remove();
    this.pipsEl.remove();
    this.radar.parentElement?.remove();
    this.vignette.remove();
    this.outEl.remove();
    for (const e of this.edges) e.remove();
    for (let i = 0; i < 2; i++) this.arena.showPower(i, null);
    n.ctx.hold(null);
    n.outfit.setGlow(1);
    n.hud.bar('time', null);
    n.doorsShut = false;
    music.filter(20000, 0.2);
    removeEventListener('pointerdown', this.onDown, true);
    removeEventListener('pointerup', this.onUp, true);
  }
}

function el(tag: string, cls = '', ...kids: Node[]): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids);
  return e;
}

function fmt(s: number): string {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function controlWord(n: Nova): string {
  const ui = n.ctx.ui;
  return ui.device === 'touch' ? 'Tag button' : ui.glyph('interact') || 'OK';
}

void haloTexture;
