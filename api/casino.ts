// The Golden Paddle casino. Every play body carries roomId, areaId,
// browserId and name, plus the visit id (voyage) and the player's local
// date (day) for the logbook.
//
// GET  /api/casino?roomId=<id>&areaId=<id>   (x-browser-id optional) -> record, boards, Hall of Fame, GRAND, open hands
// POST /api/casino {action:'slot', bet}
// POST /api/casino {action:'refill'}
// POST /api/casino {action:'roulette', bets:[{type, number?, amount}]}
// POST /api/casino {action:'wheel', bets:{anchor?, rope?, lantern?, compass?, helm?, star?}}
// POST /api/casino {action:'falls', bet, risk:'calm'|'lively'|'wild'}
// POST /api/casino {action:'blackjack', table:'saloon'|'captain', move:'deal'|'hit'|'stand'|'double'|'split', bet?}
// POST /api/casino {action:'poker', move:'deal'|'draw', bet?, holds?}

import { z } from 'zod';
import { blackjack, fallsDrop, poker, refill, roulette, slotSpin, summary, wheelSpin } from '../server/casino.js';
import { clientIp, header, limit, parseBody, parseQuery, route } from '../server/http.js';
import * as s from '../server/schemas.js';

const areaId = z.string().regex(/^[a-zA-Z0-9_-]{1,24}$/);
const amount = z.number().int().min(1).max(100_000);

const seat = {
  roomId: s.roomId,
  areaId,
  browserId: s.browserId,
  name: s.name,
  voyage: z.string().max(24).optional(),
  day: z.string().max(12).optional(),
};

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('slot'), ...seat, bet: z.number().int() }),
  z.object({ action: z.literal('refill'), ...seat }),
  z.object({
    action: z.literal('roulette'),
    ...seat,
    bets: z
      .array(
        z.object({
          type: z.enum(['red', 'black', 'odd', 'even', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'col1', 'col2', 'col3', 'number']),
          number: z.number().int().min(0).max(36).optional(),
          amount,
        }),
      )
      .min(1)
      .max(16),
  }),
  z.object({
    action: z.literal('wheel'),
    ...seat,
    bets: z.object({ anchor: amount.optional(), rope: amount.optional(), lantern: amount.optional(), compass: amount.optional(), helm: amount.optional(), star: amount.optional() }),
  }),
  z.object({ action: z.literal('falls'), ...seat, bet: z.number().int(), risk: z.enum(['calm', 'lively', 'wild']) }),
  z.object({ action: z.literal('blackjack'), ...seat, table: z.enum(['saloon', 'captain']), move: z.enum(['deal', 'hit', 'stand', 'double', 'split']), bet: z.number().int().optional() }),
  z.object({ action: z.literal('poker'), ...seat, move: z.enum(['deal', 'draw']), bet: z.number().int().optional(), holds: z.array(z.boolean()).length(5).optional() }),
]);

export default route({
  GET: async (req) => {
    const q = parseQuery(req, z.object({ roomId: s.roomId, areaId }));
    const id = header(req, 'x-browser-id');
    return summary(q.roomId, q.areaId, id && s.browserId.safeParse(id).success ? id : undefined);
  },
  POST: async (req) => {
    const b = parseBody(req, body);
    await limit(`casino-ip:${clientIp(req)}`, 400, 60, 'Slow down a little');
    switch (b.action) {
      case 'slot':
        return slotSpin(b, b.bet);
      case 'refill':
        return refill(b);
      case 'roulette':
        return roulette(b, b.bets);
      case 'wheel':
        return wheelSpin(b, b.bets);
      case 'falls':
        return fallsDrop(b, b.bet, b.risk);
      case 'blackjack':
        return blackjack(b, b.table, b.move, b.bet);
      case 'poker':
        return poker(b, b.move, b.bet, b.holds);
    }
  },
});
