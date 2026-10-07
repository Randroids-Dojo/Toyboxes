// The docked table panel every game on the boat shares: your credits, the
// chips your rank allows (LB and RB step through them), one coach line the
// first time, an Odds sheet and a "?" with three short rules, a status line,
// and Done (Back) to stand up. Everything is a button, so arrows and OK
// reach it all; the world stays visible above it.

import { chipsFor, type GameId } from '../../shared/casino/progress';
import { button, h, type Panel } from '../../ui/ui';
import { formatCredits } from '../common';
import { sound } from './audio';
import type { Host } from './host';

export interface PanelOpts {
  id: string;
  title: string;
  game: GameId;
  /** 'bet': the chip is your bet. 'place': the chip is what each placement adds. null: no chip row. */
  chips: 'bet' | 'place' | null;
  coach?: string;
  help: string[];
  odds: () => (HTMLElement | string)[];
  /** The pad's X or Y: Rebet, Hint. */
  alt?: { label: string; run: () => void };
  /** What to focus on open. */
  initial?: () => HTMLElement | null;
  onClose?: () => void;
  wide?: boolean;
}

export class TablePanel {
  readonly el: HTMLElement;
  readonly body: HTMLElement;
  readonly actions: HTMLElement;
  private statusEl: HTMLElement;
  private creditsEl: HTMLElement;
  private chipRow: HTMLElement | null = null;
  private chipBtns: HTMLButtonElement[] = [];
  private altBtn: HTMLButtonElement | null = null;
  private panel: Panel;
  private off: () => void = () => {};
  private chipValue: number;
  private sheet: Panel | null = null;
  open = false;
  /** While true, chips cannot change (a spin or a hand is on the table). */
  locked = false;
  onChip: ((v: number) => void) | null = null;
  readonly done: HTMLButtonElement;

  constructor(
    private host: Host,
    private o: PanelOpts,
  ) {
    this.chipValue = host.bet(o.game);
    this.creditsEl = h('b', { class: 'gp-credits-v' });
    const help = button('?', () => this.showHelp(), 'ghost tiny gp-help');
    help.setAttribute('aria-label', 'How to play');
    const odds = button('Odds', () => this.showOdds(), 'ghost tiny');
    const head = h('div', { class: 'gp-head' }, h('h2', {}, o.title), h('div', { class: 'gp-credits' }, h('small', {}, 'Credits'), this.creditsEl), h('div', { class: 'gp-head-btns' }, odds, help));
    this.statusEl = h('p', { class: 'gp-status', role: 'status' });
    this.body = h('div', { class: 'gp-body' });
    this.done = button('Done', () => this.close(), 'ghost');
    this.actions = h('div', { class: 'actions gp-actions' }, this.done);
    if (o.alt) {
      this.altBtn = button(o.alt.label, () => o.alt!.run(), 'gp-alt');
      this.actions.append(this.altBtn);
    }
    const parts: (HTMLElement | null)[] = [head];
    if (o.chips) {
      this.chipRow = h('div', { class: 'gp-chips', role: 'group', 'aria-label': o.chips === 'bet' ? 'Bet' : 'Chip to place' });
      parts.push(h('div', { class: 'gp-chip-wrap' }, h('span', { class: 'gp-chip-label' }, o.chips === 'bet' ? 'Bet' : 'Chip'), this.chipRow));
      this.paintChips();
    }
    const coached = host.save.data.coached[o.id];
    if (o.coach && !coached) parts.push(h('p', { class: 'gp-coach' }, o.coach));
    parts.push(this.body, this.statusEl, this.actions);
    this.el = h('div', { class: `card gp-panel${o.wide ? ' wide' : ''}`, 'data-panel': o.id }, ...parts);
    this.panel = {
      el: this.el,
      light: true,
      onBack: () => {
        this.close();
      },
      onPrev: () => this.stepChip(-1),
      onNext: () => this.stepChip(1),
      onAlt: () => o.alt?.run(),
      onClose: () => {
        this.open = false;
        this.off();
        o.onClose?.();
      },
      initial: () => o.initial?.() ?? null,
      // Up from the buttons along the bottom goes to the nearest control in the game above,
      // never past it to the header (spatial focus alone can jump to Odds).
      capture: (a) => {
        const active = document.activeElement as HTMLElement | null;
        if (a !== 'up' || !active || !this.actions.contains(active)) return false;
        const from = active.getBoundingClientRect();
        const pool = [...Array.from(this.body.querySelectorAll<HTMLElement>('button:not([disabled]), [data-nav]')), ...this.chipBtns.filter((b) => !b.disabled)].filter((e) => e.offsetParent !== null && !e.closest('.hidden'));
        let best: HTMLElement | null = null;
        let score = Infinity;
        for (const e of pool) {
          const r = e.getBoundingClientRect();
          if (r.bottom > from.top + 4) continue;
          const dy = from.top - r.bottom;
          const dx = Math.abs(r.left + r.width / 2 - (from.left + from.width / 2));
          const sc = dy + dx * 0.6;
          if (sc < score) {
            score = sc;
            best = e;
          }
        }
        if (!best) return false;
        sound.click();
        best.focus({ preventScroll: false });
        best.scrollIntoView({ block: 'nearest' });
        return true;
      },
    };
    this.paintCredits();
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.host.ctx.ui.open(this.panel);
    if (this.o.coach && !this.host.save.data.coached[this.o.id]) this.host.save.update((d) => (d.coached[this.o.id] = true));
    this.off = this.host.eco.onChange(() => this.paintCredits());
    this.paintCredits();
  }

  close(): void {
    if (this.sheet) this.host.ctx.ui.close(this.sheet);
    if (this.open) this.host.ctx.ui.close(this.panel);
  }

  status(text: string, tone: 'good' | 'bad' | '' = ''): void {
    if (this.statusEl.textContent !== text) this.statusEl.textContent = text;
    this.statusEl.dataset.tone = tone;
  }

  /** The chip value: your bet, or what one placement adds. */
  get chip(): number {
    return this.chipValue;
  }

  setAlt(label: string | null, glow = false): void {
    if (!this.altBtn) return;
    this.altBtn.classList.toggle('hidden', !label);
    if (label) this.altBtn.textContent = label;
    this.altBtn.classList.toggle('glow', glow);
  }

  paintChips(): void {
    if (!this.chipRow) return;
    const chips = chipsFor(this.host.eco.rank, this.o.game);
    if (!chips.includes(this.chipValue)) this.chipValue = chips.filter((c) => c <= this.chipValue).pop() ?? chips[0];
    if (this.chipBtns.length !== chips.length) {
      this.chipRow.replaceChildren();
      this.chipBtns = chips.map((c) => {
        const b = button(formatCredits(c), () => this.pick(c), `gp-chip gp-chip-${c}`);
        b.setAttribute('aria-pressed', 'false');
        this.chipRow!.appendChild(b);
        return b;
      });
    }
    this.chipBtns.forEach((b, i) => {
      const on = chips[i] === this.chipValue;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.disabled = this.locked && !on;
    });
  }

  private pick(c: number): void {
    if (this.locked) return;
    this.chipValue = c;
    if (this.o.chips === 'bet') this.host.setBet(c);
    sound.chip();
    this.paintChips();
    this.onChip?.(c);
  }

  private stepChip(d: number): void {
    if (!this.chipRow || this.locked) return;
    const chips = chipsFor(this.host.eco.rank, this.o.game);
    const i = chips.indexOf(this.chipValue);
    this.pick(chips[Math.max(0, Math.min(chips.length - 1, i + d))]);
  }

  private paintCredits(): void {
    const t = formatCredits(this.host.eco.shown);
    if (this.creditsEl.textContent !== t) this.creditsEl.textContent = t;
  }

  private openSheet(title: string, content: (HTMLElement | string)[]): void {
    const ok = button('Got it', () => this.host.ctx.ui.close(sheet), 'primary');
    const sheet: Panel = {
      el: h('div', { class: 'card gp-sheet' }, h('h2', {}, title), ...content, h('div', { class: 'actions' }, ok)),
      onBack: () => this.host.ctx.ui.close(sheet),
      onClose: () => (this.sheet = null),
      initial: () => ok,
    };
    this.sheet = sheet;
    this.host.ctx.ui.open(sheet);
  }

  private showHelp(): void {
    this.openSheet(`How to play`, [h('ol', { class: 'gp-rules' }, ...this.o.help.map((l) => h('li', {}, l)))]);
  }

  private showOdds(): void {
    this.openSheet(`${this.o.title}: the odds`, this.o.odds());
  }

  dispose(): void {
    this.close();
    this.off();
  }
}

/** An odds table: rows of [what, pays, chance]. */
export function oddsTable(rows: [string, string, string?][], note?: string): (HTMLElement | string)[] {
  const t = h('table', { class: 'gp-odds' }, h('thead', {}, h('tr', {}, h('th', {}, 'Result'), h('th', {}, 'Pays'), rows.some((r) => r[2]) ? h('th', {}, 'Chance') : null)), h('tbody', {}, ...rows.map(([a, b, c]) => h('tr', {}, h('td', {}, a), h('td', {}, b), c ? h('td', {}, c) : null))));
  return note ? [t, h('p', { class: 'gp-note' }, note)] : [t];
}
