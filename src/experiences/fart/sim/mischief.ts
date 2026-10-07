// The fete programme's mischief list: fifteen jobs, each worth a golden bean.
// Fed by the world's event stream; each item fires exactly once.

export interface MischiefItem {
  id: string;
  text: string;
  hint: string;
}

export const MISCHIEF: MischiefItem[] = [
  { id: 'tea', text: "Spill someone's tea", hint: 'Lady Featherstone is queueing at the bean stall.' },
  { id: 'tins', text: 'Topple the tower of tins', hint: 'Fifteen bean tins by Gran. One good toot at the base.' },
  { id: 'hat', text: "Pop the Mayor's hat off", hint: 'A beans toot right next to the Mayor.' },
  { id: 'pigeons', text: 'Scatter ten pigeons with one toot', hint: 'The flock pecks round the fountain.' },
  { id: 'fountain', text: 'Make the fountain bubble', hint: 'Hop into the fountain and toot.' },
  { id: 'pip', text: 'Do all three toots for Pip', hint: 'Beans, fizzy pop and cabbage, near Pip.' },
  { id: 'laundry', text: 'Blow the washing off the line', hint: 'The line between the tall houses, 7 m up.' },
  { id: 'bell', text: 'Ring the bell', hint: 'Climb the bell tower and toot at the bell.' },
  { id: 'balloon', text: 'Bounce on top of the balloon', hint: 'Glide from the tower and land on the crown.' },
  { id: 'biscuit', text: 'Get Biscuit the blame', hint: 'Toot near the pug where no one can see you.' },
  { id: 'mayor', text: 'Make someone blame the Mayor', hint: 'Leave a cloud by the Mayor and walk away.' },
  { id: 'teagarden', text: 'Clear the tea garden with a stink', hint: 'Cabbage clouds drift on the breeze.' },
  { id: 'band', text: 'Toot along with the band', hint: 'Four toots in a row on the beat, by the bandstand.' },
  { id: 'gnomes', text: 'Knock over all eight gnomes', hint: 'Gardens, and two on the rooftops.' },
  { id: 'escape', text: 'Escape from Constable Bobbins', hint: 'Cause three fusses near him, then get away.' },
];

export type MischiefEvent =
  | { kind: 'cup' }
  | { kind: 'tins'; down: number }
  | { kind: 'hat' }
  | { kind: 'pigeons'; n: number }
  | { kind: 'fountain' }
  | { kind: 'pip'; gas: string }
  | { kind: 'laundry' }
  | { kind: 'bell' }
  | { kind: 'balloon' }
  | { kind: 'blame'; target: string }
  | { kind: 'fled'; id: string; t: number }
  | { kind: 'beat'; offset: number; t: number }
  | { kind: 'gnomes'; down: number }
  | { kind: 'escaped' };

export const TEA_GARDEN = ['primrose', 'wimble'];
/** A toot is on the beat within this many beats. */
export const BEAT_WINDOW = 0.16;

export class Mischief {
  readonly done = new Set<string>();
  private pipGas = new Set<string>();
  private fledAt = new Map<string, number>();
  private streak: number[] = [];

  constructor(done: string[] = []) {
    for (const d of done) this.done.add(d);
  }

  /** Feeds an event. Returns the id of an item it completed, or null. */
  on(e: MischiefEvent): string | null {
    const hit = this.check(e);
    if (!hit || this.done.has(hit)) return null;
    this.done.add(hit);
    return hit;
  }

  private check(e: MischiefEvent): string | null {
    switch (e.kind) {
      case 'cup':
        return 'tea';
      case 'tins':
        return e.down >= 12 ? 'tins' : null;
      case 'hat':
        return 'hat';
      case 'pigeons':
        return e.n >= 10 ? 'pigeons' : null;
      case 'fountain':
        return 'fountain';
      case 'pip':
        this.pipGas.add(e.gas);
        return this.pipGas.has('beans') && this.pipGas.has('fizzy') && this.pipGas.has('cabbage') ? 'pip' : null;
      case 'laundry':
        return 'laundry';
      case 'bell':
        return 'bell';
      case 'balloon':
        return 'balloon';
      case 'blame':
        return e.target === 'biscuit' ? 'biscuit' : e.target === 'mayor' ? 'mayor' : null;
      case 'fled':
        // Both tea garden sitters chased off within half a minute.
        if (!TEA_GARDEN.includes(e.id)) return null;
        this.fledAt.set(e.id, e.t);
        return TEA_GARDEN.every((id) => this.fledAt.has(id) && e.t - this.fledAt.get(id)! < 30) ? 'teagarden' : null;
      case 'beat':
        // Four toots in a row, each on the beat, no more than two beats apart.
        if (Math.abs(e.offset) > BEAT_WINDOW) {
          this.streak = [];
          return null;
        }
        if (this.streak.length && e.t - this.streak[this.streak.length - 1] > 2.6) this.streak = [];
        this.streak.push(e.t);
        return this.streak.length >= 4 ? 'band' : null;
      case 'gnomes':
        return e.down >= 8 ? 'gnomes' : null;
      case 'escaped':
        return 'escape';
    }
  }

  get pipCount(): number {
    return this.pipGas.size;
  }

  get bandStreak(): number {
    return this.streak.length;
  }

  /** The next item to suggest. */
  next(): MischiefItem | null {
    return MISCHIEF.find((m) => !this.done.has(m.id)) ?? null;
  }
}
