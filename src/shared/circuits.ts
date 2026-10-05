// Designed kart circuits, for when a drawing does not race well. A circuit
// is a run of straights and arcs; two marked straights stretch to close
// the loop exactly, so every corner keeps the radius it was given.

type Piece = { straight: number } | { radius: number; turn: number } | { close: 'a' | 'b' };
type P = [number, number];

const STEP = 1.5;

function trace(pieces: Piece[], a: number, b: number): P[] {
  const pts: P[] = [[0, 0]];
  let x = 0;
  let y = 0;
  let hd = 0;
  for (const pc of pieces) {
    if ('radius' in pc) {
      const ang = (pc.turn * Math.PI) / 180;
      const n = Math.max(2, Math.round((Math.abs(ang) * pc.radius) / STEP));
      const sg = Math.sign(ang);
      const cx = x - Math.sin(hd) * pc.radius * sg;
      const cy = y + Math.cos(hd) * pc.radius * sg;
      const a0 = Math.atan2(y - cy, x - cx);
      for (let i = 1; i <= n; i++) {
        const t = a0 + (ang * i) / n;
        x = cx + Math.cos(t) * pc.radius;
        y = cy + Math.sin(t) * pc.radius;
        pts.push([x, y]);
      }
      hd += ang;
    } else {
      const len = 'straight' in pc ? pc.straight : pc.close === 'a' ? a : b;
      const n = Math.max(1, Math.round(len / STEP));
      for (let i = 0; i < n; i++) {
        x += (Math.cos(hd) * len) / n;
        y += (Math.sin(hd) * len) / n;
        pts.push([x, y]);
      }
    }
  }
  return pts;
}

/**
 * Flat x,z centre line for a circuit, centred on the origin. `start` is how
 * far into the first straight the start line sits, so the grid behind it is
 * on the straight too.
 */
export function buildCircuit(pieces: Piece[], start: number): number[] {
  // The end point moves linearly with the two closing lengths: solve for a closed loop.
  const end = (a: number, b: number) => trace(pieces, a, b).pop()!;
  const e0 = end(0, 0);
  const ea = end(1, 0);
  const eb = end(0, 1);
  const A = [ea[0] - e0[0], ea[1] - e0[1]];
  const B = [eb[0] - e0[0], eb[1] - e0[1]];
  const det = A[0] * B[1] - A[1] * B[0];
  const a = (-e0[0] * B[1] + e0[1] * B[0]) / det;
  const b = (-A[0] * e0[1] + A[1] * e0[0]) / det;
  if (!(a > 0 && b > 0)) throw new Error('Circuit does not close');
  const pts = trace(pieces, a, b);
  pts.pop();
  const k = Math.round(start / STEP) % pts.length;
  const loop = pts.slice(k).concat(pts.slice(0, k));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of loop) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const out: number[] = [];
  for (const [x, y] of loop) out.push(Math.round((x - cx) * 100) / 100, Math.round((y - cy) * 100) / 100);
  return out;
}

/**
 * The Toybox Grand Prix: a long main straight for slipstreaming, a tight
 * first corner, a fast kink, esses, a hairpin, a long sweeper onto the back
 * straight and two corners home. About 560 metres.
 */
export const GRAND_PRIX: Piece[] = [
  { close: 'a' },
  { radius: 16, turn: 90 },
  { straight: 26 },
  { radius: 34, turn: 45 },
  { straight: 18 },
  { radius: 20, turn: -60 },
  { radius: 18, turn: 120 },
  { radius: 20, turn: -60 },
  { straight: 16 },
  { radius: 13, turn: 180 },
  { straight: 20 },
  { radius: 22, turn: -135 },
  { straight: 36 },
  { radius: 24, turn: 90 },
  { close: 'b' },
  { radius: 18, turn: 90 },
];

export function grandPrixTrack(): number[] {
  return buildCircuit(GRAND_PRIX, 48);
}
