// Five Card Cabin: Jacks or Better video poker on three brass cabinets in
// the Moonlight Lounge. Deal five, choose the cards to hold, draw. The 6/5
// paytable lights the hand you make; Hint shows the holds the strategy list
// recommends and says why. The server keeps the deck; your hand waits if you
// leave.

import * as THREE from 'three';
import { POKER_PAYTABLE, holdAdvice, holdReason, type PokerHandRank } from '../../../shared/casino/poker';
import { cardRank, cardSuit } from '../../../shared/casino-games';
import type { PlayerState, SpaceAction } from '../../../world/space';
import { button, h } from '../../../ui/ui';
import { DISPLAY_FONT } from '../../../world/kit';
import { formatCredits } from '../../common';
import { sound } from '../audio';
import { Batch } from '../batch';
import { frame, type Framing } from '../director';
import type { PokerView } from '../economy';
import type { Host } from '../host';
import { POKER_CABINETS, SPOTS } from '../layout';
import { C, canvasTex } from '../materials';
import { TablePanel, oddsTable } from '../panel';

const SUIT: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export class FiveCardCabin {
  private screens: { tex: THREE.CanvasTexture; key: string }[] = [];
  private owned: { dispose(): void }[] = [];
  private panel: TablePanel | null = null;
  private view: PokerView | null = null;
  private holds = [false, false, false, false, false];
  private busy = false;
  private seat = 1;
  private hintOn = false;
  private cardBtns: HTMLButtonElement[] = [];
  private payRows = new Map<PokerHandRank, HTMLElement>();
  private dealBtn: HTMLButtonElement | null = null;
  private attract = 0;
  /** For playtests. */
  hands = 0;
  lastRank: PokerHandRank | null = null;

  constructor(private host: Host) {
    const own = <X extends { dispose(): void }>(x: X): X => {
      this.owned.push(x);
      return x;
    };
    const m = host.mats;
    const b = new Batch();
    const brass = new Batch();
    for (const c of POKER_CABINETS) {
      // Cabinet: a midnight body with brass trim, a sloped screen and a button deck, backs to the hull.
      b.add(new THREE.BoxGeometry(0.86, 1.0, 0.7), m.trim, c.x, 0.5, c.z, 0, 0, 0, '#1c1f45');
      b.add(new THREE.BoxGeometry(0.86, 0.9, 0.42), m.trim, c.x, 1.45, c.z + 0.12, 0, 0, 0, '#1c1f45');
      b.add(new THREE.BoxGeometry(0.9, 0.08, 0.5), m.trim, c.x, 1.92, c.z + 0.1, 0, 0, 0, '#262a5c');
      brass.add(new THREE.BoxGeometry(0.9, 0.04, 0.74), m.brass, c.x, 1.02, c.z);
      b.add(new THREE.BoxGeometry(0.8, 0.12, 0.3), m.trim, c.x, 1.05, c.z - 0.36, -0.3, 0, 0, '#262a5c');
      for (let i = 0; i < 5; i++) b.add(new THREE.BoxGeometry(0.1, 0.04, 0.08), m.trim, c.x - 0.28 + i * 0.14, 1.11, c.z - 0.38, -0.3, 0, 0, i === 4 ? C.jackpot : '#f4e7cc');
      // A stool.
      brass.add(new THREE.CylinderGeometry(0.04, 0.06, 0.62, 8), m.brass, c.x, 0.31, c.z - 1.05);
      b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16), m.trim, c.x, 0.66, c.z - 1.05, 0, 0, 0, '#3a3f8a');
      const tex = own(canvasTex(512, 384, () => {}, false));
      const screen = new THREE.Mesh(own(new THREE.PlaneGeometry(0.7, 0.52)), own(new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.65, roughness: 0.3 })));
      // The screen sits on the sloped upper face, facing the stool.
      screen.position.set(c.x, 1.45, c.z - 0.095);
      screen.rotation.set(-0.12, Math.PI, 0);
      host.scene.add(screen);
      this.screens.push({ tex, key: '' });
    }
    b.build(host.scene);
    brass.build(host.scene);
  }

  private paintScreen(i: number): void {
    const s = this.screens[i];
    const mine = i === this.seat && this.view && this.view.phase !== 'idle';
    const v = this.view;
    const key = mine ? `${v!.phase}|${v!.hand.join()}|${this.holds.join()}|${v!.rank}` : `attract|${Math.floor(this.attract) % 4}`;
    if (key === s.key) return;
    s.key = key;
    const c = s.tex.image as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    g.fillStyle = '#0c1430';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#9fb7e8';
    g.font = `34px ${DISPLAY_FONT}`;
    g.textAlign = 'center';
    g.fillText('FIVE CARD CABIN', W / 2, 42);
    const hand = mine ? v!.hand : ['AS', 'KS', 'QS', 'JS', '10S'];
    const cw = 84;
    hand.forEach((card, k) => {
      const x = 22 + k * (cw + 10);
      const y = 80;
      const held = mine && this.holds[k];
      const lit = !mine && Math.floor(this.attract) % 4 === k % 4;
      g.fillStyle = '#fffaf0';
      g.beginPath();
      g.roundRect(x, y + (held ? -10 : 0), cw, 120, 10);
      g.fill();
      if (lit) {
        g.strokeStyle = '#ffd24a';
        g.lineWidth = 5;
        g.stroke();
      }
      const red = cardSuit(card) === 'H' || cardSuit(card) === 'D';
      g.fillStyle = red ? '#c0242c' : '#1d1830';
      g.font = `46px ${DISPLAY_FONT}`;
      g.fillText(cardRank(card), x + cw / 2, y + 56 + (held ? -10 : 0));
      g.font = `40px serif`;
      g.fillText(SUIT[cardSuit(card)] ?? '', x + cw / 2, y + 100 + (held ? -10 : 0));
      if (held) {
        g.fillStyle = '#ffd24a';
        g.font = `26px ${DISPLAY_FONT}`;
        g.fillText('HOLD', x + cw / 2, y + 150);
      }
    });
    g.fillStyle = '#f4e7cc';
    g.font = `28px ${DISPLAY_FONT}`;
    if (mine && v!.phase === 'done') g.fillText(v!.rank && v!.rank !== 'nothing' ? `${POKER_PAYTABLE.find((p) => p.rank === v!.rank)?.label}: ${formatCredits(v!.win)}` : 'No win', W / 2, 330);
    else if (mine) g.fillText('Choose cards to hold', W / 2, 330);
    else g.fillText('Royal flush pays 800 for 1', W / 2, 330);
    s.tex.needsUpdate = true;
  }

  // -------------------------------------------------------------------------

  framing(): Framing {
    const c = POKER_CABINETS[this.seat];
    // Over your shoulder and above your cap, so your head never hides the screen or the deck.
    return frame(c.x + 0.5, 2.6, c.z - 2.2, c.x, 0.8, c.z, 50);
  }

  actions(_p: PlayerState, act: (label: string, short: string, run: () => void) => SpaceAction): SpaceAction[] {
    if (!this.host.eco.stats || this.host.eco.rank < 1) return [];
    const v = this.view ?? this.host.eco.hands?.poker ?? null;
    const waiting = v?.phase === 'deal';
    return [SPOTS.poker0, SPOTS.poker1, SPOTS.poker2].map((s, i) => ({ ...s, ...act(waiting ? 'Finish your poker hand' : 'Play Five Card Cabin', 'Poker', () => this.open(i)) }));
  }

  open(seat: number): void {
    if (this.panel?.open) return;
    const host = this.host;
    this.seat = seat;
    if (!this.view) {
      const v = host.eco.hands?.poker;
      if (v && v.phase !== 'idle') {
        this.view = v;
        this.holds = [...v.holds];
      }
    }
    const cards = h('div', { class: 'vp-cards' });
    this.cardBtns = [0, 1, 2, 3, 4].map((i) => {
      const b = button('', () => this.toggle(i), 'vp-card');
      cards.appendChild(b);
      return b;
    });
    const pay = h('div', { class: 'vp-pay' });
    this.payRows.clear();
    for (const p of POKER_PAYTABLE) {
      const row = h('div', { class: 'vp-pay-row' }, h('span', {}, p.label), h('b', {}, String(p.pays)));
      this.payRows.set(p.rank, row);
      pay.appendChild(row);
    }
    this.dealBtn = button('Deal', () => void this.play(), 'primary');
    const panel = new TablePanel(host, {
      id: 'poker',
      title: 'Five Card Cabin',
      game: 'poker',
      chips: 'bet',
      coach: 'Deal five cards, press the ones to keep, then draw.',
      help: ['Pick a bet and deal five cards.', 'Press the cards you want to keep. They lift up and say HOLD.', 'Draw replaces the rest. A pair of jacks or better pays.'],
      odds: () => oddsTable(POKER_PAYTABLE.map((p) => [p.label, `${p.pays} x bet`] as [string, string]), 'Played by the hint, Five Card Cabin returns about 95 in 100 over time. The royal flush pays 800 at every bet.'),
      alt: { label: 'Hint', run: () => this.hint() },
      initial: () => this.dealBtn,
      onClose: () => host.director.setSeat(null),
      wide: true,
    });
    panel.body.append(h('div', { class: 'vp-wrap' }, cards, pay));
    panel.actions.append(this.dealBtn);
    this.panel = panel;
    this.paint();
    panel.show();
    host.director.setSeat(this.framing());
    host.tried('poker');
  }

  private toggle(i: number): void {
    if (this.busy || this.view?.phase !== 'deal') return;
    this.holds[i] = !this.holds[i];
    sound.click();
    this.paint();
  }

  private hint(): void {
    const v = this.view;
    if (!v || v.phase !== 'deal') return;
    const advice = holdAdvice(v.hand);
    this.holds = advice;
    this.hintOn = true;
    sound.chime();
    this.panel?.status(holdReason(v.hand));
    this.paint(false);
  }

  private paint(status = true): void {
    const v = this.view;
    const p = this.panel;
    if (!p) return;
    const dealt = v && v.phase !== 'idle' ? v.hand : [];
    this.cardBtns.forEach((b, i) => {
      const card = dealt[i];
      b.replaceChildren();
      b.classList.toggle('held', v?.phase === 'deal' && this.holds[i]);
      b.classList.toggle('empty', !card);
      b.disabled = v?.phase !== 'deal' || this.busy;
      if (card) {
        const red = cardSuit(card) === 'H' || cardSuit(card) === 'D';
        b.classList.toggle('red', red);
        b.append(h('b', {}, cardRank(card)), h('i', {}, SUIT[cardSuit(card)] ?? ''), h('small', {}, v?.phase === 'deal' && this.holds[i] ? 'HOLD' : ''));
        b.setAttribute('aria-label', `${cardRank(card)} of ${{ S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[cardSuit(card)]}${this.holds[i] ? ', held' : ''}`);
      } else b.setAttribute('aria-label', 'No card');
    });
    for (const [rank, row] of this.payRows) row.classList.toggle('lit', v?.phase === 'done' && v.rank === rank);
    const drawing = v?.phase === 'deal';
    if (this.dealBtn) {
      this.dealBtn.textContent = drawing ? 'Draw' : `Deal (bet ${formatCredits(p.chip)})`;
      this.dealBtn.disabled = this.busy;
    }
    p.locked = drawing || this.busy;
    p.paintChips();
    p.setAlt(drawing ? 'Hint' : null, drawing && !this.host.save.data.tried['poker-hint']);
    if (!status) return;
    if (!v || v.phase === 'idle') p.status('Choose a bet and deal.');
    else if (drawing) p.status('Press the cards to hold, then draw.');
    else p.status(v.rank && v.rank !== 'nothing' ? `${POKER_PAYTABLE.find((x) => x.rank === v.rank)?.label}! ${formatCredits(v.win)} back.` : 'No win this time.', v.win > v.bet ? 'good' : '');
  }

  private async play(): Promise<void> {
    const host = this.host;
    const p = this.panel;
    if (this.busy || !p) return;
    const drawing = this.view?.phase === 'deal';
    const bet = p.chip;
    if (!drawing && !host.canAfford(bet, 'poker')) return;
    this.busy = true;
    if (!drawing) host.eco.hold(bet);
    if (this.hintOn) host.save.update((d) => (d.tried['poker-hint'] = true));
    this.paint(false);
    const r = await host.eco.play<{ hand: PokerView }>('poker', drawing ? { move: 'draw', holds: this.holds } : { move: 'deal', bet });
    this.busy = false;
    if (!r.ok) {
      if (!drawing) host.eco.release(bet);
      this.paint(false);
      p.status(r.code === 'offline' || r.code === 'bad_response' ? "Couldn't reach the boat. Your credits weren't touched." : `${r.error}.`, 'bad');
      sound.error();
      return;
    }
    const v = r.data.hand;
    this.view = v;
    sound.card();
    for (let i = 1; i < 5; i++) setTimeout(() => sound.card(), (i * 90) / host.timeScale());
    if (v.phase === 'deal') {
      this.holds = [false, false, false, false, false];
      this.hintOn = false;
      this.hands++;
    } else {
      this.lastRank = v.rank;
      const rankIdx = POKER_PAYTABLE.findIndex((x) => x.rank === v.rank);
      const at = new THREE.Vector3(POKER_CABINETS[this.seat].x, 1.6, POKER_CABINETS[this.seat].z - 0.6);
      if (v.win > 0) {
        host.cer.win({ paid: v.win, staked: v.bet, at, dir: { x: 0, z: -1 }, quiet: true });
        sound.bin(v.win / v.bet);
      } else sound.lose();
      if (rankIdx >= 0 && rankIdx <= 2) {
        if (rankIdx > 0) host.kit.banner(POKER_PAYTABLE[rankIdx].label.toUpperCase(), { sub: `${formatCredits(v.win)} play credits`, color: '#ffd24a', ms: 2600 });
        if (rankIdx === 0) void host.cer.jackpot({ kind: 'MAJOR', title: 'ROYAL FLUSH', mult: 800, credits: v.win, bet: v.bet, orbit: [this.framing()], at });
      }
    }
    host.eco.commit(r.data, drawing ? 0 : bet);
    this.paint();
    this.dealBtn?.focus({ preventScroll: true });
  }

  update(dt: number): void {
    this.attract += dt * 1.5;
    for (let i = 0; i < this.screens.length; i++) this.paintScreen(i);
  }

  dispose(): void {
    this.panel?.dispose();
    for (const o of this.owned) o.dispose();
  }
}
