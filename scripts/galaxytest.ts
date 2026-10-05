// Black hole galaxy: fall through the portal, measure frame times at each
// graphics tier, kick orbs into the black hole, play a short frenzy that
// reaches the board, and leave through the exit vortex.
//
//   npx tsx scripts/galaxytest.ts [outDir] [url]
//   PHONE=1 npx tsx scripts/galaxytest.ts

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const phone = process.env.PHONE === '1';
const out = process.argv[2] ?? `/tmp/toyboxes-galaxy${phone ? '-phone' : ''}`;
const base = process.argv[3] ?? 'http://localhost:5207/';
mkdirSync(out, { recursive: true });

async function api(path: string, body?: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(new URL(path, base), { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, headers: r.headers, json: (await r.json()) as Record<string, any> };
}

const world = await api('/api/world');
const free = (world.json.slots as { slot: number; roomId: string | null }[]).find((s) => !s.roomId)!;
const claim = await api('/api/room', { action: 'claim', slot: free.slot, name: 'estevan', pin: '7777', pinConfirm: '7777', browserId: `galaxy-owner-${Date.now()}-x` });
const roomId = claim.json.room.id as string;
const H = { 'x-toyboxes-admin': '1' };
const login = await fetch(new URL('/api/admin', base), { method: 'POST', headers: { 'content-type': 'application/json', ...H }, body: JSON.stringify({ action: 'login', password: process.env.ADMIN_PASSWORD ?? 'toyboxes-dev' }) });
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
const content = { rev: 0, areas: [{ id: 'galaxy', name: 'Black hole galaxy', theme: { wall: 0, floor: 0, trim: 4 }, props: [], published: true, experience: { kind: 'galaxy' }, pages: [] }], exhibits: [] };
const saved = await api('/api/admin', { action: 'saveContent', roomId, content }, { ...H, cookie });
if (saved.status !== 200) throw new Error(`publish failed ${JSON.stringify(saved.json)}`);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => localStorage.setItem('toyboxes.identity', JSON.stringify({ browserId: 'galaxy-player-browser-01', name: 'Stargazer' })));
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
let shot = 0;
const snap = async (n: string) => {
  shot++;
  await page.screenshot({ path: join(out, `${String(shot).padStart(2, '0')}-${n}.png`) });
  console.log('shot', n);
};
type G = { toyboxes: { debug: Record<string, (...a: any[]) => any> } };
const d = <T = any>(f: string, ...a: unknown[]) => page.evaluate(([f, a]) => (window as unknown as G).toyboxes.debug[f as string](...(a as unknown[])), [f, a] as const) as Promise<T>;
const act = (what: 'interact' | 'kick') => (phone ? page.locator(what === 'interact' ? '.tbtn-action' : '.tbtn-kick').tap() : page.keyboard.press(what === 'interact' ? 'KeyE' : 'Space'));
async function until(check: () => Promise<boolean>, what: string, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

await page.goto(new URL(`/?room=${roomId}`, base).toString());
await page.waitForSelector('body.ready');
await until(async () => (await d('state')).space === 'room', 'the room');
await page.waitForTimeout(800);
await snap('room-with-portal-door');
const door = (await d('spots')).areaDoors[0];
await d('teleport', door.x, door.z + 0.3, Math.PI);
await page.waitForTimeout(300);
await act('interact');
await until(async () => (await d('state')).space === 'area', 'the galaxy');
await page.waitForTimeout(500);
await snap('portal-arrival');
await page.waitForTimeout(2200);
await snap('galaxy');

// Frame times at each tier (software rendering here; real devices are faster).
const perf: Record<string, unknown> = {};
for (const tier of ['high', 'medium', 'low'] as const) {
  await d('setQuality', tier);
  await page.waitForTimeout(3500);
  const s = await d('state');
  const exp = await d('experience');
  perf[tier] = { tier: exp.tier, fps: s.fps, p75: Number(s.p75).toFixed(1), composer: exp.composer };
  await snap(`tier-${tier}`);
}
console.log('frame times', JSON.stringify(perf));
await d('setQuality', 'auto');

// Kick an orb towards the black hole.
async function kickOne(): Promise<void> {
  const exp = await d('experience');
  const orb = exp.orbs.find((o: { state: string; z: number }) => o.state === 'ground');
  if (!orb) throw new Error('No orb on the platform');
  await d('teleport', orb.x, orb.z + 0.85, Math.PI);
  await page.waitForTimeout(250);
  await act('kick');
}
const before = (await d('experience')).fed;
await kickOne();
await page.waitForTimeout(400);
await snap('orb-kicked');
await until(async () => (await d('experience')).fed > before, 'the orb to be swallowed', 12000);
console.log('fed after kick', (await d('experience')).fed);
await snap('orb-swallowed');

// A short frenzy.
await d('experienceCall', 'debugShortFrenzy', 9);
const exp = await d('experience');
await d('teleport', exp.shrine.x, exp.shrine.z + 0.6, Math.PI);
await page.waitForTimeout(300);
const prompt = (await d('state')).prompt;
if (prompt !== 'Start a feeding frenzy') throw new Error(`Shrine prompt: ${prompt}`);
await act('interact');
await page.waitForTimeout(3600);
await kickOne();
await page.waitForTimeout(1500);
await kickOne();
await snap('frenzy');
await until(async () => (await d('experience')).frenzy === null, 'the frenzy to end', 15000);
await page.waitForTimeout(2500);
await snap('frenzy-over');
const board = await api(`/api/scores?roomId=${roomId}&areaId=galaxy`);
console.log('board', JSON.stringify(board.json.board));
if (!board.json.board.some((r: { name: string }) => r.name === 'Stargazer')) throw new Error('Frenzy score did not reach the board');

// Home through the vortex.
const exitSpot = { x: -6.6, z: 5.9 };
await d('teleport', exitSpot.x, exitSpot.z, Math.atan2(-1, 1));
await page.waitForTimeout(300);
await act('interact');
await until(async () => (await d('state')).space === 'room', 'back in the room');

if (errors.length) {
  console.log('ERRORS', errors);
  process.exitCode = 1;
}
console.log('done', out, 'room', roomId);
await browser.close();
