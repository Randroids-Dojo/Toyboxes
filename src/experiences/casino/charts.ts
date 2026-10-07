// Charts for the Captain's Logbook, drawn as SVG: your river (balance over
// plays), earned and spent by day, and by game. Each chart can be focused;
// Left and Right then step a tooltip from point to point, so a controller or
// a TV remote can read every value. Text uses the ivory and muted inks,
// never the series colours; series colours were checked on #13212b.

import { h } from '../../ui/ui';
import { formatCredits } from '../common';

export const INK = { text: '#f4e7cc', muted: '#a9b8bd', earned: '#c27c1a', spent: '#2b9cb0', zero: '#6b7680', line: '#f4e7cc' };

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export interface ChartPoint {
  /** What the tooltip says. */
  label: string;
  /** Where the tooltip points, in SVG units. */
  x: number;
  y: number;
}

/**
 * A chart wrapper: the SVG, a tooltip, focus with Left and Right stepping,
 * and hover with the mouse or a finger.
 */
export class Chart {
  readonly el: HTMLElement;
  private tip: HTMLElement;
  private cursor: SVGLineElement;
  private idx = -1;

  constructor(
    readonly svg: SVGSVGElement,
    private points: ChartPoint[],
    private w: number,
    private hgt: number,
    label: string,
  ) {
    this.tip = h('div', { class: 'gp-tip hidden', role: 'status' });
    this.cursor = el('line', { class: 'gp-cursor', x1: 0, x2: 0, y1: 0, y2: hgt, visibility: 'hidden' });
    svg.appendChild(this.cursor);
    this.el = h('div', { class: 'gp-chart', tabindex: '0', 'data-nav': 'chart', role: 'img', 'aria-label': label });
    this.el.append(svg as unknown as HTMLElement, this.tip);
    this.el.addEventListener('focus', () => this.show(this.idx < 0 ? this.points.length - 1 : this.idx));
    this.el.addEventListener('blur', () => this.hide());
    this.el.addEventListener('pointermove', (e) => {
      const r = this.el.getBoundingClientRect();
      const sx = ((e.clientX - r.left) / r.width) * this.w;
      let best = 0;
      let bd = Infinity;
      this.points.forEach((p, i) => {
        const d = Math.abs(p.x - sx);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      this.show(best);
    });
    this.el.addEventListener('pointerleave', () => {
      if (document.activeElement !== this.el) this.hide();
    });
  }

  /** Steps the tooltip; returns true when the chart had focus and used the key. */
  step(d: number): boolean {
    if (document.activeElement !== this.el || !this.points.length) return false;
    this.show(Math.max(0, Math.min(this.points.length - 1, (this.idx < 0 ? this.points.length - 1 : this.idx) + d)));
    return true;
  }

  get focused(): boolean {
    return document.activeElement === this.el;
  }

  private show(i: number): void {
    if (!this.points.length) return;
    this.idx = i;
    const p = this.points[i];
    this.tip.textContent = p.label;
    this.tip.classList.remove('hidden');
    this.tip.style.left = `${(p.x / this.w) * 100}%`;
    this.tip.style.top = `${(p.y / this.hgt) * 100}%`;
    this.tip.classList.toggle('left', p.x > this.w * 0.6);
    this.cursor.setAttribute('x1', String(p.x));
    this.cursor.setAttribute('x2', String(p.x));
    this.cursor.setAttribute('visibility', 'visible');
  }

  private hide(): void {
    this.tip.classList.add('hidden');
    this.cursor.setAttribute('visibility', 'hidden');
  }
}

function svgBox(w: number, hh: number): SVGSVGElement {
  const s = el('svg', { viewBox: `0 0 ${w} ${hh}`, class: 'gp-svg', preserveAspectRatio: 'none' });
  return s;
}

const dateFmt = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export interface RiverMarker {
  i: number;
  kind: 'refill' | 'big';
}

/** Your river: balance over plays, with the 1,000 start line and markers for refills and big wins. */
export function riverChart(history: [number, number][], start: number, markers: RiverMarker[]): Chart {
  const W = 600;
  const H = 200;
  const pad = { l: 46, r: 12, t: 14, b: 22 };
  const s = svgBox(W, H);
  const pts = history.length > 1 ? history : [...history, ...history];
  const vals = pts.map((p) => p[1]);
  // Fit the range to the river (and the start line) so small swings still show.
  const min = Math.min(start, ...vals);
  const max = Math.max(start, ...vals);
  const span = Math.max(100, max - min);
  const lo = Math.max(0, Math.floor((min - span * 0.18) / 10) * 10);
  const hi = Math.ceil((max + span * 0.18) / 10) * 10;
  const x = (i: number) => pad.l + (i / Math.max(1, pts.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - ((v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  // Light grid and axis labels in the muted ink.
  for (const v of [...new Set([lo, start, hi])]) {
    s.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'gp-grid' }));
    const t = el('text', { x: pad.l - 6, y: y(v) + 4, class: 'gp-axis', 'text-anchor': 'end' });
    t.textContent = formatCredits(v);
    s.appendChild(t);
  }
  const base = el('line', { x1: pad.l, x2: W - pad.r, y1: y(start), y2: y(start), class: 'gp-base' });
  s.appendChild(base);
  const startLbl = el('text', { x: W - pad.r, y: y(start) - 6, class: 'gp-axis', 'text-anchor': 'end' });
  startLbl.textContent = 'Start';
  s.appendChild(startLbl);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  s.appendChild(el('path', { d: `${d} L${x(pts.length - 1)},${H - pad.b} L${pad.l},${H - pad.b} Z`, class: 'gp-river-fill' }));
  s.appendChild(el('path', { d, class: 'gp-river' }));
  for (const m of markers) {
    if (m.i >= pts.length) continue;
    const cx = x(m.i);
    const cy = y(pts[m.i][1]);
    if (m.kind === 'refill') {
      s.appendChild(el('path', { d: `M${cx - 5},${cy + 8} L${cx},${cy - 10} L${cx + 5},${cy + 8} Z`, class: 'gp-mark-refill' }));
    } else {
      const star = Array.from({ length: 10 }, (_, k) => {
        const r = k % 2 ? 3.5 : 8;
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        return `${k ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
      }).join(' ');
      s.appendChild(el('path', { d: `${star} Z`, class: 'gp-mark-big' }));
    }
  }
  const points: ChartPoint[] = pts.map((p, i) => ({ x: x(i), y: y(p[1]), label: `${dateFmt(p[0])}, ${timeFmt(p[0])}: ${formatCredits(p[1])}` }));
  return new Chart(s, points, W, H, `Your balance over ${history.length} points, from ${formatCredits(vals[0])} to ${formatCredits(vals[vals.length - 1])}`);
}

export interface DayRow {
  d: string;
  earned: number;
  spent: number;
  plays: number;
}

/** Earned (up, amber) and spent (down, teal) for each play day. */
export function dayChart(days: DayRow[]): Chart {
  const W = 600;
  const H = 200;
  const pad = { l: 46, r: 12, t: 12, b: 24 };
  const s = svgBox(W, H);
  const max = Math.max(10, ...days.map((d) => Math.max(d.earned, d.spent)));
  const mid = pad.t + (H - pad.t - pad.b) / 2;
  const half = (H - pad.t - pad.b) / 2;
  const n = Math.max(1, days.length);
  const slot = (W - pad.l - pad.r) / n;
  const bw = Math.max(4, Math.min(28, slot - 2));
  const points: ChartPoint[] = [];
  for (const v of [max, 0, -max]) {
    const t = el('text', { x: pad.l - 6, y: mid - (v / max) * half + 4, class: 'gp-axis', 'text-anchor': 'end' });
    t.textContent = formatCredits(Math.abs(v));
    s.appendChild(t);
  }
  days.forEach((d, i) => {
    const cx = pad.l + slot * (i + 0.5);
    const up = (d.earned / max) * half;
    const dn = (d.spent / max) * half;
    // Rounded far ends, a 2 px gap either side of the zero line.
    if (up > 0.5) s.appendChild(el('rect', { x: cx - bw / 2, y: mid - 1 - up, width: bw, height: Math.max(1, up), rx: Math.min(4, bw / 2), class: 'gp-earned' }));
    if (dn > 0.5) s.appendChild(el('rect', { x: cx - bw / 2, y: mid + 1, width: bw, height: Math.max(1, dn), rx: Math.min(4, bw / 2), class: 'gp-spent' }));
    const date = new Date(`${d.d}T12:00:00`);
    if (n <= 14 || i % Math.ceil(n / 10) === 0) {
      const t = el('text', { x: cx, y: H - 6, class: 'gp-axis', 'text-anchor': 'middle' });
      t.textContent = String(date.getDate());
      s.appendChild(t);
    }
    const net = d.earned - d.spent;
    points.push({ x: cx, y: mid - up - 6, label: `${dateFmt(date.getTime())}: earned ${formatCredits(d.earned)}, spent ${formatCredits(d.spent)}, net ${net >= 0 ? '+' : '-'}${formatCredits(Math.abs(net))}, ${d.plays} plays` });
  });
  s.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: mid, y2: mid, class: 'gp-zero' }));
  return new Chart(s, points, W, H, `Earned and spent on your last ${days.length} play days`);
}

export interface GameRow {
  name: string;
  spent: number;
  earned: number;
  plays: number;
  /** About how many credits in 100 the game keeps over time. */
  edge: number;
}

/** Spent and earned per game on one credits axis, with a plain line of text each. */
export function gameBars(rows: GameRow[]): HTMLElement {
  const max = Math.max(10, ...rows.map((r) => Math.max(r.spent, r.earned)));
  const list = h('div', { class: 'gp-games' });
  for (const r of rows) {
    const ret = r.spent ? Math.round((r.earned / r.spent) * 100) : 0;
    const bar = (v: number, cls: string, label: string) => h('div', { class: 'gp-gbar-row' }, h('span', { class: 'gp-gbar-k' }, label), h('div', { class: 'gp-gbar-track' }, h('i', { class: cls, style: `width:${Math.max(0.5, (v / max) * 100)}%` })), h('b', {}, formatCredits(v)));
    list.appendChild(
      h(
        'div',
        { class: 'gp-game', tabindex: '0', 'data-nav': 'game' },
        h('div', { class: 'gp-game-head' }, h('b', {}, r.name), h('small', {}, `${r.plays} plays`)),
        bar(r.spent, 'gp-spent-bar', 'Spent'),
        bar(r.earned, 'gp-earned-bar', 'Earned'),
        h('p', {}, r.spent ? `Your return ${ret}%. ${r.edge > 0 ? `The boat keeps about ${r.edge} in 100 over time.` : ''}` : 'Not played yet.'),
      ),
    );
  }
  return list;
}

/** A plain table of rows, for the "Show numbers" view of any chart. */
export function numbersTable(head: string[], rows: (string | number)[][]): HTMLElement {
  return h('table', { class: 'gp-odds gp-numbers' }, h('thead', {}, h('tr', {}, ...head.map((x) => h('th', {}, x)))), h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, typeof c === 'number' ? formatCredits(c) : c))))));
}

export function legend(items: [string, string][]): HTMLElement {
  return h('div', { class: 'gp-legend' }, ...items.map(([cls, label]) => h('span', {}, h('i', { class: cls }), label)));
}
