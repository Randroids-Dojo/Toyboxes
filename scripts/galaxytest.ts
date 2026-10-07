// Black hole bloom (room 12's galaxy): plays the whole journey through the
// real input on this device. Arrival flyover and intro card, the wake
// tutorial with real kicks, the first star, a star sling to Ringworld, a full
// two-lap ring run steered by a small controller on the move input (using the
// camera's yaw), a fall into the star net, rock rain, the comet surf, a short
// frenzy that reaches the board, the Horizon stair by bounce blossoms, the
// finale, and leaving. Screenshots and draw calls at each graphics tier.
//
//   TOYBOXES_BASE=http://localhost:5213/ npx tsx scripts/galaxytest.ts
//   PHONE=1 / PAD=1 / REMOTE=1 for the other devices (REMOTE sends only arrows, Enter and Back).
//   STAGES=wake,ring,... runs a subset (always starts with arrival).

import { DOCK, DOCK_LEDGE, HUB, RING, RING_FINISH_S, RING_SHELF, STAIR, ringGates, ringPoint } from '../src/shared/galaxy-rules';
import { openWorld } from './lib/world';

const w = await openWorld({ kind: 'galaxy', areaId: 'black-hole-galaxy', name: 'Black hole galaxy', quality: 'high' });
const { page, device } = w;
const stages = new Set((process.env.STAGES ?? 'wake,ring,net,storm,comet,frenzy,moons,horizon,tiers,leave').split(','));
let shotN = 0;
const shot = async (name: string) => {
  shotN++;
  await w.shot(`${String(shotN).padStart(2, '0')}-${name}`);
  console.log('shot', name);
};
const st = () => w.dbg<{ x: number; z: number; y: number; camYaw: number; yaw: number; grounded: boolean; carried: boolean; space: string; prompt: string | null; menu: boolean }>('state');
const exp = () => w.exp<any>();
const log = (...a: unknown[]) => console.log(`[${device}]`, ...a);

// ---------------------------------------------------------------------------
// Steering through the real move input, relative to the camera.

let held: string[] = [];
let touch: { cdp: any; down: boolean } | null = null;
const STICK = { x: 110, y: 640 };

async function input(mx: number, my: number): Promise<void> {
  if (device === 'pad') {
    await page.evaluate(([x, y]) => {
      (window as any).__pad.axes[0] = x;
      (window as any).__pad.axes[1] = -y;
    }, [mx, my] as const);
    return;
  }
  if (device === 'phone') {
    if (!touch) touch = { cdp: await page.context().newCDPSession(page), down: false };
    if (mx === 0 && my === 0) {
      if (touch.down) await touch.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      touch.down = false;
      return;
    }
    if (!touch.down) {
      await touch.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: STICK.x, y: STICK.y, id: 3 }] });
      touch.down = true;
    }
    await touch.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: STICK.x + mx * 55, y: STICK.y - my * 55, id: 3 }] });
    return;
  }
  // Keyboard and TV remote: digital directions.
  const keys = device === 'remote' ? { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' } : { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
  const want: string[] = [];
  if (my > 0.38) want.push(keys.up);
  if (my < -0.38) want.push(keys.down);
  if (mx > 0.38) want.push(keys.right);
  if (mx < -0.38) want.push(keys.left);
  for (const k of held) if (!want.includes(k)) await page.keyboard.up(k);
  for (const k of want) if (!held.includes(k)) await page.keyboard.down(k);
  held = want;
}

const stop = () => input(0, 0);

/** Walks toward a moving target until `done` says so. */
async function steer(target: () => Promise<{ x: number; z: number } | null>, done: () => Promise<boolean>, what: string, ms = 30000, near = 0.4): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await done()) {
      await stop();
      return;
    }
    const t = await target();
    const s = await st();
    if (!t || s.carried || s.menu) {
      await stop();
      await page.waitForTimeout(80);
      continue;
    }
    const dx = t.x - s.x;
    const dz = t.z - s.z;
    if (Math.hypot(dx, dz) < near) {
      await stop();
      await page.waitForTimeout(60);
      continue;
    }
    const d = Math.atan2(dx, dz) - s.camYaw;
    await input(-Math.sin(d), Math.cos(d));
    await page.waitForTimeout(70);
  }
  await stop();
  await w.shot('failure');
  throw new Error(`Timed out steering: ${what} ${JSON.stringify(await st())} ${JSON.stringify(await exp()).slice(0, 900)}`);
}

async function until(check: () => Promise<boolean>, what: string, ms = 20000): Promise<void> {
  await w.until(check, what, ms);
}

/** Skips cinematics and star glances with Interact (and closes cards). */
async function settle(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const e = await exp();
    if (await w.menuOpen()) await confirm();
    else if (e.cine || e.flyingStars) await act();
    else return;
    await page.waitForTimeout(250);
  }
}

/** Confirms the focused card button (a tap on a phone lifts the stick finger too). */
async function confirm(): Promise<void> {
  if (touch?.down) await stop();
  if (device === 'pad') {
    await w.hold('interact', 280);
    await page.waitForTimeout(200);
  } else await w.confirm();
  if (touch) touch.down = false;
}

/** Closes a results card without playing again: Back, or on a phone a tap on its quiet button. */
async function closeCard(): Promise<void> {
  if (device === 'phone') {
    const btn = page.locator('.modal.in .btn').filter({ hasText: /Stay here|Done/ });
    await btn.first().tap();
    if (touch) touch.down = false;
    await page.waitForTimeout(300);
  } else await back();
}

/** Interact (E, A, OK or the Action button). */
/** A press long enough for a slow software-rendered frame to see it (the pad is polled once a frame). */
const press = (b: 'interact' | 'kick') => (device === 'pad' ? w.hold(b, 280) : w.act(b));
const back = async () => {
  if (device === 'pad') {
    await page.evaluate(() => ((window as any).__pad.buttons[1] = 1));
    await page.waitForTimeout(280);
    await page.evaluate(() => ((window as any).__pad.buttons[1] = 0));
    await page.waitForTimeout(150);
  } else await w.back();
};
const act = async () => {
  // Lift the stick finger first: the harness's tap ends every touch at once.
  if (touch?.down) await stop();
  await press('interact');
  // A tap lifts every finger, including the one on the stick.
  if (touch) touch.down = false;
};
/** Kick: F, X, the Kick button; the remote kicks with OK. */
const kick = async () => {
  if (touch?.down) await stop();
  await (device === 'remote' ? w.act('interact') : press('kick'));
  if (touch) touch.down = false;
};

// ---------------------------------------------------------------------------
// Arrival

await page.waitForTimeout(1200);
await shot('flyover');
let e = await exp();
if (!e.cine) throw new Error('No arrival flyover on the first visit');
await page.waitForTimeout(1600);
await shot('flyover-planet');
await act(); // skip
await until(async () => w.menuOpen(), 'intro card');
await shot('intro-card');
await confirm();
await until(async () => !(await w.menuOpen()), 'intro closed');
await page.waitForTimeout(600);
await shot('hub');
e = await exp();
if (e.round?.id !== 'wake') throw new Error(`Tutorial did not start: ${JSON.stringify(e.round)}`);

// ---------------------------------------------------------------------------
// Wake it up: five real kicks.

if (stages.has('wake')) {
  const BH = { x: 24, z: -62 };
  for (let n = 0; n < 5; n++) {
    await until(async () => (await exp()).orbs.some((o: any) => o.state === 'ground'), 'an orb on the hub');
    const nearest = async (back = 1.0) => {
      const orbs = (await exp()).orbs.filter((o: any) => o.state === 'ground');
      const o = orbs[0];
      const a = Math.atan2(BH.x - o.x, BH.z - o.z);
      return { o, a, behind: { x: o.x - Math.sin(a) * back, z: o.z - Math.cos(a) * back } };
    };
    if (n === 0) {
      // Walk up to the first orb for real (walking into it nudges it along).
      await steer(async () => (await nearest(2)).behind, async () => {
        const b = (await nearest(2)).behind;
        const s = await st();
        return Math.hypot(s.x - b.x, s.z - b.z) < 0.9;
      }, 'behind the first orb', 20000, 0.5);
    }
    const { a, behind } = await nearest();
    // Face the black hole and kick (teleport only lines the player up).
    await w.dbg('teleport', behind.x, behind.z, a);
    await page.waitForTimeout(250);
    const before = (await exp()).round?.fed ?? 0;
    const s = await st();
    if (!s.prompt?.includes('orb') && device === 'remote') log('prompt', s.prompt);
    await kick();
    await until(async () => ((await exp()).round?.fed ?? 5) > before || (await exp()).wakeStar, `orb ${n + 1} swallowed`, 20000);
    if (n === 0) await shot('first-kick');
  }
  await until(async () => (await exp()).wakeStar?.landed, 'the wake star lands', 15000);
  await shot('wake-star');
  const ws = (await exp()).wakeStar;
  await steer(async () => ws, async () => !(await exp()).wakeStar, 'walk into the wake star', 20000, 0.1);
  await page.waitForTimeout(700);
  await shot('star-into-hole');
  await settle();
  await until(async () => (await exp()).total >= 1 && (await exp()).fed >= 1, 'first star fed');
  e = await exp();
  log('after wake', e.total, 'hole', e.holeRadius.toFixed(2));
  if (e.holeRadius <= 4.6) throw new Error('The black hole did not grow');
} else {
  await w.call('debugGrant', 1);
}

// ---------------------------------------------------------------------------
// Ringworld: sling over, then a two-lap ring run.

async function slingTo(pad: { x: number; z: number }, zone: string, top: number): Promise<void> {
  await steer(async () => pad, async () => {
    const s = await st();
    return Math.hypot(s.x - pad.x, s.z - pad.z) < 1.0;
  }, `the ${zone} sling pad`, 30000, 0.3);
  await page.waitForTimeout(200);
  const s = await st();
  if (!s.prompt?.startsWith('Fly to')) throw new Error(`No sling prompt at the pad: ${s.prompt}`);
  await act();
  await until(async () => (await exp()).carry === 'sling', 'sling flight starts', 5000);
  await page.waitForTimeout(900);
  await shot(`sling-${zone}`);
  await until(async () => {
    const x = await exp();
    const y = (await st()).y;
    return !x.carry && x.zone === zone && Math.abs(y - top) < 0.05 && (await st()).grounded;
  }, `land on ${zone}`, 15000);
}

if (stages.has('ring')) {
  await slingTo(HUB.slings.ring, 'ring', RING.top);
  await page.waitForTimeout(600);
  await shot('ringworld');
  // To the start pad and start.
  await until(async () => (await st()).prompt === 'Start the ring run', 'start prompt', 4000).catch(async () => {
    const sp = (await exp()).spark;
    await steer(async () => sp, async () => (await st()).prompt === 'Start the ring run', 'start pad', 15000, 0.3);
  });
  await act();
  await page.waitForTimeout(400);
  if (await w.menuOpen()) {
    await shot('ring-intro');
    await confirm();
  }
  await until(async () => (await exp()).round?.state === 'run', 'ring run starts', 10000);
  await shot('ring-go');
  const t0 = Date.now();
  let lapShot = false;
  const gates = ringGates();
  await steer(
    async () => {
      // Aim a little past the next gate's middle so the line is always crossed.
      const r = (await exp()).round;
      if (!r) return null;
      const g = gates[r.next];
      return g ? ringPoint(g.s + 2.5, (g.r0 + g.r1) / 2) : ringPoint(RING_FINISH_S + 3, RING.mid);
    },
    async () => {
      const r = (await exp()).round;
      if (r?.next >= 16 && !lapShot) {
        lapShot = true;
        await shot('ring-lap2');
      }
      return !r || r.state === 'done';
    },
    'ring run',
    150000,
    0.2,
  );
  log('ring run took', ((Date.now() - t0) / 1000).toFixed(1), 's real');
  await until(async () => w.menuOpen(), 'ring results', 15000);
  e = await exp();
  await shot('ring-results');
  log('ring', JSON.stringify(e.round), 'best', e.bests.ring);
  if (e.bests.ring === null) throw new Error('Ring run time not saved');
  // Close the card and stay here; the stars fly into the black hole.
  await closeCard();
  await settle();
  await page.waitForTimeout(500);
  e = await exp();
  if (e.stars.ring < 1) throw new Error('No ring star');
  if (e.boards.ring < 1) throw new Error('Ring run did not reach the board');
}

// ---------------------------------------------------------------------------
// The star net: walk off the edge of the ring.

if (stages.has('net')) {
  await w.call('debugWarp', 'ring');
  await page.waitForTimeout(400);
  const s0 = await st();
  // Walk inward, off the inner edge into the void.
  await steer(async () => ({ x: RING.cx, z: RING.cz }), async () => (await exp()).carry === 'net', 'fall off the ring', 15000, 0.1);
  await shot('star-net');
  await until(async () => !(await exp()).carry && (await st()).grounded, 'net brings you back', 8000);
  const s1 = await st();
  if (Math.abs(s1.y - RING.top) > 0.05) throw new Error(`Star net did not return to the ring top: ${s1.y}`);
  log('net from', s0.x.toFixed(1), s0.z.toFixed(1), 'back at', s1.x.toFixed(1), s1.z.toFixed(1));
}

// ---------------------------------------------------------------------------
// Rock rain on Cinder (shortened round, real movement).

if (stages.has('storm')) {
  await w.call('debugGrant', Math.max(3, (await exp()).total));
  await w.call('debugWarp', 'hub');
  await page.waitForTimeout(300);
  await slingTo(HUB.slings.storm, 'storm', 3);
  await page.waitForTimeout(400);
  await shot('cinder');
  await w.call('debugShortRound', 40);
  const sp = (await exp()).spark;
  await steer(async () => sp, async () => (await st()).prompt === 'Start the rock rain', 'rock rain pad', 15000, 0.3);
  await act();
  await page.waitForTimeout(400);
  if (await w.menuOpen()) await confirm();
  await until(async () => (await exp()).round?.state === 'run', 'rock rain starts', 10000);
  await page.waitForTimeout(3500);
  await shot('rock-rain');
  let warnShot = false;
  await steer(
    async () => {
      // Step out of any ring about to be hit; otherwise go for the shard Spark points at.
      const x = await exp();
      const s = await st();
      const danger = (x.round?.warnings ?? []).find((m: any) => m.left < 1.0 && Math.hypot(s.x - m.x, s.z - m.z) < m.r + 0.6);
      if (danger) {
        const dx = s.x - danger.x;
        const dz = s.z - danger.z;
        const l = Math.hypot(dx, dz) || 1;
        return { x: s.x + (dx / l) * 3, z: s.z + (dz / l) * 3 };
      }
      return x.spark;
    },
    async () => {
      const r = (await exp()).round;
      if (r?.meteors > 1 && !warnShot) {
        warnShot = true;
        await shot('meteors');
      }
      return !r || r.state === 'done';
    },
    'rock rain',
    70000,
    0.2,
  );
  await until(async () => w.menuOpen(), 'storm results', 15000);
  e = await exp();
  await shot('storm-results');
  log('storm', JSON.stringify(e.round));
  await closeCard();
  await settle();
  e = await exp();
  log('storm stars', e.stars.storm, 'best', e.bests.storm);
  if (e.stars.storm < 1) throw new Error('No rock rain star');
  await w.call('debugShortRound', 0);
}

// ---------------------------------------------------------------------------
// Comet surf: steer toward the next stardust.

if (stages.has('comet')) {
  await w.call('debugGrant', Math.max(6, (await exp()).total));
  await w.call('debugWarp', 'comet');
  await page.waitForTimeout(500);
  await shot('comet-dock');
  const ride = (await exp()).spark;
  await steer(async () => ride, async () => (await st()).prompt === 'Ride the comet', 'the comet', 15000, 0.3);
  await act();
  await page.waitForTimeout(400);
  if (await w.menuOpen()) await confirm();
  await until(async () => (await exp()).round?.state === 'run', 'comet ride starts', 10000);
  let spun = false;
  const shots = new Set<number>();
  const end = Date.now() + 90000;
  while (Date.now() < end) {
    const r = (await exp()).round;
    if (!r || r.state !== 'run') break;
    const n = r.next;
    if (n) {
      const dx = n.ox - r.ox;
      const dy = n.oy - r.oy;
      const l = Math.hypot(dx, dy);
      await input(l > 0.25 ? dx / Math.max(l, 1) : 0, l > 0.25 ? dy / Math.max(l, 1) : 0);
      if (process.env.DEBUG_COMET && Math.random() < 0.1) log('comet steer', r.u.toFixed(3), 'at', r.ox.toFixed(2), r.oy.toFixed(2), 'want', n.ox.toFixed(2), n.oy.toFixed(2));
    }
    const q = Math.floor(r.u * 5);
    if (!shots.has(q) && q > 0 && q < 5) {
      shots.add(q);
      await shot(`comet-${q}`);
    }
    if (!spun && r.u > 0.3 && r.cooldown === 0) {
      spun = true;
      await act();
    }
    await page.waitForTimeout(60);
  }
  await stop();
  await until(async () => w.menuOpen(), 'comet results', 20000);
  e = await exp();
  await shot('comet-results');
  log('comet', JSON.stringify(e.round));
  await closeCard();
  await settle();
  e = await exp();
  if (e.stars.comet < 1) throw new Error(`No comet star: ${e.bests.comet}`);
}

// ---------------------------------------------------------------------------
// A short frenzy that reaches the board.

if (stages.has('frenzy')) {
  await w.call('debugWarp', 'hub');
  await page.waitForTimeout(400);
  await w.call('debugShortRound', 20);
  await steer(async () => HUB.shrine, async () => (await st()).prompt === 'Start a feeding frenzy', 'the frenzy shrine', 20000, 1.2);
  await act();
  await page.waitForTimeout(400);
  if (await w.menuOpen()) await confirm();
  await until(async () => (await exp()).round?.state === 'run', 'frenzy starts', 10000);
  await shot('frenzy');
  const BH = { x: 24, z: -62 };
  while ((await exp()).round?.state === 'run') {
    const o = (await exp()).orbs.find((x: any) => x.state === 'ground');
    if (!o) {
      await page.waitForTimeout(150);
      continue;
    }
    const a = Math.atan2(BH.x - o.x, BH.z - o.z);
    await w.dbg('teleport', o.x - Math.sin(a) * 1.0, o.z - Math.cos(a) * 1.0, a);
    await page.waitForTimeout(120);
    await kick();
  }
  await until(async () => w.menuOpen(), 'frenzy results', 15000);
  e = await exp();
  await shot('frenzy-results');
  log('frenzy', JSON.stringify(e.round), 'board', e.boards.frenzy);
  if (e.boards.frenzy < 1) throw new Error('Frenzy did not reach the board');
  await closeCard();
  await settle();
  await w.call('debugShortRound', 0);
}

// ---------------------------------------------------------------------------
// Lost moons: the shelf off the ring (a walk) and the ledge past the dock (a secret blossom).

if (stages.has('moons')) {
  await w.call('debugGrant', 6);
  await w.call('debugWarp', 'ring');
  await page.waitForTimeout(500);
  const before = (await exp()).moons ?? 0;
  const shelf = ringPoint(RING_SHELF.s, RING_SHELF.r);
  // Walk round the ring to the shelf (it sits past the second gap, so the blossoms carry you).
  await steer(
    async () => {
      const s = await st();
      const c = Math.atan2(s.z - RING.cz, s.x - RING.cx);
      const t = Math.atan2(shelf.z - RING.cz, shelf.x - RING.cx);
      let d = c - t;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      // Follow the middle of the walkway until close, then step out onto the shelf.
      if (Math.abs(d) > 0.12) {
        const p = ringPoint(0, RING.mid);
        const a0 = Math.atan2(p.z - RING.cz, p.x - RING.cx);
        const now = (((a0 - c) * 180) / Math.PI + 360) % 360;
        return ringPoint(now + 12, RING.mid);
      }
      return shelf;
    },
    async () => ((await exp()).moons ?? 0) > before,
    'the ring shelf moon',
    90000,
    0.1,
  );
  await page.waitForTimeout(400);
  await shot('moon-shelf');
  await w.call('debugWarp', 'comet');
  await page.waitForTimeout(500);
  const dockB = { x: DOCK_LEDGE.x, z: DOCK.z + DOCK.r - 1.4 };
  await steer(async () => ({ x: dockB.x, z: dockB.z + 2 }), async () => (await exp()).carry === 'hop', 'the dock blossom', 20000, 0);
  await until(async () => ((await exp()).moons ?? 0) > before + 1, 'the dock ledge moon', 10000);
  await shot('moon-ledge');
  log('moons', (await exp()).moons);
}

// ---------------------------------------------------------------------------
// The Horizon stair by bounce blossoms, then the finale.

if (stages.has('horizon')) {
  await w.call('debugGrant', 12);
  await w.call('debugWarp', 'hub');
  await page.waitForTimeout(800);
  await shot('horizon-open');
  await steer(async () => HUB.horizon, async () => (await exp()).carry === 'hop', 'the horizon blossom', 25000, 0);
  await until(async () => !(await exp()).carry && (await st()).grounded, 'land on the first stone', 8000);
  for (let i = 0; i < STAIR.length - 1; i++) {
    const s = STAIR[i];
    const n = STAIR[i + 1];
    const yaw = Math.atan2(n.x - s.x, n.z - s.z);
    const off = s.r - 0.75;
    // Aim past the blossom, toward the next stone, so the hop is in the blossom's direction.
    const tgt = { x: s.x + Math.sin(yaw) * (off + 1.5), z: s.z + Math.cos(yaw) * (off + 1.5) };
    await steer(async () => tgt, async () => (await exp()).carry === 'hop', `blossom on stone ${i}`, 20000, 0);
    await until(async () => !(await exp()).carry && (await st()).grounded, `land on stone ${i + 1}`, 8000);
    if (i === 4) await shot('stair');
    const y = (await st()).y;
    if (Math.abs(y - n.y) > 0.05) throw new Error(`Missed stone ${i + 1}: y ${y}`);
  }
  await shot('lip');
  await until(async () => (await st()).prompt === 'Step into the black hole', 'step in prompt', 4000);
  await act();
  await page.waitForTimeout(1500);
  await shot('finale-fall');
  await page.waitForTimeout(2200);
  await shot('finale-warp');
  await until(async () => (await exp()).round?.stage === 'bloom', 'the bloom', 15000);
  await page.waitForTimeout(1200);
  await shot('bloom');
  await until(async () => !(await exp()).round, 'finale ends', 15000);
  e = await exp();
  if (!e.bloomed) throw new Error('The galaxy did not bloom');
  await page.waitForTimeout(800);
  await shot('after-bloom');
}

// ---------------------------------------------------------------------------
// Graphics tiers: frame times and draw calls on the hub.

if (stages.has('tiers')) {
  await w.call('debugWarp', 'hub');
  for (const q of ['high', 'medium', 'low'] as const) {
    await w.dbg('setQuality', q);
    await page.waitForTimeout(2500);
    const s = await w.dbg<any>('state');
    const d = (await exp()).draw;
    log(`tier ${q}: fps ${s.fps?.toFixed?.(1)} p75 ${s.p75?.toFixed?.(1)}ms draw calls ${d.calls} triangles ${d.triangles}`);
    await shot(`tier-${q}`);
  }
  await w.dbg('setQuality', 'auto');
}

// ---------------------------------------------------------------------------
// Leave: the remote uses the menu; everyone else walks into the vortex.

if (stages.has('leave')) {
  await w.call('debugWarp', 'hub');
  await page.waitForTimeout(400);
  if (device === 'remote') {
    await back();
    await until(async () => w.menuOpen(), 'pause menu', 4000);
    const labels: string[] = await page.evaluate(() => [...document.querySelectorAll('.modal.in .btn')].map((b) => b.textContent ?? ''));
    const idx = labels.findIndex((l) => l.startsWith('Back to') && l.includes('room'));
    for (let i = 0; i < idx; i++) await w.dir('down');
    await confirm();
  } else {
    await steer(async () => HUB.exit, async () => (await st()).prompt?.startsWith('Back to') ?? false, 'the exit vortex', 20000, 1.0);
    await act();
  }
  await until(async () => (await st()).space === 'room', 'back in the room', 10000);
}

await w.done('Galaxy playtest passed');
