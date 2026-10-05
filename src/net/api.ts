// Typed calls to the Toyboxes API. Results are explicit so callers can show
// honest saving, retry and conflict states.

import type { Page, PropPlacement, RoomPublic, RoomTheme, SlotSummary, Stroke } from '../shared/model';
import type { CasinoStats, SlotSymbol } from '../shared/slots';

export interface BoardRow {
  name: string;
  value: number;
  you: boolean;
}

export type ScoreBoard = { kind: 'kart'; board: BoardRow[]; best: number | null } | { kind: 'casino'; board: BoardRow[]; stats: CasinoStats } | { kind: 'galaxy'; board: BoardRow[]; best: number | null };

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; error: string; extra: Record<string, unknown> };

async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Result<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      credentials: 'same-origin',
    });
    let json: Record<string, unknown> = {};
    try {
      json = await res.json();
    } catch {
      // Non-JSON error page.
    }
    if (res.ok) return { ok: true, data: json as T };
    const { error, code, ...extra } = json;
    return { ok: false, status: res.status, code: String(code ?? 'error'), error: String(error ?? `Request failed (${res.status})`), extra };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return { ok: false, status: 0, code: 'offline', error: aborted ? 'The connection timed out' : 'No connection right now', extra: {} };
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  world: () => call<{ slots: SlotSummary[]; now: number }>('GET', '/api/world'),
  room: (id: string) => call<{ room: RoomPublic }>('GET', `/api/room?id=${encodeURIComponent(id)}`),
  claim: (slot: number, name: string, pin: string, pinConfirm: string, browserId: string) =>
    call<{ room: RoomPublic; token: string; expiresAt: number }>('POST', '/api/room', { action: 'claim', slot, name, pin, pinConfirm, browserId }),
  unlock: (roomId: string, pin: string) => call<{ token: string; expiresAt: number }>('POST', '/api/room', { action: 'unlock', roomId, pin }),
  saveLayout: (roomId: string, token: string, layout: PropPlacement[], theme: RoomTheme, rev: number) =>
    call<{ room: RoomPublic }>('POST', '/api/room', { action: 'layout', roomId, layout, theme, rev }, { 'x-room-token': token }),
  rename: (roomId: string, pin: string, name: string) => call<{ room: RoomPublic; changed: string[] }>('POST', '/api/room', { action: 'rename', roomId, pin, name }),
  pages: (roomId: string) => call<{ pages: Page[] }>('GET', `/api/pages?roomId=${encodeURIComponent(roomId)}`),
  createPage: (roomId: string, token: string, text: string, sketch: Stroke[]) => call<{ page: Page }>('POST', '/api/pages', { roomId, text, sketch }, { 'x-room-token': token }),
  updatePage: (roomId: string, token: string, pageId: string, text: string, sketch: Stroke[], rev: number) =>
    call<{ page: Page }>('PUT', '/api/pages', { roomId, pageId, text, sketch, rev }, { 'x-room-token': token }),
  scores: (roomId: string, areaId: string, browserId: string) =>
    call<ScoreBoard>('GET', `/api/scores?roomId=${encodeURIComponent(roomId)}&areaId=${encodeURIComponent(areaId)}`, undefined, { 'x-browser-id': browserId }),
  lap: (roomId: string, areaId: string, browserId: string, name: string, ms: number) =>
    call<{ best: number; improved: boolean }>('POST', '/api/scores', { action: 'lap', roomId, areaId, browserId, name, ms }),
  spin: (roomId: string, areaId: string, browserId: string, name: string, bet: number) =>
    call<{ stops: number[]; line: SlotSymbol[]; rule: string | null; win: number; stats: CasinoStats }>('POST', '/api/scores', { action: 'spin', roomId, areaId, browserId, name, bet }),
  refill: (roomId: string, areaId: string, browserId: string, name: string) => call<{ stats: CasinoStats }>('POST', '/api/scores', { action: 'refill', roomId, areaId, browserId, name }),
  frenzy: (roomId: string, areaId: string, browserId: string, name: string, score: number) =>
    call<{ best: number; improved: boolean }>('POST', '/api/scores', { action: 'frenzy', roomId, areaId, browserId, name, score }),
  scoreName: (browserId: string, name: string) => call<{ ok: true }>('POST', '/api/scores', { action: 'name', browserId, name }),
};

export function retryText(r: { extra: Record<string, unknown> }): string {
  const s = Number(r.extra.retryAfter);
  if (!s) return '';
  if (s < 90) return ` Try again in ${s} seconds.`;
  return ` Try again in ${Math.ceil(s / 60)} minutes.`;
}
