// DOM layer over the game: a stack of dialogs with full focus and back
// handling for controllers and TV remotes, plus the small HUD.

import { sfx } from '../audio/sfx';
import { IS_TV, type Device, type MenuAction } from '../input/input';

export interface Panel {
  el: HTMLElement;
  /** B, Escape or the TV Back key. Return false to keep the panel open. */
  onBack?: () => boolean | void;
  onAlt?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onClose?: () => void;
  /** Element to focus on open. */
  initial?: () => HTMLElement | null;
  /** Panels that keep the world visible but dimmed less. */
  light?: boolean;
  /** Sees menu input first; return true to swallow it (sketch pen mode). */
  capture?: (a: MenuAction) => boolean;
}

export type Glyph = 'interact' | 'kick' | 'back' | 'pause' | 'move' | 'look' | 'rotate' | 'remove' | 'next';

const GLYPHS: Record<'kbm' | 'tv' | 'pad', Record<Glyph, string>> = {
  kbm: { interact: 'E', kick: 'Space', back: 'Esc', pause: 'Esc', move: 'WASD', look: 'Drag', rotate: 'R', remove: 'Del', next: 'Tab' },
  tv: { interact: 'OK', kick: 'Space', back: 'Back', pause: 'Back', move: 'Arrows', look: '', rotate: 'R', remove: 'Del', next: 'Tab' },
  pad: { interact: 'A', kick: 'X', back: 'B', pause: 'Menu', move: 'L', look: 'R', rotate: 'X', remove: 'Y', next: 'RB' },
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | number | undefined> = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = h('button', { class: `btn ${cls}`.trim(), type: 'button' }, label);
  b.addEventListener('click', (e) => {
    e.preventDefault();
    sfx.click();
    onClick();
  });
  return b;
}

function visible(el: HTMLElement): boolean {
  if (el.closest('.hidden,[hidden]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [data-nav]')).filter(
    (el) => visible(el) && el.tabIndex !== -1,
  );
}

export function isTextInput(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && ['text', 'search', ''].includes((el as HTMLInputElement).type);
}

export class UI {
  readonly root: HTMLElement;
  readonly hud: HTMLElement;
  private layer: HTMLElement;
  private stack: Panel[] = [];
  private promptEl: HTMLElement;
  private toasts: HTMLElement;
  private bannerEl: HTMLElement;
  private placeEl: HTMLElement;
  private lockEl: HTMLElement;
  private hintEl: HTMLElement;
  private menuBtn: HTMLButtonElement;
  device: Device = 'kbm';
  /** Opens the on-screen keyboard for a field; set by main. */
  openKeyboard: ((input: HTMLInputElement | HTMLTextAreaElement) => void) | null = null;
  onStackChange: ((open: boolean) => void) | null = null;
  onMenuButton: (() => void) | null = null;
  onLockButton: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = h('div', { class: 'ui' });
    this.hud = h('div', { class: 'hud' });
    this.layer = h('div', { class: 'layer' });
    this.placeEl = h('div', { class: 'place-chip' });
    this.lockEl = h('button', { class: 'lock-chip hidden', type: 'button', tabindex: '-1' }, 'Editing on · Lock');
    this.lockEl.addEventListener('click', () => this.onLockButton?.());
    this.menuBtn = h('button', { class: 'menu-btn', type: 'button', tabindex: '-1', 'aria-label': 'Menu' }, h('span'), h('span'), h('span'));
    this.menuBtn.addEventListener('click', () => this.onMenuButton?.());
    this.promptEl = h('div', { class: 'prompt hidden' });
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    this.bannerEl = h('div', { class: 'banner' });
    this.hintEl = h('div', { class: 'hint hidden' });
    this.hud.append(h('div', { class: 'hud-top' }, this.placeEl, this.lockEl), this.menuBtn, this.promptEl, this.toasts, this.bannerEl, this.hintEl);
    this.root.append(this.hud, this.layer);
    parent.appendChild(this.root);
    // Keep focus inside the top dialog.
    document.addEventListener('focusin', (e) => {
      const top = this.top;
      if (top && e.target instanceof Node && !top.el.contains(e.target) && !this.root.querySelector('.osk')?.contains(e.target)) {
        const first = focusables(top.el)[0];
        first?.focus();
      }
    });
  }

  get top(): Panel | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  get isOpen(): boolean {
    return this.stack.length > 0;
  }

  setDevice(d: Device): void {
    this.device = d;
    document.body.dataset.device = d;
    document.body.classList.toggle('nav-visible', d !== 'touch');
  }

  glyph(g: Glyph): string {
    const set = this.device === 'pad' ? 'pad' : IS_TV ? 'tv' : 'kbm';
    return GLYPHS[set][g];
  }

  key(g: Glyph): HTMLElement {
    const set = this.device === 'pad' ? 'pad' : IS_TV ? 'tv' : 'kbm';
    return h('kbd', { class: `key key-${set} key-${g}` }, GLYPHS[set][g]);
  }

  open(p: Panel): void {
    const wrap = h('div', { class: `modal${p.light ? ' light' : ''}` });
    wrap.appendChild(p.el);
    (p as Panel & { wrap?: HTMLElement }).wrap = wrap;
    this.layer.appendChild(wrap);
    this.stack.push(p);
    this.layer.classList.add('active');
    this.onStackChange?.(true);
    requestAnimationFrame(() => {
      wrap.classList.add('in');
      const target = p.initial?.() ?? focusables(p.el)[0];
      if (this.device !== 'touch' || !isTextInput(target ?? null)) target?.focus({ preventScroll: true });
    });
  }

  close(p: Panel | null = this.top): void {
    if (!p) return;
    const i = this.stack.indexOf(p);
    if (i < 0) return;
    this.stack.splice(i, 1);
    const wrap = (p as Panel & { wrap?: HTMLElement }).wrap;
    if (wrap) {
      wrap.classList.remove('in');
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 160);
    }
    p.onClose?.();
    if (this.stack.length === 0) {
      this.layer.classList.remove('active');
      (document.activeElement as HTMLElement | null)?.blur?.();
      this.onStackChange?.(false);
    } else {
      const top = this.top!;
      const target = top.initial?.() ?? focusables(top.el)[0];
      if (this.device !== 'touch') target?.focus({ preventScroll: true });
    }
  }

  closeAll(): void {
    while (this.stack.length) this.close();
  }

  /** Routes controller and remote menu input. */
  menu(a: MenuAction): void {
    const top = this.top;
    if (!top) return;
    if (top.capture?.(a)) return;
    const active = document.activeElement as HTMLElement | null;
    switch (a) {
      case 'back':
        if (top.onBack?.() !== false) {
          if (!top.onBack) this.close(top);
        }
        return;
      case 'pause':
        if (top.onBack) top.onBack();
        else this.close(top);
        return;
      case 'alt':
        top.onAlt?.();
        return;
      case 'prev':
        top.onPrev?.();
        return;
      case 'next':
        top.onNext?.();
        return;
      case 'confirm':
        if (active && top.el.contains(active)) {
          if (isTextInput(active)) {
            if (this.device === 'pad' || IS_TV) this.openKeyboard?.(active);
            return;
          }
          if (active instanceof HTMLInputElement && active.type === 'checkbox') {
            active.click();
            return;
          }
          active.click();
        } else {
          focusables(top.el)[0]?.focus();
        }
        return;
    }
    if (active instanceof HTMLInputElement && active.type === 'range' && (a === 'left' || a === 'right')) {
      const step = Number(active.step) || 1;
      const v = Number(active.value) + (a === 'right' ? step : -step);
      active.value = String(Math.min(Number(active.max), Math.max(Number(active.min), v)));
      active.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    this.navigate(a, top.el);
  }

  private navigate(dir: 'up' | 'down' | 'left' | 'right', root: HTMLElement): void {
    const items = focusables(root);
    if (!items.length) return;
    const cur = document.activeElement as HTMLElement | null;
    if (!cur || !items.includes(cur)) {
      items[0].focus();
      return;
    }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const q = el.getBoundingClientRect();
      const ex = q.left + q.width / 2;
      const ey = q.top + q.height / 2;
      const dx = ex - cx;
      const dy = ey - cy;
      let main: number;
      let cross: number;
      // Overlap on the cross axis makes neighbours in a row or column preferred.
      if (dir === 'left' || dir === 'right') {
        main = dir === 'right' ? q.left - r.right + r.width / 2 : r.left - q.right + r.width / 2;
        if ((dir === 'right' ? dx : -dx) < 4) continue;
        const overlap = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
        cross = overlap > 0 ? 0 : Math.abs(dy);
      } else {
        main = dir === 'down' ? q.top - r.bottom + r.height / 2 : r.top - q.bottom + r.height / 2;
        if ((dir === 'down' ? dy : -dy) < 4) continue;
        const overlap = Math.min(r.right, q.right) - Math.max(r.left, q.left);
        cross = overlap > 0 ? Math.abs(dx) * 0.1 : Math.abs(dx);
      }
      const score = Math.max(0, main) + cross * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      sfx.click();
      best.focus({ preventScroll: false });
      best.scrollIntoView({ block: 'nearest' });
    }
  }

  // -------------------------------------------------------------------------
  // HUD

  setPlace(text: string): void {
    if (this.placeEl.textContent !== text) this.placeEl.textContent = text;
  }

  setLocked(unlocked: boolean): void {
    this.lockEl.classList.toggle('hidden', !unlocked);
  }

  /** Context prompt, e.g. "E  Enter Cris's room". Hidden on touch, where the button carries it. */
  prompt(label: string | null, g: Glyph = 'interact'): void {
    if (!label || this.device === 'touch') {
      this.promptEl.classList.add('hidden');
      return;
    }
    const key = `${this.device}|${g}|${label}`;
    if (this.promptEl.dataset.key !== key) {
      this.promptEl.dataset.key = key;
      this.promptEl.replaceChildren(this.key(g), h('span', {}, label));
    }
    this.promptEl.classList.remove('hidden');
  }

  hint(parts: [Glyph, string][] | null): void {
    if (!parts || this.device === 'touch') {
      this.hintEl.classList.add('hidden');
      return;
    }
    const key = `${this.device}|${parts.map((p) => p.join(':')).join(',')}`;
    if (this.hintEl.dataset.key !== key) {
      this.hintEl.dataset.key = key;
      this.hintEl.replaceChildren(
        ...parts
          .filter(([g]) => this.glyph(g))
          .map(([g, label]) => h('span', { class: 'hint-item' }, this.key(g), label)),
      );
    }
    this.hintEl.classList.remove('hidden');
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' = 'info', ms = 2600): void {
    const t = h('div', { class: `toast ${kind}`, role: kind === 'bad' ? 'alert' : 'status' }, text);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => {
      t.classList.remove('in');
      setTimeout(() => t.remove(), 300);
    }, ms);
  }

  banner(text: string, color = '#ffd24a'): void {
    const b = h('div', { class: 'banner-text' }, text);
    b.style.setProperty('--c', color);
    this.bannerEl.replaceChildren(b);
    requestAnimationFrame(() => b.classList.add('in'));
    setTimeout(() => b.classList.add('out'), 1300);
    setTimeout(() => b.remove(), 1800);
  }

  setMenuButton(visible: boolean): void {
    this.menuBtn.classList.toggle('hidden', !visible);
  }
}
