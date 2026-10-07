// Your Grand Prix on this device: trophies, medals, personal bests, unlocks,
// kart setup, assists, stats and which tips you have learned. Ghosts live in
// their own keys. Nothing here reaches a shared board.

import type { Ghost } from '../../shared/kart/ghost';
import type { BodyId, ClassId } from '../../shared/kart/rules';
import { IS_TV } from '../../input/input';
import { Progress } from '../kit';
import type { Assists } from './racekart';

export const PAINTS: { id: string; name: string; color: string; how: string }[] = [
  { id: 'tomato', name: 'Tomato', color: '#e8574a', how: 'Ready to go' },
  { id: 'sky', name: 'Sky', color: '#4aa3df', how: 'Ready to go' },
  { id: 'mint', name: 'Mint', color: '#3fb68b', how: 'Ready to go' },
  { id: 'sun', name: 'Sunshine', color: '#ffd24a', how: 'Ready to go' },
  { id: 'gum', name: 'Bubblegum', color: '#ef6fa0', how: 'Finish a cup' },
  { id: 'grape', name: 'Grape', color: '#8a6bd1', how: 'Win a race' },
  { id: 'orange', name: 'Orange', color: '#ff9d2e', how: 'Any bronze medal' },
  { id: 'lime', name: 'Lime', color: '#9ad94a', how: 'Any silver medal' },
  { id: 'night', name: 'Midnight', color: '#2b2560', how: 'Any gold medal' },
  { id: 'chrome', name: 'Chrome', color: '#c9c6d6', how: 'Gold in the Windup cup' },
  { id: 'gold', name: 'Gold', color: '#f5c542', how: 'Gold in the Battery cup' },
  { id: 'rainbow', name: 'Glitter', color: '#ff7ad9', how: 'Gold in the Rocket cup' },
];

export const FLAMES: { id: string; name: string; color: number; color2: number; how: string }[] = [
  { id: 'orange', name: 'Classic', color: 0xffb02e, color2: 0xff5a2a, how: 'Ready to go' },
  { id: 'blue', name: 'Blue', color: 0x6fd8ff, color2: 0x2a6bff, how: 'Gold medal on Block Town' },
  { id: 'green', name: 'Green', color: 0xb6ff8a, color2: 0x2fbf5a, how: 'Gold medal on Picnic Park' },
  { id: 'pink', name: 'Pink', color: 0xff9ad8, color2: 0xff3fa0, how: 'Gold medal on Sandcastle Cove' },
  { id: 'violet', name: 'Violet', color: 0xc8a6ff, color2: 0x7a3fff, how: 'Gold medal on Starlight Bedroom' },
  { id: 'rainbow', name: 'Rainbow', color: 0xffffff, color2: 0xff7ad9, how: 'Champion medals on all four' },
];

export interface SaveData {
  /** Best cup result by class: 1 gold, 2 silver, 3 bronze, 4 finished. */
  cups: Partial<Record<ClassId, number>>;
  /** Best time-trial medal by circuit, 0 to 4. */
  medals: Record<string, number>;
  /** Best lap anywhere, ms, by circuit. */
  bestLap: Record<string, number>;
  /** Best time trial lap (Battery), ms, by circuit. */
  trialLap: Record<string, number>;
  bodies: BodyId[];
  paints: string[];
  flames: string[];
  /** Drivers you have beaten (their horn is yours). */
  beaten: string[];
  kart: { body: BodyId; paint: string; flame: string };
  assists: Assists;
  cls: ClassId;
  items: boolean;
  stats: { races: number; wins: number; podiums: number; drifts: number; turbos: number; items: number; hits: number; metres: number; cups: number; laps: number };
  /** Tips learned: once done, they never show again. */
  learned: { drift: boolean; turbo: boolean; item: boolean; trick: boolean; rocket: boolean };
  warmupDone: boolean;
  /** Who finished nearest you in your last cup. */
  rival: string | null;
}

export function defaults(touch: boolean): SaveData {
  return {
    cups: {},
    medals: {},
    bestLap: {},
    trialLap: {},
    bodies: ['classic'],
    paints: ['tomato', 'sky', 'mint', 'sun'],
    flames: ['orange'],
    beaten: [],
    kart: { body: 'classic', paint: 'tomato', flame: 'orange' },
    assists: { autoGas: touch || IS_TV, easyDrift: false, steerAssist: false, remote: IS_TV },
    cls: 'windup',
    items: true,
    stats: { races: 0, wins: 0, podiums: 0, drifts: 0, turbos: 0, items: 0, hits: 0, metres: 0, cups: 0, laps: 0 },
    learned: { drift: false, turbo: false, item: false, trick: false, rocket: false },
    warmupDone: false,
    rival: null,
  };
}

export class KartSave {
  readonly p: Progress<SaveData>;

  constructor(
    private roomId: string,
    private areaId: string,
    touch: boolean,
  ) {
    this.p = new Progress<SaveData>('kart', roomId, areaId, defaults(touch), 2);
    // Fill anything a newer version added.
    const d = defaults(touch);
    for (const k of Object.keys(d) as (keyof SaveData)[]) if (this.p.data[k] === undefined) (this.p.data as unknown as Record<string, unknown>)[k] = d[k];
    for (const k of Object.keys(d.stats) as (keyof SaveData['stats'])[]) this.p.data.stats[k] ??= 0;
    for (const k of Object.keys(d.learned) as (keyof SaveData['learned'])[]) this.p.data.learned[k] ??= false;
  }

  get d(): SaveData {
    return this.p.data;
  }

  save(): void {
    this.p.save();
  }

  /** Unlocks earned so far that are not yet owned, as names for the unlock cards. */
  grant(kind: 'body' | 'paint' | 'flame', id: string): boolean {
    const list = kind === 'body' ? this.d.bodies : kind === 'paint' ? this.d.paints : this.d.flames;
    if ((list as string[]).includes(id)) return false;
    (list as string[]).push(id);
    this.save();
    return true;
  }

  rocketOpen(): boolean {
    // Any Battery trophy opens the Rocket class.
    const b = this.d.cups.battery;
    return b !== undefined && b <= 3;
  }

  private ghostKey(circuit: string): string {
    return `toyboxes.kart2ghost.${this.roomId}.${this.areaId}.${circuit}`;
  }

  ghost(circuit: string): Ghost | null {
    try {
      const raw = localStorage.getItem(this.ghostKey(circuit));
      return raw ? (JSON.parse(raw) as Ghost) : null;
    } catch {
      return null;
    }
  }

  setGhost(circuit: string, g: Ghost): void {
    try {
      localStorage.setItem(this.ghostKey(circuit), JSON.stringify(g));
    } catch {
      // Storage full: the ghost lasts for this visit.
    }
  }
}
