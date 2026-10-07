// The casino's own HUD: a brass-framed card with the credits odometer, your
// bet, this visit's net, and the rank badge whose ring fills with stamps.
// Banners, pops and cards come from the kit HUD.

import { RANKS, nextStamp, rankOf, STAMP_INFO } from '../../shared/casino/progress';
import type { CasinoStats } from '../../shared/slots';
import { h } from '../../ui/ui';
import { formatCredits } from '../common';
import { sound } from './audio';

const RING = 2 * Math.PI * 17;

/** A small brass anchor for the rank badge (drawn, so no emoji font is needed). */
export const ANCHOR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><path d="M12 7.2V21"/><path d="M7.5 11h9"/><path d="M4 14c0 4 4 7 8 7s8-3 8-7"/><path d="M4 14l-1.5 1.5M20 14l1.5 1.5"/></svg>';

export class CasinoHud {
  readonly root: HTMLElement;
  private credits: HTMLElement;
  private bet: HTMLElement;
  private net: HTMLElement;
  private ring: SVGCircleElement;
  private rankName: HTMLElement;
  private rankCount: HTMLElement;
  private next: HTMLElement;
  private badge: HTMLElement;
  private shown = 0;
  private target = 0;
  private rollFrom = 0;
  private rollT = 1;
  private rollDur = 0.6;
  private lastTick = 0;
  private stampQueue: string[] = [];
  private stampT = 0;
  private stampEl: HTMLElement;

  constructor(private parent: HTMLElement) {
    this.credits = h('b', { class: 'ch-odo' }, '...');
    this.bet = h('span', { class: 'ch-bet' }, 'Bet 10');
    this.net = h('span', { class: 'ch-net' });
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 40 40');
    svg.setAttribute('class', 'ch-ring');
    const track = document.createElementNS(NS, 'circle');
    track.setAttribute('cx', '20');
    track.setAttribute('cy', '20');
    track.setAttribute('r', '17');
    track.setAttribute('class', 'ch-ring-track');
    this.ring = document.createElementNS(NS, 'circle');
    this.ring.setAttribute('cx', '20');
    this.ring.setAttribute('cy', '20');
    this.ring.setAttribute('r', '17');
    this.ring.setAttribute('class', 'ch-ring-fill');
    this.ring.setAttribute('stroke-dasharray', String(RING));
    this.ring.setAttribute('stroke-dashoffset', String(RING));
    svg.append(track, this.ring);
    this.rankName = h('b', { class: 'ch-rank-name' }, 'Deckhand');
    this.rankCount = h('span', { class: 'ch-rank-count' });
    this.next = h('span', { class: 'ch-next' });
    const anchor = h('span', { class: 'ch-anchor', 'aria-hidden': 'true' });
    anchor.innerHTML = ANCHOR_SVG;
    this.badge = h('div', { class: 'ch-badge' }, svg as unknown as HTMLElement, anchor);
    this.stampEl = h('div', { class: 'ch-stamp-card hidden' });
    this.root = h(
      'div',
      { class: 'ch-hud', role: 'status' },
      h('div', { class: 'ch-top' }, h('small', {}, 'Play credits'), this.credits),
      h('div', { class: 'ch-row' }, this.bet, this.net),
      h('div', { class: 'ch-rank' }, this.badge, h('div', { class: 'ch-rank-text' }, h('div', {}, this.rankName, ' ', this.rankCount), this.next)),
    );
    parent.append(this.root, this.stampEl);
    parent.classList.add('has-casino-hud');
  }

  /** Rolls the odometer to a new balance; rolls up tick like coins. */
  setCredits(n: number, opts: { instant?: boolean } = {}): void {
    if (n === this.target && !opts.instant) return;
    if (opts.instant || this.credits.textContent === '...') {
      this.shown = this.target = n;
      this.rollT = 1;
      this.credits.textContent = formatCredits(n);
      return;
    }
    this.rollFrom = this.shown;
    this.target = n;
    this.rollT = 0;
    const d = Math.abs(n - this.rollFrom);
    this.rollDur = n > this.rollFrom ? Math.min(2.6, 0.5 + Math.log10(1 + d) * 0.55) : 0.35;
  }

  setBet(bet: number): void {
    const t = `Bet ${formatCredits(bet)}`;
    if (this.bet.textContent !== t) {
      this.bet.textContent = t;
      this.bet.classList.remove('flip');
      void this.bet.offsetWidth;
      this.bet.classList.add('flip');
    }
  }

  setNet(net: number): void {
    const t = net === 0 ? 'Even this visit' : `${net > 0 ? '▲ +' : '▼ -'}${formatCredits(Math.abs(net))} this visit`;
    if (this.net.textContent !== t) this.net.textContent = t;
    this.net.dataset.tone = net > 0 ? 'up' : net < 0 ? 'down' : '';
  }

  setRank(s: CasinoStats | null, hint = true): void {
    const have = s?.stamps?.length ?? 0;
    const rank = s ? rankOf(s) : 0;
    const cur = RANKS[rank];
    const nxt = RANKS[rank + 1];
    this.rankName.textContent = cur.name;
    this.rankCount.textContent = nxt ? `${have} of ${nxt.stamps}` : `${have} stamps`;
    const frac = nxt ? (have - cur.stamps) / (nxt.stamps - cur.stamps) : 1;
    this.ring.setAttribute('stroke-dashoffset', String(RING * (1 - Math.max(0, Math.min(1, frac)))));
    const ns = s && hint ? nextStamp(s) : null;
    const t = ns ? `Next: ${ns.hint.charAt(0).toLowerCase()}${ns.hint.slice(1)}` : '';
    if (this.next.textContent !== t) this.next.textContent = t;
    this.root.dataset.rank = String(rank);
  }

  /** A brass stamp slams onto a card that flies into the badge. */
  stamp(ids: string[]): void {
    this.stampQueue.push(...ids);
  }

  update(dt: number): void {
    if (this.rollT < 1) {
      this.rollT = Math.min(1, this.rollT + dt / this.rollDur);
      const e = 1 - (1 - this.rollT) ** 3;
      const v = Math.round(this.rollFrom + (this.target - this.rollFrom) * e);
      if (v !== this.shown) {
        this.shown = v;
        this.credits.textContent = formatCredits(v);
        const now = performance.now();
        if (this.target > this.rollFrom && now - this.lastTick > 70) {
          this.lastTick = now;
          sound.click();
        }
      }
      this.credits.classList.toggle('rolling', this.rollT < 1);
    }
    if (this.stampT > 0) {
      this.stampT -= dt;
      if (this.stampT <= 0) this.stampEl.classList.add('hidden');
    } else if (this.stampQueue.length) {
      const id = this.stampQueue.shift()!;
      const info = STAMP_INFO[id];
      this.stampEl.replaceChildren(h('div', { class: 'ch-stamp-ink' }, h('small', {}, 'Logbook stamp'), h('b', {}, info?.name ?? id)));
      this.stampEl.classList.remove('hidden', 'go');
      void this.stampEl.offsetWidth;
      this.stampEl.classList.add('go');
      this.stampT = 1.7;
      sound.stamp();
      this.badge.classList.remove('pulse');
      void this.badge.offsetWidth;
      this.badge.classList.add('pulse');
    }
  }

  get busyStamping(): boolean {
    return this.stampT > 0 || this.stampQueue.length > 0;
  }

  dispose(): void {
    this.root.remove();
    this.stampEl.remove();
    this.parent.classList.remove('has-casino-hud');
  }
}
