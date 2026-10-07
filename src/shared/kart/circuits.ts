// The Toybox Cup: four designed circuits, shared by the browser (building
// and racing) and the API (checking laps for the boards). Distances along
// the lap (s) are metres from the start line in the direction of travel.
//
// Block Town keeps the original Grand Prix centre line exactly, so the
// laps already on room 1's board stay valid.

import { GRAND_PRIX, buildCircuit } from '../circuits.js';
import { trackId } from '../track.js';

export type CircuitId = 'blocktown' | 'picnic' | 'cove' | 'bedroom';
/** A drawn track from another room's sketchbook, dressed like Block Town. */
export type HomeId = CircuitId | 'sketch';
export type Theme = 'playroom' | 'garden' | 'beach' | 'bedroom';

type Piece = { straight: number } | { radius: number; turn: number } | { close: 'a' | 'b' };

/**
 * One stretch of a raised road. Heights ease between h0 and h1:
 * 'smooth' starts and ends flat, 'kick' starts flat and ends steep (a ramp's lip),
 * 'flat' holds h0.
 */
export interface Seg {
  s0: number;
  s1: number;
  h0: number;
  h1: number;
  ease: 'smooth' | 'kick' | 'flat';
}

/**
 * Raised road. 'verge' features slope down to the ground at the sides (a gentle
 * crest); 'wall' features have sheer sides and rails so nobody leaves them
 * except over the end of a ramp.
 */
export interface Raise {
  sides: 'verge' | 'wall';
  segs: Seg[];
  /** A stretch with no road at all: jump it or get grabbed. */
  gap?: { s0: number; s1: number; floor: number };
  style: 'earth' | 'melon' | 'planks' | 'books';
}

export interface Tunnel {
  s0: number;
  s1: number;
  /** Underside of the roof, metres. */
  roof: number;
  style: 'castle' | 'bed';
}

export interface Pad {
  s: number;
  off: number;
  /** Half length along the road. */
  len?: number;
}

export interface CircuitDef {
  id: CircuitId;
  name: string;
  /** One line for the menu card. */
  blurb: string;
  theme: Theme;
  laps: number;
  raises: Raise[];
  tunnels: Tunnel[];
  /** Capsule rows across the road. */
  capsules: number[];
  pads: Pad[];
  /** Time trial medals on Battery, ms: bronze, silver, gold, champion. */
  medals: [number, number, number, number];
  /** Wall or fence distance beyond the outermost road, metres. */
  bounds: number;
}

/** The two straights that close a loop, solved like buildCircuit does (without its 1.5 m sampling). */
function closeLengths(pieces: Piece[]): { a: number; b: number } {
  const end = (a: number, b: number): [number, number] => {
    let x = 0;
    let y = 0;
    let hd = 0;
    for (const pc of pieces) {
      if ('radius' in pc) {
        const ang = (pc.turn * Math.PI) / 180;
        const sg = Math.sign(ang);
        const cx = x - Math.sin(hd) * pc.radius * sg;
        const cy = y + Math.cos(hd) * pc.radius * sg;
        const a0 = Math.atan2(y - cy, x - cx);
        x = cx + Math.cos(a0 + ang) * pc.radius;
        y = cy + Math.sin(a0 + ang) * pc.radius;
        hd += ang;
      } else {
        const len = 'straight' in pc ? pc.straight : pc.close === 'a' ? a : b;
        x += Math.cos(hd) * len;
        y += Math.sin(hd) * len;
      }
    }
    return [x, y];
  };
  const e0 = end(0, 0);
  const ea = end(1, 0);
  const eb = end(0, 1);
  const A = [ea[0] - e0[0], ea[1] - e0[1]];
  const B = [eb[0] - e0[0], eb[1] - e0[1]];
  const det = A[0] * B[1] - A[1] * B[0];
  return { a: (-e0[0] * B[1] + e0[1] * B[0]) / det, b: (-A[0] * e0[1] + A[1] * e0[0]) / det };
}

const PICNIC: Piece[] = [
  { close: 'a' }, // Lemonade Lane, the main straight
  { radius: 18, turn: 90 }, // Sandwich Bend
  { straight: 18 },
  { radius: 26, turn: -50 }, // Basket esses
  { radius: 26, turn: 50 },
  { straight: 50 }, // Blanket Run and the Watermelon Jump
  { radius: 14, turn: 180 }, // Juice Box hairpin
  { straight: 20 },
  { radius: 28, turn: -90 }, // Gnome sweeper
  { straight: 60 }, // Anthill Rise
  { radius: 20, turn: 90 }, // Daisy corner
  { close: 'b' }, // Flower border
  { radius: 22, turn: 90 },
];

const COVE: Piece[] = [
  { close: 'b' }, // Tide Line, the main straight
  { radius: 20, turn: 90 }, // Lifeguard corner
  { close: 'a' }, // Boardwalk, with the beach balls
  { radius: 16, turn: 90 }, // Pier turn
  { straight: 32 }, // Plank Bridge
  { radius: 22, turn: 45 },
  { radius: 18, turn: -135 }, // Crab Claw
  { radius: 14, turn: 180 },
  { straight: 36 }, // Castle Gate
  { radius: 24, turn: 40 }, // Dune flick
  { radius: 24, turn: -40 },
  { radius: 18, turn: 90 }, // Bucket corner
];

const BEDROOM: Piece[] = [
  { close: 'b' }, // Launchpad straight
  { radius: 18, turn: -90 }, // Alarm Clock corner
  { close: 'a' }, // Rug straight
  { radius: 14, turn: -90 }, // Slipper turn
  { straight: 46 }, // Book Stack Leap
  { radius: 20, turn: 60 }, // Landing flick
  { radius: 15, turn: -150 }, // Nightlight loop
  { straight: 28 }, // Under the Bed
  { radius: 16, turn: 80 }, // Cat's Tail chicane
  { radius: 16, turn: -80 },
  { radius: 22, turn: -90 }, // Rocket sweeper
];

const PIECES: Record<CircuitId, { pieces: Piece[]; start: number }> = {
  blocktown: { pieces: GRAND_PRIX as Piece[], start: 48 },
  picnic: { pieces: PICNIC, start: 44 },
  cove: { pieces: COVE, start: 40 },
  bedroom: { pieces: BEDROOM, start: 50 },
};

export const CIRCUITS: Record<CircuitId, CircuitDef> = {
  blocktown: {
    id: 'blocktown',
    name: 'Block Town',
    blurb: 'Wide and flat. Learn to drift under the TOYBOX arch.',
    theme: 'playroom',
    laps: 3,
    raises: [],
    tunnels: [],
    capsules: [112, 321],
    pads: [
      { s: 20, off: 0 },
      { s: 398, off: 2.2 },
    ],
    medals: [48000, 44000, 41500, 40000],
    bounds: 30,
  },
  picnic: {
    id: 'picnic',
    name: 'Picnic Park',
    blurb: 'Fast and flowing. Fly the Watermelon Jump.',
    theme: 'garden',
    laps: 3,
    raises: [
      {
        sides: 'wall',
        style: 'melon',
        segs: [{ s0: 129, s1: 140, h0: 0, h1: 1.3, ease: 'kick' }],
        gap: { s0: 140, s1: 147, floor: 0 },
      },
      {
        sides: 'verge',
        style: 'earth',
        segs: [
          { s0: 288, s1: 313, h0: 0, h1: 2.5, ease: 'smooth' },
          { s0: 313, s1: 338, h0: 2.5, h1: 0, ease: 'smooth' },
        ],
      },
    ],
    tunnels: [],
    capsules: [70, 228],
    pads: [
      { s: 134, off: 0, len: 2 },
      { s: 392, off: -2.2 },
    ],
    medals: [42000, 38500, 36400, 35000],
    bounds: 30,
  },
  cove: {
    id: 'cove',
    name: 'Sandcastle Cove',
    blurb: 'Bouncing beach balls, a plank bridge and a castle gate.',
    theme: 'beach',
    laps: 4,
    raises: [
      {
        sides: 'wall',
        style: 'planks',
        segs: [
          { s0: 134, s1: 142, h0: 0, h1: 1.2, ease: 'smooth' },
          { s0: 142, s1: 154, h0: 1.2, h1: 1.2, ease: 'flat' },
          { s0: 154, s1: 162, h0: 1.2, h1: 0, ease: 'smooth' },
        ],
      },
    ],
    tunnels: [{ s0: 278, s1: 296, roof: 6.5, style: 'castle' }],
    capsules: [14, 78],
    pads: [
      { s: 287, off: 0 },
      { s: 148, off: 0, len: 2 },
    ],
    medals: [35000, 32000, 30300, 29200],
    bounds: 28,
  },
  bedroom: {
    id: 'bedroom',
    name: 'Starlight Bedroom',
    blurb: 'Night falls. Leap the books and mind the cat.',
    theme: 'bedroom',
    laps: 4,
    raises: [
      {
        sides: 'wall',
        style: 'books',
        segs: [
          { s0: 142, s1: 153, h0: 0, h1: 1.8, ease: 'smooth' },
          { s0: 153, s1: 157, h0: 1.8, h1: 1.8, ease: 'flat' },
          { s0: 157, s1: 160, h0: 1.8, h1: 2.2, ease: 'kick' },
          { s0: 167, s1: 175, h0: 1.2, h1: 1.2, ease: 'flat' },
          { s0: 175, s1: 183, h0: 1.2, h1: 0, ease: 'smooth' },
        ],
        gap: { s0: 160, s1: 167, floor: 0 },
      },
    ],
    tunnels: [{ s0: 250, s1: 269, roof: 6.5, style: 'bed' }],
    capsules: [26, 88],
    pads: [
      { s: 155, off: 0, len: 2 },
      { s: 98, off: 2.2 },
    ],
    medals: [34800, 31800, 30100, 29000],
    bounds: 30,
  },
};

export const CUP: CircuitId[] = ['blocktown', 'picnic', 'cove', 'bedroom'];

const lines = new Map<CircuitId, number[]>();

/** The centre line of a designed circuit (flat x,z pairs, metres). */
export function circuitLine(id: CircuitId): number[] {
  let l = lines.get(id);
  if (!l) {
    const p = PIECES[id];
    l = buildCircuit(p.pieces as Parameters<typeof buildCircuit>[0], p.start);
    lines.set(id, l);
  }
  return l;
}

/** Where each piece of a circuit starts and ends along the lap (for set pieces and tests). */
export function pieceSpans(id: CircuitId): { s0: number; s1: number; radius: number; turn: number }[] {
  const { pieces, start } = PIECES[id];
  const { a, b } = closeLengths(pieces);
  const out: { s0: number; s1: number; radius: number; turn: number }[] = [];
  let acc = -start;
  for (const pc of pieces) {
    const len = 'radius' in pc ? (pc.radius * Math.abs(pc.turn) * Math.PI) / 180 : 'straight' in pc ? pc.straight : pc.close === 'a' ? a : b;
    out.push({ s0: acc, s1: acc + len, radius: 'radius' in pc ? pc.radius : 0, turn: 'radius' in pc ? pc.turn : 0 });
    acc += len;
  }
  const total = acc + start;
  return out.map((p) => ({ ...p, s0: ((p.s0 % total) + total) % total, s1: ((p.s1 % total) + total) % total }));
}

/**
 * Which circuit an area's stored track is: room 1's track is Block Town's
 * line, anything else is a sketch from that room's sketchbook.
 */
export function homeCircuit(track: number[]): HomeId {
  return trackId(track) === trackId(circuitLine('blocktown')) ? 'blocktown' : 'sketch';
}

/** The circuits an area offers: its own track first, then the rest of the cup. */
export function areaCircuits(track: number[]): HomeId[] {
  const home = homeCircuit(track);
  return home === 'blocktown' ? [...CUP] : ['sketch', 'picnic', 'cove', 'bedroom'];
}

export function isCircuitId(v: unknown): v is CircuitId {
  return typeof v === 'string' && v in CIRCUITS;
}
