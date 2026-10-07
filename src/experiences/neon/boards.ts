// Shared boards for Club Nova through the generic world boards: run tickets
// at the start of a run, the run log at the end (the server scores it with
// the same shared code), and reading boards for the Glow Lab wall and the
// results cards. Offline runs still play; they just stay on this device.

import { api, type BoardRow } from '../../net/api';
import type { ExperienceCtx } from '../common';

export interface Posted {
  ok: boolean;
  rank: number | null;
  best: number | null;
  improved: boolean;
  error?: string;
}

export class Boards {
  private cache = new Map<string, { rows: BoardRow[]; best: number | null; at: number }>();
  last: { mode: string; posted: Posted } | null = null;

  constructor(private ctx: ExperienceCtx) {}

  /** Starts a run; null when offline (the run still plays, locally). */
  async start(mode: string): Promise<string | null> {
    const r = await api.runStart(this.ctx.roomId, this.ctx.area.id, this.ctx.browserId, mode);
    return r.ok ? r.data.ticket : null;
  }

  async submit(mode: string, value: number, log: unknown, ticket: string | null): Promise<Posted> {
    if (!ticket) return { ok: false, rank: null, best: null, improved: false, error: 'offline' };
    const r = await api.score(this.ctx.roomId, this.ctx.area.id, this.ctx.browserId, this.ctx.name(), mode, value, { ticket, log });
    const posted: Posted = r.ok ? { ok: true, rank: r.data.rank, best: r.data.best, improved: r.data.improved } : { ok: false, rank: null, best: null, improved: false, error: r.error };
    this.last = { mode, posted };
    this.cache.delete(mode);
    return posted;
  }

  /** Reads up to 12 boards at once (cached for a minute). */
  async fetch(modes: string[], fresh = false): Promise<Record<string, { rows: BoardRow[]; best: number | null }>> {
    const now = Date.now();
    const need = modes.filter((m) => fresh || !this.cache.has(m) || now - this.cache.get(m)!.at > 60000);
    if (need.length) {
      const r = await api.modeBoards(this.ctx.roomId, this.ctx.area.id, need.slice(0, 12), this.ctx.browserId);
      if (r.ok) for (const [m, b] of Object.entries(r.data.boards)) this.cache.set(m, { rows: b.board, best: b.best, at: now });
    }
    const out: Record<string, { rows: BoardRow[]; best: number | null }> = {};
    for (const m of modes) {
      const c = this.cache.get(m);
      if (c) out[m] = { rows: c.rows, best: c.best };
    }
    return out;
  }
}

/** The line under a results card about the board. */
export function boardLine(p: Posted | null, local: boolean): string {
  if (local) return 'Wide timing runs stay on this device.';
  if (!p) return 'Saving your score...';
  if (p.ok) return p.rank ? `On the board: ${ordinalOf(p.rank)}` : p.improved ? 'New best on the board!' : 'Your board best still stands.';
  return "Couldn't reach the board. Your best is saved on this device.";
}

function ordinalOf(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
