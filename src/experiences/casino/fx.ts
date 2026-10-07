// Effects shared by every game on the boat: real coins that arc, bounce and
// (after big wins) stay on the carpet to be kicked about, and the kit's
// particle systems for steam, sparks, glow and confetti.

import * as THREE from 'three';
import type { Tier } from '../../world/space';
import { Particles } from '../kit';
import { colliderGap, type ColliderDef } from './layout';

interface Coin {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  rz: number;
  spin: number;
  life: number;
  /** Coins that stay on the floor until you leave. */
  keep: boolean;
  resting: boolean;
}

/** Seeded so the coin pile lands the same way in a replayed test. */
function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_COINS: Record<Tier, number> = { low: 120, medium: 400, high: 700 };

export class Fx {
  readonly steam: Particles;
  readonly sparks: Particles;
  readonly glow: Particles;
  readonly confetti: Particles;
  private coinMesh: THREE.InstancedMesh;
  private coins: Coin[] = [];
  private max = MAX_COINS.medium;
  private rnd = mulberry(1234);
  private dummy = new THREE.Object3D();
  private owned: { dispose(): void }[] = [];
  /** Things coins bounce off on the floor (tables, walls). */
  colliders: ColliderDef[] = [];

  constructor(private scene: THREE.Scene) {
    this.steam = new Particles(scene, { max: 900, look: 'smoke' });
    this.sparks = new Particles(scene, { max: 1600, look: 'spark' });
    this.glow = new Particles(scene, { max: 900, look: 'glow' });
    this.confetti = new Particles(scene, { max: 1600, look: 'confetti' });
    const geo = new THREE.CylinderGeometry(0.09, 0.09, 0.022, 14);
    const mat = new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 0.8, roughness: 0.3, emissive: new THREE.Color('#5a3a08'), emissiveIntensity: 0.4 });
    this.owned.push(geo, mat);
    this.coinMesh = new THREE.InstancedMesh(geo, mat, MAX_COINS.high);
    this.coinMesh.count = 0;
    this.coinMesh.castShadow = true;
    this.coinMesh.frustumCulled = false;
    scene.add(this.coinMesh);
  }

  setQuality(t: Tier): void {
    this.max = MAX_COINS[t];
    for (const p of [this.steam, this.sparks, this.glow, this.confetti]) p.setQuality(t);
    this.coinMesh.castShadow = t !== 'low';
    if (this.coins.length > this.max) this.coins.splice(0, this.coins.length - this.max);
  }

  /** A burst of coins from a point, thrown in a direction. `keep` leaves them on the floor. */
  coinBurst(at: { x: number; y: number; z: number }, count: number, dir: { x: number; z: number }, opts: { speed?: number; spread?: number; keep?: boolean; up?: number } = {}): void {
    const r = this.rnd;
    const speed = opts.speed ?? 3;
    const spread = opts.spread ?? 1;
    for (let i = 0; i < count; i++) {
      if (this.coins.length >= this.max) {
        // Recycle the oldest coin that is not part of a pile.
        const k = this.coins.findIndex((c) => !c.keep);
        if (k < 0) break;
        this.coins.splice(k, 1);
      }
      const a = (r() - 0.5) * spread * 2;
      const s = speed * (0.5 + r() * 0.8);
      const dx = dir.x * Math.cos(a) - dir.z * Math.sin(a);
      const dz = dir.x * Math.sin(a) + dir.z * Math.cos(a);
      this.coins.push({
        x: at.x + (r() - 0.5) * 0.3,
        y: at.y,
        z: at.z + (r() - 0.5) * 0.1,
        vx: dx * s,
        vy: (opts.up ?? 3) * (0.6 + r() * 0.7),
        vz: dz * s,
        rx: r() * 6,
        rz: r() * 6,
        spin: (r() - 0.5) * 30,
        life: opts.keep ? Infinity : 3.5 + r() * 1.5,
        keep: !!opts.keep,
        resting: false,
      });
    }
  }

  /** Kicks the coins near a point away from it (the player's Kick, or walking through). */
  push(x: number, z: number, radius: number, power: number, up = 0): number {
    let n = 0;
    for (const c of this.coins) {
      const dx = c.x - x;
      const dz = c.z - z;
      const d = Math.hypot(dx, dz);
      if (d > radius || d < 1e-4) continue;
      const k = (1 - d / radius) * power;
      c.vx += (dx / d) * k;
      c.vz += (dz / d) * k;
      c.vy += up * (0.5 + this.rnd() * 0.5) * (1 - d / radius);
      c.resting = false;
      n++;
    }
    return n;
  }

  get coinCount(): number {
    return this.coins.length;
  }

  get pileCount(): number {
    return this.coins.filter((c) => c.keep).length;
  }

  clearPile(): void {
    this.coins = this.coins.filter((c) => !c.keep);
  }

  update(dt: number): void {
    for (const p of [this.steam, this.sparks, this.glow, this.confetti]) p.update(dt);
    const g = 13;
    let w = 0;
    for (const c of this.coins) {
      c.life -= dt;
      if (c.life <= 0) continue;
      if (!c.resting) {
        c.vy -= g * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        c.rx += c.spin * dt;
        c.rz += c.spin * 0.7 * dt;
        if (c.y < 0.011) {
          c.y = 0.011;
          if (Math.abs(c.vy) > 1.2) {
            c.vy = -c.vy * 0.38;
            c.vx *= 0.7;
            c.vz *= 0.7;
            c.spin *= 0.6;
          } else {
            c.vy = 0;
            c.vx *= 0.86;
            c.vz *= 0.86;
            // Settle flat.
            c.rx += (Math.round(c.rx / Math.PI) * Math.PI - c.rx) * 0.3;
            c.rz += (Math.round(c.rz / Math.PI) * Math.PI - c.rz) * 0.3;
            if (Math.hypot(c.vx, c.vz) < 0.05) c.resting = true;
          }
        }
        for (const col of this.colliders) {
          if (c.y > col.h) continue;
          const gap = colliderGap(col, c.x, c.z, 0.09);
          if (gap < 0) {
            // Step back along the velocity and bounce.
            c.x -= c.vx * dt;
            c.z -= c.vz * dt;
            c.vx *= -0.4;
            c.vz *= -0.4;
          }
        }
      }
      this.coins[w++] = c;
    }
    this.coins.length = w;
    const n = Math.min(this.coins.length, this.coinMesh.instanceMatrix.count);
    for (let i = 0; i < n; i++) {
      const c = this.coins[i];
      this.dummy.position.set(c.x, c.y, c.z);
      this.dummy.rotation.set(c.rx, 0, c.rz);
      const fade = c.life < 0.4 ? c.life / 0.4 : 1;
      this.dummy.scale.setScalar(fade);
      this.dummy.updateMatrix();
      this.coinMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.coinMesh.count = n;
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const p of [this.steam, this.sparks, this.glow, this.confetti]) p.dispose();
    this.scene.remove(this.coinMesh);
    this.coinMesh.dispose();
    for (const o of this.owned) o.dispose();
  }
}
