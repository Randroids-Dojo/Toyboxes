// HUD kit for the worlds: one themed layer with banners, a countdown, a stat
// strip, timer bars, judgements, score pops, flashes, letterboxing, a title
// sweep, and the intro and results cards (through UI.open, so every input
// path works). Call `update(dt)` from `step` so timers pause with the game,
// and `dispose()` from `dispose`.
//
//   this.hud = new Hud(ctx, { accent: '#ff48c4', accent2: '#49d9ff', panel: 'dark' });
//   this.hud.strip([{ id: 'score', label: 'Score', value: '0' }, { id: 'time', label: 'Time', value: '1:00' }]);
//   this.hud.set('score', '120');
//   await this.hud.countdown();
//   const choice = await this.hud.results({ title: 'Stage clear', stars: 2, rows: [...], buttons: [{ id: 'again', label: 'Play again', primary: true }, { id: 'leave', label: 'Done' }] });

import * as THREE from 'three';
import './hud.css';
import { sfx } from '../../audio/sfx';
import { IS_TV } from '../../input/input';
import { button, h, type Glyph, type Panel } from '../../ui/ui';
import type { ExperienceCtx } from '../common';

export interface HudTheme {
  /** Main colour: titles, primary buttons, highlights. */
  accent: string;
  /** Second colour for gradients and secondary highlights. */
  accent2?: string;
  /** dark: glassy panels for night and neon worlds; light: the town's paper style. */
  panel?: 'dark' | 'light';
  /** Display font for big text. Defaults to the game's display font. */
  font?: string;
  /** Neon glow on big text. */
  glow?: boolean;
}

export interface Stat {
  id: string;
  label: string;
  value: string;
  /** Wider cells for things like lap times. */
  wide?: boolean;
}

export interface ResultsOpts {
  title: string;
  subtitle?: string;
  /** Stars earned, shown out of `maxStars` (default 3). */
  stars?: number;
  maxStars?: number;
  rows?: { label: string; value: string; best?: boolean }[];
  /** Short highlights such as "New best!". */
  badges?: string[];
  board?: { title: string; rows: { name: string; value: string; you?: boolean }[]; empty?: string };
  buttons: { id: string; label: string; primary?: boolean }[];
}

export interface IntroTip {
  /** Keys to show on keyboard and controller. 'move' shows the stick or arrows. */
  keys: Glyph[];
  /** The touch button name, e.g. "Action". Omit when the tip is the same on touch. */
  touch?: string;
  text: string;
}

export interface IntroOpts {
  /** Remembered per device so the card shows once. */
  key: string;
  title: string;
  tagline: string;
  tips: IntroTip[];
  button?: string;
  /** Show even when seen before (a "How to play" sign). */
  force?: boolean;
}

interface Pop {
  el: HTMLElement;
  at: THREE.Vector3;
  age: number;
  life: number;
  rise: number;
}

const SEEN_KEY = 'toyboxes.intro';

function seen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export class Hud {
  readonly root: HTMLElement;
  private stripEl: HTMLElement | null = null;
  private cells = new Map<string, { cell: HTMLElement; value: HTMLElement }>();
  private bars = new Map<string, { wrap: HTMLElement; fill: HTMLElement }>();
  private objectiveEl: HTMLElement;
  private bannerEl: HTMLElement;
  private judgeEl: HTMLElement;
  private flashEl: HTMLElement;
  private boxEl: HTMLElement;
  private titleEl: HTMLElement;
  private pops: Pop[] = [];
  private count: { left: number; n: number; go: string; resolve: () => void; tick?: (n: number) => void } | null = null;
  private timers: number[] = [];
  private disposed = false;

  constructor(
    private ctx: ExperienceCtx,
    private theme: HudTheme,
  ) {
    this.root = h('div', { class: `xk xk-${theme.panel ?? 'dark'}${theme.glow ? ' xk-glow' : ''}` });
    this.root.style.setProperty('--xk-accent', theme.accent);
    this.root.style.setProperty('--xk-accent-2', theme.accent2 ?? theme.accent);
    if (theme.font) this.root.style.setProperty('--xk-font', theme.font);
    this.objectiveEl = h('div', { class: 'xk-objective hidden' });
    this.bannerEl = h('div', { class: 'xk-banner' });
    this.judgeEl = h('div', { class: 'xk-judge' });
    this.flashEl = h('div', { class: 'xk-flash' });
    this.boxEl = h('div', { class: 'xk-letterbox' }, h('i'), h('i'));
    this.titleEl = h('div', { class: 'xk-title' });
    this.root.append(this.boxEl, this.objectiveEl, this.bannerEl, this.judgeEl, this.titleEl, this.flashEl);
    ctx.ui.hud.appendChild(this.root);
    // Card styles live under the modal layer, outside the HUD.
    document.documentElement.style.setProperty('--xk-card-accent', theme.accent);
    document.documentElement.style.setProperty('--xk-card-accent-2', theme.accent2 ?? theme.accent);
  }

  // ---- stat strip

  /** The row of stats along the top. Replaces any previous strip. */
  strip(stats: Stat[]): void {
    this.stripEl?.remove();
    this.cells.clear();
    if (!stats.length) {
      this.stripEl = null;
      this.ctx.ui.hud.classList.remove('has-xk-strip');
      return;
    }
    this.stripEl = h('div', { class: 'xk-strip' });
    for (const s of stats) {
      const value = h('b', { class: 'xk-v' }, s.value);
      const cell = h('div', { class: `xk-stat${s.wide ? ' wide' : ''}`, 'data-id': s.id }, h('small', {}, s.label), value);
      this.cells.set(s.id, { cell, value });
      this.stripEl.append(cell);
    }
    this.root.prepend(this.stripEl);
    this.ctx.ui.hud.classList.add('has-xk-strip');
  }

  /** Updates a stat. `bump` animates it (on by default when the text changes). */
  set(id: string, value: string, opts: { bump?: boolean; tone?: 'good' | 'bad' | 'hot' | null } = {}): void {
    const c = this.cells.get(id);
    if (!c) return;
    if (c.value.textContent !== value) {
      c.value.textContent = value;
      if (opts.bump !== false) {
        c.cell.classList.remove('bump');
        void c.cell.offsetWidth;
        c.cell.classList.add('bump');
      }
    }
    c.cell.dataset.tone = opts.tone ?? '';
  }

  /** A thin progress bar under the strip (time left, pressure, health). */
  bar(id: string, fraction: number | null, color?: string): void {
    let b = this.bars.get(id);
    if (fraction === null) {
      b?.wrap.remove();
      this.bars.delete(id);
      return;
    }
    if (!b) {
      const fill = h('i');
      const wrap = h('div', { class: 'xk-bar', 'data-id': id }, fill);
      this.root.insertBefore(wrap, this.objectiveEl);
      b = { wrap, fill };
      this.bars.set(id, b);
    }
    b.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
    if (color) b.fill.style.background = color;
  }

  /** The current goal, in a few words. Null hides it. */
  objective(text: string | null): void {
    this.objectiveEl.classList.toggle('hidden', !text);
    if (text && this.objectiveEl.textContent !== text) this.objectiveEl.textContent = text;
  }

  // ---- big moments

  /** Big centred text. */
  banner(text: string, opts: { sub?: string; color?: string; ms?: number; size?: 'm' | 'l' | 'xl' } = {}): void {
    const el = h('div', { class: `xk-banner-text size-${opts.size ?? 'l'}` }, h('span', {}, text), opts.sub ? h('small', {}, opts.sub) : null);
    if (opts.color) el.style.setProperty('--c', opts.color);
    this.bannerEl.replaceChildren(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const ms = opts.ms ?? 1400;
    this.later(() => el.classList.add('out'), ms);
    this.later(() => el.remove(), ms + 450);
  }

  /** A quick word under the centre: "Perfect", "Miss", "+3 combo". */
  judge(text: string, color?: string): void {
    const el = h('div', { class: 'xk-judge-text' }, text);
    if (color) el.style.setProperty('--c', color);
    this.judgeEl.replaceChildren(el);
    this.later(() => el.remove(), 700);
  }

  /** 3, 2, 1, GO driven by `update(dt)`, so it pauses with the game. Resolves on GO. */
  countdown(from = 3, opts: { go?: string; tick?: (n: number) => void } = {}): Promise<void> {
    return new Promise((resolve) => {
      this.count = { left: 0, n: from + 1, go: opts.go ?? 'GO!', resolve, tick: opts.tick };
    });
  }

  /** Whether a countdown is running. */
  get counting(): boolean {
    return !!this.count;
  }

  /** A full-screen flash that works on every graphics tier. */
  flash(color = '#ffffff', ms = 260, strength = 0.55): void {
    if (this.ctx.reduceMotion()) strength *= 0.4;
    this.flashEl.style.background = color;
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = String(strength);
    void this.flashEl.offsetWidth;
    this.flashEl.style.transition = `opacity ${ms}ms ease-out`;
    this.flashEl.style.opacity = '0';
  }

  /** Cinematic bars for directed camera shots. */
  letterbox(on: boolean): void {
    this.boxEl.classList.toggle('on', on);
  }

  /** The world's name sweeping in on arrival. */
  title(title: string, sub?: string, ms = 2800): void {
    const el = h('div', { class: 'xk-title-in' }, h('span', { class: 'xk-title-main' }, title), sub ? h('span', { class: 'xk-title-sub' }, sub) : null);
    this.titleEl.replaceChildren(el);
    requestAnimationFrame(() => el.classList.add('in'));
    this.later(() => el.classList.add('out'), ms);
    this.later(() => el.remove(), ms + 700);
  }

  /** Floating text at a point in the world, e.g. "+100". */
  pop(text: string, at: { x: number; y: number; z: number }, opts: { color?: string; size?: number; life?: number; rise?: number } = {}): void {
    const el = h('div', { class: 'xk-pop' }, text);
    if (opts.color) el.style.setProperty('--c', opts.color);
    if (opts.size) el.style.fontSize = `${opts.size}rem`;
    this.root.appendChild(el);
    this.pops.push({ el, at: new THREE.Vector3(at.x, at.y, at.z), age: 0, life: opts.life ?? 0.9, rise: opts.rise ?? 1.2 });
    if (this.pops.length > 24) this.pops.shift()!.el.remove();
  }

  /** Advances the countdown and the pops. Call every step. */
  update(dt: number): void {
    if (this.count) {
      const c = this.count;
      c.left -= dt;
      if (c.left <= 0) {
        c.n--;
        c.left = 1;
        if (c.n > 0) {
          this.banner(String(c.n), { size: 'xl', ms: 700, color: '#fffaf0' });
          sfx.beep(false);
          c.tick?.(c.n);
        } else {
          this.banner(c.go, { size: 'xl', ms: 800 });
          sfx.beep(true);
          c.tick?.(0);
          this.count = null;
          c.resolve();
        }
      }
    }
    if (this.pops.length) {
      const cam = this.ctx.camera;
      const v = new THREE.Vector3();
      const w = innerWidth;
      const hgt = innerHeight;
      this.pops = this.pops.filter((p) => {
        p.age += dt;
        if (p.age >= p.life) {
          p.el.remove();
          return false;
        }
        const t = p.age / p.life;
        v.copy(p.at);
        v.y += p.rise * (1 - (1 - t) * (1 - t));
        v.project(cam);
        const behind = v.z > 1;
        p.el.style.opacity = behind ? '0' : String(Math.min(1, (1 - t) * 2.2));
        p.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * hgt}px) translate(-50%, -50%) scale(${0.7 + Math.min(1, t * 6) * 0.3})`;
        return true;
      });
    }
  }

  // ---- cards

  /** The first-visit card. Resolves at once if this device has seen it. */
  intro(opts: IntroOpts): Promise<void> {
    const all = seen();
    if (all[opts.key] && !opts.force) return Promise.resolve();
    return new Promise((resolve) => {
      const ui = this.ctx.ui;
      const touch = ui.device === 'touch';
      const tips = opts.tips.map((t) => {
        const keys = touch ? (t.touch ? [h('kbd', { class: 'key key-touch' }, t.touch)] : []) : t.keys.filter((g) => ui.glyph(g)).map((g) => ui.key(g));
        if (!touch && t.keys.includes('move') && IS_TV) keys.splice(0, keys.length, h('kbd', { class: 'key' }, 'Arrows'));
        return h('li', {}, h('span', { class: 'xk-keys' }, ...keys), h('span', {}, t.text));
      });
      const go = button(opts.button ?? "Let's go", () => ui.close(panel), 'primary');
      const panel: Panel = {
        el: h('div', { class: `card xk-card xk-card-${this.theme.panel ?? 'dark'} xk-intro` }, h('div', { class: 'xk-card-kicker' }, 'How to play'), h('h2', {}, opts.title), h('p', { class: 'xk-tagline' }, opts.tagline), h('ul', { class: 'xk-tips' }, ...tips), h('div', { class: 'actions' }, go)),
        onBack: () => ui.close(panel),
        onClose: () => {
          const s = seen();
          s[opts.key] = Date.now();
          try {
            localStorage.setItem(SEEN_KEY, JSON.stringify(s));
          } catch {
            // Private mode: it shows again next time.
          }
          resolve();
        },
        initial: () => go,
      };
      ui.open(panel);
    });
  }

  /** The end-of-round card. Resolves with the chosen button id, or 'back'. */
  results(opts: ResultsOpts): Promise<string> {
    return new Promise((resolve) => {
      const ui = this.ctx.ui;
      let choice = 'back';
      const max = opts.maxStars ?? 3;
      const stars = opts.stars !== undefined ? h('div', { class: 'xk-stars', 'aria-label': `${opts.stars} of ${max} stars` }, ...Array.from({ length: max }, (_, i) => h('i', { class: i < (opts.stars ?? 0) ? 'on' : '' }, '★'))) : null;
      const rows = opts.rows?.length
        ? h('dl', { class: 'xk-rows' }, ...opts.rows.flatMap((r) => [h('dt', {}, r.label), h('dd', { class: r.best ? 'best' : '' }, r.value)]))
        : null;
      const badges = opts.badges?.length ? h('div', { class: 'xk-badges' }, ...opts.badges.map((b) => h('span', {}, b))) : null;
      const board = opts.board
        ? h(
            'div',
            { class: 'xk-board' },
            h('h3', {}, opts.board.title),
            opts.board.rows.length
              ? h('ol', {}, ...opts.board.rows.map((r) => h('li', { class: r.you ? 'you' : '' }, h('span', {}, r.name), h('b', {}, r.value))))
              : h('p', { class: 'muted' }, opts.board.empty ?? 'No scores yet. Be the first!'),
          )
        : null;
      const btns = opts.buttons.map((b) =>
        button(b.label, () => {
          choice = b.id;
          ui.close(panel);
        }, b.primary ? 'primary' : 'ghost'),
      );
      const panel: Panel = {
        el: h('div', { class: `card xk-card xk-card-${this.theme.panel ?? 'dark'} xk-results` }, h('h2', {}, opts.title), opts.subtitle ? h('p', { class: 'xk-tagline' }, opts.subtitle) : null, stars, badges, rows, board, h('div', { class: 'actions' }, ...btns)),
        light: true,
        onBack: () => ui.close(panel),
        onClose: () => resolve(choice),
        initial: () => btns.find((_, i) => opts.buttons[i].primary) ?? btns[0] ?? null,
      };
      ui.open(panel);
      // Stars land one by one.
      if (stars) {
        const on = Array.from(stars.querySelectorAll('i.on')) as HTMLElement[];
        on.forEach((el, i) => {
          el.classList.add('wait');
          this.later(() => {
            el.classList.remove('wait');
            sfx.ding(i === on.length - 1 && on.length === max);
          }, 260 + i * 320);
        });
      }
    });
  }

  private later(f: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      if (!this.disposed) f();
    }, ms);
    this.timers.push(id);
    if (this.timers.length > 64) this.timers.splice(0, 32);
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t);
    this.root.remove();
    this.ctx.ui.hud.classList.remove('has-xk-strip');
    this.count = null;
  }
}

/** What to call a control in copy on this device: "E", "A", "OK" or the touch button. */
export function controlName(ui: ExperienceCtx['ui'], g: Glyph, touchLabel: string): string {
  if (ui.device === 'touch') return touchLabel;
  return ui.glyph(g) || touchLabel;
}
