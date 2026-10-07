// The race HUD: place, lap and time, lap splits, the minimap with every
// driver's face, the item slot (with its roulette), the order strip, the
// wrong-way warning and the incoming-plane arrow. DOM over the canvas, laid
// out for wide screens and a 390 px phone alike.

import type { ItemId } from '../../shared/kart/rules';
import { ordinal } from '../common';
import { h } from '../../ui/ui';
import { EDGE, type Circuit } from './circuit';
import type { Racer } from './racer';

export const ITEM_NAMES: Record<ItemId, string> = {
  spring: 'Zoom spring',
  triple: 'Triple spring',
  ball: 'Bouncy ball',
  marbles: 'Marble bag',
  bubble: 'Soap bubble',
  plane: 'Paper plane',
};

/** Item icons, painted on a canvas so they look the same everywhere. */
export function drawItem(g: CanvasRenderingContext2D, id: ItemId | null, s: number, count = 1): void {
  g.clearRect(0, 0, s, s);
  if (!id) return;
  const c = s / 2;
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const outline = (w = s * 0.05) => {
    g.lineWidth = w;
    g.strokeStyle = '#1d1830';
    g.stroke();
  };
  if (id === 'spring' || id === 'triple') {
    const n = id === 'triple' ? Math.max(1, count) : 1;
    for (let k = 0; k < n; k++) {
      const ox = n > 1 ? (k - (n - 1) / 2) * s * 0.22 : 0;
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const y = s * 0.8 - t * s * 0.6;
        const x = c + ox + Math.sin(t * Math.PI * 8) * s * (n > 1 ? 0.08 : 0.16);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.lineWidth = s * 0.09;
      g.strokeStyle = '#1d1830';
      g.stroke();
      g.lineWidth = s * 0.05;
      g.strokeStyle = '#ffd24a';
      g.stroke();
    }
  } else if (id === 'ball') {
    const cols = ['#e8574a', '#fffaf0', '#4aa3df', '#fffaf0', '#ffd24a', '#fffaf0'];
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(c, c);
      g.arc(c, c, s * 0.36, (i / 6) * Math.PI * 2, ((i + 1) / 6) * Math.PI * 2);
      g.closePath();
      g.fillStyle = cols[i];
      g.fill();
    }
    g.beginPath();
    g.arc(c, c, s * 0.36, 0, Math.PI * 2);
    outline();
  } else if (id === 'marbles') {
    g.beginPath();
    g.ellipse(c, c + s * 0.08, s * 0.3, s * 0.26, 0, 0, Math.PI * 2);
    g.fillStyle = '#8a6bd1';
    g.fill();
    outline();
    g.beginPath();
    g.moveTo(c - s * 0.16, c - s * 0.16);
    g.lineTo(c + s * 0.16, c - s * 0.16);
    g.lineWidth = s * 0.06;
    g.strokeStyle = '#ffd24a';
    g.stroke();
    for (const [x, y, col] of [
      [-0.12, 0.05, '#7ef0ff'],
      [0.1, 0.12, '#ff8fd1'],
      [-0.02, 0.2, '#b6ff8a'],
    ] as [number, number, string][]) {
      g.beginPath();
      g.arc(c + x * s, c + y * s, s * 0.07, 0, Math.PI * 2);
      g.fillStyle = col;
      g.fill();
    }
  } else if (id === 'bubble') {
    const grad = g.createRadialGradient(c - s * 0.1, c - s * 0.12, s * 0.02, c, c, s * 0.38);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.5, 'rgba(126,240,255,0.45)');
    grad.addColorStop(1, 'rgba(255,143,209,0.7)');
    g.beginPath();
    g.arc(c, c, s * 0.36, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
    outline(s * 0.035);
  } else {
    // Paper plane.
    g.beginPath();
    g.moveTo(s * 0.12, s * 0.55);
    g.lineTo(s * 0.88, s * 0.2);
    g.lineTo(s * 0.5, s * 0.82);
    g.lineTo(s * 0.44, s * 0.6);
    g.closePath();
    g.fillStyle = '#fffaf0';
    g.fill();
    outline();
    g.beginPath();
    g.moveTo(s * 0.44, s * 0.6);
    g.lineTo(s * 0.88, s * 0.2);
    g.lineWidth = s * 0.035;
    g.stroke();
  }
  g.restore();
}

export class RaceHud {
  readonly root: HTMLElement;
  private pos: HTMLElement;
  private posOf: HTMLElement;
  private lap: HTMLElement;
  private time: HTMLElement;
  private sub: HTMLElement;
  private warn: HTMLElement;
  private plane: HTMLElement;
  private item: HTMLElement;
  private itemCanvas: HTMLCanvasElement;
  private itemLabel: HTMLElement;
  private strip: HTMLElement;
  private map: HTMLCanvasElement;
  private mapBg: HTMLCanvasElement;
  private xf = { cx: 0, cz: 0, k: 1, size: 160, cos: 1, sin: 0 };
  private chips = new Map<string, HTMLElement>();
  private shownItem: string = '';
  private rollT = 0;
  private lastPlace = 0;
  private flashUntil = 0;

  constructor(parent: HTMLElement) {
    this.pos = h('b', { class: 'kz-pos-n' }, '');
    this.posOf = h('small', {}, '');
    this.lap = h('div', { class: 'kz-lap' }, '');
    this.time = h('div', { class: 'kz-time' }, '');
    this.sub = h('div', { class: 'kz-sub' }, '');
    this.warn = h('div', { class: 'kz-warn hidden' }, h('span', { class: 'kz-warn-arrow' }, '↶'), 'Wrong way');
    this.plane = h('div', { class: 'kz-plane hidden' }, '✈');
    this.itemCanvas = h('canvas', { width: 128, height: 128, class: 'kz-item-art' });
    this.itemLabel = h('div', { class: 'kz-item-label' }, '');
    this.item = h('div', { class: 'kz-item empty' }, this.itemCanvas, this.itemLabel);
    this.strip = h('div', { class: 'kz-strip' });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.map = h('canvas', { class: 'kz-map', width: 160 * dpr, height: 160 * dpr, 'aria-hidden': 'true' });
    this.mapBg = document.createElement('canvas');
    this.root = h(
      'div',
      { class: 'kz-hud hidden' },
      h('div', { class: 'kz-tl' }, h('div', { class: 'kz-pos' }, this.pos, this.posOf), h('div', { class: 'kz-clock' }, this.lap, this.time, this.sub)),
      this.item,
      this.map,
      this.strip,
      this.warn,
      this.plane,
    );
    parent.appendChild(this.root);
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    this.root.parentElement?.classList.toggle('kz-on', on);
  }

  /** Race (place shown) or a solo mode (no place, no strip). */
  mode(kind: 'race' | 'solo' | 'free'): void {
    this.root.dataset.mode = kind;
  }

  setCircuit(c: Circuit, size = 160): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = size * dpr;
    this.map.width = this.map.height = px;
    this.mapBg.width = this.mapBg.height = px;
    // Rotate the map so the start straight runs left to right.
    const f = c.frame(0);
    const ang = -Math.atan2(f.tz, f.tx);
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < c.path.n; i++) {
      const x = c.path.x[i] * cos - c.path.z[i] * sin;
      const z = c.path.x[i] * sin + c.path.z[i] * cos;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const span = Math.max(maxX - minX, maxZ - minZ) + EDGE * 4;
    this.xf = { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, k: px / span, size: px, cos, sin };
    const g = this.mapBg.getContext('2d')!;
    g.clearRect(0, 0, px, px);
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i <= c.path.n; i++) {
      const [x, y] = this.toMap(c.path.x[i % c.path.n], c.path.z[i % c.path.n]);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokeStyle = 'rgba(29,24,48,0.85)';
    g.lineWidth = Math.max(6, EDGE * 2 * this.xf.k + 5);
    g.stroke();
    g.strokeStyle = '#efe8ff';
    g.lineWidth = Math.max(3, EDGE * 2 * this.xf.k * 0.55);
    g.stroke();
    const a = c.at(0, -EDGE);
    const b = c.at(0, EDGE);
    const [ax, ay] = this.toMap(a.x, a.z);
    const [bx, by] = this.toMap(b.x, b.z);
    g.strokeStyle = '#1d1830';
    g.lineWidth = 3 * dpr;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
  }

  private toMap(x: number, z: number): [number, number] {
    const { cx, cz, k, size, cos, sin } = this.xf;
    const rx = x * cos - z * sin;
    const rz = x * sin + z * cos;
    return [size / 2 + (rx - cx) * k, size / 2 + (rz - cz) * k];
  }

  /** Every frame: dots for every kart, yours biggest; ghost as a hollow ring. */
  paintMap(racers: Racer[], ghost: { x: number; z: number } | null): void {
    const g = this.map.getContext('2d')!;
    const { size } = this.xf;
    g.clearRect(0, 0, size, size);
    g.drawImage(this.mapBg, 0, 0);
    const r0 = size / 22;
    if (ghost) {
      const [x, y] = this.toMap(ghost.x, ghost.z);
      g.beginPath();
      g.arc(x, y, r0, 0, Math.PI * 2);
      g.lineWidth = r0 * 0.5;
      g.strokeStyle = 'rgba(126,240,255,0.95)';
      g.stroke();
    }
    const order = [...racers].sort((a, b) => (a.you ? 1 : 0) - (b.you ? 1 : 0));
    for (const r of order) {
      if (!r.kart.root.visible) continue;
      const [x, y] = this.toMap(r.kart.pos.x, r.kart.pos.z);
      const rr = r.you ? r0 * 1.45 : r0;
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.fillStyle = r.color;
      g.fill();
      g.lineWidth = r.you ? r0 * 0.5 : r0 * 0.35;
      g.strokeStyle = r.you ? '#fffaf0' : '#1d1830';
      g.stroke();
      if (!r.you) {
        g.fillStyle = '#1d1830';
        g.font = `bold ${rr * 1.2}px system-ui`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(r.name[0], x, y + rr * 0.05);
      }
    }
  }

  setPlace(place: number, of: number): void {
    const t = ordinal(place);
    const n = t.replace(/\D/g, '');
    const suf = t.replace(/\d/g, '');
    if (this.pos.textContent !== n) {
      this.pos.textContent = n;
      if (this.lastPlace && place !== this.lastPlace) {
        this.pos.parentElement!.classList.remove('up', 'down');
        void this.pos.offsetWidth;
        this.pos.parentElement!.classList.add(place < this.lastPlace ? 'up' : 'down');
      }
    }
    this.lastPlace = place;
    const sub = `${suf} / ${of}`;
    if (this.posOf.textContent !== sub) this.posOf.textContent = sub;
  }

  setLap(text: string): void {
    if (this.lap.textContent !== text) this.lap.textContent = text;
  }

  setTime(text: string, flash = false): void {
    if (this.time.textContent !== text) this.time.textContent = text;
    this.time.classList.toggle('flash', flash);
  }

  setSub(text: string, tone: 'good' | 'bad' | 'gold' | null = null): void {
    if (this.sub.textContent !== text) this.sub.textContent = text;
    if (tone) this.sub.dataset.tone = tone;
    else delete this.sub.dataset.tone;
  }

  wrongWay(on: boolean): void {
    this.warn.classList.toggle('hidden', !on);
  }

  incoming(on: boolean): void {
    this.plane.classList.toggle('hidden', !on);
    this.root.classList.toggle('kz-danger', on);
  }

  /** The item slot. `rolling` spins the roulette. */
  setItem(id: ItemId | null, count: number, rolling: boolean, dt: number, label: string): void {
    const g = this.itemCanvas.getContext('2d')!;
    if (rolling) {
      this.rollT += dt;
      const ids: ItemId[] = ['spring', 'ball', 'marbles', 'bubble', 'plane', 'triple'];
      const shown = ids[Math.floor(this.rollT * 14) % ids.length];
      if (this.shownItem !== `roll-${shown}`) {
        drawItem(g, shown, 128);
        this.shownItem = `roll-${shown}`;
      }
      this.item.classList.add('rolling');
      this.item.classList.remove('empty');
      this.itemLabel.textContent = '';
      return;
    }
    this.item.classList.remove('rolling');
    const key = `${id}-${count}`;
    if (this.shownItem !== key) {
      const had = this.shownItem.startsWith('roll');
      this.shownItem = key;
      drawItem(g, id, 128, count);
      this.item.classList.toggle('empty', !id);
      if (had && id) {
        this.item.classList.remove('land');
        void this.item.offsetWidth;
        this.item.classList.add('land');
      }
    }
    if (this.itemLabel.textContent !== label) this.itemLabel.textContent = label;
  }

  /** The order strip: one chip per kart, in race order. */
  setOrder(order: Racer[], rival: string | null): void {
    const want = order.map((r) => r.id).join(',');
    if (this.strip.dataset.order === want) return;
    this.strip.dataset.order = want;
    // FLIP: remember where chips were, move them, then animate from there.
    const before = new Map<string, number>();
    for (const [id, el] of this.chips) before.set(id, el.getBoundingClientRect().top);
    for (const r of order) {
      let el = this.chips.get(r.id);
      if (!el) {
        el = h('div', { class: `kz-chip${r.you ? ' you' : ''}` }, h('i', { style: `background:${r.color}` }, r.you ? '★' : r.name[0]), h('span', {}, r.you ? 'You' : r.name));
        this.chips.set(r.id, el);
      }
      el.classList.toggle('rival', r.id === rival);
      this.strip.appendChild(el);
    }
    for (const [id, el] of this.chips) {
      if (!order.some((r) => r.id === id)) {
        el.remove();
        this.chips.delete(id);
        continue;
      }
      const was = before.get(id);
      if (was === undefined) continue;
      const dy = was - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = '';
        el.style.transform = '';
      });
    }
  }

  /** A short big word near the centre: "Boost!", "Rocket start!". */
  flash(): void {
    this.flashUntil = performance.now() + 900;
  }

  get flashing(): boolean {
    return performance.now() < this.flashUntil;
  }

  dispose(): void {
    this.root.parentElement?.classList.remove('kz-on');
    this.root.remove();
  }
}
