// Kart lap boards and casino credits for experience areas.
//
// GET  /api/scores?roomId=<id>&areaId=<id>   (x-browser-id optional) -> board and your record
// POST /api/scores {action:'lap', roomId, areaId, browserId, name, ms}
// POST /api/scores {action:'spin', roomId, areaId, browserId, name, bet}
// POST /api/scores {action:'refill', roomId, areaId, browserId, name}
// POST /api/scores {action:'frenzy', roomId, areaId, browserId, name, score}
// POST /api/scores {action:'roulette', roomId, areaId, browserId, name, bet, pick:{type, number?}}
// POST /api/scores {action:'blackjack', roomId, areaId, browserId, name, move:'deal'|'hit'|'stand'|'double', bet?}
// POST /api/scores {action:'name', browserId, name}
// POST /api/scores {action:'run', roomId, areaId, browserId, mode}                   -> {ticket} for boards that need one
// POST /api/scores {action:'score', roomId, areaId, browserId, name, mode, value, ticket?, log?}   (world boards, src/shared/score-modes.ts)
// GET  /api/scores?roomId=<id>&areaId=<id>&modes=a,b,c                               -> {kind:'modes', boards}

import { z } from 'zod';
import { clientIp, header, limit, parseBody, parseQuery, route } from '../server/http.js';
import { blackjack, board, modeBoards, recordFrenzy, recordLap, recordScore, refill, renameScores, roulette, spin, startRun } from '../server/scores.js';
import { MODE_ID } from '../src/shared/score-modes.js';
import * as s from '../server/schemas.js';

const areaId = z.string().regex(/^[a-zA-Z0-9_-]{1,24}$/);

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('lap'), roomId: s.roomId, areaId, browserId: s.browserId, name: s.name, ms: z.number().int().min(1).max(3_600_000) }),
  z.object({ action: z.literal('spin'), roomId: s.roomId, areaId, browserId: s.browserId, name: s.name, bet: z.number().int() }),
  z.object({ action: z.literal('refill'), roomId: s.roomId, areaId, browserId: s.browserId, name: s.name }),
  z.object({ action: z.literal('frenzy'), roomId: s.roomId, areaId, browserId: s.browserId, name: s.name, score: z.number().int() }),
  z.object({ action: z.literal('name'), browserId: s.browserId, name: s.name }),
  z.object({
    action: z.literal('score'),
    roomId: s.roomId,
    areaId,
    browserId: s.browserId,
    name: s.name,
    mode: z.string().regex(MODE_ID),
    value: z.number().int().min(-1_000_000_000).max(1_000_000_000),
    ticket: z.string().regex(/^[A-Za-z0-9_-]{10,40}$/).optional(),
    log: z.unknown().optional(),
  }),
  z.object({ action: z.literal('run'), roomId: s.roomId, areaId, browserId: s.browserId, mode: z.string().regex(MODE_ID) }),
  z.object({
    action: z.literal('roulette'),
    roomId: s.roomId,
    areaId,
    browserId: s.browserId,
    name: s.name,
    bet: z.number().int(),
    pick: z.object({ type: z.enum(['red', 'black', 'odd', 'even', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'number']), number: z.number().int().min(0).max(36).optional() }),
  }),
  z.object({ action: z.literal('blackjack'), roomId: s.roomId, areaId, browserId: s.browserId, name: s.name, move: z.enum(['deal', 'hit', 'stand', 'double']), bet: z.number().int().optional() }),
]);

export default route({
  GET: async (req) => {
    const q = parseQuery(req, z.object({ roomId: s.roomId, areaId, modes: z.string().max(400).optional() }));
    const id = header(req, 'x-browser-id');
    const who = id && s.browserId.safeParse(id).success ? id : undefined;
    if (q.modes !== undefined) {
      const modes = q.modes.split(',').filter((m) => MODE_ID.test(m));
      return modeBoards(q.roomId, q.areaId, modes, who);
    }
    return board(q.roomId, q.areaId, who);
  },
  POST: async (req) => {
    const b = parseBody(req, body);
    await limit(`scores-ip:${clientIp(req)}`, 400, 60, 'Slow down a little');
    switch (b.action) {
      case 'lap':
        return recordLap(b.roomId, b.areaId, b.browserId, b.name, b.ms);
      case 'spin':
        return spin(b.roomId, b.areaId, b.browserId, b.name, b.bet);
      case 'refill':
        return refill(b.roomId, b.areaId, b.browserId, b.name);
      case 'frenzy':
        return recordFrenzy(b.roomId, b.areaId, b.browserId, b.name, b.score);
      case 'name':
        return renameScores(b.browserId, b.name);
      case 'roulette':
        return roulette(b.roomId, b.areaId, b.browserId, b.name, b.bet, b.pick);
      case 'blackjack':
        return blackjack(b.roomId, b.areaId, b.browserId, b.name, b.move, b.bet);
      case 'score':
        return recordScore(b.roomId, b.areaId, b.browserId, b.name, b.mode, b.value, { ticket: b.ticket, log: b.log });
      case 'run':
        return startRun(b.roomId, b.areaId, b.browserId, b.mode);
    }
  },
});
