// The River Wheel: a 6.2 m money wheel on the stern deck, in front of the
// churning sternwheel. Chips go on up to six symbols; the wheel spins hard,
// the leather flapper ticks slower and slower over the pegs, and it settles
// with a little bounce on the segment the server chose. Its inner ring is
// Old Lucky's Paddle Wheel Bonus: three paddles fly the camera out here and
// the ring decides the prize.

import * as THREE from 'three';
import { BONUS_RING, type RingSegment } from '../../../shared/slots';
import { WHEEL_INFO, WHEEL_MAX_BETS, WHEEL_SEGMENTS, WHEEL_SYMBOLS, type WheelSymbol } from '../../../shared/casino/wheel';
import { tableMax } from '../../../shared/casino/progress';
import type { PlayerState, SpaceAction } from '../../../world/space';
import { button, h } from '../../../ui/ui';
import { DISPLAY_FONT } from '../../../world/kit';
import { formatCredits } from '../../common';
import { sound } from '../audio';
import { Batch } from '../batch';
import { frame, type Framing } from '../director';
import type { Host } from '../host';
import { RIVER_WHEEL, SPOTS, STERNWHEEL, WATER_Y } from '../layout';
import { C, canvasTex } from '../materials';
import { TablePanel, oddsTable } from '../panel';

const TAU = Math.PI * 2;
const OUTER_N = WHEEL_SEGMENTS.length;
const INNER_N = BONUS_RING.length;
const OS = TAU / OUTER_N;
const IS = TAU / INNER_N;
const R = RIVER_WHEEL.r;
const OUT_IN = 2.12;
const IN_R = 2.08;

/** Draws one wheel symbol centred at (0, 0), about `s` across. */
export function drawWheelSymbol(g: CanvasRenderingContext2D, sym: WheelSymbol, s: number, ink = '#fff6e0'): void {
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = s * 0.09;
  switch (sym) {
    case 'anchor':
      g.beginPath();
      g.arc(0, -s * 0.34, s * 0.09, 0, TAU);
      g.stroke();
      g.beginPath();
      g.moveTo(0, -s * 0.25);
      g.lineTo(0, s * 0.38);
      g.moveTo(-s * 0.2, -s * 0.12);
      g.lineTo(s * 0.2, -s * 0.12);
      g.stroke();
      g.beginPath();
      g.arc(0, s * 0.05, s * 0.33, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
      break;
    case 'rope':
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(0, 0, s * (0.12 + i * 0.12), 0, TAU * 0.92);
        g.stroke();
      }
      break;
    case 'lantern':
      g.beginPath();
      g.roundRect(-s * 0.2, -s * 0.22, s * 0.4, s * 0.48, s * 0.06);
      g.stroke();
      g.beginPath();
      g.arc(0, -s * 0.34, s * 0.1, Math.PI, 0);
      g.stroke();
      g.globalAlpha = 0.85;
      g.beginPath();
      g.ellipse(0, s * 0.03, s * 0.08, s * 0.14, 0, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
      break;
    case 'compass':
      g.beginPath();
      g.arc(0, 0, s * 0.36, 0, TAU);
      g.stroke();
      g.beginPath();
      g.moveTo(0, -s * 0.3);
      g.lineTo(s * 0.09, 0);
      g.lineTo(0, s * 0.3);
      g.lineTo(-s * 0.09, 0);
      g.closePath();
      g.fill();
      break;
    case 'helm':
      g.beginPath();
      g.arc(0, 0, s * 0.26, 0, TAU);
      g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        g.beginPath();
        g.moveTo(Math.cos(a) * s * 0.08, Math.sin(a) * s * 0.08);
        g.lineTo(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42);
        g.stroke();
      }
      g.beginPath();
      g.arc(0, 0, s * 0.08, 0, TAU);
      g.fill();
      break;
    case 'star':
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.18 : s * 0.42;
        const a = (i / 10) * TAU - Math.PI / 2;
        if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      break;
  }
  g.restore();
}

const symbolUrls = new Map<WheelSymbol, string>();
function symbolUrl(sym: WheelSymbol): string {
  let u = symbolUrls.get(sym);
  if (!u) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = WHEEL_INFO[sym].color;
    g.beginPath();
    g.arc(48, 48, 46, 0, TAU);
    g.fill();
    g.translate(48, 48);
    drawWheelSymbol(g, sym, 66, sym === 'star' ? '#2a1a10' : '#fff6e0');
    u = c.toDataURL();
    symbolUrls.set(sym, u);
  }
  return u;
}

function ringLabel(v: RingSegment): string {
  return typeof v === 'number' ? `${v}x` : v;
}

/** Canvas angle of a segment's centre (0 at the top, clockwise as you look at it). */
const segAngle = (i: number, step: number) => -Math.PI / 2 + i * step;

function outerTexture(size: number): THREE.CanvasTexture {
  return canvasTex(
    size,
    size,
    (g, W) => {
      const c = W / 2;
      // RingGeometry maps its outer radius (3.02) to the canvas edge.
      const px = (m: number) => (m / 3.02) * c;
      g.clearRect(0, 0, W, W);
      WHEEL_SEGMENTS.forEach((sym, i) => {
        const a = segAngle(i, OS);
        g.fillStyle = WHEEL_INFO[sym].color;
        g.beginPath();
        g.arc(c, c, px(3.02), a - OS / 2, a + OS / 2);
        g.arc(c, c, px(OUT_IN), a + OS / 2, a - OS / 2, true);
        g.closePath();
        g.fill();
        // Alternate shading so neighbours read apart.
        if (i % 2) {
          g.fillStyle = 'rgba(0,0,0,0.12)';
          g.fill();
        }
        g.save();
        g.translate(c + Math.cos(a) * px(2.6), c + Math.sin(a) * px(2.6));
        g.rotate(a + Math.PI / 2);
        drawWheelSymbol(g, sym, px(0.42), sym === 'star' ? '#2a1a10' : '#fff6e0');
        g.restore();
        g.save();
        g.translate(c + Math.cos(a) * px(2.24), c + Math.sin(a) * px(2.24));
        g.rotate(a + Math.PI / 2);
        g.fillStyle = sym === 'star' ? '#2a1a10' : '#fff6e0';
        g.font = `${px(0.16)}px ${DISPLAY_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(`${WHEEL_INFO[sym].pays}:1`, 0, 0);
        g.restore();
      });
      g.strokeStyle = '#e0ac45';
      g.lineWidth = px(0.025);
      for (let i = 0; i < OUTER_N; i++) {
        const a = segAngle(i, OS) + OS / 2;
        g.beginPath();
        g.moveTo(c + Math.cos(a) * px(OUT_IN), c + Math.sin(a) * px(OUT_IN));
        g.lineTo(c + Math.cos(a) * px(3.02), c + Math.sin(a) * px(3.02));
        g.stroke();
      }
    },
    false,
  );
}

function innerTexture(size: number): THREE.CanvasTexture {
  return canvasTex(
    size,
    size,
    (g, W) => {
      const c = W / 2;
      const px = (m: number) => (m / IN_R) * c;
      g.fillStyle = '#2a0e16';
      g.beginPath();
      g.arc(c, c, c, 0, TAU);
      g.fill();
      BONUS_RING.forEach((v, i) => {
        const a = segAngle(i, IS);
        const jackpot = typeof v === 'string';
        g.fillStyle = v === 'GRAND' ? '#ffd24a' : v === 'MAJOR' ? '#d8382c' : v === 'MINI' ? '#7a4fb0' : i % 2 ? '#5a1424' : '#6e1a2c';
        g.beginPath();
        g.arc(c, c, px(2.04), a - IS / 2, a + IS / 2);
        g.arc(c, c, px(0.62), a + IS / 2, a - IS / 2, true);
        g.closePath();
        g.fill();
        // Labels run along the radius, reading outwards, big enough to read from the rail.
        g.save();
        g.translate(c + Math.cos(a) * px(1.38), c + Math.sin(a) * px(1.38));
        g.rotate(a);
        g.fillStyle = v === 'GRAND' ? '#2a1a10' : jackpot ? '#fff6e0' : '#ffd98a';
        g.strokeStyle = v === 'GRAND' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.55)';
        g.lineWidth = px(0.03);
        g.font = `${px(jackpot ? 0.2 : 0.24)}px ${DISPLAY_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.strokeText(ringLabel(v), 0, 0);
        g.fillText(ringLabel(v), 0, 0);
        g.restore();
      });
      g.strokeStyle = '#a8782c';
      g.lineWidth = px(0.02);
      for (let i = 0; i < INNER_N; i++) {
        const a = segAngle(i, IS) + IS / 2;
        g.beginPath();
        g.moveTo(c + Math.cos(a) * px(0.62), c + Math.sin(a) * px(0.62));
        g.lineTo(c + Math.cos(a) * px(2.04), c + Math.sin(a) * px(2.04));
        g.stroke();
      }
      const grd = g.createRadialGradient(c, c, 0, c, c, px(0.62));
      grd.addColorStop(0, '#ffe08a');
      grd.addColorStop(1, '#a8782c');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(c, c, px(0.62), 0, TAU);
      g.fill();
      g.fillStyle = '#5a3a08';
      g.font = `${px(0.13)}px ${DISPLAY_FONT}`;
      g.textAlign = 'center';
      g.fillText('PADDLE WHEEL', c, c - px(0.1));
      g.fillText('BONUS', c, c + px(0.12));
    },
    false,
  );
}

interface Spin {
  ring: 'outer' | 'inner';
  t: number;
  dur: number;
  from: number;
  to: number;
  resolve: () => void;
}

export class RiverWheel {
  readonly group = new THREE.Group();
  private wheel = new THREE.Group();
  private inner = new THREE.Group();
  private outerAngle = 0;
  private innerAngle = 0;
  private spin: Spin | null = null;
  private flapper: THREE.Group;
  private flapKick = 0;
  private lastPeg = 0;
  private lastInnerPeg = 0;
  private bulbs: THREE.InstancedMesh;
  private bulbColor = new THREE.Color();
  private innerMat: THREE.MeshStandardMaterial;
  private stern = new THREE.Group();
  private sternSpeed = 0.55;
  private sternAngle = 0;
  private owned: { dispose(): void }[] = [];
  private panel: TablePanel | null = null;
  private bets = new Map<WheelSymbol, number>();
  private placed: { sym: WheelSymbol; amount: number }[] = [];
  private lastBets = new Map<WheelSymbol, number>();
  private symBtns = new Map<WheelSymbol, HTMLButtonElement>();
  private historyEl: HTMLElement | null = null;
  private spinBtn: HTMLButtonElement | null = null;
  private bonusGlow = 0;
  spinning = false;
  history: WheelSymbol[] = [];
  /** For playtests. */
  shownSegment: number | null = null;
  lastSegment: number | null = null;
  shownBonus: number | null = null;

  constructor(private host: Host) {
    const own = <X extends { dispose(): void }>(x: X): X => {
      this.owned.push(x);
      return x;
    };
    const m = host.mats;
    const g = this.group;
    g.position.set(RIVER_WHEEL.x, 0, RIVER_WHEEL.z);
    host.scene.add(g);
    const size = host.tier() === 'low' ? 1024 : 2048;
    // A-frame and plinth.
    const b = new Batch();
    const brass = new Batch();
    b.add(new THREE.BoxGeometry(1.6, 0.4, 4.2), m.trim, 0.25, 0.2, 0, 0, 0, 0, C.mahogany);
    brass.add(new THREE.BoxGeometry(1.64, 0.05, 4.24), m.brass, 0.25, 0.42, 0);
    for (const sz of [-1, 1]) {
      b.add(new THREE.BoxGeometry(0.24, 4.6, 0.24), m.trim, 0.45, 2.45, sz * 1.25, sz * 0.26, 0, 0, C.mahogany);
      b.add(new THREE.BoxGeometry(0.2, 4.4, 0.2), m.trim, 0.85, 2.35, sz * 1.2, sz * 0.26, 0, -0.12, C.mahoganyLit);
    }
    b.add(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 16).rotateX(Math.PI / 2), m.trim, 0.5, RIVER_WHEEL.y, 0, 0, 0, 0, C.brassMatte);
    // The pointer bracket at the top, from behind the wheel over the rim.
    b.add(new THREE.BoxGeometry(0.16, 0.9, 0.2), m.trim, 0.25, RIVER_WHEEL.y + R + 0.35, 0, 0, 0, 0, C.mahogany);
    brass.add(new THREE.BoxGeometry(0.5, 0.12, 0.3), m.brass, 0.0, RIVER_WHEEL.y + R + 0.12, 0);
    // A name board on top.
    b.build(g);
    brass.build(g);
    const name = own(
      canvasTex(
        1024,
        200,
        (cg, W, Hh) => {
          cg.fillStyle = '#13212b';
          cg.beginPath();
          cg.roundRect(6, 6, W - 12, Hh - 12, 40);
          cg.fill();
          cg.strokeStyle = '#e0ac45';
          cg.lineWidth = 10;
          cg.stroke();
          cg.fillStyle = '#ffd24a';
          cg.font = `110px ${DISPLAY_FONT}`;
          cg.textAlign = 'center';
          cg.textBaseline = 'middle';
          cg.fillText('THE RIVER WHEEL', W / 2, Hh / 2 + 6);
        },
        false,
      ),
    );
    const board = new THREE.Mesh(own(new THREE.PlaneGeometry(4.0, 0.8)), own(new THREE.MeshStandardMaterial({ map: name, emissive: new THREE.Color('#ffffff'), emissiveMap: name, emissiveIntensity: 0.4, roughness: 0.5 })));
    board.position.set(0.1, RIVER_WHEEL.y + R + 1.15, 0);
    board.rotation.y = -Math.PI / 2;
    g.add(board);

    // The wheel itself: faces the deck (-x).
    this.wheel.position.set(0, RIVER_WHEEL.y, 0);
    this.wheel.rotation.y = -Math.PI / 2;
    g.add(this.wheel);
    const spinner = new THREE.Group();
    this.wheel.add(spinner);
    spinner.name = 'outer';
    const back = new THREE.Mesh(own(new THREE.CylinderGeometry(R, R, 0.25, 64).rotateX(Math.PI / 2)), m.lacquer);
    back.castShadow = true;
    spinner.add(back);
    const ring = new THREE.Mesh(own(new THREE.RingGeometry(OUT_IN, 3.02, 102, 1)), own(new THREE.MeshStandardMaterial({ map: own(outerTexture(size)), roughness: 0.45, transparent: true, alphaTest: 0.5 })));
    // RingGeometry UVs map the whole square, so the canvas centre is the wheel centre.
    ring.position.z = 0.13;
    spinner.add(ring);
    const rim = new THREE.Mesh(own(new THREE.TorusGeometry(3.05, 0.07, 10, 96)), m.brass);
    rim.position.z = 0.13;
    spinner.add(rim);
    // Pegs between segments for the flapper.
    const pb = new Batch();
    for (let i = 0; i < OUTER_N; i++) {
      const a = -segAngle(i, OS) - OS / 2;
      pb.add(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 6).rotateX(Math.PI / 2), m.brass, Math.cos(a) * 3.08, Math.sin(a) * 3.08, 0.2);
    }
    pb.build(spinner);
    // Bulbs round the rim, one per segment.
    this.bulbs = new THREE.InstancedMesh(own(new THREE.SphereGeometry(0.065, 10, 8)), m.bulb, OUTER_N);
    const mm = new THREE.Matrix4();
    for (let i = 0; i < OUTER_N; i++) {
      const a = -segAngle(i, OS);
      this.bulbs.setMatrixAt(i, mm.makeTranslation(Math.cos(a) * 2.88, Math.sin(a) * 2.88, 0.19));
      this.bulbs.setColorAt(i, new THREE.Color(C.bulb));
    }
    spinner.add(this.bulbs);
    // The inner bonus ring turns on its own.
    this.innerMat = own(new THREE.MeshStandardMaterial({ map: own(innerTexture(size)), roughness: 0.45, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.05 }));
    this.innerMat.emissiveMap = this.innerMat.map;
    const disc = new THREE.Mesh(own(new THREE.CircleGeometry(IN_R, 96)), this.innerMat);
    disc.position.z = 0.135;
    this.inner.add(disc);
    const hub = new THREE.Mesh(own(new THREE.CylinderGeometry(0.3, 0.38, 0.16, 24).rotateX(Math.PI / 2)), m.brass);
    hub.position.z = 0.22;
    this.inner.add(hub);
    this.wheel.add(this.inner);
    // Pointers: the flapper for the outer ring, a brass arrow for the bonus ring.
    this.flapper = new THREE.Group();
    this.flapper.position.set(0, R + 0.08, 0.32);
    const leather = new THREE.Mesh(own(new THREE.BoxGeometry(0.12, 0.42, 0.03).translate(0, -0.21, 0)), own(new THREE.MeshStandardMaterial({ color: '#6a3a1a', roughness: 0.8 })));
    leather.castShadow = true;
    this.flapper.add(leather);
    this.wheel.add(this.flapper);
    const rod = new THREE.Mesh(own(new THREE.CylinderGeometry(0.025, 0.025, 1.05, 8)), m.brass);
    rod.position.set(0, R - 0.45, 0.36);
    this.wheel.add(rod);
    const arrow = new THREE.Mesh(own(new THREE.ConeGeometry(0.12, 0.28, 3).rotateZ(Math.PI)), m.brass);
    arrow.position.set(0, IN_R - 0.04, 0.36);
    this.wheel.add(arrow);

    // The sternwheel beyond the rail: buckets, spokes and rims, churning the river.
    this.stern.position.set(STERNWHEEL.x - RIVER_WHEEL.x, STERNWHEEL.y, 0);
    const sb = new Batch();
    const red = C.wheelRed;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      sb.add(new THREE.BoxGeometry(0.85, 0.12, STERNWHEEL.width), m.trim, Math.cos(a) * 3.0, Math.sin(a) * 3.0, 0, 0, 0, a + Math.PI / 2, red);
      for (const z of [-6.6, 0, 6.6]) sb.add(new THREE.BoxGeometry(0.12, 3.3, 0.12), m.trim, Math.cos(a) * 1.65, Math.sin(a) * 1.65, z, 0, 0, a + Math.PI / 2, '#3a2a1a');
    }
    for (const z of [-6.6, 0, 6.6]) sb.add(new THREE.TorusGeometry(3.3, 0.08, 6, 40), m.trim, 0, 0, z, 0, 0, 0, '#2a1a10');
    sb.add(new THREE.CylinderGeometry(0.3, 0.3, STERNWHEEL.width + 0.6, 16).rotateX(Math.PI / 2), m.trim, 0, 0, 0, 0, 0, 0, '#2a2a33');
    sb.build(this.stern);
    g.add(this.stern);
    // Beams carrying the axle back to the hull.
    const beams = new Batch();
    for (const z of [-7.2, 7.2]) {
      beams.add(new THREE.BoxGeometry(5.6, 0.3, 0.3), m.trim, (STERNWHEEL.x - RIVER_WHEEL.x) / 2 + 0.3, STERNWHEEL.y + 0.2, z, 0, 0, -0.12, C.ivory);
      beams.add(new THREE.BoxGeometry(0.3, 2.6, 0.3), m.trim, STERNWHEEL.x - RIVER_WHEEL.x, STERNWHEEL.y + 1.3 - 1.2, z, 0, 0, 0, C.ivory);
    }
    beams.build(g);
  }

  // -------------------------------------------------------------------------

  /** The top half of the wheel and its pointer, above the docked panel. */
  framing(): Framing {
    return frame(12.4, 5.2, 0.6, RIVER_WHEEL.x, 4.44, 0, 52);
  }

  /** The whole wheel face, for the bonus. */
  bonusFraming(): Framing {
    return frame(RIVER_WHEEL.x - 8.2, RIVER_WHEEL.y + 0.5, 0.3, RIVER_WHEEL.x, RIVER_WHEEL.y + 0.1, 0, 50);
  }

  actions(_p: PlayerState, act: (label: string, short: string, run: () => void) => SpaceAction): SpaceAction[] {
    if (!this.host.eco.stats) return [];
    return [{ ...SPOTS.wheel, ...act('Play the River Wheel', 'Wheel', () => this.open()) }];
  }

  open(): void {
    if (this.panel?.open) return;
    const host = this.host;
    const grid = h('div', { class: 'rw-grid' });
    this.symBtns.clear();
    for (const s of WHEEL_SYMBOLS) {
      const btn = button('', () => this.place(s.id), 'rw-sym');
      btn.append(h('img', { src: symbolUrl(s.id), alt: '' }), h('b', {}, s.label), h('small', {}, `${s.pays} to 1 · ${s.count} of 51`));
      btn.style.setProperty('--sym', s.color);
      btn.setAttribute('aria-label', `${s.label}, pays ${s.pays} to 1`);
      this.symBtns.set(s.id, btn);
      grid.appendChild(btn);
    }
    this.historyEl = h('div', { class: 'rw-history', 'aria-label': 'Recent spins' });
    const undo = button('Undo', () => this.undo(), 'tiny');
    const clear = button('Clear', () => this.clearBets(), 'tiny ghost');
    this.spinBtn = button('Spin', () => void this.spinWheel(), 'primary');
    const panel = new TablePanel(host, {
      id: 'wheel',
      title: 'The River Wheel',
      game: 'wheel',
      chips: 'place',
      coach: 'Put chips on the symbols you think will stop at the top.',
      help: ['Pick a chip, then press a symbol to put it there. Up to six symbols a spin.', 'The rarer the symbol, the more it pays: a Star pays 47 to 1.', 'Spin. The flapper at the top shows the winner.'],
      odds: () =>
        oddsTable(
          WHEEL_SYMBOLS.map((s) => [s.label, `${s.pays} to 1`, `${s.count} in 51`] as [string, string, string]),
          `Every symbol returns 48 in 51 over time, about 94 in 100. Rail limit ${formatCredits(tableMax(host.eco.rank))}.`,
        ),
      alt: { label: 'Rebet', run: () => this.rebet() },
      initial: () => this.symBtns.get('anchor') ?? null,
      onClose: () => {
        host.director.setSeat(null);
        if (!this.spinning) this.clearBets(true);
      },
    });
    panel.body.append(grid);
    panel.actions.prepend(this.historyEl);
    panel.actions.append(undo, clear, this.spinBtn);
    this.panel = panel;
    this.paintBets();
    this.paintHistory();
    panel.status('Place your chips.');
    panel.show();
    host.director.setSeat(this.framing());
    host.tried('wheel');
  }

  private total(): number {
    let t = 0;
    for (const v of this.bets.values()) t += v;
    return t;
  }

  private place(sym: WheelSymbol): void {
    const p = this.panel;
    if (!p || this.spinning) return;
    const amount = p.chip;
    if (!this.bets.has(sym) && this.bets.size >= WHEEL_MAX_BETS) return;
    if (this.total() + amount > tableMax(this.host.eco.rank)) {
      sound.error();
      p.status(`The rail limit is ${formatCredits(tableMax(this.host.eco.rank))}.`, 'bad');
      return;
    }
    if (this.total() + amount > this.host.eco.shown) {
      sound.error();
      p.status('Not enough credits for that chip.', 'bad');
      return;
    }
    this.bets.set(sym, (this.bets.get(sym) ?? 0) + amount);
    this.placed.push({ sym, amount });
    sound.chip();
    this.paintBets();
    p.status(`${WHEEL_INFO[sym].label}: ${formatCredits(this.bets.get(sym)!)}. Total ${formatCredits(this.total())}.`);
  }

  private undo(): void {
    if (this.spinning || !this.placed.length) return;
    const last = this.placed.pop()!;
    const left = (this.bets.get(last.sym) ?? 0) - last.amount;
    if (left > 0) this.bets.set(last.sym, left);
    else this.bets.delete(last.sym);
    sound.click();
    this.paintBets();
  }

  private clearBets(silent = false): void {
    if (this.spinning) return;
    this.bets.clear();
    this.placed = [];
    this.paintBets();
    if (!silent) sound.click();
  }

  private rebet(): void {
    if (this.spinning || !this.lastBets.size || !this.panel) return;
    let sum = 0;
    for (const v of this.lastBets.values()) sum += v;
    if (sum > this.host.eco.shown) {
      this.panel.status('Not enough credits to repeat those chips.', 'bad');
      return;
    }
    this.bets = new Map(this.lastBets);
    this.placed = [...this.bets].map(([sym, amount]) => ({ sym, amount }));
    sound.chip();
    this.paintBets();
  }

  private paintBets(): void {
    for (const [sym, btn] of this.symBtns) {
      const v = this.bets.get(sym);
      let badge = btn.querySelector('.rl-badge') as HTMLElement | null;
      if (v) {
        if (!badge) {
          badge = h('span', { class: 'rl-badge' });
          btn.appendChild(badge);
        }
        badge.textContent = formatCredits(v);
      } else badge?.remove();
      btn.classList.toggle('has-bet', !!v);
    }
    if (this.spinBtn) {
      this.spinBtn.disabled = this.spinning || !this.bets.size;
      this.spinBtn.textContent = this.bets.size ? `Spin (${formatCredits(this.total())})` : 'Spin';
    }
    this.panel?.setAlt(this.lastBets.size && !this.bets.size ? 'Rebet' : null);
  }

  private paintHistory(): void {
    if (!this.historyEl) return;
    this.historyEl.replaceChildren(h('small', {}, 'Recent'), ...this.history.slice(0, 8).map((s) => h('img', { class: 'rw-hist', src: symbolUrl(s), alt: WHEEL_INFO[s].label })));
  }

  async spinWheel(): Promise<void> {
    const host = this.host;
    const p = this.panel;
    if (this.spinning || !this.bets.size || !p) return;
    const staked = this.total();
    if (!host.canAfford(staked, 'wheel')) return;
    this.spinning = true;
    p.locked = true;
    p.paintChips();
    this.paintBets();
    host.eco.hold(staked);
    sound.lever();
    p.status('Round she goes...');
    const bets = Object.fromEntries(this.bets);
    // Spin up while the server decides.
    const started = host.clock();
    this.spin = { ring: 'outer', t: 0, dur: 99, from: this.outerAngle, to: this.outerAngle + 1e9, resolve: () => {} };
    const res = await host.eco.play<{ segment: number; symbol: WheelSymbol; win: number }>('wheel', { bets });
    if (!res.ok) {
      this.spin = null;
      await this.settle('outer', Math.round(this.outerAngle / OS) % OUTER_N, 0.8);
      host.eco.release(staked);
      this.spinning = false;
      p.locked = false;
      p.paintChips();
      this.paintBets();
      p.status("Couldn't reach the boat. Your credits weren't touched.", 'bad');
      host.failed(res.error, res.code);
      return;
    }
    const d = res.data;
    this.lastSegment = d.segment;
    this.spin = null;
    await this.settle('outer', d.segment, Math.max(4.2, 5.2 - (host.clock() - started)));
    this.shownSegment = d.segment;
    this.history.unshift(d.symbol);
    this.lastBets = new Map(this.bets);
    host.eco.commit(d, staked);
    const info = WHEEL_INFO[d.symbol];
    if (d.win > 0) {
      host.cer.win({ paid: d.win, staked, at: new THREE.Vector3(RIVER_WHEEL.x - 0.6, RIVER_WHEEL.y + R, 0), dir: { x: -1, z: 0 }, label: info.label });
      p.status(d.win > staked ? `${info.label}! You win ${formatCredits(d.win)}.` : `${info.label}: ${formatCredits(d.win)} comes back.`, 'good');
      if (d.symbol === 'star') host.kit.banner('STAR OF THE RIVER', { sub: `47 to 1: ${formatCredits(d.win)}`, color: '#ffd24a', ms: 2600 });
    } else {
      p.status(`${info.label}. No win this time.`);
      sound.lose();
    }
    this.bets.clear();
    this.placed = [];
    this.paintHistory();
    this.spinning = false;
    p.locked = false;
    p.paintChips();
    this.paintBets();
  }

  /** Slows a ring from its current speed to stop on `segment`, with a bounce off the flapper. */
  private settle(ring: 'outer' | 'inner', segment: number, seconds: number): Promise<void> {
    const step = ring === 'outer' ? OS : IS;
    const cur = ring === 'outer' ? this.outerAngle : this.innerAngle;
    const turns = ring === 'outer' ? 3 : 4;
    let to = segment * step;
    while (to < cur + TAU * turns) to += TAU;
    // Land a touch past centre, then bounce back to it.
    return new Promise((resolve) => {
      this.spin = { ring, t: 0, dur: seconds / this.host.timeScale(), from: cur, to, resolve };
    });
  }

  /**
   * Old Lucky's bonus: fly out to the wheel, light the inner ring, spin it
   * to the server's segment, and fly back. Skippable once the ring is going.
   */
  async bonus(segment: number, value: RingSegment, mult: number, back: Framing, from: Framing): Promise<void> {
    const host = this.host;
    const ts = host.timeScale();
    const fly = 1.2;
    const ringT = 4.6;
    this.bonusGlow = 1;
    host.kit.letterbox(true);
    const keys = [
      { t: 0, f: from },
      { t: fly, f: this.bonusFraming() },
      { t: fly + ringT + 1.6, f: this.bonusFraming() },
      { t: fly + ringT + 2.6, f: back },
    ];
    const ride = host.director.play(keys.map((k) => ({ t: k.t / ts, f: k.f })), { skippableAfter: (fly + 0.6) / ts, skipLabel: 'Skip' });
    let skipped = false;
    void ride.then(() => (skipped = true));
    await new Promise((r) => setTimeout(r, (fly * 1000) / ts));
    sound.whistle(false);
    this.sternSpeed = 1.6;
    const spun = this.settle('inner', segment, ringT);
    await Promise.race([spun, ride]);
    if (skipped || this.spin?.ring === 'inner') {
      // Skipped: show where it landed at once.
      this.spin = null;
      this.innerAngle = segment * IS + Math.ceil(this.innerAngle / TAU) * TAU;
    }
    this.shownBonus = segment;
    sound.thunk();
    host.kit.banner(typeof value === 'number' ? `${mult}x` : `${value}!`, { sub: typeof value === 'number' ? 'Bonus prize' : 'Jackpot', color: '#ffd24a', ms: 1800, size: 'xl' });
    host.post.pulse(0.6);
    await ride;
    host.kit.letterbox(false);
    this.bonusGlow = 0;
    this.sternSpeed = 0.55;
  }

  /** The GRAND: the wheel spins by itself for a while, lights chasing. */
  celebrate(): void {
    if (this.spinning || this.spin) return;
    this.spin = { ring: 'outer', t: 0, dur: 99, from: this.outerAngle, to: this.outerAngle + 1e9, resolve: () => {} };
    setTimeout(() => {
      if (this.spin?.dur === 99 && !this.spinning) void this.settle('outer', Math.round(this.outerAngle / OS) % OUTER_N, 3);
    }, 6000);
  }

  update(dt: number, opts: { boost: number }): void {
    const sp = this.spin;
    if (sp) {
      if (sp.dur > 90) {
        // Spinning up, waiting for the server.
        this.outerAngle += dt * Math.min(5, (sp.t += dt) * 6);
      } else {
        sp.t += dt;
        const k = Math.min(1, sp.t / sp.dur);
        const e = 1 - (1 - k) ** 3;
        // A small overshoot near the end, then back against the flapper.
        const bounce = k > 0.9 ? Math.sin(((k - 0.9) / 0.1) * Math.PI) * 0.012 : 0;
        const a = sp.from + (sp.to - sp.from) * e + bounce;
        if (sp.ring === 'outer') this.outerAngle = a;
        else this.innerAngle = a;
        if (k >= 1) {
          if (sp.ring === 'outer') this.outerAngle = sp.to;
          else this.innerAngle = sp.to;
          this.spin = null;
          sound.thunk();
          sp.resolve();
        }
      }
    }
    (this.wheel.getObjectByName('outer') as THREE.Object3D).rotation.z = this.outerAngle;
    this.inner.rotation.z = this.innerAngle;
    // The flapper flicks over each peg; the ticks slow as the wheel does.
    const peg = Math.floor(this.outerAngle / OS + 0.5);
    if (peg !== this.lastPeg) {
      this.lastPeg = peg;
      this.flapKick = 1;
      sound.flapper();
    }
    const ipeg = Math.floor(this.innerAngle / IS + 0.5);
    if (ipeg !== this.lastInnerPeg) {
      this.lastInnerPeg = ipeg;
      sound.reelTick();
    }
    this.flapKick = Math.max(0, this.flapKick - dt * 8);
    this.flapper.rotation.z = -this.flapKick * 0.5;
    // The sternwheel churns faster while the wheel spins.
    const want = this.spinning || this.spin ? 1.4 : this.sternSpeed;
    this.sternSpeed += (want - this.sternSpeed) * Math.min(1, dt);
    this.sternAngle -= dt * this.sternSpeed;
    this.stern.rotation.z = this.sternAngle;
    if (Math.random() < dt * (6 + this.sternSpeed * 10) && this.host.tier() !== 'low') {
      const z = (Math.random() - 0.5) * STERNWHEEL.width;
      this.host.fx.steam.burst({ at: { x: STERNWHEEL.x + 1.5, y: WATER_Y + 0.2, z }, count: 3, shape: 'up', speed: [0.5, 1.6], color: 0xeaf4ff, size: [0.4, 0.9], sizeEnd: 2, life: [0.8, 1.4], gravity: 1, drag: 0.5, alpha: 0.45 });
    }
    // Bulbs chase (at most 3 flashes a second); the bonus ring glows when it is in play.
    const now = this.host.clock();
    const rate = this.spinning || this.spin ? 2.5 : opts.boost > 0.3 ? 2.5 : 1;
    const phase = Math.floor(now * rate * 2);
    for (let i = 0; i < OUTER_N; i++) {
      const on = (i + phase) % 3 !== 0;
      this.bulbColor.set(C.bulb).multiplyScalar(on ? 1.15 : 0.3);
      this.bulbs.setColorAt(i, this.bulbColor);
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
    this.innerMat.emissiveIntensity += ((this.bonusGlow ? 0.55 : 0.05) - this.innerMat.emissiveIntensity) * Math.min(1, dt * 3);
  }

  dispose(): void {
    this.panel?.dispose();
    for (const o of this.owned) o.dispose();
    this.bulbs.dispose();
  }
}
