// Lucky Falls: a pearl drops through 12 rows of pegs into one of 13 bins.
// The server picks the 12 bounces (left or right); the bin is how many went
// right. Three risk levels share the board. Named plinko only in code; the
// game calls it Lucky Falls. Shared by the server and the client.

export const FALLS_ROWS = 12;
export type FallsRisk = 'calm' | 'lively' | 'wild';
export const FALLS_RISKS: FallsRisk[] = ['calm', 'lively', 'wild'];

export const FALLS_LABEL: Record<FallsRisk, string> = { calm: 'Calm', lively: 'Lively', wild: 'Wild' };

/** Multipliers of the bet for bins 0 to 12, edges first. */
export const FALLS_BINS: Record<FallsRisk, number[]> = {
  calm: mirror([6, 2, 1.5, 1.2, 1.1, 1, 0.5]),
  lively: mirror([22, 7, 3, 1.6, 1.1, 0.7, 0.4]),
  wild: mirror([110, 25, 7, 2, 0.6, 0.3, 0.2]),
};

function mirror(half: number[]): number[] {
  return [...half, ...half.slice(0, -1).reverse()];
}

/** Most pearls in the air at once. */
export const FALLS_MAX_PEARLS = 5;

/** The bin for 12 bounces, each 0 (left) or 1 (right). */
export function fallsBin(bits: number[]): number {
  return bits.reduce((n, b) => n + (b ? 1 : 0), 0);
}

/** Credits back for a pearl: rounded down to whole credits. */
export function fallsWin(risk: FallsRisk, bin: number, bet: number): number {
  return Math.floor(FALLS_BINS[risk][bin] * bet + 1e-9);
}

/** Exact return of each risk at a bet of 1 (no rounding), for tests and the odds sheet. */
export function fallsExpected(risk: FallsRisk): number {
  let total = 0;
  let c = 1;
  for (let k = 0; k <= FALLS_ROWS; k++) {
    total += c * FALLS_BINS[risk][k];
    c = (c * (FALLS_ROWS - k)) / (k + 1);
  }
  return total / 2 ** FALLS_ROWS;
}

/** Chance of landing in each bin. */
export function fallsChances(): number[] {
  const out: number[] = [];
  let c = 1;
  for (let k = 0; k <= FALLS_ROWS; k++) {
    out.push(c / 2 ** FALLS_ROWS);
    c = (c * (FALLS_ROWS - k)) / (k + 1);
  }
  return out;
}
