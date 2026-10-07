// The Golden Paddle, played through with real input on one device:
// desktop (keys and mouse), PHONE=1 (touch at 390x844), PAD=1 (injected
// controller) or REMOTE=1 (arrows, Enter and Back only). Walks to Old Lucky,
// spins, rings the telegraph, places roulette chips by focus, plays blackjack
// with the hint, walks out through the stern doors to the River Wheel, earns
// Bosun from those first plays, walks into the Moonlight Lounge, drops pearls
// on every risk, holds and draws at Five Card Cabin, is refused at the
// Wheelhouse, reads every logbook page, and leaves by the gangway. Checks the
// balance after every game, that every result shown is the server's, and
// reports draw calls and frame rates per tier. Local memory servers only.
//
//   TOYBOXES_BASE=http://localhost:5212/ npx tsx scripts/casinotest.ts

import { openWorld, type Dir } from './lib/world';

const time = process.env.PHONE === '1' ? 'day' : 'night';
const w = await openWorld({ kind: 'casino', areaId: 'casino', name: 'Casino', time, quality: process.env.PHONE === '1' || process.env.REMOTE === '1' ? 'low' : 'medium' });
const { page, device } = w;
const phone = device === 'phone';
const pad = device === 'pad';
const remote = device === 'remote';
const log = (...a: unknown[]) => console.log(`[${device}]`, ...a);

type Exp = any;
const exp = (): Promise<Exp> => w.exp();
const state = () => w.dbg<any>('state');

/** Balance must equal the start, plus free top ups, plus winnings, minus bets. */
async function invariant(after: string): Promise<void> {
  const s = (await exp()).stats;
  if (!s) throw new Error(`No stats after ${after}`);
  if (s.balance !== 1000 + s.refillCredits + s.earned - s.spent) throw new Error(`Credits do not add up after ${after}: ${JSON.stringify(s)}`);
}

async function menuGone(): Promise<void> {
  await w.until(async () => !(await w.menuOpen()), 'menus closed');
}

/** Presses the pad's alt button (X). */
async function padButton(i: number): Promise<void> {
  const set = (v: number) => page.evaluate(([b, v]) => {
    (window as any).__pad.buttons[b] = v;
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, [i, v] as const);
  await set(1);
  await page.waitForTimeout(110);
  await set(0);
  await page.waitForTimeout(160);
}

/**
 * Moves focus with arrows or the d-pad until `selector` has it, steering by
 * where the target is on screen. Phones tap instead (see press).
 */
async function reach(selector: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const target = page.locator(selector).filter({ visible: true }).first();
    if (!(await target.count())) throw new Error(`No ${selector} on screen`);
    const r = await target.evaluate((t) => {
      const a = document.activeElement as HTMLElement | null;
      if (a === t) return { done: true } as const;
      const tr = t.getBoundingClientRect();
      const ar = a && a !== document.body ? a.getBoundingClientRect() : null;
      if (!ar) return { dx: 0, dy: 1 } as const;
      return { dx: tr.left + tr.width / 2 - (ar.left + ar.width / 2), dy: tr.top + tr.height / 2 - (ar.top + ar.height / 2) } as const;
    });
    if ('done' in r) return;
    const d: Dir = Math.abs(r.dy) > 12 ? (r.dy > 0 ? 'down' : 'up') : r.dx > 0 ? 'right' : 'left';
    await w.dir(d);
  }
  await w.shot('failure-focus');
  const active = await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className} "${document.activeElement?.textContent?.slice(0, 30)}"`);
  throw new Error(`Could not reach ${selector} by focus; focus is on ${active}`);
}

/** Presses an on-screen button the way this device would: a tap, or focus and OK. */
async function press(selector: string): Promise<void> {
  if (phone) {
    await page.locator(selector).filter({ visible: true }).first().tap();
    await page.waitForTimeout(200);
    return;
  }
  await reach(selector);
  await w.confirm();
}

/** The open table's status line, or a note when a rank up has already closed it. */
async function status(): Promise<string> {
  const el = page.locator('.modal.in .gp-status').first();
  return (await el.count()) ? ((await el.textContent()) ?? '') : '(table closed for the rank up)';
}

/**
 * Leaves the open card the way this device would: Back, or a tap on Done
 * (Escape on a phone would switch it to keyboard controls).
 */
async function leave(): Promise<void> {
  // A rank up stands you up from the table by itself.
  if (!(await w.menuOpen())) return;
  if (!phone) return w.back();
  await page.locator('.modal.in button').filter({ hasText: /^(Done|Not now)$/, visible: true }).last().tap();
  await page.waitForTimeout(200);
}

/** Walks in a direction until `check` passes (up to `ms`). */
async function walkUntil(d: Dir, check: (s: any) => boolean, what: string, ms = 14000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check(await state())) return;
    await w.walk(d, 500);
  }
  throw new Error(`Never got there: ${what} ${JSON.stringify(await state())}`);
}

// ---- Arrival: the intro card, then walk to Old Lucky on foot.
await w.until(async () => !!(await exp())?.stats, 'the boat to load');
await w.until(async () => (await exp()).introShown, 'the intro card');
for (let i = 0; i < 60 && !(await w.menuOpen()); i++) await page.waitForTimeout(100);
if (!(await w.menuOpen())) throw new Error('No intro card on the first visit');
await w.shot('01-intro');
await w.confirm();
await menuGone();
await w.call('debugTimeScale', 3);
await page.waitForTimeout(1500);
await w.shot('02-arrival');
await walkUntil('up', (s) => String(s.prompt).startsWith('Pull the lever'), 'Old Lucky');
log('walked to Old Lucky', (await state()).z.toFixed(2));
await w.shot('03-old-lucky');

// ---- Old Lucky: three spins; the shown reels must be the server's.
for (let i = 0; i < 3; i++) {
  await w.until(async () => String((await state()).prompt).startsWith('Pull the lever'), 'the lever');
  await w.act();
  if (i === 0) {
    await page.waitForTimeout(500);
    await w.shot('04-spinning');
  }
  await w.until(async () => {
    const e = await exp();
    return !e.slot.spinning && !e.ceremony && e.slot.spins === i + 1;
  }, `spin ${i + 1}`, 30000);
  const e = await exp();
  if (JSON.stringify(e.slot.shownStops) !== JSON.stringify(e.slot.lastServerStops)) throw new Error(`Reels show ${e.slot.shownStops}, server said ${e.slot.lastServerStops}`);
}
await w.shot('05-landed');
await invariant('Old Lucky');
if ((await exp()).stats.spins !== 3) throw new Error('Spins were not recorded');
// Kick changes the bet at the machine (no Kick on a remote: the telegraph covers it).
if (!remote) {
  const before = (await exp()).bet;
  await w.act('kick');
  await w.until(async () => (await exp()).bet !== before, 'Kick to change the bet');
  log('kick bet', before, '->', (await exp()).bet);
}
// The telegraph with Interact only.
const spots = (await exp()).spots;
await w.dbg('teleport', spots.telegraph.x, spots.telegraph.z, Math.PI);
await w.until(async () => String((await state()).prompt).startsWith('Ring the telegraph'), 'the telegraph');
const bet0 = (await exp()).bet;
await w.act();
await w.until(async () => (await exp()).bet !== bet0, 'the telegraph to change the bet');
log('telegraph bet', bet0, '->', (await exp()).bet);
// Back to the smallest bet for the rest of the run.
for (let i = 0; i < 6 && (await exp()).bet !== 10; i++) {
  await w.act();
  await page.waitForTimeout(250);
}

// ---- The Spinning Lily: three chips placed by focus or taps.
await w.dbg('teleport', spots.roulette.x, spots.roulette.z, Math.PI);
await w.until(async () => (await state()).prompt === 'Play roulette', 'roulette');
await w.act();
await page.waitForSelector('.rl-board');
await page.waitForTimeout(600);
await press('.rl-cell[data-key="red"]');
await press('.rl-cell[data-key="number:17"]');
await press('.rl-cell[data-key="dozen2"]');
await w.shot('06-roulette-bets');
await press('.gp-panel .gp-actions .btn.primary');
await w.until(async () => (await exp()).roulette.lastPocket !== null && !(await exp()).roulette.spinning, 'the roulette spin', 30000);
const rl = (await exp()).roulette;
if (rl.shownPocket !== rl.lastPocket) throw new Error(`Roulette shows ${rl.shownPocket}, server said ${rl.lastPocket}`);
await page.waitForTimeout(500);
await w.shot('07-roulette-result');
log('roulette', rl.lastPocket, await status());
await leave();
await menuGone();
await invariant('roulette');

// ---- Rivet's Twenty-One: deal, the hint, then play to the end.
await w.dbg('teleport', spots.blackjack.x, spots.blackjack.z, Math.PI);
await w.until(async () => /blackjack/i.test(String((await state()).prompt)), 'blackjack');
await w.act();
await page.waitForSelector('.bj-table');
await page.waitForTimeout(500);
await press('.gp-panel .gp-actions .btn.primary:not(.hidden)');
await w.until(async () => {
  const b = (await exp()).blackjack;
  return !b.busy && !!b.view;
}, 'the deal');
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(400);
  const b = (await exp()).blackjack;
  if (b.busy) continue;
  if (b.view?.phase !== 'player') break;
  if (b.hints === 0) {
    if (pad) await padButton(2);
    else await press('.gp-panel .gp-alt:not(.hidden)');
    await w.until(async () => (await exp()).blackjack.hints > 0, 'the hint');
    await w.shot('08-blackjack-hint');
  }
  // Split when the pair allows it, so split is played whenever the deal offers it.
  const split = await page.locator('.gp-panel .gp-actions .btn:not(.hidden)', { hasText: 'Split' }).count();
  await press(`.gp-panel .gp-actions .btn:not(.hidden):text-is("${split ? 'Split' : 'Stand'}")`);
}
await w.until(async () => (await exp()).blackjack.view?.phase === 'done' && !(await exp()).blackjack.busy, 'the hand to finish', 20000);
await page.waitForTimeout(400);
await w.shot('09-blackjack-result');
log('blackjack', await status());
await leave();
await menuGone();
await invariant('blackjack');

// ---- Out through the stern doors on foot to the River Wheel.
await w.dbg('teleport', 8.5, 0, Math.PI / 2);
await page.waitForTimeout(600);
await walkUntil('up', (s) => s.prompt === 'Play the River Wheel', 'the River Wheel');
log('doors open', (await exp()).doors.toFixed(2));
await w.shot('10-stern-deck');
await w.act();
await page.waitForSelector('.rw-grid');
await page.waitForTimeout(500);
await press('.rw-sym:nth-child(1)');
await press('.rw-sym:nth-child(6)');
await press('.gp-panel .gp-actions .btn.primary');
await w.until(async () => (await exp()).wheel.lastSegment !== null && !(await exp()).wheel.spinning, 'the River Wheel', 30000);
const wh = (await exp()).wheel;
if (wh.shownSegment !== wh.lastSegment) throw new Error(`Wheel shows ${wh.shownSegment}, server said ${wh.lastSegment}`);
await page.waitForTimeout(400);
await w.shot('11-wheel-result');
log('wheel', await status());
await leave();
await menuGone();
await invariant('the River Wheel');

// ---- Five boarding stamps make a Bosun; the rope comes down and the lounge opens.
await w.until(async () => (await exp()).rank >= 1, 'Bosun', 20000);
log('stamps', (await exp()).stamps.join(','));
await w.until(async () => !(await exp()).cinematic, 'the gate to open', 20000);
await menuGone();
await w.until(async () => (await exp()).gates.lounge, 'the lounge rope', 10000);
await w.dbg('teleport', -8, 0, -Math.PI / 2);
await page.waitForTimeout(600);
await walkUntil('up', (s) => s.x < -13.5, 'into the Moonlight Lounge');
await w.shot('12-lounge');

// ---- Lucky Falls on each risk.
await w.dbg('teleport', spots.falls.x, spots.falls.z, spots.falls.yaw);
await w.until(async () => String((await state()).prompt).includes('Lucky Falls'), 'Lucky Falls');
await w.act();
await page.waitForSelector('.lf-risks');
await page.waitForTimeout(500);
for (const [i, risk] of (['calm', 'lively', 'wild'] as const).entries()) {
  await press(`.lf-risk.lf-${risk}`);
  await press('.gp-panel .gp-actions .btn.primary');
  await w.until(async () => (await exp()).falls.history.length >= i + 1, `a ${risk} pearl`, 30000);
  const f = (await exp()).falls;
  const sum = f.lastBits.reduce((a: number, b: number) => a + b, 0);
  if (f.shownBins[0] !== sum) throw new Error(`Pearl landed in ${f.shownBins[0]}, server said ${sum}`);
  if (f.history[0].risk !== risk) throw new Error(`Dropped on ${f.history[0].risk}, wanted ${risk}`);
}
await w.shot('13-falls');
await leave();
await menuGone();
await invariant('Lucky Falls');

// ---- Five Card Cabin: deal, hold two, draw.
await w.dbg('teleport', spots.poker1.x, spots.poker1.z, 0);
await w.until(async () => /Five Card|poker/.test(String((await state()).prompt)), 'Five Card Cabin');
await w.act();
await page.waitForSelector('.vp-cards');
await page.waitForTimeout(400);
await press('.gp-panel .gp-actions .btn.primary');
await w.until(async () => (await exp()).poker.hands === 1, 'the deal');
await page.waitForTimeout(400);
await press('.vp-card:nth-child(1)');
await press('.vp-card:nth-child(2)');
const held = await page.locator('.vp-card.held').count();
if (held !== 2) throw new Error(`Held ${held} cards, wanted 2`);
await w.shot('14-poker-holds');
await press('.gp-panel .gp-actions .btn.primary');
await w.until(async () => (await exp()).poker.lastRank !== null, 'the draw');
await page.waitForTimeout(400);
await w.shot('15-poker-result');
log('poker', await status());
await leave();
await menuGone();
await invariant('Five Card Cabin');

// ---- The Wheelhouse is for First Mates: the sign explains and the rope stays up.
await w.dbg('teleport', spots.wheelhouseGate.x, spots.wheelhouseGate.z, spots.wheelhouseGate.yaw);
await w.until(async () => String((await state()).prompt).includes('Wheelhouse'), 'the wheelhouse sign');
await w.act();
await page.waitForSelector('.gate-card');
await w.shot('16-wheelhouse-gate');
await leave();
await menuGone();
if ((await exp()).gates.wheelhouse) throw new Error('The wheelhouse opened for a Bosun');
await w.walk('up', 1500);
if ((await state()).x < -21.2) throw new Error('Walked through the wheelhouse rope');

// ---- The Captain's Logbook: every page, a table view, and a chart read point by point.
await w.dbg('teleport', spots.logbook.x, spots.logbook.z - 0.4, 0);
await w.until(async () => String((await state()).prompt).includes('Logbook'), 'the logbook');
await w.act();
await page.waitForSelector('.lb-panel');
await page.waitForTimeout(800);
await w.shot('17-logbook');
const tabs = ['Over time', 'By game', 'Voyages', 'Stamps', 'Boards'];
for (const [i, t] of tabs.entries()) {
  if (pad) await padButton(5);
  else await press(`.lb-tab:text-is("${t}")`);
  await w.until(async () => (await page.locator('.lb-tab.on').textContent()) === t, `the ${t} page`);
  await page.waitForTimeout(300);
  if (t === 'Over time') {
    if (!phone) {
      await reach('.gp-chart');
      await w.dir('left');
      await w.dir('left');
      const tip = await page.locator('.gp-tip').first().textContent();
      if (!/\d/.test(tip ?? '')) throw new Error(`The chart did not read out a point: ${tip}`);
      log('chart reads', tip);
    }
    await w.shot('18-logbook-time');
    await press('.lb-toggle');
    await page.waitForSelector('.gp-numbers');
    await w.shot('19-logbook-numbers');
    await press('.lb-toggle');
  } else await w.shot(`2${i}-logbook-${t.toLowerCase().replace(/ /g, '-')}`);
}
await leave();
await menuGone();

// ---- Draw calls and frame rate on each tier, from the gangway.
await w.dbg('teleport', 0, 6.4, Math.PI);
for (const q of ['low', 'medium', 'high'] as const) {
  await w.dbg('setQuality', q);
  await page.waitForTimeout(2500);
  const e = await exp();
  const s = await state();
  log(`tier ${q}: ${e.frame.calls} draw calls, ${e.frame.triangles} triangles, ${s.fps} fps (software renderer)`);
}
await w.dbg('setQuality', phone || remote ? 'low' : 'medium');

// ---- Leave by the gangway.
await w.dbg('teleport', 0, 6.6, 0);
await page.waitForTimeout(400);
await walkUntil('up', (s) => /Back to/.test(String(s.prompt)), 'the gangway');
await w.act();
await w.until(async () => (await state()).space === 'room', 'back in the room');
await w.shot('26-left');
await w.done(`Casino voyage passed on ${device}: Old Lucky, telegraph, roulette, blackjack, River Wheel, Bosun, lounge, Lucky Falls, Five Card Cabin, wheelhouse refusal, logbook, exit`);
