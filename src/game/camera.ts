// Third-person follow camera. Free look from mouse, touch or right stick;
// eases back behind the player after a moment without look input; pulls in
// in front of walls outdoors and relies on the dollhouse cutaway indoors.

import * as THREE from 'three';
import { clamp, damp, rayFraction, wrapAngle, type Collider } from '../world/physics';

export interface Follow {
  x: number;
  z: number;
  height: number;
  /** Direction the player or vehicle faces. */
  heading: number;
  speed: number;
  riding: boolean;
}

export class CameraRig {
  yaw = Math.PI;
  pitch = 0.36;
  dist = 6.2;
  private shown = 6.2;
  private lastLook = -1e9;
  private target = new THREE.Vector3();
  /** Where the follow camera looks this frame. */
  readonly look = new THREE.Vector3();
  private inited = false;
  indoor = false;
  /** Seconds left of a small nudge, e.g. a hard bump. */
  private nudge = 0;
  /** Extra pitch used to see over walls, eased in and out. */
  private lift = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  snap(follow: Follow, yaw = follow.heading): void {
    this.yaw = yaw;
    this.pitch = this.indoor ? 0.62 : 0.4;
    this.lift = 0;
    this.inited = false;
    this.lastLook = -1e9;
  }

  bump(amount: number): void {
    this.nudge = Math.max(this.nudge, amount);
  }

  private trauma = 0;
  private shakeT = 0;

  /** Adds camera shake, 0 to 1; it fades by itself. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  /** Offsets the finished camera by the current shake. */
  applyShake(dt: number, reduceMotion: boolean): void {
    if (this.trauma <= 0) return;
    this.shakeT += dt;
    const s = this.trauma * this.trauma * (reduceMotion ? 0.2 : 1);
    const t = this.shakeT;
    const n = (f: number, o: number) => Math.sin(t * f + o) * 0.6 + Math.sin(t * f * 2.31 + o * 1.7) * 0.4;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.camera.position.addScaledVector(right, n(31, 1) * 0.32 * s).addScaledVector(up, n(37, 2) * 0.26 * s);
    this.camera.rotateZ(n(23, 3) * 0.045 * s);
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
  }

  update(dt: number, now: number, look: { x: number; y: number }, follow: Follow, colliders: Collider[], opts: { lookSpeed: number; invertY: boolean; autoCamera: boolean; reduceMotion: boolean }): void {
    const sens = opts.lookSpeed;
    if (look.x !== 0 || look.y !== 0) {
      this.yaw -= look.x * sens;
      this.pitch += look.y * sens * (opts.invertY ? -1 : 1);
      this.lastLook = now;
    }
    this.pitch = clamp(this.pitch, this.indoor ? 0.3 : 0.05, this.indoor ? 1.25 : 1.15);

    // Ease behind the heading while moving, after a pause in manual look.
    const idleLook = now - this.lastLook > (follow.riding ? 900 : 1600);
    if (opts.autoCamera && idleLook && follow.speed > 0.8) {
      const want = follow.heading;
      const rate = follow.riding ? 2.4 : 1.1;
      this.yaw += wrapAngle(want - this.yaw) * damp(rate * Math.min(1, follow.speed / 4), dt);
      if (follow.riding) this.pitch += (0.3 - this.pitch) * damp(1.2, dt);
    }

    const wantDist = this.indoor ? 7.4 : follow.riding ? 7.6 : this.dist;
    const tx = follow.x;
    const ty = follow.height;
    const tz = follow.z;
    if (!this.inited) {
      this.target.set(tx, ty, tz);
      this.shown = wantDist;
      this.inited = true;
    } else {
      const k = damp(follow.riding ? 14 : 18, dt);
      this.target.x += (tx - this.target.x) * k;
      this.target.y += (ty - this.target.y) * k;
      this.target.z += (tz - this.target.z) * k;
    }

    // Outdoors, a wall behind the player first lifts the camera to look over
    // it, and only then pulls it in.
    let pitch = this.pitch;
    let dist = wantDist;
    const dirFor = (p: number) => {
      const cp = Math.cos(p);
      return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(p), -Math.cos(this.yaw) * cp);
    };
    let dir = dirFor(pitch);
    if (!this.indoor) {
      let f = 1;
      // A wall nearer than the camera can pull in (you stand against it)
      // lets it lift further and look down from above instead.
      let top = 1.2;
      for (let i = 0; i < 8; i++) {
        dir = dirFor(pitch);
        const far = this.target.clone().addScaledVector(dir, wantDist);
        f = rayFraction(this.target.x, this.target.y, this.target.z, far.x, far.y, far.z, colliders);
        if (f > 0.8) break;
        if (wantDist * f - 0.3 < 1.6) top = 1.5;
        if (pitch >= top) break;
        pitch = Math.min(top, pitch + 0.2);
      }
      dist = Math.max(1.6, wantDist * f - 0.3);
    }
    const wantLift = pitch - this.pitch;
    this.lift += (wantLift - this.lift) * damp(wantLift > this.lift ? 10 : 2.5, dt);
    dir = dirFor(this.pitch + this.lift);
    // Pull in at once, ease back out.
    this.shown = dist < this.shown ? dist : this.shown + (dist - this.shown) * damp(3, dt);
    const pos = this.target.clone().addScaledVector(dir, this.shown);
    pos.y = Math.max(0.6, pos.y);
    if (!this.indoor) {
      // Never end up inside or behind a wall, even while the lift eases in.
      const f = rayFraction(this.target.x, this.target.y, this.target.z, pos.x, pos.y, pos.z, colliders);
      const len = pos.distanceTo(this.target);
      if (f < 1 && len > 0) pos.sub(this.target).multiplyScalar(Math.max(0.3, f * len - 0.3) / len).add(this.target);
    }
    if (this.nudge > 0 && !opts.reduceMotion) {
      this.nudge = Math.max(0, this.nudge - dt);
      const n = this.nudge * 0.25;
      pos.x += (Math.random() - 0.5) * n;
      pos.y += (Math.random() - 0.5) * n;
    }
    this.camera.position.copy(pos);
    this.look.set(this.target.x, this.target.y + 0.2, this.target.z);
    this.camera.lookAt(this.look);
  }

  /**
   * Overhead framing for the arrange editor. `coverPx` is how much of the
   * bottom of the screen a panel covers; the room is framed above it.
   */
  overhead(dt: number, halfW: number, halfD: number, coverPx: number): void {
    const cam = this.camera;
    const W = innerWidth;
    const H = innerHeight;
    const visible = Math.max(0.3, (H - coverPx) / H);
    cam.setViewOffset(W, H, 0, Math.round(coverPx / 2), W, H);
    const fov = THREE.MathUtils.degToRad(cam.fov);
    const tanV = Math.tan(fov / 2) * visible;
    const tanH = Math.tan(fov / 2) * cam.aspect;
    // Seen from the editor's tilt, the room's depth is foreshortened a little.
    const needW = (halfW + 0.6) / tanH;
    const needD = ((halfD + 0.8) * 0.9) / tanV;
    const d = Math.max(needW, needD);
    const want = new THREE.Vector3(0, d * 0.94, d * 0.34);
    cam.position.lerp(want, damp(6, dt));
    cam.lookAt(0, 0, 0.2);
    this.inited = false;
  }

  endOverhead(): void {
    this.camera.clearViewOffset();
  }
}
