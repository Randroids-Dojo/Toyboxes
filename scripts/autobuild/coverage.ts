// Enumerate authoritative world slots and each active room's complete pages.
// The admin feed is a recent-activity view and cannot establish coverage.
import { SLOT_COUNT } from '../../src/shared/model';

interface Slot { slot: number; roomId: string | null }
interface Page { id: string; n: number; rev: number; status: string; seen: boolean; removed?: boolean; updatedAt: number; [key: string]: any }
interface Detail { room: { id: string; slot: number; status: string; ownerName: string }; pages: Page[]; [key: string]: any }
export async function allRoomQueue(world: () => Promise<Slot[]>, room: (id: string) => Promise<Detail>) {
  function validate(slots: Slot[]) {
    if (slots.length !== SLOT_COUNT || new Set(slots.map(s => s.slot)).size !== SLOT_COUNT || slots.some(s => !Number.isInteger(s.slot) || s.slot < 0 || s.slot >= SLOT_COUNT)) {
      throw new Error('Incomplete world slot coverage');
    }
    const ids = slots.filter(s => s.roomId !== null).map(s => s.roomId);
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate active room in world');
    return JSON.stringify([...slots].sort((a, b) => a.slot - b.slot));
  }
  const slots = await world();
  const fingerprint = validate(slots);
  const rooms = new Map<string, Detail>();
  const todo = [];
  let pagesRead = 0;
  for (const slot of slots) {
    if (slot.roomId === null) continue;
    const d = await room(slot.roomId);
    if (d.room.id !== slot.roomId || d.room.slot !== slot.slot || d.room.status !== 'active') throw new Error('Active room changed during queue check');
    if (!Array.isArray(d.pages) || new Set(d.pages.map(p => p.id)).size !== d.pages.length) throw new Error('Incomplete or duplicate room pages');
    pagesRead += d.pages.length;
    if (pagesRead > 10000) throw new Error('Queue coverage exceeded 10000 pages; no partial queue accepted');
    rooms.set(slot.roomId, d);
    for (const p of d.pages) {
      if (typeof p.seen !== 'boolean' || !Number.isFinite(p.updatedAt)) throw new Error('Missing page coverage metadata');
      if (!p.seen && !p.removed) todo.push({ roomId: slot.roomId, pageId: p.id, slot: slot.slot, ownerName: d.room.ownerName, updatedAt: p.updatedAt });
    }
  }
  if (validate(await world()) !== fingerprint) throw new Error('World membership changed during queue check; retry next wake');
  todo.sort((a, b) => a.updatedAt - b.updatedAt || a.pageId.localeCompare(b.pageId));
  return { todo, rooms, pagesRead };
}
