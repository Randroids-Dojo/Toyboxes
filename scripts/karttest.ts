// Playtest for the Toybox Grand Prix (the kart world): drives the real input
// on desktop, PHONE=1, PAD=1 and REMOTE=1. Arrive, get in, race menu, a
// single race with a rocket start, a drift into a mini-turbo, an item, the
// results; a time trial lap that the server checks; Back asking before it
// leaves a race; and every circuit's checks (computer drivers keep lapping,
// no z-fighting, draw calls within budget per tier).
//
//   TOYBOXES_BASE=http://localhost:5211/ npx tsx scripts/karttest.ts
//   QUICK=1 skips the slow every-circuit checks.

import { grandPrixTrack } from '../src/shared/circuits';
import { openWorld, type World } from './lib/world';

const w = await openWorld({ kind: 'kart', areaId: 'kart-track', name: 'Kart track', experience: { track: grandPrixTrack(), laps: 3 }, quality: 'medium' });
const { page, device } = w;
const remote = device === 'remote';
const log = (...a: unknown[]) => console.log(`[${device}]`, ...a);
/** Touch points held on the phone, sent through one DevTools session. */
let cdp: Awaited<ReturnType<ReturnType<typeof page.context>['newCDPSession']>> | null = null;
const touches = new Map<number, { x: number; y: number }>();
const STICK = 3;
const BRAKE = 7;

type Exp = any;
const exp = (): Promise<Exp> => w.exp();
const state = () => w.dbg('state');

// ---- 1. Arrive: the intro card, then walk to the kart and get in.
await w.until(async () => w.menuOpen(), 'the intro card');
await w.shot('01-intro');
await w.confirm();
await w.until(async () => !(await w.menuOpen()), 'intro closed');
let e = await exp();
if (e.circuit !== 'blocktown') throw new Error(`Room 1's track should be Block Town, got ${e.circuit}`);
await page.waitForTimeout(1200);
await w.shot('02-arrival');
// Walk toward the kart (it is straight ahead of the arrival point).
const box = e.paddock.box;
await w.dbg('teleport', box.x - Math.sin(e.paddock.arrival.yaw) * 1.5, box.z - Math.cos(e.paddock.arrival.yaw) * 1.5, e.paddock.arrival.yaw);
await page.waitForTimeout(300);
await w.until(async () => String((await state()).prompt).includes('go-kart'), 'the get-in prompt');
await w.act();
await w.until(async () => (await state()).riding === 'kart', 'riding the kart');
log('in the kart');
// First ride offers the warm-up lap: skip it for now (it is tested below).
await w.until(async () => w.menuOpen(), 'the warm-up question');
await w.shot('03-warmup-offer');
await cancel();
await w.until(async () => !(await w.menuOpen()), 'warm-up skipped');

// ---- 2. Race menu from the pit box.
await w.until(async () => (await state()).prompt === 'Race menu', 'the race menu prompt');
await w.act();
await w.until(async () => w.menuOpen(), 'the race menu');
await page.waitForTimeout(400);
await w.shot('04-race-menu');
if (remote) {
  // Turn on the remote layout through the Assists page: arrows and OK only.
  await press('Assists');
  await page.waitForTimeout(300);
  await press('Remote layout');
  await page.waitForTimeout(200);
  await w.back();
  await page.waitForTimeout(300);
  if (!(await exp()).kart.assists.remote) throw new Error('Remote layout did not turn on');
}
await press('Single race');
await w.until(async () => (await exp()).state !== 'free', 'the race to start');
await page.waitForTimeout(700);
await w.shot('05-flyover');
// Skip the flyover and the grid pan with the device's own Interact.
for (let i = 0; i < 12; i++) {
  e = await exp();
  if (e.state === 'countdown' || e.state === 'running') break;
  // Phones skip with the Action button, which only shows while a shot can be skipped.
  if (device === 'phone' && !(await page.locator('.tbtn-action').isVisible())) {
    await page.waitForTimeout(150);
    continue;
  }
  await w.act();
  await page.waitForTimeout(250);
}
await w.until(async () => (await exp()).state === 'countdown', 'the countdown');
await w.shot('06-countdown');

// ---- 3. Rocket start: gas from the last red light.
await w.until(async () => (await page.evaluate(() => document.querySelector('.xk-banner-text span')?.textContent)) === '1', 'the last red light', 6000);
await gas(true);
await w.until(async () => (await exp()).state === 'running', 'green light');
await page.waitForTimeout(200);
e = await exp();
log('rocket start boost', e.kart.boost.toFixed(2));
if (e.kart.boost <= 0.3) throw new Error(`No rocket start: ${JSON.stringify(e.kart)}`);
await page.waitForTimeout(1500);
await w.shot('07-racing');
// The race start teleports you to the grid: you must still be sitting in your kart.
const gap = (await state()).riderGap;
log('driver to kart', gap?.toFixed(2));
if (gap === null || gap > 0.6) throw new Error(`Your figure is ${gap?.toFixed(1)} m from your kart, not in its seat`);
await gas(false);

// ---- 4. Drift into a mini-turbo on the first corner.
await w.call('debugTeleportS', 30, 1.5);
await page.waitForTimeout(200);
await gas(true);
// Up to speed on the straight, then drift as the corner begins.
await w.until(async () => {
  const k = (await exp()).kart;
  return k.speed > 10 && k.s > 78.5;
}, 'speed for a drift at the corner', 10000);
await drift();
await w.until(async () => (await exp()).save.stats.turbos > 0, 'a mini-turbo', 9000);
log('mini-turbo');
await gas(false);

// ---- 5. Items: give a ball, put Bolt ahead in your lane, use it with the device's item control.
await w.call('debugGiveItem', 'ball');
await w.call('debugTeleportS', 395, 0);
await w.call('debugPlaceCpu', 0, 14, 0);
await page.waitForTimeout(150);
await useItem();
await w.until(async () => (await exp()).items.balls === 0, 'the ball to land', 5000);
e = await exp();
log('ball thrown; items', JSON.stringify(e.items));
await w.shot('08-item');

// ---- 6. Finish and the results card, navigated by the device.
await w.call('debugTeleportS', 545, 0);
await w.call('debugNearFinish');
await gas(true);
await w.until(async () => (await exp()).session?.results === true, 'the results card', 20000);
await gas(false);
await page.waitForTimeout(1200);
await w.shot('09-results');
// "Done" is not the default; Race again is. Leave with Back (Esc, B or the remote's Back).
await cancel();
await w.until(async () => (await exp()).state === 'free', 'back to free drive', 8000);
log('race finished and left');

// ---- 7. B on a controller in a race asks before leaving; the TV Back opens the pause menu.
await w.call('debugStart', 'single', 'blocktown', 'windup', true);
await w.until(async () => ['intro', 'grid', 'countdown', 'running'].includes((await exp()).state), 'a second race');
await w.call('debugSkip');
await w.call('debugSkip');
await w.until(async () => (await exp()).state === 'countdown', 'countdown 2');
await w.until(async () => (await exp()).state === 'running', 'running 2', 6000);
if (device !== 'phone') await w.back();
await page.waitForTimeout(400);
if (device === 'pad') {
  if (!(await w.menuOpen())) throw new Error('B in a race should ask before leaving');
  await w.shot('10-leave-ask');
  await w.confirm(); // "Yes"
} else {
  // Keyboard, touch and the TV: Back (or the menu button) pauses, and the pause menu can leave the race.
  if (device === 'phone') await page.locator('.tbtn-menu').tap();
  await w.until(async () => w.menuOpen(), 'the pause menu');
  await w.shot('10-pause');
  await press('Leave the race');
}
await w.until(async () => (await exp()).state === 'free', 'left the race');
if ((await state()).riding !== 'kart') throw new Error('Leaving a race should keep you in your kart');

// ---- 8. Time trial: one lap round the centre line at kart speed, saved to the board.
await w.call('debugStart', 'trial', 'blocktown', 'battery', false);
await w.until(async () => (await exp()).state === 'countdown', 'trial countdown', 8000);
await w.until(async () => (await exp()).state === 'running', 'trial go', 6000);
const lap = await w.call('debugAutopilotLap', 14.5);
log('drove a trial lap', JSON.stringify(lap));
await w.until(async () => (await exp()).timing.trial !== null, 'a trial lap time', 10000);
e = await exp();
log('trial lap', e.timing.trial);
await w.until(async () => (await exp()).boards.blocktown > 0, 'the lap on the board', 10000);
await w.shot('11-trial');
await w.call('endSession');

// ---- 9. Every circuit: drivers keep lapping, no z-fighting, budgets per tier.
if (process.env.QUICK !== '1') {
  for (const c of e.circuits as string[]) {
    await w.call('debugLoadCircuit', c);
    await page.waitForTimeout(500);
    const sim = await w.call('debugSimulate', 60, 'battery');
    for (const r of sim.cpus) if (r.laps < 1 || r.offMax > 1.6 || r.grabs > 1) throw new Error(`${c}: ${r.name} did not lap cleanly: ${JSON.stringify(r)}`);
    const z = await w.call('debugZAudit');
    if (z !== 0) throw new Error(`${c}: ${z} z-fighting faces`);
    for (const tier of ['low', 'medium', 'high'] as const) {
      await w.dbg('setQuality', tier);
      await page.waitForTimeout(400);
      const r = await w.call('debugRender');
      const budget = { low: 160, medium: 300, high: 450 }[tier];
      const tris = { low: 150_000, medium: 400_000, high: 900_000 }[tier];
      log(c, tier, 'calls', r.calls, 'triangles', r.triangles);
      if (r.calls > budget) throw new Error(`${c} ${tier}: ${r.calls} draw calls (budget ${budget})`);
      if (r.triangles > tris) throw new Error(`${c} ${tier}: ${r.triangles} triangles (budget ${tris})`);
    }
    await w.dbg('setQuality', 'medium');
    await w.shot(`12-${c}`);
  }
}

await w.done('Kart playtest passed');

// ---------------------------------------------------------------------------

/** Moves menu focus to a button by its text, with the device's arrows (phones tap it). */
async function focusButton(world: World, text: string): Promise<void> {
  const { page: p, device: d } = world;
  if (d === 'phone') {
    await p.locator('.modal.in button', { hasText: text }).first().tap();
    // Tapping already pressed it: confirm() would press the primary button again.
    (world as any).__tapped = true;
    return;
  }
  for (let i = 0; i < 24; i++) {
    // Step toward the target from wherever focus is.
    const where = await p.evaluate((t) => {
      const cur = document.activeElement as HTMLElement | null;
      const target = Array.from(document.querySelectorAll<HTMLElement>('.modal.in button')).find((b) => (b.textContent ?? '').includes(t));
      if (!cur || !target) return null;
      if (cur === target) return 'here';
      const a = cur.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      return Math.abs(dy) > 12 ? (dy > 0 ? 'down' : 'up') : dx > 0 ? 'right' : 'left';
    }, text);
    if (where === 'here') return;
    if (!where) throw new Error(`No "${text}" button, or nothing focused`);
    await world.dir(where as any);
    await p.waitForTimeout(80);
  }
  throw new Error(`Could not focus "${text}"`);
}

/** Presses a menu button the device's way: arrows to it and OK, or a tap. */
async function press(text: string): Promise<void> {
  await focusButton(w, text);
  if (device !== 'phone') await w.confirm();
  else await page.waitForTimeout(250);
}

/** Back out of a card: Back on keys, pads and remotes; a tap on its other button on a phone. */
async function cancel(): Promise<void> {
  if (device === 'phone') {
    await page.locator('.modal.in .btn.ghost').last().tap();
    await page.waitForTimeout(250);
  } else await w.back();
}

async function touchSet(id: number, p: { x: number; y: number } | null): Promise<void> {
  cdp ??= await page.context().newCDPSession(page);
  const had = touches.has(id);
  if (!p && !had) return;
  if (p) touches.set(id, p);
  else touches.delete(id);
  const list = [...touches].map(([i, q]) => ({ x: q.x, y: q.y, id: i }));
  // Add or move active points; the final release ends the whole gesture.
  const type = !p ? (list.length ? 'touchMove' : 'touchEnd') : had ? 'touchMove' : 'touchStart';
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: list });
}

async function gas(on: boolean): Promise<void> {
  if (device === 'phone') {
    if (on) {
      await touchSet(STICK, { x: 110, y: 640 });
      await touchSet(STICK, { x: 110, y: 590 });
    } else await touchSet(STICK, null);
  } else if (device === 'pad') {
    await page.evaluate((v) => ((window as any).__pad.buttons[7] = v), on ? 1 : 0);
  } else {
    if (on) await page.keyboard.down('ArrowUp');
    else await page.keyboard.up('ArrowUp');
  }
}

/** A drift through the first corner with the device's own controls. */
async function drift(): Promise<void> {
  // The first corner turns right.
  if (remote) {
    // Steer, OK to start the drift, hold the turn, OK again to cash in.
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(150);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Enter');
    await w.until(async () => (await exp()).kart.stage >= 1, 'a charged drift', 6000);
    await page.keyboard.press('Enter');
    return;
  }
  // Turn in and press drift, then hold the drift with the steering centred
  // (a drift turns tighter than the corner on its own), and let go for the boost.
  if (device === 'phone') {
    await touchSet(STICK, { x: 145, y: 625 });
    const b = await page.locator('.tbtn-kick').boundingBox();
    await touchSet(BRAKE, { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 });
    await page.waitForTimeout(80);
    await touchSet(STICK, { x: 110, y: 610 });
    await w.until(async () => (await exp()).kart.stage >= 1, 'a charged drift', 6000);
    // End both fingers: omitting Brake from touchMove does not release it.
    await cdp!.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    touches.clear();
    await gas(true);
    return;
  }
  if (device === 'pad') {
    await page.evaluate(() => ((window as any).__pad.axes[0] = 0.8));
    await page.evaluate(() => ((window as any).__pad.buttons[2] = 1));
    await page.waitForTimeout(80);
    await page.evaluate(() => ((window as any).__pad.axes[0] = 0));
    await w.until(async () => (await exp()).kart.stage >= 1, 'a charged drift', 6000);
    await page.evaluate(() => ((window as any).__pad.buttons[2] = 0));
    return;
  }
  await page.keyboard.down('KeyD');
  await page.keyboard.down('Space');
  await page.waitForTimeout(80);
  await page.keyboard.up('KeyD');
  await w.until(async () => (await exp()).kart.stage >= 1, 'a charged drift', 6000);
  await page.keyboard.up('Space');
}

async function useItem(): Promise<void> {
  if (remote) await w.dir('up', 90);
  else await w.act();
}
