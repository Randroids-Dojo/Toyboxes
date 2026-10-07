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
import { DUELISTS as DUEL_LIST, type DuelistId } from '../../shared/neon/duel';
import { NIGHTS as NIGHT_LIST } from '../../shared/neon/night';
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

/** Which night opens each duelist in free play. */
export const DUEL_NIGHT: Record<DuelistId, number> = { sprocket: 0, twinkle: 1, brick: 2, mirage: 3, knight: 4 };

/** The Blade Ring terminal: the Prism Five, Normal or Echo. */
export function duelSelect(nova: Nova, onPick: (id: DuelistId, echo: boolean) => void, onClose: () => void, only?: DuelistId): void {
  const ui = nova.ctx.ui;
  const save = nova.save.data;
  let picked = false;
  let first: HTMLElement | null = null;
  const rows = DUEL_LIST.filter((d) => !only || d.id === only).map((d) => {
    const locked = save.nights < DUEL_NIGHT[d.id];
    const beaten = !!save.duelsBeaten[d.id];
    const mk = (echo: boolean) => {
      const key = `duel:${d.id}:${echo ? 'echo' : 'normal'}`;
      const b = button(`${echo ? 'Echo' : 'Normal'}  ${stars(save.stars[key] ?? 0, !!save.crowns[key])}`, () => {
        picked = true;
        ui.close(panel);
        onPick(d.id, echo);
      }, echo ? 'ghost' : 'primary');
      b.disabled = locked || (echo && !beaten);
      if (!first && !b.disabled) first = b;
      return b;
    };
    return h(
      'div',
      { class: `nova-song${locked ? ' locked' : ''}` },
      h('div', { class: 'nova-song-head' }, h('b', {}, d.name), h('small', {}, locked ? `Finish night ${DUEL_NIGHT[d.id]} to unlock` : `${d.idea} · ${d.need} tags to win`)),
      h('div', { class: 'nova-song-diffs' }, mk(false), mk(true)),
    );
  });
  const back = button('Back', () => ui.close(panel), 'ghost');
  const panel: Panel = {
    el: card(
      only ? DUEL_LIST.find((d) => d.id === only)!.name : 'Prism blade duels',
      'Blade Ring',
      h('p', { class: 'xk-tagline' }, 'Press as the ring closes to parry. Hit the glowing crests when it is your turn. Echo hides the rings when you copy a rhythm.'),
      h('div', { class: 'nova-songs' }, ...rows),
      h('div', { class: 'actions' }, back),
    ),
    onBack: () => ui.close(panel),
    onClose: () => {
      if (!picked) onClose();
    },
    initial: () => first ?? back,
  };
  ui.open(panel);
}

/** The star pad: pick a party night (or resume a saved one). */
export function nightSelect(nova: Nova, onPick: (n: number, resume: boolean) => void, onClose: () => void, canResume: boolean): void {
  const ui = nova.ctx.ui;
  const save = nova.save.data;
  let picked = false;
  const pick = (n: number, resume: boolean) => {
    picked = true;
    ui.close(panel);
    onPick(n, resume);
  };
  const resume = canResume && save.night ? button(`Resume ${NIGHT_LIST.find((x) => x.n === save.night!.n)!.name}`, () => pick(save.night!.n, true), 'primary') : null;
  const rows = NIGHT_LIST.map((d) => {
    const locked = d.n > save.nights + 1;
    const st = ['tag', 'duel', 'dance'].reduce((a, k) => a + (save.stars[`night${d.n}:${k}`] ?? 0), 0);
    const best = save.best[`night${d.n}`];
    const b = button(`${d.n}. ${d.name}`, () => pick(d.n, false), !resume && d.n === Math.min(5, save.nights + 1) ? 'primary' : 'ghost');
    b.disabled = locked;
    return h('div', { class: `nova-row${locked ? ' locked' : ''}` }, b, h('small', { class: 'muted' }, locked ? `Finish night ${d.n - 1}` : `${'★'.repeat(st)}${'☆'.repeat(9 - st)}${best ? ` · ${best.toLocaleString('en-US')}` : ''}`));
  });
  const back = button('Back', () => ui.close(panel), 'ghost');
  const panel: Panel = {
    el: card('Party night', 'Star pad', h('p', { class: 'xk-tagline' }, 'Laser tag, a blade duel and a dance off, back to back. Every night ends on the podium.'), resume ? h('div', { class: 'actions' }, resume) : null, h('div', { class: 'nova-nights' }, ...rows), h('div', { class: 'actions' }, back)),
    onBack: () => ui.close(panel),
    onClose: () => {
      if (!picked) onClose();
    },
    initial: () => resume ?? (rows[Math.min(4, save.nights)].querySelector('button') as HTMLElement),
  };
  ui.open(panel);
}
