// Brass Band Bash: one-button rhythm on the bandstand. Your toots play the
// tuba part, in tune, in your toot voice. The Maestro points his baton at you
// for your notes and the music leaves a gap for each one; a sheet-music strip
// shows the same notes. Judged on the music's own clock, with a rhythm check
// for screens and speakers that run late.

import * as THREE from 'three';
import { music } from '../../../audio/music';
import { button, h, type Panel } from '../../../ui/ui';
import type { Action } from '../../../input/input';
import type { CameraShot, CaptureLabels } from '../../../world/space';
import { bandBeans, CHARTS, GOOD_MS, judge, scoreBand, shortChart, type Chart, type SongId } from '../../../shared/fart/charts';
import { BANDSTAND } from '../layout';
import { bandSong, CALIBRATE_SONG } from '../songs';
import { fx, toot, tootHeld, type Voice } from '../toots';
import type { Trial, TrialWorld } from './trial';

const OCTAVE: Record<Voice, number> = { classic: 1, duck: 4, kazoo: 2, trombone: 2, horn: 2, opera: 4, golden: 2 };
const PRESSES: Action[] = ['interact', 'kick', 'jump'];

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export class BandBash implements Trial {
  readonly id = 'band' as const;
  readonly tooting = false;
  private phase: 'pick' | 'intro' | 'calibrate' | 'play' | 'done' = 'pick';
  private chart: Chart;
  private song: SongId = 'march';
  private hits: (number | null)[] = [];
  private held: number[] = [];
  private judged: boolean[] = [];
  private combo = 0;
  private maxCombo = 0;
  private holding: { i: number; src: Action; sound: { stop(): void } } | null = null;
  private sheet: HTMLElement;
  private noteEls: HTMLElement[] = [];
  private ticket: Promise<string | null> = Promise.resolve(null);
  private started = false;
  private lastCount = -1;
  private cal: number[] = [];
  private calBeat = -1;
  private calibrateOnly: boolean;
  private short: boolean;
  private tuba: THREE.Group;
  private milestones = new Set<number>();

  constructor(
    private w: TrialWorld,
    opts: Record<string, unknown>,
  ) {
    this.calibrateOnly = !!opts.calibrate;
    this.short = !!opts.short;
    this.chart = CHARTS.march;
    // On the bandstand, beside the clarinet, facing the Maestro.
    const a = Math.PI * 1.72;
    const px = BANDSTAND.x + Math.cos(a) * 2.3;
    const pz = BANDSTAND.z + Math.sin(a) * 2.3;
    w.ctx.teleport(px, pz, Math.atan2(-10.5 - px, -6 - pz), BANDSTAND.floor);
    w.mover.reset();
    // Hand the player a little tuba.
    this.tuba = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({ color: 0xf2b33d, metalness: 0.6, roughness: 0.3, emissive: 0x5a3a00, emissiveIntensity: 0.3 });
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 16), brass);
    coil.rotation.y = Math.PI / 2;
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.05, 0.32, 16, 1, true), brass);
    bell.position.set(0, 0.28, -0.06);
    this.tuba.add(coil, bell);
    w.ctx.hold(this.tuba);
    this.sheet = h('div', { class: 'pf-sheet hidden' }, h('div', { class: 'now' }));
    w.ph.root.appendChild(this.sheet);
    w.ph.trial(true);
    void this.begin();
  }

  private async begin(): Promise<void> {
    const w = this.w;
    if (this.calibrateOnly) {
      this.calibrate();
      return;
    }
    const polka = w.save.trials.band.beans >= 1;
    this.song = polka ? await this.pick() : 'march';
    this.chart = this.short ? shortChart(this.song) : CHARTS[this.song];
    this.phase = 'intro';
    await w.hud.intro({
      key: 'fart-band',
      title: 'Brass Band Bash',
      tagline: 'Your toots play the tuba part. Toot on the notes!',
      tips: [
        { keys: ['kick'], touch: 'Toot', text: 'Toot when a note reaches the red line, or when the Maestro points at you.' },
        { keys: ['kick'], touch: 'Toot', text: 'Long notes: hold until the green tail ends.' },
        { keys: ['interact'], touch: 'Toot', text: 'A red X is a rest: keep quiet!' },
      ],
      button: 'Strike up the band',
    });
    if (!w.save.calibrated) {
      this.calibrate();
      return;
    }
    this.play();
  }

  private pick(): Promise<SongId> {
    return new Promise((resolve) => {
      const ui = this.w.ctx.ui;
      let choice: SongId = 'march';
      const b1 = button('Puffington March (easy)', () => {
        choice = 'march';
        ui.close(panel);
      }, 'primary');
      const b2 = button('Polka Dots (faster)', () => {
        choice = 'polka';
        ui.close(panel);
      }, 'ghost');
      const panel: Panel = {
        el: h('div', { class: 'card pf-card' }, h('h2', {}, 'Pick a song'), h('p', { class: 'pf-small' }, 'Maestro Oompah taps his baton.'), h('div', { class: 'actions' }, b1, b2)),
        onBack: () => ui.close(panel),
        onClose: () => resolve(choice),
        initial: () => b1,
      };
      ui.open(panel);
    });
  }

  /** The rhythm check: toot with the drum eight times; the median sets your offset. */
  private calibrate(): void {
    this.phase = 'calibrate';
    this.cal = [];
    this.calBeat = -1;
    music.play(CALIBRATE_SONG, { fadeIn: 0.1 });
    this.w.hud.objective('Rhythm check: toot with the drum, 8 times');
    this.w.hud.banner('Toot with the drum!', { size: 'm', ms: 1800 });
  }

  private calibrated(): void {
    const sorted = [...this.cal].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
    this.w.save.offset = Math.max(-0.3, Math.min(0.3, med));
    this.w.save.calibrated = true;
    this.w.saveNow();
    music.stop(0.2);
    this.w.hud.objective(null);
    this.w.ctx.ui.toast(`Rhythm check done: ${Math.round(med * 1000)} ms.`, 'good', 2400);
    if (this.calibrateOnly) {
      this.phase = 'done';
      setTimeout(() => this.w.endTrial(), 600);
      return;
    }
    setTimeout(() => this.play(), 900);
  }

  private play(): void {
    const w = this.w;
    const c = this.chart;
    this.hits = c.notes.map(() => null);
    this.held = c.notes.map(() => 0);
    this.judged = c.notes.map((n) => n.kind === 'rest');
    this.combo = 0;
    this.maxCombo = 0;
    this.milestones.clear();
    this.ticket = this.short ? Promise.resolve(null) : w.boards.ticket(this.song === 'march' ? 'band-march' : 'band-polka');
    w.hud.strip([
      { id: 'score', label: 'Score', value: '0' },
      { id: 'combo', label: 'Combo', value: '0' },
      { id: 'song', label: 'Song', value: c.name, wide: true },
    ]);
    // Sheet music strip.
    this.noteEls = c.notes.map((n) => {
      const el = h('div', { class: `note ${n.kind === 'hold' ? 'hold' : ''} ${n.kind === 'rest' ? 'rest' : ''} ${n.call ? 'call' : ''}` }, n.kind === 'rest' ? 'X' : '');
      if (n.kind === 'hold') el.style.setProperty('--len', `${n.len * 70}px`);
      this.sheet.appendChild(el);
      return el;
    });
    this.sheet.classList.remove('hidden');
    music.play(bandSong(this.song), { fadeIn: 0.05 });
    music.filter(20000, 0.1);
    this.started = true;
    this.phase = 'play';
    this.lastCount = -1;
  }

  holdsTime(): boolean {
    return this.phase === 'play' || this.phase === 'calibrate';
  }

  captureInput(): CaptureLabels | null {
    if (this.phase === 'play' || this.phase === 'calibrate') return { action: 'Toot', kick: 'Toot', jump: null, prompt: this.phase === 'play' ? 'Toot on the notes' : 'Toot with the drum' };
    return { action: null, kick: null, jump: null, prompt: null };
  }

  cameraShot(): CameraShot | null {
    // Portrait screens are narrow: frame you and the Maestro rather than the whole stand.
    if (innerWidth < innerHeight) return { position: new THREE.Vector3(-6.4, 3.0, -11.4), target: new THREE.Vector3(-10.9, 1.5, -7.0), fov: 62, blend: 1 };
    return { position: new THREE.Vector3(-5.6, 3.3, -10.6), target: new THREE.Vector3(-12.3, 1.7, -6.2), fov: 52, blend: 1 };
  }

  /** The heard beat at the moment of a press (event time), with your offset. */
  private beatAt(pressedAt: number | null, withOffset = true): number {
    const now = performance.now();
    const bpm = music.tempoBpm;
    const late = pressedAt !== null ? Math.max(0, now - pressedAt) / 1000 : 0;
    return music.beat() - late * (bpm / 60) - (withOffset ? this.w.save.offset * (bpm / 60) : 0);
  }

  step(): void {
    const input = this.w.ctx.input;
    if (this.phase === 'calibrate') {
      for (const a of PRESSES) {
        if (!input.take(a)) continue;
        const b = this.beatAt(input.pressedAt(a), false);
        if (b < 1.5) continue;
        const off = ((b - Math.round(b)) * 60) / music.tempoBpm;
        this.cal.push(off);
        toot({ gas: 'beans', size: 'note', voice: this.w.save.voice, pitch: hz(46) * OCTAVE[this.w.save.voice], dur: 0.2, gain: 0.8 });
        this.w.hud.judge(`${this.cal.length}/8`, '#ffd24a');
        if (this.cal.length >= 8) this.calibrated();
      }
      return;
    }
    if (this.phase !== 'play') {
      for (const a of PRESSES) input.take(a);
      return;
    }
    const beatSec = 60 / this.chart.bpm;
    for (const a of PRESSES) {
      if (!input.take(a)) continue;
      this.press(a, this.beatAt(input.pressedAt(a)), beatSec);
    }
    // Holding a long note.
    const hd = this.holding;
    if (hd) {
      const n = this.chart.notes[hd.i];
      const b = this.beatAt(null);
      const end = n.beat + n.len;
      if (!input.isHeld(hd.src) || b >= end) {
        this.held[hd.i] = Math.max(0, Math.min(n.len, b - n.beat));
        hd.sound.stop();
        this.holding = null;
        if (b >= end - 0.15) {
          this.held[hd.i] = n.len;
          this.w.hud.judge('Held!', '#8fd14f');
        }
      } else this.held[hd.i] = Math.max(0, Math.min(n.len, b - n.beat));
    }
  }

  private presses: string[] = [];

  private press(src: Action, beat: number, beatSec: number): void {
    this.presses.push(`${src}@${beat.toFixed(3)}`);
    if (this.presses.length > 12) this.presses.shift();
    const c = this.chart;
    const voice = this.w.save.voice;
    // The nearest note still to judge.
    let best = -1;
    let bestOff = Infinity;
    c.notes.forEach((n, i) => {
      if (this.judged[i] || n.kind === 'rest') return;
      const off = (beat - n.beat) * beatSec * 1000;
      if (Math.abs(off) < Math.abs(bestOff)) {
        bestOff = off;
        best = i;
      }
    });
    if (best >= 0 && Math.abs(bestOff) <= GOOD_MS) {
      const n = c.notes[best];
      this.judged[best] = true;
      this.hits[best] = Math.round(bestOff);
      const j = judge(bestOff);
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const pitch = hz(n.midi) * OCTAVE[voice];
      if (n.kind === 'hold') {
        this.holding = { i: best, src, sound: tootHeld({ gas: 'beans', size: 'note', voice, pitch, dur: n.len * beatSec + 0.05 }) };
      } else toot({ gas: 'beans', size: 'note', voice, pitch, dur: Math.min(0.32, beatSec * 0.7) });
      this.w.hud.judge(j === 'perfect' ? 'Perfect' : 'Good', j === 'perfect' ? '#ffd24a' : '#8fd14f');
      this.noteEls[best]?.classList.add('hit');
      this.w.vil.bandReact(j === 'perfect' ? 'nod' : 'nod');
      const p = this.w.player();
      if (p && j === 'perfect') this.w.sparks.burst({ at: { x: p.x, y: p.y + 1.6, z: p.z }, count: 10, speed: [1, 3], color: [0xffd24a, 0xfff3b0], size: [0.06, 0.12], life: [0.3, 0.6], drag: 2 });
      if (p) this.w.cloudFx.burst('beans', { x: p.x, y: p.y + 1.2, z: p.z }, 3, { speed: 1.2, size: 0.14, dir: { x: 0, y: 0.6, z: 0 } });
      this.milestone();
      return;
    }
    // Tooting in a rest breaks it.
    const restI = c.notes.findIndex((n) => n.kind === 'rest' && beat >= n.beat - 0.1 && beat <= n.beat + n.len);
    if (restI >= 0 && this.hits[restI] === null) {
      this.hits[restI] = 1;
      this.combo = 0;
      fx.bonk();
      this.w.hud.judge('Shh! A rest!', '#e8574a');
      this.w.vil.bandReact('frown');
      return;
    }
    // A stray toot: a flat little note.
    toot({ gas: 'beans', size: 'note', voice, pitch: hz(c.bars[0].root) * OCTAVE[voice] * 0.94, dur: 0.12, gain: 0.5 });
  }

  private milestone(): void {
    for (const m of [10, 25, 50]) {
      if (this.combo >= m && !this.milestones.has(m)) {
        this.milestones.add(m);
        fx.cheer();
        this.w.hud.banner(`${m} combo!`, { size: 'm', ms: 1100, color: '#ffd24a' });
        this.w.confetti.burst({ at: { x: BANDSTAND.x, y: 5, z: BANDSTAND.z }, count: m >= 25 ? 120 : 60, shape: 'up', speed: [3, 7], color: [0xffd24a, 0xe8574a], size: [0.1, 0.18], life: [1.5, 2.5], gravity: 5, drag: 1.2, sizeEnd: 1 });
      }
    }
  }

  update(): void {
    if (this.phase === 'calibrate') {
      const b = music.beat();
      const bi = Math.floor(b);
      if (bi !== this.calBeat && b >= 0) {
        this.calBeat = bi;
        this.w.vil.bandReact('beat');
      }
      return;
    }
    if (this.phase !== 'play') return;
    const beat = music.beat();
    const c = this.chart;
    const beatSec = 60 / c.bpm;
    // Count in on the second bar.
    const ci = Math.floor(beat);
    if (ci !== this.lastCount && ci >= 4 && ci < 8) {
      this.lastCount = ci;
      this.w.hud.banner(String(ci - 3), { size: 'xl', ms: 450, color: '#fff7e6' });
    }
    // Misses.
    c.notes.forEach((n, i) => {
      if (this.judged[i]) return;
      if ((beat - n.beat) * beatSec * 1000 > GOOD_MS) {
        this.judged[i] = true;
        this.combo = 0;
        this.w.hud.judge('Miss', '#c8bfae');
        this.noteEls[i]?.classList.add('miss');
        this.w.vil.bandReact('frown');
      }
    });
    // The Maestro points at you when your note is coming.
    const next = c.notes.find((n, i) => !this.judged[i] && n.kind !== 'rest' && n.beat - beat < 0.75 && n.beat - beat > -0.2);
    const rest = c.notes.find((n) => n.kind === 'rest' && beat >= n.beat - 0.5 && beat <= n.beat + n.len);
    this.w.vil.maestroCue(next ? 'point' : rest ? 'palm' : null);
    // Sheet strip.
    const w = this.sheet.clientWidth || 560;
    const px = Math.max(48, Math.min(90, w / 7));
    c.notes.forEach((n, i) => {
      const el = this.noteEls[i];
      const x = w * 0.18 + (n.beat - beat) * px;
      const show = x > -40 && x < w + 40;
      el.style.display = show ? '' : 'none';
      if (!show) return;
      const rel = n.kind === 'rest' ? 0 : (n.midi - c.bars[0].root) % 12;
      el.style.left = `${x}px`;
      el.style.top = `${n.kind === 'rest' ? 26 : 40 - rel * 2.2}px`;
      if (n.kind === 'hold') el.style.setProperty('--len', `${n.len * px}px`);
    });
    this.w.hud.set('score', scoreBand(c, { hits: this.hits, held: this.held }).score.toLocaleString('en-US'), { bump: false });
    this.w.hud.set('combo', String(this.combo), { tone: this.combo >= 10 ? 'hot' : null });
    if (beat > c.beats + 0.4 && this.started) void this.finish();
  }

  private async finish(): Promise<void> {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.holding?.sound.stop();
    this.holding = null;
    music.stop(1.2);
    this.w.vil.maestroCue(null);
    const w = this.w;
    const c = this.chart;
    const result = scoreBand(c, { hits: this.hits, held: this.held });
    const beans = bandBeans(result.accuracy);
    const pct = Math.round(result.accuracy * 100);
    this.sheet.classList.add('hidden');
    if (beans >= 1) {
      fx.fanfare();
      fx.cheer();
      w.confetti.burst({ at: { x: BANDSTAND.x, y: 6, z: BANDSTAND.z }, count: 160, shape: 'up', speed: [3, 8], color: [0xffd24a, 0xe8574a], size: [0.1, 0.2], life: [1.8, 2.8], gravity: 5, drag: 1.1, sizeEnd: 1 });
      w.ctx.pose('cheer');
    } else fx.sadTrombone();
    w.hud.banner(beans >= 3 ? 'Bravissimo!' : beans >= 1 ? 'Bravo!' : 'Keep practising!', { sub: `${pct}% in tune`, size: 'xl', ms: 1800 });
    const full = !this.short;
    const hadPolka = w.save.trials.band.beans >= 1;
    let res = { newBeans: 0, newBest: false };
    if (this.song === 'march') res = w.trialBeans('band', full ? beans : 0, full ? result.score : null, 'higher');
    else if (full) {
      const s = w.save.polka;
      res = { newBeans: 0, newBest: s.best === null || result.score > s.best };
      s.beans = Math.max(s.beans, beans);
      s.plays++;
      if (res.newBest) s.best = result.score;
      w.saveNow();
    }
    const mode = this.song === 'march' ? 'band-march' : 'band-polka';
    const ticket = await this.ticket;
    const posted = full ? await w.boards.post(mode, result.score, ticket, { song: this.song, hits: this.hits, held: this.held }) : null;
    await new Promise((r) => setTimeout(r, 1300));
    w.ctx.pose(null);
    const choice = await w.hud.results({
      title: beans >= 1 ? 'Bravo!' : 'The band plays on',
      subtitle: `${c.name}: ${pct}% in tune`,
      stars: beans,
      rows: [
        { label: 'Score', value: result.score.toLocaleString('en-US'), best: res.newBest },
        { label: 'Perfect', value: String(result.perfect) },
        { label: 'Good', value: String(result.good) },
        { label: 'Missed', value: String(result.miss) },
        { label: 'Best combo', value: String(result.maxCombo) },
      ],
      badges: [...(res.newBest ? ['New best!'] : []), ...(res.newBeans ? [`+${res.newBeans} golden bean${res.newBeans > 1 ? 's' : ''}`] : []), ...(!hadPolka && w.save.trials.band.beans >= 1 ? ['Polka Dots unlocked'] : []), ...(posted?.rank ? [`Number ${posted.rank} on the board`] : [])],
      board: { title: posted?.error ? `Top tooters (${posted.error})` : this.song === 'march' ? 'Top tooters' : 'Polka Dots', rows: posted?.rows ?? w.boards.rows(mode) },
      buttons: [
        { id: 'again', label: 'Play again', primary: true },
        { id: 'next', label: 'Next: Rocket Rings' },
        { id: 'leave', label: 'Back to the fete' },
      ],
    });
    w.ctx.teleport(-8.3, -2.6, Math.PI * 0.25);
    w.endTrial(choice === 'again' ? 'again' : choice === 'next' ? 'rings' : undefined);
  }

  dispose(): void {
    this.holding?.sound.stop();
    this.w.ctx.hold(null);
    this.tuba.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.sheet.remove();
    this.w.vil.maestroCue(null);
    this.w.hud.objective(null);
    this.w.ctx.pose(null);
  }

  /** Playtests: the eight-note chart. */
  debugShort(): void {
    this.short = true;
    this.chart = shortChart(this.song);
  }

  debug(): Record<string, unknown> {
    const c = this.chart;
    const beat = music.beat();
    const nextI = c.notes.findIndex((n, i) => !this.judged[i] && n.kind !== 'rest');
    const next = nextI >= 0 ? c.notes[nextI] : null;
    const r = this.hits.length ? scoreBand(c, { hits: this.hits, held: this.held }) : null;
    return {
      phase: this.phase,
      song: this.song,
      beat: +beat.toFixed(3),
      bpm: c.bpm,
      notes: c.notes.length,
      next: next ? { i: nextI, beat: next.beat, kind: next.kind, in: +((next.beat - beat) * (60 / c.bpm)).toFixed(3) } : null,
      combo: this.combo,
      result: r,
      cal: this.cal.length,
      offset: this.w.save.offset,
      hits: this.hits,
      presses: this.presses,
      chart: c.notes.map((n) => ({ beat: n.beat, kind: n.kind, len: n.len })),
    };
  }
}
