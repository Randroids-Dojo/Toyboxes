// GET  /api/room?id=<roomId>                      -> public room (layout, published content)
// POST /api/room {action:'claim', slot, name, pin, pinConfirm, browserId}
// POST /api/room {action:'unlock', roomId, pin}   -> edit token
// POST /api/room {action:'layout', roomId, layout, theme, rev}  (x-room-token)
// POST /api/room {action:'rename', roomId, pin, name}

import { z } from 'zod';
import { clientIp, header, limit, parseBody, parseQuery, route, type Req } from '../server/http.js';
import { claim, renameOwner, room, saveLayout, unlock } from '../server/rooms.js';
import * as s from '../server/schemas.js';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('claim'), slot: s.slot, name: s.name, pin: s.pin, pinConfirm: s.pin, browserId: s.browserId }),
  z.object({ action: z.literal('unlock'), roomId: s.roomId, pin: s.pin }),
  z.object({ action: z.literal('layout'), roomId: s.roomId, layout: s.layout, theme: s.theme, rev: s.rev }),
  z.object({ action: z.literal('rename'), roomId: s.roomId, pin: s.pin, name: s.name }),
]);

export default route({
  GET: async (req) => {
    const q = parseQuery(req, z.object({ id: s.roomId }));
    return { room: await room(q.id) };
  },
  POST: async (req: Req) => {
    const b = parseBody(req, body);
    const ip = clientIp(req);
    await limit(`post-ip:${ip}`, 90, 60, 'Slow down a little');
    switch (b.action) {
      case 'claim':
        return claim(b, ip);
      case 'unlock':
        return unlock(b.roomId, b.pin, ip);
      case 'layout':
        return { room: await saveLayout(b.roomId, header(req, 'x-room-token'), b.layout, b.theme, b.rev) };
      case 'rename':
        return renameOwner(b.roomId, b.pin, b.name, ip);
    }
  },
});
