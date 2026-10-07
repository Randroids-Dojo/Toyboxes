// The dance off on the Nova floor: a one-button rhythm game. Notes ride the
// beat bar into the gate (and run in along the floor rays); presses are
// judged on their own event times against the beat clock. Combo, Glow time,
// a scripted rival, three judges and their cards at the end. No fail.

import * as THREE from 'three';
import { music } from '../../audio/music';
import { chartFor, DIFF_NAMES, type Chart, type Diff, type Note } from '../../shared/neon/charts';
import { ASSIST_WIDEN, comboMult, EASY_WIDEN, GRADE_NAMES, LiveJudge, danceStars, type DanceResult, type Grade, type JudgeEvent } from '../../shared/neon/judge';
import { SONGS, beatToSec, secToBeat, type SongId } from '../../shared/neon/songs';
import type { CameraShot, CaptureLabels } from '../../world/space';
import { BeatBar } from './beat-bar';
import { rayOf } from './floor';
import { Robot } from './robots';
import { nova as snd } from './sounds';
import { FREESTYLE } from './style';
import { C, HEX, rng, smooth } from './util';
import { JUDGES } from './station';
import type { Mode, Nova } from './world';

export interface Rival {
  name: string;
  look: ConstructorParameters<typeof Robot>[0];
  /** Share of notes Perfect, Great, Good (the rest miss). */
  skill: [number, number, number];
}

export const RIVALS: Record<string, Rival> = {
  twirl: { name: 'Twirl', look: { head: 'bean', body: 0x2a5a8a, trim: C.cyan, badge: 'star' }, skill: [0.35, 0.3, 0.2] },
  shimmer: { name: 'Shimmer', look: { head: 'star', body: 0x6a2a6a, trim: C.pink, badge: 'star' }, skill: [0.45, 0.3, 0.15] },
  boogie: { name: 'Boogie', look: { head: 'phones', body: 0x2a6a4a, trim: C.lime, badge: 'star' }, skill: [0.55, 0.28, 0.1] },
  strobe: { name: 'Strobe', look: { head: 'slim', body: 0x3a2a7a, trim: C.lilac, badge: 'star' }, skill: [0.65, 0.22, 0.08] },
  orbit: { name: 'Orbit', look: { head: 'vinyl', body: 0x2a1a66, trim: C.gold, badge: 'star' }, skill: [0.78, 0.15, 0.05] },
};

export interface DanceOutcome {
  result: DanceResult;
  log: { n: string; s: string };
  stars: number;
  /** Ended by leaving rather than finishing the song. */
  quit: boolean;
  wide: boolean;
  /** Timing errors of every hit, seconds (positive late), for sync tuning. */
  errors: number[];
}

const PLAYER = { x: 0, z: 0, yaw: 0 };
const RIVAL_SPOT = { x: -3, z: -1.5 };
const GRADE_COLOR: Record<Grade, string> = { P: '#fff4fe', G: HEX.cyan, O: HEX.lime, M: '#9a90b8' };
const GRADE_HEX: Record<Grade, number> = { P: C.white, G: C.cyan, O: C.lime, M: 0x6a6088 };
const NOTE_HEX: Record<Note['sub'], number> = { 4: C.pink, 8: C.cyan, 16: C.gold, 3: C.gold };

export class DanceMode implements Mode {
  readonly kind = 'dance';
  chart: Chart;
  judge: LiveJudge;
  /** The first-time practice loop, before the song. */
  private drill: { chart: Chart; judge: LiveJudge; real: { chart: Chart; judge: LiveJudge }; streak: number } | null = null;
  private ahead: boolean | null = null;
  private bar: BeatBar;
  private rivalBot: Robot;
  private rivalMeter: HTMLElement;
  private rivalFill: HTMLElement;
  private comboEl: HTMLElement;
  private phase: 'enter' | 'play' | 'cards' | 'done' = 'enter';
  private t = 0;
  private pausedNow = false;
  private countIn = 0;
  private lastBeatInt = -1;
  private rivalScore = 0;
  private rivalGrades: Grade[];
  private rivalNext = 0;
  private dim = 0;
  private wasGlow = false;
  private camT = 0;
  private wide: boolean;
  private endAt: number;
  private cardsEl: HTMLElement | null = null;
  private quit = false;
  private shotCut = 0;
  private lastCombo = 0;
  private spotActive = false;
  private moveDirs: number[] = [];
  readonly song: SongId;
  readonly diff: Diff;

  constructor(
    private nova: Nova,
    opts: { song: SongId; diff: Diff; rival: Rival; seed?: number; onDone: (o: DanceOutcome) => void },
  ) {
    this.song = opts.song;
    this.diff = opts.diff;
    this.onDone = opts.onDone;
    this.chart = chartFor(opts.song, opts.diff)!;
    this.wide = nova.save.data.sync.wide;
    const widen = (opts.diff === 'easy' ? EASY_WIDEN : 1) * (this.wide ? ASSIST_WIDEN : 1);
    this.judge = new LiveJudge(this.chart, { widen, easyHolds: nova.save.data.sync.easyHolds });
    const last = this.chart.notes[this.chart.notes.length - 1];
    this.endAt = Math.max(last ? last.endT + 1.2 : 0, this.chart.seconds - beatToSec(this.chart.song, 4) + 0.5);

    // The rival's night, decided up front from its skill.
    const r = rng(opts.seed ?? 99);
    const [p, g, o] = opts.rival.skill;
    this.rivalGrades = this.chart.notes.map(() => {
      const x = r();
      return x < p ? 'P' : x < p + g ? 'G' : x < p + g + o ? 'O' : 'M';
    });
    this.rivalBot = new Robot({ ...opts.rival.look, scale: 0.92 });
    this.rivalBot.root.position.set(RIVAL_SPOT.x, 0, RIVAL_SPOT.z);
    nova.scene.add(this.rivalBot.root);

    // HUD: the beat bar, the rival meter and the combo.
    this.bar = new BeatBar(nova.layer);
    // Narrow screens show less time so gems keep their spacing.
    const narrow = Math.max(0.55, Math.min(1, innerWidth / 900));
    this.bar.lead = (opts.diff === 'easy' ? 2.6 : opts.diff === 'normal' ? 2.2 : 1.8) * narrow;
    this.rivalFill = h('i', '');
    this.rivalMeter = h('div', 'nova-rival', h('span', 'you', 'You'), h('div', 'track', this.rivalFill), h('span', 'them', opts.rival.name));
    this.comboEl = h('div', 'nova-combo');
    nova.layer.append(this.rivalMeter, this.comboEl);
    nova.hud.strip([
      { id: 'score', label: 'Score', value: '0', wide: true },
      { id: 'mult', label: 'Combo', value: 'x1' },
    ]);
    nova.hud.title(SONGS[opts.song].name, `${DIFF_NAMES[opts.diff]} · vs ${opts.rival.name}`, 2600);

    // Place the dancer and start the song (its first bars are the count-in).
    nova.ctx.teleport(PLAYER.x, PLAYER.z, PLAYER.yaw);
    nova.dancer.energy = 1;
    nova.dancer.beat = () => (nova.clock.running ? nova.clock.drawBeat() : 0);
    nova.ctx.pose(nova.dancer.pose);
    nova.rin.setActive(true);
    this.phase = 'play';
    if (!nova.save.seen('dance-drill')) this.startDrill(widen);
    else nova.playSong(opts.song, { fadeIn: 0.05 });
    this.bar.show(nova.save.data.sync.beatBar);
    if (this.diff === 'easy' || !nova.save.seen('hint-gems')) nova.hint('hint-gems', 'Tap on the gems');
  }

  private onDone: (o: DanceOutcome) => void;

  /** First time: the intro loops while four quarter notes come round, until four land in a row. */
  private startDrill(widen: number): void {
    const song = this.chart.song;
    const beats = [4, 5, 6, 7, 12, 13, 14, 15, 20, 21, 22, 23, 28, 29, 30, 31];
    const notes: Note[] = beats.map((b, i) => ({ i, kind: 'tap', beat: b, t: beatToSec(song, b), endBeat: b, endT: beatToSec(song, b), sub: 4, link: false }));
    const chart: Chart = { song, diff: 'easy', notes, slots: [], spotBars: [], bars: 8, seconds: beatToSec(song, 34) };
    const judge = new LiveJudge(chart, { widen: Math.max(widen, EASY_WIDEN) });
    this.drill = { chart, judge, real: { chart: this.chart, judge: this.judge }, streak: 0 };
    this.chart = chart;
    this.judge = judge;
    this.nova.playSong(this.song, { fadeIn: 0.05, loop: true });
    music.only('intro');
    this.nova.hud.banner('Practice', { sub: 'Tap as each gem reaches the ring', color: HEX.lilac, size: 'm', ms: 2400 });
  }

  private endDrill(nailed: boolean): void {
    const d = this.drill;
    if (!d) return;
    this.drill = null;
    this.chart = d.real.chart;
    this.judge = d.real.judge;
    this.rivalNext = 0;
    this.rivalScore = 0;
    this.lastBeatInt = -1;
    this.nova.save.markSeen('dance-drill');
    music.only(null);
    this.nova.playSong(this.song, { fadeIn: 0.05 });
    this.nova.hud.banner(nailed ? 'Nice!' : "Let's dance!", { sub: 'Here comes the song', color: HEX.lime, size: 'l', ms: 1600 });
  }

  /** In the practice loop. */
  get drilling(): boolean {
    return !!this.drill;
  }

  /** The song is running (not the cards or results). */
  get playing(): boolean {
    return this.phase === 'play';
  }

  capture(): CaptureLabels | null {
    if (this.phase === 'done') return null;
    return { action: null, kick: null, jump: null, prompt: this.phase === 'play' ? null : null };
  }

  holds(): boolean {
    return this.phase === 'play';
  }

  step(h: number): void {
    this.nova.hud.update(h);
  }

  /** The judged song time now. */
  private judgeNow(now: number): number {
    return this.nova.clock.judgeSec(now);
  }

  frame(dt: number, now: number, paused: boolean): void {
    const n = this.nova;
    this.t += dt;
    if (this.phase === 'play') {
      // Pause and resume with a short count-in.
      if (paused && !this.pausedNow) {
        this.pausedNow = true;
        n.clock.pause(now);
        n.rin.setActive(false);
      } else if (!paused && this.pausedNow) {
        this.pausedNow = false;
        this.countIn = 3;
        this.lastBeatInt = -1;
      }
      if (this.countIn > 0 && !paused) {
        const step = Math.floor(this.countIn);
        this.countIn -= dt * (n.clock.bpm(now) / 60);
        const next = Math.floor(this.countIn);
        if (next < step) {
          if (next >= 0 && step > 0) n.hud.banner(next > 0 ? String(step) : String(step), { size: 'xl', ms: 450, color: HEX.lilac });
          snd.blip();
        }
        if (this.countIn <= 0) {
          this.countIn = 0;
          n.clock.resume(performance.now());
          n.rin.setActive(true);
        }
      }
      if (!this.pausedNow && this.countIn <= 0) this.play(dt, now);
    }
    // Visuals run every frame.
    const draw = n.clock.running ? n.clock.drawSec(now) : 0;
    const beat = n.clock.running ? secToBeat(this.chart.song, Math.max(0, draw)) : 0;
    const glow = this.phase === 'play' && this.judge.score.glowAt(beat) ? 1 : 0;
    if (glow && !this.wasGlow) {
      n.hud.banner('Glow time!', { sub: 'x2 points', color: HEX.lime, size: 'l', ms: 1600 });
      n.core.burst(1.4);
      n.crowd.cheerNow(2);
      music.layer('glow', true);
      snd.rise();
      n.post.pulse(0.8);
    } else if (!glow && this.wasGlow) music.layer('glow', false);
    this.wasGlow = !!glow;
    // Spotlight bars.
    const spot = this.chart.spotBars.some((b) => beat >= b * 4 && beat < b * 4 + 4);
    if (spot && !this.spotActive) {
      n.hud.banner('Free!', { sub: 'Press on the beat to show off', color: HEX.gold, size: 'm', ms: 1500 });
      n.hint('hint-spot', 'Press on the beat');
    }
    this.spotActive = spot;
    n.setEnergy(glow ? 2 : spot ? 0.6 : 1.2, glow);
    this.dim = Math.max(0, this.dim - dt * 1.5);
    // A held note streams sparkles off the dancer.
    if (this.judge.holding && !paused) n.fx.glow.burst({ at: { x: PLAYER.x, y: 1.1, z: PLAYER.z }, count: 2, radius: 0.4, speed: [0.5, 1.5], color: [C.gold, C.white], life: [0.3, 0.6], size: [0.08, 0.16], gravity: -1 });
    n.floor.update(dt, now / 1000, beat, { glow, dim: this.dim, spot: spot ? 1 : 0, mood: 1, px: PLAYER.x, pz: PLAYER.z });
    this.floorNotes(draw);
    this.bar.draw(dt, this.chart, {
      now: draw,
      marks: (i) => this.judge.markOf(i),
      holding: this.judge.holding,
      glow: !!glow,
      meter: this.judge.score.meter,
      slot: (i) => this.judge.slotMark(i),
    });
    // The rival dances on its hits and the meter tracks the duel of scores.
    while (this.rivalNext < this.chart.notes.length && this.chart.notes[this.rivalNext].t <= draw) {
      const g = this.rivalGrades[this.rivalNext];
      if (g !== 'M') {
        this.rivalScore += (g === 'P' ? 300 : g === 'G' ? 200 : 100) * comboMult(Math.min(60, this.rivalNext));
        this.rivalBot.rig.rotation.y = (this.rivalNext % 2 ? 0.4 : -0.4) * (g === 'P' ? 1 : 0.6);
        this.rivalBot.setFace(g === 'P' ? 'cheer' : 'happy');
      } else this.rivalBot.setFace('surprised');
      this.rivalNext++;
    }
    this.rivalBot.idle(dt, beat, 1.4);
    this.rivalBot.rig.rotation.y *= 1 - Math.min(1, dt * 4);
    this.rivalBot.armL.rotation.x = -1.2 + Math.sin(beat * Math.PI) * 0.8;
    this.rivalBot.armR.rotation.x = -1.2 - Math.sin(beat * Math.PI) * 0.8;
    const you = this.judge.score.score;
    const share = you + this.rivalScore > 0 ? you / (you + this.rivalScore) : 0.5;
    this.rivalFill.style.transform = `scaleX(${share.toFixed(3)})`;
    this.rivalMeter.classList.toggle('ahead', share >= 0.5);
    // Judges react.
    for (const [i, j] of n.judges.entries()) {
      j.idle(dt, beat, 0.6);
      j.head.rotation.x *= 1 - Math.min(1, dt * 5);
      j.head.rotation.z *= 1 - Math.min(1, dt * 5);
      void i;
    }
    if (this.phase === 'cards') this.cards(dt);
  }

  private play(_dt: number, now: number): void {
    const n = this.nova;
    n.rin.poll(now);
    const events = n.rin.take();
    for (const e of events) {
      const t = this.judgeNow(e.at);
      const out = e.down ? this.judge.press(t) : this.judge.release(t);
      if (e.down && !out.some((x) => x.kind === 'note' || x.kind === 'slot')) this.stray(t);
      for (const x of out) this.react(x);
    }
    // Spotlight move choices from the arrows (optional style).
    for (const d of n.ctx.input.takeDirs()) this.moveDirs.push(['up', 'down', 'left', 'right'].indexOf(d.dir));
    for (const x of this.judge.sweep(this.judgeNow(now) - 0.05)) this.react(x);
    // Phrase starts flash the Core.
    const beat = n.clock.beatAt(now);
    const bi = Math.floor(beat);
    if (bi !== this.lastBeatInt && bi >= 0) {
      this.lastBeatInt = bi;
      if (bi % 16 === 0) {
        n.core.burst(0.7);
        snd.pulse();
      }
      if (this.drill) {
        // no count-in while practising
      } else if (bi === 4) n.hud.banner('3', { size: 'xl', ms: 450 });
      else if (bi === 5) n.hud.banner('2', { size: 'xl', ms: 450 });
      else if (bi === 6) n.hud.banner('1', { size: 'xl', ms: 450 });
      else if (bi === 7) n.hud.banner('Dance!', { size: 'xl', ms: 650, color: HEX.pink });
    }
    if (this.drill) {
      const sc = this.judge.score;
      this.drill.streak = sc.combo;
      if (sc.combo >= 4) this.endDrill(true);
      else if (this.judge.done) this.endDrill(false);
      return;
    }
    // The rival meter swings: call it when the lead changes.
    const you = this.judge.score.score;
    if (this.judge.next > 12) {
      const ahead = you >= this.rivalScore;
      if (this.ahead !== null && ahead !== this.ahead) {
        n.hud.judge(ahead ? 'You take the lead!' : 'Rival takes the lead', ahead ? HEX.cyan : HEX.pink);
        snd.cheer();
        n.crowd.cheerNow(0.8);
      }
      this.ahead = ahead;
    }
    const combo = this.judge.score.combo;
    this.comboEl.textContent = combo >= 5 ? `${combo}` : '';
    this.comboEl.classList.toggle('hot', combo >= 30);
    n.hud.set('score', this.judge.score.score.toLocaleString('en-US'), { bump: false });
    n.hud.set('mult', `x${comboMult(combo)}`, { tone: combo >= 60 ? 'hot' : combo >= 10 ? 'good' : null });
    if (this.judge.done && n.clock.secAt(now) >= this.endAt) this.finish();
  }

  /** A press with nothing to hit: ignored outside spotlight bars (no penalty for nerves). */
  private stray(_t: number): void {
    // A small step so the press still feels alive.
    this.nova.dancer.play('step', 0.3);
  }

  private react(x: JudgeEvent): void {
    const n = this.nova;
    const sync = n.save.data.sync;
    if (x.kind === 'note') {
      const g = x.grade;
      if (g === 'M') {
        this.bar.miss();
        n.dancer.stumble();
        this.dim = 1;
        snd.miss();
        if (this.judge.score.combo === 0 && this.lastCombo >= 10) n.hud.judge('Combo lost', '#9a90b8');
        this.lastCombo = 0;
        for (const j of n.judges) {
          j.head.rotation.z = 0.35;
          j.setFace('surprised');
        }
        return;
      }
      this.bar.judge(GRADE_NAMES[g], GRADE_COLOR[g], x.err);
      if (sync.hitSound) snd.hit(g);
      const pose = x.note.kind === 'pose';
      if (pose) {
        n.dancer.play(n.save.data.equipped.pose === 'point' ? 'point' : 'star', 0.7);
        snd.pose();
        n.hud.flash('#ffffff', 160, 0.25);
        n.post.flash(0xffffff, 0.35, 0.25);
      } else if (x.note.kind === 'hold') {
        n.dancer.holdMove(this.diff === 'easy' ? 'glide' : 'spin');
        snd.hold();
      } else n.dancer.hit(g === 'P' ? 0.42 : 0.5);
      const col = GRADE_HEX[g];
      n.floor.flash(g === 'P' ? NOTE_HEX[x.note.sub] : col, g === 'P' ? 1 : 0.6);
      n.fx.rings.emit({ x: PLAYER.x, y: 0.05, z: PLAYER.z }, { color: g === 'P' ? C.white : col, radius: g === 'P' ? 3.2 : 2.2, life: 0.5 });
      if (g === 'P') n.fx.sparks.burst({ at: { x: PLAYER.x, y: 1.0, z: PLAYER.z }, count: 18, speed: [2, 5], color: [NOTE_HEX[x.note.sub], C.white], life: [0.3, 0.6], size: [0.06, 0.14], gravity: 4 });
      n.outfit.setGlow(g === 'P' ? 1.6 : 1.2);
      const combo = this.judge.score.combo;
      this.lastCombo = combo;
      if (combo === 10 || combo === 25 || combo === 50 || combo === 100 || (combo > 100 && combo % 50 === 0)) {
        n.hud.judge(`${combo} combo!`, HEX.gold);
        n.core.burst(1);
        n.crowd.cheerNow(1.4);
        snd.cheer();
        if (combo >= 50) this.shotCut = 2.5;
        for (const j of n.judges) {
          j.head.rotation.x = 0.35;
          j.setFace('cheer');
        }
      } else if (combo % 8 === 0) for (const j of n.judges) j.setFace('happy');
      for (const j of n.judges) if (j.currentFace === 'surprised') j.setFace('focused');
      return;
    }
    if (x.kind === 'tail') {
      n.dancer.holdMove(null);
      if (x.kept) {
        n.hud.judge('Hold!', HEX.gold);
        n.fx.glow.burst({ at: { x: PLAYER.x, y: 1.2, z: PLAYER.z }, count: 20, shape: 'ring', speed: [1, 3], color: C.gold, life: [0.4, 0.7], size: [0.15, 0.3] });
      } else {
        n.hud.judge('Dropped', '#9a90b8');
        n.dancer.stumble();
      }
      return;
    }
    if (x.kind === 'slot') {
      if (x.mark === 'F') {
        const dirs = ['up', 'down', 'left', 'right'] as const;
        const d = this.moveDirs.length ? dirs[this.moveDirs.shift()!] : dirs[x.index % 4];
        n.dancer.play(FREESTYLE[d], 0.4);
        n.floor.flash(C.gold, 0.8);
        n.fx.sparks.burst({ at: { x: PLAYER.x, y: 0.2, z: PLAYER.z }, count: 12, shape: 'ring', speed: [2, 4], color: [C.gold, C.pink], life: [0.3, 0.5], size: [0.06, 0.12] });
        if (n.save.data.sync.hitSound) snd.hit('G');
        n.crowd.cheerNow(0.5);
      } else {
        n.hud.judge('Sloppy', '#9a90b8');
        n.dancer.stumble();
      }
    }
  }

  /** Light pulses running in along the floor rays for the next notes. */
  private floorNotes(now: number): void {
    const list: { ray: number; r: number; color: number; alpha: number }[] = [];
    const lead = 1.6;
    for (let i = this.judge.next; i < this.chart.notes.length && list.length < 12; i++) {
      const note = this.chart.notes[i];
      const dt = note.t - now;
      if (dt > lead) break;
      if (dt < -0.1) continue;
      const ray = ((i * 5) % 16) - 8;
      list.push({ ray, r: 1.2 + Math.max(0, dt / lead) * 5.2, color: NOTE_HEX[note.sub], alpha: 1 - Math.max(0, dt / lead) * 0.4 });
    }
    void rayOf;
    this.nova.floor.setNotes(list);
  }

  private finish(): void {
    if (this.phase !== 'play') return;
    this.phase = 'cards';
    this.t = 0;
    this.nova.rin.setActive(false);
    this.nova.dancer.holdMove(null);
    music.stop(2.2);
    this.nova.clock.stop();
    this.bar.show(false);
    this.rivalMeter.remove();
    this.comboEl.remove();
    this.nova.hud.strip([]);
    const r = this.judge.result()!;
    this.result = r;
    this.cardsEl = buildCards(this.nova.layer, r);
    this.nova.dancer.play(this.nova.victoryMove(), 1.6);
  }

  private result: DanceResult | null = null;
  private cardStage = -1;

  /** The judges flip their cards one by one, numbers counting up. */
  private cards(_dt: number): void {
    const el = this.cardsEl;
    const r = this.result;
    if (!el || !r) return;
    const stage = Math.floor((this.t - 0.6) / 0.9);
    if (stage > this.cardStage && stage <= 3) {
      this.cardStage = stage;
      if (stage < 3) {
        const card = el.children[stage] as HTMLElement;
        card.classList.add('flip');
        snd.thwip();
        const v = [r.cards.tempo, r.cards.groove, r.cards.sparkle][stage];
        for (let k = 0; k < Math.round(v); k++) setTimeout(() => snd.bell(k), 120 + k * 45);
        const j = this.nova.judges[stage];
        j.setFace(v >= 8 ? 'cheer' : v >= 5 ? 'happy' : 'surprised');
        j.head.rotation.x = 0.3;
      } else {
        el.classList.add('total');
        if (r.cards.total >= 21) {
          snd.fanfare();
          this.nova.crowd.cheerNow(3);
          this.nova.fx.confetti.burst({ at: { x: 0, y: 4, z: 0 }, count: 160, shape: 'up', speed: [3, 7], color: [C.gold, C.pink], size: [0.12, 0.2], life: [2, 3], gravity: 5, drag: 1.2 });
        } else snd.cheer();
      }
    }
    if (this.t > 0.6 + 0.9 * 3 + 1.4 && this.phase === 'cards') {
      this.phase = 'done';
      el.remove();
      this.cardsEl = null;
      const log = this.judge.log();
      this.onDone({ result: r, log, stars: danceStars(r.cards.total), quit: this.quit, wide: this.wide, errors: this.judge.errors });
    }
  }

  /** Playtests: the rest of the song goes by unplayed. */
  debugEnd(): void {
    for (const x of this.judge.sweep(Infinity)) this.react(x);
    this.finish();
  }

  /** Leaves mid-song (from the pause menu). */
  abandon(): void {
    this.quit = true;
    this.phase = 'done';
  }

  shot(dt: number): CameraShot | null {
    this.camT += dt;
    this.shotCut = Math.max(0, this.shotCut - dt);
    const glow = this.wasGlow;
    const b = smooth(Math.min(1, this.camT / 0.9));
    const s = Math.sin(this.camT * 0.25);
    const portrait = innerHeight > innerWidth;
    let pos: THREE.Vector3;
    let target: THREE.Vector3;
    if (this.phase === 'cards' || this.phase === 'done') {
      // Pan across the judges from the floor side of their desk.
      const k = smooth(Math.min(1, this.t / 2.5));
      const ux = -JUDGES.x / Math.hypot(JUDGES.x, JUDGES.z);
      const uz = -JUDGES.z / Math.hypot(JUDGES.x, JUDGES.z);
      const back = portrait ? 4.6 : 3.4;
      pos = new THREE.Vector3(JUDGES.x + ux * back - uz * (1 - k * 2) * 1.2, 1.75, JUDGES.z + uz * back + ux * (1 - k * 2) * 1.2);
      target = new THREE.Vector3(JUDGES.x - ux * 0.7, 1.35, JUDGES.z - uz * 0.7);
    } else if (glow || this.shotCut > 0) {
      // Crane round the floor.
      const a = Math.sin(this.camT * 0.3) * 0.8;
      pos = new THREE.Vector3(Math.sin(a) * 8 + 1, 4.6 + Math.sin(this.camT * 0.4) * 0.5, Math.cos(a) * 8);
      target = new THREE.Vector3(-1, 1.4, -0.6);
    } else if (this.spotActive) {
      pos = new THREE.Vector3(0.6, 1.5, 4.4);
      target = new THREE.Vector3(0, 1.1, 0);
    } else {
      pos = new THREE.Vector3(0.8 + s * 0.6, portrait ? 2.6 : 2.2, portrait ? 8.6 : 7.4);
      target = new THREE.Vector3(portrait ? -0.6 : -1.1, portrait ? 0.7 : 0.9, -0.6);
    }
    return { position: pos, target, blend: b, fov: portrait ? 64 : 52 };
  }

  info(): Record<string, unknown> {
    const n = this.nova;
    const now = performance.now();
    const next = this.chart.notes.slice(this.judge.next, this.judge.next + 8).map((x) => ({ i: x.i, kind: x.kind, t: x.t, endT: x.endT, at: n.clock.perfOf(x.t), endAt: n.clock.perfOf(x.endT) }));
    const slots = this.chart.slots.filter((s) => s.t > n.clock.secAt(now) - 0.05).slice(0, 8).map((s) => ({ t: s.t, at: n.clock.perfOf(s.t) }));
    const s = this.judge.score;
    return {
      phase: this.drill ? 'drill' : this.phase,
      song: this.song,
      diff: this.diff,
      t: n.clock.running ? n.clock.secAt(now) : null,
      beat: n.clock.running ? n.clock.beatAt(now) : null,
      paused: this.pausedNow,
      countIn: this.countIn,
      next,
      slots,
      score: s.score,
      combo: s.combo,
      maxCombo: s.maxCombo,
      counts: s.counts,
      holds: s.holds,
      spot: s.spot,
      glows: s.glows,
      glow: this.wasGlow,
      meter: s.meter,
      judged: this.judge.next,
      notes: this.chart.notes.length,
      holding: !!this.judge.holding,
      rival: this.rivalScore,
      cards: this.result?.cards ?? null,
      audible: n.clock.audible,
    };
  }

  dispose(): void {
    const n = this.nova;
    n.rin.setActive(false);
    this.bar.dispose();
    this.rivalMeter.remove();
    this.comboEl.remove();
    this.cardsEl?.remove();
    n.scene.remove(this.rivalBot.root);
    this.rivalBot.dispose();
    n.floor.setNotes([]);
    n.hud.strip([]);
    n.dancer.holdMove(null);
    for (const j of n.judges) j.setFace('happy');
    music.layer('glow', false);
  }
}

function h(tag: string, cls: string, ...kids: (Node | string)[]): HTMLElement {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.append(...kids);
  return el;
}

function buildCards(layer: HTMLElement, r: DanceResult): HTMLElement {
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const card = (name: string, v: number, cls: string) => h('div', `nova-card ${cls}`, h('div', 'back', h('b', '', '?')), h('div', 'front', h('small', '', name), h('b', '', fmt(v))));
  const el = h('div', 'nova-cards', card('Tempo', r.cards.tempo, 'tempo'), card('Groove', r.cards.groove, 'groove'), card('Sparkle', r.cards.sparkle, 'sparkle'), h('div', 'nova-total', h('small', '', 'Judges'), h('b', '', `${fmt(r.cards.total)} / 30`)));
  layer.appendChild(el);
  return el;
}
