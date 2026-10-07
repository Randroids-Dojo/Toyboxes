// The casino's client state: your record, rank, boards, the GRAND and the
// open hands, kept in step with server/casino.ts. Every play goes to the
// server; the bet leaves your credits on screen at once, and the server's
// numbers replace it when the reveal ends.

import type { BjRoundView } from '../../shared/casino/blackjack';
import type { PokerHandRank } from '../../shared/casino/poker';
import { rankOf } from '../../shared/casino/progress';
import { localDay } from '../../shared/casino/stats';
import type { Card } from '../../shared/casino-games';
import type { CasinoStats } from '../../shared/slots';

export interface BoardRow {
  name: string;
  value: number;
  you: boolean;
}

export interface FameEntry {
  name: string;
  jackpot: 'MAJOR' | 'GRAND';
  mult: number;
  credits: number;
  at: number;
}

export interface PokerView {
  phase: 'idle' | 'deal' | 'done';
  hand: Card[];
  bet: number;
  holds: boolean[];
  rank: PokerHandRank | null;
  win: number;
}

export interface Summary {
  stats: CasinoStats;
  rank: number;
  boards: { balance: BoardRow[]; wins: BoardRow[]; stamps: BoardRow[]; captains: BoardRow[] };
  fame: FameEntry[];
  jackpots: { grand: number; spins: number };
  blackjack: BjRoundView;
  captain: BjRoundView;
  poker: PokerView;
}

/** What every play answers with, besides its own result. */
export interface PlayResult {
  stats: CasinoStats;
  newStamps: string[];
  rank: number;
  rankUp: boolean;
}

export type Answer<T> = { ok: true; data: T & PlayResult } | { ok: false; status: number; code: string; error: string };

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ ok: true; data: T } | { ok: false; status: number; code: string; error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal, credentials: 'same-origin' });
    let json: Record<string, unknown> | null = null;
    try {
      json = await res.json();
    } catch {
      // Not JSON: an error page or a cut-off answer.
    }
    if (res.ok && json) return { ok: true, data: json as T };
    if (!json) return { ok: false, status: res.status, code: 'bad_response', error: "Couldn't reach the boat" };
    return { ok: false, status: res.status, code: String(json.code ?? 'error'), error: String(json.error ?? `Request failed (${res.status})`) };
  } catch {
    return { ok: false, status: 0, code: 'offline', error: "Couldn't reach the boat" };
  } finally {
    clearTimeout(timer);
  }
}

function voyageId(): string {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

export interface EconomyHost {
  roomId: string;
  areaId: string;
  browserId: string;
  name(): string;
}

export class Economy {
  stats: CasinoStats | null = null;
  rank = 0;
  boards: Summary['boards'] = { balance: [], wins: [], stamps: [], captains: [] };
  fame: FameEntry[] = [];
  jackpots = { grand: 250, spins: 0 };
  hands: Pick<Summary, 'blackjack' | 'captain' | 'poker'> | null = null;
  readonly voyage = voyageId();
  /** Credits on the table that the server has not answered for yet. */
  private pending = 0;
  private listeners: (() => void)[] = [];
  /** Called when plays earn stamps (after the reveal) and on a rank up. */
  onStamps: ((ids: string[], rankUp: boolean, rank: number) => void) | null = null;
  loadedAt = 0;
  /** Balance when this visit's first numbers arrived, for the voyage net. */
  openedWith: number | null = null;

  constructor(private host: EconomyHost) {}

  /** What the HUD shows: your balance minus anything on the table. */
  get shown(): number {
    return (this.stats?.balance ?? 0) - this.pending;
  }

  get voyageNet(): number {
    return this.openedWith === null || !this.stats ? 0 : this.stats.balance - this.openedWith;
  }

  onChange(f: () => void): () => void {
    this.listeners.push(f);
    return () => (this.listeners = this.listeners.filter((x) => x !== f));
  }

  private changed(): void {
    for (const f of this.listeners) f();
  }

  async load(): Promise<boolean> {
    const r = await call<Summary>('GET', `/api/casino?roomId=${encodeURIComponent(this.host.roomId)}&areaId=${encodeURIComponent(this.host.areaId)}`, undefined, { 'x-browser-id': this.host.browserId });
    if (!r.ok) return false;
    if (!r.data?.stats) return false;
    this.loadedAt = performance.now();
    // Keep our own record while a play is on the table; the server's answer will bring it.
    if (!this.pending) this.stats = r.data.stats;
    this.rank = r.data.rank;
    this.boards = r.data.boards;
    this.fame = r.data.fame;
    this.jackpots = r.data.jackpots;
    this.hands = { blackjack: r.data.blackjack, captain: r.data.captain, poker: r.data.poker };
    if (this.openedWith === null) this.openedWith = r.data.stats.balance;
    this.changed();
    return true;
  }

  /** Shows `amount` leaving your credits now, before the server answers. */
  hold(amount: number): void {
    this.pending += amount;
    this.changed();
  }

  release(amount: number): void {
    this.pending = Math.max(0, this.pending - amount);
    this.changed();
  }

  /** Sends a play. The caller animates, then calls `commit` with the answer. */
  async play<T>(action: string, body: Record<string, unknown>): Promise<Answer<T>> {
    return call<T & PlayResult>('POST', '/api/casino', { action, roomId: this.host.roomId, areaId: this.host.areaId, browserId: this.host.browserId, name: this.host.name(), voyage: this.voyage, day: localDay(), ...body });
  }

  /** Takes the server's numbers once the reveal is over, and hands on any stamps. */
  commit(r: PlayResult & { jackpots?: { grand: number; spins: number } }, released = 0): void {
    this.release(released);
    this.stats = r.stats;
    this.rank = r.rank ?? rankOf(r.stats);
    if (r.jackpots) this.jackpots = r.jackpots;
    if (this.openedWith === null) this.openedWith = r.stats.balance;
    this.changed();
    if (r.newStamps?.length || r.rankUp) this.onStamps?.(r.newStamps ?? [], !!r.rankUp, this.rank);
  }

  async refill(): Promise<{ ok: boolean; error?: string }> {
    const r = await this.play<{ stats: CasinoStats }>('refill', {});
    if (!r.ok) return { ok: false, error: r.error };
    this.stats = r.data.stats;
    this.changed();
    return { ok: true };
  }
}
