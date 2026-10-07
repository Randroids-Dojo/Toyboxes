// The party night director: Orbit's lineup, laser tag, a blade duel and the
// dance off back to back with warps between venues, one retry per event,
// a save to come back to, and the podium at the end.

import * as THREE from 'three';
import { button, h, type Panel } from '../../ui/ui';
import { BASES, spawnPoints } from '../../shared/neon/arena';
import type { Diff } from '../../shared/neon/charts';
import { duelist, type DuelistId } from '../../shared/neon/duel';
import { nightDanceStars, nightDef, nightDuelStars, nightTagStars, NIGHTS, scoreNight, type NightDef, type NightLog } from '../../shared/neon/night';
import { newUnlocks } from '../../shared/neon/progress';
import { SONGS, type SongId } from '../../shared/neon/songs';
import type { LayoutId } from '../../shared/neon/arena';
import type { TagDiff, TagLog } from '../../shared/neon/tag';
import { boardLine } from './boards';
import type { DanceOutcome } from './dance';
import type { DuelOutcome } from './duel';
import type { NightSave } from './save';
import { nova as snd } from './sounds';
import { DUEL_SPOT } from './station';
import type { TagOutcome } from './tag';
import { C, HEX } from './util';
import type { Nova } from './world';

export interface NightHost extends Nova {
  startTag(diff: TagDiff, layout: LayoutId, opts: { size?: 2 | 3 | 4; duration?: number; captain?: boolean; echo?: boolean }, hook: (o: TagOutcome) => void): void;
  startDuel(id: DuelistId, echo: boolean, now: boolean, hook: (o: DuelOutcome) => void): void;
  startDance(song: SongId, diff: Diff, now: boolean, hook: (o: DanceOutcome) => void, rival: string): void;
  night: NightRun | null;
  podium(on: boolean): void;
  refreshUnlocks(): void;
  tuneSync(errors: number[]): void;
}

const STAGES = ['Laser tag', 'Blade duel', 'Dance off'];
const RESUME_MS = 60 * 60 * 1000;

export class NightRun {
  readonly def: NightDef;
  private save: NightSave;
  private retried = [false, false, false];
  private stars = [0, 0, 0];

  constructor(
    private host: NightHost,
    n: number,
    resume: NightSave | null,
  ) {
    this.def = nightDef(n)!;
    this.save = resume ?? { n, stage: 0, scores: [], logs: [], at: Date.now(), ticket: null };
    host.night = this;
  }

  /** A saved night younger than an hour. */
  static resumable(s: NightSave | null): boolean {
    return !!s && Date.now() - s.at < RESUME_MS && s.stage > 0 && s.stage < 3;
  }

  async begin(): Promise<void> {
    const h = this.host;
    if (!this.save.ticket) void h.boards.start('night').then((t) => {
      this.save.ticket = t;
      this.persist();
    });
    this.persist();
    // Orbit scratches the record, the lights cut for a beat, the Core erupts.
    snd.scratch();
    h.hud.flash('#05030c', 500, 0.85);
    h.core.burst(1.6);
    h.crowd.cheerNow(2);
    h.post.pulse(1);
    await this.lineup();
  }

  private persist(): void {
    this.host.save.data.night = { ...this.save, at: Date.now() };
    this.host.save.save();
  }

  /** The lineup card: tonight's three events. */
  private lineup(): Promise<void> {
    const ui = this.host.ctx.ui;
    const d = this.def;
    return new Promise((resolve) => {
      const tiles = [
        `${d.tag.size} vs ${d.tag.size} laser tag`,
        `Duel ${duelist(d.duel).name}`,
        `Dance to ${SONGS[d.dance.song].name}`,
      ].map((text, i) => h('div', { class: `nova-tile${i < this.save.stage ? ' done' : i === this.save.stage ? ' next' : ''}` }, h('small', {}, STAGES[i]), h('b', {}, text), i < this.save.stage ? h('span', {}, `${this.save.scores[i]?.toLocaleString('en-US') ?? ''} points`) : null));
      let go = false;
      const start = button(this.save.stage ? 'Carry on' : "Let's go", () => {
        go = true;
        ui.close(panel);
      }, 'primary');
      const back = button('Not now', () => ui.close(panel), 'ghost');
      const panel: Panel = {
        el: h('div', { class: 'card xk-card xk-card-dark nova-menu nova-lineup' }, h('div', { class: 'xk-card-kicker' }, `${this.host.ctx.ownerName} presents · night ${d.n}`), h('h2', {}, d.name), h('p', { class: 'xk-tagline' }, `Points x${d.mult}. Each event can be tried again once.`), h('div', { class: 'nova-tiles' }, ...tiles), h('div', { class: 'actions' }, start, back)),
        onBack: () => ui.close(panel),
        onClose: () => {
          resolve();
          if (go) this.runStage();
          else this.leave();
        },
        initial: () => start,
      };
      ui.open(panel);
    });
  }

  private runStage(): void {
    const h = this.host;
    const d = this.def;
    const stage = this.save.stage;
    if (stage === 0) {
      this.warp(spawnPoints('cyan')[1], C.cyan, () => h.startTag(d.tag.diff, d.tag.layout, { size: d.tag.size, duration: d.tag.dur, captain: d.tag.captain, echo: d.tag.echo }, (o) => void this.tagDone(o)));
    } else if (stage === 1) {
      this.warp({ x: DUEL_SPOT.x, z: DUEL_SPOT.z, yaw: -Math.PI / 2 }, C.lilac, () => h.startDuel(d.duel, false, true, (o) => void this.duelDone(o)));
    } else {
      this.warp({ x: 0, z: 0, yaw: 0 }, C.pink, () => h.startDance(d.dance.song, d.dance.diff, true, (o) => void this.danceDone(o), d.dance.rival));
    }
  }

  /** A warp beam from the Core carries you to the next venue. */
  private warp(to: { x: number; z: number; yaw: number }, color: number, then: () => void): void {
    const h = this.host;
    snd.warp();
    const p = h.player();
    h.fx.glow.burst({ at: { x: p.x, y: 1, z: p.z }, count: 60, shape: 'up', speed: [3, 8], color: [color, C.white], life: [0.4, 0.8], size: [0.15, 0.35], gravity: -4 });
    h.fx.rings.emit({ x: p.x, y: 0.05, z: p.z }, { color, radius: 3, life: 0.5 });
    h.hud.flash(`#${new THREE.Color(color).getHexString()}`, 380, 0.6);
    setTimeout(() => {
      h.ctx.teleport(to.x, to.z, to.yaw);
      h.fx.rings.emit({ x: to.x, y: 0.05, z: to.z }, { color, radius: 3, life: 0.6 });
      then();
    }, 260);
  }

  private async stageCard(stage: number, score: number, stars: number, rows: { label: string; value: string }[], title: string): Promise<'next' | 'retry' | 'leave'> {
    const h = this.host;
    const total = this.save.scores.slice(0, stage).reduce((a, b) => a + b, 0) + score;
    const choice = await h.hud.results({
      title,
      subtitle: `${this.def.name} · ${STAGES[stage]}`,
      stars,
      rows: [...rows, { label: 'Night so far', value: `${total.toLocaleString('en-US')} x${this.def.mult}` }],
      buttons: [
        { id: 'next', label: stage < 2 ? `Next: ${STAGES[stage + 1]}` : 'To the podium', primary: true },
        ...(this.retried[stage] ? [] : [{ id: 'retry', label: 'Try again' }]),
        { id: 'leave', label: 'Save and leave' },
      ],
    });
    return choice === 'retry' ? 'retry' : choice === 'leave' || choice === 'back' ? 'leave' : 'next';
  }

  private async afterStage(stage: number, score: number, log: unknown, stars: number, rows: { label: string; value: string }[], title: string): Promise<void> {
    const h = this.host;
    const choice = await this.stageCard(stage, score, stars, rows, title);
    h.endMode();
    if (choice === 'retry') {
      this.retried[stage] = true;
      this.runStage();
      return;
    }
    // The result counts once you move on.
    this.save.scores[stage] = score;
    this.save.logs[stage] = log;
    this.stars[stage] = stars;
    this.save.stage = stage + 1;
    this.persist();
    if (choice === 'leave') {
      this.leave();
      return;
    }
    if (stage < 2) this.runStage();
    else await this.podium();
  }

  private async tagDone(o: TagOutcome): Promise<void> {
    if (o.quit) return this.leave();
    const s = o.score;
    const stars = s ? nightTagStars(s, this.def.tag.diff) : 1;
    await this.afterStage(0, s?.total ?? 0, o.log, stars, [
      { label: 'Team score', value: `${o.us} to ${o.them}` },
      { label: 'Your points', value: (s?.total ?? 0).toLocaleString('en-US') },
      { label: 'Tags / Banks / Reflects', value: `${s?.tags ?? 0} / ${s?.banks ?? 0} / ${s?.reflects ?? 0}` },
    ], o.won ? 'Cyan wins!' : 'Magenta wins');
  }

  private async duelDone(o: DuelOutcome): Promise<void> {
    if (o.quit) return this.leave();
    const r = o.result;
    const won = r.outcome === 'ko' || r.outcome === 'win';
    await this.afterStage(1, r.score, o.log, nightDuelStars(r), [
      { label: 'Score', value: r.score.toLocaleString('en-US') },
      { label: 'Tags', value: `${r.tags} of ${duelist(this.def.duel).need}` },
      { label: 'Accuracy', value: `${Math.round(r.accuracy * 100)}%` },
    ], r.outcome === 'ko' ? 'KO!' : won ? 'Bout won!' : 'Good bout!');
  }

  private async danceDone(o: DanceOutcome): Promise<void> {
    if (o.quit) return this.leave();
    this.host.tuneSync(o.errors);
    const r = o.result;
    await this.afterStage(2, r.score, o.log, nightDanceStars(r), [
      { label: 'Score', value: r.score.toLocaleString('en-US') },
      { label: 'Judges', value: `${r.cards.total} / 30` },
      { label: 'Best combo', value: String(r.maxCombo) },
    ], r.cards.total >= 26 ? 'Superstar!' : 'Great show!');
  }

  /** The night podium: stars, unlocks, the night score and the board. */
  private async podium(): Promise<void> {
    const h = this.host;
    const d = this.def;
    const save = h.save;
    const before = save.stars;
    const keys = ['tag', 'duel', 'dance'];
    let gained = 0;
    keys.forEach((k, i) => (gained += save.award(`night${d.n}:${k}`, this.stars[i])));
    const after = save.stars;
    const firstFinish = save.data.nights < d.n;
    save.data.nights = Math.max(save.data.nights, d.n);
    save.data.night = null;
    save.save();
    const unlocks = newUnlocks(before, after);
    // Podium on the Nova floor.
    h.ctx.teleport(0, 0, 0);
    h.podium(true);
    snd.fanfare();
    h.crowd.cheerNow(4);
    h.core.burst(1.8);
    h.fx.confetti.burst({ at: { x: 0, y: 6, z: 0 }, count: 240, shape: 'up', speed: [4, 9], color: [C.gold, C.pink], size: [0.12, 0.22], life: [2.5, 3.5], gravity: 5, drag: 1.1 });
    const log: NightLog = { n: d.n, tag: this.save.logs[0] as TagLog, duel: this.save.logs[1] as string, dance: this.save.logs[2] as { n: string; s: string } };
    const scored = scoreNight(log);
    const total = scored?.total ?? Math.round(this.save.scores.reduce((a, b) => a + b, 0) * d.mult);
    const newBest = save.best(`night${d.n}`, total);
    let line = 'Saving your night...';
    let rows: { name: string; value: string; you?: boolean }[] = [];
    if (!save.data.sync.wide) {
      const posted = await h.boards.submit('night', total, log, this.save.ticket);
      line = boardLine(posted, false);
      if (posted.ok) {
        snd.bell(4);
        h.ctx.ui.toast(line, 'good', 2800);
      }
      const b = await h.boards.fetch(['night'], true);
      rows = (b.night?.rows ?? []).slice(0, 5).map((x) => ({ name: x.name, value: x.value.toLocaleString('en-US'), you: x.you }));
    } else line = boardLine(null, true);
    for (const u of unlocks) h.hud.banner('Unlocked!', { sub: u.name, color: HEX.gold, size: 'l', ms: 1800 });
    const next = NIGHTS.find((x) => x.n === d.n + 1);
    const choice = await h.hud.results({
      title: `${d.name} done!`,
      subtitle: `${h.ctx.ownerName} presents Club Nova`,
      rows: [
        { label: 'Stars tonight', value: `${'★'.repeat(this.stars.reduce((a, b) => a + b, 0))}${'☆'.repeat(9 - this.stars.reduce((a, b) => a + b, 0))}` },
        { label: 'Laser tag', value: (this.save.scores[0] ?? 0).toLocaleString('en-US') },
        { label: 'Blade duel', value: (this.save.scores[1] ?? 0).toLocaleString('en-US') },
        { label: 'Dance off', value: (this.save.scores[2] ?? 0).toLocaleString('en-US') },
        { label: `Night score (x${d.mult})`, value: total.toLocaleString('en-US'), best: newBest },
      ],
      badges: [
        ...(firstFinish && next ? [`${next.name} is open`] : []),
        ...(gained ? [`+${gained} star${gained > 1 ? 's' : ''}`] : []),
        ...unlocks.map((u) => `Unlocked: ${u.name}`),
      ],
      board: { title: line, rows, empty: 'No nights on the board yet.' },
      buttons: [...(next ? [{ id: 'next', label: `Start ${next.name}`, primary: true }] : []), { id: 'done', label: 'Done', primary: !next }],
    });
    h.podium(false);
    h.night = null;
    h.endMode();
    h.refreshUnlocks();
    if (choice === 'next' && next) new NightRun(h, next.n, null).begin();
  }

  /** Saves where you are and goes back to roaming. */
  leave(): void {
    const h = this.host;
    if (this.save.stage > 0 && this.save.stage < 3) {
      this.persist();
      h.ctx.ui.toast('Party night saved. Resume it at the star pad within the hour.', 'info', 3400);
    } else if (this.save.stage === 0) {
      h.save.data.night = null;
      h.save.save();
    }
    h.night = null;
    h.endMode();
    void BASES;
  }
}
