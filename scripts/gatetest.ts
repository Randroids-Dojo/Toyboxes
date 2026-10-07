// Themed world doors in a room: claims two local rooms that hold all five
// worlds plus a plain area, then looks at every door by day and night, from
// the middle of the room and up close. Fails on page errors or shader errors,
// checks the tyre stacks and rope posts block the player, and prints the
// room's draw calls per graphics tier.
//
//   TOYBOXES_BASE=http://localhost:5207/ npx tsx scripts/gatetest.ts

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { grandPrixTrack } from '../src/shared/circuits';
import { requireLocalPlaytest } from './autobuild/safety';

const base = process.env.TOYBOXES_BASE ?? 'http://localhost:5207/';
requireLocalPlaytest(base);
const out = '/tmp/toyboxes-gates';
mkdirSync(out, { recursive: true });

const api = async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(new URL(path, base), { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(data)}`);
  return { data, headers: r.headers };
};

const NAMES: Record<string, string> = { kart: 'Kart track', casino: 'Casino', galaxy: 'Black hole galaxy', fart: 'Fart simulator', neon: 'Neon space party', plain: 'Toy room' };
const H = { 'x-toyboxes-admin': '1' };
const login = await api('/api/admin', { action: 'login', password: 'toyboxes-dev' }, H);
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];

async function claimRoom(kinds: string[], n: number): Promise<string> {
  const free = (await api('/api/world')).data.slots.find((s: { roomId: string | null }) => !s.roomId);
  if (!free) throw new Error('The local town is full; restart the dev server');
  const stamp = Date.now() + n;
  const claim = await api('/api/room', { action: 'claim', slot: free.slot, name: `Gates ${n}`, pin: '2468', pinConfirm: '2468', browserId: `gates-${stamp}-owner` }, { 'x-forwarded-for': `10.${(stamp >> 16) & 255}.${(stamp >> 8) & 255}.${stamp & 255}` });
  const roomId = claim.data.room.id as string;
  const areas = kinds.map((k, i) => ({
    id: `g${i}`,
    name: NAMES[k],
    theme: { wall: 0, floor: 0, trim: i + 1 },
    props: [],
    published: true,
    ...(k === 'plain' ? {} : { experience: k === 'kart' ? { kind: 'kart', track: grandPrixTrack(), laps: 3 } : { kind: k } }),
    pages: [],
  }));
  await api('/api/admin', { action: 'saveContent', roomId, content: { rev: 0, areas, exhibits: [] } }, { ...H, cookie });
  return roomId;
}

const rooms = [await claimRoom(['kart', 'casino', 'galaxy'], 1), await claimRoom(['fart', 'neon', 'plain'], 2)];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors: string[] = [];

for (const [r, roomId] of rooms.entries()) {
  for (const time of ['day', 'night'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript('window.__name = (f) => f;');
    await ctx.addInitScript(([id, t]) => {
      localStorage.setItem('toyboxes.identity', JSON.stringify({ browserId: id, name: 'Gates' }));
      localStorage.setItem('toyboxes.settings', JSON.stringify({ time: t, quality: 'high' }));
    }, [`gates-player-${r}-${time}-0001`, time] as const);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' || /shader|WebGLProgram/i.test(m.text())) errors.push(m.text());
    });
    await page.goto(`${base}?room=${roomId}`);
    await page.waitForSelector('body.ready');
    await page.waitForTimeout(1200);
    const dbg = <T = any>(f: string, ...a: unknown[]) => page.evaluate(([f, a]) => (window as any).toyboxes.debug[f as string](...(a as unknown[])), [f, a] as const) as Promise<T>;
    const spots = await dbg<{ areaDoors: { x: number; z: number; name: string }[] }>('spots');
    if (spots.areaDoors.length !== 3) throw new Error(`Room ${r + 1} should have 3 doors, has ${spots.areaDoors.length}`);
    await dbg('teleport', 0, 3.2, Math.PI);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/room${r + 1}-${time}.png` });
    if (time === 'day') {
      const calls: Record<string, number> = {};
      for (const q of ['low', 'medium', 'high'] as const) {
        await dbg('setQuality', q);
        await page.waitForTimeout(500);
        calls[q] = await page.evaluate(() => (window as any).toyboxes.renderer.info.render.calls as number);
      }
      console.log(`room ${r + 1} draw calls`, JSON.stringify(calls));
    }
    for (const d of spots.areaDoors) {
      await dbg('teleport', d.x + 0.4, d.z + 1.4, Math.PI);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${out}/room${r + 1}-${time}-${d.name.toLowerCase().replace(/\s+/g, '-')}.png` });
    }
    if (time === 'day') {
      // Walk straight at a tyre stack or rope post: the player must stop in front of it.
      const kartOrCasino = spots.areaDoors.filter((d) => d.name === NAMES.kart || d.name === NAMES.casino);
      for (const d of kartOrCasino) {
        const postX = d.x + 0.8;
        const postZ = d.name === NAMES.kart ? d.z - 1.1 + 0.66 : d.z - 1.1 + 1.25;
        await dbg('teleport', postX, postZ + 1.6, Math.PI);
        await page.waitForTimeout(300);
        await page.keyboard.down('KeyW');
        await page.waitForTimeout(1400);
        await page.keyboard.up('KeyW');
        const s = await dbg<{ x: number; z: number }>('state');
        const gap = s.z - postZ;
        if (gap < 0.35) throw new Error(`${d.name}: walked through the door's floor pieces (${gap.toFixed(2)} m from the centre)`);
        console.log(`${d.name}: stopped ${gap.toFixed(2)} m in front of the obstacle`);
      }
    }
    await ctx.close();
  }
}
await browser.close();
if (errors.length) {
  console.log(errors.slice(0, 10).join('\n'));
  throw new Error(`${errors.length} page or shader errors`);
}
console.log(`Gate playtest passed. Screenshots in ${out}`);
