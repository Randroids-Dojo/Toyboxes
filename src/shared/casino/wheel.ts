// The River Wheel: a big money wheel on the stern deck. 51 segments, six
// symbols; every symbol returns exactly 48/51 of what is bet on it. Shared by
// the server (which picks the segment) and the client (which paints the
// wheel and spins it there). No DOM or Node imports.

export type WheelSymbol = 'anchor' | 'rope' | 'lantern' | 'compass' | 'helm' | 'star';

export interface WheelSymbolInfo {
  id: WheelSymbol;
  label: string;
  /** How many of the 51 segments show it. */
  count: number;
  /** Paid "to 1": a win returns the bet plus this many times it. */
  pays: number;
  color: string;
}

export const WHEEL_SYMBOLS: WheelSymbolInfo[] = [
  { id: 'anchor', label: 'Anchor', count: 24, pays: 1, color: '#2b6f9e' },
  { id: 'rope', label: 'Rope', count: 12, pays: 3, color: '#c9973a' },
  { id: 'lantern', label: 'Lantern', count: 8, pays: 5, color: '#d8574a' },
  { id: 'compass', label: 'Compass', count: 4, pays: 11, color: '#2f8f6a' },
  { id: 'helm', label: 'Helm', count: 2, pays: 23, color: '#7a4fb0' },
  { id: 'star', label: 'Star', count: 1, pays: 47, color: '#f2c14e' },
];

export const WHEEL_INFO: Record<WheelSymbol, WheelSymbolInfo> = Object.fromEntries(WHEEL_SYMBOLS.map((s) => [s.id, s])) as Record<WheelSymbol, WheelSymbolInfo>;

/** Most symbols with chips on them in one spin. */
export const WHEEL_MAX_BETS = 6;

/**
 * The 51 segments clockwise from the pointer at rest. The Star sits at the
 * top, the Helms opposite each other, and the rest spread so no two rare
 * symbols touch: each symbol is placed at evenly spaced slots, rarest first,
 * taking the nearest free slot.
 */
export const WHEEL_SEGMENTS: WheelSymbol[] = (() => {
  const n = 51;
  const out: (WheelSymbol | null)[] = new Array(n).fill(null);
  const order = [...WHEEL_SYMBOLS].sort((a, b) => a.count - b.count);
  for (const s of order) {
    for (let k = 0; k < s.count; k++) {
      let want = Math.round((k * n) / s.count + (s.id === 'star' ? 0 : n / (2 * s.count))) % n;
      while (out[want] !== null) want = (want + 1) % n;
      out[want] = s.id;
    }
  }
  return out as WheelSymbol[];
})();

/** Credits back for a bet of `amount` on `symbol` when `segment` lands (stake included, 0 when lost). */
export function wheelReturn(symbol: WheelSymbol, amount: number, segment: number): number {
  return WHEEL_SEGMENTS[segment] === symbol ? amount * (WHEEL_INFO[symbol].pays + 1) : 0;
}

/** Exact return of a bet on each symbol, for tests and the odds sheet. */
export function wheelExpected(): Record<WheelSymbol, number> {
  const out = {} as Record<WheelSymbol, number>;
  for (const s of WHEEL_SYMBOLS) out[s.id] = WHEEL_SEGMENTS.filter((x) => x === s.id).length * (s.pays + 1) / WHEEL_SEGMENTS.length;
  return out;
}
