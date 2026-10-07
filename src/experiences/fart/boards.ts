// Shared boards in the village: fetches every trial's board, paints the
// billboards by each start pad, and posts results (with run tickets).

import { api, type BoardRow } from '../../net/api';
import { formatLap, type ExperienceCtx } from '../common';
import type { Village } from './village';
import { setBoard } from './village';

export type ModeId = 'rings' | 'library' | 'band-march' | 'band-polka' | 'picnic';
export const MODES: ModeId[] = ['rings', 'library', 'band-march', 'band-polka', 'picnic'];

const TITLES: Record<ModeId, { title: string; accent: string; board: 'rings' | 'band' | 'library' | 'picnic' | null }> = {
  rings: { title: 'Fastest rally', accent: '#ffd24a', board: 'rings' },
  library: { title: 'Quietest librarians', accent: '#b79cf0', board: 'library' },
  'band-march': { title: 'Top tooters', accent: '#ff8f6b', board: 'band' },
  'band-polka': { title: 'Polka Dots', accent: '#ff8f6b', board: null },
  picnic: { title: 'Fastest picnic', accent: '#b7e36a', board: 'picnic' },
};

export function formatValue(mode: ModeId, v: number): string {
  return mode === 'rings' || mode === 'picnic' ? formatLap(v) : v.toLocaleString('en-US');
}

export class Boards {
  data: Partial<Record<ModeId, { board: BoardRow[]; best: number | null }>> = {};
  private alive = true;
  private retries = 0;

  constructor(
    private ctx: ExperienceCtx,
    private village: Village,
  ) {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const r = await api.modeBoards(this.ctx.roomId, this.ctx.area.id, MODES, this.ctx.browserId);
    if (!this.alive) return;
    if (!r.ok) {
      for (const m of MODES) this.paint(m, 'Board offline');
      return;
    }
    if (!r.data?.boards) {
      // An empty reply (the server was busy): keep what we have and try again shortly.
      if (this.retries++ < 3) setTimeout(() => void this.refresh(), 2000);
      return;
    }
    this.data = r.data.boards as typeof this.data;
    for (const m of MODES) this.paint(m);
  }

  private paint(mode: ModeId, footer?: string): void {
    const t = TITLES[mode];
    if (!t.board) return;
    const d = this.data[mode];
    const rows = (d?.board ?? []).map((r) => ({ name: r.name, value: formatValue(mode, r.value), you: r.you }));
    setBoard(this.village.boards[t.board], t.title, rows, footer ?? (d?.best !== null && d?.best !== undefined ? `Your best ${formatValue(mode, d.best)}` : 'Play to get on the board'), t.accent);
  }

  /** Starts a run ticket; null when the server cannot be reached. */
  async ticket(mode: ModeId): Promise<string | null> {
    const r = await api.runStart(this.ctx.roomId, this.ctx.area.id, this.ctx.browserId, mode);
    return r.ok ? r.data.ticket : null;
  }

  /** Posts a result; resolves with the board rows for the results card, or an error line. */
  async post(mode: ModeId, value: number, ticket: string | null, log?: unknown): Promise<{ rows: { name: string; value: string; you?: boolean }[]; rank: number | null; error: string | null; improved: boolean }> {
    if (!ticket) return { rows: this.rows(mode), rank: null, error: 'Board offline. Your best is saved on this device.', improved: false };
    const r = await api.score(this.ctx.roomId, this.ctx.area.id, this.ctx.browserId, this.ctx.name(), mode, value, { ticket, log });
    if (!r.ok) return { rows: this.rows(mode), rank: null, error: r.error, improved: false };
    await this.refresh();
    return { rows: this.rows(mode), rank: r.data.rank, error: null, improved: r.data.improved };
  }

  rows(mode: ModeId): { name: string; value: string; you?: boolean }[] {
    return (this.data[mode]?.board ?? []).slice(0, 8).map((r) => ({ name: r.name, value: formatValue(mode, r.value), you: r.you }));
  }

  dispose(): void {
    this.alive = false;
  }
}
