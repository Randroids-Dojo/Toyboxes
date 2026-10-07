// The beat bar: a lane across the lower third where note gems slide from
// right to left into a glowing gate (the couch-readable Taiko format). Gem
// shape shows the kind (round tap, linked double, tailed hold, big star pose),
// colour shows the subdivision (quarter pink, eighth cyan, sixteenth gold).
// Spotlight bars shimmer with "Free!". Drawn on a canvas each frame.

import type { Chart, Note } from '../../shared/neon/charts';
import { beatToSec, secToBeat } from '../../shared/neon/songs';
import { HEX } from './util';

const SUB_COLOR: Record<Note['sub'], string> = { 4: HEX.pink, 8: HEX.cyan, 16: HEX.gold, 3: HEX.gold };

export interface BarState {
  /** Song seconds being drawn. */
  now: number;
  /** Notes and their judged marks (index: '' unjudged). */
  marks: (i: number) => string;
  holding: Note | null;
  glow: boolean;
  /** Fraction of the glow meter. */
  meter: number;
  /** Spotlight slots and their marks. */
  slot: (i: number) => string;
}

interface Flash {
  text: string;
  color: string;
  age: number;
  err: number;
}

export class BeatBar {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private flash: Flash | null = null;
  private gatePulse = 0;
  private shatter: { x: number; age: number; color: string }[] = [];
  /** Seconds of notes shown ahead of the gate. */
  lead = 2.2;
  visible = true;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'nova-bar';
    this.canvas = document.createElement('canvas');
    this.el.appendChild(this.canvas);
    parent.appendChild(this.el);
    this.g = this.canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    const r = this.el.getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  show(on: boolean): void {
    this.el.classList.toggle('on', on);
  }

  /** A judgement at the gate: "Perfect" with an early or late tick. */
  judge(text: string, color: string, err: number): void {
    this.flash = { text, color, age: 0, err };
    this.gatePulse = 1;
  }

  miss(): void {
    this.flash = { text: 'Miss', color: '#9a90b8', age: 0, err: 0 };
    this.shatter.push({ x: 0, age: 0, color: '#9a90b8' });
  }

  draw(dt: number, chart: Chart, s: BarState): void {
    if (!this.el.classList.contains('on')) return;
    const r = this.el.getBoundingClientRect();
    if (Math.round(r.width) !== this.w || Math.round(r.height) !== this.h) this.resize();
    const g = this.g;
    const W = this.w;
    const H = this.h;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const laneH = Math.min(H * 0.62, 84);
    const cy = H * 0.5;
    const gateX = Math.max(64, W * 0.16);
    const span = W - gateX - 16;
    const px = (t: number) => gateX + ((t - s.now) / this.lead) * span;
    const rad = laneH * 0.3;

    // Lane.
    g.fillStyle = s.glow ? 'rgba(40,16,70,0.86)' : 'rgba(14,8,40,0.82)';
    roundRect(g, 8, cy - laneH / 2, W - 16, laneH, laneH / 2);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = s.glow ? rainbow(s.now) : HEX.violet;
    g.stroke();

    // Beat lines.
    const firstBeat = Math.max(0, Math.ceil(secToBeat(chart.song, Math.max(0, s.now - 0.4))));
    for (let b = firstBeat; beatToSec(chart.song, b) < s.now + this.lead; b++) {
      const x = px(beatToSec(chart.song, b));
      if (x < gateX - 30) continue;
      g.strokeStyle = b % 4 === 0 ? 'rgba(180,156,255,0.45)' : 'rgba(180,156,255,0.16)';
      g.lineWidth = b % 4 === 0 ? 2 : 1;
      g.beginPath();
      g.moveTo(x, cy - laneH / 2 + 6);
      g.lineTo(x, cy + laneH / 2 - 6);
      g.stroke();
    }

    // Spotlight bars: a shimmering stretch of lane.
    for (const bar of chart.spotBars) {
      const t0 = chart.slots.find((x) => Math.abs(x.beat - bar * 4) < 1e-6)?.t;
      if (t0 === undefined) continue;
      const t1 = beatToSec(chart.song, bar * 4 + 4);
      const x0 = Math.max(gateX - 20, px(t0));
      const x1 = Math.min(W - 12, px(t1));
      if (x1 <= x0) continue;
      const grad = g.createLinearGradient(x0, 0, x1, 0);
      const ph = (s.now * 1.3) % 1;
      grad.addColorStop(0, 'rgba(255,201,60,0.08)');
      grad.addColorStop(ph, 'rgba(255,201,60,0.32)');
      grad.addColorStop(1, 'rgba(255,61,174,0.12)');
      g.fillStyle = grad;
      g.fillRect(x0, cy - laneH / 2 + 4, x1 - x0, laneH - 8);
      g.fillStyle = 'rgba(255,244,254,0.9)';
      g.font = `${Math.round(laneH * 0.32)}px "Lilita One", system-ui`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (x1 - x0 > 60) g.fillText('Free!', (x0 + x1) / 2, cy);
    }
    // Spotlight slot ticks: little dots on the eighth grid.
    for (let i = 0; i < chart.slots.length; i++) {
      const sl = chart.slots[i];
      const x = px(sl.t);
      if (x < gateX - 20 || x > W) continue;
      const m = s.slot(i);
      g.fillStyle = m === 'F' ? HEX.lime : m === 'S' ? '#7d6f99' : 'rgba(255,244,254,0.55)';
      g.beginPath();
      g.arc(x, cy + laneH * 0.3, m === 'F' ? 5 : 3, 0, Math.PI * 2);
      g.fill();
    }

    // Gate.
    this.gatePulse = Math.max(0, this.gatePulse - dt * 5);
    const beatPh = ((secToBeat(chart.song, Math.max(0, s.now)) % 1) + 1) % 1;
    const gr = rad * 1.25 + (1 - beatPh) * 4 + this.gatePulse * 6;
    g.lineWidth = 4;
    g.strokeStyle = this.flash && this.flash.age < 0.15 ? this.flash.color : '#fff4fe';
    g.shadowColor = HEX.violet;
    g.shadowBlur = 14 + this.gatePulse * 16;
    g.beginPath();
    g.arc(gateX, cy, gr, 0, Math.PI * 2);
    g.stroke();
    g.shadowBlur = 0;
    // Glow meter around the gate.
    if (s.meter > 0 || s.glow) {
      g.lineWidth = 5;
      g.strokeStyle = s.glow ? rainbow(s.now * 2) : HEX.lime;
      g.beginPath();
      g.arc(gateX, cy, gr + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (s.glow ? 1 : s.meter));
      g.stroke();
    }

    // Notes, far ones first so near ones sit on top.
    const notes = chart.notes;
    let lo = 0;
    while (lo < notes.length && notes[lo].endT < s.now - 0.4) lo++;
    let hi = lo;
    while (hi < notes.length && notes[hi].t < s.now + this.lead) hi++;
    for (let i = hi - 1; i >= lo; i--) {
      const n = notes[i];
      const mark = s.marks(i);
      const head = mark[0] ?? '';
      const holdingThis = s.holding?.i === n.i;
      if (head && head !== 'M' && n.kind !== 'hold') continue;
      if (n.kind === 'hold' && mark.length >= 2) continue;
      const color = SUB_COLOR[n.sub];
      const x = holdingThis ? gateX : px(n.t);
      if (n.kind === 'hold') {
        const xe = px(n.endT);
        g.strokeStyle = color;
        g.globalAlpha = head === 'M' ? 0.3 : holdingThis ? 1 : 0.75;
        g.lineCap = 'round';
        g.lineWidth = rad * (holdingThis ? 1.1 : 0.9);
        g.beginPath();
        g.moveTo(x, cy);
        g.lineTo(Math.max(x, xe), cy);
        g.stroke();
        g.globalAlpha = 1;
        if (holdingThis) {
          g.strokeStyle = '#ffffff';
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(x, cy);
          g.lineTo(Math.max(x, xe), cy);
          g.stroke();
        }
      }
      if (n.link && i > 0) {
        const xp = px(notes[i - 1].t);
        g.strokeStyle = color;
        g.lineWidth = rad * 0.5;
        g.beginPath();
        g.moveTo(xp, cy);
        g.lineTo(x, cy);
        g.stroke();
      }
      if (head === 'M') {
        g.globalAlpha = 0.35;
        drawGem(g, n, x, cy, rad, '#8f86a8');
        g.globalAlpha = 1;
      } else drawGem(g, n, x, cy, rad, color);
    }

    // Judgement flash above the gate, with an early or late tick under it.
    if (this.flash) {
      const f = this.flash;
      f.age += dt;
      if (f.age > 0.6) this.flash = null;
      else {
        const a = Math.min(1, (0.6 - f.age) * 4);
        g.globalAlpha = a;
        g.fillStyle = f.color;
        g.font = `${Math.round(laneH * 0.36)}px "Lilita One", system-ui`;
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        g.shadowColor = f.color;
        g.shadowBlur = 10;
        g.fillText(f.text, gateX, cy - laneH / 2 - 2 - f.age * 12);
        g.shadowBlur = 0;
        if (f.text !== 'Miss' && f.text !== 'Perfect' && Math.abs(f.err) > 0.02) {
          g.font = `600 ${Math.round(laneH * 0.2)}px system-ui`;
          g.textBaseline = 'top';
          g.fillStyle = '#fff4fe';
          g.fillText(f.err < 0 ? 'early' : 'late', gateX, cy + laneH / 2 + 3);
        }
        g.globalAlpha = 1;
      }
    }
    // Missed gems shatter grey at the gate.
    for (const sh of this.shatter) {
      sh.age += dt;
      g.fillStyle = sh.color;
      g.globalAlpha = Math.max(0, 1 - sh.age * 3);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.fillRect(gateX + Math.cos(a) * sh.age * 120, cy + Math.sin(a) * sh.age * 90, 4, 4);
      }
      g.globalAlpha = 1;
    }
    this.shatter = this.shatter.filter((x) => x.age < 0.35);
  }

  dispose(): void {
    this.el.remove();
  }
}

function drawGem(g: CanvasRenderingContext2D, n: Note, x: number, y: number, r: number, color: string): void {
  g.shadowColor = color;
  g.shadowBlur = 12;
  g.fillStyle = color;
  if (n.kind === 'pose') {
    g.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r * 1.55 : r * 0.7;
      if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = '#ffc93c';
    g.fill();
  } else {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.arc(x - r * 0.25, y - r * 0.28, r * 0.32, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(x, y, n.kind === 'pose' ? r * 0.75 : r, 0, Math.PI * 2);
  g.stroke();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function rainbow(t: number): string {
  return `hsl(${Math.round((t * 120) % 360)}, 100%, 65%)`;
}
