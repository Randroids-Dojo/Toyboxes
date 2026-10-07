// Club Nova's menus, all through UI.open so focus and Back work with a
// mouse, touch, a controller and a TV remote: song select with preview
// loops, the duel and laser tag terminals, the wardrobe and party settings.

import { music } from '../../audio/music';
import { button, h, type Panel } from '../../ui/ui';
import { chartFor, DIFF_NAMES, DANCE_SONGS, diffsFor, type Diff } from '../../shared/neon/charts';
import { danceCeiling } from '../../shared/neon/judge';
import { SONGS, type SongId } from '../../shared/neon/songs';
import { LAYOUT_NAMES, type LayoutId } from '../../shared/neon/arena';
import { TAG_DIFF_NAMES, type TagDiff } from '../../shared/neon/tag';
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

/** Party settings at the Glow Lab jukebox: sound check, timing nudges and assists. */
export function partySettings(nova: Nova, onSoundCheck: () => void, onClose: () => void): void {
  const ui = nova.ctx.ui;
  const sync = nova.save.data.sync;
  let checking = false;
  const offsetText = () => `${sync.offset > 0 ? '+' : ''}${Math.round(sync.offset)} ms`;
  const value = h('b', {}, offsetText());
  const nudge = (d: number) => {
    sync.offset = Math.max(-60, Math.min(300, sync.offset + d));
    nova.clock.inputOffset = sync.offset;
    nova.save.save();
    value.textContent = offsetText();
  };
  const toggle = (label: string, key: 'hitSound' | 'beatBar' | 'easyHolds' | 'wide' | 'lockCam', note: string) => {
    const b = button(`${label}: ${sync[key] ? 'On' : 'Off'}`, () => {
      sync[key] = !sync[key];
      nova.save.save();
      b.textContent = `${label}: ${sync[key] ? 'On' : 'Off'}`;
    }, 'ghost');
    return h('div', { class: 'nova-row' }, b, h('small', { class: 'muted' }, note));
  };
  const check = button('Run the sound check', () => {
    checking = true;
    ui.close(panel);
    onSoundCheck();
  }, 'primary');
  const done = button('Done', () => ui.close(panel), 'ghost');
  const panel: Panel = {
    el: card(
      'Party settings',
      'Jukebox',
      h('p', { class: 'xk-tagline' }, 'If your presses feel early or late, run the sound check or nudge your timing.'),
      h('div', { class: 'actions' }, check),
      h('div', { class: 'nova-row' }, button('Earlier', () => nudge(-10), 'ghost'), h('span', {}, 'Timing ', value), button('Later', () => nudge(10), 'ghost')),
      toggle('Hit sounds', 'hitSound', 'A clap on every hit'),
      toggle('Beat bar', 'beatBar', 'Notes on screen'),
      toggle('Easy holds', 'easyHolds', 'Holds count once you hit them'),
      toggle('Wide timing', 'wide', 'Easier windows, bests stay here'),
      toggle('Lock-on camera', 'lockCam', 'Laser tag frames your target'),
      h('div', { class: 'actions' }, done),
    ),
    onBack: () => ui.close(panel),
    onClose: () => {
      if (!checking) onClose();
    },
    initial: () => check,
  };
  ui.open(panel);
}

/** Asks before a first rhythm game whether to run the 20 second sound check. */
export function askSoundCheck(nova: Nova, onYes: () => void, onSkip: () => void, onCancel: () => void): void {
  const ui = nova.ctx.ui;
  let chose = false;
  const yes = button('Sound check', () => {
    chose = true;
    ui.close(panel);
    onYes();
  }, 'primary');
  const skip = button('Skip', () => {
    chose = true;
    ui.close(panel);
    onSkip();
  }, 'ghost');
  const panel: Panel = {
    el: card('Quick sound check?', 'Orbit', h('p', { class: 'xk-tagline' }, 'Clap along with Orbit for 20 seconds so your timing feels right on this screen.'), h('div', { class: 'actions' }, yes, skip)),
    onBack: () => {
      chose = true;
      ui.close(panel);
      onCancel();
    },
    onClose: () => {
      if (!chose) onSkip();
    },
    initial: () => yes,
  };
  ui.open(panel);
}

/** Which night opens each laser tag layout in free play. */
export const LAYOUT_NIGHT: Record<LayoutId, number> = { prism: 0, maze: 3, ring: 4 };

/** The Comet Yard terminal: difficulty and layout for a free play match. */
export function tagSetup(nova: Nova, onPick: (diff: TagDiff, layout: LayoutId) => void, onClose: () => void): void {
  const ui = nova.ctx.ui;
  const save = nova.save.data;
  let layout: LayoutId = 'prism';
  let picked = false;
  const layoutBtns = (Object.keys(LAYOUT_NAMES) as LayoutId[]).map((id) => {
    const locked = save.nights < LAYOUT_NIGHT[id];
    const b = button(locked ? `${LAYOUT_NAMES[id]} (night ${LAYOUT_NIGHT[id]})` : LAYOUT_NAMES[id], () => {
      layout = id;
      for (const x of layoutBtns) x.classList.toggle('on', x === b);
    }, 'ghost');
    b.disabled = locked;
    if (id === 'prism') b.classList.add('on');
    return b;
  });
  const diffBtns = (['easy', 'normal', 'hard'] as TagDiff[]).map((d) => {
    const key = `tag:${d}`;
    return button(`${TAG_DIFF_NAMES[d]}  ${stars(save.stars[key] ?? 0, !!save.crowns[key])}`, () => {
      picked = true;
      ui.close(panel);
      onPick(d, layout);
    }, d === 'normal' ? 'primary' : 'ghost');
  });
  const back = button('Back', () => ui.close(panel), 'ghost');
  const panel: Panel = {
    el: card(
      'Laser tag',
      'Comet Yard',
      h('p', { class: 'xk-tagline' }, 'Three of us against three of them, two minutes. Tag on the beat to keep your blaster cool.'),
      h('div', { class: 'nova-grid' }, ...layoutBtns),
      h('div', { class: 'nova-song-diffs' }, ...diffBtns),
      h('p', { class: 'muted' }, 'Normal and Hard go on the board.'),
      h('div', { class: 'actions' }, back),
    ),
    onBack: () => ui.close(panel),
    onClose: () => {
      if (!picked) onClose();
    },
    initial: () => diffBtns[1],
  };
  ui.open(panel);
}
