// Shared bits for built experiences (kart track, casino): what they get from
// the game, time formatting and small canvas helpers.

import * as THREE from 'three';
import type { Input } from '../input/input';
import type { Area } from '../shared/model';
import type { UI } from '../ui/ui';
import type { Pose } from '../world/avatar';
import type { Tier } from '../world/space';
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
  /** The game camera, for projecting world points to the screen. Do not move it; use `cameraShot`. */
  camera: THREE.PerspectiveCamera;
  /** Shake the camera: 0.2 is a bump, 0.6 a crash, 1 an explosion. Softened by Reduce motion. */
  shake(amount: number): void;
  /** Read input directly while `captureInput` is active (take, isHeld, move). */
  input: Input;
  /** The player's Reduce motion setting. */
  reduceMotion(): boolean;
  /** The current graphics tier. */
  tier(): Tier;
  /** Which way the camera faces (radians, 0 faces +z), for camera-relative controls. */
  cameraYaw(): number;
  /** Holds an avatar pose on foot (dance, crouch, aim...); null returns to walking. Carry poses win while carrying. */
  pose(p: Pose | null): void;
  /** A quick right-arm swing. */
  swing(): void;
  /** Puts an object in the avatar's right hand (null empties it). The experience owns and disposes it. */
  hold(obj: THREE.Object3D | null): void;
  /** Cartoon squash (positive) or stretch (negative) of the avatar, about 0.1 to 0.4. */
  squash(amount: number): void;
  /** Moves the player (feet at height `y`, default the floor) and snaps the camera behind them. */
  teleport(x: number, z: number, yaw: number, y?: number): void;
  /**
   * Pushes the player. `vy` sets the vertical speed (a launch, m/s); `vx` and
   * `vz` add to the walking speed, which walking control soon takes back over,
   * so use `carry` for long flights.
   */
  impulse(vx: number, vy: number, vz: number): void;
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
