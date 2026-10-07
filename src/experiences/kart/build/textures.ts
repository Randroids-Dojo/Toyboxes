// Canvas textures for the kart world: road surfaces, curbs, floors, prints
// and the letter-block atlas. Painted once per circuit and freed with it.

import * as THREE from 'three';
import { DISPLAY_FONT, roundRect } from '../../../world/kit';

export type Painter = (g: CanvasRenderingContext2D, w: number, h: number) => void;

function rand(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export class TexCache {
  private all: THREE.Texture[] = [];
  private named = new Map<string, THREE.CanvasTexture>();

  make(w: number, h: number, draw: Painter, opts: { repeat?: [number, number]; srgb?: boolean; mips?: boolean } = {}): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!, w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    this.all.push(t);
    return t;
  }

  /** One texture per name for this circuit. */
  get(name: string, w: number, h: number, draw: Painter, opts: { repeat?: [number, number] } = {}): THREE.CanvasTexture {
    let t = this.named.get(name);
    if (!t) {
      t = this.make(w, h, draw, opts);
      this.named.set(name, t);
    }
    return t;
  }

  dispose(): void {
    for (const t of this.all) t.dispose();
    this.all = [];
    this.named.clear();
  }
}

/** Speckled surface with optional edge lines (road u runs 0..1 across, v along). */
export function roadPainter(base: string, speck: [string, string], edge: string | null, seed = 11): Painter {
  return (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const r = rand(seed);
    for (let i = 0; i < (w * h) / 18; i++) {
      g.fillStyle = i % 2 ? speck[0] : speck[1];
      g.fillRect(r() * w, r() * h, 2, 2);
    }
    // Faint tyre wear down the racing lanes.
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.3, 'rgba(0,0,0,0.06)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    if (edge) {
      g.fillStyle = edge;
      g.fillRect(w * 0.025, 0, w * 0.02, h);
      g.fillRect(w * 0.955, 0, w * 0.02, h);
      // A dashed centre line.
      g.globalAlpha = 0.55;
      g.fillRect(w * 0.495, 0, w * 0.01, h * 0.45);
      g.globalAlpha = 1;
    }
  };
}

export function stripePainter(a: string, b: string, lines = 2): Painter {
  return (g, w, h) => {
    for (let i = 0; i < lines; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect(0, (i * h) / lines, w, h / lines);
    }
    // A soft sheen on each stripe.
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < lines; i++) g.fillRect(0, (i * h) / lines + 2, w, h / lines / 5);
  };
}

export function checksPainter(a: string, b: string, nx: number, ny: number): Painter {
  return (g, w, h) => {
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        g.fillStyle = (x + y) % 2 ? a : b;
        g.fillRect((x * w) / nx, (y * h) / ny, w / nx + 1, h / ny + 1);
      }
  };
}

export function chevronPainter(a: string, b: string): Painter {
  return (g, w, h) => {
    g.fillStyle = a;
    g.fillRect(0, 0, w, h);
    g.fillStyle = b;
    for (const y0 of [0, h / 2]) {
      g.beginPath();
      g.moveTo(w * 0.08, y0 + h * 0.32);
      g.lineTo(w / 2, y0 + h * 0.06);
      g.lineTo(w * 0.92, y0 + h * 0.32);
      g.lineTo(w * 0.92, y0 + h * 0.46);
      g.lineTo(w / 2, y0 + h * 0.2);
      g.lineTo(w * 0.08, y0 + h * 0.46);
      g.closePath();
      g.fill();
    }
  };
}

/** Floorboards running along v. */
export function boardsPainter(a: string, b: string, gap: string): Painter {
  return (g, w, h) => {
    const r = rand(5);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x = (i * w) / n;
      g.fillStyle = i % 2 ? a : b;
      g.fillRect(x, 0, w / n, h);
      // Grain.
      for (let k = 0; k < 40; k++) {
        g.strokeStyle = `rgba(80,40,10,${0.04 + r() * 0.06})`;
        g.lineWidth = 1 + r() * 2;
        const gx = x + r() * (w / n);
        g.beginPath();
        g.moveTo(gx, 0);
        g.bezierCurveTo(gx + (r() - 0.5) * 10, h * 0.3, gx + (r() - 0.5) * 10, h * 0.7, gx, h);
        g.stroke();
      }
      g.fillStyle = gap;
      g.fillRect(x, 0, 3, h);
      // Board ends, staggered.
      const end = ((i * 0.37) % 1) * h;
      g.fillRect(x, end, w / n, 3);
    }
  };
}

export function grassPainter(a: string, b: string): Painter {
  return (g, w, h) => {
    g.fillStyle = a;
    g.fillRect(0, 0, w, h);
    const r = rand(7);
    for (let i = 0; i < (w * h) / 30; i++) {
      g.fillStyle = r() < 0.5 ? b : 'rgba(255,255,255,0.06)';
      g.fillRect(r() * w, r() * h, 2, 5);
    }
  };
}

export function sandPainter(a: string, b: string): Painter {
  return (g, w, h) => {
    g.fillStyle = a;
    g.fillRect(0, 0, w, h);
    const r = rand(9);
    for (let i = 0; i < (w * h) / 10; i++) {
      g.fillStyle = r() < 0.5 ? b : 'rgba(255,255,255,0.18)';
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
    // Wind ripples.
    g.strokeStyle = 'rgba(160,110,60,0.12)';
    g.lineWidth = 3;
    for (let y = 0; y < h; y += 22) {
      g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 30 + y) * 5);
      g.stroke();
    }
  };
}

export function carpetPainter(a: string, b: string): Painter {
  return (g, w, h) => {
    g.fillStyle = a;
    g.fillRect(0, 0, w, h);
    const r = rand(13);
    for (let i = 0; i < (w * h) / 6; i++) {
      g.fillStyle = r() < 0.5 ? b : 'rgba(255,255,255,0.05)';
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
  };
}

export function ginghamPainter(a: string, bg: string): Painter {
  return (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.55;
    g.fillStyle = a;
    const n = 4;
    for (let i = 0; i < n; i++) {
      g.fillRect((i * w) / n, 0, w / n / 2, h);
      g.fillRect(0, (i * h) / n, w, h / n / 2);
    }
    g.globalAlpha = 1;
  };
}

export function planksPainter(a: string, b: string, gap: string): Painter {
  return (g, w, h) => {
    const n = 6;
    const r = rand(17);
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? a : b;
      g.fillRect(0, (i * h) / n, w, h / n);
      for (let k = 0; k < 12; k++) {
        g.fillStyle = `rgba(70,40,20,${0.05 + r() * 0.06})`;
        g.fillRect(r() * w, (i * h) / n + r() * (h / n), 20 + r() * 60, 1.5);
      }
      g.fillStyle = gap;
      g.fillRect(0, (i * h) / n, w, 3);
      // Nail heads near each end.
      g.fillStyle = 'rgba(40,30,30,0.6)';
      for (const x of [w * 0.06, w * 0.94]) {
        g.beginPath();
        g.arc(x, ((i + 0.5) * h) / n, 2.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  };
}

/** Soft round glow, for light pools and shadows. */
export function radialPainter(inner: string, outer: string): Painter {
  return (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  };
}

export const BLOCK_COLORS = ['#e8574a', '#4aa3df', '#ffd24a', '#3fb68b'];
export const BLOCK_LETTERS = 'TOYBXARCDEGKNPSZ';

/** Letter blocks: 16 letters by 4 colours in one 8x8 atlas. Cell = letter index * 4 + colour. */
export function letterAtlas(cache: TexCache): THREE.CanvasTexture {
  return cache.get('letters', 1024, 1024, (g, w) => {
    const cs = w / 8;
    for (let i = 0; i < 64; i++) {
      const letter = BLOCK_LETTERS[Math.floor(i / 4)];
      const col = BLOCK_COLORS[i % 4];
      const x = (i % 8) * cs;
      const y = Math.floor(i / 8) * cs;
      g.fillStyle = col;
      g.fillRect(x, y, cs, cs);
      // Bevel: light top-left, dark bottom-right.
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(x, y, cs, cs * 0.06);
      g.fillRect(x, y, cs * 0.06, cs);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x, y + cs * 0.94, cs, cs * 0.06);
      g.fillRect(x + cs * 0.94, y, cs * 0.06, cs);
      // Inset panel.
      g.strokeStyle = 'rgba(255,250,240,0.85)';
      g.lineWidth = cs * 0.035;
      roundRect(g, x + cs * 0.14, y + cs * 0.14, cs * 0.72, cs * 0.72, cs * 0.08);
      g.stroke();
      g.fillStyle = '#fffaf0';
      g.font = `${cs * 0.56}px ${DISPLAY_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(letter, x + cs / 2, y + cs * 0.54);
    }
  });
}

/** A box with each face showing an atlas cell: [+x, -x, +y, -y, +z, -z]. */
export function letterBlock(size: number, cells: number[]): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(size, size, size).toNonIndexed();
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    const cell = cells[f % cells.length];
    const cx = cell % 8;
    const cy = Math.floor(cell / 8);
    for (let k = 0; k < 6; k++) {
      const i = f * 6 + k;
      const u = uv.getX(i);
      const v = uv.getY(i);
      // Canvas rows run down; texture v runs up.
      uv.setXY(i, (cx + 0.02 + u * 0.96) / 8, 1 - (cy + 0.02 + (1 - v) * 0.96) / 8);
    }
  }
  return g;
}

export function letterCell(letter: string, color: number): number {
  const li = Math.max(0, BLOCK_LETTERS.indexOf(letter));
  return li * 4 + (color % 4);
}
