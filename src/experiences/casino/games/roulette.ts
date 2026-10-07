// The Spinning Lily: European roulette with a real betting board. Pick a
// chip, then place it on numbers, dozens, columns or the even bets (up to
// eight a spin). Chips appear on the felt as you place them; Spinner calls
// "No more bets!", the ball orbits, drops and settles in the pocket the
// server chose, the dolly marks the number, and losing chips are raked in.

import * as THREE from 'three';
import { IS_TV } from '../../../input/input';
import { ROULETTE_LABELS, ROULETTE_MAX_BETS, WHEEL_ORDER, pocketColor, rouletteKey, rouletteReturn, type RouletteBet, type RouletteChip, type RouletteType } from '../../../shared/casino-games';
import { tableMax } from '../../../shared/casino/progress';
import type { PlayerState, SpaceAction } from '../../../world/space';
import { button, h } from '../../../ui/ui';
import { DISPLAY_FONT } from '../../../world/kit';
import { formatCredits } from '../../common';
import { sound } from '../audio';
import { Batch } from '../batch';
import { frame } from '../director';
import type { Host } from '../host';
import { ROULETTE, SPOTS } from '../layout';
import { C, canvasTex } from '../materials';
import { TablePanel, oddsTable } from '../panel';
import type { Staff } from '../staff';

const TAU = Math.PI * 2;
const POCKET = TAU / 37;
const WHEEL_X = -1.3;
const TOP = 0.95;
const FACE_R = 0.5;
const REST_R = 0.37;
const TRACK_R = 0.58;
/** Felt texture pixels per metre (1024 px across 3.6 m). */
const PX = 1024 / 3.6;

/** Felt layout, in canvas pixels. */
const G = { x0: 380, cw: 48, y0: 56, ch: 78, dz: 58, ev: 58 };

function cellRect(b: RouletteBet): [number, number, number, number] {
  const { x0, cw, y0, ch } = G;
  if (b.type === 'number') {
    if (b.number === 0) return [x0 - 50, y0, 50, ch * 3];
    const n = b.number!;
    const c = Math.floor((n - 1) / 3);
    const r = 2 - ((n - 1) % 3);
    return [x0 + c * cw, y0 + r * ch, cw, ch];
  }
  if (b.type.startsWith('col')) {
    const r = 3 - Number(b.type[3]);
    return [x0 + 12 * cw, y0 + r * ch, 50, ch];
  }
  if (b.type.startsWith('dozen')) {
    const i = Number(b.type[5]) - 1;
    return [x0 + i * cw * 4, y0 + ch * 3, cw * 4, G.dz];
  }
  const order: RouletteType[] = ['low', 'even', 'red', 'black', 'odd', 'high'];
  const i = order.indexOf(b.type);
  return [x0 + i * cw * 2, y0 + ch * 3 + G.dz, cw * 2, G.ev];
}

function feltTexture(): THREE.CanvasTexture {
  return canvasTex(
    1024,
    512,
    (g, W, H) => {
      g.fillStyle = C.felt;
      g.fillRect(0, 0, W, H);
      // Faint nap.
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
        g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
      }
      g.strokeStyle = 'rgba(255,246,224,0.85)';
      g.lineWidth = 3;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const cells: RouletteBet[] = [{ type: 'number', number: 0 }];
      for (let n = 1; n <= 36; n++) cells.push({ type: 'number', number: n });
      cells.push({ type: 'col1' }, { type: 'col2' }, { type: 'col3' }, { type: 'dozen1' }, { type: 'dozen2' }, { type: 'dozen3' });
      for (const t of ['low', 'even', 'red', 'black', 'odd', 'high'] as RouletteType[]) cells.push({ type: t });
      for (const b of cells) {
        const [x, y, w, hh] = cellRect(b);
        if (b.type === 'number') {
          const col = pocketColor(b.number!);
          g.fillStyle = col === 'green' ? '#1f8a4c' : col === 'red' ? '#b8282e' : '#1d1830';
          g.beginPath();
          g.ellipse(x + w / 2, y + hh / 2, w * 0.36, hh * 0.3, 0, 0, TAU);
          g.fill();
          g.fillStyle = '#fff6e0';
          g.font = `${b.number! > 9 ? 22 : 26}px ${DISPLAY_FONT}`;
          g.fillText(String(b.number), x + w / 2, y + hh / 2 + 1);
        } else {
          g.fillStyle = '#fff6e0';
          g.font = `${b.type.startsWith('col') ? 18 : 24}px ${DISPLAY_FONT}`;
          const label = b.type.startsWith('col') ? '2:1' : b.type === 'red' || b.type === 'black' ? '' : b.type === 'low' ? '1-18' : b.type === 'high' ? '19-36' : b.type === 'even' ? 'EVEN' : b.type === 'odd' ? 'ODD' : b.type === 'dozen1' ? '1st 12' : b.type === 'dozen2' ? '2nd 12' : '3rd 12';
          g.fillText(label, x + w / 2, y + hh / 2);
          if (b.type === 'red' || b.type === 'black') {
            g.fillStyle = b.type === 'red' ? '#b8282e' : '#1d1830';
            g.beginPath();
            g.moveTo(x + w / 2, y + 8);
            g.lineTo(x + w - 14, y + hh / 2);
            g.lineTo(x + w / 2, y + hh - 8);
            g.lineTo(x + 14, y + hh / 2);
            g.closePath();
            g.fill();
            g.strokeStyle = 'rgba(255,246,224,0.85)';
            g.lineWidth = 2;
            g.stroke();
            g.lineWidth = 3;
          }
        }
        g.strokeRect(x, y, w, hh);
      }
      // Gilded lettering round the wheel end.
      g.fillStyle = 'rgba(224,172,69,0.85)';
      g.font = `30px ${DISPLAY_FONT}`;
      g.fillText('THE SPINNING LILY', 660, 486);
      g.strokeStyle = 'rgba(224,172,69,0.6)';
      g.lineWidth = 4;
      g.strokeRect(10, 10, W - 20, H - 20);
    },
    false,
  );
}

function wheelTexture(): THREE.CanvasTexture {
  return canvasTex(
    1024,
    1024,
    (g, W) => {
      const c = W / 2;
      const r = (m: number) => (m / FACE_R) * c;
      g.fillStyle = '#5b3a1e';
      g.beginPath();
      g.arc(c, c, c, 0, TAU);
      g.fill();
      WHEEL_ORDER.forEach((n, k) => {
        const a0 = (k - 0.5) * POCKET;
        const a1 = (k + 0.5) * POCKET;
        const col = pocketColor(n);
        g.fillStyle = col === 'green' ? '#1f8a4c' : col === 'red' ? '#b8282e' : '#1d1830';
        g.beginPath();
        g.arc(c, c, r(0.49), a0, a1);
        g.arc(c, c, r(0.32), a1, a0, true);
        g.closePath();
        g.fill();
        g.save();
        g.translate(c, c);
        g.rotate(k * POCKET);
        g.fillStyle = '#fff6e0';
        g.font = `40px ${DISPLAY_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.translate(r(0.455), 0);
        g.rotate(Math.PI / 2);
        g.fillText(String(n), 0, 0);
        g.restore();
      });
      // Pocket frets.
      g.strokeStyle = '#e0ac45';
      g.lineWidth = 5;
      for (let k = 0; k < 37; k++) {
        const a = (k + 0.5) * POCKET;
        g.beginPath();
        g.moveTo(c + Math.cos(a) * r(0.32), c + Math.sin(a) * r(0.32));
        g.lineTo(c + Math.cos(a) * r(0.42), c + Math.sin(a) * r(0.42));
        g.stroke();
      }
      g.lineWidth = 6;
      for (const m of [0.32, 0.42, 0.49]) {
        g.beginPath();
        g.arc(c, c, r(m), 0, TAU);
        g.stroke();
      }
      // The cone, with a lily in brass.
      const grd = g.createRadialGradient(c, c, 10, c, c, r(0.32));
      grd.addColorStop(0, '#e0ac45');
      grd.addColorStop(1, '#7a4a24');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(c, c, r(0.32), 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,246,224,0.35)';
      for (let i = 0; i < 6; i++) {
        g.save();
        g.translate(c, c);
        g.rotate((i / 6) * TAU);
        g.beginPath();
        g.ellipse(0, -r(0.16), r(0.05), r(0.14), 0, 0, TAU);
        g.fill();
        g.restore();
      }
    },
    false,
  );
}

const CHIP_COLORS: Record<number, string> = { 500: '#b8862e', 250: '#7a4fb0', 100: '#23203a', 50: '#c8483a', 25: '#2f8f5a', 10: '#2b6f9e', 5: '#f4e7cc' };

/** Splits an amount into chip colours for a stack, largest first. */
function stackOf(amount: number): number[] {
  const out: number[] = [];
  let left = amount;
  for (const d of [500, 250, 100, 50, 25, 10, 5]) {
    while (left >= d && out.length < 12) {
      out.push(d);
      left -= d;
    }
  }
  return out;
}

interface FlyChip {
  i: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  fade: boolean;
}

export class Roulette {
  readonly group = new THREE.Group();
  private wheel = new THREE.Group();
  private ball: THREE.Mesh;
  private wheelAngle = 0;
  private ballRel = 0;
  private spinState: { t: number; dur: number; w0: number; dw: number; r0: number; r1: number; resolve: () => void } | null = null;
  private lastTick = 0;
  private dolly: THREE.Mesh;
  private dollyAt: THREE.Vector3 | null = null;
  private chipMesh: THREE.InstancedMesh;
  private chipColor = new THREE.Color();
  private flying: FlyChip[] = [];
  private owned: { dispose(): void }[] = [];
  private panel: TablePanel | null = null;
  private bets: RouletteChip[] = [];
  private placed: { key: string; amount: number }[] = [];
  private lastBets: RouletteChip[] = [];
  private cellBtns = new Map<string, HTMLButtonElement>();
  private recentEl: HTMLElement | null = null;
  spinning = false;
  history: number[] = [];
  /** For playtests. */
  shownPocket: number | null = null;
  lastPocket: number | null = null;
  private spinBtn: HTMLButtonElement | null = null;

  constructor(
    private host: Host,
    private staff: Staff,
  ) {
    const own = <X extends { dispose(): void }>(x: X): X => {
      this.owned.push(x);
      return x;
    };
    const m = host.mats;
    const g = this.group;
    g.position.set(ROULETTE.x, 0, ROULETTE.z);
    host.scene.add(g);
    const b = new Batch();
    const brass = new Batch();
    // Mahogany body with a padded rail all round.
    b.add(new THREE.BoxGeometry(ROULETTE.w - 0.1, 0.93, ROULETTE.d - 0.1), m.trim, 0, 0.465, 0, 0, 0, 0, C.mahogany);
    for (const [x, z, w, d] of [[0, ROULETTE.d / 2 - 0.06, ROULETTE.w, 0.14], [0, -ROULETTE.d / 2 + 0.06, ROULETTE.w, 0.14], [ROULETTE.w / 2 - 0.06, 0, 0.14, ROULETTE.d], [-ROULETTE.w / 2 + 0.06, 0, 0.14, ROULETTE.d]] as const) {
      b.add(new THREE.BoxGeometry(w, 0.12, d), m.trim, x, TOP + 0.02, z, 0, 0, 0, '#3a1a12');
    }
    brass.add(new THREE.BoxGeometry(ROULETTE.w + 0.02, 0.03, ROULETTE.d + 0.02), m.brass, 0, 0.85, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 10), m.trim, sx * (ROULETTE.w / 2 - 0.2), 0.05, sz * (ROULETTE.d / 2 - 0.2), 0, 0, 0, C.brassMatte);
    // The wheel's bowl, rising from the felt at the left end.
    const bowl = ([[0.66, 0], [0.7, 0.08], [0.69, 0.14], [0.62, 0.15], [0.56, 0.1], [0.52, 0.06], [0.5, 0.05]] as [number, number][]).map(([r, y]) => new THREE.Vector2(r, y));
    b.add(new THREE.LatheGeometry(bowl, 48), m.trim, WHEEL_X, TOP, 0, 0, 0, 0, '#4a2a14');
    brass.add(new THREE.TorusGeometry(0.69, 0.025, 8, 64).rotateX(Math.PI / 2), m.brass, WHEEL_X, TOP + 0.14, 0);
    // Felt with the layout painted on it.
    const felt = new THREE.Mesh(own(new THREE.PlaneGeometry(ROULETTE.w - 0.2, ROULETTE.d - 0.2).rotateX(-Math.PI / 2)), own(new THREE.MeshStandardMaterial({ map: own(feltTexture()), roughness: 0.95 })));
    felt.position.y = TOP;
    felt.receiveShadow = true;
    b.build(g);
    brass.build(g);
    g.add(felt);
    // The wheel head: the face and a turret with a cross handle.
    this.wheel.position.set(WHEEL_X, TOP + 0.05, 0);
    const face = new THREE.Mesh(own(new THREE.CircleGeometry(FACE_R, 74).rotateX(-Math.PI / 2)), own(new THREE.MeshStandardMaterial({ map: own(wheelTexture()), roughness: 0.4 })));
    this.wheel.add(face);
    const wb = new Batch();
    wb.add(new THREE.ConeGeometry(0.14, 0.12, 16), m.brass, 0, 0.06, 0);
    wb.add(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), m.brass, 0, 0.16, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      wb.add(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6).rotateZ(Math.PI / 2).rotateY(a), m.brass, Math.cos(a) * 0.1, 0.22, -Math.sin(a) * 0.1);
      wb.add(new THREE.SphereGeometry(0.022, 8, 6), m.brass, Math.cos(a) * 0.2, 0.22, -Math.sin(a) * 0.2);
    }
    for (let k = 0; k < 37; k++) {
      // Raised frets so the ball has something to rattle over.
      const a = (k + 0.5) * POCKET;
      wb.add(new THREE.BoxGeometry(0.1, 0.02, 0.008), m.brass, Math.cos(a) * 0.37, 0.01, Math.sin(a) * 0.37, 0, -a, 0);
    }
    wb.build(this.wheel);
    g.add(this.wheel);
    this.ball = new THREE.Mesh(own(new THREE.SphereGeometry(0.028, 16, 12)), own(new THREE.MeshStandardMaterial({ color: '#fbf8f0', roughness: 0.15, metalness: 0.1 })));
    this.ball.castShadow = true;
    g.add(this.ball);
    this.placeBall(REST_R, 0);
    // The dolly that marks the winning number.
    this.dolly = new THREE.Mesh(own(new THREE.CylinderGeometry(0.035, 0.05, 0.12, 14)), m.brass);
    this.dolly.visible = false;
    g.add(this.dolly);
    // Chips on the felt: one instanced mesh, coloured per chip.
    const chipGeo = own(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 18));
    this.chipMesh = new THREE.InstancedMesh(chipGeo, own(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 })), 200);
    this.chipMesh.count = 0;
    this.chipMesh.castShadow = true;
    this.chipMesh.frustumCulled = false;
    g.add(this.chipMesh);
    // The recent numbers on a little brass marquee at the end of the table.
    void own;
  }

  private placeBall(radius: number, lift: number): void {
    const a = this.ballRel - this.wheelAngle;
    this.ball.position.set(WHEEL_X + Math.cos(a) * radius, TOP + 0.078 + lift, Math.sin(a) * radius);
  }

  /** A felt point (canvas pixels) in table-local metres. */
  private feltAt(px: number, py: number): THREE.Vector3 {
    return new THREE.Vector3(px / PX - (ROULETTE.w - 0.2) / 2, TOP + 0.006, py / PX - (ROULETTE.d - 0.2) / 2);
  }

  private cellCentre(b: RouletteBet): THREE.Vector3 {
    const [x, y, w, hh] = cellRect(b);
    return this.feltAt(x + w / 2, y + hh / 2);
  }

  /** Rebuilds the chip stacks on the felt from the current bets. */
  private paintChips(): void {
    let i = 0;
    const mm = new THREE.Matrix4();
    for (const bet of this.bets) {
      const at = this.cellCentre(bet);
      stackOf(bet.amount).forEach((d, k) => {
        if (i >= 200) return;
        mm.makeTranslation(at.x + (k % 2) * 0.004, at.y + 0.006 + k * 0.013, at.z);
        this.chipMesh.setMatrixAt(i, mm);
        this.chipMesh.setColorAt(i, this.chipColor.set(CHIP_COLORS[d]));
        i++;
      });
    }
    this.chipMesh.count = i;
    this.chipMesh.instanceMatrix.needsUpdate = true;
    if (this.chipMesh.instanceColor) this.chipMesh.instanceColor.needsUpdate = true;
  }

  // -------------------------------------------------------------------------

  /** Framings aim below the table so it sits in the top of the screen, clear of the docked panel. */
  framing() {
    return frame(ROULETTE.x + 0.3, 4.3, ROULETTE.z + 3.5, ROULETTE.x + 0.2, -0.85, ROULETTE.z - 0.1, 50);
  }

  private wheelFraming() {
    return frame(ROULETTE.x + WHEEL_X + 0.6, 2.9, ROULETTE.z + 2.0, ROULETTE.x + WHEEL_X, -0.55, ROULETTE.z - 0.3, 46);
  }

  actions(_p: PlayerState, act: (label: string, short: string, run: () => void) => SpaceAction): SpaceAction[] {
    if (!this.host.eco.stats) return [];
    return [{ ...SPOTS.roulette, ...act('Play roulette', 'Roulette', () => this.open()) }];
  }

  open(): void {
    if (this.panel?.open) return;
    const host = this.host;
    const compact = IS_TV || innerWidth < 720;
    const board = h('div', { class: `rl-board ${compact ? 'compact' : 'classic'}` });
    this.cellBtns.clear();
    const cell = (b: RouletteBet, label: string, cls: string) => {
      const btn = button(label, () => this.place(b), `rl-cell ${cls}`);
      btn.dataset.key = rouletteKey(b);
      btn.setAttribute('aria-label', b.type === 'number' ? `Number ${b.number}` : ROULETTE_LABELS[b.type]);
      this.cellBtns.set(rouletteKey(b), btn);
      return btn;
    };
    const nums = h('div', { class: 'rl-nums' });
    nums.appendChild(cell({ type: 'number', number: 0 }, '0', 'rl-zero green'));
    if (compact) {
      for (let n = 1; n <= 36; n++) nums.appendChild(cell({ type: 'number', number: n }, String(n), pocketColor(n)));
    } else {
      // Classic: three rows, 3 6 9 ... along the top, each cell pinned to its place.
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 12; c++) {
          const n = c * 3 + (3 - r);
          const btn = cell({ type: 'number', number: n }, String(n), pocketColor(n));
          btn.style.gridRow = String(r + 1);
          btn.style.gridColumn = String(c + 2);
          nums.appendChild(btn);
        }
      for (let r = 0; r < 3; r++) {
        const btn = cell({ type: `col${3 - r}` as RouletteType }, '2 to 1', 'rl-col');
        btn.style.gridRow = String(r + 1);
        btn.style.gridColumn = '14';
        nums.appendChild(btn);
      }
    }
    const outs = h('div', { class: 'rl-outs' });
    for (const t of ['dozen1', 'dozen2', 'dozen3'] as RouletteType[]) outs.appendChild(cell({ type: t }, ROULETTE_LABELS[t], 'rl-dozen'));
    if (compact) for (const t of ['col1', 'col2', 'col3'] as RouletteType[]) outs.appendChild(cell({ type: t }, ROULETTE_LABELS[t], 'rl-dozen'));
    const evens = h('div', { class: 'rl-evens' });
    for (const t of ['low', 'even', 'red', 'black', 'odd', 'high'] as RouletteType[]) evens.appendChild(cell({ type: t }, ROULETTE_LABELS[t], `rl-even ${t}`));
    board.append(nums, outs, evens);
    this.recentEl = h('div', { class: 'rl-recent', 'aria-label': 'Recent numbers' });
    const undo = button('Undo', () => this.undo(), 'tiny');
    const clear = button('Clear', () => this.clear(), 'tiny ghost');
    this.spinBtn = button('Spin', () => void this.spin(), 'primary');
    const panel = new TablePanel(host, {
      id: 'roulette',
      title: 'The Spinning Lily',
      game: 'roulette',
      chips: 'place',
      coach: 'Pick a chip, then choose where to place it.',
      help: ['Pick a chip at the top.', 'Press a number or a bet on the board to place it. Press again to add more.', 'Spin. Up to eight bets a spin.'],
      odds: () =>
        oddsTable(
          [
            ['A single number', '35 to 1', '1 in 37'],
            ['Column or dozen', '2 to 1', '12 in 37'],
            ['Red, black, odd, even', '1 to 1', '18 in 37'],
            ['1 to 18, 19 to 36', '1 to 1', '18 in 37'],
          ],
          `Zero is green and loses every bet but zero. Every bet returns about 97 in 100 over time. Table limit ${formatCredits(tableMax(host.eco.rank))}.`,
        ),
      alt: { label: 'Rebet', run: () => this.rebet() },
      initial: () => this.cellBtns.get('red') ?? null,
      onClose: () => {
        host.director.setSeat(null);
        if (!this.spinning) this.clear(true);
      },
      wide: !compact,
    });
    panel.body.append(board);
    panel.actions.prepend(this.recentEl);
    panel.actions.append(undo, clear, this.spinBtn);
    this.panel = panel;
    this.paintBoard();
    this.paintRecent();
    panel.status(this.history.length ? 'Place your bets.' : 'Place your bets. Red or black is a fine start.');
    panel.show();
    host.director.setSeat(this.framing());
    host.tried('roulette');
    this.staff.say('spinner', 'Place your bets!');
  }

  private total(): number {
    return this.bets.reduce((a, b) => a + b.amount, 0);
  }

  private place(b: RouletteBet): void {
    const p = this.panel;
    if (!p || this.spinning) return;
    const host = this.host;
    const amount = p.chip;
    const key = rouletteKey(b);
    const cur = this.bets.find((x) => rouletteKey(x) === key);
    if (!cur && this.bets.length >= ROULETTE_MAX_BETS) {
      sound.error();
      p.status(`Up to ${ROULETTE_MAX_BETS} bets a spin.`, 'bad');
      return;
    }
    if (this.total() + amount > tableMax(host.eco.rank)) {
      sound.error();
      p.status(`The table limit is ${formatCredits(tableMax(host.eco.rank))}.`, 'bad');
      return;
    }
    if (this.total() + amount > host.eco.shown) {
      sound.error();
      p.status('Not enough credits for that chip.', 'bad');
      return;
    }
    if (cur) cur.amount += amount;
    else this.bets.push({ ...b, amount });
    this.placed.push({ key, amount });
    sound.chip();
    this.paintChips();
    this.paintBoard();
    p.status(`Bet on ${this.describe(b)}. Total ${formatCredits(this.total())}.`);
  }

  private describe(b: RouletteBet): string {
    return b.type === 'number' ? String(b.number) : ROULETTE_LABELS[b.type].toLowerCase();
  }

  private undo(): void {
    if (this.spinning || !this.placed.length) return;
    const last = this.placed.pop()!;
    const bet = this.bets.find((x) => rouletteKey(x) === last.key);
    if (!bet) return;
    bet.amount -= last.amount;
    if (bet.amount <= 0) this.bets = this.bets.filter((x) => x !== bet);
    sound.click();
    this.paintChips();
    this.paintBoard();
  }

  private clear(silent = false): void {
    if (this.spinning) return;
    this.bets = [];
    this.placed = [];
    this.paintChips();
    this.paintBoard();
    if (!silent) sound.click();
  }

  private rebet(): void {
    if (this.spinning || !this.lastBets.length || !this.panel) return;
    const sum = this.lastBets.reduce((a, b) => a + b.amount, 0);
    if (sum > this.host.eco.shown || sum > tableMax(this.host.eco.rank)) {
      this.panel.status('Not enough credits to repeat those bets.', 'bad');
      return;
    }
    this.bets = this.lastBets.map((b) => ({ ...b }));
    this.placed = this.bets.map((b) => ({ key: rouletteKey(b), amount: b.amount }));
    sound.chip();
    this.paintChips();
    this.paintBoard();
    this.panel.status(`Same bets again. Total ${formatCredits(this.total())}.`);
  }

  private paintBoard(): void {
    for (const [key, btn] of this.cellBtns) {
      const bet = this.bets.find((x) => rouletteKey(x) === key);
      let badge = btn.querySelector('.rl-badge') as HTMLElement | null;
      if (bet) {
        if (!badge) {
          badge = h('span', { class: 'rl-badge' });
          btn.appendChild(badge);
        }
        badge.textContent = formatCredits(bet.amount);
      } else badge?.remove();
      btn.classList.toggle('has-bet', !!bet);
    }
    if (this.spinBtn) {
      this.spinBtn.disabled = this.spinning || !this.bets.length;
      this.spinBtn.textContent = this.bets.length ? `Spin (${formatCredits(this.total())})` : 'Spin';
    }
    this.panel?.setAlt(this.lastBets.length && !this.bets.length ? 'Rebet' : null);
  }

  private paintRecent(): void {
    if (!this.recentEl) return;
    this.recentEl.replaceChildren(h('small', {}, 'Recent'), ...this.history.slice(0, 8).map((n) => h('span', { class: `rl-pocket ${pocketColor(n)}` }, String(n))));
  }

  async spin(): Promise<void> {
    const host = this.host;
    const p = this.panel;
    if (this.spinning || !this.bets.length || !p) return;
    const staked = this.total();
    if (!host.canAfford(staked, 'roulette')) return;
    this.spinning = true;
    p.locked = true;
    p.paintChips();
    this.paintBoard();
    this.dolly.visible = false;
    host.eco.hold(staked);
    this.staff.say('spinner', 'No more bets!');
    this.staff.get('spinner')?.play('spin', 1.2);
    p.status('No more bets...');
    sound.lever();
    host.director.setSeat(this.wheelFraming());
    // The wheel spins up while the server decides.
    const started = host.clock();
    const res = await host.eco.play<{ pocket: number; win: number; perBet: number[]; bets: RouletteChip[] }>('roulette', { bets: this.bets });
    if (!res.ok) {
      host.eco.release(staked);
      this.spinning = false;
      p.locked = false;
      p.paintChips();
      this.paintBoard();
      host.director.setSeat(this.framing());
      p.status("Couldn't reach the boat. Your credits weren't touched.", 'bad');
      host.failed(res.error, res.code);
      return;
    }
    const d = res.data;
    this.lastPocket = d.pocket;
    await this.spinTo(d.pocket, Math.max(0, 0.6 - (host.clock() - started)));
    this.shownPocket = d.pocket;
    this.history.unshift(d.pocket);
    this.lastBets = d.bets.map((b) => ({ ...b }));
    host.director.setSeat(this.framing());
    // The dolly marks the number; losing chips are raked in, winners stay and grow.
    const winCell = this.cellCentre({ type: 'number', number: d.pocket });
    this.dollyAt = winCell.clone().add(new THREE.Vector3(0, 0.06, 0));
    this.dolly.position.copy(this.dollyAt).add(new THREE.Vector3(0, 0.6, 0));
    this.dolly.visible = true;
    sound.thunk();
    this.rake(d.bets.map((b) => rouletteReturn(b, d.pocket) > 0));
    host.eco.commit(d, staked);
    const col = pocketColor(d.pocket);
    const colWord = col === 'green' ? 'green' : col;
    for (const [key, btn] of this.cellBtns) {
      const won = d.bets.some((b, i) => rouletteKey(b) === key && d.perBet[i] > 0);
      btn.classList.toggle('won', won);
      btn.classList.toggle('hit', key === `number:${d.pocket}`);
    }
    if (d.win > 0) {
      host.cer.win({ paid: d.win, staked, at: this.group.localToWorld(winCell.clone()), dir: { x: 0, z: 1 }, label: `${d.pocket} ${colWord}`, quiet: true });
      p.status(d.win > staked ? `${d.pocket} ${colWord}: you win ${formatCredits(d.win)}!` : `${d.pocket} ${colWord}: ${formatCredits(d.win)} comes back.`, 'good');
      if (d.bets.some((b, i) => b.type === 'number' && d.perBet[i] > 0)) host.kit.banner(`${d.pocket}!`, { sub: `Straight up: ${formatCredits(d.win)}`, color: '#ffd24a', ms: 2200 });
      this.staff.get('spinner')?.play('applaud', 1.4);
    } else {
      p.status(`${d.pocket} ${colWord}. No win this time.`);
      sound.lose();
    }
    this.paintRecent();
    this.bets = [];
    this.placed = [];
    setTimeout(() => this.paintChips(), 1400 / host.timeScale());
    this.spinning = false;
    p.locked = false;
    p.paintChips();
    this.paintBoard();
  }

  /** Losing stacks slide to Spinner and vanish; winning stacks get their winnings added. */
  private rake(won: boolean[]): void {
    const spinnerLocal = new THREE.Vector3(0, TOP + 0.05, -ROULETTE.d / 2 + 0.15);
    let i = 0;
    this.bets.forEach((bet, k) => {
      const n = stackOf(bet.amount).length;
      for (let j = 0; j < n; j++, i++) {
        if (won[k]) continue;
        const m = new THREE.Matrix4();
        this.chipMesh.getMatrixAt(i, m);
        const from = new THREE.Vector3().setFromMatrixPosition(m);
        this.flying.push({ i, from, to: spinnerLocal.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, 0)), t: -j * 0.03, dur: 0.7, fade: true });
      }
    });
  }

  /** Spins until the ball settles in the pocket. */
  private spinTo(pocket: number, extra: number): Promise<void> {
    const k = WHEEL_ORDER.indexOf(pocket);
    const target = k * POCKET;
    const ts = this.host.timeScale();
    const dur = (4.4 + extra) / ts;
    let r1 = target;
    while (r1 > this.ballRel - TAU * 4) r1 -= TAU;
    return new Promise((resolve) => {
      this.spinState = { t: 0, dur, w0: this.wheelAngle, dw: TAU * 1.4, r0: this.ballRel, r1, resolve };
    });
  }

  update(dt: number): void {
    const sp = this.spinState;
    if (sp) {
      sp.t += dt;
      const k = Math.min(1, sp.t / sp.dur);
      const ease = 1 - (1 - k) ** 3;
      this.wheelAngle = sp.w0 + sp.dw * (1 - (1 - k) ** 2);
      this.ballRel = sp.r0 + (sp.r1 - sp.r0) * ease;
      // The ball runs high on the track, then drops and rattles over the frets into its pocket.
      const drop = Math.min(1, Math.max(0, (k - 0.6) / 0.32));
      const bounce = drop > 0 && drop < 1 ? Math.abs(Math.sin(drop * Math.PI * 4)) * 0.035 * (1 - drop) : 0;
      this.placeBall(TRACK_R - drop * (TRACK_R - REST_R), 0.055 * (1 - drop) + bounce);
      const tick = Math.floor((this.ballRel - this.wheelAngle) / POCKET);
      if (tick !== this.lastTick && drop > 0) sound.rattle();
      this.lastTick = tick;
      if (k >= 1) {
        this.spinState = null;
        sp.resolve();
      }
    } else {
      // The wheel keeps turning slowly, the ball riding in its pocket.
      this.wheelAngle += dt * 0.3;
      this.placeBall(REST_R, 0.0);
    }
    this.wheel.rotation.y = this.wheelAngle;
    // The dolly drops onto its number.
    if (this.dollyAt && this.dolly.visible) this.dolly.position.lerp(this.dollyAt, Math.min(1, dt * 10));
    // Raked chips.
    if (this.flying.length) {
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      this.flying = this.flying.filter((f) => {
        f.t += dt;
        const k = Math.max(0, Math.min(1, f.t / f.dur));
        p.copy(f.from).lerp(f.to, k * k * (3 - 2 * k));
        p.y += Math.sin(k * Math.PI) * 0.05;
        const s = f.fade ? 1 - Math.max(0, k - 0.7) / 0.3 : 1;
        m.compose(p, new THREE.Quaternion(), new THREE.Vector3(s, s, s));
        this.chipMesh.setMatrixAt(f.i, m);
        this.chipMesh.instanceMatrix.needsUpdate = true;
        return k < 1;
      });
    }
  }

  dispose(): void {
    this.panel?.dispose();
    for (const o of this.owned) o.dispose();
    this.chipMesh.dispose();
  }
}
