// On-screen keyboard for controllers and TV remotes, so names and sketchbook
// pages can be typed from the couch.

import { button, h, type Panel, type UI } from './ui';

const ROWS = ['1234567890', 'qwertyuiop', "asdfghjkl'", 'zxcvbnm,.?'];

export function openKeyboard(ui: UI, target: HTMLInputElement | HTMLTextAreaElement, onDone?: () => void): void {
  let shift = target.value.length === 0;
  const max = target.maxLength > 0 ? target.maxLength : 2000;
  const preview = h('div', { class: 'osk-preview' });
  const keys: HTMLButtonElement[] = [];

  const sync = () => {
    const v = target.value;
    preview.textContent = v.length > 140 ? '…' + v.slice(-140) : v || ' ';
    preview.classList.toggle('empty', !v);
    for (const k of keys) {
      const ch = k.dataset.ch!;
      k.textContent = shift ? ch.toUpperCase() : ch;
    }
    shiftBtn.classList.toggle('on', shift);
  };

  const type = (s: string) => {
    if (target.value.length >= max) return;
    target.value += s;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    if (shift && /[a-z]/i.test(s)) shift = false;
    sync();
  };

  const back = () => {
    target.value = target.value.slice(0, -1);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    sync();
  };

  const grid = h('div', { class: 'osk-grid' });
  for (const row of ROWS) {
    const r = h('div', { class: 'osk-row' });
    for (const ch of row) {
      const k = button(ch, () => type(shift ? ch.toUpperCase() : ch), 'osk-key');
      k.dataset.ch = ch;
      keys.push(k);
      r.appendChild(k);
    }
    grid.appendChild(r);
  }
  const shiftBtn = button('Shift', () => {
    shift = !shift;
    sync();
  }, 'osk-key wide');
  const space = button('Space', () => type(' '), 'osk-key space');
  const del = button('Delete', back, 'osk-key wide');
  const newline = target.tagName === 'TEXTAREA' ? button('New line', () => type('\n'), 'osk-key wide') : null;
  const done = button('Done', () => {
    ui.close(panel);
  }, 'osk-key wide primary');
  grid.appendChild(h('div', { class: 'osk-row' }, shiftBtn, space, del, newline, done));

  const el = h('div', { class: 'card osk' }, preview, grid, h('p', { class: 'osk-help' }, ui.device === 'pad' ? 'X deletes, B finishes' : 'Back finishes'));
  const panel: Panel = {
    el,
    light: true,
    onBack: () => ui.close(panel),
    onAlt: back,
    onClose: () => {
      onDone?.();
      target.dispatchEvent(new Event('change', { bubbles: true }));
    },
    initial: () => keys[10] ?? null,
  };
  ui.open(panel);
  sync();
}
