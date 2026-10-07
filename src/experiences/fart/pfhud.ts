// The world's own HUD pieces on top of the kit HUD: the tummy gauge, the bean
// jar, the mischief chip and notebook, and the trial meters.

import { h } from '../../ui/ui';
import type { Gas } from './sim/gas';

const ICONS: Record<Gas, string> = {
  beans: '<svg viewBox="0 0 24 24"><ellipse cx="8" cy="10" rx="4" ry="5.5" transform="rotate(-25 8 10)" fill="#fff7e6" stroke="#2b1d3a" stroke-width="1.6"/><ellipse cx="15.5" cy="14" rx="4" ry="5.5" transform="rotate(20 15.5 14)" fill="#fff7e6" stroke="#2b1d3a" stroke-width="1.6"/></svg>',
  fizzy: '<svg viewBox="0 0 24 24"><circle cx="9" cy="14" r="5" fill="#fff" stroke="#2b1d3a" stroke-width="1.6"/><circle cx="16" cy="8" r="3.2" fill="#fff" stroke="#2b1d3a" stroke-width="1.6"/><circle cx="17" cy="16" r="2" fill="#fff" stroke="#2b1d3a" stroke-width="1.4"/></svg>',
  cabbage: '<svg viewBox="0 0 24 24"><path d="M4 14c0-5 4-9 8-9s8 4 8 9c0 3-3 6-8 6s-8-3-8-6z" fill="#d4f58a" stroke="#2b1d3a" stroke-width="1.6"/><path d="M12 6v13M12 12l-4-3M12 15l4-4" stroke="#2b1d3a" stroke-width="1.4" fill="none"/></svg>',
};

const JAR = '<svg viewBox="0 0 30 34"><rect x="7" y="2" width="16" height="5" rx="2" fill="#e8574a" stroke="#2b1d3a" stroke-width="2"/><path d="M5 9h20v19a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="rgba(255,255,255,0.75)" stroke="#2b1d3a" stroke-width="2"/><ellipse cx="11" cy="25" rx="3" ry="2" fill="#ffd24a" stroke="#2b1d3a" stroke-width="1"/><ellipse cx="18" cy="26" rx="3" ry="2" fill="#ffd24a" stroke="#2b1d3a" stroke-width="1"/><ellipse cx="15" cy="21" rx="3" ry="2" fill="#ffd24a" stroke="#2b1d3a" stroke-width="1"/></svg>';

export class PuffHud {
  readonly root: HTMLElement;
  private tummy: HTMLElement;
  private icon: HTMLElement;
  private fill: HTMLElement;
  private cost: HTMLElement;
  private tank: HTMLElement;
  private label: HTMLElement;
  private jar: HTMLElement;
  private jarText: HTMLElement;
  private chip: HTMLElement;
  private note: HTMLElement;
  private noteTimer = 0;
  private lastGas: Gas | null | undefined = undefined;
  private lastFill = -1;

  constructor(parent: HTMLElement) {
    this.root = h('div', { class: 'puff' });
    this.icon = h('div', { class: 'pf-gas-icon' }, '?');
    this.fill = h('i');
    this.cost = h('b');
    this.tank = h('div', { class: 'pf-tank' }, this.fill, this.cost);
    this.label = h('div', { class: 'pf-tank-label' }, 'Tummy: empty');
    this.tummy = h('div', { class: 'pf-tummy off', 'aria-label': 'Tummy gauge' }, this.icon, h('div', { class: 'pf-tank-wrap' }, this.label, this.tank));
    this.jarText = h('span', {}, '0/27');
    this.jar = h('div', { class: 'pf-jar', 'aria-label': 'Golden beans' });
    this.jar.innerHTML = JAR;
    this.jar.append(this.jarText);
    this.chip = h('div', { class: 'pf-chip hidden' });
    this.note = h('div', { class: 'pf-note' });
    this.root.append(this.tummy, this.jar, this.chip, this.note);
    parent.appendChild(this.root);
  }

  /** Shows the gauge once you've eaten something. */
  gauge(gas: Gas | null, amount: number, opts: { cost?: number } = {}): void {
    if (gas !== this.lastGas) {
      this.lastGas = gas;
      this.tummy.classList.toggle('off', !gas);
      this.icon.dataset.gas = gas ?? '';
      this.tank.dataset.gas = gas ?? '';
      this.icon.innerHTML = gas ? ICONS[gas] : '?';
      this.icon.classList.remove('pop');
      void this.icon.offsetWidth;
      this.icon.classList.add('pop');
    }
    const f = Math.round(amount);
    if (f !== this.lastFill) {
      this.lastFill = f;
      this.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, amount / 100))})`;
      const name = gas === 'beans' ? 'Beans' : gas === 'fizzy' ? 'Fizzy pop' : gas === 'cabbage' ? 'Cabbage' : 'Empty';
      this.label.textContent = gas ? `${name} ${f}%` : 'Tummy: empty';
    }
    const c = opts.cost ?? 0;
    this.cost.classList.toggle('on', c > 0);
    if (c > 0) {
      this.cost.style.left = `${Math.max(0, (amount - c) / 100) * 100}%`;
      this.cost.style.width = `${Math.min(amount, c)}%`;
    }
  }

  shake(): void {
    this.tummy.classList.remove('shake');
    void this.tummy.offsetWidth;
    this.tummy.classList.add('shake');
  }

  flash(): void {
    this.tummy.classList.remove('flash');
    void this.tummy.offsetWidth;
    this.tummy.classList.add('flash');
  }

  beans(n: number, total: number, bump = false): void {
    this.jarText.textContent = `${n}/${total}`;
    if (bump) {
      this.jar.classList.remove('bump');
      void this.jar.offsetWidth;
      this.jar.classList.add('bump');
    }
  }

  /** The "what's next" chip under the jar. */
  hint(text: string | null): void {
    this.chip.classList.toggle('hidden', !text);
    if (text && this.chip.dataset.text !== text) {
      this.chip.dataset.text = text;
      this.chip.replaceChildren(h('small', {}, 'MISCHIEF'), text);
    }
  }

  /** The notebook flies in and ticks an item. */
  tick(title: string, item: string): void {
    this.note.replaceChildren(h('div', { class: 'tick' }, '✓'), h('h4', {}, title), h('p', {}, item));
    this.note.classList.remove('in');
    void this.note.offsetWidth;
    this.note.classList.add('in');
    this.noteTimer = 2.6;
  }

  /** A golden bean flies from a screen point into the jar. */
  flyBean(sx: number, sy: number, done: () => void): void {
    const el = h('div', { class: 'pf-flybean' });
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    this.root.appendChild(el);
    const jr = this.jar.getBoundingClientRect();
    requestAnimationFrame(() => {
      el.classList.add('go');
      el.style.left = `${jr.left + 18}px`;
      el.style.top = `${jr.top + 18}px`;
    });
    setTimeout(() => {
      el.remove();
      done();
    }, 900);
  }

  trial(on: boolean): void {
    this.root.classList.toggle('trial', on);
  }

  update(dt: number): void {
    if (this.noteTimer > 0) {
      this.noteTimer -= dt;
      if (this.noteTimer <= 0) this.note.classList.remove('in');
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
