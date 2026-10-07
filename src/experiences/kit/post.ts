// Post-processing for the worlds: bloom and a colour grade (vignette,
// saturation, contrast, tint, flashes, chromatic aberration and grain),
// scaled by graphics tier. Use it from the SpaceView hooks:
//
//   private post = new PostFX(this.scene, { bloom: { strength: 0.9, threshold: 0.7 }, vignette: 0.35 });
//   setQuality(t) { this.post.setQuality(t); }
//   render(r, cam) { return this.post.render(r, cam); }
//   resize() { this.post.resize(); }
//   dispose() { this.post.dispose(); }
//
// The low tier draws nothing extra (render returns false and the game draws
// the scene normally), so keep anything essential out of the post look.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Tier } from '../../world/space';

export interface PostLook {
  /** Only pixels brighter than `threshold` (linear, about 0.6 to 1) bloom. */
  bloom?: { strength: number; radius?: number; threshold?: number };
  /** Edge darkening, 0 to 1. */
  vignette?: number;
  /** 1 is unchanged. */
  saturation?: number;
  /** 1 is unchanged. */
  contrast?: number;
  /** A colour wash and how much of it, 0 to 1. */
  tint?: number;
  tintAmount?: number;
  /** Colour fringing toward the edges (high tier only), 0 to about 0.01. */
  aberration?: number;
  /** Film grain (high tier only), 0 to about 0.08. */
  grain?: number;
  /** Lift on the darkest tones, 0 to about 0.1, for a soft hazy look. */
  lift?: number;
}

const GRADE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uVignette, uSaturation, uContrast, uTintAmount, uAberration, uGrain, uTime, uLift, uFlash, uAspect;
uniform vec3 uTint, uFlashColor;
varying vec2 vUv;
float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  vec3 col;
  if (uAberration > 0.0) {
    vec2 off = d * uAberration;
    col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
  } else col = texture2D(tDiffuse, uv).rgb;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSaturation);
  col = (col - 0.18) * uContrast + 0.18;
  col = max(col, 0.0) + uLift * (1.0 - min(col, 1.0));
  col = mix(col, col * uTint * 1.6, uTintAmount);
  float v = smoothstep(0.85, 0.2, length(d * vec2(uAspect, 1.0) * 0.82));
  col *= mix(1.0, v, uVignette);
  col += uFlashColor * uFlash;
  if (uGrain > 0.0) col += (rand(uv * 1000.0 + uTime) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`;

const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export class PostFX {
  private tier: Tier = 'medium';
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  private key = '';
  private flashAmount = 0;
  private flashDecay = 0;
  private flashColor = new THREE.Color(1, 1, 1);
  private bloomBoost = 0;
  private t0 = performance.now();
  private last = performance.now();

  constructor(
    private scene: THREE.Scene,
    private look: PostLook = {},
  ) {}

  setQuality(t: Tier): void {
    this.tier = t;
  }

  /** Changes the look at run time (e.g. a darker grade for a boss). */
  set(look: Partial<PostLook>): void {
    this.look = { ...this.look, ...look };
  }

  /** A full-screen flash of colour that fades over `seconds` (medium and high tiers; `Hud.flash` works everywhere). */
  flash(color = 0xffffff, amount = 0.6, seconds = 0.35): void {
    this.flashColor.setHex(color);
    this.flashAmount = Math.max(this.flashAmount, amount);
    this.flashDecay = amount / Math.max(0.05, seconds);
  }

  /** Briefly pushes the bloom up, e.g. on a beat or a jackpot. */
  pulse(amount = 0.6): void {
    this.bloomBoost = Math.max(this.bloomBoost, amount);
  }

  resize(): void {
    this.key = '';
  }

  private ensure(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const size = renderer.getSize(new THREE.Vector2());
    const key = `${this.tier}|${size.x}x${size.y}|${renderer.getPixelRatio()}|${!!this.look.bloom}`;
    if (this.composer && key === this.key) {
      (this.composer.passes[0] as RenderPass).camera = camera;
      return;
    }
    this.composer?.dispose();
    this.key = key;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(this.scene, camera));
    if (this.look.bloom) {
      const scale = this.tier === 'high' ? 0.75 : 0.5;
      const b = this.look.bloom;
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x * scale, size.y * scale), b.strength, b.radius ?? 0.5, b.threshold ?? 0.75);
      composer.addPass(this.bloomPass);
    } else this.bloomPass = null;
    this.grade = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uVignette: { value: 0 },
        uSaturation: { value: 1 },
        uContrast: { value: 1 },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uTintAmount: { value: 0 },
        uAberration: { value: 0 },
        uGrain: { value: 0 },
        uTime: { value: 0 },
        uLift: { value: 0 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 1, 1) },
        uAspect: { value: 1 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: GRADE_FRAG,
    });
    composer.addPass(this.grade);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  /** Draws the frame. Returns false on the low tier so the game draws it plainly. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera): boolean {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.flashAmount = Math.max(0, this.flashAmount - this.flashDecay * dt);
    this.bloomBoost = Math.max(0, this.bloomBoost - dt * 1.6);
    if (this.tier === 'low') return false;
    this.ensure(renderer, camera);
    const L = this.look;
    if (this.bloomPass && L.bloom) this.bloomPass.strength = L.bloom.strength + this.bloomBoost;
    const u = this.grade!.uniforms;
    const size = renderer.getSize(new THREE.Vector2());
    u.uVignette.value = L.vignette ?? 0;
    u.uSaturation.value = L.saturation ?? 1;
    u.uContrast.value = L.contrast ?? 1;
    (u.uTint.value as THREE.Color).setHex(L.tint ?? 0xffffff);
    u.uTintAmount.value = L.tintAmount ?? 0;
    u.uAberration.value = this.tier === 'high' ? (L.aberration ?? 0) : 0;
    u.uGrain.value = this.tier === 'high' ? (L.grain ?? 0) : 0;
    u.uLift.value = L.lift ?? 0;
    u.uTime.value = (performance.now() - this.t0) / 1000;
    u.uFlash.value = this.flashAmount;
    (u.uFlashColor.value as THREE.Color).copy(this.flashColor);
    u.uAspect.value = size.x / Math.max(1, size.y);
    this.composer!.render();
    return true;
  }

  dispose(): void {
    this.composer?.dispose();
    this.composer = null;
  }
}
