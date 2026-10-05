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

import { z } from 'zod';
import { clientIp, header, limit, parseBody, parseQuery, route } from '../server/http.js';
import { blackjack, board, recordFrenzy, recordLap, refill, renameScores, roulette, spin } from '../server/scores.js';
import * as s from '../server/schemas.js';

const areaId = z.string().regex(/^[a-zA-Z0-9_-]{1,24}$/);

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('lap'), roomId: s.roomId, areaId, browserId: s.browserId, name: s.name, ms: z.number().int().min(1).max(3_600_000) }),
  z.object({ action: z.literal('spin'), roomId: s.roomId, areaId, browserId: s.browserId, name: s.name, bet: z.number().int() }),
  z.object({ action: z.literal('refill'), roomId: s.roomId, areaId, browserId: s.browserId, name: s.name }),
  z.object({ action: z.literal('frenzy'), roomId: s.roomId, areaId, browserId: s.browserId, name: s.name, score: z.number().int() }),
  z.object({ action: z.literal('name'), browserId: s.browserId, name: s.name }),
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
    const q = parseQuery(req, z.object({ roomId: s.roomId, areaId }));
    const id = header(req, 'x-browser-id');
    return board(q.roomId, q.areaId, id && s.browserId.safeParse(id).success ? id : undefined);
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
    }
  },
});
