// The black hole: the world's main character. A black horizon, a spiral disk
// in the drawing's gold, purple and green, a thin photon ring, polar jets of
// sparkles when it is happy, and a growth animation each time it is fed a star.

import * as THREE from 'three';
import { BH, diskOuter, horizonRadius } from '../../shared/galaxy-rules';
import type { Tier } from '../../world/space';
import { Particles } from '../kit';
import * as S from './shaders';

type Uniforms = { uTime: { value: number }; uFlare: { value: number } };

/** Tilted so the disk passes under the Horizon stair (its west side dips) and leans toward the hub. */
export const DISK_NORMAL = new THREE.Vector3(-0.21, 0.97, 0.26).normalize();

export class BlackHole {
  readonly group = new THREE.Group();
  readonly centre = new THREE.Vector3(BH.x, BH.y, BH.z);
  /** Radius shown now (animates toward the fed size). */
  radius = horizonRadius(0);
  private target = horizonRadius(0);
  private outer = diskOuter(0);
  private targetOuter = diskOuter(0);
  private horizon: THREE.Mesh;
  private disk: THREE.Mesh;
  private diskMat: THREE.ShaderMaterial;
  private back: THREE.Mesh;
  private backMat: THREE.ShaderMaterial;
  private ring: THREE.Mesh;
  private light: THREE.PointLight;
  private jets: Particles;
  private ripple = 0;
  /** Extra heat from a frenzy streak, 0 to 1. */
  heat = 0;
  /** Seconds until the next idle burp. */
  private jetFor = 0;

  constructor(
    scene: THREE.Scene,
    private uniforms: Uniforms,
  ) {
    this.group.position.copy(this.centre);
    this.horizon = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshBasicMaterial({ color: '#000000' }));
    this.group.add(this.horizon);
    const diskUniforms = (fade: number) => ({ ...uniforms, uInner: { value: 6 }, uOuter: { value: 20 }, uScale: { value: 20 }, uDetail: { value: 4 }, uFade: { value: fade }, uHeat: { value: 0 } });
    this.diskMat = new THREE.ShaderMaterial({ vertexShader: S.DISK_VERT, fragmentShader: S.DISK_FRAG, uniforms: diskUniforms(1), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.disk = new THREE.Mesh(new THREE.RingGeometry(0.2, 1, 160, 6), this.diskMat);
    this.disk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), DISK_NORMAL);
    this.disk.renderOrder = 2;
    this.group.add(this.disk);
    // The far side of the disk, lensed up and over the hole: a camera-facing ring.
    this.backMat = new THREE.ShaderMaterial({ vertexShader: S.DISK_VERT, fragmentShader: S.DISK_FRAG, uniforms: diskUniforms(0.55), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.back = new THREE.Mesh(new THREE.RingGeometry(1.05, 2.7, 128, 4), this.backMat);
    this.back.renderOrder = 1;
    scene.add(this.back);
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: S.QUAD_VERT, fragmentShader: S.RING_FRAG, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.ring.renderOrder = 3;
    scene.add(this.ring);
    this.light = new THREE.PointLight('#ffc27a', 110, 160, 1.5);
    this.group.add(this.light);
    this.jets = new Particles(scene, { max: 900, look: 'spark', renderOrder: 4 });
    scene.add(this.group);
    this.apply();
  }

  setQuality(tier: Tier): void {
    this.diskMat.uniforms.uDetail.value = tier === 'low' ? 1 : tier === 'medium' ? 3 : 4;
    this.backMat.uniforms.uDetail.value = tier === 'high' ? 3 : 2;
    this.back.visible = tier !== 'low';
    this.light.visible = tier !== 'low';
    this.jets.setQuality(tier);
  }

  /** Sets the size for this many stars fed; animates unless `instant`. */
  setFed(fed: number, instant = false): void {
    this.target = horizonRadius(fed);
    this.targetOuter = diskOuter(fed);
    if (instant) {
      this.radius = this.target;
      this.outer = this.targetOuter;
      this.apply();
    } else this.ripple = 1;
  }

  /** Pull on frenzy orbs grows with the hole. */
  get pull(): number {
    return 420 * (0.75 + this.radius / 12);
  }

  /** A happy burst from both poles. */
  burp(strength = 1): void {
    const n = DISK_NORMAL;
    for (const s of [1, -1]) {
      this.jets.burst({
        at: { x: this.centre.x + n.x * this.radius * s, y: this.centre.y + n.y * this.radius * s, z: this.centre.z + n.z * this.radius * s },
        count: Math.round(90 * strength),
        shape: 'cone',
        dir: { x: n.x * s, y: n.y * s, z: n.z * s },
        spread: 0.18,
        speed: [14, 34],
        color: [0xfff3c4, 0x8a6bd1],
        colorEnd: 0x3fb68b,
        size: [0.6, 1.4],
        life: [0.8, 1.6],
        drag: 0.6,
      });
    }
  }

  private apply(): void {
    const R = this.radius;
    this.horizon.scale.setScalar(R);
    const inner = R * 1.18;
    this.disk.scale.setScalar(this.outer);
    for (const m of [this.diskMat]) {
      m.uniforms.uInner.value = inner;
      m.uniforms.uOuter.value = this.outer;
      m.uniforms.uScale.value = this.outer;
    }
    this.back.scale.setScalar(R);
    this.backMat.uniforms.uInner.value = R * 1.05;
    this.backMat.uniforms.uOuter.value = R * 2.7;
    this.backMat.uniforms.uScale.value = R;
    // The photon ring sits at 0.69 of the quad's half size.
    this.ring.scale.setScalar((R * 2 * 1.02) / 0.69);
  }

  update(dt: number, camera: THREE.Camera): void {
    const k = Math.min(1, dt * 1.6);
    const before = this.radius;
    this.radius += (this.target - this.radius) * k;
    this.outer += (this.targetOuter - this.outer) * k;
    if (Math.abs(before - this.radius) > 1e-4 || this.ripple > 0) this.apply();
    this.ripple = Math.max(0, this.ripple - dt * 0.7);
    // A wobble as it grows.
    const wob = this.ripple > 0 ? 1 + Math.sin(this.ripple * 30) * 0.03 * this.ripple : 1;
    this.horizon.scale.setScalar(this.radius * wob);
    this.heat = Math.max(0, this.heat - dt * 0.15);
    this.diskMat.uniforms.uHeat.value = this.heat;
    this.light.intensity = 100 + this.uniforms.uFlare.value * 200 + this.heat * 90;
    // Billboards face the camera.
    this.ring.position.copy(this.centre);
    this.ring.quaternion.copy(camera.quaternion);
    this.back.position.copy(this.centre).addScaledVector(new THREE.Vector3().subVectors(this.centre, camera.position).normalize(), 1.5);
    this.back.quaternion.copy(camera.quaternion);
    this.back.rotateZ(0.08);
    this.jetFor -= dt;
    if (this.jetFor <= 0) {
      this.jetFor = 9 + Math.random() * 6;
      this.burp(0.35);
    }
    this.jets.update(dt);
  }

  /** Where the hole is on screen, for the lens and the bloom mask. */
  screen(camera: THREE.PerspectiveCamera, aspect: number): { x: number; y: number; r: number; ahead: boolean; visible: boolean } {
    const p = this.centre.clone().project(camera);
    const edge = this.centre.clone().add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(this.radius)).project(camera);
    const ahead = p.z < 1 && camera.position.distanceTo(this.centre) > this.radius * 1.1;
    const visible = ahead && Math.abs(p.x) < 1.6 && Math.abs(p.y) < 1.6;
    return { x: p.x * 0.5 + 0.5, y: p.y * 0.5 + 0.5, r: Math.abs(edge.x - p.x) * 0.5 * aspect, ahead, visible };
  }

  dispose(): void {
    this.jets.dispose();
  }
}
