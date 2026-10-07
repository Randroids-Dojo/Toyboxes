// Blackjack at two tables: Rivet's Twenty-One in the saloon and Captain Cog's
// high-limit Captain's Table in the wheelhouse. Cards slide from the shoe
// and flip over on the felt, then the panel mirrors them. Split, double,
// and a Hint that lights the move the strategy card recommends while the
// dealer says why. The server deals; your hand waits for you if you leave.

import * as THREE from 'three';
import { BJ_RULES, bjAdvice, bjAdviceReason, legalMoves, type BjMove, type BjRoundView, type BjTable } from '../../../shared/casino/blackjack';
import { cardRank, cardSuit, handValue, type Card } from '../../../shared/casino-games';
import type { GameId } from '../../../shared/casino/progress';
import type { PlayerState, SpaceAction } from '../../../world/space';
import { button, h } from '../../../ui/ui';
import { DISPLAY_FONT, keep } from '../../../world/kit';
import { formatCredits } from '../../common';
import { sound } from '../audio';
import { Batch } from '../batch';
import { frame, type Framing } from '../director';
import type { Host } from '../host';
import { C, canvasTex } from '../materials';
import { TablePanel, oddsTable } from '../panel';
import type { Staff, StaffId } from '../staff';

const TOP = 0.95;
const CW = 0.22;
const CH = 0.31;

// ---------------------------------------------------------------------------
// Cards

function suitPath(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number): void {
  g.save();
  g.translate(x, y);
  g.scale(size / 100, size / 100);
  g.beginPath();
  switch (s) {
    case 'H':
      g.moveTo(0, 35);
      g.bezierCurveTo(-60, -5, -45, -55, 0, -25);
      g.bezierCurveTo(45, -55, 60, -5, 0, 35);
      break;
    case 'D':
      g.moveTo(0, -45);
      g.lineTo(32, 0);
      g.lineTo(0, 45);
      g.lineTo(-32, 0);
      g.closePath();
      break;
    case 'S':
      g.moveTo(0, -45);
      g.bezierCurveTo(55, -5, 50, 35, 8, 22);
      g.lineTo(14, 45);
      g.lineTo(-14, 45);
      g.lineTo(-8, 22);
      g.bezierCurveTo(-50, 35, -55, -5, 0, -45);
      break;
    case 'C':
      g.arc(0, -22, 18, 0, Math.PI * 2);
      g.moveTo(-20, 8);
      g.arc(-20, 8, 18, 0, Math.PI * 2);
      g.moveTo(38, 8);
      g.arc(20, 8, 18, 0, Math.PI * 2);
      g.moveTo(6, 18);
      g.lineTo(14, 45);
      g.lineTo(-14, 45);
      g.lineTo(-6, 18);
      break;
  }
  g.fill();
  g.restore();
}

const cardTex = new Map<string, THREE.CanvasTexture>();

/** A card face (or the back, "??"), painted once and shared. */
export function cardTexture(card: Card): THREE.CanvasTexture {
  let t = cardTex.get(card);
  if (t) return t;
  t = canvasTex(
    256,
    360,
    (g, W, H) => {
      g.clearRect(0, 0, W, H);
      g.beginPath();
      g.roundRect(4, 4, W - 8, H - 8, 22);
      if (card === '??') {
        g.fillStyle = '#1d2a5a';
        g.fill();
        g.strokeStyle = '#e0ac45';
        g.lineWidth = 6;
        g.stroke();
        g.beginPath();
        g.roundRect(22, 22, W - 44, H - 44, 14);
        g.lineWidth = 3;
        g.stroke();
        g.strokeStyle = 'rgba(224,172,69,0.35)';
        g.lineWidth = 2;
        for (let i = -12; i < 20; i++) {
          g.beginPath();
          g.moveTo(i * 22, 22);
          g.lineTo(i * 22 + 300, 340);
          g.stroke();
        }
        g.fillStyle = '#e0ac45';
        g.beginPath();
        g.arc(W / 2, H / 2, 46, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#1d2a5a';
        g.font = `40px ${DISPLAY_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('GP', W / 2, H / 2 + 2);
        return;
      }
      g.fillStyle = '#fffaf0';
      g.fill();
      g.strokeStyle = '#c8b898';
      g.lineWidth = 3;
      g.stroke();
      const r = cardRank(card);
      const s = cardSuit(card);
      const red = s === 'H' || s === 'D';
      g.fillStyle = red ? '#c0242c' : '#1d1830';
      g.font = `64px ${DISPLAY_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(r, 44, 50);
      suitPath(g, s, 44, 106, 40);
      g.save();
      g.translate(W - 44, H - 50);
      g.rotate(Math.PI);
      g.fillText(r, 0, 0);
      g.restore();
      suitPath(g, s, W - 44, H - 106, 40);
      if (r === 'J' || r === 'Q' || r === 'K') {
        // A gilded medallion with the letter: our own simple court cards.
        g.fillStyle = red ? '#f6d8d0' : '#d8dcef';
        g.beginPath();
        g.roundRect(70, 80, W - 140, H - 160, 18);
        g.fill();
        g.strokeStyle = '#e0ac45';
        g.lineWidth = 5;
        g.stroke();
        g.fillStyle = red ? '#c0242c' : '#1d1830';
        g.font = `110px ${DISPLAY_FONT}`;
        g.fillText(r, W / 2, H / 2 + 4);
        suitPath(g, s, W / 2, H / 2 + 80, 34);
      } else if (r === 'A') {
        suitPath(g, s, W / 2, H / 2, 120);
      } else {
        const n = Number(r);
        const cols = n <= 3 ? [W / 2] : [W / 2 - 46, W / 2 + 46];
        const per = Math.ceil(n / cols.length);
        let k = 0;
        for (const x of cols) {
          for (let i = 0; i < per && k < n; i++, k++) {
            const y = per === 1 ? H / 2 : 92 + (i * (H - 184)) / (per - 1);
            suitPath(g, s, n === 3 && cols.length === 1 ? x : x, y, 36);
          }
        }
      }
    },
    false,
  );
  keep(t);
  cardTex.set(card, t);
  return t;
}

const RESULT_TEXT: Record<string, string> = {
  blackjack: 'Blackjack! Paid 3 to 2.',
  win: 'You win!',
  charlie: 'Six cards! You win.',
  push: 'Push: your bet comes back.',
  lose: 'The dealer wins.',
  bust: 'Bust! Over 21.',
};

function cardEl(c: Card, fresh: boolean): HTMLElement {
  if (c === '??') return h('span', { class: 'bj-card back', 'aria-label': 'Face-down card' });
  const s = cardSuit(c);
  const red = s === 'H' || s === 'D';
  const glyph = { S: '♠', H: '♥', D: '♦', C: '♣' }[s] ?? s;
  return h('span', { class: `bj-card${red ? ' red' : ''}${fresh ? ' fresh' : ''}`, 'aria-label': `${cardRank(c)} of ${{ S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[s]}` }, h('b', {}, cardRank(c)), h('i', {}, glyph));
}

interface CardMesh {
  group: THREE.Group;
  card: Card;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  faceUp: boolean;
  flipFrom: number;
}

export interface BlackjackOpts {
  table: BjTable;
  x: number;
  z: number;
  dealer: StaffId;
  title: string;
  spot: { x: number; z: number; range: number };
  label: string;
  short: string;
}

export class Blackjack {
  readonly group = new THREE.Group();
  private cards: CardMesh[] = [];
  private cardGeo: THREE.PlaneGeometry;
  private backMat: THREE.MeshStandardMaterial;
  private faceMats = new Map<string, THREE.MeshStandardMaterial>();
  private owned: { dispose(): void }[] = [];
  private panel: TablePanel | null = null;
  private view: BjRoundView | null = null;
  private busy = false;
  private hintMove: BjMove | null = null;
  private els: { dealer: HTMLElement; dTotal: HTMLElement; hands: HTMLElement; deal: HTMLButtonElement; hit: HTMLButtonElement; stand: HTMLButtonElement; dbl: HTMLButtonElement; split: HTMLButtonElement } | null = null;
  readonly game: GameId;
  /** For playtests. */
  lastHand: BjRoundView | null = null;
  hints = 0;

  constructor(
    private host: Host,
    private staff: Staff,
    readonly o: BlackjackOpts,
  ) {
    this.game = o.table === 'captain' ? 'captain' : 'blackjack';
    const own = <X extends { dispose(): void }>(x: X): X => {
      this.owned.push(x);
      return x;
    };
    const m = host.mats;
    const g = this.group;
    g.position.set(o.x, 0, o.z);
    host.scene.add(g);
    const captain = o.table === 'captain';
    const b = new Batch();
    const brass = new Batch();
    // Half-moon table, curve towards the player.
    b.add(new THREE.CylinderGeometry(1.8, 1.8, 0.9, 48, 1, false, -Math.PI / 2, Math.PI), m.trim, 0, 0.45, 0, 0, 0, 0, captain ? '#3a1e10' : C.mahogany);
    b.add(new THREE.BoxGeometry(3.6, 0.9, 0.1), m.trim, 0, 0.45, -0.05, 0, 0, 0, captain ? '#3a1e10' : C.mahogany);
    // Padded leather rail on the curve.
    b.add(new THREE.TorusGeometry(1.74, 0.08, 10, 48, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI), m.trim, 0, TOP + 0.03, 0, 0, 0, 0, '#2a120c');
    brass.add(new THREE.TorusGeometry(1.8, 0.022, 6, 48, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI), m.brass, 0, 0.86, 0);
    // The dealer's side: chip tray, shoe and discard rack.
    b.add(new THREE.BoxGeometry(1.1, 0.06, 0.26), m.trim, -0.2, TOP + 0.03, 0.18, 0, 0, 0, '#2a120c');
    const chipCols = ['#2b6f9e', '#2f8f5a', '#c8483a', '#23203a', '#7a4fb0', '#b8862e'];
    chipCols.forEach((c, i) => {
      for (let k = 0; k < 6; k++) b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 14), m.trim, -0.68 + i * 0.19, TOP + 0.07 + k * 0.013, 0.18, 0, 0, 0, c);
    });
    b.add(new THREE.BoxGeometry(0.32, 0.2, 0.44), m.trim, 0.95, TOP + 0.1, 0.32, 0, 0.25, 0, '#1d1830');
    brass.add(new THREE.BoxGeometry(0.34, 0.03, 0.46), m.brass, 0.95, TOP + 0.21, 0.32, 0, 0.25, 0);
    b.add(new THREE.BoxGeometry(0.28, 0.14, 0.36), m.trim, -0.98, TOP + 0.07, 0.3, 0, -0.25, 0, '#3a1a12');
    b.build(g);
    brass.build(g);
    // Felt: a half disc with the table's rules printed round it.
    const felt = own(
      canvasTex(
        1024,
        1024,
        (cg, W) => {
          const c = W / 2;
          cg.fillStyle = captain ? '#14513a' : C.felt;
          cg.fillRect(0, 0, W, W);
          for (let i = 0; i < 4000; i++) {
            cg.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
            cg.fillRect(Math.random() * W, Math.random() * W, 2, 2);
          }
          // Text follows arcs below the centre (towards the player).
          const arcText = (text: string, radius: number, size: number, color: string) => {
            cg.save();
            cg.fillStyle = color;
            cg.font = `${size}px ${DISPLAY_FONT}`;
            cg.textAlign = 'center';
            cg.textBaseline = 'middle';
            const span = (text.length * size * 0.52) / radius;
            for (let i = 0; i < text.length; i++) {
              const a = Math.PI / 2 + span / 2 - (i + 0.5) * (span / text.length);
              cg.save();
              cg.translate(c + Math.cos(a) * radius, c + Math.sin(a) * radius);
              cg.rotate(a - Math.PI / 2);
              cg.fillText(text[i], 0, 0);
              cg.restore();
            }
            cg.restore();
          };
          arcText(captain ? 'THE CAPTAIN’S TABLE' : 'RIVET’S TWENTY-ONE', 330, 40, 'rgba(224,172,69,0.9)');
          arcText('BLACKJACK PAYS 3 TO 2', 250, 30, 'rgba(255,246,224,0.85)');
          arcText(captain ? 'DEALER HITS SOFT 17 · SIX CARDS WIN' : 'DEALER STANDS ON ALL 17S', 205, 24, 'rgba(255,246,224,0.7)');
          cg.strokeStyle = 'rgba(255,246,224,0.6)';
          cg.lineWidth = 4;
          cg.beginPath();
          cg.arc(c, c + 400, 58, 0, Math.PI * 2);
          cg.stroke();
          cg.strokeStyle = 'rgba(224,172,69,0.5)';
          cg.beginPath();
          cg.arc(c, c, 470, 0, Math.PI);
          cg.stroke();
        },
        false,
      ),
    );
    const feltMesh = new THREE.Mesh(own(new THREE.CircleGeometry(1.7, 48, Math.PI, Math.PI).rotateX(-Math.PI / 2)), own(new THREE.MeshStandardMaterial({ map: felt, roughness: 0.95 })));
    feltMesh.position.y = TOP;
    feltMesh.receiveShadow = true;
    g.add(feltMesh);
    this.cardGeo = own(new THREE.PlaneGeometry(CW, CH).rotateX(-Math.PI / 2));
    this.backMat = own(new THREE.MeshStandardMaterial({ map: cardTexture('??'), roughness: 0.6, transparent: true, alphaTest: 0.5 }));
  }

  private faceMat(card: Card): THREE.MeshStandardMaterial {
    let m = this.faceMats.get(card);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ map: cardTexture(card), roughness: 0.6, transparent: true, alphaTest: 0.5 });
      this.owned.push(m);
      this.faceMats.set(card, m);
    }
    return m;
  }

  /** Where card i of a hand lies on the felt (table local). */
  private slot(row: 'dealer' | number, i: number, hands: number): THREE.Vector3 {
    if (row === 'dealer') return new THREE.Vector3(-0.25 + i * 0.17, TOP + 0.004 + i * 0.002, 0.62);
    const cx = hands > 1 ? (row === 0 ? -0.48 : 0.48) : 0;
    return new THREE.Vector3(cx - 0.12 + i * 0.13, TOP + 0.004 + i * 0.002, 1.18 - i * 0.04);
  }

  /** Brings the cards on the felt in line with a hand view, dealing the new ones in order. */
  private showCards(v: BjRoundView | null, animate: boolean): void {
    const want: { card: Card; at: THREE.Vector3; key: string }[] = [];
    if (v && v.phase !== 'idle') {
      // Deal order: player, dealer, player, dealer, then the rest.
      v.hands.forEach((hand, hi) => hand.cards.forEach((c, i) => want.push({ card: c, at: this.slot(hi, i, v.hands.length), key: `p${hi}:${i}` })));
      v.dealer.forEach((c, i) => want.push({ card: c, at: this.slot('dealer', i, 1), key: `d:${i}` }));
    }
    const shoe = new THREE.Vector3(0.95, TOP + 0.22, 0.32);
    const have = new Map(this.cards.map((c) => [c.group.userData.key as string, c]));
    const next: CardMesh[] = [];
    let delay = 0;
    const ts = this.host.timeScale();
    const order = (k: string) => (k.startsWith('p') ? Number(k.split(':')[1]) * 2 : Number(k.split(':')[1]) * 2 + 1);
    for (const w of [...want].sort((a, b) => order(a.key) - order(b.key))) {
      const cur = have.get(w.key);
      if (cur) {
        have.delete(w.key);
        cur.to.copy(w.at);
        if (cur.card !== w.card) {
          // The hole card turns over.
          cur.card = w.card;
          const front = cur.group.children[0] as THREE.Mesh;
          front.material = this.faceMat(w.card);
          cur.flipFrom = cur.group.rotation.z;
          cur.faceUp = true;
          cur.t = -delay;
          cur.dur = 0.35 / ts;
          cur.from.copy(cur.group.position);
          delay += 0.25 / ts;
        }
        next.push(cur);
        continue;
      }
      const grp = new THREE.Group();
      const front = new THREE.Mesh(this.cardGeo, w.card === '??' ? this.backMat : this.faceMat(w.card));
      const back = new THREE.Mesh(this.cardGeo, this.backMat);
      back.rotation.z = Math.PI;
      back.position.y = -0.001;
      front.castShadow = true;
      grp.add(front, back);
      grp.userData.key = w.key;
      grp.position.copy(animate ? shoe : w.at);
      grp.rotation.z = animate ? Math.PI : 0;
      this.group.add(grp);
      next.push({ group: grp, card: w.card, from: shoe.clone(), to: w.at.clone(), t: animate ? -delay : 1, dur: 0.38 / ts, faceUp: w.card !== '??', flipFrom: animate ? Math.PI : 0 });
      if (animate) delay += 0.28 / ts;
    }
    for (const gone of have.values()) this.group.remove(gone.group);
    this.cards = next;
  }

  // -------------------------------------------------------------------------

  framing(): Framing {
    const { x, z } = this.o;
    return frame(x, 3.1, z + 4.7, x, 0.25, z + 0.2, 50);
  }

  actions(_p: PlayerState, act: (label: string, short: string, run: () => void) => SpaceAction): SpaceAction[] {
    if (!this.host.eco.stats) return [];
    const v = this.currentView();
    const label = v?.phase === 'player' ? 'Finish your hand' : this.o.label;
    return [{ ...this.o.spot, ...act(label, this.o.short, () => this.open()) }];
  }

  private currentView(): BjRoundView | null {
    if (this.view) return this.view;
    const hands = this.host.eco.hands;
    const v = hands ? (this.o.table === 'captain' ? hands.captain : hands.blackjack) : null;
    return v && v.phase !== 'idle' ? v : null;
  }

  open(): void {
    if (this.panel?.open) return;
    const host = this.host;
    const v = this.currentView();
    this.view = v;
    const dealer = h('div', { class: 'bj-row bj-dealer' });
    const dTotal = h('span', { class: 'bj-total' });
    const hands = h('div', { class: 'bj-hands' });
    const deal = button('Deal', () => void this.move('deal'), 'primary');
    const hit = button('Hit', () => void this.move('hit'), 'primary');
    const stand = button('Stand', () => void this.move('stand'));
    const dbl = button('Double', () => void this.move('double'));
    const split = button('Split', () => void this.move('split'));
    this.els = { dealer, dTotal, hands, deal, hit, stand, dbl, split };
    const captain = this.o.table === 'captain';
    const panel = new TablePanel(host, {
      id: this.o.table,
      title: this.o.title,
      game: this.game,
      chips: 'bet',
      coach: captain ? 'Six cards without going over win at once here.' : 'Get closer to 21 than Rivet without going over.',
      help: [
        'Cards count their number. J, Q and K are 10. An ace is 1 or 11.',
        'Hit for a card, Stand to stop. Double takes one card for twice the bet. Split turns a pair into two hands.',
        captain ? 'Captain Cog hits soft 17. Blackjack pays 3 to 2.' : 'Rivet draws to 17 and stands. Blackjack pays 3 to 2.',
      ],
      odds: () =>
        oddsTable(
          [
            ['Blackjack', '3 to 2'],
            ['Win', '1 to 1'],
            captain ? ['Six cards without busting', '1 to 1'] : ['Push (a tie)', 'bet back'],
            ['A 21 after a split', '1 to 1'],
          ],
          'Played by the strategy card, blackjack returns about 99.5 in 100 over time: the best odds on the boat. Hint shows the card’s move.',
        ),
      alt: { label: 'Hint', run: () => this.hint() },
      initial: () => (this.view?.phase === 'player' ? hit : deal),
      onClose: () => {
        host.director.setSeat(null);
        this.els = null;
      },
    });
    panel.body.append(h('div', { class: 'bj-table' }, h('div', { class: 'bj-label' }, captain ? 'Captain Cog' : 'Rivet', dTotal), dealer, hands));
    panel.actions.append(split, dbl, stand, hit, deal);
    this.panel = panel;
    this.paint(false);
    if (v?.phase === 'player') panel.status('Your hand is still waiting. Your move.');
    panel.show();
    host.director.setSeat(this.framing());
    host.tried(this.game);
    this.staff.say(this.o.dealer, captain ? 'Welcome to my table.' : v?.phase === 'player' ? 'Your hand, as you left it.' : 'Dealer stands on 17.');
    if (!this.cards.length && v) this.showCards(v, false);
  }

  private paint(fresh: boolean): void {
    const e = this.els;
    const p = this.panel;
    if (!e || !p) return;
    const v = this.view;
    const playing = v?.phase === 'player';
    e.dealer.replaceChildren(...(v?.dealer ?? []).map((c, i) => cardEl(c, fresh && i >= (this.lastHand?.dealer.length ?? 0))));
    e.dTotal.textContent = v && v.dealer.length ? (v.dealer.includes('??') ? `${handValue(v.dealer.filter((c) => c !== '??')).total} showing` : String(handValue(v.dealer).total)) : '';
    e.hands.replaceChildren(
      ...(v?.hands ?? []).map((hand, hi) =>
        h(
          'div',
          { class: `bj-row bj-hand${playing && hi === v!.active && v!.hands.length > 1 ? ' active' : ''}` },
          h('span', { class: 'bj-label' }, v!.hands.length > 1 ? `Hand ${hi + 1}` : 'You', h('span', { class: 'bj-total' }, String(handValue(hand.cards).total))),
          ...hand.cards.map((c) => cardEl(c, false)),
          hand.result ? h('span', { class: `bj-result ${hand.result}` }, hand.result === 'blackjack' ? 'Blackjack' : hand.result === 'charlie' ? 'Six cards' : hand.result.charAt(0).toUpperCase() + hand.result.slice(1)) : null,
        ),
      ),
    );
    const legal = playing && v ? legalMoves({ table: v.table, phase: 'player', hands: v.hands, active: v.active, dealer: v.dealer }) : [];
    e.deal.classList.toggle('hidden', playing);
    for (const [btn, mv] of [[e.hit, 'hit'], [e.stand, 'stand'], [e.dbl, 'double'], [e.split, 'split']] as const) {
      btn.classList.toggle('hidden', !playing || !legal.includes(mv));
      btn.disabled = this.busy;
      btn.classList.toggle('glow', this.hintMove === mv);
    }
    e.deal.disabled = this.busy;
    e.deal.textContent = `Deal (bet ${formatCredits(p.chip)})`;
    p.locked = playing || this.busy;
    p.paintChips();
    p.setAlt(playing ? 'Hint' : null, !this.host.save.data.tried[`${this.o.table}-hint`]);
    if (!v || v.phase === 'idle') p.status(this.o.table === 'captain' ? 'Choose a bet and deal. Bets from 100.' : 'Choose a bet and deal.');
    else if (playing) {
      const hand = v.hands[v.active];
      p.status(`${v.hands.length > 1 ? `Hand ${v.active + 1}: ` : ''}${handValue(hand.cards).total}. Your move.`);
    } else {
      const results = v.hands.map((x) => RESULT_TEXT[x.result ?? 'lose']);
      const paid = v.hands.reduce((a, x) => a + x.payout, 0);
      p.status(`${v.hands.length > 1 ? results.map((r, i) => `Hand ${i + 1}: ${r}`).join(' ') : results[0]}${paid ? ` ${formatCredits(paid)} back.` : ''}`, paid > v.hands.reduce((a, x) => a + x.bet * (x.doubled ? 2 : 1), 0) ? 'good' : '');
    }
  }

  private hint(): void {
    const v = this.view;
    if (!v || v.phase !== 'player') return;
    const hand = v.hands[v.active];
    const legal = legalMoves({ table: v.table, phase: 'player', hands: v.hands, active: v.active, dealer: v.dealer });
    const move = bjAdvice(hand.cards, v.dealer[0], BJ_RULES[v.table], legal.includes('double'), legal.includes('split'));
    this.hintMove = move;
    this.hints++;
    sound.chime();
    this.staff.say(this.o.dealer, bjAdviceReason(hand.cards, v.dealer[0], move), 3.6);
    this.staff.get(this.o.dealer)?.play('point', 1);
    this.host.save.update((d) => (d.tried[`${this.o.table}-hint`] = true));
    this.paint(false);
  }

  private async move(m: 'deal' | BjMove): Promise<void> {
    const host = this.host;
    const p = this.panel;
    if (this.busy || !p) return;
    const bet = p.chip;
    if (m === 'deal' && !host.canAfford(bet, this.game)) return;
    if ((m === 'double' || m === 'split') && this.view && !host.canAfford(this.view.hands[this.view.active].bet, this.game)) return;
    this.busy = true;
    this.hintMove = null;
    const held = m === 'deal' ? bet : m === 'double' || m === 'split' ? (this.view?.hands[this.view.active].bet ?? 0) : 0;
    if (held) host.eco.hold(held);
    this.paint(false);
    const r = await host.eco.play<{ hand: BjRoundView }>('blackjack', { table: this.o.table, move: m, bet: m === 'deal' ? bet : undefined });
    if (!r.ok) {
      if (held) host.eco.release(held);
      this.busy = false;
      this.paint(false);
      p.status(r.code === 'offline' || r.code === 'bad_response' ? "Couldn't reach the boat. Your credits weren't touched." : `${r.error}.`, 'bad');
      sound.error();
      return;
    }
    const v = r.data.hand;
    const before = this.view;
    this.view = v;
    this.lastHand = v;
    if (m === 'deal') this.showCards(null, false);
    this.showCards(v, true);
    this.staff.get(this.o.dealer)?.play('deal', 0.6);
    sound.card();
    const cardsNew = (v.hands.reduce((a, x) => a + x.cards.length, 0) + v.dealer.length) - (before && m !== 'deal' ? before.hands.reduce((a, x) => a + x.cards.length, 0) + before.dealer.length : 0);
    for (let i = 1; i < Math.min(8, cardsNew); i++) setTimeout(() => sound.card(), (i * 280) / host.timeScale());
    // Let the cards land before the panel and the credits catch up.
    await new Promise((res) => setTimeout(res, (Math.min(6, Math.max(1, cardsNew)) * 280 + 250) / host.timeScale()));
    host.eco.commit(r.data, held);
    this.busy = false;
    if (v.phase === 'done') this.finished(v);
    this.paint(true);
    (v.phase === 'player' ? this.els?.hit : this.els?.deal)?.focus({ preventScroll: true });
  }

  private finished(v: BjRoundView): void {
    const host = this.host;
    const staked = v.hands.reduce((a, x) => a + x.bet * (x.doubled ? 2 : 1), 0);
    const paid = v.hands.reduce((a, x) => a + x.payout, 0);
    const at = this.group.localToWorld(new THREE.Vector3(0, TOP + 0.1, 1.0));
    if (v.hands.some((x) => x.result === 'blackjack')) {
      host.kit.banner('BLACKJACK', { sub: `Paid 3 to 2: ${formatCredits(paid)}`, color: '#ffd24a', ms: 2200 });
      sound.fanfare('small');
      this.staff.get(this.o.dealer)?.play('applaud', 1.6);
    } else if (v.hands.every((x) => x.result === 'bust')) {
      sound.lose();
      this.staff.get(this.o.dealer)?.play('shrug', 1.2);
      this.staff.say(this.o.dealer, 'Bust. Better luck next hand.');
    } else if (paid > staked) this.staff.get(this.o.dealer)?.play('applaud', 1.2);
    else if (paid === 0) sound.lose();
    if (paid > 0) host.cer.win({ paid, staked, at, dir: { x: 0, z: 1 }, quiet: true });
    // Tidy the felt a moment later.
    setTimeout(() => {
      if (this.view === v && v.phase === 'done') this.showCards(null, false);
    }, 4200 / host.timeScale());
  }

  update(dt: number): void {
    for (const c of this.cards) {
      if (c.t >= c.dur) continue;
      c.t += dt;
      const k = Math.max(0, Math.min(1, c.t / c.dur));
      const e = 1 - (1 - k) ** 3;
      c.group.position.lerpVectors(c.from, c.to, e);
      c.group.position.y += Math.sin(k * Math.PI) * 0.08;
      const flipTo = c.faceUp ? 0 : Math.PI;
      c.group.rotation.z = c.flipFrom + (flipTo - c.flipFrom) * e;
    }
  }

  debug() {
    return { view: this.view, cards: this.cards.length, busy: this.busy, hints: this.hints, open: !!this.panel?.open };
  }

  dispose(): void {
    this.panel?.dispose();
    for (const o of this.owned) o.dispose();
  }
}
