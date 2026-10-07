// The hub's challenges. "Wake it up" teaches the kick with five orbs and no
// clock. The feeding frenzy is 60 seconds of a fixed orb schedule (the same
// for everyone, so the board is fair): plain orbs, shy gold ones and big
// moonballs that need two kicks. Each swallow plays the next note of a riff.

import * as THREE from 'three';
import { api } from '../../../net/api';
import { FRENZY_SECONDS, HUB, ORB_POINTS, THRESHOLDS, frenzySchedule, novaFor, starsFor, type FrenzyOrb } from '../../../shared/galaxy-rules';
import type { PlayerState } from '../../../world/space';
import { gsfx, FRENZY_SONG } from '../audio';
import { shortRound, type Galaxy } from '../index';
import type { Orb } from '../orbs';
import type { Round } from './round';

const WAKE_SPOTS: [number, number][] = [
  [0, 2.5],
  [-2.5, -8.5],
  [3, -9.5],
  [6.5, -7.5],
  [-5.5, -6],
];

export class Wake implements Round {
  readonly id = 'wake' as const;
  readonly boarded = false;
  private fed = 0;
  private spawned = 0;
  private wait = 0;

  constructor(private g: Galaxy) {
    g.orbs.clear();
    this.next();
    this.next();
    g.hud.strip([{ id: 'fed', label: 'Wake it up', value: '0 / 5' }]);
    g.hud.objective('Kick the orbs into the black hole');
  }

  private next(): void {
    if (this.spawned >= 5) return;
    const [x, z] = WAKE_SPOTS[this.spawned++];
    this.g.orbs.spawn(x, z, 'plain', this.spawned <= 1);
  }

  holdsTime(): boolean {
    return false;
  }

  swallowed(o: Orb): boolean {
    void o;
    this.fed++;
    gsfx.gulp(this.fed - 1);
    this.g.hud.set('fed', `${this.fed} / 5`);
    this.g.hud.judge(this.fed < 5 ? 'Gulp!' : 'Burp!', '#f4b740');
    this.wait = 0.8;
    if (this.fed >= 5) {
      this.g.hud.objective('Uh oh. It is going to burp');
      setTimeout(() => {
        if (this.g.round !== this) return;
        this.g.burpWakeStar();
        this.g.endRound();
      }, 1100);
    }
    return true;
  }

  step(dt: number, p: PlayerState): void {
    void p;
    // Keep two orbs on the hub until five are in.
    if (this.wait > 0) this.wait -= dt;
    else if (this.g.orbs.onHub < 2 && this.spawned < 5 && this.fed + this.g.orbs.live.length < 5) {
      this.next();
      this.wait = 0.5;
    }
    // Orbs that rolled away and got lost come back.
    if (this.g.orbs.live.length === 0 && this.fed < 5 && this.spawned >= 5) {
      this.spawned = this.fed;
      this.next();
    }
  }

  update(): void {}

  guide(): { at: THREE.Vector3; label: string } | null {
    const p = this.g.playerPos;
    let best: Orb | null = null;
    let bd = Infinity;
    for (const o of this.g.orbs.list) {
      if (o.state !== 'ground') continue;
      const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best ? { at: best.pos.clone(), label: 'Orb' } : null;
  }

  dispose(): void {}

  debug() {
    return { fed: this.fed };
  }
}

type FrenzyState = 'intro' | 'countdown' | 'run' | 'closing' | 'done';

export class Frenzy implements Round {
  readonly id = 'frenzy' as const;
  readonly boarded = true;
  private state: FrenzyState = 'intro';
  private t = 0;
  private score = 0;
  private schedule: FrenzyOrb[] = frenzySchedule();
  private next = 0;
  private streak = 0;
  private lastSwallow = -9;
  private riff = 0;
  private seconds = shortRound(FRENZY_SECONDS);
  private fedOrbs = 0;

  constructor(private g: Galaxy) {
    g.orbs.clear();
    g.hud.objective(null);
    g.playSong(FRENZY_SONG);
    // Face the black hole from the middle of the hub.
    g.ctx.teleport(0, 1.5, Math.PI - 0.36);
    void g.hud
      .intro({
        key: 'galaxy-frenzy',
        title: 'Feeding frenzy',
        tagline: 'Sixty seconds. Feed it everything.',
        tips: [
          { keys: ['interact', 'kick'], touch: 'Kick', text: 'Kick orbs off the edge' },
          { keys: ['move'], text: 'Gold orbs are shy and worth 3' },
          { keys: ['interact'], touch: 'Kick', text: 'Moonballs need two kicks and are worth 5' },
        ],
      })
      .then(() => this.countdown());
  }

  private countdown(): void {
    if (this.g.round !== this) return;
    this.state = 'countdown';
    this.g.hud.strip([
      { id: 'score', label: 'Fed', value: '0' },
      { id: 'time', label: 'Time', value: String(this.seconds) },
      { id: 'streak', label: 'Streak', value: '-' },
    ]);
    void this.g.hud.countdown(3, { go: 'Feed it!' }).then(() => {
      if (this.g.round !== this) return;
      this.state = 'run';
      this.t = 0;
    });
  }

  holdsTime(): boolean {
    return this.state === 'countdown' || this.state === 'run' || this.state === 'closing';
  }

  swallowed(o: Orb): boolean {
    if (!o.scored || (this.state !== 'run' && this.state !== 'closing')) return false;
    const pts = ORB_POINTS[o.kind];
    this.score += pts;
    this.fedOrbs++;
    const now = this.t;
    this.streak = now - this.lastSwallow < 1.5 ? this.streak + 1 : 1;
    this.lastSwallow = now;
    gsfx.gulp(this.riff++);
    this.g.hole.heat = Math.min(1, 0.1 * this.streak);
    this.g.hud.set('score', String(this.score), { tone: 'good' });
    this.g.hud.set('streak', this.streak > 1 ? `x${this.streak}` : '-', { tone: this.streak > 3 ? 'hot' : null });
    this.g.hud.pop(`+${pts}`, { x: this.g.hole.centre.x, y: this.g.hole.centre.y + this.g.hole.radius + 1, z: this.g.hole.centre.z }, { color: o.kind === 'gold' ? '#f4b740' : o.kind === 'moon' ? '#e8e4ff' : '#53f0c0', size: 2.2, life: 1.1, rise: 4 });
    if (this.streak >= 4 && this.streak % 2 === 0) this.g.hud.judge(`Streak x${this.streak}`, '#f4b740');
    return true;
  }

  step(dt: number, p: PlayerState): void {
    void p;
    if (this.state === 'run') {
      this.t += dt;
      while (this.next < this.schedule.length && this.schedule[this.next].t <= this.t) {
        const o = this.schedule[this.next++];
        this.g.orbs.spawn(o.x, o.z, o.kind, false, true);
      }
      const left = Math.max(0, this.seconds - this.t);
      this.g.hud.set('time', String(Math.ceil(left)), { bump: false, tone: left < 10 ? 'bad' : null });
      this.g.hud.bar('time', left / this.seconds, left < 10 ? '#e8574a' : '#53f0c0');
      if (left <= 0) {
        this.state = 'closing';
        this.t = 0;
        this.g.hud.banner('Time!', { color: '#fffaf0', size: 'l' });
        // Orbs still on the hub no longer count.
        for (const o of this.g.orbs.list) if (o.state !== 'fly') o.scored = false;
      }
    } else if (this.state === 'closing') {
      this.t += dt;
      const flying = this.g.orbs.list.some((o) => o.scored && o.state === 'fly');
      if (!flying || this.t > 3) void this.finish();
    }
  }

  private async finish(): Promise<void> {
    if (this.state === 'done') return;
    this.state = 'done';
    const g = this.g;
    g.hud.bar('time', null);
    g.orbs.clear();
    const score = this.score;
    const stars = starsFor('frenzy', score);
    const prevBest = g.save.data.best.frenzy;
    const isBest = prevBest === null || score > prevBest;
    if (isBest) g.save.update((d) => (d.best.frenzy = score));
    g.ctx.pose('cheer');
    const posted = await api.frenzy(g.ctx.roomId, g.ctx.area.id, g.ctx.browserId, g.ctx.name(), score);
    if (posted.ok) await g.loadBoards();
    else g.paintBoards();
    if (g.round !== this) return;
    const badges: string[] = [];
    if (isBest && score > 0) badges.push('New best!');
    if (g.save.data.bloomed && novaFor('frenzy', score)) badges.push('Nova!');
    const choice = await g.hud.results({
      title: stars >= 3 ? 'What a feast' : stars >= 1 ? 'Well fed' : 'Still hungry',
      subtitle: `${this.fedOrbs} orbs, ${score} points`,
      stars,
      badges,
      rows: [
        { label: 'Points', value: String(score), best: isBest },
        { label: 'Your best', value: String(Math.max(score, prevBest ?? 0)) },
        { label: 'Next star', value: stars >= 3 ? 'All three!' : `${THRESHOLDS.frenzy.stars[stars]} points` },
      ],
      board: { title: 'Best feeds here', rows: g.boards.frenzy.slice(0, 5).map((r) => ({ name: r.name, value: String(r.value), you: r.you })) },
      buttons: [
        { id: 'again', label: 'Play again', primary: true },
        { id: 'done', label: 'Done' },
      ],
    });
    g.ctx.pose(null);
    const fresh = g.award('frenzy', stars);
    g.endRound();
    await g.feedStars(fresh, new THREE.Vector3(HUB.shrine.x, 2.5, HUB.shrine.z), 'frenzy');
    g.paintBoards();
    if (choice === 'again') g.startRound(new Frenzy(g));
  }

  update(): void {}

  guide(): { at: THREE.Vector3; label: string } | null {
    if (this.state !== 'run') return null;
    // The best orb to go for: big ones first, then the nearest.
    const p = this.g.playerPos;
    let best: Orb | null = null;
    let score = -Infinity;
    for (const o of this.g.orbs.list) {
      if (o.state !== 'ground' || !o.scored) continue;
      const s = ORB_POINTS[o.kind] * 2 - Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
      if (s > score) {
        score = s;
        best = o;
      }
    }
    return best ? { at: best.pos.clone(), label: '' } : null;
  }

  dispose(): void {
    this.g.hud.bar('time', null);
    this.g.hole.heat = 0;
  }

  debug() {
    return { state: this.state, t: this.t, score: this.score, next: this.next, total: this.schedule.length };
  }
}
