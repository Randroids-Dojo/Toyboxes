import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import adminApi from '../api/admin.js';
import roomApi from '../api/room.js';
import scoresApi from '../api/scores.js';
import { MemoryStore, setStore } from '../server/store.js';
import { MODE_ID, SCORE_MODES, scoreMode } from '../src/shared/score-modes';
import { chartFor } from '../src/shared/neon/charts';
import { LiveDuel, scriptFor } from '../src/shared/neon/duel';
import { perfectLog, scoreDance } from '../src/shared/neon/judge';
import { NIGHTS, scoreNight, type NightLog } from '../src/shared/neon/night';
import { DANCE_BOARD, duelBoard, earliestKo, TAG_SECONDS } from '../src/shared/neon/rules';
import type { TagLog } from '../src/shared/neon/tag';

async function call(handler: any, c: { method?: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string> } = {}) {
  const out: any = { status: 200, body: undefined, headers: {} };
  const res: any = {
    status: (code: number) => ((out.status = code), res),
    json: (b: unknown) => ((out.body = b), res),
    setHeader: (k: string, v: string) => (out.headers[k.toLowerCase()] = v),
    end: () => res,
  };
  await handler({ method: c.method ?? 'GET', query: c.query ?? {}, body: c.body, headers: { 'x-forwarded-for': '10.1.1.9', ...(c.headers ?? {}) } }, res);
  return out;
}

const me = 'browser-neon-00000000000';
let roomId = '';
const AREA = 'neon-party';

beforeEach(async () => {
  setStore(new MemoryStore());
  const claim = await call(roomApi, { method: 'POST', body: { action: 'claim', slot: 10, name: 'Chels', pin: '1234', pinConfirm: '1234', browserId: 'owner-browser-neon-0000' } });
  roomId = claim.body.room.id;
  const H = { 'x-toyboxes-admin': '1' };
  const login = await call(adminApi, { method: 'POST', body: { action: 'login', password: 'toyboxes-dev' }, headers: H });
  const cookie = String(login.headers['set-cookie']).split(';')[0];
  const content = { rev: 0, areas: [{ id: AREA, name: 'Neon space party', theme: { wall: 0, floor: 0, trim: 4 }, props: [], published: true, experience: { kind: 'neon' }, pages: [] }], exhibits: [] };
  expect((await call(adminApi, { method: 'POST', body: { action: 'saveContent', roomId, content }, headers: { ...H, cookie } })).status).toBe(200);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
});

afterEach(() => vi.useRealTimers());

const start = async (mode: string) => (await call(scoresApi, { method: 'POST', body: { action: 'run', roomId, areaId: AREA, browserId: me, mode } })).body.ticket as string;
const send = (mode: string, ticket: string, log: unknown, value = 1) => call(scoresApi, { method: 'POST', body: { action: 'score', roomId, areaId: AREA, browserId: me, name: 'Dancer', mode, value, ticket, log } });
const wait = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

describe('Club Nova boards', () => {
  it('keeps to twelve boards with valid ids, all needing a ticket and a log', () => {
    const modes = SCORE_MODES.neon;
    expect(modes.length).toBeLessThanOrEqual(12);
    expect(modes.map((m) => m.id).sort()).toEqual(['dance-glitter-gravity', 'dance-neon-heart', 'dance-nova-lights', 'dance-supernova', 'duel-brick', 'duel-knight', 'duel-mirage', 'duel-sprocket', 'duel-twinkle', 'night', 'tag']);
    for (const m of modes) {
      expect(m.id).toMatch(MODE_ID);
      expect(m.ticket).toBeTruthy();
      expect(m.fromLog).toBeTruthy();
      expect(m.better).toBe('higher');
    }
  });

  it('scores a dance on the server from its log, whatever value the client posts', async () => {
    const chart = chartFor('lights', 'normal')!;
    const log = perfectLog(chart);
    const real = scoreDance(chart, log.n, log.s)!.score;
    const t = await start('dance-nova-lights');
    wait(chart.seconds * 1000);
    const r = await send('dance-nova-lights', t, log, 1);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ best: real, improved: true, rank: 1 });
  });

  it('refuses a dance posted too soon, a reused ticket, a broken log and the wrong board', async () => {
    const chart = chartFor('lights', 'normal')!;
    const log = perfectLog(chart);
    const t = await start('dance-nova-lights');
    wait(20_000);
    expect((await send('dance-nova-lights', t, log)).body.code).toBe('bad_score');
    const t2 = await start('dance-nova-lights');
    wait(chart.seconds * 1000);
    expect((await send('dance-nova-lights', t2, { n: log.n.slice(1), s: log.s })).status).toBe(400);
    expect((await send('dance-nova-lights', t2, log)).body.code).toBe('bad_ticket');
    const t3 = await start('dance-nova-lights');
    wait(chart.seconds * 1000);
    expect((await send('dance-neon-heart', t3, log)).body.code).toBe('bad_ticket');
  });

  it('scores a duel from its log and needs at least the earliest knockout time', async () => {
    const s = scriptFor('sprocket');
    const j = new LiveDuel(s);
    for (const e of s.judged) {
      if (j.ended) break;
      j.press(e.t);
    }
    const t = await start(duelBoard('sprocket'));
    wait(earliestKo('sprocket') * 600);
    expect((await send(duelBoard('sprocket'), t, j.log())).body.code).toBe('bad_score');
    const t2 = await start(duelBoard('sprocket'));
    wait(earliestKo('sprocket') * 1000);
    expect((await send(duelBoard('sprocket'), t2, j.log())).body).toMatchObject({ best: j.score.score, improved: true });
  });

  it('scores free play laser tag (Normal and Hard only, full length)', async () => {
    const log: TagLog = { diff: 'hard', dur: TAG_SECONDS, ev: [[12, 'tag'], [12, 'beat'], [40, 'tag']], us: 4, them: 2, most: true };
    const t = await start('tag');
    wait(TAG_SECONDS * 1000);
    const r = await send('tag', t, log);
    expect(r.body.best).toBe(Math.round((200 + 50 + 1000 + 300) * 1.25));
    const t2 = await start('tag');
    wait(TAG_SECONDS * 1000);
    expect((await send('tag', t2, { ...log, diff: 'easy' })).status).toBe(400);
    const t3 = await start('tag');
    wait(TAG_SECONDS * 1000);
    expect((await send('tag', t3, { ...log, dur: 60 })).status).toBe(400);
  });

  it('adds up a party night from all three logs with the night multiplier', async () => {
    const def = NIGHTS[1];
    const chart = chartFor(def.dance.song, def.dance.diff)!;
    const dance = perfectLog(chart);
    const duelScript = scriptFor(def.duel);
    const j = new LiveDuel(duelScript);
    for (const e of duelScript.judged) {
      if (j.ended) break;
      if (e.kind === 'feint') j.sweep(e.t + 0.3);
      else {
        j.press(e.t);
        if (e.kind === 'crush') j.release(e.endT);
      }
    }
    const tag: TagLog = { diff: def.tag.diff, dur: def.tag.dur, ev: [[10, 'tag']], us: 3, them: 1, most: true };
    const log: NightLog = { n: def.n, tag, duel: j.log(), dance };
    const s = scoreNight(log)!;
    expect(s.total).toBe(Math.round((s.tag.total + s.duel.score + s.dance.score) * def.mult));
    // The wrong difficulty for this night, or a short tag match, is refused.
    expect(scoreNight({ ...log, tag: { ...tag, diff: 'hard' } })).toBeNull();
    expect(scoreNight({ ...log, tag: { ...tag, dur: 30 } })).toBeNull();
    expect(scoreNight({ ...log, n: 9 })).toBeNull();
    const t = await start('night');
    wait(scoreMode('neon', 'night')!.ticket!.minMs + 1000);
    expect((await send('night', t, log)).body).toMatchObject({ best: s.total, improved: true });
  });

  it('every dance board has its normal chart', () => {
    for (const [song, id] of Object.entries(DANCE_BOARD)) {
      expect(chartFor(song as never, 'normal')).toBeTruthy();
      expect(scoreMode('neon', id!)).toBeTruthy();
    }
  });
});
