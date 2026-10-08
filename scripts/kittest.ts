// Smoke test for the worlds kit (src/experiences/kit): HUD pieces, particles,
// post-processing, music and the camera and input hooks, inside a real area.
import { openWorld } from './lib/world';

const w = await openWorld({ kind: 'neon', areaId: 'kit', name: 'Kit test', quality: 'high', out: '/tmp/toyboxes-kit' });
const { page } = w;

// Build the kit pieces against the live area and the game's own context.
const info = await page.evaluate(async () => {
  const g = (window as any).toyboxes;
  const kit = await import('/src/experiences/kit/index.ts' as string);
  const sv = g.space.interior;
  const ctx = g.experienceCtx(g.space.room, g.space.area);
  const hud = new kit.Hud(ctx, { accent: '#ff48c4', accent2: '#49d9ff', glow: true });
  hud.title('Kit test', 'Every piece, in one place');
  hud.strip([{ id: 'score', label: 'Score', value: '0' }, { id: 'time', label: 'Time', value: '1:00', wide: true }, { id: 'combo', label: 'Combo', value: 'x1' }]);
  hud.set('score', '1,250', { tone: 'hot' });
  hud.bar('time', 0.6);
  hud.objective('Tag three drones');
  hud.banner('Stage clear', { sub: 'Three stars' });
  hud.judge('Perfect', '#6ff0b0');
  hud.pop('+100', { x: 0, y: 1.5, z: 3 });
  const sparks = new kit.Particles(sv.scene, { max: 800, look: 'spark' });
  const confetti = new kit.Particles(sv.scene, { max: 400, look: 'confetti' });
  const ribbon = new kit.Ribbon(sv.scene, { color: 0x49d9ff, width: 0.4 });
  const rings = new kit.Shockwaves(sv.scene);
  sparks.burst({ at: { x: 0, y: 1.5, z: 2 }, count: 200, speed: [2, 6], color: [0xff48c4, 0x49d9ff], life: [0.8, 1.4], size: [0.08, 0.2], gravity: 2 });
  confetti.burst({ at: { x: 0, y: 3, z: 2 }, count: 160, shape: 'up', speed: [3, 7], color: [0xffd24a, 0xff48c4], size: [0.12, 0.2], life: [2, 3], gravity: 5, drag: 1.2, sizeEnd: 1 });
  rings.emit({ x: 0, y: 0.06, z: 2 }, { color: 0x49d9ff, radius: 4, life: 1.2 });
  for (let i = 0; i < 20; i++) ribbon.push({ x: Math.sin(i / 3) * 2, y: 1 + i * 0.05, z: 2 + Math.cos(i / 3) });
  const post = new kit.PostFX(sv.scene, { bloom: { strength: 0.9, threshold: 0.6 }, vignette: 0.4, saturation: 1.15, grain: 0.03, aberration: 0.004 });
  post.setQuality('high');
  // Take over the area's hooks for the duration of the test.
  sv.render = (r: any, cam: any) => post.render(r, cam);
  const origUpdate = sv.update.bind(sv);
  // Real elapsed time, so the countdown keeps pace when software rendering
  // drops to a few frames a second.
  let last = -1;
  sv.update = (n: number, t: number, p: number, f: any) => {
    origUpdate(n, t, p, f);
    const dt = last < 0 ? 1 / 60 : Math.min(0.25, Math.max(0, t - last));
    last = t;
    sparks.update(dt);
    confetti.update(dt);
    rings.update(dt);
    ribbon.update(dt, g.camera);
    hud.update(dt);
  };
  kit.music.play({
    name: 'kit-test',
    bpm: 120,
    sections: [
      { name: 'a', bars: 2, tracks: [
        { voice: 'kick', pattern: 'x...x...x...x...' },
        { voice: 'snare', pattern: '....x.......x...' },
        { voice: 'hat', pattern: 'x.x.x.x.x.x.x.x.' },
        { voice: 'bass', pattern: 'C2 . C2 . Eb2 . G1 .' },
        { voice: 'pad', pattern: 'Cm7 Abmaj7', every: 16, layer: 'pad' },
        { voice: 'lead', pattern: 'G4 - Eb4 - C4 - - .', layer: 'lead' },
        { voice: 'bell', pattern: 'C5 . . . . . . . . . . . . . . .' },
        { voice: 'tuba', pattern: 'C2 . . . G1 . . .' },
      ] },
    ],
    off: ['lead'],
  }, { fadeIn: 0.2 });
  (window as any).__kit = { hud, sparks, confetti, post, music: kit.music };
  return { sparks: sparks.count, confetti: confetti.count };
});
if (info.sparks < 50 || info.confetti < 40) throw new Error(`Particles did not spawn: ${JSON.stringify(info)}`);
await page.waitForTimeout(500);
await w.shot('kit-hud');

// The music clock advances on the audio clock.
const b0 = await page.evaluate(() => (window as any).__kit.music.beat());
await page.waitForTimeout(1500);
const b1 = await page.evaluate(() => (window as any).__kit.music.beat());
console.log(`music beat ${b0.toFixed(2)} -> ${b1.toFixed(2)}, playing ${await page.evaluate(() => (window as any).__kit.music.playing)}`);
if (!(b1 > b0 + 1.5 && b1 < b0 + 4.5)) throw new Error(`Music beat clock did not advance at 120 bpm: ${b0} -> ${b1}`);
await page.evaluate(() => (window as any).__kit.music.layer('lead', true));
// Pause holds the beat clock; resume carries on from it.
await page.evaluate(() => (window as any).__kit.music.pause());
const held = await page.evaluate(() => (window as any).__kit.music.beat());
await page.waitForTimeout(700);
const still = await page.evaluate(() => (window as any).__kit.music.beat());
if (Math.abs(still - held) > 1e-6) throw new Error(`Paused music clock moved: ${held} -> ${still}`);
await page.evaluate(() => (window as any).__kit.music.resume());
await page.waitForTimeout(600);
const moving = await page.evaluate(() => (window as any).__kit.music.beat());
if (!(moving > held + 0.4 && moving < held + 2)) throw new Error(`Resumed music clock: ${held} -> ${moving}`);

// A locked camera shot moves the camera, stops walking, and Interact skips it.
const before = await w.dbg('state');
await page.evaluate(() => {
  const g = (window as any).toyboxes;
  const sv = g.space.interior;
  const THREE = g.camera.position.constructor;
  (window as any).__skipped = false;
  sv.cameraShot = () => ((window as any).__skipped ? null : { position: new THREE(0, 12, 12), target: new THREE(0, 0, 0), fov: 40, lockPlayer: true, skip: () => ((window as any).__skipped = true), skipLabel: 'Skip intro' });
});
await page.waitForTimeout(300);
const cam = await page.evaluate(() => (window as any).toyboxes.camera.position.toArray());
if (Math.abs(cam[1] - 12) > 0.5) throw new Error(`Camera shot not applied: ${cam}`);
if (w.device !== 'phone') {
  await w.walk('up', 500);
  const after = await w.dbg('state');
  if (Math.hypot(after.x - before.x, after.z - before.z) > 0.05) throw new Error('Player moved during a locked shot');
}
if (w.device === 'phone') {
  const label = await page.locator('.tbtn-action').textContent();
  if (label !== 'Skip intro') throw new Error(`Touch skip label: ${label}`);
}
await w.shot('kit-shot');
await w.act();
if (!(await page.evaluate(() => (window as any).__skipped))) throw new Error('Interact did not skip the shot');

// Input capture: the game stops moving the player; the experience reads input.
await page.evaluate(() => {
  const g = (window as any).toyboxes;
  const sv = g.space.interior;
  (window as any).__taken = 0;
  sv.captureInput = () => ({ action: 'Hit', kick: null, jump: 'Spin', prompt: 'Hit on the beat' });
  const origStep = sv.step?.bind(sv);
  sv.step = (h: number, p: any) => {
    origStep?.(h, p);
    if (g.input.take('interact')) (window as any).__taken++;
  };
});
await page.waitForTimeout(200);
const p0 = await w.dbg('state');
if (w.device !== 'phone') await w.walk('left', 400);
const p1 = await w.dbg('state');
if (Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.05) throw new Error('Player moved during input capture');
await w.act();
await page.waitForTimeout(100);
if ((await page.evaluate(() => (window as any).__taken)) < 1) throw new Error('Captured interact never reached the experience');
if (w.device === 'phone') {
  const jump = await page.locator('.tbtn-jump').textContent();
  if (jump !== 'Spin') throw new Error(`Touch jump label under capture: ${jump}`);
}
await page.evaluate(() => {
  const sv = (window as any).toyboxes.space.interior;
  sv.captureInput = () => null;
});

// Carry: the world moves the player along a path with a pose, then hands back.
await page.evaluate(() => {
  const g = (window as any).toyboxes;
  const sv = g.space.interior;
  const ctx = g.experienceCtx(g.space.room, g.space.area);
  (window as any).__carryT = 0;
  sv.carry = (h: number) => {
    const w = window as any;
    if (w.__carryT > 1.2) return null;
    w.__carryT += h;
    const t = w.__carryT;
    return { x: Math.sin(t * 2) * 3, y: 2 + Math.sin(t * 3), z: 3 + Math.cos(t * 2) * 3, yaw: t * 2, pose: 'fly', speed: 6 };
  };
  // A held thing in the right hand (an empty group, made with the page's own three).
  ctx.hold(new g.avatar.root.constructor());
  if (g.avatar.hand.children.length !== 1) throw new Error('Hold did not attach to the hand');
});
await w.until(async () => (await w.dbg('state')).carried, 'carried', 5000);
const flying = await w.dbg('state');
if (flying.y < 0.8) throw new Error(`Carry did not lift the player: ${JSON.stringify(flying)}`);
await w.shot('kit-carry');
await w.until(async () => {
  const s = await w.dbg('state');
  return !s.carried && s.grounded;
}, 'landed after the carry', 8000);
await page.evaluate(() => {
  const g = (window as any).toyboxes;
  g.space.interior.carry = undefined;
  const ctx = g.experienceCtx(g.space.room, g.space.area);
  ctx.teleport(2, 2, 0);
  ctx.pose('dance');
  ctx.squash(0.3);
});
const tp = await w.dbg('state');
if (Math.hypot(tp.x - 2, tp.z - 2) > 0.05) throw new Error(`Teleport missed: ${JSON.stringify(tp)}`);
await page.evaluate(() => {
  const g = (window as any).toyboxes;
  g.experienceCtx(g.space.room, g.space.area).impulse(0, 6, 0);
});
await w.until(async () => (await w.dbg('state')).y > 0.5, 'impulse lifts the player', 3000);
await page.waitForTimeout(400);
await w.shot('kit-dance');
await page.evaluate(() => {
  const g = (window as any).toyboxes;
  g.experienceCtx(g.space.room, g.space.area).pose(null);
  g.experienceCtx(g.space.room, g.space.area).hold(null);
});

// Results card through UI.open, answered with this device's confirm.
const choice = page.evaluate(() =>
  (window as any).__kit.hud.results({
    title: 'Stage clear',
    subtitle: 'You beat the robots',
    stars: 2,
    rows: [{ label: 'Score', value: '1,250', best: true }, { label: 'Tags', value: '12' }],
    badges: ['New best!'],
    board: { title: 'Top scores', rows: [{ name: 'Tester', value: '1,250', you: true }, { name: 'Robot', value: '900' }] },
    buttons: [{ id: 'leave', label: 'Done' }, { id: 'again', label: 'Play again', primary: true }],
  }),
);
await page.waitForTimeout(1400);
await w.shot('kit-results');
await w.confirm();
if ((await choice) !== 'again') throw new Error(`Results card returned ${await choice}`);

// Countdown pauses with the game: it only advances through update().
await page.evaluate(() => {
  (window as any).__go = false;
  (window as any).__kit.hud.countdown(3).then(() => ((window as any).__go = true));
});
await w.until(() => page.evaluate(() => (window as any).__go), 'countdown reaches GO', 25000);
await page.evaluate(() => (window as any).__kit.music.stop());
await w.done(`Kit HUD, particles, post, music clock, camera shot, capture, results and countdown passed on ${w.device}`);
