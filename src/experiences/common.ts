// Shared bits for built experiences (kart track, casino): what they get from
// the game, time formatting and small canvas helpers.

import * as THREE from 'three';
import type { Area } from '../shared/model';
import type { UI } from '../ui/ui';
import { DISPLAY_FONT, BODY_FONT, keep, roundRect } from '../world/kit';

export interface ExperienceCtx {
  ui: UI;
  roomId: string;
  ownerName: string;
  area: Area;
  browserId: string;
  /** The player's current name. */
  name(): string;
  /** Snap the follow camera after teleporting the player. */
  snapCamera(yaw: number): void;
}

export function formatLap(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '--';
  const total = Math.max(0, Math.round(ms / 10));
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function formatCredits(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** A scoreboard painted on a canvas, for billboards in the world. */
export function boardTexture(title: string, rows: { name: string; value: string; you: boolean }[], footer: string, accent: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 448;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d1830';
  roundRect(g, 0, 0, c.width, c.height, 28);
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = accent;
  roundRect(g, 5, 5, c.width - 10, c.height - 10, 24);
  g.stroke();
  g.fillStyle = accent;
  g.font = `52px ${DISPLAY_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(title, c.width / 2, 52);
  g.font = `600 30px ${BODY_FONT}`;
  const shown = rows.slice(0, 8);
  if (!shown.length) {
    g.fillStyle = '#c9c2dc';
    g.fillText('No scores yet. Be the first!', c.width / 2, 210);
  }
  shown.forEach((r, i) => {
    const y = 110 + i * 38;
    g.fillStyle = r.you ? '#ffd24a' : '#fffaf0';
    g.textAlign = 'left';
    g.fillText(`${i + 1}. ${r.name}`, 40, y);
    g.textAlign = 'right';
    g.fillText(r.value, c.width - 40, y);
  });
  g.textAlign = 'center';
  g.fillStyle = '#ffd24a';
  g.font = `600 28px ${BODY_FONT}`;
  g.fillText(footer, c.width / 2, c.height - 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A small repeating canvas texture. */
export function patternTexture(size: number, draw: (g: CanvasRenderingContext2D, size: number) => void, repeat: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export { keep };
