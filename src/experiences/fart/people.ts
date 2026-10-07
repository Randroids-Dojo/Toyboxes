// The townsfolk as toy figures: part shapes (rounded, chunky, hand-built from
// primitives), the cast with their silhouettes, and a rig that turns a pose
// into part matrices in the shared figure batch.

import * as THREE from 'three';
import { at, compound, type Figures } from './figures';
import { C } from './palette';
import type { Face } from './textures';

// ---------------------------------------------------------------------------
// Part shapes

function lathe(profile: [number, number][], seg = 14): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

function capsule(r: number, len: number): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(r, len, 3, 8);
  g.translate(0, -(len / 2 + r) + r * 0.6, 0);
  return g;
}

const S = (r: number, ws = 12, hs = 9, ...rest: number[]) => new THREE.SphereGeometry(r, ws, hs, ...rest);
const Cy = (rt: number, rb: number, h: number, s = 14) => new THREE.CylinderGeometry(rt, rb, h, s);
const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const T = (r: number, t: number, s = 10, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 6, s, arc);

export function registerParts(f: Figures): void {
  // Bodies (unit height, pivot at the bottom).
  f.geo('torso-pear', () => lathe([[0.001, 0], [0.4, 0.02], [0.52, 0.22], [0.5, 0.5], [0.4, 0.82], [0.3, 0.97], [0.001, 1]]));
  f.geo('torso-tall', () => lathe([[0.001, 0], [0.42, 0.02], [0.44, 0.3], [0.36, 0.7], [0.34, 0.95], [0.001, 1]]));
  f.geo('torso-round', () => lathe([[0.001, 0], [0.42, 0.03], [0.55, 0.35], [0.5, 0.7], [0.32, 0.96], [0.001, 1]]));
  f.geo('skirt', () => lathe([[0.001, 0], [0.62, 0.02], [0.56, 0.25], [0.44, 0.6], [0.38, 0.8], [0.001, 0.82]]));
  f.geo('head', () => S(1, 18, 13));
  f.geo('nose', () => S(1, 10, 8));
  f.geo('ear', () => S(1, 8, 6).scale(0.5, 1, 0.35));
  f.geo('arm', () => capsule(0.075, 0.38));
  f.geo('hand', () => S(0.09, 10, 8));
  f.geo('leg', () => capsule(0.1, 0.3));
  f.geo('shoe', () => {
    const g = S(1, 10, 8);
    g.scale(0.11, 0.075, 0.17);
    g.translate(0, 0, 0.06);
    return g;
  });
  f.geo('boot', () => {
    const g = S(1, 10, 8);
    g.scale(0.14, 0.11, 0.22);
    g.translate(0, 0.02, 0.07);
    return g;
  });
  // Hats and hair, around a unit head (centre at 0).
  f.geo('tophat', () => compound([[Cy(0.62, 0.66, 1.15, 18), C.ink, at(0, 1.35, 0)], [Cy(1.05, 1.05, 0.08, 22), C.ink, at(0, 0.8, 0)], [Cy(0.665, 0.67, 0.2, 18), C.gold, at(0, 0.98, 0)]]));
  f.geo('feathers', () =>
    compound([
      [Cy(1.35, 1.4, 0.08, 22), 0x7e4fb0, at(0, 0.62, 0)],
      [S(0.75, 14, 8).scale(1, 0.55, 1), 0x7e4fb0, at(0, 0.78, 0)],
      [S(0.2, 8, 6).scale(1, 3.2, 0.5), 0xd9b8ff, at(0.35, 1.5, -0.3, -0.4, 0, -0.3)],
      [S(0.18, 8, 6).scale(1, 3, 0.5), 0xff8fc8, at(0.05, 1.55, -0.45, -0.5, 0, 0)],
      [S(0.16, 8, 6).scale(1, 2.6, 0.5), 0xffd45c, at(-0.25, 1.4, -0.4, -0.5, 0, 0.35)],
      [Cy(0.77, 0.77, 0.14, 18), 0xffd45c, at(0, 0.72, 0)],
    ]),
  );
  f.geo('flowerhat', () => {
    const parts: [THREE.BufferGeometry, number, THREE.Matrix4?][] = [
      [Cy(1.15, 1.2, 0.07, 22), 0xfff1d6, at(0, 0.62, 0)],
      [S(0.72, 14, 8).scale(1, 0.55, 1), 0xfff1d6, at(0, 0.74, 0)],
    ];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      parts.push([S(0.2, 8, 6), [C.flowerP, C.flowerY, 0xffffff][i % 3], at(Math.cos(a) * 0.72, 0.9, Math.sin(a) * 0.72)]);
    }
    return compound(parts);
  });
  f.geo('cap', () => compound([[S(1.02, 16, 8, ).scale(1, 0.45, 1.05), 0x9a8a6a, at(0, 0.45, -0.02)], [S(0.6, 12, 6).scale(1, 0.15, 0.8), 0x8a7a5a, at(0, 0.5, 0.75)]]));
  f.geo('boater', () => compound([[Cy(1.2, 1.2, 0.06, 22), 0xf0d48a, at(0, 0.66, 0)], [Cy(0.72, 0.74, 0.42, 18), 0xf0d48a, at(0, 0.86, 0)], [Cy(0.745, 0.745, 0.14, 18), 0xff6fa8, at(0, 0.76, 0)]]));
  f.geo('helmet', () => compound([[S(0.95, 16, 10).scale(1, 1.35, 1), 0x1f2a55, at(0, 0.7, -0.05)], [S(0.18, 8, 6), 0x2f3a6b, at(0, 2.0, -0.05)], [S(0.22, 10, 6).scale(1, 1.2, 0.3), C.brass, at(0, 1.0, 0.85)], [T(0.98, 0.07, 22), 0x1f2a55, at(0, 0.35, -0.05, Math.PI / 2)]]));
  f.geo('beehive', () => compound([[S(0.85, 14, 10).scale(1, 1.6, 1), 0x8a4f2e, at(0, 1.0, -0.1)], [S(1.03, 16, 10, ).scale(1, 0.75, 1), 0x8a4f2e, at(0, 0.25, -0.12)]]));
  f.geo('bun', () => compound([[S(1.04, 16, 10).scale(1, 0.72, 1), 0xd8d8e0, at(0, 0.3, -0.1)], [S(0.45, 12, 8), 0xd8d8e0, at(0, 0.85, -0.55)]]));
  f.geo('strawhat', () => compound([[Cy(1.6, 1.7, 0.07, 24), 0xe8c66a, at(0, 0.55, 0)], [Cy(0.7, 0.78, 0.55, 18), 0xe8c66a, at(0, 0.82, 0)], [Cy(0.785, 0.785, 0.12, 18), C.tomato, at(0, 0.64, 0)]]));
  f.geo('beanie', () =>
    compound([
      [S(1.03, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.tomato, at(0, 0.18, 0)],
      [S(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.1, 1), C.flowerY, at(0, 1.2, 0)],
      [Cy(0.05, 0.05, 0.4, 6), C.ink, at(0, 1.35, 0)],
      [B(1.3, 0.05, 0.22), 0x4aa3df, at(0, 1.56, 0)],
    ]),
  );
  f.geo('wildhair', () => {
    const parts: [THREE.BufferGeometry, number, THREE.Matrix4?][] = [[S(1.04, 14, 8).scale(1, 0.6, 1), 0xf2f2f2, at(0, 0.35, -0.1)]];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 1.6 + Math.PI * 0.7;
      parts.push([S(0.38, 8, 6), 0xf6f6f6, at(Math.cos(a) * 0.95, 0.45 + (i % 2) * 0.2, Math.sin(a) * 0.95)]);
    }
    return compound(parts);
  });
  f.geo('bandcap', () => compound([[Cy(0.8, 0.86, 0.5, 16), C.tomato, at(0, 0.8, 0)], [Cy(0.82, 0.82, 0.1, 16), C.gold, at(0, 0.62, 0)], [S(0.62, 12, 6).scale(1, 0.12, 0.8), C.ink, at(0, 0.6, 0.7)]]));
  f.geo('hairshort', () => S(1.04, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42).translate(0, 0.08, -0.05));
  f.geo('hairbob', () => compound([[S(1.08, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), 0xffffff, at(0, 0.02, -0.06)]]));
  f.geo('sunhat', () => compound([[Cy(1.5, 1.55, 0.06, 24), 0xffffff, at(0, 0.6, 0)], [S(0.75, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xffffff, at(0, 0.6, 0)]]));
  // Face extras.
  f.geo('walrus', () => compound([[S(0.38, 10, 6).scale(1.3, 0.55, 0.6), 0x7a5a40, at(-0.32, -0.32, 0.86, 0, 0, 0.35)], [S(0.38, 10, 6).scale(1.3, 0.55, 0.6), 0x7a5a40, at(0.32, -0.32, 0.86, 0, 0, -0.35)]]));
  f.geo('glasses', () => compound([[T(0.3, 0.045, 14), C.ink, at(-0.36, 0.08, 0.98)], [T(0.3, 0.045, 14), C.ink, at(0.36, 0.08, 0.98)], [B(0.18, 0.05, 0.05), C.ink, at(0, 0.12, 1.0)]]));
  f.geo('catglasses', () => compound([[T(0.28, 0.06, 3), 0xe8574a, at(-0.36, 0.08, 0.98, 0, 0, Math.PI / 2 + 0.2)], [T(0.28, 0.06, 3), 0xe8574a, at(0.36, 0.08, 0.98, 0, 0, Math.PI / 2 - 0.2)], [B(0.16, 0.05, 0.05), 0xe8574a, at(0, 0.12, 1.0)]]));
  f.geo('monocle', () => compound([[T(0.28, 0.04, 14), C.gold, at(0.36, 0.08, 0.99)]]));
  f.geo('beard', () => S(0.9, 12, 8).scale(1, 1, 0.75).translate(0, -0.65, 0.35));
  f.geo('peg', () => compound([[B(0.1, 0.42, 0.12), 0xffd45c, at(-0.07, -0.02, 1.12, 0.2, 0, 0)], [B(0.1, 0.42, 0.12), 0xffd45c, at(0.07, -0.02, 1.12, 0.2, 0, 0)], [T(0.06, 0.025, 8), 0xd8d8e0, at(0, 0.02, 1.1, 0, Math.PI / 2, 0)]]));
  f.geo('parasol', () => {
    const parts: [THREE.BufferGeometry, number, THREE.Matrix4?][] = [[Cy(0.04, 0.04, 2.4, 6), 0xfff7e6, at(0, 1.2, 0)]];
    for (let i = 0; i < 12; i++) {
      const seg = new THREE.ConeGeometry(1.7, 0.7, 3, 1, true, (i / 12) * Math.PI * 2, Math.PI / 6);
      parts.push([seg, i % 2 ? 0xffffff : 0x4aa3df, at(0, 2.45, 0)]);
    }
    return compound(parts);
  });
  f.geo('whiff', () => compound([[S(1, 12, 8), 0xffffff, at(0, 0, 0)], [S(0.35, 8, 6), 0xffffff, at(-0.75, -0.6, 0)]]));
  // Body extras (unit torso space, height 1).
  f.geo('sash', () => T(0.5, 0.05, 18).rotateX(Math.PI / 2).rotateZ(0.7).translate(0, 0.55, 0));
  f.geo('apron', () => compound([[B(0.62, 0.62, 0.04), 0xffd45c, at(0, 0.36, 0.5)], [S(0.06, 6, 4), C.bean, at(-0.12, 0.42, 0.53)], [S(0.06, 6, 4), C.bean, at(0.14, 0.3, 0.53)], [S(0.06, 6, 4), C.bean, at(0.02, 0.18, 0.53)]]));
  f.geo('pearls', () => T(0.28, 0.035, 16).rotateX(Math.PI / 2).translate(0, 0.94, 0.02));
  f.geo('bowtie', () => compound([[S(0.09, 8, 6).scale(1.3, 0.9, 0.6), 0xff6fa8, at(-0.09, 0.95, 0.3)], [S(0.09, 8, 6).scale(1.3, 0.9, 0.6), 0xff6fa8, at(0.09, 0.95, 0.3)]]));
  f.geo('buttons', () => compound([[S(0.045, 6, 4), C.gold, at(0, 0.7, 0.47)], [S(0.045, 6, 4), C.gold, at(0, 0.5, 0.5)], [S(0.045, 6, 4), C.gold, at(0, 0.3, 0.5)]]));
  f.geo('stripes', () => compound([0.25, 0.45, 0.65].map((y) => [T(0.48 - Math.abs(y - 0.45) * 0.2, 0.025, 18).rotateX(Math.PI / 2), 0xffffff, at(0, y, 0)] as [THREE.BufferGeometry, number, THREE.Matrix4])));
  // Held things (in the right hand).
  f.geo('teacup', () => compound([[Cy(0.09, 0.06, 0.09, 12), 0xffffff, at(0, 0.06, 0)], [Cy(0.13, 0.11, 0.015, 14), 0xffffff, at(0, 0.01, 0)], [T(0.035, 0.012, 8), 0xffffff, at(0.1, 0.06, 0)], [Cy(0.092, 0.092, 0.015, 12), C.flowerP, at(0, 0.09, 0)]]));
  f.geo('baton', () => Cy(0.012, 0.02, 0.5, 6).translate(0, 0.2, 0));
  f.geo('cushion', () => compound([[S(0.18, 10, 6).scale(1, 0.4, 1.1), 0xff8fc8, at(0, 0, 0)], [Cy(0.04, 0.05, 0.12, 6), 0xff8fc8, at(0, 0, 0.22, Math.PI / 2)]]));
  f.geo('flag', () => {
    const parts: [THREE.BufferGeometry, number, THREE.Matrix4?][] = [[Cy(0.02, 0.02, 0.9, 6), C.timber, at(0, 0.3, 0)]];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) parts.push([B(0.1, 0.1, 0.012), (i + j) % 2 ? 0xffffff : C.ink, at(0.07 + i * 0.1, 0.62 + j * 0.1, 0)]);
    return compound(parts);
  });
  f.geo('whistle', () => compound([[Cy(0.03, 0.03, 0.1, 8), 0xd8d8e0, at(0, 0, 0.05, Math.PI / 2)]]));
  f.geo('tuba', () => {
    const bell = lathe([[0.08, 0], [0.12, 0.25], [0.2, 0.45], [0.36, 0.6], [0.38, 0.62], [0.001, 0.62]], 18);
    return compound([[T(0.28, 0.07, 16), C.brass, at(0, 0, 0, 0, Math.PI / 2)], [bell, C.brass, at(0.05, 0.12, -0.1, -0.25, 0, 0.15)], [Cy(0.03, 0.03, 0.3, 6), C.brassHi, at(-0.15, 0.25, 0.1, 0.5)]]);
  });
  f.geo('trumpet', () => {
    const bell = lathe([[0.025, 0], [0.04, 0.25], [0.12, 0.38], [0.001, 0.38]], 14);
    return compound([[Cy(0.025, 0.025, 0.35, 8), C.brass, at(0, 0, 0.12, Math.PI / 2)], [bell, C.brass, at(0, 0, 0.29, Math.PI / 2)], [B(0.06, 0.12, 0.12), C.brassHi, at(0, -0.06, 0.08)]]);
  });
  f.geo('clarinet', () => compound([[Cy(0.025, 0.05, 0.6, 8), C.ink, at(0, 0, 0.24, Math.PI / 2 - 0.5)]]));
  f.geo('drum', () => compound([[Cy(0.38, 0.38, 0.3, 18), 0xffffff, at(0, 0, 0, Math.PI / 2)], [T(0.38, 0.03, 18), C.tomato, at(0, 0, 0.15)], [T(0.38, 0.03, 18), C.tomato, at(0, 0, -0.15)]]));
  f.geo('stamp', () => compound([[Cy(0.05, 0.05, 0.14, 8), C.timber, at(0, 0.07, 0)], [B(0.14, 0.04, 0.1), C.ink, at(0, -0.02, 0)]]));
  f.geo('basket', () => compound([[Cy(0.22, 0.18, 0.2, 12), 0xc99a5b, at(0, 0.1, 0)], [T(0.17, 0.02, 12, Math.PI), 0xa57a43, at(0, 0.2, 0)], [B(0.38, 0.02, 0.3), 0xe8574a, at(0, 0.21, 0)]]));
  f.geo('book', () => compound([[B(0.22, 0.3, 0.06), 0xffffff, at(0, 0, 0)], [B(0.2, 0.28, 0.065), 0xfff1d6, at(0.015, 0, 0)]]));
  // The pug.
  f.geo('pug-body', () => S(1, 12, 8).scale(0.26, 0.22, 0.38));
  f.geo('pug-head', () => compound([[S(0.22, 12, 8), 0xd9b48a, at(0, 0, 0)], [S(0.13, 10, 6).scale(1, 0.75, 0.7), 0x2b2430, at(0, -0.05, 0.17)], [S(0.035, 6, 4), 0x2b1d3a, at(-0.08, 0.06, 0.19)], [S(0.035, 6, 4), 0x2b1d3a, at(0.08, 0.06, 0.19)]]));
  f.geo('pug-ear', () => S(0.08, 8, 6).scale(1, 0.5, 0.8));
  f.geo('pug-leg', () => Cy(0.05, 0.045, 0.16, 6).translate(0, -0.08, 0));
  f.geo('pug-tail', () => T(0.06, 0.025, 8, Math.PI * 1.6));
  // Birds.
  f.geo('pigeon-body', () => compound([[S(1, 10, 8).scale(0.12, 0.11, 0.18), 0x9aa3b5, at(0, 0, 0)], [S(1, 8, 6).scale(0.1, 0.03, 0.12), 0x6b7590, at(0, 0, -0.18)]]));
  f.geo('pigeon-head', () => compound([[S(0.075, 10, 8), 0x7d8ba8, at(0, 0, 0)], [S(0.08, 8, 6).scale(1, 0.6, 1), 0x6fa38f, at(0, -0.06, 0)], [Cy(0.005, 0.02, 0.05, 6), 0xe0a060, at(0, -0.01, 0.08, Math.PI / 2)], [S(0.015, 6, 4), C.ink, at(0.05, 0.02, 0.04)], [S(0.015, 6, 4), C.ink, at(-0.05, 0.02, 0.04)]]));
  f.geo('pigeon-wing', () => S(1, 8, 6).scale(0.03, 0.08, 0.16).translate(0, 0, -0.02));
  f.geo('duck-body', () => compound([[S(1, 12, 8).scale(0.2, 0.15, 0.3), 0xffffff, at(0, 0, 0)], [S(1, 8, 6).scale(0.14, 0.08, 0.1), 0xf5f5f5, at(0, 0.06, -0.26, 0.6)]]));
  f.geo('duck-head', () => compound([[S(0.11, 10, 8), 0xffffff, at(0, 0, 0)], [S(1, 8, 6).scale(0.06, 0.025, 0.08), 0xffa020, at(0, -0.02, 0.12)], [S(0.018, 6, 4), C.ink, at(0.07, 0.03, 0.06)], [S(0.018, 6, 4), C.ink, at(-0.07, 0.03, 0.06)]]));
}

// ---------------------------------------------------------------------------
// The cast

export type Hat = 'tophat' | 'feathers' | 'flowerhat' | 'cap' | 'boater' | 'helmet' | 'beehive' | 'bun' | 'strawhat' | 'beanie' | 'wildhair' | 'bandcap' | 'hairshort' | 'hairbob' | 'sunhat';
export type Extra = 'walrus' | 'glasses' | 'catglasses' | 'monocle' | 'beard' | 'sash' | 'apron' | 'pearls' | 'bowtie' | 'buttons' | 'stripes' | 'peg';
export type Held = 'teacup' | 'baton' | 'cushion' | 'flag' | 'whistle' | 'tuba' | 'trumpet' | 'clarinet' | 'drum' | 'stamp' | 'basket' | 'book' | null;

export interface PersonSpec {
  id: string;
  name: string;
  /** Total height to the top of the head (hats add more), m. */
  height: number;
  body: 'torso-pear' | 'torso-tall' | 'torso-round';
  width: number;
  coat: number;
  skirt?: number;
  legs: number;
  shoes: number;
  skin: number;
  hat: Hat | null;
  hatColor?: number;
  extras: Extra[];
  extraColor?: Partial<Record<Extra, number>>;
  held: Held;
  /** Voice pitch, Hz. */
  voice: number;
  bigEars?: boolean;
  boots?: boolean;
}

export const CAST: Record<string, PersonSpec> = {
  mayor: { id: 'mayor', name: 'Mayor Pemberton', height: 2.0, body: 'torso-pear', width: 0.95, coat: 0x2f3a6b, legs: 0x262a40, shoes: 0x1a1420, skin: 0xffd0b0, hat: 'tophat', extras: ['sash', 'walrus', 'monocle', 'buttons'], extraColor: { sash: 0xe8574a }, held: null, voice: 110 },
  gran: { id: 'gran', name: 'Gran Butterworth', height: 1.9, body: 'torso-round', width: 0.95, coat: 0xb59ad9, skirt: 0xb59ad9, legs: 0xf0d8c8, shoes: 0x6b4a3a, skin: 0xffe0c9, hat: 'bun', extras: ['glasses', 'apron'], held: null, voice: 300 },
  lady: { id: 'lady', name: 'Lady Featherstone', height: 2.1, body: 'torso-tall', width: 0.62, coat: 0x3fb68b, skirt: 0x3fb68b, legs: 0xf6e0d0, shoes: 0x2b1d3a, skin: 0xffe6d6, hat: 'feathers', extras: ['pearls'], extraColor: { pearls: 0xffffff }, held: 'teacup', voice: 330 },
  primrose: { id: 'primrose', name: 'Mrs. Primrose', height: 1.85, body: 'torso-round', width: 0.92, coat: 0xff9fbf, skirt: 0xff9fbf, legs: 0xf0d8c8, shoes: 0xe8574a, skin: 0xf2c19a, hat: 'flowerhat', extras: ['pearls'], extraColor: { pearls: 0xffd45c }, held: 'teacup', voice: 280 },
  wimble: { id: 'wimble', name: 'Grandpa Wimble', height: 1.95, body: 'torso-pear', width: 0.82, coat: 0xd9a03f, legs: 0x5d6b5a, shoes: 0x3b2b20, skin: 0xffd9b8, hat: 'cap', extras: ['buttons'], held: null, voice: 120, bigEars: true },
  fizz: { id: 'fizz', name: 'Mr. Fizzwhistle', height: 2.1, body: 'torso-tall', width: 0.6, coat: 0xff7fb4, legs: 0xfff1d6, shoes: 0x2b1d3a, skin: 0xffe0c9, hat: 'boater', extras: ['stripes', 'bowtie'], held: null, voice: 420 },
  sprout: { id: 'sprout', name: 'Mr. Sprout', height: 1.95, body: 'torso-round', width: 1.0, coat: 0x3f8f4a, legs: 0x3f8f4a, shoes: 0x4a3426, skin: 0xffcfae, hat: 'strawhat', extras: ['beard', 'buttons'], extraColor: { beard: 0xe0782f }, held: null, voice: 130 },
  bobbins: { id: 'bobbins', name: 'Constable Bobbins', height: 2.05, body: 'torso-pear', width: 0.9, coat: 0x1f2a55, legs: 0x1f2a55, shoes: 0x111111, skin: 0xf2c19a, hat: 'helmet', extras: ['buttons'], held: 'whistle', voice: 150, boots: true },
  pip: { id: 'pip', name: 'Pip', height: 1.15, body: 'torso-round', width: 0.75, coat: 0x4aa3df, legs: 0x2f3a6b, shoes: 0xe8574a, skin: 0xa8714f, hat: 'beanie', extras: [], held: 'cushion', voice: 520 },
  hush: { id: 'hush', name: 'Ms. Hush', height: 2.0, body: 'torso-tall', width: 0.66, coat: 0x8a6bd1, skirt: 0x5d4a9e, legs: 0xf0d8c8, shoes: 0x2b1d3a, skin: 0xd9a07a, hat: 'beehive', extras: ['catglasses', 'pearls'], extraColor: { pearls: 0xffffff }, held: null, voice: 260 },
  maestro: { id: 'maestro', name: 'Maestro Oompah', height: 1.95, body: 'torso-pear', width: 0.85, coat: 0x1a1420, legs: 0x1a1420, shoes: 0x111111, skin: 0xffd0b0, hat: 'wildhair', extras: ['walrus', 'bowtie'], extraColor: { walrus: 0xf2f2f2 }, held: 'baton', voice: 140 },
  tuba: { id: 'tuba', name: 'Tuba player', height: 1.95, body: 'torso-round', width: 0.95, coat: C.tomato, legs: 0x1a1420, shoes: 0x111111, skin: 0xd9a07a, hat: 'bandcap', extras: ['buttons'], held: 'tuba', voice: 100 },
  trumpet: { id: 'trumpet', name: 'Trumpet player', height: 1.9, body: 'torso-pear', width: 0.8, coat: C.tomato, legs: 0x1a1420, shoes: 0x111111, skin: 0xffe0c9, hat: 'bandcap', extras: ['buttons'], held: 'trumpet', voice: 240 },
  clarinet: { id: 'clarinet', name: 'Clarinet player', height: 1.85, body: 'torso-tall', width: 0.7, coat: C.tomato, legs: 0x1a1420, shoes: 0x111111, skin: 0x7a4e36, hat: 'bandcap', extras: ['buttons'], held: 'clarinet', voice: 280 },
  drummer: { id: 'drummer', name: 'Drummer', height: 1.9, body: 'torso-pear', width: 0.85, coat: C.tomato, legs: 0x1a1420, shoes: 0x111111, skin: 0xf2c19a, hat: 'bandcap', extras: ['buttons'], held: 'drum', voice: 180 },
  dozer: { id: 'dozer', name: 'Mr. Dozer', height: 1.95, body: 'torso-round', width: 0.95, coat: 0x6b7f6a, legs: 0x4a4a5a, shoes: 0x3b2b20, skin: 0xffd9b8, hat: 'hairshort', hatColor: 0xd8d8e0, extras: ['glasses'], held: null, voice: 115 },
};

const EXTRA_COLOR: Record<Extra, number> = { peg: 0xffffff, walrus: 0xffffff, glasses: 0xffffff, catglasses: 0xffffff, monocle: 0xffffff, beard: 0xe0782f, sash: C.tomato, apron: 0xffffff, pearls: 0xffffff, bowtie: 0xffffff, buttons: 0xffffff, stripes: 0xffffff };
const FACE_EXTRAS = new Set<Extra>(['walrus', 'glasses', 'catglasses', 'monocle', 'beard', 'peg']);

/** A random townsperson for crowds (picnickers, readers). */
export function extra(id: string, r: () => number): PersonSpec {
  const coats = [0x4aa3df, 0xe8574a, 0x3fb68b, 0xf58a6b, 0x8a6bd1, 0xffd45c, 0x6b7f6a, 0xff9fbf, 0x9fc3e8];
  const hats: (Hat | null)[] = ['sunhat', 'hairbob', 'hairshort', 'cap', 'boater', 'flowerhat', null, 'hairbob', 'sunhat'];
  const hair = [0x5a3a22, 0xe0b060, 0x2b1d1a, 0xd8d8e0, 0xb0502a];
  const pick = <T,>(l: readonly T[]) => l[Math.floor(r() * l.length) % l.length];
  const hat = pick(hats);
  const lady = r() < 0.5;
  const body = pick(['torso-pear', 'torso-tall', 'torso-round'] as const);
  return {
    id,
    name: 'Villager',
    height: 1.75 + r() * 0.3,
    body,
    width: body === 'torso-tall' ? 0.62 : 0.8 + r() * 0.15,
    coat: pick(coats),
    skirt: lady ? pick(coats) : undefined,
    legs: lady ? 0xf0d8c8 : pick([0x2f3a6b, 0x4a4a5a, 0x5d6b5a]),
    shoes: pick([0x2b1d3a, 0x6b4a3a, 0xe8574a]),
    skin: pick([0xffd9b8, 0xf2c19a, 0xd9a07a, 0xa8714f, 0x7a4e36, 0xffe0c9]),
    hat,
    hatColor: hat === 'hairbob' || hat === 'hairshort' ? pick(hair) : hat === 'sunhat' ? pick([0xffffff, 0xffe29a, 0xcdebd3]) : undefined,
    extras: r() < 0.3 ? ['glasses'] : r() < 0.2 ? ['bowtie'] : [],
    held: null,
    voice: lady ? 240 + r() * 120 : 110 + r() * 80,
  };
}

// ---------------------------------------------------------------------------
// The rig

export interface PoseState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Walk phase (radians) and stride amplitude 0 to 1. */
  walk: number;
  stride: number;
  /** Arm rotations: x swings forward (+), z raises out (+). */
  armL: { x: number; z: number };
  armR: { x: number; z: number };
  headYaw: number;
  headPitch: number;
  headRoll: number;
  lean: number;
  /** Small up and down. */
  bob: number;
  /** Cartoon squash: + squashes, - stretches. */
  squash: number;
  /** 0 standing, 1 sitting. */
  sit: number;
  /** Sitting on the ground (picnics) rather than a chair. */
  floorSit?: boolean;
  face: Face;
  hatOff: boolean;
  /** Show the held item. */
  holding: boolean;
  visible: boolean;
}

export function pose(x = 0, z = 0, yaw = 0): PoseState {
  return { x, y: 0, z, yaw, walk: 0, stride: 0, armL: { x: 0, z: 0.12 }, armR: { x: 0, z: 0.12 }, headYaw: 0, headPitch: 0, headRoll: 0, lean: 0, bob: 0, squash: 0, sit: 0, face: 'neutral', hatOff: false, holding: true, visible: true };
}

const m0 = new THREE.Matrix4();
const m1 = new THREE.Matrix4();
const m2 = new THREE.Matrix4();
const R = new THREE.Matrix4();
const HIP = new THREE.Matrix4();
const TORSO = new THREE.Matrix4();
const CHEST = new THREE.Matrix4();
const ARM = new THREE.Matrix4();
const HAND = new THREE.Matrix4();
const HEAD = new THREE.Matrix4();
/** Length below the pivot of the 'leg' and 'arm' capsules. */
const LEG_LEN = 0.44;
const ARM_LEN = 0.485;
const v0 = new THREE.Vector3();
const q0 = new THREE.Quaternion();
const e0 = new THREE.Euler();
const s0 = new THREE.Vector3();

function trs(out: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return out.compose(v0.set(x, y, z), q0.setFromEuler(e0.set(rx, ry, rz, 'YXZ')), s0.set(sx, sy, sz));
}

export class Person {
  readonly spec: PersonSpec;
  readonly p: PoseState;
  private ids: Record<string, number> = {};
  private extraIds: [Extra, number][] = [];
  private face: number;
  private blob: number;
  private shown = true;
  private L: number;
  private Tt: number;
  private hr: number;
  /** World position of the right hand last update (for thrown things). */
  readonly hand = new THREE.Vector3();
  /** World position of the hat. */
  readonly hatPos = new THREE.Vector3();
  readonly headPos = new THREE.Vector3();

  constructor(
    private f: Figures,
    spec: PersonSpec,
    x = 0,
    z = 0,
    yaw = 0,
  ) {
    this.spec = spec;
    this.p = pose(x, z, yaw);
    const H = spec.height;
    this.L = H * 0.27;
    this.Tt = H * 0.4;
    this.hr = H * 0.15;
    const add = (k: string, geo: string, col: number) => (this.ids[k] = f.add(geo, col));
    add('legL', 'leg', spec.legs);
    add('legR', 'leg', spec.legs);
    add('shoeL', spec.boots ? 'boot' : 'shoe', spec.shoes);
    add('shoeR', spec.boots ? 'boot' : 'shoe', spec.shoes);
    add('torso', spec.body, spec.coat);
    if (spec.skirt !== undefined) add('skirt', 'skirt', spec.skirt);
    add('armL', 'arm', spec.coat);
    add('armR', 'arm', spec.coat);
    add('handL', 'hand', spec.skin);
    add('handR', 'hand', spec.skin);
    add('head', 'head', spec.skin);
    add('nose', 'nose', new THREE.Color(spec.skin).multiplyScalar(0.92).getHex());
    add('earL', 'ear', spec.skin);
    add('earR', 'ear', spec.skin);
    if (spec.hat) add('hat', spec.hat, spec.hatColor ?? 0xffffff);
    if (spec.held) this.ids.held = f.add(spec.held, 0xffffff);
    for (const e of spec.extras) this.extraIds.push([e, f.add(e, spec.extraColor?.[e] ?? EXTRA_COLOR[e], { outline: e !== 'buttons' && e !== 'stripes' && e !== 'pearls' })]);
    this.face = f.face();
    this.blob = f.blob();
    this.update();
  }

  /** Recomputes every part from the pose. */
  update(): void {
    const p = this.p;
    const f = this.f;
    if (!p.visible) {
      if (this.shown) {
        for (const id of Object.values(this.ids)) f.show(id, false);
        for (const [, id] of this.extraIds) f.show(id, false);
        f.hideFace(this.face);
        f.setBlob(this.blob, 0, -50, 0, 0);
        this.shown = false;
      }
      return;
    }
    this.shown = true;
    for (const [k, id] of Object.entries(this.ids)) f.show(id, k === 'held' ? p.holding : k === 'hat' ? !p.hatOff : true);
    for (const [, id] of this.extraIds) f.show(id, true);
    const spec = this.spec;
    const L = this.L;
    const T = this.Tt;
    const hr = this.hr;
    const w = spec.width * hr * 2.2;
    const sq = p.squash;
    const sit = p.sit;
    const floor = p.floorSit ? 1 : 0;
    const root = trs(R, p.x, p.y + p.bob, p.z, 0, p.yaw, 0, 1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    const hipY = L * (1 - sit * (floor ? 0.92 : 0.12));
    const swing = Math.sin(p.walk) * 0.6 * p.stride;
    const legScale = L / LEG_LEN;
    const sitRot = sit * (Math.PI / 2) * (floor ? 1 : 0.95);
    for (const side of [-1, 1] as const) {
      const legSwing = side === -1 ? swing : -swing;
      HIP.multiplyMatrices(root, trs(m1, side * w * 0.22, hipY, 0, -sitRot + legSwing, 0, floor ? side * 0.2 * sit : 0));
      m2.multiplyMatrices(HIP, trs(m1, 0, 0, 0, 0, 0, 0, 1, legScale, 1));
      f.set(this.ids[side === -1 ? 'legL' : 'legR'], m2);
      m2.multiplyMatrices(HIP, trs(m1, 0, -L * 0.96, 0, sitRot * 0.9 - legSwing * 0.4, 0, 0));
      f.set(this.ids[side === -1 ? 'shoeL' : 'shoeR'], m2);
    }
    const torsoY = hipY - L * 0.08;
    TORSO.multiplyMatrices(root, trs(m1, 0, torsoY, 0, p.lean, 0, 0, w, T, w * 0.88));
    f.set(this.ids.torso, TORSO);
    if (this.ids.skirt !== undefined) {
      m2.multiplyMatrices(root, trs(m1, 0, torsoY - L * 0.35 * (1 - sit), 0, p.lean * 0.5, 0, 0, w * 1.02, T * 1.05, w * 0.95));
      f.set(this.ids.skirt, m2);
    }
    for (const [e, id] of this.extraIds) if (!FACE_EXTRAS.has(e)) f.set(id, TORSO);
    CHEST.multiplyMatrices(root, trs(m1, 0, torsoY, 0, p.lean, 0, 0));
    const shoulderY = T * 0.86;
    const armScale = (T * 0.8) / ARM_LEN;
    for (const side of [-1, 1] as const) {
      const a = side === -1 ? p.armL : p.armR;
      const walkArm = (side === -1 ? -swing : swing) * 0.8;
      ARM.multiplyMatrices(CHEST, trs(m1, side * (w * 0.47 + 0.02), shoulderY, 0, -(a.x + walkArm), 0, side * a.z));
      m2.multiplyMatrices(ARM, trs(m1, 0, 0, 0, 0, 0, 0, 1, armScale, 1));
      f.set(this.ids[side === -1 ? 'armL' : 'armR'], m2);
      HAND.multiplyMatrices(ARM, trs(m1, 0, -T * 0.8, 0, 0, 0, 0));
      f.set(this.ids[side === -1 ? 'handL' : 'handR'], HAND);
      if (side === 1) {
        this.hand.setFromMatrixPosition(HAND);
        if (this.ids.held !== undefined && p.holding) {
          const held = spec.held;
          if (held === 'tuba') m2.multiplyMatrices(CHEST, trs(m1, 0.05, T * 0.55, w * 0.55, 0, 0, 0, 1.1));
          else if (held === 'drum') m2.multiplyMatrices(CHEST, trs(m1, 0, T * 0.45, w * 0.62, 0, 0, 0, 0.9));
          else if (held === 'trumpet' || held === 'clarinet') m2.multiplyMatrices(CHEST, trs(m1, 0, T + hr * 0.55, hr * 0.85, -p.headPitch * 0.5, 0, 0));
          else if (held === 'whistle') m2.multiplyMatrices(CHEST, trs(m1, 0.1, T * 0.8, w * 0.42, 0, 0, 0));
          else m2.multiplyMatrices(HAND, trs(m1, 0, -0.06, 0.02, held === 'baton' || held === 'flag' ? Math.PI / 2 + 0.6 : held === 'book' ? Math.PI / 2 : Math.PI, 0, 0));
          f.set(this.ids.held, m2);
        }
      }
    }
    HEAD.multiplyMatrices(CHEST, trs(m1, 0, T + hr * 0.82, 0, p.headPitch, p.headYaw, p.headRoll, hr));
    f.set(this.ids.head, HEAD);
    this.headPos.setFromMatrixPosition(HEAD);
    f.setFace(this.face, HEAD, p.face);
    m2.multiplyMatrices(HEAD, trs(m1, 0, -0.08, 0.98, 0, 0, 0, 0.2, 0.18, 0.16));
    f.set(this.ids.nose, m2);
    const es = spec.bigEars ? 1.5 : 1;
    m2.multiplyMatrices(HEAD, trs(m1, -0.98, 0, 0, 0, 0, 0.1, 0.32 * es));
    f.set(this.ids.earL, m2);
    m2.multiplyMatrices(HEAD, trs(m1, 0.98, 0, 0, 0, 0, -0.1, 0.32 * es));
    f.set(this.ids.earR, m2);
    if (this.ids.hat !== undefined) f.set(this.ids.hat, HEAD);
    this.hatPos.setFromMatrixPosition(HEAD);
    this.hatPos.y += hr * 1.2;
    for (const [e, id] of this.extraIds) if (FACE_EXTRAS.has(e)) f.set(id, HEAD);
    f.setBlob(this.blob, p.x, 0, p.z, spec.height * 0.55 * Math.max(0.4, 1 - p.y * 0.15));
  }

  /** Height of the top of the head (for speech bubbles). */
  get top(): number {
    return this.p.y + this.L + this.Tt + this.hr * 2.6;
  }
}

// ---------------------------------------------------------------------------
// Animals

export interface CritterPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Walk or paddle phase. */
  walk: number;
  stride: number;
  /** Wing flap phase for birds, 0 when folded. */
  flap: number;
  peck: number;
  visible: boolean;
  /** Pug: ears down (sad). */
  sad?: number;
}

export function critterPose(x = 0, z = 0, yaw = 0): CritterPose {
  return { x, y: 0, z, yaw, walk: 0, stride: 0, flap: 0, peck: 0, visible: true };
}

export class Pug {
  readonly p: CritterPose;
  private ids: number[] = [];
  private blob: number;
  constructor(
    private f: Figures,
    x: number,
    z: number,
    yaw: number,
  ) {
    this.p = critterPose(x, z, yaw);
    this.ids.push(f.add('pug-body', 0xd9b48a), f.add('pug-head', 0xffffff), f.add('pug-ear', 0x2b2430), f.add('pug-ear', 0x2b2430), f.add('pug-tail', 0xd9b48a));
    for (let i = 0; i < 4; i++) this.ids.push(f.add('pug-leg', 0xd9b48a));
    this.blob = f.blob();
    this.update();
  }

  get top(): number {
    return this.p.y + 0.75;
  }

  update(): void {
    const p = this.p;
    const f = this.f;
    for (const id of this.ids) f.show(id, p.visible);
    if (!p.visible) return;
    const lie = p.peck; // 1 = lying down asleep
    const root = trs(m0, p.x, p.y, p.z, 0, p.yaw, 0);
    const bodyY = 0.32 - lie * 0.16;
    const sw = Math.sin(p.walk) * 0.5 * p.stride;
    m1.multiplyMatrices(root, trs(m2, 0, bodyY, 0, 0, 0, 0));
    f.set(this.ids[0], m1);
    const head = new THREE.Matrix4().multiplyMatrices(root, trs(m2, 0, bodyY + 0.14 - lie * 0.08, 0.36, lie * 0.2, 0, Math.sin(p.walk * 0.5) * 0.05));
    f.set(this.ids[1], head);
    const sad = p.sad ?? 0;
    m1.multiplyMatrices(head, trs(m2, -0.17, 0.14 - sad * 0.1, 0, 0, 0, 0.6 + sad * 1.0));
    f.set(this.ids[2], m1);
    m1.multiplyMatrices(head, trs(m2, 0.17, 0.14 - sad * 0.1, 0, 0, 0, -0.6 - sad * 1.0));
    f.set(this.ids[3], m1);
    m1.multiplyMatrices(root, trs(m2, 0, bodyY + 0.16, -0.36, 0.4, Math.sin(p.walk * 2) * 0.4, 0));
    f.set(this.ids[4], m1);
    const legs: [number, number, number][] = [[-0.14, 0.22, sw], [0.14, 0.22, -sw], [-0.14, -0.22, -sw], [0.14, -0.22, sw]];
    legs.forEach(([lx, lz, s], i) => {
      m1.multiplyMatrices(root, trs(m2, lx, bodyY - 0.12 + lie * 0.1, lz, s + lie * (lz > 0 ? -1.3 : 1.3), 0, 0));
      f.set(this.ids[5 + i], m1);
    });
    f.setBlob(this.blob, p.x, 0, p.z, 0.8);
  }
}

export class Bird {
  readonly p: CritterPose;
  private ids: number[] = [];
  constructor(
    private f: Figures,
    readonly kind: 'pigeon' | 'duck',
    x: number,
    z: number,
    yaw: number,
  ) {
    this.p = critterPose(x, z, yaw);
    if (kind === 'pigeon') this.ids.push(f.add('pigeon-body', 0xffffff, { outline: false }), f.add('pigeon-head', 0xffffff, { outline: false }), f.add('pigeon-wing', 0x8a93a8, { outline: false }), f.add('pigeon-wing', 0x8a93a8, { outline: false }));
    else this.ids.push(f.add('duck-body', 0xffffff), f.add('duck-head', 0xffffff));
    this.update();
  }

  update(): void {
    const p = this.p;
    const f = this.f;
    for (const id of this.ids) f.show(id, p.visible);
    if (!p.visible) return;
    const hop = this.kind === 'pigeon' ? Math.abs(Math.sin(p.walk)) * 0.04 * p.stride : Math.sin(p.walk) * 0.015;
    const root = trs(m0, p.x, p.y + hop, p.z, 0, p.yaw, 0);
    if (this.kind === 'pigeon') {
      const fly = p.flap !== 0 ? 1 : 0;
      m1.multiplyMatrices(root, trs(m2, 0, 0.14, 0, -fly * 0.3, 0, 0));
      f.set(this.ids[0], m1);
      m1.multiplyMatrices(root, trs(m2, 0, 0.25 - p.peck * 0.12, 0.15 + p.peck * 0.06, p.peck * 0.9, 0, 0));
      f.set(this.ids[1], m1);
      const a = fly ? Math.sin(p.flap) * 1.1 : 0;
      m1.multiplyMatrices(root, trs(m2, -0.11, 0.17, 0, 0, 0, -a - (fly ? 0.3 : 0)));
      f.set(this.ids[2], m1);
      m1.multiplyMatrices(root, trs(m2, 0.11, 0.17, 0, 0, 0, a + (fly ? 0.3 : 0)));
      f.set(this.ids[3], m1);
    } else {
      m1.multiplyMatrices(root, trs(m2, 0, 0.08, 0, 0, 0, 0));
      f.set(this.ids[0], m1);
      m1.multiplyMatrices(root, trs(m2, 0, 0.3, 0.2 + p.peck * 0.1, p.peck * 1.2, 0, 0));
      f.set(this.ids[1], m1);
    }
  }
}
