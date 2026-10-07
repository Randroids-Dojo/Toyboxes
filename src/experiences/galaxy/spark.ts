// Spark, the little comet that shows the way: it flies to the next useful
// thing and circles it. When that is off screen, a sky-blue arrow at the
// edge of the screen points to it.

import * as THREE from 'three';
import { h } from '../../ui/ui';
import { Ribbon } from '../kit';
import { glowSprite } from './props';

export class Spark {
  readonly pos = new THREE.Vector3(0, 2, 6);
  private vel = new THREE.Vector3();
  private core: THREE.Mesh;
  private halo: THREE.Mesh;
  private trail: Ribbon;
  private arrow: HTMLElement;
  private t = 0;
  target: THREE.Vector3 | null = null;
  /** A short label for the arrow ("Ringworld"). */
  label = '';

  constructor(
    scene: THREE.Scene,
    hud: HTMLElement,
  ) {
    this.core = glowSprite('#e6f6ff', 0.7, 1.2);
    this.halo = glowSprite('#6cc4ff', 2.4, 0.8);
    scene.add(this.core, this.halo);
    this.trail = new Ribbon(scene, { length: 28, width: 0.32, color: 0x6cc4ff, life: 0.5, minStep: 0.06 });
    this.arrow = h('div', { class: 'gx-arrow hidden' }, h('i'), h('span'));
    hud.appendChild(this.arrow);
  }

  /** Jump straight somewhere (on arrival). */
  place(p: THREE.Vector3): void {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.trail.clear();
  }

  update(dt: number, camera: THREE.PerspectiveCamera, player: THREE.Vector3, hidden: boolean): void {
    this.t += dt;
    const goal = new THREE.Vector3();
    if (this.target) {
      const r = 1.1;
      goal.set(this.target.x + Math.cos(this.t * 2.6) * r, this.target.y + 1.3 + Math.sin(this.t * 3.1) * 0.3, this.target.z + Math.sin(this.t * 2.6) * r);
    } else {
      // Hang about near your shoulder.
      goal.set(player.x + Math.cos(this.t * 1.3) * 1.4, player.y + 2.2 + Math.sin(this.t * 2) * 0.2, player.z + Math.sin(this.t * 1.3) * 1.4);
    }
    const to = goal.sub(this.pos);
    const d = to.length();
    const want = to.normalize().multiplyScalar(Math.min(16, d * 2.4));
    this.vel.lerp(want, Math.min(1, dt * 4));
    this.pos.addScaledVector(this.vel, dt);
    this.core.position.copy(this.pos);
    this.halo.position.copy(this.pos);
    this.core.quaternion.copy(camera.quaternion);
    this.halo.quaternion.copy(camera.quaternion);
    const pulse = 1 + Math.sin(this.t * 7) * 0.12;
    this.halo.scale.setScalar(2.4 * pulse);
    this.core.visible = this.halo.visible = !hidden;
    this.trail.push(this.pos);
    this.trail.update(dt, camera);
    this.trail.mesh.visible = !hidden;

    // The edge arrow, for targets off screen.
    const tgt = this.target;
    if (!tgt || hidden) {
      this.arrow.classList.add('hidden');
      return;
    }
    const v = tgt.clone().project(camera);
    const behind = v.z > 1;
    const on = !behind && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.88;
    if (on || tgt.distanceTo(player) < 4) {
      this.arrow.classList.add('hidden');
      return;
    }
    let x = v.x;
    let y = v.y;
    if (behind) {
      x = -x;
      y = -Math.abs(y) - 0.5;
    }
    const k = 1 / Math.max(Math.abs(x) / 0.86, Math.abs(y) / 0.8, 1e-3);
    x *= k;
    y *= k;
    const ang = Math.atan2(-y, x);
    this.arrow.classList.remove('hidden');
    this.arrow.style.left = `${((x + 1) / 2) * 100}%`;
    this.arrow.style.top = `${((1 - y) / 2) * 100}%`;
    (this.arrow.firstChild as HTMLElement).style.transform = `rotate(${ang}rad)`;
    const span = this.arrow.lastChild as HTMLElement;
    if (span.textContent !== this.label) span.textContent = this.label;
  }

  dispose(): void {
    this.trail.dispose();
    this.arrow.remove();
  }
}
