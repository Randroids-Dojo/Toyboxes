// The Captain's Logbook: where your credits earned and spent are kept over
// time. In the world, the chart table's parchment draws your balance as a
// river, and a split-flap board above the shelves turns through the boards.
// The panel has six tabs (LB and RB switch them): Overview, Over time, By
// game, Voyages, Stamps and Boards, each chart with a table view.

import * as THREE from 'three';
import { GAME_INFO, RANKS, STAMPS, rankOf, type GameId } from '../../shared/casino/progress';
import { POKER_PAYTABLE } from '../../shared/casino/poker';
import { START_CREDITS, type CasinoStats } from '../../shared/slots';
import type { PlayerState, SpaceAction } from '../../world/space';
import { button, h, type Panel } from '../../ui/ui';
import { DISPLAY_FONT } from '../../world/kit';
import { formatCredits } from '../common';
import { sound } from './audio';
import { Chart, dayChart, gameBars, legend, numbersTable, riverChart, type RiverMarker } from './charts';
import { frame } from './director';
import { EARLIER } from '../../shared/casino/stats';
import type { BoardRow } from './economy';
import type { Host } from './host';
import { ANCHOR_SVG } from './hud';
import { LOGBOOK, SPOTS } from './layout';
import { canvasTex } from './materials';

type Tab = 'overview' | 'time' | 'games' | 'voyages' | 'stamps' | 'boards';
const TABS: [Tab, string][] = [
  ['overview', 'Overview'],
  ['time', 'Over time'],
  ['games', 'By game'],
  ['voyages', 'Voyages'],
  ['stamps', 'Stamps'],
  ['boards', 'Boards'],
];

/** About how many credits in 100 each game keeps over time, for the By game tab. */
const EDGE: Record<string, number> = { slot: 5, roulette: 3, blackjack: 1, wheel: 6, falls: 5, poker: 5, captain: 1, [EARLIER]: 5 };

/** Refills and big wins along the history, for the river's markers. */
export function riverMarkers(history: [number, number][]): RiverMarker[] {
  const out: RiverMarker[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1][1];
    const cur = history[i][1];
    if (prev < 10 && cur === START_CREDITS) out.push({ i, kind: 'refill' });
    else if (cur - prev >= 300) out.push({ i, kind: 'big' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The split-flap board

const COLS = 26;
const ROWS = 8;
const FLAP_CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:!-x';

class FlapBoard {
  readonly mesh: THREE.Mesh;
  private tex: THREE.CanvasTexture;
  private cur: string[] = new Array(COLS * ROWS).fill(' ');
  private want: string[] = new Array(COLS * ROWS).fill(' ');
  private flip: number[] = new Array(COLS * ROWS).fill(0);
  private dirty = true;
  private acc = 0;

  constructor(scale: number) {
    this.tex = canvasTex(Math.round(1024 * scale), Math.round(512 * scale), () => {}, false);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.0), new THREE.MeshStandardMaterial({ map: this.tex, emissive: new THREE.Color('#ffffff'), emissiveMap: this.tex, emissiveIntensity: 0.35, roughness: 0.5 }));
  }

  /** Lines of text; cells that change flip over one by one. */
  show(lines: string[]): void {
    const next = new Array(COLS * ROWS).fill(' ');
    lines.slice(0, ROWS).forEach((l, r) => {
      const t = l.toUpperCase().replace(/[^ A-Z0-9.,:!x-]/g, ' ').slice(0, COLS);
      for (let c = 0; c < t.length; c++) next[r * COLS + c] = t[c];
    });
    let changed = 0;
    next.forEach((ch, i) => {
      if (ch !== this.want[i]) {
        this.want[i] = ch;
        this.flip[i] = -((i % COLS) * 0.02 + Math.floor(i / COLS) * 0.05);
        changed++;
      }
    });
    if (changed) sound.flap();
  }

  update(dt: number): void {
    let flipping = false;
    for (let i = 0; i < this.flip.length; i++) {
      if (this.cur[i] === this.want[i] && this.flip[i] === 0) continue;
      flipping = true;
      this.flip[i] += dt * 7;
      if (this.flip[i] >= 1) {
        // Step one character through the drum towards the wanted one.
        const a = FLAP_CHARS.indexOf(this.cur[i]);
        const b = FLAP_CHARS.indexOf(this.want[i]);
        this.cur[i] = a < 0 || b < 0 || Math.abs(a - b) <= 3 ? this.want[i] : FLAP_CHARS[(a + 3) % FLAP_CHARS.length];
        this.flip[i] = this.cur[i] === this.want[i] ? 0 : 0.0001;
      }
    }
    this.acc += dt;
    if ((flipping || this.dirty) && this.acc > 1 / 15) {
      this.acc = 0;
      this.dirty = false;
      this.paint();
    }
  }

  private paint(): void {
    const c = this.tex.image as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    g.fillStyle = '#1a1410';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#a8782c';
    g.lineWidth = W * 0.012;
    g.strokeRect(0, 0, W, H);
    const cw = (W * 0.94) / COLS;
    const ch = (H * 0.9) / ROWS;
    const ox = W * 0.03;
    const oy = H * 0.05;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${ch * 0.72}px ${DISPLAY_FONT}`;
    for (let r = 0; r < ROWS; r++)
      for (let k = 0; k < COLS; k++) {
        const i = r * COLS + k;
        const x = ox + k * cw;
        const y = oy + r * ch;
        g.fillStyle = '#2a221c';
        g.fillRect(x + 1, y + 1, cw - 2, ch - 2);
        const f = this.flip[i] > 0 ? Math.abs(Math.cos(this.flip[i] * Math.PI)) : 1;
        g.save();
        g.translate(x + cw / 2, y + ch / 2);
        g.scale(1, Math.max(0.05, f));
        g.fillStyle = r === 0 ? '#ffd24a' : '#f4e7cc';
        g.fillText(this.cur[i], 0, 1);
        g.restore();
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(x + 1, y + ch / 2 - 0.5, cw - 2, 1);
      }
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.tex.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ---------------------------------------------------------------------------

export class Logbook {
  private parchment: THREE.CanvasTexture;
  private parchKey = '';
  private board: FlapBoard;
  private boardIdx = 0;
  private boardT = 0;
  private panel: Panel | null = null;
  private tab: Tab = 'overview';
  private numbers = false;
  private range: 'plays' | 'week' | 'all' = 'plays';
  private body: HTMLElement | null = null;
  private tabBtns = new Map<Tab, HTMLButtonElement>();
  private charts: Chart[] = [];
  private owned: { dispose(): void }[] = [];
  private off: () => void = () => {};
  openCount = 0;

  constructor(
    private host: Host,
    portWall: THREE.Object3D | null,
  ) {
    const m = host.mats;
    const s = host.scene;
    const T = LOGBOOK.table;
    // The chart table: mahogany with turned legs, a brass rail, and the parchment chart.
    const g = new THREE.Group();
    g.position.set(T.x, 0, T.z);
    const top = new THREE.Mesh(new THREE.BoxGeometry(T.w, 0.08, T.d), m.mahogany);
    top.position.y = 0.91;
    const apron = new THREE.Mesh(new THREE.BoxGeometry(T.w - 0.16, 0.16, T.d - 0.16), m.mahogany);
    apron.position.y = 0.79;
    g.add(top, apron);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.78, 10), m.mahogany);
        leg.position.set(sx * (T.w / 2 - 0.14), 0.39, sz * (T.d / 2 - 0.14));
        g.add(leg);
      }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(T.w + 0.04, 0.03, T.d + 0.04), m.brass);
    rail.position.y = 0.94;
    g.add(rail);
    this.parchment = canvasTex(host.tier() === 'low' ? 512 : 1024, host.tier() === 'low' ? 320 : 640, () => {}, false);
    const parch = new THREE.Mesh(new THREE.PlaneGeometry(T.w - 0.2, T.d - 0.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: this.parchment, roughness: 0.85, emissive: new THREE.Color('#ffffff'), emissiveMap: this.parchment, emissiveIntensity: 0.03 }));
    // Parchment lies 3 mm above the table top (top face at 0.95, the rail's at 0.955).
    parch.position.y = 0.958;
    g.add(parch);
    // Brass dividers and a magnifier on the chart.
    const div = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6).rotateZ(Math.PI / 2 - 0.25), m.brass);
    div.position.set(0.7, 0.975, 0.35);
    const glass = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 20).rotateX(Math.PI / 2), m.brass);
    glass.position.set(-0.85, 0.97, -0.3);
    g.add(div, glass);
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.geometry) this.owned.push(mesh.geometry);
      }
    });
    this.owned.push(parch.material as THREE.Material, this.parchment);
    s.add(g);
    // The split-flap board over the shelves, part of the port wall so it goes with it.
    this.board = new FlapBoard(host.tier() === 'low' ? 0.5 : 1);
    if (portWall) {
      // Wall local frame: x runs from the stern end (x 12) towards the bow, z points into the room.
      this.board.mesh.position.set(12 - (LOGBOOK.shelves.x0 + LOGBOOK.shelves.x1) / 2, 4.05, 0.17);
      portWall.add(this.board.mesh);
      const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 0.04), m.brass);
      frameMesh.position.set(12 - (LOGBOOK.shelves.x0 + LOGBOOK.shelves.x1) / 2, 4.05, 0.15);
      portWall.add(frameMesh);
      this.owned.push(frameMesh.geometry);
    }
    this.paintParchment();
    this.rotateBoard();
  }

  // -------------------------------------------------------------------------
  // In the world

  /** Draws your river on the parchment: banks, the water, lighthouses at refills and stars at big wins. */
  private paintParchment(): void {
    const st = this.host.eco.stats;
    const hist = st?.history ?? [[Date.now(), START_CREDITS]];
    const key = `${hist.length}|${hist[hist.length - 1]?.[1]}`;
    if (key === this.parchKey) return;
    this.parchKey = key;
    const c = this.parchment.image as HTMLCanvasElement;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    const k = W / 1024;
    const grd = g.createRadialGradient(W / 2, H / 2, W * 0.1, W / 2, H / 2, W * 0.7);
    grd.addColorStop(0, '#f2e2bc');
    grd.addColorStop(1, '#c9a86a');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(90,60,30,0.25)';
    g.lineWidth = 1;
    for (let x = 0; x < W; x += 64 * k) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    for (let y = 0; y < H; y += 64 * k) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    // Compass rose.
    g.save();
    g.translate(W * 0.88, H * 0.22);
    g.fillStyle = 'rgba(122,40,30,0.7)';
    for (let i = 0; i < 8; i++) {
      g.rotate(Math.PI / 4);
      g.beginPath();
      g.moveTo(0, -(i % 2 ? 40 : 70) * k);
      g.lineTo(8 * k, 0);
      g.lineTo(-8 * k, 0);
      g.closePath();
      g.fill();
    }
    g.restore();
    // The river: x is plays, y is balance; width grows with the balance.
    const pts = hist.length > 1 ? hist : [...hist, ...hist];
    const vals = pts.map((p) => p[1]);
    const hi = Math.max(START_CREDITS * 1.3, ...vals);
    const px = (i: number) => (60 + (i / Math.max(1, pts.length - 1)) * (W / k - 160)) * k;
    const py = (v: number) => (H / k - 70 - (v / hi) * (H / k - 150)) * k;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [w, col] of [[26, 'rgba(110,140,90,0.55)'], [16, '#5f95b8'], [6, '#9fc8e0']] as const) {
      g.strokeStyle = col;
      g.lineWidth = w * k;
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(px(i), py(p[1])) : g.moveTo(px(i), py(p[1]))));
      g.stroke();
    }
    g.setLineDash([10 * k, 10 * k]);
    g.strokeStyle = 'rgba(90,60,30,0.6)';
    g.lineWidth = 2 * k;
    g.beginPath();
    g.moveTo(40 * k, py(START_CREDITS));
    g.lineTo(W - 40 * k, py(START_CREDITS));
    g.stroke();
    g.setLineDash([]);
    for (const mk of riverMarkers(pts)) {
      const x = px(mk.i);
      const y = py(pts[mk.i][1]);
      if (mk.kind === 'refill') {
        g.fillStyle = '#f4e7cc';
        g.strokeStyle = '#7a281e';
        g.lineWidth = 3 * k;
        g.beginPath();
        g.moveTo(x - 9 * k, y + 14 * k);
        g.lineTo(x - 5 * k, y - 18 * k);
        g.lineTo(x + 5 * k, y - 18 * k);
        g.lineTo(x + 9 * k, y + 14 * k);
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = '#ffcf7a';
        g.fillRect(x - 5 * k, y - 26 * k, 10 * k, 8 * k);
      } else {
        g.fillStyle = '#c88a1a';
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = (i % 2 ? 6 : 14) * k;
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          if (i) g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          else g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
      }
    }
    g.fillStyle = '#5a2a1a';
    g.font = `${40 * k}px ${DISPLAY_FONT}`;
    g.textAlign = 'left';
    g.fillText('Your river', 40 * k, 60 * k);
    g.font = `${24 * k}px ${DISPLAY_FONT}`;
    g.fillText(st ? `${formatCredits(st.balance)} now · ${st.spins} plays` : 'Play a game to start your river', 40 * k, 92 * k);
    this.parchment.needsUpdate = true;
  }

  private boardLines(i: number): string[] {
    const eco = this.host.eco;
    const rows = (title: string, list: BoardRow[], fmt: (v: number) => string, empty: string) => {
      const out = [title];
      if (!list.length) out.push('', empty);
      list.slice(0, ROWS - 1).forEach((r, k) => {
        const name = `${k + 1} ${r.name}`.slice(0, COLS - 8);
        const val = fmt(r.value);
        out.push(name + ' '.repeat(Math.max(1, COLS - name.length - val.length)) + val);
      });
      return out;
    };
    switch (i % 4) {
      case 0:
        return rows('TOP BALANCES', eco.boards.balance, (v) => formatCredits(v), 'NO ONE YET');
      case 1:
        return rows('BIGGEST WINS', eco.boards.wins, (v) => formatCredits(v), 'NO WINS YET');
      case 2:
        return rows('MOST STAMPS', eco.boards.stamps, (v) => String(v), 'NO STAMPS YET');
      default: {
        const out = ['HALL OF FAME'];
        if (!eco.fame.length) out.push('', 'GRAND: NOT WON YET.', 'COULD BE YOU.');
        eco.fame.slice(0, ROWS - 1).forEach((f) => {
          const name = `${f.jackpot} ${f.name}`.slice(0, COLS - 8);
          const val = formatCredits(f.credits);
          out.push(name + ' '.repeat(Math.max(1, COLS - name.length - val.length)) + val);
        });
        return out;
      }
    }
  }

  private rotateBoard(): void {
    this.board.show(this.boardLines(this.boardIdx));
  }

  update(dt: number): void {
    this.board.update(dt);
    this.boardT += dt;
    if (this.boardT > 10) {
      this.boardT = 0;
      this.boardIdx++;
      this.rotateBoard();
    }
    this.paintParchment();
  }

  // -------------------------------------------------------------------------
  // The panel

  framing() {
    // Facing the shelves, so the split-flap board sits above the panel.
    return frame(LOGBOOK.table.x - 0.3, 2.7, LOGBOOK.table.z - 4.4, LOGBOOK.table.x, 2.1, LOGBOOK.shelves.z, 54);
  }

  actions(_p: PlayerState, act: (label: string, short: string, run: () => void) => SpaceAction): SpaceAction[] {
    return [{ ...SPOTS.logbook, ...act("Open the Captain's Logbook", 'Logbook', () => this.open()) }];
  }

  open(tab: Tab = 'overview'): void {
    if (this.panel) return;
    const host = this.host;
    this.tab = tab;
    this.openCount++;
    const tabs = h('div', { class: 'lb-tabs', role: 'tablist' });
    this.tabBtns.clear();
    for (const [id, label] of TABS) {
      const b = button(label, () => this.show(id), 'lb-tab');
      b.setAttribute('role', 'tab');
      this.tabBtns.set(id, b);
      tabs.appendChild(b);
    }
    this.body = h('div', { class: 'lb-body' });
    const done = button('Done', () => host.ctx.ui.close(panel), 'ghost');
    const el = h('div', { class: 'card gp-panel lb-panel wide', 'data-panel': 'logbook' }, h('div', { class: 'gp-head' }, h('h2', {}, "The Captain's Logbook"), h('small', { class: 'lb-hint' }, 'LB and RB turn the pages')), tabs, this.body, h('div', { class: 'actions gp-actions' }, done));
    const step = (d: number) => {
      const i = TABS.findIndex(([t]) => t === this.tab);
      this.show(TABS[(i + d + TABS.length) % TABS.length][0], true);
    };
    const panel: Panel = {
      el,
      onBack: () => host.ctx.ui.close(panel),
      onPrev: () => step(-1),
      onNext: () => step(1),
      onClose: () => {
        this.panel = null;
        this.off();
        host.director.setSeat(null);
      },
      initial: () => this.tabBtns.get(this.tab) ?? null,
      // Inside a focused chart, Left and Right read the next point instead of moving focus.
      capture: (a) => {
        if (a !== 'left' && a !== 'right') return false;
        return this.charts.some((c) => c.step(a === 'left' ? -1 : 1));
      },
    };
    this.panel = panel;
    this.off = host.eco.onChange(() => this.render());
    this.render();
    host.ctx.ui.open(panel);
    host.director.setSeat(this.framing());
    if (!host.save.data.tried.logbook) host.save.update((d) => (d.tried.logbook = true));
    sound.flap();
    void host.eco.load();
  }

  private show(t: Tab, focusTab = false): void {
    this.tab = t;
    sound.click();
    this.render();
    if (focusTab) this.tabBtns.get(t)?.focus({ preventScroll: true });
  }

  private render(): void {
    const body = this.body;
    if (!body) return;
    for (const [id, b] of this.tabBtns) {
      b.classList.toggle('on', id === this.tab);
      b.setAttribute('aria-selected', String(id === this.tab));
    }
    this.charts = [];
    const st = this.host.eco.stats;
    if (!st) {
      body.replaceChildren(h('p', { class: 'gp-note' }, 'Fetching your logbook...'));
      return;
    }
    const content = this.tab === 'overview' ? this.overview(st) : this.tab === 'time' ? this.time(st) : this.tab === 'games' ? this.games(st) : this.tab === 'voyages' ? this.voyages(st) : this.tab === 'stamps' ? this.stamps(st) : this.boards();
    body.replaceChildren(...content);
  }

  private toggle(): HTMLButtonElement {
    return button(this.numbers ? 'Show the chart' : 'Show numbers', () => {
      this.numbers = !this.numbers;
      this.render();
    }, 'tiny ghost lb-toggle');
  }

  private overview(st: CasinoStats): HTMLElement[] {
    const net = st.earned - st.spent;
    const tile = (label: string, value: string, cls = '') => h('div', { class: `lb-tile ${cls}` }, h('small', {}, label), h('b', {}, value));
    const v = st.voyages?.find((x) => x.id === this.host.eco.voyage);
    const fmtTime = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const bests = st.bests ?? {};
    const pokerBest = bests.poker ? POKER_PAYTABLE.find((p) => p.rank === bests.poker)?.label : null;
    return [
      h('div', { class: 'lb-hero' }, h('small', {}, 'Balance'), h('b', {}, formatCredits(st.balance)), h('span', {}, 'play credits')),
      h(
        'div',
        { class: 'lb-tiles' },
        tile('Earned', formatCredits(st.earned)),
        tile('Spent', formatCredits(st.spent)),
        tile('Net', `${net >= 0 ? '▲ +' : '▼ -'}${formatCredits(Math.abs(net))}`, net >= 0 ? 'up' : 'down'),
        tile('Plays', formatCredits(st.spins)),
        tile('Biggest win', formatCredits(st.biggestWin)),
        tile('Free top ups', String(st.refills)),
      ),
      h('h3', { class: 'lb-h3' }, 'This voyage'),
      v
        ? h('div', { class: 'lb-tiles small' }, tile('Came aboard', fmtTime(v.at)), tile('Opened with', formatCredits(v.open)), tile('Now', formatCredits(v.close)), tile('High', formatCredits(v.high)), tile('Low', formatCredits(v.low)), tile('Plays', String(v.plays)))
        : h('p', { class: 'gp-note' }, 'Play any game and this visit goes in the log.'),
      h('h3', { class: 'lb-h3' }, 'Personal bests'),
      h(
        'div',
        { class: 'lb-tiles small' },
        tile('Highest balance', formatCredits(bests.balance ?? st.balance)),
        tile('Best voyage', `+${formatCredits(Math.max(0, bests.voyage ?? 0))}`),
        tile('Longest streak', `${bests.streak ?? 0} wins`),
        tile('Best pearl', bests.falls ? `${bests.falls}x` : 'None yet'),
        tile('Best poker hand', pokerBest ?? 'None yet'),
      ),
    ];
  }

  private time(st: CasinoStats): HTMLElement[] {
    let hist = st.history;
    if (this.range === 'plays') hist = hist.slice(-51);
    else if (this.range === 'week') hist = hist.filter((p) => p[0] > Date.now() - 7 * 86400000);
    if (!hist.length) hist = st.history.slice(-1);
    const ranges = h(
      'div',
      { class: 'lb-ranges', role: 'group', 'aria-label': 'Range' },
      ...(
        [
          ['plays', 'Last 50 plays'],
          ['week', 'Last 7 days'],
          ['all', 'All'],
        ] as const
      ).map(([id, label]) => {
        const b = button(label, () => {
          this.range = id;
          this.render();
        }, `tiny${this.range === id ? ' on' : ''}`);
        b.setAttribute('aria-pressed', String(this.range === id));
        return b;
      }),
    );
    const days = (st.days ?? []).slice(-14);
    const out: HTMLElement[] = [h('div', { class: 'lb-row' }, h('h3', { class: 'lb-h3' }, 'Your river'), ranges, this.toggle())];
    if (this.numbers) {
      out.push(numbersTable(['When', 'Balance'], hist.slice(-20).reverse().map((p) => [new Date(p[0]).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }), p[1]])));
    } else {
      const c = riverChart(hist, START_CREDITS, riverMarkers(hist));
      this.charts.push(c);
      out.push(c.el, legend([['lg-line', 'Balance'], ['lg-base', 'Start: 1,000'], ['lg-refill', 'Free top up'], ['lg-big', 'Big win']]));
    }
    out.push(h('h3', { class: 'lb-h3' }, 'Earned and spent by day'));
    if (!days.length) out.push(h('p', { class: 'gp-note' }, 'Your play days show here.'));
    else if (this.numbers) {
      out.push(numbersTable(['Day', 'Earned', 'Spent', 'Net', 'Plays'], days.slice().reverse().map((d) => [new Date(`${d.d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), d.earned, d.spent, `${d.earned - d.spent >= 0 ? '+' : '-'}${formatCredits(Math.abs(d.earned - d.spent))}`, String(d.plays)])));
    } else {
      const c = dayChart(days);
      this.charts.push(c);
      out.push(c.el, legend([['lg-earned', 'Earned'], ['lg-spent', 'Spent']]));
    }
    return out;
  }

  private games(st: CasinoStats): HTMLElement[] {
    const order: string[] = ['slot', 'roulette', 'blackjack', 'wheel', 'falls', 'poker', 'captain', EARLIER];
    const rows = order
      .filter((id) => st.games?.[id]?.plays)
      .map((id) => {
        const g = st.games![id];
        return { name: id === EARLIER ? 'Before the boat' : GAME_INFO[id as GameId].name, spent: g.spent, earned: g.earned, plays: g.plays, edge: EDGE[id] ?? 5 };
      });
    if (!rows.length) return [h('p', { class: 'gp-note' }, 'Play a game and its spending and winnings show here.')];
    return [
      h('div', { class: 'lb-row' }, h('h3', { class: 'lb-h3' }, 'By game'), this.toggle()),
      this.numbers ? numbersTable(['Game', 'Plays', 'Spent', 'Earned', 'Return'], rows.map((r) => [r.name, String(r.plays), r.spent, r.earned, r.spent ? `${Math.round((r.earned / r.spent) * 100)}%` : '-'])) : gameBars(rows),
      legend([['lg-spent', 'Spent'], ['lg-earned', 'Earned']]),
    ];
  }

  private voyages(st: CasinoStats): HTMLElement[] {
    const list = (st.voyages ?? []).slice(-10).reverse();
    if (!list.length) return [h('p', { class: 'gp-note' }, 'Each visit to the boat is a voyage. Play a game and this one is logged.')];
    return [
      h(
        'div',
        { class: 'lb-voyages' },
        ...list.map((v, i) => {
          const net = v.earned - v.spent;
          return h(
            'div',
            { class: 'lb-voyage', tabindex: '0', 'data-nav': 'voyage' },
            h('b', {}, `${i === 0 && v.id === this.host.eco.voyage ? 'This voyage' : new Date(v.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`),
            h('span', {}, `${formatCredits(v.open)} to ${formatCredits(v.close)}`),
            h('span', { class: net >= 0 ? 'up' : 'down' }, `${net >= 0 ? '▲ +' : '▼ -'}${formatCredits(Math.abs(net))}`),
            h('small', {}, `High ${formatCredits(v.high)} · ${v.plays} plays · best ${formatCredits(v.best)}`),
          );
        }),
      ),
    ];
  }

  private stamps(st: CasinoStats): HTMLElement[] {
    const have = new Set(st.stamps ?? []);
    const rank = rankOf(st);
    const next = RANKS[rank + 1];
    const groups = [...new Set(STAMPS.map((s) => s.group))];
    const anchor = h('span', { class: 'lb-anchor' });
    anchor.innerHTML = ANCHOR_SVG;
    return [
      h('div', { class: 'lb-rank' }, anchor, h('div', {}, h('b', {}, RANKS[rank].name), h('span', {}, next ? `${have.size} of ${next.stamps} stamps to ${next.name}: ${next.opens}` : `${have.size} of ${STAMPS.length} stamps. Every room is yours.`))),
      ...groups.map((grp) =>
        h(
          'div',
          { class: 'lb-stamp-group' },
          h('h3', { class: 'lb-h3' }, grp),
          h(
            'div',
            { class: 'lb-stamps' },
            ...STAMPS.filter((s) => s.group === grp).map((s) => h('div', { class: `lb-stamp${have.has(s.id) ? ' inked' : ''}`, tabindex: '0', 'data-nav': 'stamp', 'aria-label': `${s.name}: ${have.has(s.id) ? 'earned' : s.hint}` }, h('b', {}, s.name), h('small', {}, have.has(s.id) ? 'Stamped' : s.hint))),
          ),
        ),
      ),
    ];
  }

  private boards(): HTMLElement[] {
    const eco = this.host.eco;
    const list = (title: string, rows: BoardRow[], fmt: (v: number) => string, empty: string) =>
      h('div', { class: 'lb-board', tabindex: '0', 'data-nav': 'board' }, h('h3', { class: 'lb-h3' }, title), rows.length ? h('ol', {}, ...rows.map((r) => h('li', { class: r.you ? 'you' : '' }, h('span', {}, r.name), h('b', {}, fmt(r.value))))) : h('p', { class: 'gp-note' }, empty));
    return [
      h(
        'div',
        { class: 'lb-boards' },
        list('Top balances', eco.boards.balance, formatCredits, 'No one yet.'),
        list('Biggest wins', eco.boards.wins, formatCredits, 'No wins yet.'),
        list('Most stamps', eco.boards.stamps, String, 'No stamps yet.'),
        h(
          'div',
          { class: 'lb-board', tabindex: '0', 'data-nav': 'board' },
          h('h3', { class: 'lb-h3' }, 'Hall of Fame'),
          eco.fame.length ? h('ol', {}, ...eco.fame.slice(0, 10).map((f) => h('li', {}, h('span', {}, `${f.jackpot} · ${f.name}`), h('b', {}, `${formatCredits(f.credits)} (${Math.round(f.mult)}x)`)))) : h('p', { class: 'gp-note' }, 'GRAND: not won yet. Could be you.'),
        ),
        list('Captains', eco.boards.captains, (v) => `${v} stamps`, 'No Captains yet. Earn 26 stamps.'),
      ),
    ];
  }

  dispose(): void {
    if (this.panel) this.host.ctx.ui.close(this.panel);
    this.board.dispose();
    for (const o of this.owned) o.dispose();
  }
}
