// Prism blade duels on the Blade Ring: a one-button fighting rhythm game.
// The duelist winds up a beat before each strike while a ring closes on the
// clash point; press as it closes to parry. Crushes bind the blades until the
// "Push" cue, feints shimmer and must be left alone, and in strike phrases
// crest targets open on the duelist. Your blade's direction is chosen from
// the attack, so OK alone makes a real-looking sword fight.

import * as THREE from 'three';
import { music } from '../../audio/music';
import { buildScript, duelFlawless, duelist as duelistMeta, DUEL_PIPS, LiveDuel, scriptFor, type DuelDir, type DuelEvent, type DuelistId, type DuelJudgeEvent, type DuelResult, type DuelScript } from '../../shared/neon/duel';
import { GRADE_NAMES, type Grade } from '../../shared/neon/judge';
import { SONGS } from '../../shared/neon/songs';
import type { CameraShot, CaptureLabels } from '../../world/space';
import { DUELISTS as LOOKS, Robot } from './robots';
import { nova as snd } from './sounds';
import { prismBlade } from './style';
import { DUEL_SPOT, DUELIST_SPOT, RING } from './station';
import { C, HEX, smooth } from './util';
import type { Mode, Nova } from './world';

export interface DuelOutcome {
  result: DuelResult;
  log: string;
  flawless: boolean;
  quit: boolean;
  echo: boolean;
}

const CLASH: Record<DuelDir, [number, number, number]> = {
  high: [0, 1.85, 0],
  low: [0, 0.75, 0],
  left: [0.05, 1.25, 0.38],
  right: [0.05, 1.25, -0.38],
  thrust: [0.3, 1.2, 0],
};
const GRADE_COLOR: Record<Grade, string> = { P: '#fff4fe', G: HEX.cyan, O: HEX.lime, M: '#9a90b8' };

interface Ring {
  el: HTMLElement;
  e: DuelEvent;
  target: HTMLElement | null;
}

export class DuelMode implements Mode {
  readonly kind = 'duel';
  readonly id: DuelistId;
  readonly echo: boolean;
  private script: DuelScript;
  private drill: DuelScript | null;
  private judge: LiveDuel;
  private drillJudge: LiveDuel | null = null;
  private drillStreak = 0;
  private phase: 'drill' | 'bout' | 'end' | 'done' = 'bout';
  private robot: Robot;
  private blades: THREE.Object3D[] = [];
  private playerBlade: THREE.Object3D;
  private rings = new Map<number, Ring>();
  private hud: HTMLElement;
  private youBar: HTMLElement;
  private themBar: HTMLElement;
  private themGhost: HTMLElement;
  private phaseEl: HTMLElement;
  private pipsEl: HTMLElement;
  private camT = 0;
  private t = 0;
  private pausedNow = false;
  private countIn = 0;
  private lastPhrase = -1;
  private bindT = 0;
  private hitStop = 0;
  private recoil = 0;
  private stagger = 0;
  private endT = 0;
  private outcome: DuelResult | null = null;
  private punch = 0;
  private center = new THREE.Vector3(RING.x, 0, 0);
  private lastCall = -1;

  constructor(
    private nova: Nova,
    opts: { id: DuelistId; echo: boolean; drill: boolean; onDone: (o: DuelOutcome) => void },
  ) {
    this.id = opts.id;
    this.echo = opts.echo;
    this.onDone = opts.onDone;
    this.script = scriptFor(opts.id);
    const meta = duelistMeta(opts.id);
    this.drill = opts.drill ? buildScript({ ...meta, need: 99, script: ['G:..s...s...s...s.', 'G:..s...s...s...s.', 'G:..s...s...s...s.'] }) : null;
    this.judge = new LiveDuel(this.script, { easyHolds: nova.save.data.sync.easyHolds, widen: nova.save.data.sync.wide ? 1.4 : 1 });
    // The duelist steps off its pedestal into the ring.
    const look = LOOKS.find((l) => l.id === opts.id)!;
    this.robot = new Robot(look.look);
    this.robot.root.position.set(DUELIST_SPOT.x, 0, DUELIST_SPOT.z);
    this.robot.root.rotation.y = Math.PI / 2;
    nova.scene.add(this.robot.root);
    const mk = () => {
      const b = prismBlade(look.blade, opts.id === 'brick' ? 1.3 : 1.0);
      b.rotation.x = Math.PI;
      return b;
    };
    const right = mk();
    this.robot.handR.add(right);
    this.blades.push(right);
    if (look.twin) {
      const left = mk();
      this.robot.handL.add(left);
      this.blades.push(left);
    }
    // You, blade in hand, side-on.
    this.playerBlade = prismBlade(nova.bladeColor(), 1.0);
    this.playerBlade.rotation.x = Math.PI;
    nova.ctx.hold(this.playerBlade);
    nova.ctx.teleport(DUEL_SPOT.x, DUEL_SPOT.z, -Math.PI / 2);
    nova.fencer.beat = () => (nova.clock.running ? nova.clock.drawBeat() : 0);
    nova.ctx.pose(nova.fencer.pose);
    nova.rin.setActive(true);

    // HUD.
    this.youBar = el('b');
    this.themBar = el('b');
    this.themGhost = el('s');
    this.pipsEl = el('div', 'pips', ...Array.from({ length: DUEL_PIPS }, () => el('i')));
    this.phaseEl = el('div', 'phase', 'Ready');
    this.hud = el('div', 'nova-duel', el('div', 'side you', el('span', '', 'You'), this.pipsEl), this.phaseEl, el('div', 'side them', el('span', '', meta.name), el('div', 'bar', this.themGhost, this.themBar)));
    void this.youBar;
    nova.layer.appendChild(this.hud);
    nova.hud.strip([
      { id: 'score', label: 'Score', value: '0', wide: true },
      { id: 'combo', label: 'Combo', value: '0' },
    ]);
    nova.hud.title(`vs ${meta.name}`, `${opts.echo ? 'Echo' : 'Normal'} · ${meta.idea}`, 2600);
    if (this.drill) {
      this.phase = 'drill';
      this.drillJudge = new LiveDuel(this.drill, { easyHolds: true });
      nova.playSong(meta.song, { loop: true, fadeIn: 0.3, variant: meta.swing ? 'swing' : undefined });
      nova.hint('hint-ring', 'Press as the ring closes');
    } else this.startBout();
    nova.duelRing(this.id);
  }

  private onDone: (o: DuelOutcome) => void;

  private startBout(): void {
    const meta = duelistMeta(this.id);
    this.phase = 'bout';
    this.clearRings();
    this.nova.playSong(meta.song, { loop: true, fadeIn: 0.1, variant: meta.swing ? 'swing' : undefined });
    this.lastPhrase = -1;
  }

  get playing(): boolean {
    return this.phase === 'bout' || this.phase === 'drill';
  }

  capture(): CaptureLabels | null {
    return this.phase === 'done' ? null : { action: null, kick: null, jump: null };
  }

  holds(): boolean {
    return this.phase === 'bout' || this.phase === 'drill';
  }

  step(h: number): void {
    this.nova.hud.update(h);
  }

  private live(): { judge: LiveDuel; script: DuelScript } {
    return this.phase === 'drill' && this.drillJudge && this.drill ? { judge: this.drillJudge, script: this.drill } : { judge: this.judge, script: this.script };
  }

  frame(dt: number, now: number, paused: boolean): void {
    const n = this.nova;
    this.t += dt;
    if (this.playing) {
      if (paused && !this.pausedNow) {
        this.pausedNow = true;
        n.clock.pause(now);
        n.rin.setActive(false);
      } else if (!paused && this.pausedNow) {
        this.pausedNow = false;
        this.countIn = 3;
      }
      if (this.countIn > 0 && !paused) {
        const before = Math.ceil(this.countIn);
        this.countIn -= dt * (n.clock.bpm(now) / 60);
        if (Math.ceil(this.countIn) < before && this.countIn > 0) {
          n.hud.banner(String(Math.ceil(this.countIn)), { size: 'xl', ms: 420, color: HEX.lilac });
          snd.blip();
        }
        if (this.countIn <= 0) {
          this.countIn = 0;
          n.clock.resume(performance.now());
          n.rin.setActive(true);
        }
      }
      if (!this.pausedNow && this.countIn <= 0) this.play(now);
    }
    if (this.phase === 'end') {
      this.endT += dt;
      if (this.endT > 3.2) this.finish(false);
    }
    this.animate(dt, now);
    this.drawRings(now);
  }

  private play(now: number): void {
    const n = this.nova;
    const { judge, script } = this.live();
    n.rin.poll(now);
    for (const e of n.rin.take()) {
      const t = n.clock.judgeSec(e.at);
      const out = e.down ? judge.press(t) : judge.release(t);
      if (e.down && !out.some((x) => x.kind === 'grade' || x.kind === 'bind')) {
        // A swing at air (a feint, or nothing there).
        const next = script.judged[judge.next];
        if (next?.kind === 'feint' && Math.abs(t - next.t) < 0.25) {
          n.fencer.play('whiff');
          snd.whiff();
        } else n.fencer.play('parry', 'high');
      }
      for (const x of out) this.react(x);
    }
    for (const x of judge.sweep(n.clock.judgeSec(now) - 0.05)) this.react(x);
    // Phrase banners on the bar line.
    const beat = n.clock.beatAt(now);
    let p = -1;
    for (let i = 0; i < script.phrases.length; i++) if (beat >= script.phrases[i].startBeat - 0.05) p = i;
    if (p !== this.lastPhrase && p >= 0) {
      this.lastPhrase = p;
      const kind = script.phrases[p].kind;
      const label = kind === 'guard' ? 'Guard' : kind === 'strike' ? 'Strike' : 'Echo';
      this.phaseEl.textContent = label;
      this.phaseEl.className = `phase ${kind === 'guard' ? 'guard' : 'strike'}`;
      n.hud.banner(label, { sub: kind === 'guard' ? 'Parry the blade' : kind === 'strike' ? 'Hit the glowing crests' : 'Listen, then play it back', color: kind === 'guard' ? HEX.cyan : HEX.pink, size: 'm', ms: 900 });
      snd.whiff();
      if (kind === 'call') n.hint('hint-call', 'Listen, then copy the rhythm');
    }
    // Calls: the duelist taps its guard on each one.
    for (const e of script.events) {
      if (e.kind !== 'call' || e.i <= this.lastCall) continue;
      if (n.clock.drawSec(now) >= e.t) {
        this.lastCall = e.i;
        this.recoil = 0.15;
        snd.strike();
        n.fx.sparks.burst({ at: this.clashWorld('thrust'), count: 8, speed: [1, 3], color: [C.lilac, C.white], life: [0.15, 0.3], size: [0.04, 0.08] });
      } else break;
    }
    // The drill ends after two parries in a row (or its three phrases).
    if (this.phase === 'drill' && this.drillJudge) {
      const done = this.drillStreak >= 2 || this.drillJudge.ended || this.drillJudge.next >= (this.drill?.judged.length ?? 0);
      if (done) {
        this.nova.hud.banner(this.drillStreak >= 2 ? 'Nice!' : "Let's go!", { size: 'l', color: HEX.lime, ms: 900 });
        this.nova.save.markSeen(`duel-drill`);
        this.drillJudge = null;
        this.startBout();
      }
    }
    const s = this.judge.score;
    this.nova.hud.set('score', s.score.toLocaleString('en-US'), { bump: false });
    this.nova.hud.set('combo', String(s.combo), { tone: s.combo >= 10 ? 'good' : null });
    this.themBar.style.transform = `scaleX(${Math.max(0, 1 - s.tags / s.need).toFixed(3)})`;
    this.themGhost.style.transform = this.themBar.style.transform;
    this.pipsEl.querySelectorAll('i').forEach((el, i) => el.classList.toggle('off', i >= s.pips));
  }

  private clashWorld(d: DuelDir): THREE.Vector3 {
    const c = CLASH[d];
    return new THREE.Vector3(RING.x + c[0], c[1], c[2]);
  }

  private react(x: DuelJudgeEvent): void {
    const n = this.nova;
    const drilling = this.phase === 'drill';
    switch (x.kind) {
      case 'grade': {
        const e = x.e;
        const at = e.kind === 'open' ? new THREE.Vector3(RING.x - 0.3, 1.25, 0) : this.clashWorld(e.dir);
        this.dropRing(e.i);
        if (x.grade === 'M') {
          if (drilling) this.drillStreak = 0;
          if (e.kind === 'open') {
            n.hud.judge('Blocked', '#9a90b8');
            this.recoil = -0.2;
            snd.whiff();
          } else {
            n.fencer.play('hit');
            snd.bonk();
            n.ctx.shake(0.25);
            n.hud.judge(drilling ? 'Again!' : 'Ouch!', HEX.pink);
            n.hud.flash(HEX.pink, 160, 0.18);
          }
          return;
        }
        if (drilling) this.drillStreak++;
        n.hud.judge(GRADE_NAMES[x.grade], GRADE_COLOR[x.grade]);
        if (e.kind === 'open') {
          n.fencer.play('strike');
          this.stagger = 0.3;
          this.hitStop = 0.05;
          snd.strike();
          n.fx.sparks.burst({ at, count: 20, speed: [2, 5], color: [C.pink, C.white], life: [0.2, 0.4], size: [0.05, 0.1] });
          this.robot.setFace('surprised');
        } else {
          n.fencer.play('parry', e.dir);
          snd.shing(x.grade === 'P');
          this.hitStop = x.grade === 'P' ? 0.05 : 0.03;
          this.recoil = 0.25;
          n.fx.sparks.burst({ at, count: x.grade === 'P' ? 40 : 18, speed: [2, x.grade === 'P' ? 7 : 4], color: [C.white, x.grade === 'P' ? C.gold : C.cyan], life: [0.15, 0.4], size: [0.05, 0.12] });
          if (x.grade === 'P') {
            n.fx.rings.emit({ x: at.x, y: at.y, z: at.z }, { color: C.white, radius: 1.4, life: 0.3, normal: { x: 0, y: 0, z: 1 } });
            n.post.pulse(0.4);
          }
        }
        if (x.grade === 'P') this.punch = 0.12;
        return;
      }
      case 'feint':
        this.dropRing(x.e.i);
        if (x.read) {
          n.hud.judge('Read it!', HEX.lilac);
          snd.read();
          n.fx.glow.burst({ at: this.clashWorld(x.e.dir), count: 16, speed: [1, 2.5], color: C.lilac, life: [0.3, 0.6], size: [0.15, 0.3] });
        } else {
          n.hud.judge('Whiff', '#9a90b8');
          n.fencer.play('whiff');
        }
        return;
      case 'bind':
        this.dropRing(x.e.i);
        this.bindT = 0;
        n.fencer.play('bind');
        n.hint('hint-crush', 'Hold! Let go on Push');
        snd.bind();
        return;
      case 'push':
        if (x.kept) {
          n.fencer.play('push');
          snd.push();
          this.stagger = 0.5;
          n.hud.judge('Push!', HEX.gold);
          n.ctx.shake(0.2);
          n.fx.sparks.burst({ at: this.clashWorld('high'), count: 36, speed: [3, 7], color: [C.gold, C.white], life: [0.2, 0.5], size: [0.06, 0.12] });
        } else {
          n.fencer.play('hit');
          snd.bonk();
          n.hud.judge('Dropped', '#9a90b8');
          n.ctx.shake(0.3);
        }
        return;
      case 'end':
        if (this.phase === 'drill') return;
        this.end();
        return;
    }
  }

  private end(): void {
    if (this.phase !== 'bout') return;
    this.phase = 'end';
    this.endT = 0;
    const r = this.judge.score.result();
    this.outcome = r;
    const won = r.outcome === 'ko' || r.outcome === 'win';
    this.nova.rin.setActive(false);
    this.clearRings();
    music.stop(2.4);
    this.nova.clock.stop();
    if (won) {
      this.nova.hud.banner(r.outcome === 'ko' ? 'KO!' : 'Bout won!', { sub: duelFlawless(r) ? 'Flawless!' : `${r.tags} tags`, color: HEX.gold, size: 'xl', ms: 2400 });
      snd.fanfare();
      this.nova.fencer.play('win');
      this.robot.setFace('bow');
      this.nova.fx.confetti.burst({ at: { x: RING.x, y: 4, z: 0 }, count: 140, shape: 'up', speed: [3, 7], color: [C.gold, C.lilac], size: [0.12, 0.2], life: [2, 3], gravity: 5, drag: 1.2 });
      this.nova.crowd.cheerNow(3);
    } else {
      this.nova.hud.banner('Good bout!', { sub: `${r.tags} of ${r.tags + Math.max(0, this.judge.score.need - r.tags)} tags`, color: HEX.lilac, size: 'xl', ms: 2400 });
      snd.aww();
      this.nova.fencer.play('bow');
      this.robot.setFace('happy');
    }
  }

  private finish(quit: boolean): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    const r = this.outcome ?? this.judge.score.result();
    this.onDone({ result: r, log: this.judge.log(), flawless: duelFlawless(r), quit, echo: this.echo });
  }

  abandon(): void {
    this.finish(true);
  }

  // ---- drawing

  private animate(dt: number, now: number): void {
    const n = this.nova;
    const r = this.robot;
    const beat = n.clock.running ? n.clock.drawBeat(now) : 0;
    const t = n.clock.running ? n.clock.drawSec(now) : 0;
    this.hitStop = Math.max(0, this.hitStop - dt);
    const adt = this.hitStop > 0 ? 0 : dt;
    r.idle(adt, beat, 0.4);
    this.recoil *= 1 - Math.min(1, dt * 8);
    this.stagger = Math.max(0, this.stagger - dt);
    this.punch = Math.max(0, this.punch - dt);
    // Guard stance by default.
    let armX = -1.3;
    let armZ = 0.2;
    let lean = this.recoil * 0.4 - this.stagger * 0.6;
    const { judge, script } = this.live();
    const next = script.judged[judge.next];
    const beatSec = 60 / n.clock.bpm(now);
    if (this.phase === 'end' && this.outcome) {
      const won = this.outcome.outcome === 'ko' || this.outcome.outcome === 'win';
      const k = smooth(Math.min(1, this.endT / 0.8));
      if (won) {
        r.rig.position.y = -0.35 * k;
        r.rig.rotation.x = 0.7 * k;
        armX = -0.3;
      } else {
        armX = -2.6 * k;
        r.rig.rotation.x = 0;
      }
    } else if (judge.binding) {
      // Blades locked: straining forward, sparks streaming.
      this.bindT += dt;
      armX = -2.1;
      armZ = -0.1;
      lean = 0.2 + Math.sin(now / 30) * 0.02;
      if (Math.random() < 0.6) n.fx.sparks.burst({ at: this.clashWorld('high'), count: 3, speed: [1, 4], color: [C.gold, C.white], life: [0.15, 0.35], size: [0.04, 0.08], gravity: 6 });
      const left = judge.binding.endT - t;
      if (left < beatSec * 0.5) this.phaseEl.textContent = 'Push!';
    } else if (next && next.kind !== 'open' && t > next.t - beatSec) {
      // Wind-up during the beat before the strike.
      const k = Math.max(0, Math.min(1, (t - (next.t - beatSec)) / beatSec));
      const dir = next.dir;
      if (next.kind === 'feint' && k > 0.55) {
        // Flicker and pull back.
        armX = -2.4 + (k - 0.55) * 2.5;
        r.setGlow(1 + Math.sin(now / 25) * 0.8);
      } else {
        armX = dir === 'low' ? -0.6 - k * 0.8 : -1.3 - k * 1.5;
        armZ = dir === 'left' ? 0.2 + k * 0.6 : dir === 'right' ? 0.2 - k * 0.6 : 0.2;
        lean = -0.15 * k;
        if (next.kind === 'crush') r.setGlow(1 + k * 1.5);
      }
    } else if (next?.kind === 'open' && t > next.t - beatSec) {
      // Openings: the duelist lifts its guard and the crest lights.
      armX = -2.5;
      armZ = 0.6;
    } else r.setGlow(1);
    r.armR.rotation.x += (armX - r.armR.rotation.x) * Math.min(1, dt * 14);
    r.armR.rotation.z += (armZ - r.armR.rotation.z) * Math.min(1, dt * 14);
    if (this.blades.length > 1) {
      r.armL.rotation.x += (armX * 0.8 - r.armL.rotation.x) * Math.min(1, dt * 12);
      r.armL.rotation.z = -armZ;
    }
    if (this.phase !== 'end') r.rig.rotation.x = lean;
    // Strike follow-through just after each strike time.
    const prev = script.judged[judge.next - 1];
    if (prev && prev.kind !== 'open' && prev.kind !== 'feint' && t >= prev.t && t < prev.t + 0.18) r.armR.rotation.x = -0.4;
    n.setEnergy(0.8, 0);
  }

  private drawRings(now: number): void {
    const n = this.nova;
    if (!this.playing || this.pausedNow) {
      if (!this.playing) this.clearRings();
      return;
    }
    const { judge, script } = this.live();
    const t = n.clock.drawSec(now);
    const beatSec = 60 / n.clock.bpm(now);
    const cam = n.ctx.camera;
    const v = new THREE.Vector3();
    for (let i = judge.next; i < script.judged.length; i++) {
      const e = script.judged[i];
      const lead = beatSec * (e.kind === 'crush' ? 1.5 : 1);
      if (e.t - t > lead) break;
      const hidden = this.echo && e.response;
      let ring = this.rings.get(e.i);
      if (!ring && !hidden) {
        const r = el('div', 'nova-ring');
        const color = e.kind === 'open' ? HEX.pink : e.kind === 'crush' ? HEX.gold : e.kind === 'feint' ? HEX.lilac : HEX.white;
        r.style.color = color;
        r.style.borderColor = color;
        const target = e.kind === 'open' ? el('div', 'nova-target') : null;
        n.layer.appendChild(r);
        if (target) n.layer.appendChild(target);
        ring = { el: r, e, target };
        this.rings.set(e.i, ring);
      }
      if (!ring) continue;
      const k = Math.max(0, Math.min(1, 1 - (e.t - t) / lead));
      const w = e.kind === 'open' ? new THREE.Vector3(RING.x - 0.25, 1.15 + ((e.i * 37) % 5) * 0.12, ((e.i * 53) % 3) * 0.12 - 0.12) : this.clashWorld(e.dir);
      v.copy(w).project(cam);
      const sx = ((v.x + 1) / 2) * innerWidth;
      const sy = ((1 - v.y) / 2) * innerHeight;
      const size = 44 + (1 - k) * 120;
      ring.el.style.width = ring.el.style.height = `${size}px`;
      ring.el.style.transform = `translate(${sx - size / 2}px, ${sy - size / 2}px)`;
      ring.el.style.opacity = e.kind === 'feint' && k > 0.5 ? String(0.4 + 0.6 * Math.abs(Math.sin(now / 40))) : String(Math.min(1, k * 3));
      if (ring.target) ring.target.style.transform = `translate(${sx}px, ${sy}px) scale(${0.6 + k * 0.5})`;
    }
  }

  private dropRing(i: number): void {
    const r = this.rings.get(i);
    if (!r) return;
    r.el.remove();
    r.target?.remove();
    this.rings.delete(i);
  }

  private clearRings(): void {
    for (const r of this.rings.values()) {
      r.el.remove();
      r.target?.remove();
    }
    this.rings.clear();
  }

  shot(dt: number): CameraShot | null {
    this.camT += dt;
    const portrait = innerHeight > innerWidth;
    const b = smooth(Math.min(1, this.camT / 0.8));
    const sway = Math.sin(this.camT * 0.4) * 0.25;
    const bind = this.live().judge.binding ? 1 : 0;
    const dist = (portrait ? 8.4 : 5.4) - bind * 0.8 - this.punch * 2;
    if (this.phase === 'end' || this.phase === 'done') {
      const a = this.endT * 0.5;
      return { position: new THREE.Vector3(RING.x + Math.sin(a) * 5, 2.2, Math.cos(a) * 5), target: new THREE.Vector3(RING.x, 1.1, 0), blend: 1, fov: 50 };
    }
    return { position: new THREE.Vector3(this.center.x + 0.2 + sway, 1.85 - bind * 0.2, dist), target: new THREE.Vector3(this.center.x, 1.2, 0), blend: b, fov: portrait ? 62 : 48 };
  }

  info(): Record<string, unknown> {
    const n = this.nova;
    const now = performance.now();
    const { judge, script } = this.live();
    const next = script.judged.slice(judge.next, judge.next + 8).map((e) => ({ i: e.i, kind: e.kind, t: e.t, endT: e.endT, at: n.clock.perfOf(e.t), endAt: n.clock.perfOf(e.endT), response: e.response }));
    const s = this.judge.score;
    return {
      phase: this.phase,
      duelist: this.id,
      echo: this.echo,
      t: n.clock.running ? n.clock.secAt(now) : null,
      next,
      binding: !!judge.binding,
      score: s.score,
      tags: s.tags,
      need: s.need,
      pips: s.pips,
      combo: s.combo,
      whiffs: s.whiffs,
      reads: s.reads,
      crushes: s.crushes,
      counts: s.counts,
      outcome: s.outcome,
      drillStreak: this.drillStreak,
      song: SONGS[duelistMeta(this.id).song].name,
    };
  }

  dispose(): void {
    const n = this.nova;
    this.clearRings();
    n.scene.remove(this.robot.root);
    this.robot.dispose();
    this.hud.remove();
    n.ctx.hold(null);
    n.ctx.pose(null);
    n.fencer.clear();
    n.rin.setActive(false);
    n.duelRing(null);
  }
}

function el(tag: string, cls = '', ...kids: (Node | string)[]): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids);
  return e;
}
