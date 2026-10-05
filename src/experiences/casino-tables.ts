// The casino's table games: roulette and blackjack. The server spins and
// deals; these tables animate the result and run the betting panels.

import * as THREE from 'three';
import { sfx } from '../audio/sfx';
import { api } from '../net/api';
import { ROULETTE_LABELS, WHEEL_ORDER, cardRank, cardSuit, handValue, pocketColor, type BjView, type Card, type RouletteBet, type RouletteType } from '../shared/casino-games';
import { BETS, type CasinoStats } from '../shared/slots';
import { button, h, type Panel } from '../ui/ui';
import { DISPLAY_FONT, cached, mesh, plastic, roundBox } from '../world/kit';
import { box, circle, type Collider } from '../world/physics';
import { formatCredits, type ExperienceCtx } from './common';

const TAU = Math.PI * 2;
const POCKET = TAU / 37;

export interface TableHost {
  ctx: ExperienceCtx;
  stats(): CasinoStats | null;
  setStats(s: CasinoStats): void;
  bet(): number;
  setBet(b: number): void;
  refill(): Promise<void>;
}

function betRow(host: TableHost, onPick: () => void, disabled: () => boolean): HTMLElement {
  const row = h('div', { class: 'seg' });
  const paint = () => row.querySelectorAll('.seg-btn').forEach((b, i) => b.classList.toggle('on', BETS[i] === host.bet()));
  for (const b of BETS) {
    const btn = button(String(b), () => {
      if (disabled()) return;
      host.setBet(b);
      paint();
      onPick();
    }, 'seg-btn');
    row.appendChild(btn);
  }
  paint();
  return row;
}

// ---------------------------------------------------------------------------
// Roulette

function wheelTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  const cx = 512;
  const cy = 512;
  g.fillStyle = '#5b3a1e';
  g.beginPath();
  g.arc(cx, cy, 512, 0, TAU);
  g.fill();
  WHEEL_ORDER.forEach((n, k) => {
    // Canvas y runs down while texture v runs up, so angles are mirrored here.
    const a0 = -(k - 0.5) * POCKET;
    const a1 = -(k + 0.5) * POCKET;
    const col = pocketColor(n);
    g.fillStyle = col === 'green' ? '#1f8a4c' : col === 'red' ? '#c8303f' : '#1d1830';
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, 500, a1, a0);
    g.closePath();
    g.fill();
    g.save();
    g.translate(cx, cy);
    g.rotate(-k * POCKET);
    g.fillStyle = '#fffaf0';
    g.font = `46px ${DISPLAY_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.translate(430, 0);
    g.rotate(Math.PI / 2);
    g.fillText(String(n), 0, 0);
    g.restore();
  });
  g.fillStyle = '#d9a838';
  g.beginPath();
  g.arc(cx, cy, 300, 0, TAU);
  g.fill();
  g.fillStyle = '#7a4a24';
  g.beginPath();
  g.arc(cx, cy, 270, 0, TAU);
  g.fill();
  g.strokeStyle = '#d9a838';
  g.lineWidth = 6;
  for (let k = 0; k < 37; k++) {
    const a = -(k - 0.5) * POCKET;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 300, cy + Math.sin(a) * 300);
    g.lineTo(cx + Math.cos(a) * 500, cy + Math.sin(a) * 500);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function feltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1f7a4d';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,250,240,0.85)';
  g.lineWidth = 4;
  g.fillStyle = '#fffaf0';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `34px ${DISPLAY_FONT}`;
  const x0 = 420;
  const cw = 46;
  const ch = 70;
  for (let col = 0; col < 12; col++) {
    for (let row = 0; row < 3; row++) {
      const n = col * 3 + (3 - row);
      const x = x0 + col * cw;
      const y = 60 + row * ch;
      g.fillStyle = pocketColor(n) === 'red' ? '#c8303f' : '#1d1830';
      g.fillRect(x + 4, y + 4, cw - 8, ch - 8);
      g.strokeRect(x, y, cw, ch);
      g.fillStyle = '#fffaf0';
      g.font = `24px ${DISPLAY_FONT}`;
      g.fillText(String(n), x + cw / 2, y + ch / 2);
    }
  }
  g.fillStyle = '#1f8a4c';
  g.strokeRect(x0 - 50, 60, 50, ch * 3);
  g.fillStyle = '#fffaf0';
  g.fillText('0', x0 - 25, 60 + ch * 1.5);
  const outside = ['1st 12', '2nd 12', '3rd 12'];
  outside.forEach((t, i) => {
    g.strokeRect(x0 + i * cw * 4, 60 + ch * 3, cw * 4, 60);
    g.fillText(t, x0 + i * cw * 4 + cw * 2, 60 + ch * 3 + 30);
  });
  const evens = ['1-18', 'EVEN', 'RED', 'BLACK', 'ODD', '19-36'];
  evens.forEach((t, i) => {
    g.strokeRect(x0 + i * cw * 2, 60 + ch * 3 + 60, cw * 2, 60);
    g.fillStyle = t === 'RED' ? '#ff6b6b' : '#fffaf0';
    g.font = `20px ${DISPLAY_FONT}`;
    g.fillText(t, x0 + i * cw * 2 + cw, 60 + ch * 3 + 90);
    g.fillStyle = '#fffaf0';
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class RouletteTable {
  readonly spot: { x: number; z: number };
  private wheel = new THREE.Group();
  private ball: THREE.Mesh;
  private spin: { t: number; dur: number; w0: number; dw: number; r0: number; dr: number; resolve: () => void } | null = null;
  private wheelAngle = 0;
  private ballRel = 0;
  private lastTick = 0;
  private readonly wheelPos: THREE.Vector3;
  history: number[] = [];

  constructor(scene: THREE.Scene, colliders: Collider[], x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const wood = plastic('#6b3f22', { rough: 0.6 });
    g.add(mesh(roundBox(3.8, 0.9, 2.0, 0.12), wood, 0, 0.45, 0));
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.9 }));
    felt.position.y = 0.93;
    felt.receiveShadow = true;
    g.add(felt);
    // The wheel sits in a bowl at the left end.
    const bowl = mesh(cached('rbowl', () => new THREE.CylinderGeometry(0.86, 0.8, 0.22, 48, 1, true)), plastic('#5b3a1e', { rough: 0.5 }), -1.3, 1.02, 0);
    g.add(bowl);
    g.add(mesh(cached('rrim', () => new THREE.TorusGeometry(0.86, 0.06, 10, 64).rotateX(Math.PI / 2)), plastic('#d9a838', { rough: 0.35 }), -1.3, 1.13, 0));
    this.wheel.position.set(-1.3, 1.0, 0);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.78, 74).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: wheelTexture(), roughness: 0.45 }));
    face.position.y = 0.04;
    this.wheel.add(face);
    this.wheel.add(mesh(cached('rhub', () => new THREE.ConeGeometry(0.16, 0.22, 12)), plastic('#d9a838', { rough: 0.3 }), 0, 0.13, 0));
    g.add(this.wheel);
    this.ball = mesh(cached('rball', () => new THREE.SphereGeometry(0.035, 14, 10)), plastic('#fbf8f0', { rough: 0.2 }), 0, 0, 0);
    g.add(this.ball);
    scene.add(g);
    colliders.push(box(x, z, 1.9, 1.0, 0, 1.0, 0.5, false));
    this.spot = { x, z: z + 1.65 };
    this.wheelPos = new THREE.Vector3(-1.3, 1.0, 0);
    this.placeBall(0.66, 0.12);
  }

  private placeBall(radius: number, lift: number): void {
    const a = this.wheelAngle + this.ballRel;
    this.ball.position.set(this.wheelPos.x + Math.cos(a) * radius, this.wheelPos.y + 0.06 + lift, this.wheelPos.z - Math.sin(a) * radius);
  }

  get spinning(): boolean {
    return !!this.spin;
  }

  /** Spins until the ball settles in the given pocket. */
  spinTo(pocket: number): Promise<void> {
    const k = WHEEL_ORDER.indexOf(pocket);
    const target = k * POCKET;
    const dur = 4.2;
    const dw = TAU * 1.6;
    // The ball runs the other way and ends on the pocket, relative to the wheel.
    let r1 = target - TAU * 5;
    while (r1 > this.ballRel - TAU * 4) r1 -= TAU;
    return new Promise((resolve) => {
      this.spin = { t: 0, dur, w0: this.wheelAngle, dw, r0: this.ballRel, dr: r1 - this.ballRel, resolve };
    });
  }

  update(dt: number): void {
    const sp = this.spin;
    if (sp) {
      sp.t += dt;
      const k = Math.min(1, sp.t / sp.dur);
      const ease = 1 - (1 - k) ** 3;
      this.wheelAngle = sp.w0 + sp.dw * (1 - (1 - k) ** 2);
      this.ballRel = sp.r0 + sp.dr * ease;
      const drop = Math.min(1, Math.max(0, (k - 0.62) / 0.3));
      const bounce = drop > 0 && drop < 1 ? Math.abs(Math.sin(drop * Math.PI * 3)) * 0.05 * (1 - drop) : 0;
      this.placeBall(0.66 - drop * 0.12, 0.12 - drop * 0.1 + bounce);
      const tick = Math.floor((this.wheelAngle + this.ballRel) / POCKET);
      if (tick !== this.lastTick && k > 0.5) sfx.reelTick();
      this.lastTick = tick;
      if (k >= 1) {
        this.spin = null;
        sfx.reelStop();
        sp.resolve();
      }
    } else {
      // The wheel keeps turning slowly with the ball sitting in it.
      this.wheelAngle += dt * 0.25;
      this.placeBall(0.54, 0.02);
    }
    this.wheel.rotation.y = this.wheelAngle;
  }
}

export function openRoulette(host: TableHost, table: RouletteTable): Panel {
  const ui = host.ctx.ui;
  let pick: RouletteBet = { type: 'red' };
  let lucky = 17;
  const status = h('p', { class: 'table-status', role: 'status' }, 'Pick a bet and spin.');
  const credits = h('span', { class: 'table-credits' });
  const recent = h('div', { class: 'recent' });
  const paintCredits = () => (credits.textContent = `Credits ${formatCredits(host.stats()?.balance ?? 0)}`);
  const paintRecent = () =>
    recent.replaceChildren(...table.history.slice(0, 8).map((n) => h('span', { class: `pocket ${pocketColor(n)}` }, String(n))));
  const pickButtons: HTMLButtonElement[] = [];
  const types: RouletteType[] = ['red', 'black', 'odd', 'even', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'number'];
  const luckyLabel = h('span', { class: 'lucky' }, String(lucky));
  const paintPicks = () => {
    types.forEach((t, i) => pickButtons[i].classList.toggle('on', pick.type === t));
    luckyLabel.textContent = String(lucky);
  };
  const picks = h('div', { class: 'picks' });
  for (const t of types) {
    const b = button(t === 'number' ? 'Lucky number' : ROULETTE_LABELS[t], () => {
      pick = t === 'number' ? { type: 'number', number: lucky } : { type: t };
      paintPicks();
    }, `pick pick-${t}`);
    pickButtons.push(b);
    picks.appendChild(b);
  }
  const less = button('‹', () => {
    lucky = (lucky + 36) % 37;
    pick = { type: 'number', number: lucky };
    paintPicks();
  }, 'ghost icon-btn');
  less.setAttribute('aria-label', 'Lower lucky number');
  const more = button('›', () => {
    lucky = (lucky + 1) % 37;
    pick = { type: 'number', number: lucky };
    paintPicks();
  }, 'ghost icon-btn');
  more.setAttribute('aria-label', 'Higher lucky number');
  const go = button('Spin the wheel', () => void spin(), 'primary');
  const spin = async () => {
    const st = host.stats();
    if (table.spinning || !st) return;
    if (st.balance < host.bet()) {
      if (st.balance < BETS[0]) await host.refill();
      else status.textContent = `Not enough credits for a ${host.bet()} bet.`;
      return;
    }
    go.disabled = true;
    status.textContent = 'No more bets...';
    sfx.lever();
    const r = await api.roulette(host.ctx.roomId, host.ctx.area.id, host.ctx.browserId, host.ctx.name(), host.bet(), pick);
    if (!r.ok) {
      go.disabled = false;
      status.textContent = `Couldn't spin: ${r.error}. Your credits weren't touched.`;
      return;
    }
    await table.spinTo(r.data.pocket);
    table.history.unshift(r.data.pocket);
    host.setStats(r.data.stats);
    const n = r.data.pocket;
    const colour = pocketColor(n);
    if (r.data.win > 0) {
      sfx.coins(r.data.win);
      status.textContent = `${n} ${colour}: you win ${formatCredits(r.data.win)}!`;
      if (pick.type === 'number') ui.banner(`${n}! WIN ${formatCredits(r.data.win)}`, '#ffd24a');
    } else {
      status.textContent = `${n} ${colour}. No win this time.`;
    }
    go.disabled = false;
    paintCredits();
    paintRecent();
  };
  const done = button('Done', () => ui.close(panel), 'ghost');
  const el = h(
    'div',
    { class: 'card table-panel' },
    h('div', { class: 'table-head' }, h('h2', {}, 'Roulette'), credits),
    h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, 'Bet'), betRow(host, paintCredits, () => table.spinning)),
    picks,
    h('div', { class: 'line lucky-row' }, h('span', { class: 'setting-label' }, 'Lucky number'), less, luckyLabel, more),
    status,
    recent,
    h('div', { class: 'actions table-actions' }, done, go),
  );
  const panel: Panel = { el, light: true, onBack: () => ui.close(panel), initial: () => go };
  paintPicks();
  paintCredits();
  paintRecent();
  ui.open(panel);
  return panel;
}

// ---------------------------------------------------------------------------
// Blackjack

const cardTextures = new Map<string, THREE.CanvasTexture>();

function cardTexture(card: Card): THREE.CanvasTexture {
  let t = cardTextures.get(card);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 224;
  const g = c.getContext('2d')!;
  g.fillStyle = card === '??' ? '#8a6bd1' : '#fffaf0';
  g.beginPath();
  g.roundRect(4, 4, 152, 216, 16);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#2b2340';
  g.stroke();
  if (card === '??') {
    g.strokeStyle = 'rgba(255,250,240,0.6)';
    g.lineWidth = 4;
    for (let i = -10; i < 20; i++) {
      g.beginPath();
      g.moveTo(i * 16, 0);
      g.lineTo(i * 16 + 224, 224);
      g.stroke();
    }
  } else {
    const suit = { S: '♠', H: '♥', D: '♦', C: '♣' }[cardSuit(card)]!;
    g.fillStyle = cardSuit(card) === 'H' || cardSuit(card) === 'D' ? '#c8303f' : '#1d1830';
    g.font = `64px ${DISPLAY_FONT}`;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(cardRank(card), 16, 12);
    g.font = '96px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(suit, 80, 132);
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.keep = true;
  cardTextures.set(card, t);
  return t;
}

export class BlackjackTable {
  readonly spot: { x: number; z: number };
  /** The table top as a circle, for collisions and playtests. */
  readonly centre: { x: number; z: number; r: number };
  private group = new THREE.Group();
  private cards = new THREE.Group();
  private dealerArm: THREE.Group;
  private dealerHead: THREE.Group;
  private gesture = 0;
  private time = 0;
  hand: BjView | null = null;

  constructor(scene: THREE.Scene, colliders: Collider[], x: number, z: number) {
    const g = this.group;
    g.position.set(x, 0, z);
    const wood = plastic('#6b3f22', { rough: 0.6 });
    const felt = plastic('#1f7a4d', { rough: 0.9 });
    // Half-moon table: the curve faces the player.
    g.add(mesh(cached('bjbase', () => new THREE.CylinderGeometry(1.8, 1.8, 0.86, 48, 1, false, -Math.PI / 2, Math.PI)), wood, 0, 0.43, -0.6));
    g.add(mesh(cached('bjtop', () => new THREE.CylinderGeometry(1.7, 1.7, 0.06, 48, 1, false, -Math.PI / 2, Math.PI)), felt, 0, 0.9, -0.6));
    g.add(mesh(cached('bjrim', () => new THREE.TorusGeometry(1.75, 0.07, 10, 48, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI)), plastic('#d9a838', { rough: 0.35 }), 0, 0.93, -0.6));
    // Shoe and chips.
    g.add(mesh(roundBox(0.3, 0.2, 0.42, 0.04), plastic('#2b2340', { rough: 0.5 }), 1.0, 1.03, -0.4));
    ['#e8574a', '#4aa3df', '#fbf8f0', '#2b2340'].forEach((c, i) => {
      for (let k = 0; k < 5; k++) g.add(mesh(cached('chip', () => new THREE.CylinderGeometry(0.11, 0.11, 0.04, 14)), plastic(c), -1.0 + i * 0.25, 0.95 + k * 0.045, -0.35, { cast: false }));
    });
    // The robot dealer.
    const dealer = new THREE.Group();
    dealer.position.set(0, 0, -1.25);
    const metal = plastic('#9aa4b8', { rough: 0.35 });
    dealer.add(mesh(roundBox(0.8, 1.0, 0.5, 0.12), metal, 0, 1.15, 0));
    dealer.add(mesh(roundBox(0.3, 0.12, 0.08, 0.03), plastic('#c8303f'), 0, 1.55, 0.27));
    this.dealerHead = new THREE.Group();
    this.dealerHead.position.set(0, 1.95, 0);
    this.dealerHead.add(mesh(roundBox(0.62, 0.5, 0.5, 0.12), metal, 0, 0, 0));
    this.dealerHead.add(mesh(roundBox(0.5, 0.3, 0.06, 0.05), plastic('#1d1830', { rough: 0.2 }), 0, 0, 0.25));
    const eye = plastic('#53f0c0', { emissive: '#53f0c0', emissiveIntensity: 1.2 });
    for (const sx of [-0.12, 0.12]) this.dealerHead.add(mesh(cached('beye', () => new THREE.SphereGeometry(0.05, 10, 8)), eye, sx, 0.02, 0.29, { cast: false }));
    this.dealerHead.add(mesh(cached('bant', () => new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6)), metal, 0, 0.38, 0));
    this.dealerHead.add(mesh(cached('bantb', () => new THREE.SphereGeometry(0.06, 10, 8)), plastic('#ffd24a', { emissive: '#ffb21e', emissiveIntensity: 0.8 }), 0, 0.55, 0));
    dealer.add(this.dealerHead);
    this.dealerArm = new THREE.Group();
    this.dealerArm.position.set(0.48, 1.45, 0);
    this.dealerArm.add(mesh(roundBox(0.14, 0.6, 0.14, 0.05), metal, 0, -0.3, 0));
    dealer.add(this.dealerArm);
    const arm2 = mesh(roundBox(0.14, 0.6, 0.14, 0.05), metal, -0.48, 1.15, 0);
    dealer.add(arm2);
    g.add(dealer);
    g.add(this.cards);
    scene.add(g);
    // The half-moon top is a half disc centred on the flat edge; one circle covers it and the dealer's side.
    this.centre = { x, z: z - 0.6, r: 1.8 };
    colliders.push(circle(x, z - 0.6, 1.8, 1.0, 0.5, false), circle(x, z - 1.25, 0.5, 2.2, 0.5, false));
    // Where you stand against the rim to play.
    this.spot = { x, z: z + 1.8 };
  }

  show(hand: BjView | null): void {
    this.hand = hand;
    this.cards.clear();
    if (!hand) return;
    const lay = (cards: Card[], zz: number) =>
      cards.forEach((c, i) => {
        const m = new THREE.Mesh(cached('cardgeo', () => new THREE.PlaneGeometry(0.22, 0.31).rotateX(-Math.PI / 2)), new THREE.MeshStandardMaterial({ map: cardTexture(c), roughness: 0.6 }));
        m.position.set(-0.3 + i * 0.26 - (cards.length - 1) * 0.04, 0.94 + i * 0.002, zz);
        m.rotation.y = (i - (cards.length - 1) / 2) * 0.05;
        this.cards.add(m);
      });
    lay(hand.dealer, -0.85);
    lay(hand.player, 0.05);
    this.gesture = 0.6;
  }

  update(dt: number): void {
    this.time += dt;
    this.gesture = Math.max(0, this.gesture - dt);
    this.dealerArm.rotation.x = -Math.sin((this.gesture / 0.6) * Math.PI) * 1.2;
    this.dealerHead.rotation.y = Math.sin(this.time * 0.7) * 0.25;
    this.dealerHead.position.y = 1.95 + Math.sin(this.time * 2) * 0.02;
  }
}

function cardEl(c: Card): HTMLElement {
  if (c === '??') return h('span', { class: 'pcard back', 'aria-label': 'Face-down card' });
  const suit = { S: '♠', H: '♥', D: '♦', C: '♣' }[cardSuit(c)]!;
  const red = cardSuit(c) === 'H' || cardSuit(c) === 'D';
  return h('span', { class: `pcard${red ? ' red' : ''}` }, h('b', {}, cardRank(c)), h('i', {}, suit));
}

const RESULT_TEXT: Record<string, string> = {
  blackjack: 'Blackjack! Paid 3 to 2.',
  win: 'You win!',
  push: 'Push: your bet comes back.',
  lose: 'The dealer wins.',
  bust: 'Bust! Over 21.',
};

export function openBlackjack(host: TableHost, table: BlackjackTable): Panel {
  const ui = host.ctx.ui;
  let busy = false;
  const credits = h('span', { class: 'table-credits' });
  const dealerRow = h('div', { class: 'hand' });
  const playerRow = h('div', { class: 'hand' });
  const dealerTotal = h('span', { class: 'total' });
  const playerTotal = h('span', { class: 'total' });
  const status = h('p', { class: 'table-status', role: 'status' });
  const deal = button('Deal', () => void move('deal'), 'primary');
  const hit = button('Hit', () => void move('hit'), 'primary');
  const stand = button('Stand', () => void move('stand'), '');
  const dbl = button('Double', () => void move('double'), '');
  const bets = betRow(host, () => paint(), () => busy || table.hand?.phase === 'player');
  const betSetting = h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, 'Bet'), bets);
  const paint = () => {
    const hand = table.hand;
    credits.textContent = `Credits ${formatCredits(host.stats()?.balance ?? 0)}`;
    const playing = hand?.phase === 'player';
    dealerRow.replaceChildren(...(hand?.dealer ?? []).map(cardEl));
    playerRow.replaceChildren(...(hand?.player ?? []).map(cardEl));
    dealerTotal.textContent = hand && hand.dealer.length && !hand.dealer.includes('??') ? String(handValue(hand.dealer).total) : hand?.dealer.length ? '?' : '';
    playerTotal.textContent = hand?.player.length ? String(handValue(hand.player).total) : '';
    deal.classList.toggle('hidden', playing);
    betSetting.classList.toggle('hidden', playing);
    hit.classList.toggle('hidden', !playing);
    stand.classList.toggle('hidden', !playing);
    dbl.classList.toggle('hidden', !playing || (hand?.player.length ?? 0) !== 2);
    for (const b of [deal, hit, stand, dbl]) b.disabled = busy;
    if (!hand || hand.phase === 'idle') status.textContent = 'Choose a bet and deal. Dealer stands on 17.';
    else if (playing) status.textContent = `Your move. Bet ${hand.bet}.`;
    else status.textContent = `${RESULT_TEXT[hand.result ?? 'lose']}${hand.payout ? ` ${formatCredits(hand.payout)} back.` : ''}`;
  };
  const move = async (m: 'deal' | 'hit' | 'stand' | 'double') => {
    if (busy) return;
    const st = host.stats();
    if (m === 'deal' && st && st.balance < host.bet()) {
      if (st.balance < BETS[0]) await host.refill();
      else status.textContent = `Not enough credits for a ${host.bet()} bet.`;
      return;
    }
    busy = true;
    paint();
    const r = await api.blackjack(host.ctx.roomId, host.ctx.area.id, host.ctx.browserId, host.ctx.name(), m, m === 'deal' ? host.bet() : undefined);
    busy = false;
    if (!r.ok) {
      paint();
      status.textContent = `${r.error}.`;
      return;
    }
    sfx.place();
    table.show(r.data.hand);
    host.setStats(r.data.stats);
    const res = r.data.hand.result;
    if (r.data.hand.phase === 'done') {
      if (res === 'blackjack') {
        sfx.jackpot();
        ui.banner('BLACKJACK!', '#ffd24a');
      } else if (res === 'win') sfx.coins(r.data.hand.payout);
      else if (res === 'push') sfx.ding(false);
      else sfx.error();
    }
    paint();
    (r.data.hand.phase === 'player' ? hit : deal).focus({ preventScroll: true });
  };
  const done = button('Done', () => ui.close(panel), 'ghost');
  const el = h(
    'div',
    { class: 'card table-panel' },
    h('div', { class: 'table-head' }, h('h2', {}, 'Blackjack'), credits),
    h('div', { class: 'hands' }, h('div', { class: 'hand-row' }, h('span', { class: 'hand-label' }, 'Dealer'), dealerRow, dealerTotal), h('div', { class: 'hand-row' }, h('span', { class: 'hand-label' }, 'You'), playerRow, playerTotal)),
    status,
    betSetting,
    h('div', { class: 'actions table-actions' }, done, dbl, stand, hit, deal),
  );
  const panel: Panel = { el, light: true, onBack: () => ui.close(panel), initial: () => (table.hand?.phase === 'player' ? hit : deal) };
  paint();
  ui.open(panel);
  if (table.hand?.phase === 'player') status.textContent = 'Your hand is still waiting. Your move.';
  return panel;
}
