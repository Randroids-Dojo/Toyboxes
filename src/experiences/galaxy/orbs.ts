// Glowing orbs on the hub: walk them along or kick them off the edge and the
// black hole pulls them in, bending them round its disk and stretching them
// as they fall. Two draw calls for every orb (cores and halos).

import * as THREE from 'three';
import { HUB_R, type OrbKind } from '../../shared/galaxy-rules';
import type { PlayerState } from '../../world/space';
import { DISK_NORMAL, type BlackHole } from './blackhole';
import * as S from './shaders';

export interface Orb {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  kind: OrbKind;
  state: 'spawning' | 'ground' | 'fly' | 'gone';
  t: number;
  /** A moonball's first kick only shoves it. */
  shoved: boolean;
  color: THREE.Color;
  /** Counts for the round in play. */
  scored: boolean;
}

const MAX = 28;
const PLAIN = ['#b18cff', '#53f0c0', '#6cc4ff'];
export const ORB_R: Record<OrbKind, number> = { plain: 0.32, gold: 0.38, moon: 0.55 };

export const HALO_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vUv = uv;
  vCol = instanceColor;
  vec3 centre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float s = length(instanceMatrix[0].xyz);
  vec4 mv = viewMatrix * vec4(centre, 1.0);
  mv.xy += position.xy * s;
  gl_Position = projectionMatrix * mv;
}`;

export const HALO_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float d = length(vUv * 2.0 - 1.0);
  float a = pow(max(0.0, 1.0 - d), 2.4);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol * a * 0.8, 1.0);
  gl_FragColor.rgb = pow(max(gl_FragColor.rgb, vec3(0.0)), vec3(2.2));
  #include <colorspace_fragment>
}`;

export class Orbs {
  list: Orb[] = [];
  private cores: THREE.InstancedMesh;
  private halos: THREE.InstancedMesh;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private n = 0;
  /** Called when the black hole swallows one. */
  onSwallow: (o: Orb) => void = () => {};
  /** Called when one rolls off the edge. */
  onLaunch: (o: Orb) => void = () => {};

  constructor(scene: THREE.Scene, uniforms: { uTime: { value: number } }) {
    this.cores = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 24, 16), new THREE.ShaderMaterial({ vertexShader: S.ORB_VERT, fragmentShader: S.ORB_FRAG, uniforms: { ...uniforms } }), MAX);
    this.cores.count = 0;
    this.cores.frustumCulled = false;
    this.halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), MAX);
    this.halos.count = 0;
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 6;
    // Make sure both have colour buffers from the start.
    this.cores.setColorAt(0, new THREE.Color());
    this.halos.setColorAt(0, new THREE.Color());
    scene.add(this.cores, this.halos);
  }

  get live(): Orb[] {
    return this.list.filter((o) => o.state !== 'gone');
  }

  get onHub(): number {
    return this.list.filter((o) => o.state === 'ground' || o.state === 'spawning').length;
  }

  spawn(x: number, z: number, kind: OrbKind, instant = false, scored = false): Orb | null {
    if (this.live.length >= MAX) return null;
    const color = new THREE.Color(kind === 'gold' ? '#f4b740' : kind === 'moon' ? '#e8e4ff' : PLAIN[this.n++ % PLAIN.length]);
    const o: Orb = { pos: new THREE.Vector3(x, ORB_R[kind], z), vel: new THREE.Vector3(), kind, state: instant ? 'ground' : 'spawning', t: 0, shoved: false, color, scored };
    this.list.push(o);
    return o;
  }

  clear(): void {
    this.list = [];
  }

  /** The orb you would kick: on the ground, in front, close. */
  nearestKickable(p: PlayerState): Orb | null {
    if (p.y > 0.5) return null;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    let best: Orb | null = null;
    let bd = 1.9;
    for (const o of this.list) {
      if (o.state !== 'ground') continue;
      const dx = o.pos.x - p.x;
      const dz = o.pos.z - p.z;
      const d = Math.hypot(dx, dz) - (ORB_R[o.kind] - 0.32);
      if (d < bd && ((dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1) > 0.1 || d < 0.8)) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  /** Kicks an orb along a heading. A moonball's first kick only shoves it. */
  kick(o: Orb, yaw: number): 'launch' | 'shove' {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    if (o.kind === 'moon' && !o.shoved) {
      o.shoved = true;
      o.vel.set(fx * 4.5, 0, fz * 4.5);
      return 'shove';
    }
    o.vel.set(fx * 13, 4.2, fz * 13);
    o.state = 'fly';
    o.t = 0;
    return 'launch';
  }

  step(dt: number, p: PlayerState, hole: BlackHole): void {
    const toHole = new THREE.Vector3();
    const swirl = new THREE.Vector3();
    for (const o of this.list) {
      if (o.state === 'gone') continue;
      o.t += dt;
      const R = ORB_R[o.kind];
      if (o.state === 'spawning') {
        if (o.t > 0.6) {
          o.state = 'ground';
          o.t = 0;
        }
        continue;
      }
      if (o.state === 'ground') {
        const sp = Math.hypot(o.vel.x, o.vel.z);
        if (sp > 0) {
          const k = Math.max(0, sp - (1.4 + sp * 0.3) * dt) / sp;
          o.vel.x *= k;
          o.vel.z *= k;
        }
        // Gold orbs are shy: they roll away from you a little.
        const dx = o.pos.x - p.x;
        const dz = o.pos.z - p.z;
        const d = Math.hypot(dx, dz);
        if (o.kind === 'gold' && d < 2.4 && d > 0.6 && p.y < 0.5) {
          o.vel.x += (dx / d) * 2.2 * dt;
          o.vel.z += (dz / d) * 2.2 * dt;
        }
        o.pos.x += o.vel.x * dt;
        o.pos.z += o.vel.z * dt;
        // Walking into an orb nudges it along.
        const rr = R + 0.38;
        if (!p.riding && p.y < 0.6 && d < rr && d > 1e-4) {
          const nx = dx / d;
          const nz = dz / d;
          o.pos.x = p.x + nx * rr;
          o.pos.z = p.z + nz * rr;
          const rel = (o.vel.x - p.vx) * nx + (o.vel.z - p.vz) * nz;
          if (rel < 0) {
            const push = o.kind === 'moon' ? 0.9 : 1.4;
            o.vel.x -= push * rel * nx;
            o.vel.z -= push * rel * nz;
          }
        }
        // Orbs bump each other.
        for (const q of this.list) {
          if (q === o || q.state !== 'ground') continue;
          const ex = o.pos.x - q.pos.x;
          const ez = o.pos.z - q.pos.z;
          const ed = Math.hypot(ex, ez);
          const min = R + ORB_R[q.kind];
          if (ed < min && ed > 1e-4) {
            const push = (min - ed) / 2;
            o.pos.x += (ex / ed) * push;
            o.pos.z += (ez / ed) * push;
            q.pos.x -= (ex / ed) * push;
            q.pos.z -= (ez / ed) * push;
          }
        }
        if (Math.hypot(o.pos.x, o.pos.z) > HUB_R + 0.5) {
          o.state = 'fly';
          o.t = 0;
          o.vel.y = Math.max(o.vel.y, 1.5);
          this.onLaunch(o);
        }
      } else {
        // Pulled in, swirling round the disk's axis. The pull tightens the
        // longer it flies, so every kicked orb ends up in the black hole.
        toHole.subVectors(hole.centre, o.pos);
        const dist = toHole.length();
        const pull = hole.pull / Math.max(dist, 6);
        toHole.normalize();
        o.vel.addScaledVector(toHole, pull * dt);
        swirl.crossVectors(DISK_NORMAL, toHole).normalize();
        o.vel.addScaledVector(swirl, (60 / Math.max(dist, 6)) * dt * Math.max(0, 1 - o.t / 4));
        const home = Math.min(1, dt * (0.4 + o.t * 1.2));
        const want = 14 + o.t * 9;
        o.vel.x += (toHole.x * want - o.vel.x) * home;
        o.vel.y += (toHole.y * want - o.vel.y) * home;
        o.vel.z += (toHole.z * want - o.vel.z) * home;
        if (Math.hypot(o.pos.x, o.pos.z) < HUB_R + 1 && o.pos.y > R) o.vel.y -= 3.8 * dt;
        o.pos.addScaledVector(o.vel, dt);
        if (o.pos.y < R && Math.hypot(o.pos.x, o.pos.z) < HUB_R) {
          // A weak kick lands back on the hub.
          o.pos.y = R;
          o.vel.y = 0;
          o.vel.multiplyScalar(0.6);
          o.state = 'ground';
        }
        if (dist < hole.radius * 1.05 || o.t > 10) {
          o.state = 'gone';
          this.onSwallow(o);
        }
      }
    }
    this.list = this.list.filter((o) => o.state !== 'gone');
  }

  update(time: number, hole: BlackHole): void {
    let i = 0;
    for (const o of this.list) {
      const R = ORB_R[o.kind];
      const bob = o.state === 'ground' ? Math.sin(time * 3 + o.pos.x) * 0.06 + 0.04 : 0;
      this.v.set(o.pos.x, o.pos.y + bob + (o.state === 'spawning' ? 0.8 * (1 - o.t / 0.6) : 0), o.pos.z);
      const appear = o.state === 'spawning' ? Math.min(1, o.t / 0.6) : 1;
      if (o.state === 'fly') {
        const dist = o.pos.distanceTo(hole.centre);
        const stretch = 1 + Math.max(0, 1 - dist / (hole.radius * 4)) * 3.5;
        const look = this.m4.lookAt(this.v, this.v.clone().add(o.vel), new THREE.Vector3(0, 1, 0));
        this.q.setFromRotationMatrix(look);
        this.sc.set(R / Math.sqrt(stretch), R / Math.sqrt(stretch), R * stretch);
      } else {
        this.q.identity();
        const wob = o.shoved ? 1 + Math.sin(time * 14) * 0.06 : 1;
        this.sc.set(R * appear * wob, R * appear / wob, R * appear * wob);
      }
      this.m4.compose(this.v, this.q, this.sc);
      this.cores.setMatrixAt(i, this.m4);
      this.cores.setColorAt(i, o.color);
      this.q.identity();
      const hs = (o.kind === 'moon' ? 2.8 : o.kind === 'gold' ? 2.3 : 1.9) * appear;
      this.sc.set(hs, hs, hs);
      this.m4.compose(this.v, this.q, this.sc);
      this.halos.setMatrixAt(i, this.m4);
      this.halos.setColorAt(i, o.color);
      i++;
    }
    this.cores.count = i;
    this.halos.count = i;
    this.cores.instanceMatrix.needsUpdate = true;
    this.halos.instanceMatrix.needsUpdate = true;
    this.cores.instanceColor!.needsUpdate = true;
    this.halos.instanceColor!.needsUpdate = true;
  }
}
