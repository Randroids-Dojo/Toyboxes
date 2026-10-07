// Club Nova's menus, all through UI.open so focus and Back work with a
// mouse, touch, a controller and a TV remote: song select with preview
// loops, the duel and laser tag terminals, the wardrobe and party settings.

import { music } from '../../audio/music';
import { button, h, type Panel } from '../../ui/ui';
import { chartFor, DIFF_NAMES, DANCE_SONGS, diffsFor, type Diff } from '../../shared/neon/charts';
import { danceCeiling } from '../../shared/neon/judge';
import { SONGS, type SongId } from '../../shared/neon/songs';
import { songData } from './music';
import type { Nova } from './world';

/** Which night unlocks each song in free play. */
export const SONG_NIGHT: Record<SongId, number> = { hello: 0, lights: 0, comet: 0, glitter: 1, heart: 2, supernova: 3 };

function stars(n: number, crown = false): string {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n)) + (crown ? ' ♛' : '');
}

function card(title: string, kicker: string, ...body: (Node | null)[]): HTMLElement {
  return h('div', { class: 'card xk-card xk-card-dark nova-menu' }, h('div', { class: 'xk-card-kicker' }, kicker), h('h2', {}, title), ...body);
}

/** Picks a song and difficulty for a free play dance off. */
export function songSelect(nova: Nova, onPick: (song: SongId, diff: Diff) => void, onClose: () => void): void {
  const ui = nova.ctx.ui;
  const save = nova.save.data;
  let previewing: SongId | null = null;
  const preview = (id: SongId) => {
    if (previewing === id) return;
    previewing = id;
    music.play(songData(id, { loop: true }), { fadeIn: 0.4, section: 'drop' });
    music.only('drop');
    music.filter(2400, 0.2);
  };
  const rows: HTMLElement[] = [];
  let first: HTMLElement | null = null;
  let picked = false;
  for (const id of DANCE_SONGS) {
    const meta = SONGS[id];
    const locked = save.nights < SONG_NIGHT[id];
    const diffs = diffsFor(id);
    const btns = diffs.map((d) => {
      const key = `dance:${id}:${d}`;
      const b = button(`${DIFF_NAMES[d]}  ${stars(save.stars[key] ?? 0, !!save.crowns[key])}`, () => {
        picked = true;
        ui.close(panel);
        onPick(id, d);
      }, d === 'normal' ? 'primary' : 'ghost');
      b.disabled = locked;
      b.addEventListener('focus', () => preview(id));
      b.addEventListener('pointerenter', () => !locked && preview(id));
      if (!first && !locked) first = b;
      return b;
    });
    const best = save.best[`dance:${id}:normal`];
    rows.push(
      h(
        'div',
        { class: `nova-song${locked ? ' locked' : ''}` },
        h('div', { class: 'nova-song-head' }, h('b', {}, meta.name), h('small', {}, locked ? `Finish night ${SONG_NIGHT[id]} to unlock` : `${meta.bpm}${meta.change ? ` to ${meta.change.bpm}` : ''} BPM${best ? ` · Best ${best.toLocaleString('en-US')}` : ''}`)),
        h('div', { class: 'nova-song-diffs' }, ...btns),
      ),
    );
  }
  const close = button('Back', () => ui.close(panel), 'ghost');
  const panel: Panel = {
    el: card('Pick a song', 'Dance off', h('p', { class: 'xk-tagline' }, 'Tap on the gems as they reach the ring. Hold the long ones.'), h('div', { class: 'nova-songs' }, ...rows), h('div', { class: 'actions' }, close)),
    onBack: () => ui.close(panel),
    onClose: () => {
      music.only(null);
      music.filter(20000, 0.2);
      if (!picked) onClose();
    },
    initial: () => first ?? close,
  };
  ui.open(panel);
}

/** The best score a perfect run of a chart could get (for the boards' range). */
export function chartMax(song: SongId, diff: Diff): number {
  const c = chartFor(song, diff);
  return c ? danceCeiling(c) : 0;
}
