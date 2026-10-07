// Outside the hull: a sky that follows the town's clock (or the helm's
// choice), the river, and two banks of hills, trees and cottages sliding
// past so the boat always feels under way. The cutaway shows all of it.

import * as THREE from 'three';
import type { Tier } from '../../world/space';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WATER_Y } from './layout';
import { canvasTex } from './materials';

export type Scenery = 'town' | 'sunset' | 'moon';

interface Look {
  top: THREE.Color;
  horizon: THREE.Color;
  light: THREE.Color;
  lightI: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  water: THREE.Color;
  hills: THREE.Color;
}

const c = (h: string) => new THREE.Color(h);
const NIGHT: Look = { top: c('#0a1030'), horizon: c('#26336a'), light: c('#9db0ff'), lightI: 0.5, hemiSky: c('#5a6ab0'), hemiGround: c('#241f3a'), hemiI: 0.55, water: c('#0e1a3a'), hills: c('#14243a') };
const DUSK: Look = { top: c('#3b4f96'), horizon: c('#ff9a6a'), light: c('#ffb47c'), lightI: 1.4, hemiSky: c('#b7a6d8'), hemiGround: c('#5a4a48'), hemiI: 0.7, water: c('#5a5a8a'), hills: c('#4a4a5a') };
const DAY: Look = { top: c('#4f9cf2'), horizon: c('#d4ecff'), light: c('#fff1da'), lightI: 2.2, hemiSky: c('#d4e8ff'), hemiGround: c('#8c7a5c'), hemiI: 0.85, water: c('#3f7f9a'), hills: c('#5f8f4a') };

function mix(a: Look, b: Look, t: number, out: Look): void {
  for (const k of ['top', 'horizon', 'light', 'hemiSky', 'hemiGround', 'water', 'hills'] as const) out[k].copy(a[k]).lerp(b[k], t);
  out.lightI = a.lightI + (b.lightI - a.lightI) * t;
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * t;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 sunDir;
uniform vec3 sunColor;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, -0.2, 1.0);
  vec3 col = mix(horizon, top, pow(smoothstep(-0.04, 0.7, h), 0.7));
  float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
  col += sunColor * (pow(d, 700.0) * 1.6 + pow(d, 10.0) * 0.2);
  gl_FragColor = vec4(col, 1.0);
}`;

/** How far the scenery loops: each bank copy covers this much river. */
const LOOP = 360;
/** How fast the banks slide past, m/s. */
const SPEED = 2.2;

export class River {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  night = 0;
  scenery: Scenery = 'town';
  private look: Look = { top: c('#000'), horizon: c('#000'), light: c('#000'), lightI: 0, hemiSky: c('#000'), hemiGround: c('#000'), hemiI: 0, water: c('#000'), hills: c('#000') };
  private sky: THREE.Mesh;
  private skyU: Record<string, THREE.IUniform>;
  private water: THREE.Mesh;
  private waterTex: THREE.CanvasTexture;
  private waterMat: THREE.MeshStandardMaterial;
  private banks: THREE.Group[] = [];
  private hillMat: THREE.MeshStandardMaterial;
  private windowMat: THREE.MeshStandardMaterial;
  private trees: THREE.InstancedMesh[] = [];
  private windows: THREE.InstancedMesh[] = [];
  private stars: THREE.Points;
  private moon: THREE.Mesh;
  private flies: THREE.Points;
  private fog: THREE.Fog;
  private owned: { dispose(): void }[] = [];
  private scroll = 0;

  constructor(private scene: THREE.Scene) {
    this.group.name = 'river';
    const own = <X extends { dispose(): void }>(x: X): X => {
      this.owned.push(x);
      return x;
    };
    this.skyU = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() } };
    this.sky = new THREE.Mesh(own(new THREE.SphereGeometry(420, 32, 16)), own(new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false })));
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    // Water: a ripple texture that drifts past the hull.
    this.waterTex = own(
      canvasTex(256, 256, (g, s) => {
        g.fillStyle = '#7f8fa0';
        g.fillRect(0, 0, s, s);
        let seed = 17;
        const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 220; i++) {
          const y = r() * s;
          const x = r() * s;
          const w = 8 + r() * 40;
          g.strokeStyle = `rgba(255,255,255,${0.08 + r() * 0.22})`;
          g.lineWidth = 1 + r() * 2;
          g.beginPath();
          g.moveTo(x, y);
          g.quadraticCurveTo(x + w / 2, y - 2, x + w, y);
          g.stroke();
          g.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`;
          g.beginPath();
          g.moveTo(x + 3, y + 3);
          g.quadraticCurveTo(x + w / 2, y + 5, x + w - 3, y + 3);
          g.stroke();
        }
      }),
    );
    this.waterTex.repeat.set(60, 60);
    this.waterMat = own(new THREE.MeshStandardMaterial({ color: '#3f7f9a', map: this.waterTex, roughness: 0.35, metalness: 0.1, envMapIntensity: 0.15 }));
    this.water = new THREE.Mesh(own(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2)), this.waterMat);
    this.water.position.y = WATER_Y;
    this.water.receiveShadow = true;
    this.group.add(this.water);

    // Banks: rolling hills on both sides, trees and cottages, two copies each that leapfrog.
    this.hillMat = own(new THREE.MeshStandardMaterial({ color: '#5f8f4a', roughness: 0.95, flatShading: true }));
    this.windowMat = own(new THREE.MeshStandardMaterial({ color: '#2a2018', emissive: new THREE.Color('#ffc46a'), emissiveIntensity: 0, roughness: 0.8 }));
    // Both banks' hills in one mesh; trunks merged into their crowns and roofs into their
    // houses (vertex colours), so each copy of the scenery costs five draw calls.
    const coloured = (parts: [THREE.BufferGeometry, string][]) => {
      const list = parts.map(([g, col]) => {
        const geo = g.index ? g.toNonIndexed() : g;
        const c = new THREE.Color(col);
        const n = geo.attributes.position.count;
        const arr = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
        geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(k)) geo.deleteAttribute(k);
        return geo;
      });
      return own(mergeGeometries(list)!);
    };
    const hillOne = this.hillGeometry();
    const hillOther = hillOne.clone().scale(1, 1, -1);
    // The mirrored copy faces the wrong way after scaling; flip its winding back.
    const idx = hillOther.index!;
    for (let i = 0; i < idx.count; i += 3) {
      const t = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, t);
    }
    hillOther.computeVertexNormals();
    const hillGeo = own(mergeGeometries([hillOne.translate(0, 0, 70), hillOther.translate(0, 0, -70)])!);
    hillOne.dispose();
    hillOther.dispose();
    const pineGeo = coloured([[new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6).translate(0, 1.1, 0), '#5a3a24'], [new THREE.ConeGeometry(2.0, 5.5, 7).translate(0, 4.6, 0), '#2f6a3a']]);
    const roundGeo = coloured([[new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6).translate(0, 1.1, 0), '#5a3a24'], [new THREE.IcosahedronGeometry(2.3, 0).translate(0, 4.0, 0), '#4a8a3a']]);
    const houseGeo = coloured([[new THREE.BoxGeometry(5, 3.2, 4).translate(0, 1.6, 0), '#efe2c8'], [new THREE.ConeGeometry(4.2, 2.6, 4).rotateY(Math.PI / 4).translate(0, 4.5, 0), '#a8432e']]);
    const win = own(new THREE.BoxGeometry(5.06, 0.9, 1.2).translate(0, 1.9, 0));
    const treeMat = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    const houseMat = own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }));
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const TREES = 200;
    const HOUSES = 10;
    for (let copy = 0; copy < 2; copy++) {
      const bank = new THREE.Group();
      const hills = new THREE.Mesh(hillGeo, this.hillMat);
      hills.receiveShadow = false;
      bank.add(hills);
      const mats = new THREE.Matrix4();
      const tC = new THREE.InstancedMesh(pineGeo, treeMat, TREES / 2);
      const tR = new THREE.InstancedMesh(roundGeo, treeMat, TREES / 2);
      for (let i = 0; i < TREES; i++) {
        const side = rnd() < 0.5 ? -1 : 1;
        const x = -LOOP / 2 + rnd() * LOOP;
        const z = side * (34 + rnd() * 50);
        const sc = 0.8 + rnd() * 0.7;
        const y = this.hillHeight(x, Math.abs(z) - 70) - 0.3;
        mats.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6), new THREE.Vector3(sc, sc, sc));
        if (i % 2) tC.setMatrixAt(i >> 1, mats);
        else tR.setMatrixAt(i >> 1, mats);
      }
      for (const t of [tC, tR]) {
        t.instanceMatrix.needsUpdate = true;
        t.computeBoundingSphere();
        bank.add(t);
        this.trees.push(t);
      }
      const hW = new THREE.InstancedMesh(houseGeo, houseMat, HOUSES);
      const hWin = new THREE.InstancedMesh(win, this.windowMat, HOUSES);
      for (let i = 0; i < HOUSES; i++) {
        const side = i % 2 ? -1 : 1;
        const x = -LOOP / 2 + (i + rnd() * 0.6) * (LOOP / HOUSES);
        const z = side * (36 + rnd() * 16);
        const y = this.hillHeight(x, Math.abs(z) - 70) - 0.2;
        mats.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rnd() - 0.5) * 0.8), new THREE.Vector3(1, 1, 1));
        hW.setMatrixAt(i, mats);
        hWin.setMatrixAt(i, mats);
      }
      for (const t of [hW, hWin]) {
        t.instanceMatrix.needsUpdate = true;
        t.computeBoundingSphere();
        bank.add(t);
      }
      this.windows.push(hWin);
      this.banks.push(bank);
      this.group.add(bank);
    }

    // Stars, the moon and fireflies along the banks.
    const starPos: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const u = rnd();
      const v = 0.08 + rnd() * 0.92;
      const th = u * Math.PI * 2;
      const r = Math.sqrt(1 - v * v);
      starPos.push(Math.cos(th) * r * 400, v * 400, Math.sin(th) * r * 400);
    }
    const sg = own(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(sg, own(new THREE.PointsMaterial({ color: '#dfe8ff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })));
    this.stars.frustumCulled = false;
    this.group.add(this.stars);
    const moonTex = own(
      canvasTex(
        128,
        128,
        (g, s) => {
          const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
          grd.addColorStop(0, 'rgba(255,255,240,1)');
          grd.addColorStop(0.42, 'rgba(240,244,255,1)');
          grd.addColorStop(0.5, 'rgba(200,215,255,0.35)');
          grd.addColorStop(1, 'rgba(200,215,255,0)');
          g.fillStyle = grd;
          g.fillRect(0, 0, s, s);
          g.fillStyle = 'rgba(180,190,220,0.35)';
          for (const [x, y, r] of [[52, 50, 9], [74, 70, 6], [60, 80, 5]]) {
            g.beginPath();
            g.arc(x, y, r, 0, Math.PI * 2);
            g.fill();
          }
        },
        false,
      ),
    );
    this.moon = new THREE.Mesh(own(new THREE.PlaneGeometry(40, 40)), own(new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, depthWrite: false, fog: false })));
    this.moon.position.set(-160, 170, 260);
    this.moon.lookAt(0, 0, 0);
    this.group.add(this.moon);
    const flyPos: number[] = [];
    for (let i = 0; i < 200; i++) flyPos.push(-120 + rnd() * 240, 0.5 + rnd() * 3, (rnd() < 0.5 ? -1 : 1) * (32 + rnd() * 12));
    const fg = own(new THREE.BufferGeometry());
    fg.setAttribute('position', new THREE.Float32BufferAttribute(flyPos, 3));
    this.flies = new THREE.Points(fg, own(new THREE.PointsMaterial({ color: '#d8ff7a', size: 0.5, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })));
    this.group.add(this.flies);

    this.sun = new THREE.DirectionalLight('#fff1da', 2);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -14;
    sc.right = sc.top = 14;
    sc.near = 1;
    sc.far = 80;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 0.8);
    this.group.add(this.sun, this.sun.target, this.hemi);
    this.fog = new THREE.Fog('#cfe6ff', 90, 330);
    scene.fog = this.fog;
    scene.add(this.group);
  }

  private hillHeight(x: number, out: number): number {
    // `out` is the distance beyond the bank line (negative is nearer the water).
    const shore = smooth(-36, -20, out);
    return WATER_Y - 0.5 + shore * (3 + 7 * (0.5 + 0.5 * Math.sin(x * 0.031 + 1.3)) * (0.6 + 0.4 * Math.sin(x * 0.083))) + Math.max(0, out) * 0.18;
  }

  private hillGeometry(): THREE.BufferGeometry {
    const g = new THREE.PlaneGeometry(LOOP, 90, 90, 18).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setY(i, this.hillHeight(x, z) + (Math.sin(x * 0.7 + z) * 0.3));
    }
    g.computeVertexNormals();
    return g;
  }

  setQuality(t: Tier): void {
    const trees = t === 'low' ? 30 : t === 'medium' ? 100 : 200;
    for (const m of this.trees) m.count = Math.min(m.instanceMatrix.count, trees / 2);
    this.stars.geometry.setDrawRange(0, t === 'low' ? 400 : t === 'medium' ? 1500 : 4000);
    this.flies.visible = t !== 'low';
    this.flies.geometry.setDrawRange(0, t === 'medium' ? 60 : 200);
    this.waterMat.metalness = t === 'low' ? 0 : 0.2;
  }

  /** Brightness of lamps and windows, from the scenery choice or the town clock. */
  update(dt: number, townPhase: number, focus: THREE.Vector3): void {
    const phase = this.scenery === 'sunset' ? 0.735 : this.scenery === 'moon' ? 0.02 : townPhase;
    const ang = (phase - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    const dayT = smooth(-0.02, 0.32, elev);
    const nightT = 1 - smooth(-0.22, 0.02, elev);
    if (nightT > 0.5) mix(NIGHT, DUSK, 1 - nightT, this.look);
    else mix(DUSK, DAY, dayT, this.look);
    this.night = nightT;
    const L = this.look;
    (this.skyU.top.value as THREE.Color).copy(L.top);
    (this.skyU.horizon.value as THREE.Color).copy(L.horizon);
    const sunDir = new THREE.Vector3(Math.cos(ang), Math.max(elev, -0.3), -0.45).normalize();
    (this.skyU.sunDir.value as THREE.Vector3).copy(elev > -0.1 ? sunDir : new THREE.Vector3(-0.4, 0.4, 0.65).normalize());
    (this.skyU.sunColor.value as THREE.Color).copy(elev > -0.1 ? L.light : new THREE.Color('#000'));
    this.fog.color.copy(L.horizon);
    this.scene.background = L.horizon;
    // Light comes in through the starboard windows by day; the moon by night.
    const lightDir = elev > -0.05 ? new THREE.Vector3(Math.cos(ang) * 0.6, Math.max(0.35, elev), -0.6).normalize() : new THREE.Vector3(-0.3, 0.8, 0.5).normalize();
    this.sun.color.copy(L.light);
    this.sun.intensity = L.lightI;
    this.sun.position.copy(focus).addScaledVector(lightDir, 40);
    this.sun.target.position.copy(focus);
    this.hemi.color.copy(L.hemiSky);
    this.hemi.groundColor.copy(L.hemiGround);
    this.hemi.intensity = L.hemiI;
    this.waterMat.color.copy(L.water);
    this.hillMat.color.copy(L.hills);
    this.windowMat.emissiveIntensity = nightT * 1.6;
    // Cottage windows only matter once they glow.
    for (const wm of this.windows) wm.visible = nightT > 0.05;
    (this.stars.material as THREE.PointsMaterial).opacity = nightT;
    (this.moon.material as THREE.MeshBasicMaterial).opacity = nightT;
    this.moon.visible = nightT > 0.02;
    const fm = this.flies.material as THREE.PointsMaterial;
    fm.opacity = nightT * (0.6 + 0.4 * Math.sin(performance.now() / 300));
    // The boat steams on: the river and banks slide towards the stern.
    this.scroll += dt * SPEED;
    this.waterTex.offset.x = -(this.scroll / 15) % 1;
    this.banks.forEach((b, i) => {
      b.position.x = ((this.scroll + i * LOOP) % (LOOP * 2)) - LOOP;
    });
    this.flies.position.x = (this.scroll % 240) - 120 > 0 ? (this.scroll % 240) - 240 : this.scroll % 240;
  }

  /** The sky's horizon colour, for windows and fog. */
  get horizon(): THREE.Color {
    return this.look.horizon;
  }

  dispose(): void {
    this.scene.fog = null;
    for (const o of this.owned) o.dispose();
    for (const t of this.trees) t.dispose();
  }
}
