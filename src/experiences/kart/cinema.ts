// Directed camera shots: the circuit flyover, the grid pan, the finish
// orbit, the podium and the Grabber's wide hold. Each returns a camera
// position and target for a time into the shot.

import * as THREE from 'three';
import { EDGE, type Circuit } from './circuit';

export interface Shot {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

/** Smooth 0..1. */
function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** A sweep along the circuit: high over the infield, then down to the grid. */
export function flyover(c: Circuit, t: number, length: number, hero: THREE.Vector3 | null): Shot {
  const k = t / length;
  const L = c.length;
  const b = c.bounds;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  if (k < 0.55) {
    // Orbit high round the whole circuit, looking at its middle or its landmark.
    const a = -0.6 + k * 2.4;
    const r = span * 0.62;
    const pos = new THREE.Vector3(cx + Math.cos(a) * r, span * 0.42 - k * span * 0.2, cz + Math.sin(a) * r);
    const look = hero ? new THREE.Vector3(cx, 0, cz).lerp(hero, 0.35) : new THREE.Vector3(cx, 0, cz);
    return { pos, target: look, fov: 50 };
  }
  // Swoop down onto the start straight, along the road toward the grid.
  const u = ease((k - 0.55) / 0.45);
  const s0 = L * 0.12;
  const s = s0 - u * (s0 + 30);
  const f = c.frame(s);
  const a = c.at(s, 0);
  const high = (1 - u) * 26 + 5.5;
  const pos = new THREE.Vector3(a.x + f.tx * 10, high + a.y, a.z + f.tz * 10);
  const g = c.at(-20, 0);
  const target = new THREE.Vector3(a.x - f.tx * 20, a.y, a.z - f.tz * 20).lerp(new THREE.Vector3(g.x, 0.8, g.z), u);
  return { pos, target, fov: 50 + u * 5 };
}

/** A slow dolly down the grid from the front row to your slot at the back. */
export function gridPan(c: Circuit, t: number, length: number, slots: number): Shot {
  const u = ease(t / length);
  const front = c.grid(0).s;
  const back = c.grid(slots - 1).s;
  const s = front + 4 - (front + 4 - back) * u;
  const f = c.frame(s);
  const side = c.paddock.side;
  const q = c.at(s, side * (EDGE + 3.2));
  const look = c.at(s - 3, 0);
  return { pos: new THREE.Vector3(q.x + f.tx * 2, 2.2, q.z + f.tz * 2), target: new THREE.Vector3(look.x, 0.8, look.z), fov: 46 };
}

/** Circling a point: finishes and the podium. */
export function orbit(center: THREE.Vector3, t: number, radius: number, height: number, start = 0, speed = 0.35): Shot {
  const a = start + t * speed;
  return { pos: new THREE.Vector3(center.x + Math.sin(a) * radius, center.y + height, center.z + Math.cos(a) * radius), target: center.clone().add(new THREE.Vector3(0, 0.6, 0)), fov: 48 };
}
