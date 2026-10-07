// How the computer drivers race: follow the racing line, brake for corners
// by the speed plan, pass slower karts, aim for boost pads, drift through
// slow corners for a mini-turbo, ease off when far ahead of you (on the
// gentler classes, and said so in the help), and use items by their style.
// Every choice comes from the race's seeded random numbers.

import { clamp, damp, wrapAngle, type Collider } from '../../world/physics';
import { circle } from '../../world/physics';
import type { ItemId, SpeedClass } from '../../shared/kart/rules';
import type { DriverDef } from './drivers';
import { HW, type Circuit } from './circuit';
import { progress, type Racer } from './racer';

export interface AiWorld {
  c: Circuit;
  cls: SpeedClass;
  racers: Racer[];
  you: Racer;
  rnd: () => number;
  /** Racing for real (true), or cruising in free drive. */
  racing: boolean;
  /** Whether items are on. */
  items: boolean;
  /** A thrown thing heading for this racer, seconds away, or null. */
  threat(r: Racer): number | null;
  /** Uses the racer's item. */
  useItem(r: Racer): void;
  /** Hazard positions to avoid: s and sideways offset, now or soon. */
  danger(s: number): { off: number; width: number } | null;
}

export function driveCpu(r: Racer, w: AiWorld, dt: number, colliders: Collider[]): void {
  const v = r.kart;
  if (v.frozen || r.grab) {
    v.drive(dt, 0, 0, 1, colliders);
    return;
  }
  const inp = aiInputs(r, r.def!, w, dt);
  const others = w.racers.filter((o) => o !== r && !o.grab).map((o) => circle(o.kart.pos.x, o.kart.pos.z, o.kart.t.radius * 0.9, o.kart.pos.y + 1.1, 0.7, false));
  v.drive(dt, inp.throttle, inp.steer, inp.brake, colliders.concat(others));
  aiItems(r, w, dt);
}

/** What a driver with this style would press this step (also the playtests' autopilot for your kart). */
export function aiInputs(r: Racer, def: DriverDef, w: AiWorld, dt: number): { throttle: number; steer: number; brake: number } {
  const v = r.kart;
  const c = w.c;
  const ai = r.ai;
  const racing = w.racing && r.finishedAt === null;
  let skill = def.skill * (racing ? w.cls.skill : 0.9);
  let nerve = def.nerve * (racing ? w.cls.nerve : 0.9);
  if (racing && w.cls.catchup > 0) {
    // Keep the race close without making it a procession (explained in How to race).
    const gap = progress(r) - progress(w.you);
    if (gap > w.cls.catchup) {
      skill *= w.cls.ease;
      nerve *= w.cls.ease + 0.02;
    } else if (gap > w.cls.catchup * 0.5) {
      skill *= (1 + w.cls.ease) / 2;
      nerve *= (1 + w.cls.ease) / 2 + 0.01;
    } else if (gap < -45) nerve *= 1.04;
  }
  const speed = Math.max(0, v.speed);
  const look = 4 + speed * 0.45;
  const li = c.idx(r.s + look);
  ai.phase += dt;
  const wander = Math.sin(ai.phase * 0.37 + def.lane) * def.wander;
  let want = c.line[li] * 0.85 + def.lane * 0.5 * (1 - Math.min(1, Math.abs(c.line[li]) / 2)) + wander;
  // Go for a boost pad ahead, if this driver is the type.
  if (ai.padAim >= 0 && c.path.delta(r.s, c.pads[ai.padAim].s) < -3) ai.padAim = -1;
  if (ai.padAim < 0)
    c.pads.forEach((pd, i) => {
      const d = c.path.delta(r.s, pd.s);
      // On a ramp, everyone takes the pad: it is what clears the gap.
      const must = !!c.profile.raiseAt(pd.s)?.gap;
      if (d > 22 && d < 30 && (must || w.rnd() < def.daring * 0.08)) ai.padAim = i;
    });
  if (ai.padAim >= 0) want = c.pads[ai.padAim].off;
  // Pass a slower kart instead of running into it.
  ai.passFor = Math.max(0, ai.passFor - dt);
  for (const o of w.racers) {
    if (o === r) continue;
    const d = c.path.delta(r.s, o.s);
    if (d > 0.5 && d < 9 && Math.abs(o.off - ai.off) < 1.8 && o.kart.speed < speed + 1.5) {
      const room = o.off > 0 ? -1 : 1;
      ai.passOff = o.off + room * 2.4;
      ai.passFor = 0.9;
    }
  }
  if (ai.passFor > 0) want = ai.passOff;
  // Hazards: steer round them.
  const hz = w.danger(r.s + look * 0.8);
  if (hz && Math.abs(want - hz.off) < hz.width) want = hz.off + (want >= hz.off ? 1 : -1) * hz.width;
  // Raised decks are narrow in feel: keep to the middle.
  if (c.profile.walled(r.s + look)) want *= 0.3;
  want = clamp(want, -(HW - 1.1), HW - 1.1);
  ai.off += (want - ai.off) * damp(1.8, dt);
  const target = c.at(r.s + look, ai.off);
  const desired = Math.atan2(target.x - v.pos.x, target.z - v.pos.z);
  const steer = clamp(wrapAngle(desired - v.yaw) * 2.6, -1, 1);
  const cornerV = c.plan[c.idx(r.s + speed * 0.3)] * nerve;
  const cruise = v.t.maxSpeed * skill;
  let throttle: number;
  if (speed > cornerV + 0.6) throttle = -clamp((speed - cornerV) / 4, 0.15, 1);
  else if (v.boost > 0 || speed < Math.min(cruise, cornerV) - 0.2) throttle = 1;
  else throttle = 0;
  // On a ramp up to a gap, keep the speed up (the pad on it does the rest).
  const ramp = c.profile.raiseAt(r.s);
  if (ramp?.gap && c.path.delta(r.s, ramp.gap.s0) > 0 && speed < v.t.maxSpeed) throttle = 1;
  // Drift through slow corners for a mini-turbo.
  const corner = c.plan[c.idx(r.s + 8)] < v.t.maxSpeed * 0.8;
  // A drift cannot brake, so only start one at a sane speed for the corner, and give up if too fast.
  if (!ai.drifting && racing && corner && Math.abs(steer) > 0.4 && speed > 9 && speed < cornerV + 1 && !v.air && v.onRoad) ai.drifting = w.rnd() < 0.5 + def.nerve * 0.3;
  if (ai.drifting && (Math.abs(steer) < 0.15 || speed < 6 || !corner || speed > cornerV + 2.5)) ai.drifting = false;
  const brake = ai.drifting ? 1 : 0;
  return { throttle: ai.drifting ? Math.max(throttle, 0.6) : throttle, steer, brake };
}

function aiItems(r: Racer, w: AiWorld, dt: number): void {
  const ai = r.ai;
  const racing = w.racing && r.finishedAt === null;
  if (!w.items || !r.item || r.roulette > 0 || !racing) return;
  ai.holdFor += dt;
  if (ai.holdFor < w.cls.itemDelay) return;
  if (decide(r, w)) {
    w.useItem(r);
    ai.holdFor = 0;
  }
}

/** Whether to use the held item now, by its kind and this driver's style. */
function decide(r: Racer, w: AiWorld): boolean {
  const c = w.c;
  const it = r.item as ItemId;
  const style = r.def!.items;
  const ahead = w.racers.filter((o) => o !== r && o.finishedAt === null).map((o) => ({ o, d: c.path.delta(r.s, o.s) }));
  const inFront = ahead.filter((a) => a.d > 2 && a.d < 25 && Math.abs(a.o.off - r.off) < 2.4);
  const behind = ahead.filter((a) => a.d < -1 && a.d > -12);
  const straight = Math.abs(c.path.turnAhead(r.s, 25)) < 0.25;
  // The class makes some drivers slower to bother.
  if (w.rnd() > w.cls.itemChance * 0.05 + 0.02) return false;
  switch (it) {
    case 'spring':
    case 'triple':
      return straight && (style !== 'fair' || r.kart.speed > r.kart.t.maxSpeed * 0.9);
    case 'ball':
      return inFront.length > 0 || style === 'eager' || r.ai.holdFor > 12;
    case 'marbles':
      return behind.length > 0 || style === 'marbles' || r.ai.holdFor > 10;
    case 'bubble':
      return w.threat(r) !== null || style === 'defensive' || r.ai.holdFor > 15;
    case 'plane':
      return true;
  }
  return false;
}
