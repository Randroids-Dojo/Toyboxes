// The fete programme board and the Toot-o-Matic, as cards through UI.open so
// arrows, OK, Back, the d-pad and taps all work.

import { button, h, type Panel, type UI } from '../../ui/ui';
import { MISCHIEF } from './sim/mischief';
import { TOTAL_BEANS, TRIAL_GATES, UNLOCKS, beanCount, type PuffSave, type TrialId } from './sim/progress';
import { formatLap } from '../common';

export const TRIAL_NAMES: Record<TrialId, string> = { rings: 'Rocket Rings', library: 'Shh! The Library', band: 'Brass Band Bash', picnic: 'Picnic Panic' };

const beanIcons = (n: number) => h('span', { class: 'pf-beans', 'aria-label': `${n} of 3 golden beans` }, ...[0, 1, 2].map((i) => h('i', { class: i < n ? 'on' : '' })));

function bestText(t: TrialId, best: number | null): string {
  if (best === null) return 'No best yet';
  return t === 'rings' || t === 'picnic' ? `Best ${formatLap(best)}` : `Best ${best.toLocaleString('en-US')}`;
}

export function openProgramme(ui: UI, save: PuffSave, opts: { tab?: string; onTapMode: (on: boolean) => void; onCalibrate: () => void; onReset: () => void }): Promise<void> {
  return new Promise((resolve) => {
    const body = h('div', { class: 'pf-body' });
    const tabs = ['Mischief', 'Trials', 'The jar', 'Settings'];
    let current = opts.tab ?? 'Mischief';
    const tabBtns = tabs.map((t) =>
      button(t, () => {
        current = t;
        render();
        tabBtns[tabs.indexOf(t)].focus();
      }, 'ghost'),
    );
    const beans = beanCount(save);
    const render = () => {
      tabBtns.forEach((b, i) => b.classList.toggle('on', tabs[i] === current));
      if (current === 'Mischief') {
        body.replaceChildren(
          h('p', { class: 'pf-small' }, `${save.mischief.length} of ${MISCHIEF.length} done. Each one is a golden bean.`),
          h('ul', { class: 'pf-list' }, ...MISCHIEF.map((m) => {
            const done = save.mischief.includes(m.id);
            return h('li', { class: done ? 'done' : '', 'data-nav': '1', tabindex: '0' }, h('span', { class: 'mark' }, done ? '✓' : ''), h('span', { class: 'grow' }, m.text, done ? null : h('small', {}, m.hint)));
          })),
        );
      } else if (current === 'Trials') {
        body.replaceChildren(
          h('ul', { class: 'pf-list' }, ...(['rings', 'band', 'library', 'picnic'] as TrialId[]).map((t) => {
            const s = save.trials[t];
            const open = beans >= TRIAL_GATES[t];
            return h('li', { class: s.beans === 3 ? 'done' : '', 'data-nav': '1', tabindex: '0' }, h('span', { class: 'grow' }, TRIAL_NAMES[t], h('small', {}, open ? bestText(t, s.best) : `Opens at ${TRIAL_GATES[t]} golden beans`)), beanIcons(s.beans));
          })),
          h('p', { class: 'pf-small' }, save.polka.best !== null ? `Bonus song Polka Dots: best ${save.polka.best.toLocaleString('en-US')}` : 'Brass Band Bash has a bonus song, Polka Dots.'),
        );
      } else if (current === 'The jar') {
        const next = UNLOCKS.find((u) => u.beans > beans);
        body.replaceChildren(
          h('p', {}, h('b', {}, `${beans} of ${TOTAL_BEANS} golden beans`)),
          h('p', { class: 'pf-small' }, next ? `Next: ${next.name} at ${next.beans} beans.` : 'Every unlock is yours. Hooray!'),
          h('ul', { class: 'pf-list' }, ...UNLOCKS.filter((u) => u.beans > 0).map((u) => h('li', { class: beans >= u.beans ? 'done' : '', 'data-nav': '1', tabindex: '0' }, h('span', { class: 'mark' }, beans >= u.beans ? '✓' : String(u.beans)), h('span', { class: 'grow' }, u.name, h('small', {}, u.kind === 'voice' ? 'Toot voice' : u.kind === 'cloud' ? 'Cloud style' : 'Voice, clouds and a medal'))))),
        );
      } else {
        const tap = save.tapMode ?? false;
        const tapBtn = button(tap ? 'Tap mode: on' : 'Tap mode: off', () => {
          opts.onTapMode(!(save.tapMode ?? false));
          render();
          body.querySelector<HTMLElement>('button')?.focus();
        }, 'ghost');
        body.replaceChildren(
          h('p', { class: 'pf-small' }, 'Tap mode: tap to start and stop a hover, and tap twice standing still for a big one. Handy on a TV remote.'),
          tapBtn,
          h('p', { class: 'pf-small' }, 'Rhythm check: toot along with the drum so the band trial fits your screen and speakers.'),
          button('Rhythm check', () => {
            ui.close(panel);
            opts.onCalibrate();
          }, 'ghost'),
          h('p', { class: 'pf-small' }, 'Start again from no golden beans on this device.'),
          button('Reset progress', () => {
            ui.close(panel);
            opts.onReset();
          }, 'ghost'),
        );
      }
    };
    const close = button('Back to the fete', () => ui.close(panel), 'primary');
    const panel: Panel = {
      el: h('div', { class: 'card pf-card' }, h('h2', {}, 'Fete programme'), h('div', { class: 'pf-tabs' }, ...tabBtns), body, h('div', { class: 'actions' }, close)),
      onBack: () => ui.close(panel),
      onClose: () => resolve(),
      onPrev: () => {
        current = tabs[(tabs.indexOf(current) + tabs.length - 1) % tabs.length];
        render();
      },
      onNext: () => {
        current = tabs[(tabs.indexOf(current) + 1) % tabs.length];
        render();
      },
      initial: () => tabBtns[tabs.indexOf(current)],
    };
    render();
    ui.open(panel);
  });
}

export interface TootChoice {
  kind: 'voice' | 'cloud';
  id: string;
}

export function openTootomatic(ui: UI, save: PuffSave, onPick: (c: TootChoice) => void): Promise<void> {
  return new Promise((resolve) => {
    const beans = beanCount(save);
    const golden = beans >= TOTAL_BEANS;
    const voices = UNLOCKS.filter((u) => u.kind === 'voice');
    const clouds = UNLOCKS.filter((u) => u.kind === 'cloud');
    const grid = h('div');
    let first: HTMLElement | null = null;
    const render = () => {
      const tile = (kind: 'voice' | 'cloud', id: string, name: string, need: number) => {
        const open = beans >= need;
        const on = (kind === 'voice' ? save.voice : save.cloud) === id;
        const b = button(open ? name : `${name} (${need} beans)`, () => {
          if (!open) return;
          onPick({ kind, id });
          render();
          (grid.querySelector(`[data-id="${kind}-${id}"]`) as HTMLElement | null)?.focus();
        }, `ghost${on ? ' on' : ''}${open ? '' : ' locked'}`);
        b.dataset.id = `${kind}-${id}`;
        if (open && !first) first = b;
        return b;
      };
      first = null;
      grid.replaceChildren(
        h('h3', {}, 'Toot voice'),
        h('div', { class: 'pf-grid' }, ...voices.map((v) => tile('voice', v.id, v.name, v.beans)), ...(golden ? [tile('voice', 'golden', 'Golden toot', TOTAL_BEANS)] : [])),
        h('h3', {}, 'Cloud style'),
        h('div', { class: 'pf-grid' }, ...clouds.map((v) => tile('cloud', v.id, v.name, v.beans)), ...(golden ? [tile('cloud', 'golden', 'Golden clouds', TOTAL_BEANS)] : [])),
      );
    };
    render();
    const done = button('Done', () => ui.close(panel), 'primary');
    const panel: Panel = {
      el: h('div', { class: 'card pf-card' }, h('h2', {}, 'Toot-o-Matic'), h('p', { class: 'pf-small' }, `Pick a voice and a cloud. ${beans} golden beans so far.`), grid, h('div', { class: 'actions' }, done)),
      onBack: () => ui.close(panel),
      onClose: () => resolve(),
      initial: () => (grid.querySelector('.btn.on') as HTMLElement | null) ?? first,
    };
    ui.open(panel);
  });
}
