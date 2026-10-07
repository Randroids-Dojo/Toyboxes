// Pause menu, settings and the controls card.

import { setMusicVolume, setVolume } from '../audio/sfx';
import * as local from '../core/local';
import { canPromptInstall, isInstalled, isIos, onInstallChange, promptInstall } from '../core/pwa';
import { IS_TV } from '../input/input';
import { card } from '../ui/dialogs';
import { button, h, type Panel, type UI } from '../ui/ui';

export interface PauseItem {
  label: string;
  action: () => void;
  primary?: boolean;
}

export function pauseMenu(ui: UI, opts: { title: string; note?: string; items: PauseItem[]; onResume: () => void }): Panel {
  const list = h('div', { class: 'menu-list' });
  let first: HTMLButtonElement | null = null;
  const panel: Panel = {
    el: card(),
    onBack: () => {
      ui.close(panel);
      opts.onResume();
    },
    initial: () => first,
  };
  for (const it of opts.items) {
    const b = button(it.label, () => it.action(), it.primary ? 'primary' : '');
    if (!first) first = b;
    list.appendChild(b);
  }
  panel.el.append(h('h2', {}, opts.title), opts.note ? h('p', { class: 'note-bad' }, opts.note) : '', list, h('p', { class: 'fine' }, 'Toyboxes by Randroid LLC · support@toyboxes.app'));
  ui.open(panel);
  return panel;
}

function segmented<T extends string>(label: string, options: [T, string][], value: T, onChange: (v: T) => void): HTMLElement {
  const row = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map(([v, text]) => {
    const b = button(text, () => {
      onChange(v);
      buttons.forEach((x) => x.classList.toggle('on', x === b));
      buttons.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    }, 'seg-btn');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(v === value));
    if (v === value) b.classList.add('on');
    return b;
  });
  row.append(...buttons);
  return h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, label), row);
}

function toggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const b = button(value ? 'On' : 'Off', () => {
    value = !value;
    b.textContent = value ? 'On' : 'Off';
    b.classList.toggle('on', value);
    b.setAttribute('aria-pressed', String(value));
    onChange(value);
  }, `toggle${value ? ' on' : ''}`);
  b.setAttribute('aria-pressed', String(value));
  return h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, label), b);
}

function slider(label: string, min: number, max: number, step: number, value: number, onChange: (v: number) => void): HTMLElement {
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), 'aria-label': label }) as HTMLInputElement;
  input.value = String(value);
  input.addEventListener('input', () => onChange(Number(input.value)));
  return h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, label), input);
}

export function settingsPanel(ui: UI, onChange: (s: local.Settings) => void): Panel {
  const s = local.settings();
  const set = <K extends keyof local.Settings>(k: K, v: local.Settings[K]) => {
    s[k] = v;
    local.saveSettings(s);
    onChange({ ...s });
  };
  const body = h(
    'div',
    { class: 'settings' },
    slider('Sound', 0, 1, 0.1, s.volume, (v) => {
      set('volume', v);
      setVolume(v);
    }),
    slider('Music', 0, 1, 0.1, s.music, (v) => {
      set('music', v);
      setMusicVolume(v);
    }),
    slider('Camera speed', 0.4, 2, 0.1, s.lookSpeed, (v) => set('lookSpeed', v)),
    toggle('Camera follows behind', s.autoCamera, (v) => set('autoCamera', v)),
    toggle('Invert camera up and down', s.invertY, (v) => set('invertY', v)),
    segmented('Time of day', [['cycle', 'Cycle'], ['day', 'Day'], ['sunset', 'Sunset'], ['night', 'Night']], s.time, (v) => set('time', v)),
    segmented('Graphics', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], s.quality, (v) => set('quality', v)),
    toggle('Reduce motion', s.reduceMotion, (v) => set('reduceMotion', v)),
    toggle('Larger text', s.largeText, (v) => set('largeText', v)),
    toggle('Show frame rate', s.showFps, (v) => set('showFps', v)),
    segmented('Touch controls', [['auto', 'Auto'], ['show', 'Show'], ['hide', 'Hide']], s.touchControls, (v) => set('touchControls', v)),
    installRow(),
  );
  const done = button('Done', () => ui.close(panel), 'primary');
  const panel: Panel = { el: card(h('h2', {}, 'Settings'), body, h('div', { class: 'actions' }, done)), onBack: () => ui.close(panel) };
  ui.open(panel);
  return panel;
}

/** Add to home screen: the browser's install prompt where there is one, otherwise how to do it. */
function installRow(): HTMLElement {
  const note = h('span', { class: 'setting-note' });
  const btn = button('Install', () => void install(), 'primary');
  const row = h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, 'Add to home screen'), note, btn);
  const render = () => {
    btn.classList.add('hidden');
    if (isInstalled()) note.textContent = "You're playing the home screen app.";
    else if (canPromptInstall()) {
      note.textContent = 'Opens full screen like an app, one tap from the town.';
      btn.classList.remove('hidden');
      btn.disabled = false;
    } else if (isIos()) note.textContent = 'Tap Share, then Add to Home Screen.';
    else note.textContent = "Use your browser's menu: Install app or Add to Home screen.";
  };
  const install = async () => {
    btn.disabled = true;
    const accepted = await promptInstall().catch(() => false);
    if (accepted) {
      btn.classList.add('hidden');
      note.textContent = 'Installing. Open Toyboxes from your home screen.';
    } else render();
  };
  const off = onInstallChange(() => {
    if (row.isConnected) render();
    else off();
  });
  render();
  return row;
}

export function controlsPanel(ui: UI): Panel {
  const rows = (pairs: [string, string][]) => h('dl', { class: 'controls' }, ...pairs.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
  const kb: [string, string][] = IS_TV
    ? [
        ['Arrows', 'Move'],
        ['OK', 'Use doors, ride, open'],
        ['Back', 'Menu'],
      ]
    : [
        ['WASD or arrows', 'Move (Shift to run)'],
        ['Drag the mouse', 'Look around'],
        ['E or Enter', 'Use doors, ride, open'],
        ['Space', 'Kick (brake when riding)'],
        ['T', 'Reset toys'],
        ['Esc', 'Menu'],
      ];
  const pad: [string, string][] = [
    ['Left stick', 'Move or steer'],
    ['Right stick', 'Look around'],
    ['A', 'Use doors, ride, open'],
    ['X', 'Kick (brake when riding)'],
    ['RT and LT', 'Go and brake when riding'],
    ['B', 'Back'],
    ['Menu', 'Pause'],
  ];
  const touch: [string, string][] = [
    ['Left thumb', 'Move or steer'],
    ['Drag on the right', 'Look around'],
    ['Big button', 'Whatever is in front of you'],
    ['Kick', 'Kick (brake when riding)'],
  ];
  const list = ui.device === 'pad' ? pad : ui.device === 'touch' ? touch : kb;
  const panel: Panel = { el: card(h('h2', {}, 'Controls'), rows(list), h('div', { class: 'actions' }, button('Done', () => ui.close(panel), 'primary'))), onBack: () => ui.close(panel) };
  ui.open(panel);
  return panel;
}
