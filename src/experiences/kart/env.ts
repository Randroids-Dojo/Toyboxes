// Light, sky and fog for each theme. Outdoor circuits borrow the town sky
// (it follows the shared clock); the playroom is lit through a big window
// and by a ceiling lamp at night; the bedroom is always night.

import * as THREE from 'three';
import type { Theme } from '../../shared/kart/circuits';
import { Sky } from '../../world/sky';
import type { Tier } from '../../world/space';
import { PostFX } from '../kit';

const c = (h: string) => new THREE.Color(h);

export class Env {
  readonly sun = new THREE.DirectionalLight('#ffffff', 2);
  readonly hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
  readonly fog = new THREE.Fog('#cfe6ff', 80, 260);
  readonly post: PostFX;
  /** Extra lights the bedroom uses on high (nightlight, rocket). */
  readonly points: THREE.PointLight[] = [];
  private sky: Sky | null = null;
  private dummy = new THREE.Scene();
  private theme: Theme = 'playroom';
  private tier: Tier = 'medium';
  /** 0 by day, 1 at night, as this circuit sees it. */
  night = 0;
  private reach = 80;

  constructor(private scene: THREE.Scene) {
    scene.add(this.sun, this.sun.target, this.hemi);
    scene.fog = this.fog;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 200;
    this.post = new PostFX(scene, { bloom: { strength: 0.35, threshold: 0.85, radius: 0.45 }, vignette: 0.22, saturation: 1.06 });
    for (let i = 0; i < 2; i++) {
      const p = new THREE.PointLight('#ffe9a8', 0, 40, 1.6);
      p.visible = false;
      this.points.push(p);
      scene.add(p);
    }
  }

  setTheme(theme: Theme, reach: number): void {
    this.theme = theme;
    this.reach = reach;
    if (this.sky) {
      this.scene.remove(this.sky.group);
      this.sky = null;
    }
    if (theme === 'garden' || theme === 'beach') {
      this.sky = new Sky(this.dummy);
      this.sky.group.scale.setScalar(Math.max(1, (reach + 60) / 280));
      this.scene.add(this.sky.group);
    }
    if (theme === 'bedroom') this.post.set({ bloom: { strength: 0.85, threshold: 0.55, radius: 0.55 }, vignette: 0.38, saturation: 1.12, contrast: 1.04 });
    else if (theme === 'playroom') this.post.set({ bloom: { strength: 0.3, threshold: 0.9, radius: 0.4 }, vignette: 0.2, saturation: 1.08, contrast: 1.02 });
    else this.post.set({ bloom: { strength: 0.3, threshold: 0.9, radius: 0.4 }, vignette: 0.18, saturation: 1.1, contrast: 1.02 });
    for (const p of this.points) p.visible = false;
    this.applyTier();
  }

  setQuality(t: Tier): void {
    this.tier = t;
    this.post.setQuality(t);
    this.applyTier();
  }

  private applyTier(): void {
    const t = this.tier;
    const size = t === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    const sc = this.sun.shadow.camera;
    const span = t === 'high' ? 60 : 42;
    sc.left = sc.bottom = -span;
    sc.right = sc.top = span;
    sc.updateProjectionMatrix();
    // Fog closes in on the low tier so far things can be skipped.
    const far = t === 'low' ? 150 : Math.max(220, this.reach * 2.2);
    this.fog.near = t === 'low' ? 45 : far * 0.4;
    this.fog.far = far;
    for (const p of this.points) p.visible = t === 'high' && this.theme === 'bedroom' && p.intensity > 0;
  }

  /** The clock's day phase and where the camera is. */
  update(phase: number, focus: THREE.Vector3, dayNight: number): void {
    const th = this.theme;
    if (this.sky) {
      this.sky.update(phase, focus);
      this.sun.color.copy(this.sky.sun.color);
      this.sun.intensity = this.sky.sun.intensity;
      this.hemi.color.copy(this.sky.hemi.color);
      this.hemi.groundColor.copy(this.sky.hemi.groundColor).lerp(c(th === 'beach' ? '#e3b877' : '#5aa84a'), 0.35);
      this.hemi.intensity = this.sky.hemi.intensity;
      this.fog.color.copy((this.dummy.fog as THREE.Fog).color);
      // Sun direction from the sky's own light.
      const dir = this.sky.sun.position.clone().sub(this.sky.sun.target.position).normalize();
      this.place(focus, dir);
      this.night = this.sky.night;
      this.sky.group.position.set(focus.x, 0, focus.z);
      return;
    }
    if (th === 'bedroom') {
      this.night = 1;
      this.sun.color.copy(c('#b9c4ff'));
      this.sun.intensity = 1.05;
      this.hemi.color.copy(c('#4a56a8'));
      this.hemi.groundColor.copy(c('#2b2560'));
      this.hemi.intensity = 1.25;
      this.fog.color.copy(c('#141838'));
      this.place(focus, new THREE.Vector3(-0.35, 0.8, 0.45).normalize());
      return;
    }
    // The playroom: sunlight through the window by day, the ceiling lamp at night.
    const n = dayNight;
    this.night = n;
    this.sun.color.copy(c('#fff1d6').lerp(c('#ffd9a0'), n));
    this.sun.intensity = 2.4 - n * 1.2;
    this.hemi.color.copy(c('#fff6e6').lerp(c('#ffe2b8'), n));
    this.hemi.groundColor.copy(c('#b98a5e').lerp(c('#6a4a38'), n));
    this.hemi.intensity = 1.25 - n * 0.35;
    this.fog.color.copy(c('#f3e6cf').lerp(c('#3a2c3a'), n * 0.7));
    // By day the light comes through the window to the east; at night from the lamp overhead.
    const day = new THREE.Vector3(0.75, 0.55, -0.35).normalize();
    const lamp = new THREE.Vector3(0.1, 1, 0.15).normalize();
    this.place(focus, day.lerp(lamp, n).normalize());
  }

  private place(focus: THREE.Vector3, dir: THREE.Vector3): void {
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(dir, 90);
  }

  dispose(): void {
    if (this.sky) this.scene.remove(this.sky.group);
    this.post.dispose();
  }
}
