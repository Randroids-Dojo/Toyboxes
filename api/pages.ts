// Sketchbook pages. Every call needs a room edit token in `x-room-token`.
//
// GET  /api/pages?roomId=<id>                         -> pages in book order
// POST /api/pages {roomId, text, sketch}              -> new page
// PUT  /api/pages {roomId, pageId, text, sketch, rev} -> revise a page (409 on conflict)

import { z } from 'zod';
import { clientIp, header, parseBody, parseQuery, route } from '../server/http.js';
import { createPage, listPages, updatePage } from '../server/rooms.js';
import * as s from '../server/schemas.js';

export default route({
  GET: async (req) => {
    const q = parseQuery(req, z.object({ roomId: s.roomId }));
    return { pages: await listPages(q.roomId, header(req, 'x-room-token')) };
  },
  POST: async (req) => {
    const b = parseBody(req, z.object({ roomId: s.roomId, text: s.pageText, sketch: s.sketch }));
    return { page: await createPage(b.roomId, header(req, 'x-room-token'), b.text, b.sketch, clientIp(req)) };
  },
  PUT: async (req) => {
    const b = parseBody(req, z.object({ roomId: s.roomId, pageId: s.pageId, text: s.pageText, sketch: s.sketch, rev: s.rev }));
    return { page: await updatePage(b.roomId, header(req, 'x-room-token'), b.pageId, b.text, b.sketch, b.rev, clientIp(req)) };
  },
});
