// Ring run: two laps of Ringworld's ring, through 16 gates a lap that swap
// sides on the second. Blossoms fling you over the gaps and comet lanes
// whisk you along; a missed gate costs two seconds. The server rebuilds the
// time from the gate splits (ringFromLog), so a board time is a real run.

import * as THREE from 'three';
import { api } from '../../../net/api';
import { MISS_PENALTY_MS, RING, RING_FINISH_S, RING_START_S, RING_THETA0, crossesGate, novaFor, ringGates, ringPoint, starsFor, THRESHOLDS, type Gate, type RingLog } from '../../../shared/galaxy-rules';
import type { Carry, PlayerState } from '../../../world/space';
import { formatLap, ordinal } from '../../common';
import { gsfx, RING_SONG } from '../audio';
import type { Galaxy } from '../index';
import type { GateState } from '../islands';
import type { Round } from './round';

type State = 'intro' | 'countdown' | 'run' | 'done';

export class RingRun implements Round {
  readonly id = 'ring' as const;
  readonly boarded = true;
  private state: State = 'intro';
  private t = 0;
  private gates: Gate[] = ringGates();
  private next = 0;
  private splits: number[] = [];
  private hits: number[] = [];
  private chain = 0;
  private prev: { x: number; z: number } | null = null;
  private ticket: Promise<string | null> | null = null;
  private flash: number[] = Array(16).fill(0);
  private startSpot: { x: number; y: number; z: number; yaw: number };
  private finishMs = 0;

  constructor(private g: Galaxy) {
    const p = ringPoint(RING_START_S, RING.mid);
    const th = RING_THETA0 - (RING_START_S * Math.PI) / 180;
    this.startSpot = { x: p.x, y: RING.top, z: p.z, yaw: Math.atan2(Math.sin(th), -Math.cos(th)) };
    g.ctx.teleport(p.x, p.z, this.startSpot.yaw, RING.top);
    g.ring.setGates(0, this.gateStates());
    void g.hud
      .intro({
        key: 'galaxy-ring',
        title: 'Ring run',
        tagline: 'Two laps round the planet. Every gate, as fast as you can.',
        tips: [
          { keys: ['move'], text: 'Run through every gate. A miss costs 2 seconds' },
          { keys: ['move'], text: 'Flowers fling you over the gaps' },
          { keys: ['move'], text: 'Glowing lanes whisk you along' },
        ],
      })
      .then(() => this.countdown());
  }

  private countdown(): void {
    if (this.g.round !== this) return;
    this.state = 'countdown';
    this.g.hud.strip([
      { id: 'time', label: 'Time', value: '0:00.00', wide: true },
      { id: 'gates', label: 'Gates', value: `0/${this.gates.length}` },
      { id: 'lap', label: 'Lap', value: '1/2' },
    ]);
    void this.g.hud.countdown(3).then(() => {
      if (this.g.round !== this) return;
      this.state = 'run';
      this.t = 0;
      this.prev = null;
      this.g.playSong(RING_SONG);
      this.ticket = api.runStart(this.g.ctx.roomId, this.g.ctx.area.id, this.g.ctx.browserId, 'ring').then((r) => (r.ok ? r.data.ticket : null));
    });
  }

  holdsTime(): boolean {
    return this.state === 'countdown' || this.state === 'run';
  }

  /** Hold still on the start line during the countdown. */
  carry(_h: number, p: PlayerState): Carry | null {
    void p;
    if (this.state !== 'intro' && this.state !== 'countdown') return null;
    const s = this.startSpot;
    return { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pose: 'crouch', speed: 0 };
  }

  private gateStates(): GateState[] {
    const lap = this.next >= 16 ? 1 : 0;
    return Array.from({ length: 16 }, (_, i) => {
      const gi = lap * 16 + i;
      if (this.flash[i] > 0) return this.hits[gi] === 0 ? 'miss' : 'hit';
      if (gi < this.next) return this.hits[gi] === 0 ? 'miss' : 'done';
      if (gi === this.next) return 'next';
      return 'idle';
    });
  }

  step(dt: number, p: PlayerState): void {
    for (let i = 0; i < 16; i++) this.flash[i] = Math.max(0, this.flash[i] - dt);
    if (this.state !== 'run') return;
    this.t += dt;
    const cur = { x: p.x, z: p.z };
    const onRing = Math.abs(p.y - RING.top) < 3.5;
    if (this.prev && onRing) {
      if (this.next < this.gates.length) {
        const gate = this.gates[this.next];
        const r = crossesGate(this.prev, cur, gate);
        if (r && this.withinGateHeight(p, r)) this.pass(gate, r);
      } else {
        const finish: Gate = { s: RING_FINISH_S, lap: 1, side: 'in', r0: RING.inner - 1, r1: RING.outer + 1 };
        if (crossesGate(this.prev, cur, finish)) void this.finish();
      }
    }
    this.prev = cur;
    this.g.hud.set('time', formatLap(this.t * 1000 + this.misses() * MISS_PENALTY_MS), { bump: false });
    this.g.ring.setGates(this.next >= 16 ? 1 : 0, this.gateStates());
  }

  private withinGateHeight(p: PlayerState, r: 'hit' | 'miss'): boolean {
    // A hop over a gate's line in the air still counts as passing its line, but only through the hoop is a hit.
    void r;
    return p.y >= RING.top - 0.5;
  }

  private misses(): number {
    return this.hits.filter((h) => h === 0).length;
  }

  private pass(gate: Gate, r: 'hit' | 'miss'): void {
    const ms = Math.round(this.t * 1000);
    this.splits.push(ms);
    const hit = r === 'hit';
    this.hits.push(hit ? 1 : 0);
    const i = this.next % 16;
    this.flash[i] = 0.6;
    this.next++;
    const mid = (gate.r0 + gate.r1) / 2;
    const at = ringPoint(gate.s, mid);
    const pos = { x: at.x, y: RING.top + 2.2, z: at.z };
    if (hit) {
      gsfx.gate(this.chain++);
      this.g.sparks.burst({ at: pos, count: 36, shape: 'sphere', speed: [3, 7], color: [0x7dffc8, 0xf4b740], size: [0.12, 0.25], life: [0.3, 0.7] });
      // Split against your best run.
      const best = this.g.save.data.ringSplits?.[this.splits.length - 1];
      if (best !== undefined) {
        const d = (ms - best) / 1000;
        this.g.hud.judge(`${d <= 0 ? '' : '+'}${d.toFixed(2)}`, d <= 0 ? '#7dffc8' : '#e8574a');
      }
    } else {
      this.chain = 0;
      gsfx.buzz();
      this.g.hud.judge('Missed a gate +2 s', '#e8574a');
      this.g.hud.flash('#e8574a', 220, 0.25);
    }
    this.g.hud.set('gates', `${this.hits.filter((x) => x).length}/${this.gates.length}`, { tone: hit ? 'good' : 'bad' });
    if (this.next === 16) {
      gsfx.lap();
      this.g.hud.banner('Final lap!', { color: '#7dffc8', sub: 'The gates swap sides', size: 'm' });
      this.g.hud.set('lap', '2/2');
      this.flash.fill(0);
    }
  }

  private async finish(): Promise<void> {
    if (this.state === 'done') return;
    this.state = 'done';
    const g = this.g;
    this.finishMs = Math.round(this.t * 1000);
    const misses = this.misses();
    const total = this.finishMs + misses * MISS_PENALTY_MS;
    const stars = starsFor('ring', total);
    const prevBest = g.save.data.best.ring;
    const isBest = prevBest === null || total < prevBest;
    if (isBest) g.save.update((d) => ((d.best.ring = total), (d.ringSplits = [...this.splits])));
    g.hud.banner('Finish!', { color: '#7dffc8', size: 'l' });
    gsfx.fanfare();
    g.ctx.pose('cheer');
    g.sparks.burst({ at: { x: this.g.player.x, y: RING.top + 1.5, z: this.g.player.z }, count: 80, speed: [3, 9], color: [0x7dffc8, 0xf4b740], size: [0.15, 0.3], life: [0.5, 1.1], gravity: 2 });
    const log: RingLog = { v: 1, splits: this.splits, hits: this.hits, finish: this.finishMs };
    const ticket = this.ticket ? await this.ticket : null;
    let posted = false;
    if (ticket) {
      const r = await api.score(g.ctx.roomId, g.ctx.area.id, g.ctx.browserId, g.ctx.name(), 'ring', total, { ticket, log });
      posted = r.ok;
      if (!r.ok) g.log(`ring post: ${r.error}`);
    }
    if (posted) await g.loadBoards();
    else g.paintBoards();
    if (g.round !== this) return;
    const badges: string[] = [];
    if (isBest) badges.push('New best!');
    if (misses === 0) badges.push('Every gate');
    if (g.save.data.bloomed && novaFor('ring', total)) badges.push('Nova!');
    if (!posted) badges.push('Not saved to the board');
    const next = THRESHOLDS.ring.stars[stars];
    g.podium(true);
    const rank = g.boards.ring.findIndex((r) => r.you);
    const choice = await g.hud.results({
      title: stars === 3 ? 'Ring master' : 'Two laps done',
      subtitle: misses ? `${misses} missed ${misses === 1 ? 'gate' : 'gates'}, +${(misses * MISS_PENALTY_MS) / 1000} s` : 'Clean run',
      stars,
      badges,
      rows: [
        ...(rank >= 0 ? [{ label: 'Board place', value: ordinal(rank + 1) }] : []),
        { label: 'Time', value: formatLap(total), best: isBest },
        { label: 'Your best', value: formatLap(Math.min(total, prevBest ?? total)) },
        { label: 'Next star', value: next === undefined ? 'All three!' : `Under ${formatLap(next)}` },
      ],
      board: { title: 'Fastest runs here', rows: g.boards.ring.slice(0, 5).map((r) => ({ name: r.name, value: formatLap(r.value), you: r.you })) },
      buttons: [
        { id: 'again', label: 'Run again', primary: true },
        { id: 'home', label: 'Fly home' },
        { id: 'stay', label: 'Stay here' },
      ],
    });
    g.ctx.pose(null);
    const fresh = g.award('ring', stars);
    g.endRound();
    await g.feedStars(fresh, new THREE.Vector3(g.player.x, RING.top + 2, g.player.z), 'ring');
    g.paintBoards();
    if (choice === 'again') g.startRound(new RingRun(g));
    else if (choice === 'home') g.fly('hub', 'ring');
  }

  checkpoint(): { x: number; y: number; z: number; yaw: number } | null {
    if (this.state !== 'run' || this.next === 0) return this.startSpot;
    const gate = this.gates[this.next - 1];
    const p = ringPoint(gate.s + 1.5, (gate.r0 + gate.r1) / 2);
    const th = RING_THETA0 - ((gate.s + 1.5) * Math.PI) / 180;
    return { x: p.x, y: RING.top, z: p.z, yaw: Math.atan2(Math.sin(th), -Math.cos(th)) };
  }

  update(): void {}

  guide(): { at: THREE.Vector3; label: string } | null {
    if (this.state !== 'run') return null;
    const gate = this.next < this.gates.length ? this.gates[this.next] : { s: RING_FINISH_S, r0: RING.mid, r1: RING.mid };
    const p = ringPoint(gate.s, (gate.r0 + gate.r1) / 2);
    return { at: new THREE.Vector3(p.x, RING.top + 0.6, p.z), label: '' };
  }

  dispose(): void {
    this.g.ring.setGates(0, Array(16).fill('idle'));
  }

  debug() {
    return { state: this.state, t: this.t, next: this.next, hits: this.hits.filter((h) => h).length, misses: this.misses(), finish: this.finishMs };
  }
}
