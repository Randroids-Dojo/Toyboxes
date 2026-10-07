// Little rewards you can wear in this galaxy (only here, and only on this
// device): a stardust trail at 5 stars, a trail in the drawing's six streak
// colours at 10, a tiny orbiting moon once all eight lost moons are found,
// and a green ring halo like the planet's after the bloom.

import * as THREE from 'three';
import type { Particles } from '../kit';
import { Ribbon } from '../kit';
import { STREAK_COLORS } from './sky';

export type SparkleId = 'none' | 'dust' | 'rainbow' | 'moon' | 'halo';

export const SPARKLE_NAME: Record<SparkleId, string> = { none: 'None', dust: 'Stardust trail', rainbow: 'Streak trail', moon: 'Tiny moon', halo: 'Ring halo' };

export function unlockedSparkles(total: number, moons: number, bloomed: boolean): SparkleId[] {
  const out: SparkleId[] = ['none'];
  if (total >= 5) out.push('dust');
  if (total >= 10) out.push('rainbow');
  if (moons >= 8) out.push('moon');
  if (bloomed) out.push('halo');
  return out;
}

export class Sparkle {
  private id: SparkleId = 'none';
  private ribbons: Ribbon[] = [];
  private moon: THREE.Mesh;
  private halo: THREE.Mesh;
  private t = 0;

  constructor(
    private scene: THREE.Scene,
    private glows: Particles,
  ) {
    this.moon = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshStandardMaterial({ color: '#e8e4ff', emissive: new THREE.Color('#b9b0ff'), emissiveIntensity: 1, flatShading: true }));
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#7dffc8').multiplyScalar(1.3) }));
    this.moon.visible = this.halo.visible = false;
    scene.add(this.moon, this.halo);
  }

  get current(): SparkleId {
    return this.id;
  }

  set(id: SparkleId): void {
    this.id = id;
    for (const r of this.ribbons) r.dispose();
    this.ribbons = [];
    if (id === 'rainbow') for (const c of STREAK_COLORS.slice(0, 4)) this.ribbons.push(new Ribbon(this.scene, { length: 26, width: 0.12, color: new THREE.Color(c).getHex(), life: 0.7, minStep: 0.08 }));
    this.moon.visible = id === 'moon';
    this.halo.visible = id === 'halo';
  }

  update(dt: number, at: THREE.Vector3, yaw: number, speed: number, camera: THREE.Camera, hidden: boolean): void {
    this.t += dt;
    if (this.id === 'dust' && speed > 1 && !hidden) {
      this.glows.stream({ at: { x: at.x, y: at.y + 0.25, z: at.z }, count: 1, rate: 30, shape: 'up', speed: [0.2, 0.8], color: [0xf4b740, 0xb18cff], size: [0.1, 0.22], life: [0.5, 1], gravity: -0.3 }, dt);
    }
    if (this.id === 'rainbow') {
      const back = new THREE.Vector3(-Math.sin(yaw) * 0.25, 0, -Math.cos(yaw) * 0.25);
      const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      this.ribbons.forEach((r, i) => {
        if (!hidden && speed > 0.5) r.push({ x: at.x + back.x + side.x * (i - 1.5) * 0.12, y: at.y + 0.5 + i * 0.12, z: at.z + back.z + side.z * (i - 1.5) * 0.12 });
        r.update(dt, camera);
      });
    }
    if (this.id === 'moon') {
      const a = this.t * 2.2;
      this.moon.position.set(at.x + Math.cos(a) * 0.7, at.y + 1.75 + Math.sin(this.t * 3) * 0.08, at.z + Math.sin(a) * 0.7);
      this.moon.rotation.y += dt * 2;
      this.moon.visible = !hidden;
    }
    if (this.id === 'halo') {
      this.halo.position.set(at.x, at.y + 1.95 + Math.sin(this.t * 2) * 0.04, at.z);
      this.halo.rotation.set(Math.PI / 2 - 0.35, 0, this.t * 0.8);
      this.halo.visible = !hidden;
    }
  }

  dispose(): void {
    for (const r of this.ribbons) r.dispose();
  }
}
