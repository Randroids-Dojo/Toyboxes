// A casino with one giant slot machine. Walk up and pull the lever; the
// server decides each spin so credits stay honest. Your balance, totals and
// a balance-over-time chart live at the credits kiosk, and the wall board
// shows the top balances. Credits are play credits that only exist here.

import * as THREE from 'three';
import { sfx } from '../audio/sfx';
import { api, type BoardRow } from '../net/api';
import { BETS, PAYTABLE, REEL_STRIP, START_CREDITS, type CasinoStats, type SlotSymbol } from '../shared/slots';
import { card } from '../ui/dialogs';
import { button, h, type Panel } from '../ui/ui';
import { DISPLAY_FONT, cached, disposeTree, mesh, plastic, roundBox, sign, signTexture } from '../world/kit';
import { box, type Collider } from '../world/physics';
import type { PlayerState, SpaceAction, SpaceView, Spot } from '../world/space';
import { BlackjackTable, RouletteTable, openBlackjack, openRoulette, type TableHost } from './casino-tables';
import { boardTexture, formatCredits, patternTexture, type ExperienceCtx } from './common';

const W = 9;
const D = 7.5;
const H = 4.4;
const T = 0.3;
const STOPS = REEL_STRIP.length;
const STEP = (Math.PI * 2) / STOPS;
const REEL_R = 0.8;

function drawSymbol(g: CanvasRenderingContext2D, sym: SlotSymbol, size: number): void {
  const s = size;
  g.lineJoin = 'round';
  switch (sym) {
    case 'seven':
      g.font = `${s * 0.95}px ${DISPLAY_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = s * 0.08;
      g.strokeStyle = '#2b2340';
      g.strokeText('7', 0, s * 0.04);
      g.fillStyle = '#e8384a';
      g.fillText('7', 0, s * 0.04);
      break;
    case 'bar':
      g.fillStyle = '#2b2340';
      g.beginPath();
      g.roundRect(-s * 0.44, -s * 0.2, s * 0.88, s * 0.4, s * 0.08);
      g.fill();
      g.fillStyle = '#fffaf0';
      g.font = `${s * 0.3}px ${DISPLAY_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('BAR', 0, s * 0.02);
      break;
    case 'bell':
      g.fillStyle = '#f4b740';
      g.strokeStyle = '#8a5a12';
      g.lineWidth = s * 0.05;
      g.beginPath();
      g.moveTo(-s * 0.36, s * 0.24);
      g.quadraticCurveTo(-s * 0.3, -s * 0.36, 0, -s * 0.36);
      g.quadraticCurveTo(s * 0.3, -s * 0.36, s * 0.36, s * 0.24);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath();
      g.arc(0, s * 0.3, s * 0.09, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    case 'star': {
      g.fillStyle = '#8a6bd1';
      g.strokeStyle = '#2b2340';
      g.lineWidth = s * 0.05;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.18 : s * 0.42;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case 'cherry':
      g.strokeStyle = '#3fb68b';
      g.lineWidth = s * 0.06;
      g.beginPath();
      g.moveTo(-s * 0.18, s * 0.12);
      g.quadraticCurveTo(-s * 0.05, -s * 0.3, s * 0.18, -s * 0.36);
      g.moveTo(s * 0.18, s * 0.12);
      g.quadraticCurveTo(s * 0.16, -s * 0.2, s * 0.18, -s * 0.36);
      g.stroke();
      g.fillStyle = '#e8384a';
      g.strokeStyle = '#7a1424';
      g.lineWidth = s * 0.04;
      for (const x of [-s * 0.18, s * 0.18]) {
        g.beginPath();
        g.arc(x, s * 0.2, s * 0.17, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      break;
    case 'lemon':
      g.fillStyle = '#ffe14d';
      g.strokeStyle = '#b89a12';
      g.lineWidth = s * 0.05;
      g.beginPath();
      g.ellipse(0, 0, s * 0.38, s * 0.26, -0.3, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
  }
}

/** The reel strip painted around a cylinder: u runs around it, symbols upright at the front. */
function reelTexture(): THREE.CanvasTexture {
  const cell = 128;
  const c = document.createElement('canvas');
  c.width = cell * STOPS;
  c.height = cell;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fffaf0';
  g.fillRect(0, 0, c.width, c.height);
  REEL_STRIP.forEach((sym, i) => {
    g.save();
    g.translate((i + 0.5) * cell, cell / 2);
    g.rotate(Math.PI / 2);
    drawSymbol(g, sym, cell * 0.92);
    g.restore();
    g.fillStyle = 'rgba(43,35,64,0.12)';
    g.fillRect(i * cell, 0, 2, cell);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

interface Reel {
  mesh: THREE.Mesh;
  angle: number;
  speed: number;
  stop: { from: number | null; to: number; t0: number; dur: number } | null;
  lastTick: number;
}

export class Casino implements SpaceView {
  readonly indoor = true;
  readonly scene = new THREE.Scene();
  readonly colliders: Collider[] = [];
  readonly door: Spot = { x: 0, z: D - 1.1 };
  readonly lectern = null;
  readonly chest = null;
  readonly areaDoors = [];
  readonly exhibitSpots = [];
  readonly sun: THREE.DirectionalLight;
  readonly arrival = { x: 0, z: D - 1.6, yaw: Math.PI };
  private walls = new Map<string, { full: THREE.Group; stub: THREE.Group }>();
  private reels: Reel[] = [];
  private lever: THREE.Group;
  private leverT = 0;
  private bulbs: THREE.MeshStandardMaterial[] = [];
  private celebrate = 0;
  private jackpot = false;
  private machineSpot: Spot = { x: 0, z: -3.4 };
  private kioskSpot: Spot = { x: 5.6, z: -2.7 };
  private stats: CasinoStats | null = null;
  private boardRows: BoardRow[] = [];
  private boardMesh: THREE.Mesh;
  private bet: number;
  private spinning = false;
  private clock = 0;
  private hud: HTMLElement;
  private hudMain: HTMLElement;
  private hudSub: HTMLElement;
  private disposed = false;
  private lastBoardAt = 0;
  private statsPanel: { panel: Panel; refresh: () => void } | null = null;
  private roulette: RouletteTable;
  private blackjack: BlackjackTable;
  private tablePanel: Panel | null = null;
  private host: TableHost;

  constructor(private readonly ctx: ExperienceCtx) {
    this.host = {
      ctx: this.ctx,
      stats: () => this.stats,
      setStats: (s) => {
        this.stats = s;
        this.paintHud();
        this.statsPanel?.refresh();
        if (this.clock - this.lastBoardAt > 4) void this.loadBoard(false);
      },
      bet: () => this.bet,
      setBet: (b) => {
        this.bet = b;
        localStorage.setItem('toyboxes.bet', String(b));
        this.paintHud();
      },
      refill: () => this.refill(),
    };
    const s = this.scene;
    s.background = new THREE.Color('#1a1024');
    const saved = Number(localStorage.getItem('toyboxes.bet'));
    this.bet = (BETS as readonly number[]).includes(saved) ? saved : BETS[1];

    const carpet = patternTexture(
      128,
      (g, n) => {
        g.fillStyle = '#7a1f2b';
        g.fillRect(0, 0, n, n);
        g.strokeStyle = 'rgba(244,183,64,0.55)';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(n / 2, 0);
        g.lineTo(n, n / 2);
        g.lineTo(n / 2, n);
        g.lineTo(0, n / 2);
        g.closePath();
        g.stroke();
        g.fillStyle = 'rgba(244,183,64,0.7)';
        g.beginPath();
        g.arc(n / 2, n / 2, 6, 0, Math.PI * 2);
        g.fill();
      },
      [W / 1.5, D / 1.5],
    );
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95 }));
    floor.receiveShadow = true;
    floor.position.y = 0.01;
    s.add(floor);
    s.add(mesh(cached('ctable', () => new THREE.CylinderGeometry(30, 30, 0.6, 48)), plastic('#2a1a33', { rough: 0.9 }), 0, -0.35, 0, { cast: false }));
    s.add(mesh(roundBox(W * 2 + T * 2, 0.3, D * 2 + T * 2, 0.1), plastic('#d9a838', { rough: 0.4 }), 0, -0.18, 0, { cast: false }));

    const wallMat = plastic('#3d1f45', { rough: 0.85 });
    const gold = plastic('#d9a838', { rough: 0.35 });
    const wall = (name: string, len: number, x: number, z: number, rot: number) => {
      const full = new THREE.Group();
      const stub = new THREE.Group();
      for (const g of [full, stub]) {
        g.position.set(x, 0, z);
        g.rotation.y = rot;
      }
      full.add(mesh(roundBox(len, H, T, 0.06), wallMat, 0, H / 2, 0));
      full.add(mesh(roundBox(len + 0.04, 0.16, T + 0.12, 0.06), gold, 0, H, 0));
      full.add(mesh(roundBox(len + 0.02, 0.22, T + 0.08, 0.05), gold, 0, 0.11, 0));
      stub.add(mesh(roundBox(len, 0.24, T, 0.05), gold, 0, 0.12, 0));
      stub.visible = false;
      s.add(full, stub);
      this.walls.set(name, { full, stub });
      return full;
    };
    const back = wall('back', W * 2 + T * 2, 0, -D - T / 2, 0);
    const front = wall('front', W * 2 + T * 2, 0, D + T / 2, Math.PI);
    const left = wall('left', D * 2, -W - T / 2, 0, Math.PI / 2);
    const right = wall('right', D * 2, W + T / 2, 0, -Math.PI / 2);
    this.colliders.push(box(0, -D - T / 2, W + T, T / 2, 0, 10, 0.5, false), box(0, D + T / 2, W + T, T / 2, 0, 10, 0.5, false), box(-W - T / 2, 0, T / 2, D + T, 0, 10, 0.5, false), box(W + T / 2, 0, T / 2, D + T, 0, 10, 0.5, false));

    // Way out.
    front.add(mesh(roundBox(1.9, 2.7, T + 0.12, 0.07), gold, 0, 1.35, 0));
    front.add(mesh(roundBox(1.5, 2.45, T + 0.18, 0.08), plastic('#2b1830', { rough: 0.4 }), 0, 1.22, 0));
    const exitSign = sign(`Back to ${ctx.ownerName}'s room`, 2.8, 0.6, { bg: '#1d1830', fg: '#ffd24a', radius: 0.14 }, 0.5);
    exitSign.position.set(0, 3.05, T / 2 + 0.04);
    front.add(exitSign);
    const matTex = signTexture('EXIT', 2.2, 1.1, { bg: '#1d1830', fg: '#ffd24a', radius: 0.2 });
    const doormat = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: matTex, emissive: new THREE.Color('#ffffff'), emissiveMap: matTex, emissiveIntensity: 0.2 }));
    doormat.position.set(0, 0.03, D - 0.75);
    s.add(doormat);

    // Neon on the back wall.
    for (const [x, text, color] of [
      [-5.6, 'CASINO', '#ff6bd6'],
      [5.6, 'JACKPOT', '#2ee6d6'],
    ] as const) {
      const neon = sign(text, 3.4, 1.0, { bg: '#120a1c', fg: '#fffaf0', glow: color, border: color, radius: 0.3 }, 1.0);
      neon.position.set(x, 3.0, T / 2 + 0.05);
      back.add(neon);
    }

    // The machine.
    const machine = new THREE.Group();
    machine.position.set(0, 0, -D + 1.3);
    s.add(machine);
    const red = plastic('#c8303f', { rough: 0.35 });
    const dark = plastic('#1d1830', { rough: 0.4 });
    machine.add(mesh(roundBox(3.6, 1.8, 1.6, 0.15), red, 0, 0.9, 0));
    machine.add(mesh(roundBox(3.6, 1.8, 1.6, 0.15), red, 0, 3.7, 0));
    for (const sx of [-1, 1]) machine.add(mesh(roundBox(0.32, 1.2, 1.5, 0.08), red, sx * 1.64, 2.3, 0));
    machine.add(mesh(roundBox(3.0, 1.2, 0.9, 0.05), dark, 0, 2.3, -0.4));
    for (const sx of [-0.5, 0.5]) machine.add(mesh(roundBox(0.08, 1.05, 0.5, 0.02), dark, sx, 2.3, 0.45, { cast: false }));
    machine.add(mesh(roundBox(3.0, 0.05, 0.05, 0.02), plastic('#ff3d4a', { rough: 0.3, emissive: '#ff3d4a', emissiveIntensity: 0.8 }), 0, 2.3, 0.76, { cast: false }));
    machine.add(mesh(roundBox(3.9, 0.2, 1.8, 0.08), gold, 0, 4.66, 0));
    machine.add(mesh(roundBox(3.8, 0.12, 1.7, 0.05), gold, 0, 1.75, 0.02));
    machine.add(mesh(roundBox(3.8, 0.12, 1.7, 0.05), gold, 0, 2.85, 0.02));
    const marquee = sign('SPIN TO WIN', 3.0, 0.8, { bg: '#1d1830', fg: '#ffd24a', glow: '#ff6bd6', sub: '777 pays 150 x your bet', subColor: '#fffaf0', radius: 0.12 }, 0.8);
    marquee.position.set(0, 3.75, 0.82);
    machine.add(marquee);
    const tray = mesh(roundBox(2.2, 0.25, 0.5, 0.08), gold, 0, 0.75, 0.9);
    machine.add(tray);
    // Chasing bulbs around the top.
    const bulbGeo = cached('bulb', () => new THREE.SphereGeometry(0.08, 10, 8));
    const ring: [number, number][] = [];
    for (let i = 0; i <= 12; i++) ring.push([-1.7 + (i / 12) * 3.4, 4.5]);
    for (let i = 1; i <= 5; i++) ring.push([1.7, 4.5 - (i / 6) * 1.5]);
    for (let i = 12; i >= 0; i--) ring.push([-1.7 + (i / 12) * 3.4, 3.0]);
    for (let i = 1; i <= 5; i++) ring.push([-1.7, 3.0 + (i / 6) * 1.5]);
    for (const [x, y] of ring) {
      const m = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0.3, roughness: 0.3 });
      this.bulbs.push(m);
      machine.add(mesh(bulbGeo, m, x, y, 0.85, { cast: false }));
    }
    // Reels, set in so only the middle shows through the window.
    const reelTex = reelTexture();
    const reelSide = new THREE.MeshStandardMaterial({ map: reelTex, roughness: 0.45 });
    const reelCap = plastic('#d9a838', { rough: 0.4 });
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.CylinderGeometry(REEL_R, REEL_R, 0.86, 48).rotateZ(Math.PI / 2);
      const reel = new THREE.Mesh(geo, [reelSide, reelCap, reelCap]);
      reel.position.set((i - 1) * 1.0, 2.3, 0.72 - REEL_R);
      machine.add(reel);
      const start = Math.floor(Math.random() * STOPS);
      this.reels.push({ mesh: reel, angle: (start + 0.5) * STEP, speed: 0, stop: null, lastTick: 0 });
      reel.rotation.x = (start + 0.5) * STEP;
    }
    // The lever on the right, as drawn.
    this.lever = new THREE.Group();
    this.lever.position.set(2.05, 2.0, 0.1);
    this.lever.add(mesh(cached('leverarm', () => new THREE.CylinderGeometry(0.07, 0.07, 1.5, 10).translate(0, 0.75, 0)), plastic('#c9ccd6', { rough: 0.3 })));
    this.lever.add(mesh(cached('leverknob', () => new THREE.SphereGeometry(0.24, 18, 12)), plastic('#f4b740', { rough: 0.3 }), 0, 1.55, 0));
    machine.add(mesh(roundBox(0.3, 0.5, 0.5, 0.1), dark, 1.92, 2.0, 0.1));
    machine.add(this.lever);
    this.colliders.push(box(0, -D + 1.3, 2.2, 0.9, 0, 5, 0.5, true));
    const stage = mesh(roundBox(5, 0.08, 1.6, 0.04), gold, 0, 0.04, -D + 2.9, { cast: false });
    s.add(stage);

    // Credits kiosk.
    const kiosk = new THREE.Group();
    kiosk.position.set(5.6, 0, -3.9);
    kiosk.add(mesh(roundBox(1.0, 1.2, 0.7, 0.12), plastic('#2b1830', { rough: 0.5 }), 0, 0.6, 0));
    const screen = sign('MY CREDITS', 1.0, 0.6, { bg: '#120a1c', fg: '#2ee6d6', glow: '#2ee6d6', radius: 0.08 }, 0.9);
    screen.position.set(0, 1.4, 0.15);
    screen.rotation.x = -0.5;
    kiosk.add(mesh(roundBox(1.1, 0.7, 0.12, 0.05), gold, 0, 1.38, 0.08), screen);
    s.add(kiosk);
    this.colliders.push(box(5.6, -3.9, 0.55, 0.4, 0, 1.6, 0.5, false));

    // Top balances on the left wall, the paytable on the right.
    this.boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.94), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.4 }));
    this.boardMesh.position.set(-1.2, 2.4, T / 2 + 0.05);
    left.add(this.boardMesh);
    const payRows = Object.values(PAYTABLE).map((r) => ({ name: r.label, value: `${r.multiplier}x`, you: false }));
    const payTex = boardTexture('Pays', payRows, 'x your bet', '#2ee6d6');
    const pay = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.94), new THREE.MeshStandardMaterial({ map: payTex, emissive: new THREE.Color('#ffffff'), emissiveMap: payTex, emissiveIntensity: 0.4 }));
    pay.position.set(1.2, 2.4, T / 2 + 0.05);
    right.add(pay);
    this.paintBoard();

    // Table games: roulette on the left, blackjack on the right.
    this.roulette = new RouletteTable(s, this.colliders, -5.2, 2.2);
    this.blackjack = new BlackjackTable(s, this.colliders, 5.2, 2.6);

    const hemi = new THREE.HemisphereLight('#ffe6f2', '#3a1630', 1.1);
    const lamp = new THREE.PointLight('#ffd0a0', 40, 30, 1.4);
    lamp.position.set(0, 6, 1);
    const spot = new THREE.PointLight('#ff9ad6', 14, 9, 1.5);
    spot.position.set(0, 3.4, -D + 4);
    this.sun = new THREE.DirectionalLight('#fff0e0', 1.1);
    this.sun.position.set(-6, 14, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -12;
    sc.right = sc.top = 12;
    sc.near = 1;
    sc.far = 40;
    this.sun.shadow.bias = -0.0006;
    s.add(hemi, lamp, spot, this.sun, this.sun.target);

    // HUD.
    this.hudMain = h('div', { class: 'ch-main' }, 'Credits ...');
    this.hudSub = h('div', { class: 'ch-sub' });
    this.hud = h('div', { class: 'casino-hud' }, this.hudMain, this.hudSub);
    ctx.ui.hud.appendChild(this.hud);
    void this.loadBoard(true);
  }

  // -------------------------------------------------------------------------

  private async loadBoard(withStats: boolean): Promise<void> {
    this.lastBoardAt = this.clock;
    const r = await api.scores(this.ctx.roomId, this.ctx.area.id, this.ctx.browserId);
    if (this.disposed) return;
    if (!r.ok || r.data.kind !== 'casino') {
      if (withStats) this.ctx.ui.toast(`Couldn't reach the casino. ${r.ok ? '' : r.error}`, 'bad');
      return;
    }
    this.boardRows = r.data.board;
    if (withStats || !this.stats) this.stats = r.data.stats;
    if (withStats && r.data.blackjack && !this.blackjack.hand) this.blackjack.show(r.data.blackjack);
    this.paintBoard();
    this.paintHud();
    this.statsPanel?.refresh();
  }

  private paintBoard(): void {
    const mat = this.boardMesh.material as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    const mine = this.stats ? `You have ${formatCredits(this.stats.balance)}` : 'Pull the lever to play';
    const tex = boardTexture('Top balances', this.boardRows.map((r) => ({ name: r.name, value: formatCredits(r.value), you: r.you })), mine, '#ffd24a');
    mat.map = tex;
    mat.emissiveMap = tex;
    mat.needsUpdate = true;
  }

  private paintHud(): void {
    const st = this.stats;
    const main = st ? `Credits ${formatCredits(st.balance)} · Bet ${this.bet}` : 'Credits ...';
    if (this.hudMain.textContent !== main) this.hudMain.textContent = main;
    const net = st ? st.earned - st.spent : 0;
    const sub = st ? `Won ${formatCredits(st.earned)} · Spent ${formatCredits(st.spent)} · Net ${net >= 0 ? '+' : '−'}${formatCredits(Math.abs(net))}` : '';
    if (this.hudSub.textContent !== sub) this.hudSub.textContent = sub;
  }

  private cycleBet(): void {
    const i = (BETS as readonly number[]).indexOf(this.bet);
    this.bet = BETS[(i + 1) % BETS.length];
    localStorage.setItem('toyboxes.bet', String(this.bet));
    sfx.click();
    this.paintHud();
  }

  private async refill(): Promise<void> {
    const r = await api.refill(this.ctx.roomId, this.ctx.area.id, this.ctx.browserId, this.ctx.name());
    if (!r.ok) {
      this.ctx.ui.toast(r.error, 'bad');
      return;
    }
    this.stats = r.data.stats;
    sfx.coins(START_CREDITS);
    this.ctx.ui.toast(`Free refill: ${formatCredits(START_CREDITS)} credits`, 'good');
    this.paintHud();
    void this.loadBoard(false);
  }

  private async spin(): Promise<void> {
    if (this.spinning || !this.stats) return;
    if (this.stats.balance < this.bet) {
      if (this.stats.balance < BETS[0]) void this.refill();
      else this.ctx.ui.toast(`Not enough credits for a ${this.bet} bet. Kick to change your bet.`);
      return;
    }
    this.spinning = true;
    this.leverT = 0.0001;
    sfx.lever();
    const started = this.clock;
    for (const r of this.reels) {
      r.speed = 15 + Math.random() * 2;
      r.stop = null;
    }
    // Show the bet leaving straight away; the server's numbers replace it when the reels land.
    this.hudMain.textContent = `Credits ${formatCredits(this.stats.balance - this.bet)} · Bet ${this.bet}`;
    const res = await api.spin(this.ctx.roomId, this.ctx.area.id, this.ctx.browserId, this.ctx.name(), this.bet);
    if (this.disposed) return;
    const landAt = Math.max(this.clock + 0.35, started + 0.9);
    if (!res.ok) {
      this.reels.forEach((r, i) => this.scheduleStop(r, Math.round(r.angle / STEP - 0.5), landAt + i * 0.2));
      setTimeout(() => {
        this.spinning = false;
        this.paintHud();
        this.ctx.ui.toast(res.code === 'broke' ? res.error : `Couldn't spin: ${res.error}. Your credits weren't touched.`, 'bad', 4200);
      }, 900);
      return;
    }
    const { stops, win, rule, stats } = res.data;
    this.reels.forEach((r, i) => this.scheduleStop(r, stops[i], landAt + i * 0.45));
    const doneIn = (landAt + 2 * 0.45 + 0.6 - this.clock) * 1000;
    setTimeout(() => {
      if (this.disposed) return;
      this.spinning = false;
      this.stats = stats;
      this.paintHud();
      this.statsPanel?.refresh();
      if (rule === 'three_seven') {
        this.jackpot = true;
        this.celebrate = 4;
        sfx.jackpot();
        this.ctx.ui.banner('JACKPOT!', '#ffd24a');
      } else if (win >= this.bet * 10) {
        this.celebrate = 2.5;
        sfx.coins(win);
        this.ctx.ui.banner(`BIG WIN ${formatCredits(win)}`, '#ffd24a');
      } else if (win > this.bet) {
        this.celebrate = 1.2;
        sfx.coins(win);
        this.ctx.ui.toast(`${PAYTABLE[rule!].label}: you win ${formatCredits(win)}`, 'good');
      } else if (win === this.bet) {
        sfx.ding(false);
        this.ctx.ui.toast('Cherry: your bet comes back');
      }
      if (this.clock - this.lastBoardAt > 4) void this.loadBoard(false);
    }, Math.max(0, doneIn));
  }

  private scheduleStop(r: Reel, stopIndex: number, at: number): void {
    const want = (((stopIndex % STOPS) + STOPS) % STOPS + 0.5) * STEP;
    r.stop = { from: null, to: want, t0: at, dur: 0.55 };
  }

  // -------------------------------------------------------------------------

  actions(player: PlayerState): SpaceAction[] {
    const out: SpaceAction[] = [];
    if (!player.riding) {
      const st = this.stats;
      if (!this.spinning) {
        if (!st) out.push({ ...this.machineSpot, range: 2.4, label: 'The machine is warming up', short: '...', run: () => void this.loadBoard(true) });
        else if (st.balance < BETS[0]) out.push({ ...this.machineSpot, range: 2.4, label: 'Get a free refill', short: 'Refill', run: () => void this.refill() });
        else out.push({ ...this.machineSpot, range: 2.4, label: `Pull the lever (bet ${this.bet})`, short: 'Spin', run: () => void this.spin() });
      }
      out.push({ ...this.kioskSpot, range: 1.6, label: 'Check my credits', short: 'Credits', run: () => this.openStats() });
      if (st) {
        out.push({ ...this.roulette.spot, range: 1.9, label: 'Play roulette', short: 'Roulette', run: () => (this.tablePanel = openRoulette(this.host, this.roulette)) });
        out.push({ ...this.blackjack.spot, range: 1.9, label: this.blackjack.hand?.phase === 'player' ? 'Finish your blackjack hand' : 'Play blackjack', short: 'Blackjack', run: () => (this.tablePanel = openBlackjack(this.host, this.blackjack)) });
      }
    }
    return out;
  }

  kickAction(player: PlayerState): { label: string; run: () => void } | null {
    if (Math.hypot(player.x - this.machineSpot.x, player.z - this.machineSpot.z) > 2.6 || this.spinning) return null;
    return { label: `Bet ${this.bet}`, run: () => this.cycleBet() };
  }

  private openStats(): void {
    const body = h('div', { class: 'credits' });
    const refresh = () => {
      const st = this.stats;
      if (!st) {
        body.replaceChildren(h('p', { class: 'muted' }, 'Loading...'));
        return;
      }
      const net = st.earned - st.spent;
      const stat = (label: string, value: string, cls = '') => h('div', { class: `cstat ${cls}` }, h('span', {}, label), h('strong', {}, value));
      const betRow = h('div', { class: 'seg' }, ...BETS.map((b) => {
        const btn = button(String(b), () => {
          this.bet = b;
          localStorage.setItem('toyboxes.bet', String(b));
          this.paintHud();
          refresh();
        }, `seg-btn${b === this.bet ? ' on' : ''}`);
        return btn;
      }));
      body.replaceChildren(
        h('div', { class: 'cbalance' }, h('span', {}, 'Balance'), h('strong', {}, formatCredits(st.balance))),
        h('div', { class: 'cstats' }, stat('Won', formatCredits(st.earned)), stat('Spent', formatCredits(st.spent)), stat('Net', `${net >= 0 ? '+' : '−'}${formatCredits(Math.abs(net))}`, net >= 0 ? 'up' : 'down'), stat('Spins', String(st.spins)), stat('Biggest win', formatCredits(st.biggestWin)), stat('Refills', String(st.refills))),
        h('p', { class: 'cchart-label' }, 'Your balance over time'),
        chart(st.history),
        h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, 'Bet per spin'), betRow),
        st.balance < BETS[0] ? button('Get a free refill', () => void this.refill(), 'primary') : '',
        h('p', { class: 'cchart-label' }, 'Top balances'),
        h('ol', { class: 'cboard' }, ...(this.boardRows.length ? this.boardRows.map((r) => h('li', { class: r.you ? 'you' : '' }, h('span', {}, r.name), h('strong', {}, formatCredits(r.value)))) : [h('li', {}, 'No one has played yet')])),
      );
    };
    const done = button('Done', () => this.ctx.ui.close(panel), 'primary');
    const panel: Panel = {
      el: card(h('h2', {}, 'My credits'), h('p', { class: 'muted' }, 'Play credits for this casino only. Run out and the machine gives you a free refill.'), body, h('div', { class: 'actions' }, done)),
      onBack: () => this.ctx.ui.close(panel),
      onClose: () => (this.statsPanel = null),
      initial: () => done,
    };
    this.statsPanel = { panel, refresh };
    refresh();
    this.ctx.ui.open(panel);
    void this.loadBoard(false);
  }

  holdsTime(): boolean {
    return false;
  }

  cutaway(cam: THREE.Vector3): void {
    const set = (name: string, cut: boolean) => {
      const w = this.walls.get(name)!;
      w.full.visible = !cut;
      w.stub.visible = cut;
    };
    set('front', cam.z > D - 0.3);
    set('back', cam.z < -D + 0.3);
    set('left', cam.x < -W + 0.3);
    set('right', cam.x > W - 0.3);
  }

  update(night: number, t: number): void {
    const dt = Math.min(0.1, t - (this.lastT || t));
    this.lastT = t;
    this.clock += dt;
    this.roulette.update(dt);
    this.blackjack.update(dt);
    // Reels.
    for (const r of this.reels) {
      if (r.stop && this.clock >= r.stop.t0) {
        if (r.stop.from === null) {
          // Land on the chosen symbol after at least one more turn.
          r.stop.from = r.angle;
          const base = r.angle - (r.angle % (Math.PI * 2));
          let to = base + r.stop.to;
          while (to < r.angle + Math.PI * 2) to += Math.PI * 2;
          r.stop.to = to;
        }
        const k = Math.min(1, (this.clock - r.stop.t0) / r.stop.dur);
        const e = 1 - (1 - k) ** 3;
        r.angle = r.stop.from + (r.stop.to - r.stop.from) * e;
        if (k >= 1) {
          r.stop = null;
          r.speed = 0;
          sfx.reelStop();
        }
      } else if (r.speed > 0) {
        r.angle += r.speed * dt;
      }
      const tick = Math.floor(r.angle / STEP);
      if (tick !== r.lastTick && (r.speed > 0 || r.stop)) sfx.reelTick();
      r.lastTick = tick;
      r.mesh.rotation.x = r.angle;
    }
    // Lever pull and spring back.
    if (this.leverT > 0) {
      this.leverT += dt;
      const k = this.leverT < 0.18 ? this.leverT / 0.18 : Math.max(0, 1 - (this.leverT - 0.18) / 0.4);
      this.lever.rotation.x = k * 1.15;
      if (this.leverT > 0.6) this.leverT = 0;
    }
    // Bulbs chase gently, and flash on wins.
    this.celebrate = Math.max(0, this.celebrate - dt);
    if (this.celebrate <= 0) this.jackpot = false;
    const n = this.bulbs.length;
    this.bulbs.forEach((m, i) => {
      if (this.celebrate > 0) {
        const on = Math.floor(this.clock * 12 + i) % 2 === 0;
        m.emissiveIntensity = on ? 2.2 : 0.2;
        if (this.jackpot) m.emissive.setHSL(((i / n + this.clock) % 1), 0.9, 0.6);
      } else {
        m.emissive.set('#ffcf7a');
        const phase = (this.clock * 3 - i / 2) % 4;
        m.emissiveIntensity = (phase < 1 ? 1.4 : 0.35) + night * 0.3;
      }
    });
    if (this.clock - this.lastBoardAt > 20 && !this.spinning) void this.loadBoard(false);
  }

  private lastT = 0;

  dispose(): void {
    this.disposed = true;
    this.hud.remove();
    if (this.statsPanel) this.ctx.ui.close(this.statsPanel.panel);
    if (this.tablePanel) this.ctx.ui.close(this.tablePanel);
    disposeTree(this.scene);
  }

  /** For scripted playtests. */
  debugInfo() {
    return { machine: this.machineSpot, kiosk: this.kioskSpot, roulette: this.roulette.spot, blackjack: this.blackjack.spot, hand: this.blackjack.hand, rouletteSpinning: this.roulette.spinning, stats: this.stats, spinning: this.spinning, bet: this.bet, reels: this.reels.map((r) => Math.round(((r.angle / STEP - 0.5) % STOPS + STOPS) % STOPS)) };
  }
}

/** Balance over time as a small SVG line chart. */
function chart(history: [number, number][]): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 320 120');
  svg.setAttribute('class', 'cchart');
  svg.setAttribute('role', 'img');
  const pts = history.length > 1 ? history : [...history, ...history];
  const vals = pts.map((p) => p[1]);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(START_CREDITS * 1.2, ...vals);
  const x = (i: number) => 8 + (i / (pts.length - 1)) * 304;
  const y = (v: number) => 108 - ((v - lo) / (hi - lo || 1)) * 96;
  const start = document.createElementNS(NS, 'line');
  start.setAttribute('x1', '8');
  start.setAttribute('x2', '312');
  start.setAttribute('y1', String(y(START_CREDITS)));
  start.setAttribute('y2', String(y(START_CREDITS)));
  start.setAttribute('class', 'cchart-base');
  const area = document.createElementNS(NS, 'path');
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  area.setAttribute('d', `${line} L312,108 L8,108 Z`);
  area.setAttribute('class', 'cchart-area');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', line);
  path.setAttribute('class', 'cchart-line');
  svg.append(area, start, path);
  svg.setAttribute('aria-label', `Balance went from ${vals[0]} to ${vals[vals.length - 1]} over ${history.length - 1} plays`);
  return svg;
}
