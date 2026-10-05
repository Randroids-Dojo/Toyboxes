// Black hole galaxy: you fall through a portal onto a crystal platform in
// another dimension. Kick glowing orbs off the edge and the black hole pulls
// them in. A feeding frenzy is a 60-second round with a best-score board.
//
// The look is deliberately unlike the toy town: shader skies, glass, glow
// and post-processing, scaled by graphics tier (see setQuality).

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Drone, sfx, sfxSpace } from '../audio/sfx';
import { api, type BoardRow } from '../net/api';
import { h } from '../ui/ui';
import { disposeTree } from '../world/kit';
import { box, circle, type Collider } from '../world/physics';
import type { PlayerState, SpaceAction, SpaceView, Spot, Tier } from '../world/space';
import { boardTexture, type ExperienceCtx } from './common';
import * as S from './galaxy-shaders';

const PR = 10.5;
const BH = new THREE.Vector3(0, 6.5, -48);
const HORIZON = 5.6;
const ORB_R = 0.32;
const FRENZY_SECONDS = 60;
let frenzySeconds = FRENZY_SECONDS;
const ORB_COLORS = ['#ffd24a', '#b18cff', '#53f0c0', '#6cc4ff'];

interface Orb {
  mesh: THREE.Mesh;
  halo: THREE.Sprite;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  state: 'spawning' | 'ground' | 'fly' | 'gone';
  t: number;
}

const TIERS: Record<Tier, { motes: number; streaks: number; octaves: number; bloom: number; lens: boolean; aberration: number; physical: boolean }> = {
  low: { motes: 600, streaks: 50, octaves: 2, bloom: 0, lens: false, aberration: 0, physical: false },
  medium: { motes: 2500, streaks: 120, octaves: 4, bloom: 0.5, lens: false, aberration: 0.0015, physical: true },
  high: { motes: 6000, streaks: 220, octaves: 6, bloom: 0.62, lens: true, aberration: 0.003, physical: true },
};

function glowText(text: string, color: string, w = 6, hgt = 1.1): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = Math.round(w * 128);
  c.height = Math.round(hgt * 128);
  const g = c.getContext('2d')!;
  g.font = `${c.height * 0.55}px "Lilita One", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = c.height * 0.25;
  g.fillStyle = '#ffffff';
  g.fillText(text, c.width / 2, c.height / 2);
  g.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.renderOrder = 5;
  return m;
}

let haloTex: THREE.CanvasTexture | null = null;
function haloTexture(): THREE.CanvasTexture {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.userData.keep = true;
  return haloTex;
}

export class Galaxy implements SpaceView {
  readonly indoor = false;
  readonly scene = new THREE.Scene();
  readonly colliders: Collider[] = [];
  /** The exit vortex stands at the back left of the platform, clear of the camera's usual spot. */
  readonly door: Spot = { x: -6.6, z: 5.9 };
  readonly lectern = null;
  readonly chest = null;
  readonly areaDoors = [];
  readonly exhibitSpots = [];
  readonly sun: THREE.DirectionalLight;
  readonly arrival = { x: 0, z: 3.2, yaw: Math.PI };
  private tier: Tier | null = null;
  private time = 0;
  private lastT = 0;
  private arrivalT = 0;
  private flare = 0;
  private uniforms = { uTime: { value: 0 }, uFlare: { value: 0 } };
  private nebula: THREE.ShaderMaterial;
  private disk: THREE.ShaderMaterial;
  private diskBack: THREE.ShaderMaterial;
  private diskBackMesh: THREE.Mesh;
  private ring: THREE.Mesh;
  private planetMat: THREE.ShaderMaterial;
  private planet = new THREE.Group();
  private tiles: THREE.InstancedMesh;
  private tileMats: { physical: THREE.MeshPhysicalMaterial; plain: THREE.MeshStandardMaterial };
  private seams: THREE.LineSegments;
  private fenceMat: THREE.ShaderMaterial;
  private streaks: THREE.InstancedMesh | null = null;
  private streakState: { pos: THREE.Vector3; speed: number }[] = [];
  private motes: THREE.Points | null = null;
  private envMap: THREE.Texture | null = null;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private lens: ShaderPass | null = null;
  private final: ShaderPass | null = null;
  private composerKey = '';
  private orbs: Orb[] = [];
  private shrine = new THREE.Group();
  private shrineSpot: Spot = { x: -6.4, z: 2.4 };
  private boardMesh: THREE.Mesh;
  private boardRows: BoardRow[] = [];
  private best: number | null = null;
  private fedTotal = 0;
  private frenzy: { state: 'countdown' | 'running'; t: number; fed: number; shown: number } | null = null;
  private hud: HTMLElement;
  private hudTop: HTMLElement;
  private hudBig: HTMLElement;
  private hudSub: HTMLElement;
  private drone = new Drone();
  private playerPos = new THREE.Vector3();
  private disposed = false;
  private readonly flow = new THREE.Vector3(1, 0.72, 0.25).normalize();

  constructor(private readonly ctx: ExperienceCtx) {
    const s = this.scene;
    s.background = new THREE.Color('#05030c');

    // Sky.
    this.nebula = new THREE.ShaderMaterial({ vertexShader: S.NEBULA_VERT, fragmentShader: S.NEBULA_FRAG, uniforms: { ...this.uniforms, uOctaves: { value: 4 } }, side: THREE.BackSide, depthWrite: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(260, 48, 24), this.nebula);
    sky.renderOrder = -10;
    s.add(sky);

    // Black hole.
    const horizon = new THREE.Mesh(new THREE.SphereGeometry(HORIZON, 48, 32), new THREE.MeshBasicMaterial({ color: '#000000' }));
    horizon.position.copy(BH);
    s.add(horizon);
    const diskUniforms = () => ({ ...this.uniforms, uInner: { value: 6.4 }, uOuter: { value: 26 }, uDetail: { value: 4 }, uFade: { value: 1 } });
    this.disk = new THREE.ShaderMaterial({ vertexShader: S.DISK_VERT, fragmentShader: S.DISK_FRAG, uniforms: diskUniforms(), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const diskMesh = new THREE.Mesh(new THREE.RingGeometry(6.4, 26, 160, 6), this.disk);
    diskMesh.position.copy(BH);
    diskMesh.rotation.x = -Math.PI / 2 + 0.26;
    s.add(diskMesh);
    // The far side of the disk, lensed up and over the hole.
    this.diskBack = new THREE.ShaderMaterial({ vertexShader: S.DISK_VERT, fragmentShader: S.DISK_FRAG, uniforms: { ...diskUniforms(), uFade: { value: 0.55 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.diskBackMesh = new THREE.Mesh(new THREE.RingGeometry(6.0, 15, 128, 4), this.diskBack);
    this.diskBackMesh.position.copy(BH).add(new THREE.Vector3(0, 0, -1.5));
    s.add(this.diskBackMesh);
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(16.5, 16.5), new THREE.ShaderMaterial({ vertexShader: S.QUAD_VERT, fragmentShader: S.RING_FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.ring.position.copy(BH);
    this.ring.renderOrder = 3;
    s.add(this.ring);

    // The ringed planet from the drawing.
    this.planetMat = new THREE.ShaderMaterial({ vertexShader: S.PLANET_VERT, fragmentShader: S.PLANET_FRAG, uniforms: { ...this.uniforms, uDetail: { value: 4 }, uLightDir: { value: new THREE.Vector3(1, 0.3, 0.6) } } });
    this.planet.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), this.planetMat));
    const pring = new THREE.Mesh(new THREE.RingGeometry(13.5, 21, 128, 2), new THREE.ShaderMaterial({ vertexShader: S.DISK_VERT, fragmentShader: S.PLANET_RING_FRAG, uniforms: { uInner: { value: 13.5 }, uOuter: { value: 21 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    pring.rotation.x = -Math.PI / 2 + 0.45;
    pring.rotation.y = 0.3;
    this.planet.add(pring);
    this.planet.position.set(-58, 26, -86);
    s.add(this.planet);

    // Crystal platform of hex tiles.
    const size = 1.2;
    const centres: THREE.Vector2[] = [];
    for (let q = -10; q <= 10; q++) {
      for (let r = -10; r <= 10; r++) {
        const x = size * 1.5 * q;
        const z = size * Math.sqrt(3) * (r + q / 2);
        if (Math.hypot(x, z) <= PR + 0.6) centres.push(new THREE.Vector2(x, z));
      }
    }
    const tileGeo = new THREE.CylinderGeometry(size * 0.96, size * 0.84, 0.6, 6).rotateY(Math.PI / 6).translate(0, -0.3, 0);
    this.tileMats = {
      physical: new THREE.MeshPhysicalMaterial({ color: '#120a2c', roughness: 0.22, metalness: 0.1, iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [180, 700], clearcoat: 0.6, clearcoatRoughness: 0.2, emissive: new THREE.Color('#2a1060'), emissiveIntensity: 0.5 }),
      plain: new THREE.MeshStandardMaterial({ color: '#241446', roughness: 0.3, metalness: 0.2, emissive: new THREE.Color('#2a1060'), emissiveIntensity: 0.5 }),
    };
    this.tiles = new THREE.InstancedMesh(tileGeo, this.tileMats.plain, centres.length);
    const m4 = new THREE.Matrix4();
    centres.forEach((c, i) => {
      m4.makeTranslation(c.x, -((i * 37) % 7) * 0.012, c.y);
      this.tiles.setMatrixAt(i, m4);
    });
    this.tiles.receiveShadow = true;
    s.add(this.tiles);
    // Seams: hex outlines just above the tops, one draw call for all.
    const seamPts: number[] = [];
    for (const c of centres) {
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * Math.PI * 2;
        const a1 = ((k + 1) / 6) * Math.PI * 2;
        const rr = size * 0.96;
        seamPts.push(c.x + Math.cos(a0) * rr, 0.015, c.y + Math.sin(a0) * rr, c.x + Math.cos(a1) * rr, 0.015, c.y + Math.sin(a1) * rr);
      }
    }
    const seamGeo = new THREE.BufferGeometry();
    seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(seamPts, 3));
    this.seams = new THREE.LineSegments(seamGeo, new THREE.ShaderMaterial({ vertexShader: S.SEAM_VERT, fragmentShader: S.SEAM_FRAG, uniforms: this.uniforms, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.add(this.seams);

    // Energy fence at the edge: blocks you, not the orbs.
    this.fenceMat = new THREE.ShaderMaterial({ vertexShader: S.FENCE_VERT, fragmentShader: S.FENCE_FRAG, uniforms: { ...this.uniforms, uPlayer: { value: this.playerPos } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const fence = new THREE.Mesh(new THREE.CylinderGeometry(PR + 0.7, PR + 0.7, 1.6, 96, 1, true).translate(0, 0.8, 0), this.fenceMat);
    s.add(fence);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      // Taller than any low-gravity jump, so nobody floats over the edge.
      this.colliders.push(box(Math.sin(a) * (PR + 0.9), -Math.cos(a) * (PR + 0.9), 1.0, 0.25, -a, 40, 0.5, false));
    }

    // The way home: a vortex ring at the back of the platform.
    const exit = new THREE.Group();
    const exitAngle = Math.atan2(-7.6, 6.8);
    exit.position.set(-7.6, 1.9, 6.8);
    exit.add(new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 16, 64), new THREE.MeshBasicMaterial({ color: '#ffd27a' })));
    exit.add(new THREE.Mesh(new THREE.CircleGeometry(1.55, 48), new THREE.ShaderMaterial({ vertexShader: S.QUAD_VERT, fragmentShader: S.VORTEX_FRAG, uniforms: this.uniforms, transparent: true, side: THREE.DoubleSide })));
    const exitLabel = glowText(`Back to ${ctx.ownerName}'s room`, '#ffd27a', 5.6, 0.8);
    exitLabel.position.set(0, 2.35, 0.05);
    exit.add(exitLabel);
    // Face the middle of the platform.
    exit.rotation.y = exitAngle + Math.PI;
    s.add(exit);
    this.colliders.push(circle(-7.6, 6.8, 1.0, 4, 0.5, true));

    // The frenzy shrine and its board.
    this.shrine.position.set(this.shrineSpot.x, 0, this.shrineSpot.z - 1.2);
    const shrineRing = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 12, 48), new THREE.MeshBasicMaterial({ color: '#53f0c0' }));
    shrineRing.position.y = 1.6;
    shrineRing.name = 'spin';
    this.shrine.add(shrineRing);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 3.2, 24, 1, true).translate(0, 1.6, 0), new THREE.MeshBasicMaterial({ color: '#53f0c0', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.shrine.add(beam);
    const shrineLabel = glowText('Feeding frenzy', '#53f0c0', 4, 0.7);
    shrineLabel.position.y = 3.3;
    this.shrine.add(shrineLabel);
    this.boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.94), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92, depthWrite: false }));
    this.boardMesh.position.set(0, 5.6, 0);
    this.shrine.add(this.boardMesh);
    s.add(this.shrine);
    this.colliders.push(box(this.shrineSpot.x, this.shrineSpot.z - 1.2, 0.5, 0.5, 0, 3, 0.5, false));

    // Light: the disk glows on the platform; a cool key light casts shadows.
    s.add(new THREE.HemisphereLight('#7a5cff', '#0b0618', 0.9));
    const diskLight = new THREE.PointLight('#ffc27a', 150, 140, 1.6);
    diskLight.position.copy(BH);
    s.add(diskLight);
    this.sun = new THREE.DirectionalLight('#cbb6ff', 1.2);
    this.sun.position.set(-12, 22, 10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -14;
    sc.right = sc.top = 14;
    sc.near = 1;
    sc.far = 60;
    s.add(this.sun, this.sun.target);

    // Orbs to start with.
    for (let i = 0; i < 5; i++) this.spawnOrb(true);

    // HUD.
    this.hudTop = h('div', { class: 'kh-top' });
    this.hudBig = h('div', { class: 'kh-time' });
    this.hudSub = h('div', { class: 'kh-sub' });
    this.hud = h('div', { class: 'galaxy-hud' }, this.hudTop, this.hudBig, this.hudSub);
    ctx.ui.hud.appendChild(this.hud);
    this.paintBoard();
    void this.loadBoard();
    sfxSpace.portal();
    this.drone.start();
  }

  // -------------------------------------------------------------------------
  // Quality

  setQuality(tier: Tier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    const q = TIERS[tier];
    this.nebula.uniforms.uOctaves.value = q.octaves;
    this.disk.uniforms.uDetail.value = Math.min(4, q.octaves);
    this.diskBack.uniforms.uDetail.value = Math.min(3, q.octaves);
    this.planetMat.uniforms.uDetail.value = Math.min(4, q.octaves);
    this.diskBackMesh.visible = tier !== 'low';
    this.tiles.material = q.physical ? this.tileMats.physical : this.tileMats.plain;
    this.tileMats.physical.envMap = q.physical ? this.envMap : null;
    this.tileMats.physical.needsUpdate = true;

    if (this.motes) {
      this.scene.remove(this.motes);
      this.motes.geometry.dispose();
      (this.motes.material as THREE.Material).dispose();
    }
    const n = q.motes;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    let r = 13;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const rad = 6 + rnd() * 60;
      const a = rnd() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = -12 + rnd() * 40;
      pos[i * 3 + 2] = Math.sin(a) * rad - 10;
      seed[i] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.motes = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: S.MOTE_VERT, fragmentShader: S.MOTE_FRAG, uniforms: { ...this.uniforms, uScale: { value: 140 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);

    if (this.streaks) {
      this.scene.remove(this.streaks);
      this.streaks.geometry.dispose();
      (this.streaks.material as THREE.Material).dispose();
    }
    const count = q.streaks;
    this.streaks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: S.STREAK_VERT, fragmentShader: S.STREAK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), count);
    this.streaks.frustumCulled = false;
    this.streakState = [];
    const colors = ['#b18cff', '#53f0c0', '#6cc4ff', '#ffd24a', '#ff8fb0', '#ffffff'].map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      this.streakState.push({ pos: this.randomStreakPos(rnd, true), speed: 40 + rnd() * 90 });
      this.streaks.setColorAt(i, colors[i % colors.length]);
    }
    this.scene.add(this.streaks);
    this.composerKey = '';
  }

  private randomStreakPos(rnd: () => number, anywhere: boolean): THREE.Vector3 {
    // A slab of sky behind and around the black hole, re-entering from the lower left.
    const along = anywhere ? rnd() : 0;
    const p = new THREE.Vector3(-160 + rnd() * 200, -60 + rnd() * 120, -220 + rnd() * 160);
    return p.addScaledVector(this.flow, along * 260);
  }

  // -------------------------------------------------------------------------
  // Board

  private async loadBoard(): Promise<void> {
    const r = await api.scores(this.ctx.roomId, this.ctx.area.id, this.ctx.browserId);
    if (this.disposed || !r.ok || r.data.kind !== 'galaxy') return;
    this.boardRows = r.data.board;
    this.best = r.data.best;
    this.paintBoard();
  }

  private paintBoard(): void {
    const mat = this.boardMesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.map = boardTexture('Most orbs fed', this.boardRows.map((r) => ({ name: r.name, value: String(r.value), you: r.you })), this.best ? `Your best ${this.best}` : 'Start a frenzy to set a score', '#53f0c0');
    mat.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // Orbs

  private spawnOrb(instant = false): void {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2;
      const rad = 2 + Math.random() * (PR - 3.5);
      x = Math.sin(a) * rad;
      z = -Math.cos(a) * rad;
      const clearOfPlayer = Math.hypot(x - this.playerPos.x, z - this.playerPos.z) > 2.5;
      const clearOfOrbs = this.orbs.every((o) => o.state === 'gone' || Math.hypot(o.pos.x - x, o.pos.z - z) > 1.2);
      const clearOfShrine = Math.hypot(x - this.shrineSpot.x, z - this.shrineSpot.z + 1.2) > 1.8;
      const clearOfExit = Math.hypot(x + 7.6, z - 6.8) > 2.5;
      if (clearOfPlayer && clearOfOrbs && clearOfShrine && clearOfExit) break;
    }
    const color = ORB_COLORS[Math.floor(Math.random() * ORB_COLORS.length)];
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(ORB_R, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6) }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(1.8);
    const orb: Orb = { mesh, halo, pos: new THREE.Vector3(x, ORB_R, z), vel: new THREE.Vector3(), state: instant ? 'ground' : 'spawning', t: 0 };
    this.scene.add(mesh, halo);
    this.orbs.push(orb);
    if (!instant) sfxSpace.spawn();
  }

  private swallow(o: Orb): void {
    o.state = 'gone';
    this.scene.remove(o.mesh, o.halo);
    o.mesh.geometry.dispose();
    (o.mesh.material as THREE.Material).dispose();
    (o.halo.material as THREE.Material).dispose();
    this.flare = Math.min(1.5, this.flare + 0.8);
    this.fedTotal++;
    if (this.frenzy?.state === 'running') this.frenzy.fed++;
    sfxSpace.swallow();
  }

  private nearestKickable(player: PlayerState): Orb | null {
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    let best: Orb | null = null;
    let bd = 1.9;
    for (const o of this.orbs) {
      if (o.state !== 'ground') continue;
      const dx = o.pos.x - player.x;
      const dz = o.pos.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < bd && ((dx * fx + dz * fz) / (d || 1) > 0.1 || d < 0.8)) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  kickAction(player: PlayerState): { label: string; run: () => void } | null {
    if (player.riding) return null;
    const o = this.nearestKickable(player);
    if (!o) return null;
    return {
      label: 'Kick the orb',
      run: () => {
        const fx = Math.sin(player.yaw);
        const fz = Math.cos(player.yaw);
        o.vel.set(fx * 13, 4.2, fz * 13);
        o.state = 'fly';
        o.t = 0;
        sfx.kick(true);
      },
    };
  }

  actions(player: PlayerState): SpaceAction[] {
    if (player.riding || this.frenzy) return [];
    return [{ ...this.shrineSpot, range: 1.8, label: 'Start a feeding frenzy', short: 'Frenzy', run: () => this.startFrenzy() }];
  }

  /** Low gravity: jumps float. */
  gravity(): number {
    return 0.35;
  }

  holdsTime(): boolean {
    return !!this.frenzy;
  }

  private startFrenzy(): void {
    this.frenzy = { state: 'countdown', t: 0, fed: 0, shown: -1 };
  }

  step(dt: number, player: PlayerState): void {
    this.playerPos.set(player.x, 0, player.z);
    const fr = this.frenzy;
    if (fr) {
      fr.t += dt;
      if (fr.state === 'countdown') {
        const n = Math.floor(fr.t);
        if (n !== fr.shown) {
          fr.shown = n;
          if (n < 3) {
            this.ctx.ui.banner(String(3 - n), '#53f0c0');
            sfx.beep(false);
          } else {
            this.ctx.ui.banner('FEED IT!', '#ffd24a');
            sfx.beep(true);
            fr.state = 'running';
            fr.t = 0;
          }
        }
      } else if (fr.t >= frenzySeconds) {
        this.endFrenzy(fr.fed);
      }
    }
    // Keep orbs coming.
    const onPlatform = this.orbs.filter((o) => o.state === 'ground' || o.state === 'spawning').length;
    const want = fr?.state === 'running' ? 10 : 5;
    if (onPlatform < want && Math.random() < dt * (fr?.state === 'running' ? 3 : 0.8)) this.spawnOrb();

    const toHole = new THREE.Vector3();
    const axis = new THREE.Vector3(0, Math.cos(0.26), Math.sin(0.26));
    const swirl = new THREE.Vector3();
    for (const o of this.orbs) {
      if (o.state === 'gone') continue;
      o.t += dt;
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
        o.pos.x += o.vel.x * dt;
        o.pos.z += o.vel.z * dt;
        // Walking into an orb nudges it along.
        const dx = o.pos.x - player.x;
        const dz = o.pos.z - player.z;
        const d = Math.hypot(dx, dz);
        const rr = ORB_R + 0.38;
        if (!player.riding && d < rr && d > 1e-4) {
          const nx = dx / d;
          const nz = dz / d;
          o.pos.x = player.x + nx * rr;
          o.pos.z = player.z + nz * rr;
          const rel = (o.vel.x - player.vx) * nx + (o.vel.z - player.vz) * nz;
          if (rel < 0) {
            o.vel.x -= 1.4 * rel * nx;
            o.vel.z -= 1.4 * rel * nz;
          }
        }
        if (Math.hypot(o.pos.x, o.pos.z) > PR + 0.4) {
          o.state = 'fly';
          o.t = 0;
        }
      } else {
        // Pulled in, swirling around the disk's axis, with a little fall near the platform.
        toHole.subVectors(BH, o.pos);
        const dist = toHole.length();
        const pull = 420 / Math.max(dist, 6);
        o.vel.addScaledVector(toHole.normalize(), pull * dt);
        swirl.crossVectors(axis, toHole).normalize();
        o.vel.addScaledVector(swirl, (110 / Math.max(dist, 6)) * dt);
        if (Math.hypot(o.pos.x, o.pos.z) < PR + 1 && o.pos.y > ORB_R) o.vel.y -= 3.8 * dt;
        o.pos.addScaledVector(o.vel, dt);
        if (o.pos.y < ORB_R && Math.hypot(o.pos.x, o.pos.z) < PR) {
          // A weak kick lands back on the platform.
          o.pos.y = ORB_R;
          o.vel.y = 0;
          o.vel.multiplyScalar(0.6);
          o.state = 'ground';
        }
        if (dist < HORIZON * 1.05) this.swallow(o);
        else if (o.t > 14) this.swallow(o);
      }
    }
    this.orbs = this.orbs.filter((o) => o.state !== 'gone');
  }

  private endFrenzy(fed: number): void {
    this.frenzy = null;
    const prev = this.best;
    const isBest = prev === null || fed > prev;
    this.ctx.ui.banner(`${fed} fed!`, isBest && fed > 0 ? '#ffd24a' : '#fffaf0');
    this.ctx.ui.toast(isBest && fed > 0 ? `New best: ${fed} orbs into the black hole` : `${fed} orbs fed. Your best is ${prev}.`, isBest ? 'good' : 'info', 5000);
    sfx.goal();
    void api.frenzy(this.ctx.roomId, this.ctx.area.id, this.ctx.browserId, this.ctx.name(), fed).then((r) => {
      if (r.ok) void this.loadBoard();
    });
    if (isBest) this.best = fed;
    this.paintBoard();
  }

  // -------------------------------------------------------------------------
  // Frame

  cutaway(): void {}

  update(_night: number, t: number): void {
    const dt = Math.min(0.1, this.lastT ? t - this.lastT : 0);
    this.lastT = t;
    this.time += dt;
    this.arrivalT += dt;
    this.flare = Math.max(0, this.flare - dt * 1.2);
    this.uniforms.uTime.value = this.time;
    this.uniforms.uFlare.value = this.flare;
    this.planet.rotation.y += dt * 0.05;
    const spin = this.shrine.getObjectByName('spin');
    if (spin) {
      spin.rotation.y += dt * 1.4;
      spin.position.y = 1.6 + Math.sin(this.time * 1.6) * 0.15;
    }
    // Orbs: bob on the platform, stretch as they near the hole.
    for (const o of this.orbs) {
      const bob = o.state === 'ground' ? Math.sin(this.time * 3 + o.pos.x) * 0.06 : 0;
      o.mesh.position.set(o.pos.x, o.pos.y + bob + (o.state === 'spawning' ? 0.6 * (1 - o.t / 0.6) : 0), o.pos.z);
      o.halo.position.copy(o.mesh.position);
      const appear = o.state === 'spawning' ? o.t / 0.6 : 1;
      if (o.state === 'fly') {
        const dist = o.pos.distanceTo(BH);
        const stretch = 1 + Math.max(0, 1 - dist / 22) * 3.5;
        o.mesh.scale.set(1 / Math.sqrt(stretch), 1 / Math.sqrt(stretch), stretch);
        o.mesh.lookAt(o.mesh.position.clone().add(o.vel));
      } else o.mesh.scale.setScalar(appear);
      o.halo.scale.setScalar(1.8 * appear);
    }
    // Comet streaks rushing along the drawing's diagonal.
    if (this.streaks) {
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const xAxis = new THREE.Vector3(1, 0, 0);
      this.streakState.forEach((st, i) => {
        st.pos.addScaledVector(this.flow, st.speed * dt);
        if (st.pos.x > 140 || st.pos.y > 120) {
          let r = Math.floor(Math.random() * 1e9);
          st.pos.copy(this.randomStreakPos(() => ((r = (r * 16807) % 2147483647) / 2147483647), false)).addScaledVector(this.flow, -40);
        }
        q.setFromUnitVectors(xAxis, this.flow);
        scale.set(14 + (i % 5) * 6, 0.25 + (i % 3) * 0.12, 1);
        m4.compose(st.pos, q, scale);
        this.streaks!.setMatrixAt(i, m4);
      });
      this.streaks.instanceMatrix.needsUpdate = true;
    }
    this.paintHud();
  }

  private paintHud(): void {
    const fr = this.frenzy;
    if (fr) {
      this.hudTop.textContent = fr.state === 'countdown' ? 'Get ready' : 'Feeding frenzy';
      this.hudBig.textContent = fr.state === 'countdown' ? '…' : `${Math.max(0, Math.ceil(frenzySeconds - fr.t))}s`;
      this.hudSub.textContent = `${fr.fed} fed${this.best !== null ? ` · Best ${this.best}` : ''}`;
    } else {
      this.hudTop.textContent = 'Kick orbs into the black hole';
      this.hudBig.textContent = String(this.fedTotal);
      this.hudSub.textContent = this.best !== null ? `Fed this visit · Frenzy best ${this.best}` : 'Fed this visit';
    }
  }

  private ensureComposer(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    const q = TIERS[this.tier ?? 'medium'];
    const size = renderer.getSize(new THREE.Vector2());
    const key = `${this.tier}|${size.x}x${size.y}|${renderer.getPixelRatio()}`;
    if (this.composer && key === this.composerKey) return;
    this.composer?.dispose();
    this.composerKey = key;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(this.scene, camera));
    if (q.lens) {
      this.lens = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uRadius: { value: 0.05 }, uAspect: { value: 1 }, uStrength: { value: 0.9 } }, vertexShader: S.QUAD_VERT, fragmentShader: S.LENS_FRAG });
      composer.addPass(this.lens);
    } else this.lens = null;
    if (q.bloom > 0) {
      const res = new THREE.Vector2(size.x, size.y).multiplyScalar(this.tier === 'high' ? 1 : 0.5);
      // Only bright things bloom: the disk, the orbs, the seams and the stars.
      this.bloom = new UnrealBloomPass(res, q.bloom, 0.5, 0.62);
      composer.addPass(this.bloom);
    } else this.bloom = null;
    this.final = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uWarp: { value: 0 }, uAberration: { value: q.aberration }, uHoleCenter: { value: new THREE.Vector2(-9, -9) }, uHoleRadius: { value: 0 }, uAspect: { value: 1 } }, vertexShader: S.QUAD_VERT, fragmentShader: S.FINAL_FRAG });
    composer.addPass(this.final);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): boolean {
    // Billboards face the camera.
    this.ring.quaternion.copy(camera.quaternion);
    this.diskBackMesh.quaternion.copy(camera.quaternion);
    this.diskBackMesh.rotateZ(0.08);
    if (this.tier !== 'low' && !this.envMap) {
      // Reflections of the nebula for the glass tiles, made once.
      const pm = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      const envSphere = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.nebula);
      envScene.add(envSphere);
      this.envMap = pm.fromScene(envScene, 0.04).texture;
      pm.dispose();
      envSphere.geometry.dispose();
      this.tileMats.physical.envMap = this.envMap;
      this.tileMats.physical.envMapIntensity = 0.55;
      this.tileMats.physical.needsUpdate = true;
    }
    if (this.tier === 'low') {
      // Cheap arrival: no warp pass, the fade does the work.
      return false;
    }
    this.ensureComposer(renderer, camera);
    const warp = Math.max(0, 1 - this.arrivalT / 1.8);
    if (this.final) {
      this.final.uniforms.uWarp.value = warp * warp;
      this.final.uniforms.uTime.value = this.time;
    }
    // Where the black hole is on screen, for the lens and the bloom mask.
    const p = BH.clone().project(camera);
    const edge = BH.clone().add(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(HORIZON)).project(camera);
    const size = renderer.getSize(new THREE.Vector2());
    const aspect = size.x / size.y;
    const ahead = p.z < 1;
    const visible = ahead && Math.abs(p.x) < 1.6 && Math.abs(p.y) < 1.6;
    const radius = Math.abs(edge.x - p.x) * 0.5 * aspect;
    if (this.final) {
      this.final.uniforms.uHoleCenter.value.set(ahead ? p.x * 0.5 + 0.5 : -9, ahead ? p.y * 0.5 + 0.5 : -9);
      this.final.uniforms.uHoleRadius.value = ahead ? radius : 0;
      this.final.uniforms.uAspect.value = aspect;
    }
    if (this.lens) {
      this.lens.uniforms.uCenter.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
      this.lens.uniforms.uRadius.value = radius;
      this.lens.uniforms.uAspect.value = aspect;
      this.lens.uniforms.uStrength.value = visible ? 0.9 : 0;
    }
    this.composer!.render();
    return true;
  }

  resize(): void {
    this.composerKey = '';
  }

  dispose(): void {
    this.disposed = true;
    this.drone.stop();
    this.hud.remove();
    this.composer?.dispose();
    this.envMap?.dispose();
    this.tileMats.physical.dispose();
    this.tileMats.plain.dispose();
    disposeTree(this.scene);
  }

  /** Playtests only: a short frenzy. */
  debugShortFrenzy(seconds: number): void {
    frenzySeconds = seconds;
  }

  /** For scripted playtests. */
  debugInfo() {
    return {
      tier: this.tier,
      orbs: this.orbs.map((o) => ({ x: o.pos.x, z: o.pos.z, state: o.state })),
      fed: this.fedTotal,
      frenzy: this.frenzy ? { state: this.frenzy.state, t: this.frenzy.t, fed: this.frenzy.fed } : null,
      best: this.best,
      shrine: this.shrineSpot,
      composer: !!this.composer,
    };
  }
}
