// Reusable dialogs: name entry, a four-digit PIN pad, confirmations and choices.

import { sfx } from '../audio/sfx';
import { IS_TV } from '../input/input';
import { NAME_MAX, cleanName } from '../shared/model';
import { openKeyboard } from './osk';
import { button, h, type Panel, type UI } from './ui';

export function card(...children: (Node | string | null | undefined | false)[]): HTMLElement {
  return h('div', { class: 'card' }, ...children);
}

export function askName(ui: UI, opts: { current: string | null; first: boolean; title?: string; note?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h('input', { class: 'field', type: 'text', maxlength: String(NAME_MAX), autocomplete: 'nickname', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Player name' });
    input.value = opts.current ?? '';
    const err = h('p', { class: 'error', role: 'alert' });
    let done = false;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      ui.close(panel);
      resolve(v);
    };
    const submit = () => {
      const name = cleanName(input.value);
      if (!name) {
        err.textContent = 'Use 2 to 16 letters or numbers';
        sfx.error();
        input.focus();
        return;
      }
      sfx.confirm();
      finish(name);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !IS_TV) {
        e.preventDefault();
        submit();
      }
    });
    input.addEventListener('input', () => (err.textContent = ''));
    const kb = button('Keyboard', () => openKeyboard(ui, input), 'ghost osk-open');
    const go = button(opts.first ? "Let's go" : 'Save name', submit, 'primary');
    const el = card(
      h('h2', {}, opts.title ?? (opts.first ? 'What should we call you?' : 'Change your name')),
      h('p', { class: 'muted' }, opts.note ?? 'Your name shows on rooms you claim. It is not a login.'),
      h('div', { class: 'field-row' }, input, kb),
      err,
      h('div', { class: 'actions' }, opts.first ? null : button('Cancel', () => finish(null), 'ghost'), go),
    );
    const panel: Panel = {
      el,
      onBack: () => {
        if (!opts.first) finish(null);
      },
      initial: () => input,
    };
    ui.open(panel);
  });
}

export interface PinPadOptions {
  title: string;
  note?: string;
  submitLabel?: string;
  /** Return an error message to stay open, or null when done. */
  onSubmit: (pin: string) => Promise<string | null>;
  onCancel?: () => void;
}

export function pinPad(ui: UI, opts: PinPadOptions): Panel {
  let pin = '';
  let busy = false;
  let show = false;
  const boxes = Array.from({ length: 4 }, () => h('span', { class: 'pin-box' }));
  const err = h('p', { class: 'error', role: 'alert' });
  const status = h('p', { class: 'muted pin-status' });
  const draw = () => {
    boxes.forEach((b, i) => {
      b.textContent = i < pin.length ? (show ? pin[i] : '●') : '';
      b.classList.toggle('filled', i < pin.length);
      b.classList.toggle('cursor', i === pin.length);
    });
    ok.disabled = pin.length !== 4 || busy;
  };
  const add = (d: string) => {
    if (busy || pin.length >= 4) return;
    pin += d;
    err.textContent = '';
    sfx.click();
    draw();
    if (pin.length === 4) ok.focus();
  };
  const del = () => {
    if (busy) return;
    pin = pin.slice(0, -1);
    draw();
  };
  const submit = async () => {
    if (pin.length !== 4 || busy) return;
    busy = true;
    status.textContent = 'Checking...';
    draw();
    const e = await opts.onSubmit(pin);
    busy = false;
    status.textContent = '';
    if (e) {
      err.textContent = e;
      sfx.error();
      pin = '';
      panel.el.classList.remove('shake');
      void panel.el.offsetWidth;
      panel.el.classList.add('shake');
      draw();
      (keys[0] as HTMLElement).focus();
    }
  };
  const keys: HTMLButtonElement[] = [];
  const grid = h('div', { class: 'pin-grid' });
  for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
    const b = button(d, () => add(d), 'pin-key');
    keys.push(b);
    grid.appendChild(b);
  }
  const delBtn = button('Delete', del, 'pin-key small');
  const zero = button('0', () => add('0'), 'pin-key');
  const ok = button(opts.submitLabel ?? 'OK', () => void submit(), 'pin-key small primary');
  grid.append(delBtn, zero, ok);
  const showBtn = button('Show', () => {
    show = !show;
    showBtn.textContent = show ? 'Hide' : 'Show';
    draw();
  }, 'ghost tiny');
  const onKey = (e: KeyboardEvent) => {
    if (ui.top !== panel) return;
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      add(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      del();
    } else if (e.key === 'Enter' && pin.length === 4 && document.activeElement !== ok) {
      e.preventDefault();
      void submit();
    }
  };
  addEventListener('keydown', onKey);
  const el = card(
    h('h2', {}, opts.title),
    opts.note ? h('p', { class: 'muted' }, opts.note) : null,
    h('div', { class: 'pin-row' }, ...boxes, showBtn),
    err,
    status,
    grid,
    h('div', { class: 'actions' }, button('Cancel', () => cancel(), 'ghost')),
  );
  el.classList.add('pin-card');
  const cancel = () => {
    ui.close(panel);
    opts.onCancel?.();
  };
  const panel: Panel = {
    el,
    onBack: cancel,
    onAlt: del,
    onClose: () => removeEventListener('keydown', onKey),
    initial: () => keys[4],
  };
  draw();
  ui.open(panel);
  return panel;
}

export function confirmBox(ui: UI, opts: { title: string; body?: string | Node; ok: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      ui.close(panel);
      resolve(v);
    };
    const okBtn = button(opts.ok, () => finish(true), opts.danger ? 'danger' : 'primary');
    const el = card(
      h('h2', {}, opts.title),
      typeof opts.body === 'string' ? h('p', { class: 'muted' }, opts.body) : (opts.body ?? null),
      h('div', { class: 'actions' }, button(opts.cancel ?? 'Cancel', () => finish(false), 'ghost'), okBtn),
    );
    const panel: Panel = { el, onBack: () => finish(false), initial: () => okBtn };
    ui.open(panel);
  });
}

export function choose<T extends string>(ui: UI, opts: { title: string; body?: string; options: { label: string; value: T; note?: string; primary?: boolean }[]; cancel?: string }): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: T | null) => {
      if (done) return;
      done = true;
      ui.close(panel);
      resolve(v);
    };
    const list = h('div', { class: 'choices' });
    let first: HTMLButtonElement | null = null;
    for (const o of opts.options) {
      const b = button('', () => finish(o.value), `choice${o.primary ? ' primary' : ''}`);
      b.replaceChildren(h('strong', {}, o.label), o.note ? h('span', {}, o.note) : '');
      if (!first) first = b;
      list.appendChild(b);
    }
    const el = card(h('h2', {}, opts.title), opts.body ? h('p', { class: 'muted' }, opts.body) : null, list, h('div', { class: 'actions' }, button(opts.cancel ?? 'Cancel', () => finish(null), 'ghost')));
    const panel: Panel = { el, onBack: () => finish(null), initial: () => first };
    ui.open(panel);
  });
}
