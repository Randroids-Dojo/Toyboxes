// Creator tools. All calls need the admin session cookie and `x-toyboxes-admin: 1`.
//
// GET  /api/admin?view=session|rooms|released|feed|room&id=<roomId>
// POST /api/admin {action, ...}  see `actions` below

import { z } from 'zod';
import * as admin from '../server/admin.js';
import { clientIp, parseBody, parseQuery, route } from '../server/http.js';
import { clearScores } from '../server/scores.js';
import * as s from '../server/schemas.js';

const actions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('login'), password: z.string().max(200) }),
  z.object({ action: z.literal('logout') }),
  z.object({ action: z.literal('setPin'), roomId: s.roomId, pin: s.pin }),
  z.object({ action: z.literal('release'), roomId: s.roomId }),
  z.object({ action: z.literal('restore'), roomId: s.roomId, slot: s.slot }),
  z.object({ action: z.literal('moveSlot'), roomId: s.roomId, slot: s.slot }),
  z.object({ action: z.literal('setOwnerName'), roomId: s.roomId, name: s.name }),
  z.object({ action: z.literal('clearOwnerBinding'), roomId: s.roomId }),
  z.object({ action: z.literal('resetLayout'), roomId: s.roomId }),
  z.object({ action: z.literal('pageStatus'), roomId: s.roomId, pageId: s.pageId, status: z.enum(['requested', 'building', 'available']) }),
  z.object({ action: z.literal('markSeen'), roomId: s.roomId, pageId: s.pageId }),
  z.object({ action: z.literal('pageNote'), roomId: s.roomId, pageId: s.pageId, note: z.string().max(600) }),
  z.object({ action: z.literal('removePage'), roomId: s.roomId, pageId: s.pageId, removed: z.boolean() }),
  z.object({ action: z.literal('revertPage'), roomId: s.roomId, pageId: s.pageId, index: z.number().int().min(0).max(30) }),
  z.object({ action: z.literal('saveContent'), roomId: s.roomId, content: s.content }),
  z.object({ action: z.literal('clearScores'), roomId: s.roomId, areaId: z.string().regex(/^[a-zA-Z0-9_-]{1,24}$/) }),
]);

export default route({
  GET: async (req) => {
    const q = parseQuery(req, z.object({ view: z.enum(['session', 'rooms', 'released', 'feed', 'room']), id: s.roomId.optional() }));
    if (q.view === 'session') return { admin: admin.isAdmin(req) };
    admin.requireAdmin(req);
    switch (q.view) {
      case 'rooms':
        return { rooms: await admin.listRooms('rooms') };
      case 'released':
        return { rooms: await admin.listRooms('released') };
      case 'feed':
        return { feed: await admin.feed() };
      case 'room':
        if (!q.id) return { error: 'id required' };
        return admin.roomDetail(q.id);
    }
  },
  POST: async (req, res) => {
    const b = parseBody(req, actions);
    if (b.action === 'login') return admin.login(req, res, b.password, clientIp(req));
    if (b.action === 'logout') return admin.logout(res);
    admin.requireAdmin(req);
    switch (b.action) {
      case 'setPin':
        return admin.setPin(b.roomId, b.pin);
      case 'release':
        return admin.release(b.roomId);
      case 'restore':
        return admin.restore(b.roomId, b.slot);
      case 'moveSlot':
        return admin.moveSlot(b.roomId, b.slot);
      case 'setOwnerName':
        return admin.setOwnerName(b.roomId, b.name);
      case 'clearOwnerBinding':
        return admin.clearOwnerBinding(b.roomId);
      case 'resetLayout':
        return admin.resetLayout(b.roomId);
      case 'pageStatus':
        return admin.setPageStatus(b.roomId, b.pageId, b.status);
      case 'markSeen':
        return admin.markSeen(b.roomId, b.pageId);
      case 'pageNote':
        return admin.setPageNote(b.roomId, b.pageId, b.note);
      case 'removePage':
        return admin.setPageRemoved(b.roomId, b.pageId, b.removed);
      case 'revertPage':
        return admin.revertPage(b.roomId, b.pageId, b.index);
      case 'saveContent':
        return admin.saveContent(b.roomId, b.content);
      case 'clearScores':
        return clearScores(b.roomId, b.areaId);
    }
  },
});
