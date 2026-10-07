// Builds Little Puffington: the ground, sky and hills, every building and
// landmark, bunting, lamps, trees and flowers, merged per material so the
// whole village costs a few dozen draw calls. Returns the moving parts
// (canopies, the balloon, windmill sails, the bell, water) for animation.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { boardTexture } from '../common';
import { DISPLAY_FONT, BODY_FONT, lightPoolTexture, roundRect } from '../../world/kit';
import { BALLOON, BANDSTAND, BELL_TOWER, BLANKETS, EXIT, FOUNTAIN, LAMPS, LIBRARY, MAYPOLE, PARAPET, POND, WINDMILL, canopies } from './layout';
import { Painter, mtx } from './painter';
import { BUNTING, C, hex, painted } from './palette';
import { rng } from './sim/rng';
import { balloonTexture, brickTexture, clockTexture, GROUND_HALF, groundTexture, hedgeTexture, pictogramTexture, plasterTexture, roofTexture, stoneTexture, stripeTexture, woodTexture } from './textures';
import type { Tier } from '../../world/space';

export interface Mats {
  paint: THREE.MeshStandardMaterial;
  plaster: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  brick: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  hedge: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  signs: THREE.MeshStandardMaterial;
}

export function makeMats(): Mats {
  return {
    paint: painted(),
    plaster: painted(plasterTexture()),
    roof: painted(roofTexture()),
    brick: painted(brickTexture()),
    stone: painted(stoneTexture()),
    wood: painted(woodTexture()),
    hedge: painted(hedgeTexture(), { rough: 1 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.15, emissive: 0xffc27a, emissiveIntensity: 0 }),
    brass: painted(null, { metal: 0.65, rough: 0.32, emissive: 0x6b4a10, emissiveIntensity: 0.25 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    signs: new THREE.MeshStandardMaterial({ roughness: 0.75 }),
  };
}

// ---------------------------------------------------------------------------
// Sign atlas: every painted sign in one texture, one draw call.

interface SignRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

class SignAtlas {
  readonly canvas = document.createElement('canvas');
  readonly g: CanvasRenderingContext2D;
  private x = 0;
  private y = 0;
  private row = 0;
  constructor(readonly W = 2048, readonly H = 2048) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
  }

  rect(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): SignRect {
    if (this.x + w > this.W) {
      this.x = 0;
      this.y += this.row + 4;
      this.row = 0;
    }
    const x = this.x;
    const y = this.y;
    this.g.save();
    this.g.translate(x, y);
    this.g.beginPath();
    this.g.rect(0, 0, w, h);
    this.g.clip();
    draw(this.g, w, h);
    this.g.restore();
    this.x += w + 4;
    this.row = Math.max(this.row, h);
    return { u0: x / this.W, v0: 1 - (y + h) / this.H, u1: (x + w) / this.W, v1: 1 - y / this.H };
  }

  texture(): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(this.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
}

function plaque(text: string, opts: { bg?: string; fg?: string; border?: string; sub?: string; size?: number } = {}) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.fillStyle = opts.bg ?? '#fff7e6';
    roundRect(g, 0, 0, w, h, Math.min(w, h) * 0.18);
    g.fill();
    const lw = Math.max(6, h * 0.07);
    g.lineWidth = lw;
    g.strokeStyle = opts.border ?? hex(C.ink);
    roundRect(g, lw / 2 + 3, lw / 2 + 3, w - lw - 6, h - lw - 6, Math.min(w, h) * 0.15);
    g.stroke();
    g.fillStyle = opts.fg ?? hex(C.ink);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = (opts.size ?? (opts.sub ? 0.46 : 0.6)) * h;
    g.font = `${size}px ${DISPLAY_FONT}`;
    while (g.measureText(text).width > w * 0.86 && size > 10) {
      size *= 0.92;
      g.font = `${size}px ${DISPLAY_FONT}`;
    }
    g.fillText(text, w / 2, opts.sub ? h * 0.4 : h * 0.54);
    if (opts.sub) {
      let s2 = h * 0.2;
      g.font = `700 ${s2}px ${BODY_FONT}`;
      while (g.measureText(opts.sub).width > w * 0.88 && s2 > 8) {
        s2 *= 0.92;
        g.font = `700 ${s2}px ${BODY_FONT}`;
      }
      g.fillText(opts.sub, w / 2, h * 0.76);
    }
  };
}

/** A plane with atlas UVs, facing yaw (0 faces +z). */
function signPlane(r: SignRect, w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
  return g;
}

// ---------------------------------------------------------------------------

export interface Village {
  group: THREE.Group;
  canopies: { id: string; mesh: THREE.Object3D; wobble: number }[];
  balloon: THREE.Group;
  sails: THREE.Object3D;
  bell: THREE.Object3D;
  weathercock: THREE.Object3D;
  fountainWater: THREE.Mesh;
  pondWater: THREE.Mesh;
  clockHands: THREE.Object3D[];
  pools: THREE.InstancedMesh;
  boards: Record<'rings' | 'band' | 'library' | 'picnic', THREE.Mesh>;
  trees: THREE.InstancedMesh;
  closedSign: THREE.Object3D;
  tootomaticHorn: THREE.Object3D;
  sky: THREE.Mesh;
  flowers: THREE.InstancedMesh | null;
  skyPuffs: THREE.InstancedMesh;
  mats: Mats;
  lanterns: THREE.Mesh[];
  windowsMat: THREE.MeshStandardMaterial;
}

export function buildVillage(parent: THREE.Object3D, tier: Tier, owner: string): Village {
  const group = new THREE.Group();
  group.name = 'village';
  parent.add(group);
  const M = makeMats();
  const P = new Painter();
  const R = rng(2024);
  const atlas = new SignAtlas();
  const signs: [THREE.BufferGeometry, THREE.Matrix4][] = [];
  const addSign = (r: SignRect, w: number, h: number, x: number, y: number, z: number, yaw: number, rx = 0) => signs.push([signPlane(r, w, h), mtx(x, y, z, rx, yaw, 0)]);

  // ---- ground
  const gt = groundTexture(tier === 'low' ? 1024 : 2048);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_HALF * 2, GROUND_HALF * 2), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  // The countryside beyond: a wide ring of meadow and hills.
  const outer = new THREE.RingGeometry(GROUND_HALF * 0.98, 260, 48, 6);
  const op = outer.attributes.position as THREE.BufferAttribute;
  const oc = new Float32Array(op.count * 3);
  for (let i = 0; i < op.count; i++) {
    const x = op.getX(i);
    const y = op.getY(i);
    const r = Math.hypot(x, y);
    const a = Math.atan2(y, x);
    const hill = r > 70 ? (Math.sin(a * 5 + 1) * 0.5 + Math.sin(a * 11 + 2) * 0.3 + 0.9) * Math.min(1, (r - 70) / 60) * 22 : 0;
    op.setZ(i, hill - (r < 40 ? 0.02 : 0));
    const col = new THREE.Color(C.grass).lerp(new THREE.Color(0x7fb86a), Math.min(1, hill / 18)).lerp(new THREE.Color(C.haze), Math.min(0.55, Math.max(0, (r - 90) / 220)));
    oc.set([col.r, col.g, col.b], i * 3);
  }
  outer.setAttribute('color', new THREE.BufferAttribute(oc, 3));
  outer.computeVertexNormals();
  const outerMesh = new THREE.Mesh(outer, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  outerMesh.rotation.x = -Math.PI / 2;
  outerMesh.position.y = -0.03;
  outerMesh.receiveShadow = true;
  group.add(outerMesh);

  // ---- sky dome
  const skyGeo = new THREE.SphereGeometry(380, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTop: { value: new THREE.Color(C.sky) }, uHorizon: { value: new THREE.Color(C.haze) }, uSun: { value: new THREE.Vector3(0.4, 0.6, 0.7).normalize() }, uSunCol: { value: new THREE.Color(0xfff2c8) }, uStars: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uTop, uHorizon, uSunCol, uSun; uniform float uStars; varying vec3 vDir;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      void main(){
        float h = clamp(vDir.y, -0.1, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.55));
        float s = max(dot(vDir, uSun), 0.0);
        col += uSunCol * (pow(s, 600.0) * 1.2 + pow(s, 12.0) * 0.18);
        if (uStars > 0.01 && h > 0.05) {
          vec2 g = floor(vDir.xz / (vDir.y + 0.4) * 160.0);
          float st = step(0.9975, h21(g));
          col += vec3(st) * uStars * smoothstep(0.05, 0.3, h);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);
  // Puffy fair-weather clouds high up.
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const skyPuffs = new THREE.InstancedMesh(puffGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffeedd, emissiveIntensity: 0.35, fog: false }), 54);
  {
    let i = 0;
    for (let c = 0; c < 9; c++) {
      const a = (c / 9) * Math.PI * 2 + R() * 0.5;
      const r = 110 + R() * 70;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const cy = 48 + R() * 25;
      for (let k = 0; k < 6; k++) {
        const s = 6 + R() * 7;
        skyPuffs.setMatrixAt(i++, mtx(cx + (k - 2.5) * 5 + R() * 3, cy + R() * 4 - (k === 0 || k === 5 ? 3 : 0), cz + R() * 4, 0, 0, 0, s, s * 0.7, s));
      }
    }
  }
  skyPuffs.frustumCulled = false;
  group.add(skyPuffs);

  // ---- hedges
  const hedgeBox = (x: number, z: number, hw: number, hd: number, h: number, col = C.hedge) => {
    P.box(M.hedge, col, x, 0, z, hw * 2, h - 0.25, hd * 2, { tile: 1.5 });
    // A rounded top.
    const long = hw > hd;
    const cyl = new THREE.CylinderGeometry(long ? hd : hw, long ? hd : hw, (long ? hw : hd) * 2, 10, 1);
    P.add(cyl, M.hedge, col, mtx(x, h - 0.25, z, long ? 0 : Math.PI / 2, 0, long ? Math.PI / 2 : 0, 1, 1, 0.55), { tile: 1.5 });
  };
  hedgeBox(-3.45, 28.925, 0.45, 4.475, 1.6);
  hedgeBox(-3.45, 21.975, 0.45, 0.575, 1.6);
  hedgeBox(3.45, 27.7, 0.45, 5.7, 1.6);
  hedgeBox(-8.5, 12.5, 5.5, 0.4, 1.6);
  hedgeBox(8.5, 12.5, 5.5, 0.4, 1.6);
  // The boundary: tall hedge walls with trees behind.
  const BH = 2.6;
  for (const [x, z, hw, hd] of [[0, -32.6, 33, 0.6], [-32.6, 0, 0.6, 33], [32.6, 0, 0.6, 33]] as const) hedgeBox(x, z, hw, hd, BH, C.hedgeDark);
  // South garden walls (brick with a cap) either side of the lane.
  for (const sx of [-1, 1]) {
    P.box(M.brick, 0xd98a6a, sx * 18, 0, 32.9, 28.2, 2.0, 1.2, { tile: 1.2 });
    P.box(M.stone, C.stone, sx * 18, 2.0, 32.9, 28.4, 0.2, 1.36, { tile: 2 });
  }
  // Gate arch where the lane leaves the village (south end), so the lane ends somewhere.
  P.box(M.brick, 0xd98a6a, -3.6, 0, 34.2, 1.2, 3.2, 1.2, { tile: 1.2 });
  P.box(M.brick, 0xd98a6a, 3.6, 0, 34.2, 1.2, 3.2, 1.2, { tile: 1.2 });
  P.box(M.wood, C.timber, 0, 0, 34.6, 6.0, 1.4, 0.12, { tile: 1 });

  // ---- welcome arch over the lane at z 24.5 (high, so the arrival camera sees under it)
  for (const sx of [-1, 1]) {
    P.add(new THREE.CylinderGeometry(0.16, 0.2, 4.8, 10), M.wood, C.timber, mtx(sx * 3.2, 2.4, 24.5));
    P.add(new THREE.SphereGeometry(0.24, 10, 8), M.brass, C.brass, mtx(sx * 3.2, 4.9, 24.5));
  }
  P.add(new THREE.TorusGeometry(3.2, 0.1, 6, 24, Math.PI), M.wood, C.timber, mtx(0, 4.6, 24.5, 0, 0, 0, 1, 0.3, 1));
  const welcome = atlas.rect(1024, 220, plaque('Welcome to Little Puffington', { sub: 'Summer fete today. Strictly no funny business.', border: hex(C.tomato) }));
  P.box(M.paint, C.cream, 0, 4.3, 24.5, 3.8, 0.86, 0.1, { base: null });
  addSign(welcome, 3.6, 0.78, 0, 4.73, 24.56, 0);
  addSign(welcome, 3.6, 0.78, 0, 4.73, 24.44, Math.PI);
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (i / 13);
    P.add(new THREE.SphereGeometry(0.13, 8, 6), M.paint, [C.flowerP, C.flowerY, 0xffffff][i % 3], mtx(Math.cos(a) * 3.2, 4.6 + Math.sin(a) * 0.96, 24.5), { base: null });
  }

  // ---- exit gate in the west lane hedge
  {
    const ex = -3.5;
    const ez = EXIT.z;
    for (const dz of [-0.95, 0.95]) P.add(new THREE.CylinderGeometry(0.12, 0.14, 2.6, 8), M.wood, 0xfff1d6, mtx(ex, 1.3, ez + dz));
    P.add(new THREE.TorusGeometry(0.95, 0.12, 6, 16, Math.PI), M.hedge, C.hedge, mtx(ex, 2.55, ez, 0, Math.PI / 2, 0));
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI;
      P.add(new THREE.SphereGeometry(0.12, 8, 6), M.paint, [C.flowerP, 0xffffff, C.flowerY][i % 3], mtx(ex + 0.1, 2.55 + Math.sin(a) * 0.95, ez + Math.cos(a) * 0.95), { base: null });
    }
    // The little gate itself, closed, with pickets.
    for (let i = 0; i < 6; i++) P.box(M.wood, 0xfff1d6, ex, 0, ez - 0.75 + i * 0.3, 0.08, 1.1, 0.16, { tile: 1 });
    P.box(M.wood, 0xfff1d6, ex, 0.35, ez, 0.06, 0.1, 1.8, { tile: 1 });
    P.box(M.wood, 0xfff1d6, ex, 0.85, ez, 0.06, 0.1, 1.8, { tile: 1 });
    const back = atlas.rect(640, 200, plaque(`Back to ${owner}'s room`, { bg: '#fff7e6', border: hex(C.bean), size: 0.48 }));
    P.box(M.wood, C.timber, ex + 0.25, 0, ez + 1.4, 0.12, 2.1, 0.12, { tile: 1 });
    P.box(M.paint, C.cream, ex + 0.25, 1.65, ez + 1.4, 0.06, 0.52, 1.5, { base: null });
    addSign(back, 1.44, 0.45, ex + 0.29, 1.91, ez + 1.4, Math.PI / 2);
  }

  // ---- lamp posts with lanterns
  const lanternGeo = new THREE.SphereGeometry(0.22, 12, 8);
  const lanterns: THREE.Matrix4[] = [];
  for (const l of LAMPS) {
    P.add(new THREE.CylinderGeometry(0.07, 0.1, 3.4, 8), M.paint, 0x2f3a4a, mtx(l.x, 1.7, l.z));
    P.add(new THREE.CylinderGeometry(0.18, 0.14, 0.12, 8), M.paint, 0x2f3a4a, mtx(l.x, 0.06, l.z));
    P.add(new THREE.ConeGeometry(0.26, 0.22, 8), M.paint, 0x2f3a4a, mtx(l.x, 3.62, l.z));
    lanterns.push(mtx(l.x, 3.32, l.z, 0, 0, 0, 1, 1.2, 1));
  }
  const lanternMesh = new THREE.InstancedMesh(lanternGeo, new THREE.MeshBasicMaterial({ color: 0xffe2a8 }), lanterns.length);
  lanterns.forEach((m, i) => lanternMesh.setMatrixAt(i, m));
  group.add(lanternMesh);
  // Night light pools on the ground under each lamp.
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({ map: lightPoolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), LAMPS.length);
  LAMPS.forEach((l, i) => pools.setMatrixAt(i, mtx(l.x, 0.05, l.z, 0, 0, 0, 7, 1, 7)));
  pools.renderOrder = 1;
  pools.visible = false;
  group.add(pools);

  // ---- bunting between lamps and round the lane
  const flagGeo = new THREE.BufferGeometry();
  {
    const v = new Float32Array([-0.17, 0, 0.004, 0.17, 0, 0.004, 0, -0.3, 0.004, 0.17, 0, -0.004, -0.17, 0, -0.004, 0, -0.3, -0.004]);
    flagGeo.setAttribute('position', new THREE.BufferAttribute(v, 3));
    flagGeo.computeVertexNormals();
  }
  const strings: [THREE.Vector3, THREE.Vector3, number][] = [];
  const ring = LAMPS.slice(0, 7);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (Math.hypot(a.x - b.x, a.z - b.z) > 16) continue;
    strings.push([new THREE.Vector3(a.x, 3.15, a.z), new THREE.Vector3(b.x, 3.15, b.z), 0.9]);
  }
  strings.push([new THREE.Vector3(-2.65, 3.1, 31), new THREE.Vector3(2.65, 3.1, 31), 0.4]);
  strings.push([new THREE.Vector3(3.2, 4.3, 24.5), new THREE.Vector3(2.65, 3.1, 22.6), 0.2]);
  strings.push([new THREE.Vector3(14.6, 3.15, -13.2), new THREE.Vector3(23.4, 3.15, -13.2), 0.5]);
  strings.push([new THREE.Vector3(-16.4, 3.15, 1.5), new THREE.Vector3(-16.8, 3.15, 16.5), 1.1]);
  strings.push([new THREE.Vector3(-16.6, 3.15, -16.6), new THREE.Vector3(BELL_TOWER.x + 2, 5.5, BELL_TOWER.z + 2), 0.6]);
  // Tea garden to the tea room.
  strings.push([new THREE.Vector3(-8, 4.4, 19.6), new THREE.Vector3(-3.0, 2.4, 16.7), 0.4]);
  const flagMats: THREE.Matrix4[] = [];
  const flagCols: number[] = [];
  for (const [a, b, sag] of strings) {
    const len = a.distanceTo(b);
    const n = Math.max(3, Math.floor(len / 0.55));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(t * Math.PI) * sag;
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    P.add(new THREE.TubeGeometry(curve, n * 2, 0.012, 4, false), M.paint, 0xfff1d6, new THREE.Matrix4(), { base: null });
    const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
    for (let i = 1; i < n; i++) {
      const p = pts[i];
      flagMats.push(mtx(p.x, p.y, p.z, 0, yaw, 0));
      flagCols.push(BUNTING[(i + flagCols.length) % BUNTING.length]);
    }
  }
  const flags = new THREE.InstancedMesh(flagGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), flagMats.length);
  flagMats.forEach((m, i) => {
    flags.setMatrixAt(i, m);
    flags.setColorAt(i, new THREE.Color(flagCols[i]));
  });
  flags.castShadow = false;
  group.add(flags);

  // ---- Gran's bean stall
  {
    const x = 3.4;
    const z = 18.5;
    P.box(M.wood, 0xc98a52, x, 0, z, 1.4, 1.0, 3.6, { tile: 1 });
    P.box(M.paint, 0xffd45c, x - 0.05, 1.0, z, 1.52, 0.1, 3.72);
    // Bean tins stacked on the counter (decor).
    for (let i = 0; i < 6; i++) P.add(new THREE.CylinderGeometry(0.11, 0.11, 0.24, 12), M.paint, i % 2 ? C.tomato : 0xfff1d6, mtx(x - 0.2, 1.22, z - 1.3 + i * 0.5));
    // Pot of beans with a ladle.
    P.add(new THREE.CylinderGeometry(0.32, 0.28, 0.36, 14), M.paint, 0x3a3a48, mtx(x + 0.2, 1.28, z + 0.2));
    P.add(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 14), M.paint, 0xd86a3a, mtx(x + 0.2, 1.42, z + 0.2), { base: null });
    // Awning posts.
    for (const dz of [-1.75, 1.75]) for (const dx of [-0.65, 0.65]) P.add(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 8), M.wood, 0xfff1d6, mtx(x + dx, 1.25, z + dz));
    // Sign: "Gran's beans".
    const gs = atlas.rect(560, 180, plaque("Gran's beans", { bg: hex(C.butter), border: hex(C.tomato), sub: 'Free beans, dearie!' }));
    addSign(gs, 2.3, 0.72, x - 0.74, 0.55, z, -Math.PI / 2);
    // The giant bean-can sign on its pole.
    P.add(new THREE.CylinderGeometry(0.12, 0.14, 4.0, 8), M.paint, 0x2f3a4a, mtx(6.6, 2.0, z));
    const can = atlas.rect(512, 256, (g, w, h) => {
      g.fillStyle = hex(C.tomato);
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff1d6';
      g.fillRect(0, h * 0.18, w, h * 0.64);
      g.fillStyle = hex(C.tomato);
      g.font = `${h * 0.36}px ${DISPLAY_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('BEANS', w * 0.25, h * 0.5);
      g.fillText('BEANS', w * 0.75, h * 0.5);
      g.fillStyle = hex(C.bean);
      for (let i = 0; i < 10; i++) {
        g.beginPath();
        g.ellipse(((i + 0.5) / 10) * w, h * 0.73, 9, 6, 0.4, 0, Math.PI * 2);
        g.fill();
      }
    });
    const canGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.3, 24, 1, true);
    {
      const uv = canGeo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, can.u0 + uv.getX(i) * (can.u1 - can.u0), can.v0 + uv.getY(i) * (can.v1 - can.v0));
    }
    signs.push([canGeo, mtx(6.6, 4.65, z, 0, 0.6, 0)]);
    P.add(new THREE.CylinderGeometry(0.78, 0.78, 0.08, 24), M.brass, 0xd8d8e0, mtx(6.6, 5.34, z));
    P.add(new THREE.CylinderGeometry(0.78, 0.78, 0.08, 24), M.brass, 0xd8d8e0, mtx(6.6, 3.96, z));
    // Tin table.
    P.box(M.wood, 0xc98a52, 4.6, 0, 21.2, 1.2, 0.76, 1.2, { tile: 1 });
    P.box(M.paint, 0xfff1d6, 4.6, 0.76, 21.2, 1.3, 0.04, 1.3, { base: null });
  }

  // ---- tea garden and the Prim Teacup tea room
  for (const [x, z] of [[-5, 16], [-8, 14.6], [-7, 19]]) {
    P.add(new THREE.CylinderGeometry(0.62, 0.66, 0.06, 18), M.paint, 0xffffff, mtx(x, 0.77, z));
    P.add(new THREE.CylinderGeometry(0.64, 0.7, 0.3, 18, 1, true), M.paint, 0xff9fbf, mtx(x, 0.62, z));
    P.add(new THREE.CylinderGeometry(0.06, 0.08, 0.75, 8), M.paint, 0xffffff, mtx(x, 0.37, z));
    P.add(new THREE.SphereGeometry(0.16, 12, 8), M.paint, 0xffffff, mtx(x + 0.15, 0.95, z - 0.1, 0, 0, 0, 1, 0.8, 1));
    P.add(new THREE.CylinderGeometry(0.03, 0.05, 0.16, 6), M.paint, 0xffffff, mtx(x + 0.32, 0.98, z - 0.1, 0, 0, -0.9));
    for (const a of [0.3, 2.4, 4.4]) {
      const cx = x + Math.cos(a) * 1.0;
      const cz = z + Math.sin(a) * 1.0;
      P.box(M.wood, 0xfff1d6, cx, 0, cz, 0.42, 0.45, 0.42, { tile: 1 });
      P.box(M.wood, 0xfff1d6, cx + Math.cos(a) * 0.19, 0.45, cz + Math.sin(a) * 0.19, 0.42, 0.5, 0.06, { ry: -a + Math.PI / 2, tile: 1 });
    }
  }
  building(P, M, atlas, signs, { x: -11, z: 22, hw: 3, hd: 2.5, h: 4.5, wall: C.blush, trim: 0xffffff, door: 'n', name: 'The Prim Teacup', roofCol: C.moss, windowsPerSide: 2 });
  // Striped awning over the tea room door (visual, high enough to clear).
  {
    const aw = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.8, 16, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ map: stripeTexture(0xff9fbf, 0xffffff, 10), side: THREE.DoubleSide, roughness: 0.8 }));
    aw.rotation.set(0, Math.PI / 2, Math.PI / 2);
    aw.scale.set(1, 1, 0.35);
    aw.position.set(-11, 3.0, 19.35);
    aw.castShadow = true;
    group.add(aw);
  }

  // ---- programme board
  {
    const x = -3.0;
    const z = 17.5;
    P.box(M.wood, C.timber, x, 0.5, z, 0.14, 1.9, 2.3, { tile: 1 });
    const prog = atlas.rect(700, 560, (g, w, h) => {
      g.fillStyle = '#fff7e6';
      roundRect(g, 0, 0, w, h, 30);
      g.fill();
      g.strokeStyle = hex(C.tomato);
      g.lineWidth = 14;
      roundRect(g, 10, 10, w - 20, h - 20, 24);
      g.stroke();
      g.fillStyle = hex(C.ink);
      g.textAlign = 'center';
      g.font = `72px ${DISPLAY_FONT}`;
      g.fillText('Fete programme', w / 2, 100);
      g.font = `700 34px ${BODY_FONT}`;
      const lines = ['Gran\'s beans  11 o\'clock', 'Brass band  all day', 'Rocket rings  on the green', 'Library  shh!', 'Picnic in the park', 'Strictly no funny business'];
      lines.forEach((l, i) => g.fillText(l, w / 2, 180 + i * 58));
      g.fillStyle = hex(C.bean);
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.ellipse(80 + i * 180, 520, 22, 14, 0.5, 0, Math.PI * 2);
        g.fill();
      }
    });
    addSign(prog, 2.1, 1.68, x + 0.075, 1.5, z, Math.PI / 2);
    P.add(new THREE.ConeGeometry(1.5, 0.5, 4), M.roof, C.terracotta, mtx(x, 2.65, z, 0, Math.PI / 4, 0, 0.3, 1, 1.15), { tile: 1 });
  }

  // ---- Toot-o-Matic kiosk: a brass phonograph on a red plinth
  const horn = new THREE.Group();
  {
    const x = 6.5;
    const z = 8.5;
    P.box(M.paint, C.tomato, x, 0, z, 1.2, 1.5, 1.2);
    P.box(M.brass, C.brass, x, 1.5, z, 1.3, 0.12, 1.3, { base: null });
    P.box(M.wood, 0x8a5a3a, x, 1.62, z, 1.0, 0.5, 1.0, { tile: 1 });
    // The record.
    P.add(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 24), M.paint, C.ink, mtx(x, 2.14, z), { base: null });
    P.add(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16), M.paint, C.flowerY, mtx(x, 2.15, z), { base: null });
    const sgn = atlas.rect(560, 160, plaque('Toot-o-Matic', { bg: hex(C.butter), border: hex(C.tomato) }));
    addSign(sgn, 1.1, 0.32, x, 1.0, z + 0.61, 0);
    const voices = atlas.rect(420, 260, (g, w, h) => {
      g.fillStyle = hex(C.ink);
      roundRect(g, 0, 0, w, h, 20);
      g.fill();
      g.fillStyle = hex(C.butter);
      g.textAlign = 'center';
      g.font = `48px ${DISPLAY_FONT}`;
      g.fillText('Pick a toot', w / 2, 70);
      g.font = `700 30px ${BODY_FONT}`;
      g.fillText('voices and clouds', w / 2, 120);
      g.fillStyle = hex(C.flowerP);
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.arc(60 + i * 75, 190, 22, 0, Math.PI * 2);
        g.fill();
      }
    });
    addSign(voices, 0.9, 0.56, x, 0.42, z + 0.61, 0);
    const bell = new THREE.LatheGeometry([[0.06, 0], [0.08, 0.3], [0.14, 0.6], [0.3, 0.9], [0.6, 1.1], [0.62, 1.12], [0.55, 1.12]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
    const hornMesh = new THREE.Mesh(bell, new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide, emissive: 0x7a4a00, emissiveIntensity: 0.2 }));
    hornMesh.castShadow = true;
    horn.add(hornMesh);
    horn.position.set(x + 0.2, 2.15, z - 0.1);
    horn.rotation.set(-0.7, 0, 0.35);
    group.add(horn);
  }

  // ---- maypole: striped pole, crown, ribbons to stakes
  {
    const { x, z, h } = MAYPOLE;
    for (let i = 0; i < 14; i++) P.add(new THREE.CylinderGeometry(0.13, 0.15, h / 14, 10), M.paint, i % 2 ? 0xffffff : C.tomato, mtx(x, (i + 0.5) * (h / 14), z), { base: null });
    P.add(new THREE.CylinderGeometry(0.95, 0.85, 0.22, 20), M.brass, C.brass, mtx(x, h - 0.11, z), { base: null });
    P.add(new THREE.TorusGeometry(0.88, 0.12, 8, 24), M.paint, C.flowerP, mtx(x, h - 0.02, z, Math.PI / 2), { base: null });
    P.add(new THREE.SphereGeometry(0.22, 12, 8), M.brass, C.gold, mtx(x, h + 0.25, z), { base: null });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const top = new THREE.Vector3(x + Math.cos(a) * 0.8, h - 0.15, z + Math.sin(a) * 0.8);
      const mid = new THREE.Vector3(x + Math.cos(a + 0.25) * 0.9, h * 0.45, z + Math.sin(a + 0.25) * 0.9);
      const bot = new THREE.Vector3(x + Math.cos(a + 0.4) * 0.92, 0.05, z + Math.sin(a + 0.4) * 0.92);
      P.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([top, mid, bot]), 10, 0.035, 4), M.paint, BUNTING[i % BUNTING.length], new THREE.Matrix4(), { base: null });
    }
    // "Big one here" pictogram sign on a post.
    const pic = atlas.rect(512, 192, (g) => g.drawImage(pictogramTexture().image as HTMLCanvasElement, 0, 0));
    const title = atlas.rect(512, 110, plaque('Big one here', { bg: hex(C.butter), border: hex(C.bean) }));
    for (const [px, pz, yaw] of [[x + 2.6, z + 1.6, -Math.PI * 0.2], [BELL_TOWER.x + 5.2, BELL_TOWER.z + 4.2, Math.PI * 0.25]] as const) {
      P.box(M.wood, C.timber, px, 0, pz, 0.12, 1.7, 0.12, { tile: 1 });
      P.box(M.paint, C.cream, px, 1.25, pz - 0.05 * Math.cos(yaw), 1.66, 0.94, 0.06, { ry: yaw, base: null });
      addSign(pic, 1.5, 0.56, px + Math.sin(yaw) * 0.04, 1.42, pz + Math.cos(yaw) * 0.04 - 0.05 * Math.cos(yaw), yaw);
      addSign(title, 1.5, 0.32, px + Math.sin(yaw) * 0.04, 1.95, pz + Math.cos(yaw) * 0.04 - 0.05 * Math.cos(yaw), yaw);
    }
  }

  // ---- trial pads: billboard frames (boards are live canvases)
  const boardMesh = (x: number, z: number, yaw: number, title: string, accent: string) => {
    P.box(M.wood, C.timber, x - Math.cos(yaw) * 0.95, 0, z + Math.sin(yaw) * 0.95, 0.14, 2.9, 0.14, { tile: 1 });
    P.box(M.wood, C.timber, x + Math.cos(yaw) * 0.95, 0, z - Math.sin(yaw) * 0.95, 0.14, 2.9, 0.14, { tile: 1 });
    P.box(M.paint, C.ink, x, 1.32, z, 2.1, 1.5, 0.08, { ry: yaw, base: null });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 1.36), new THREE.MeshBasicMaterial({ map: boardTexture(title, [], 'Loading...', accent) }));
    m.position.set(x + Math.sin(yaw) * 0.045, 2.07, z + Math.cos(yaw) * 0.045);
    m.rotation.y = yaw;
    group.add(m);
    return m;
  };
  const boards = {
    rings: boardMesh(8.6, 6.2, -0.5, 'Fastest rally', '#ffd24a'),
    band: boardMesh(-7.4, -1.6, 2.0, 'Top tooters', '#e8574a'),
    library: boardMesh(15.4, -13.6, 0, 'Quietest librarians', '#8a6bd1'),
    picnic: boardMesh(-14.6, 14.2, Math.PI / 2 + 0.3, 'Fastest picnic', '#9b7bd6'),
  };
  // Chequered start flag on the rings pad.
  P.add(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8), M.paint, 0xfff1d6, mtx(4.4, 1.6, 4.0));
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) P.box(M.paint, (i + j) % 2 ? 0xffffff : C.ink, 4.4 + 0.12 + i * 0.22, 2.4 + j * 0.22, 4.0, 0.22, 0.22, 0.03, { base: null });

  // ---- the balloon
  const balloon = new THREE.Group();
  {
    const { x, z, cy, r } = BALLOON;
    // Basket (wicker) with a rim.
    P.add(new THREE.CylinderGeometry(1.3, 1.15, 1.1, 20), M.wood, 0xc99a5b, mtx(x, 0.55, z), { tile: 0.6 });
    P.add(new THREE.TorusGeometry(1.3, 0.09, 8, 24), M.wood, 0x8a5a3a, mtx(x, 1.12, z, Math.PI / 2));
    P.add(new THREE.CylinderGeometry(0.16, 0.2, cy - r + 0.2, 10), M.paint, 0x5a4a4a, mtx(x, (cy - r) / 2 + 0.6, z));
    // Ropes from the basket rim to the envelope.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p0 = new THREE.Vector3(x + Math.cos(a) * 1.2, 1.15, z + Math.sin(a) * 1.2);
      const p1 = new THREE.Vector3(x + Math.cos(a) * 2.6, cy - r * 0.62, z + Math.sin(a) * 2.6);
      P.add(new THREE.TubeGeometry(new THREE.LineCurve3(p0, p1), 1, 0.025, 4), M.paint, 0x6b4a3a, new THREE.Matrix4(), { base: null });
    }
    // Tether pegs and sandbags.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      P.add(new THREE.SphereGeometry(0.28, 10, 8), M.paint, 0xd8c79c, mtx(x + Math.cos(a) * 1.6, 0.22, z + Math.sin(a) * 1.6, 0, 0, 0, 1, 0.75, 1));
    }
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const ang = -Math.PI / 2 + t * Math.PI;
      // A teardrop: narrow at the bottom.
      const rr = Math.cos(ang) * r * (t < 0.5 ? 0.55 + t * 0.9 : 1);
      prof.push(new THREE.Vector2(Math.max(0.35, rr), Math.sin(ang) * r));
    }
    prof[prof.length - 1].x = 0.001;
    const env = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), new THREE.MeshToonMaterial({ map: balloonTexture(), gradientMap: null }));
    env.castShadow = true;
    balloon.add(env);
    balloon.position.set(x, cy, z);
    group.add(balloon);
  }

  // ---- fountain and statue plinth
  {
    const { x, z, r, rim } = FOUNTAIN;
    const basin = new THREE.LatheGeometry([[r - 0.42, 0], [r - 0.42, rim], [r - 0.32, rim + 0.08], [r + 0.02, rim + 0.08], [r + 0.08, rim], [r + 0.08, 0.001]].map(([a, b]) => new THREE.Vector2(a, b)), 40);
    P.add(basin, M.stone, C.stone, mtx(x, 0, z), { tile: 1.2 });
    P.add(new THREE.CylinderGeometry(1.0, 1.1, 2.4, 20), M.stone, C.stone, mtx(x, 1.2, z), { tile: 1.2 });
    P.add(new THREE.CylinderGeometry(1.15, 1.15, 0.2, 20), M.stone, 0xd9cdb6, mtx(x, 2.3, z), { tile: 1.2 });
    // A small lower bowl round the plinth.
    P.add(new THREE.CylinderGeometry(1.7, 1.2, 0.3, 24), M.stone, 0xd9cdb6, mtx(x, 1.0, z), { tile: 1.2 });
    const plaqueR = atlas.rect(420, 160, plaque('Sir Reginald Puffington', { size: 0.34, sub: 'Founder. Never once tooted.' }));
    addSign(plaqueR, 0.9, 0.34, x, 1.6, z + 1.11, 0);
  }
  const fountainWater = new THREE.Mesh(new THREE.CircleGeometry(FOUNTAIN.r - 0.43, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: C.water, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.85 }));
  fountainWater.position.set(FOUNTAIN.x, FOUNTAIN.water, FOUNTAIN.z);
  group.add(fountainWater);

  // ---- bandstand
  {
    const { x, z, r, floor } = BANDSTAND;
    P.add(new THREE.CylinderGeometry(r, r + 0.05, floor, 8), M.paint, 0xffffff, mtx(x, floor / 2, z, 0, Math.PI / 8));
    P.add(new THREE.CylinderGeometry(r + 0.06, r + 0.06, 0.08, 8), M.wood, 0xc98a52, mtx(x, floor - 0.03, z, 0, Math.PI / 8), { tile: 1 });
    // Lattice skirt (red panels proud of the white base).
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ax = x + Math.cos(a) * (r * 0.925 + 0.04);
      const az = z + Math.sin(a) * (r * 0.925 + 0.04);
      if (Math.cos(a) > 0.9) continue;
      P.box(M.paint, C.tomato, ax, 0.1, az, r * 0.7, 0.36, 0.04, { ry: -a + Math.PI / 2, base: null });
    }
    for (let i = 0; i < 5; i++) P.box(M.wood, 0xffffff, -8.35 + (4 - i) * 0.3 + 0.3, 0, z, 0.3, (i + 1) * 0.1, 2.4, { tile: 1 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      P.add(new THREE.CylinderGeometry(0.11, 0.13, 3.9, 10), M.paint, 0xffffff, mtx(x + Math.cos(a) * 3.9, floor + 1.95, z + Math.sin(a) * 3.9));
      P.add(new THREE.SphereGeometry(0.17, 8, 6), M.brass, C.brass, mtx(x + Math.cos(a) * 3.9, floor + 3.9, z + Math.sin(a) * 3.9));
    }
    P.add(new THREE.CylinderGeometry(0.3, 0.45, 3.8, 12), M.paint, 0xffffff, mtx(x, floor + 1.9, z));
    P.add(new THREE.TorusGeometry(4.1, 0.08, 6, 8), M.paint, 0xffffff, mtx(x, floor + 3.85, z, Math.PI / 2, 0, Math.PI / 8));
    // Music stands.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      P.add(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), M.paint, C.ink, mtx(x + Math.cos(a) * 1.6, floor + 0.55, z + Math.sin(a) * 1.6));
      P.box(M.paint, C.ink, x + Math.cos(a) * 1.6, floor + 1.05, z + Math.sin(a) * 1.6, 0.4, 0.3, 0.03, { ry: -a + Math.PI / 2, rx: -0.4, base: null });
    }
  }

  // ---- bell tower
  const bellPivot = new THREE.Group();
  const weathercock = new THREE.Group();
  const clockHands: THREE.Object3D[] = [];
  {
    const { x, z, base, belfry, spire } = BELL_TOWER;
    P.box(M.brick, 0xf3d9b0, x, 0, z, 4, base, 4, { tile: 1.4 });
    P.box(M.stone, C.stone, x, 0, z, 4.16, 0.6, 4.16, { tile: 1.2 });
    P.box(M.stone, C.stone, x, base - 0.18, z, 4.2, 0.22, 4.2, { tile: 1.2 });
    // Balustrade on the balcony (the walls are colliders).
    const t = PARAPET.t;
    for (const [dx, dz, w, d] of [[0, -2 + t / 2, 4, t], [0, 2 - t / 2, 4, t], [-2 + t / 2, 0, t, 4 - 2 * t], [2 - t / 2, 0, t, 4 - 2 * t]] as const) {
      P.box(M.stone, 0xfff1d6, x + dx, base, z + dz, w, PARAPET.h - 0.06, d, { base: null, tile: 1 });
      P.box(M.stone, C.stone, x + dx, base + PARAPET.h - 0.06, z + dz, w + 0.04, 0.08, d + 0.04, { base: null, tile: 1 });
    }
    // Belfry: four corner piers, arches, the cap.
    for (const dx of [-0.85, 0.85]) for (const dz of [-0.85, 0.85]) P.box(M.brick, 0xf3d9b0, x + dx, base, z + dz, 0.5, belfry - base - 0.7, 0.5, { tile: 1.4, base: null });
    for (const [dx, dz, ry] of [[0, -0.88, 0], [0, 0.88, 0], [-0.88, 0, Math.PI / 2], [0.88, 0, Math.PI / 2]] as const) {
      P.add(new THREE.TorusGeometry(0.62, 0.14, 6, 12, Math.PI), M.brick, 0xf3d9b0, mtx(x + dx, belfry - 1.25, z + dz, 0, ry, 0), { base: null });
      P.box(M.brick, 0xf3d9b0, x + dx, belfry - 0.7, z + dz, ry ? 0.44 : 2.2, 0.7, ry ? 2.2 : 0.44, { tile: 1.4, base: null });
    }
    P.box(M.stone, C.stone, x, base, z, 1.4, 0.06, 1.4, { base: null });
    P.box(M.stone, C.stone, x, belfry, z, 2.5, 0.2, 2.5, { base: null, tile: 1 });
    // Onion cap.
    const onion = new THREE.LatheGeometry([[1.05, 0], [1.2, 0.4], [1.05, 1.0], [0.6, 1.6], [0.22, 2.0], [0.08, 2.4], [0.001, 2.45]].map(([a, b]) => new THREE.Vector2(a, b)), 20);
    P.add(onion, M.roof, 0x3fb6a0, mtx(x, belfry + 0.2, z), { tile: 0.7 });
    P.add(new THREE.CylinderGeometry(0.04, 0.05, spire - belfry - 2.4, 6), M.brass, C.brass, mtx(x, (belfry + 2.6 + spire) / 2, z));
    // The bell.
    const bellGeo = new THREE.LatheGeometry([[0.001, 0.75], [0.25, 0.72], [0.36, 0.5], [0.42, 0.15], [0.58, 0], [0.55, -0.04], [0.001, -0.04]].map(([a, b]) => new THREE.Vector2(a, b)), 20);
    const bellMesh = new THREE.Mesh(bellGeo, new THREE.MeshStandardMaterial({ color: 0xd9a03f, metalness: 0.7, roughness: 0.35, emissive: 0x5a3a00, emissiveIntensity: 0.3 }));
    bellMesh.position.y = -0.8;
    bellPivot.add(bellMesh);
    bellPivot.position.set(x, BELL_TOWER.bellY + 0.6, z);
    group.add(bellPivot);
    // Weathercock.
    const cock = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 4).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.7, roughness: 0.3 }));
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.3), cock.material);
    tail.position.set(-0.35, 0.1, 0);
    weathercock.add(cock, tail);
    weathercock.position.set(x, spire + 0.1, z);
    group.add(weathercock);
    // Clock face on the south side at 6 m.
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32), new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.6 }));
    clock.position.set(x, 6, z + 2.03);
    group.add(clock);
    for (const [len, w] of [[0.5, 0.07], [0.7, 0.05]]) {
      const hand = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.02).translate(0, len / 2, 0), new THREE.MeshStandardMaterial({ color: C.ink }));
      hand.position.set(x, 6, z + 2.06);
      group.add(hand);
      clockHands.push(hand);
    }
    // Arched door and windows.
    P.box(M.wood, 0x6b4a3a, x, 0, z + 2.0, 1.3, 2.2, 0.12, { tile: 1 });
    P.add(new THREE.CylinderGeometry(0.65, 0.65, 0.12, 16, 1, false, -Math.PI / 2, Math.PI), M.wood, 0x6b4a3a, mtx(x, 2.2, z + 2.0, Math.PI / 2, 0, 0));
    for (const [dx, dz, ry] of [[2.03, 0, Math.PI / 2], [-2.03, 0, Math.PI / 2], [0, -2.03, 0]] as const) P.box(M.glass, 0x7fa8d8, x + dx, 4, z + dz, ry ? 0.08 : 0.7, 1.4, ry ? 0.7 : 0.08, { ry: 0, base: null });
  }

  // ---- library
  const closedSign = new THREE.Group();
  {
    const { x, z, hw, hd, h } = LIBRARY;
    P.box(M.stone, 0xeee4d2, x, 0, z, hw * 2, h, hd * 2, { tile: 2.2 });
    P.box(M.stone, C.stoneDark, x, 0, z, hw * 2 + 0.2, 0.5, hd * 2 + 0.2, { tile: 1.5 });
    roofTrim(P, M, x, z, hw, hd, h, 0xeee4d2);
    // Pilasters on the front.
    const front = z + hd;
    for (let i = 0; i < 6; i++) {
      const px = x - hw + 1.0 + i * ((hw * 2 - 2) / 5);
      if (Math.abs(px - x) < 1.2) continue;
      P.box(M.stone, 0xfffaf0, px, 0.5, front + 0.12, 0.6, h - 1.3, 0.24, { tile: 1.5 });
      P.box(M.stone, 0xfffaf0, px, h - 0.8, front + 0.16, 0.8, 0.3, 0.32, { tile: 1.5, base: null });
      P.box(M.stone, 0xfffaf0, px, 0.5, front + 0.16, 0.8, 0.25, 0.32, { tile: 1.5, base: null });
    }
    // Pediment with SILENCE.
    const ped = new THREE.Shape();
    ped.moveTo(-3.6, 0);
    ped.lineTo(3.6, 0);
    ped.lineTo(0, 1.5);
    ped.closePath();
    const pedGeo = new THREE.ExtrudeGeometry(ped, { depth: 0.3, bevelEnabled: false });
    P.add(pedGeo, M.stone, 0xfffaf0, mtx(x, h + 0.02, front - 0.28 + 0.02), { tile: 1.5, base: null });
    const silence = atlas.rect(640, 150, (g, w, hh) => {
      g.fillStyle = '#efe6d4';
      g.fillRect(0, 0, w, hh);
      g.fillStyle = hex(C.ink);
      g.font = `110px ${DISPLAY_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('SILENCE', w / 2, hh * 0.55);
    });
    addSign(silence, 2.4, 0.56, x, h + 0.5, front + 0.06, 0);
    // Door: dark double doors in a stone frame, recessed look.
    P.box(M.stone, 0xfffaf0, x, 0.5, front + 0.02, 2.6, 3.0, 0.14, { tile: 1.5, base: null });
    P.box(M.wood, 0x5a3424, x, 0.5, front + 0.1, 2.0, 2.6, 0.08, { tile: 1 });
    P.box(M.brass, C.brass, x - 0.15, 1.7, front + 0.16, 0.08, 0.3, 0.04, { base: null });
    P.box(M.brass, C.brass, x + 0.15, 1.7, front + 0.16, 0.08, 0.3, 0.04, { base: null });
    // Windows (tall, arched tops) on the front and sides.
    for (const dx of [-4.3, 4.3, -2.2, 2.2]) {
      P.box(M.glass, 0x7fa8d8, x + dx, 2.0, front + 0.05, 0.9, 2.6, 0.08, { base: null });
      P.box(M.stone, 0xfffaf0, x + dx, 1.85, front + 0.1, 1.15, 0.18, 0.2, { base: null });
    }
    const lib = atlas.rect(600, 170, plaque('Shh! The library', { bg: '#fff7e6', border: '#8a6bd1', sub: 'Five books to shelve' }));
    P.box(M.paint, 0x8a6bd1, x + 1.55, 0, front + 0.6, 0.08, 1.4, 0.08);
    P.box(M.paint, C.cream, x + 1.55, 1.25, front + 0.6, 1.5, 0.48, 0.05, { base: null });
    addSign(lib, 1.42, 0.42, x + 1.55, 1.49, front + 0.63, 0);
    // "Closed for lunch" A-board (shown until the library opens).
    const cl = atlas.rect(420, 260, plaque('Closed for lunch', { bg: '#fff7e6', border: hex(C.tomato), sub: 'Opens at 3 golden beans' }));
    const clMesh = new THREE.Mesh(signPlane(cl, 1.0, 0.62), new THREE.MeshStandardMaterial({ map: null }));
    clMesh.userData.atlasSign = true;
    const boardA = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 0.06), new THREE.MeshStandardMaterial({ color: C.timber }));
    boardA.position.set(0, 0.6, 0);
    boardA.rotation.x = -0.18;
    clMesh.position.set(0, 0.62, 0.065);
    clMesh.rotation.x = -0.18;
    closedSign.add(boardA, clMesh);
    closedSign.position.set(x - 0.6, 0, front + 1.1);
    group.add(closedSign);
  }

  // ---- sentry hut
  {
    const x = 11;
    const z = -8;
    for (let i = 0; i < 7; i++) P.box(M.paint, i % 2 ? 0xffffff : C.tomato, x, i * 0.36, z, 1.6, 0.36, 1.6, { base: i === 0 ? 0 : null });
    P.box(M.paint, C.ink, x, 2.52, z, 1.72, 0.28, 1.72, { base: null });
    P.box(M.paint, 0x2a2438, x, 0.3, z + 0.79, 0.9, 1.9, 0.04, { base: null });
    P.add(new THREE.SphereGeometry(0.2, 10, 8), M.brass, C.brass, mtx(x, 2.8, z, 0, 0, 0, 1, 0.6, 1));
  }

  // ---- pop cart
  {
    const x = 14;
    const z = 3;
    for (let i = 0; i < 6; i++) P.box(M.paint, i % 2 ? 0xffffff : 0xff7fb4, x - 1.2 + 0.2 + i * 0.4, 0.4, z, 0.4, 0.75, 1.2, { base: null });
    P.box(M.wood, 0xfff1d6, x, 1.15, z, 2.5, 0.08, 1.3, { base: null });
    for (const dx of [-0.85, 0.85]) {
      P.add(new THREE.TorusGeometry(0.36, 0.06, 6, 16), M.paint, C.ink, mtx(x + dx, 0.38, z + 0.62));
      P.add(new THREE.TorusGeometry(0.36, 0.06, 6, 16), M.paint, C.ink, mtx(x + dx, 0.38, z - 0.62));
    }
    for (let i = 0; i < 7; i++) P.add(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 8), M.glass, [0xff8fc8, 0x9fe3ff, 0xd4f58a][i % 3], mtx(x - 0.9 + i * 0.3, 1.34, z + 0.2), { base: null });
    P.add(new THREE.CylinderGeometry(0.05, 0.05, 2.7, 8), M.paint, 0xffffff, mtx(x, 1.35, z));
    const fz = atlas.rect(480, 150, plaque('Fizzy pop', { bg: '#fff7e6', border: '#ff7fb4' }));
    addSign(fz, 1.4, 0.44, x, 0.8, z + 0.62, 0);
    // Crates.
    for (let i = 0; i < 4; i++) P.box(M.wood, 0xd9a86a, 16.4, i * 0.5, 1.4, 1.0, 0.48, 1.0, { tile: 0.8, base: i === 0 ? 0 : null });
  }

  // ---- townhouses and cottages
  building(P, M, atlas, signs, { x: 25, z: 6, hw: 3, hd: 3, h: 6.5, wall: C.butter, trim: 0xffffff, door: 'w', roofCol: C.terracotta, windowsPerSide: 2 });
  building(P, M, atlas, signs, { x: 25, z: 17, hw: 3, hd: 3, h: 7.5, wall: C.mint, trim: 0xffffff, door: 'w', roofCol: C.slate, windowsPerSide: 2 });
  building(P, M, atlas, signs, { x: -6, z: -27, hw: 3.5, hd: 2.5, h: 6, wall: C.cream, trim: C.timber, door: 's', roofCol: C.terracotta, windowsPerSide: 3, timber: true });
  building(P, M, atlas, signs, { x: 7, z: -27, hw: 3.5, hd: 2.5, h: 5.5, wall: C.blush, trim: 0xffffff, door: 's', roofCol: C.moss, windowsPerSide: 3 });
  // Chimneys.
  for (const [x, z, h] of [[26.6, 4.4, 8], [23.4, 18.6, 9]]) {
    P.box(M.brick, 0xd98a6a, x, 0, z, 0.8, h, 0.8, { tile: 1.2, base: null });
    P.box(M.stone, C.stone, x, h - 0.05, z, 0.95, 0.15, 0.95, { base: null });
    P.add(new THREE.CylinderGeometry(0.14, 0.16, 0.45, 10), M.paint, C.terracotta, mtx(x - 0.15, h + 0.3, z), { base: null });
    P.add(new THREE.CylinderGeometry(0.14, 0.16, 0.35, 10), M.paint, C.terracotta, mtx(x + 0.17, h + 0.25, z + 0.1), { base: null });
  }
  // Front garden picket fences for the cottages.
  for (const cx of [-6, 7]) {
    for (let i = 0; i < 16; i++) {
      const px = cx - 3.6 + i * 0.48;
      if (Math.abs(px - cx) < 0.7) continue;
      P.box(M.wood, 0xffffff, px, 0, -23.2, 0.09, 0.85, 0.06, { tile: 1 });
    }
    P.box(M.wood, 0xffffff, cx - 2.15, 0.55, -23.2, 2.9, 0.08, 0.04, { tile: 1 });
    P.box(M.wood, 0xffffff, cx + 2.15, 0.55, -23.2, 2.9, 0.08, 0.04, { tile: 1 });
  }

  // ---- Mr. Sprout's veg stall
  {
    const x = -17.6;
    const z = 9;
    P.box(M.wood, 0x9a6a3a, x, 0, z, 1.4, 1.0, 3.6, { tile: 1 });
    P.box(M.paint, 0x7fbf5a, x + 0.05, 1.0, z, 1.52, 0.1, 3.72);
    for (let i = 0; i < 9; i++) P.add(new THREE.IcosahedronGeometry(0.2, 1), M.paint, i % 3 ? 0x8fcf5a : 0xb7e36a, mtx(x + 0.2 + (i % 3) * 0.2 - 0.2, 1.22 + Math.floor(i / 3) * 0.12, z - 0.5 + (i % 3) * 0.3), { base: null });
    for (let i = 0; i < 6; i++) P.add(new THREE.ConeGeometry(0.06, 0.32, 6), M.paint, 0xf58a3b, mtx(x + 0.3, 1.12, z + 0.6 + i * 0.16, Math.PI / 2, 0, 0), { base: null });
    for (const dz of [-1.75, 1.75]) for (const dx of [-0.65, 0.65]) P.add(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 8), M.wood, 0xfff1d6, mtx(x + dx, 1.25, z + dz));
    const sp = atlas.rect(560, 180, plaque("Sprout's veg", { bg: '#eaf7d8', border: '#3f8f4a', sub: 'Prize cabbages' }));
    addSign(sp, 2.3, 0.72, x + 0.74, 0.55, z, Math.PI / 2);
    const pp = atlas.rect(560, 180, plaque('Picnic panic', { bg: '#f3eaff', border: '#9b7bd6', sub: 'Clear my prize lawn!' }));
    P.box(M.wood, C.timber, -15.4, 0, 13.6, 0.12, 1.7, 0.12, { tile: 1 });
    P.box(M.paint, C.cream, -15.4, 1.2, 13.6, 1.5, 0.5, 0.05, { base: null });
    addSign(pp, 1.44, 0.46, -15.4, 1.45, 13.63, 0);
  }

  // ---- picnic park: blankets, windmill, pond
  {
    const gingham = new THREE.CanvasTexture((() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = 'rgba(232,87,74,0.55)';
      for (let i = 0; i < 4; i++) {
        g.fillRect(i * 16, 0, 8, 64);
        g.fillRect(0, i * 16, 64, 8);
      }
      return c;
    })());
    gingham.wrapS = gingham.wrapT = THREE.RepeatWrapping;
    gingham.repeat.set(3, 3);
    gingham.colorSpace = THREE.SRGBColorSpace;
    const blanketMat = new THREE.MeshStandardMaterial({ map: gingham, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const bg = new THREE.BoxGeometry(2.4, 0.03, 1.8);
    const blankets = new THREE.InstancedMesh(bg, blanketMat, BLANKETS.length);
    BLANKETS.forEach((b, i) => {
      blankets.setMatrixAt(i, mtx(b.x, 0.016, b.z, 0, b.rot, 0));
      blankets.setColorAt(i, new THREE.Color([0xffffff, 0xcfe6ff, 0xfff1b0, 0xe6d8ff][i % 4]));
    });
    blankets.receiveShadow = true;
    group.add(blankets);
  }
  const sails = new THREE.Group();
  {
    const { x, z, h } = WINDMILL;
    P.add(new THREE.CylinderGeometry(0.8, 1.2, h, 12), M.plaster, 0xfff1d6, mtx(x, h / 2, z), { tile: 1.2 });
    P.add(new THREE.ConeGeometry(1.0, 1.3, 12), M.roof, C.terracotta, mtx(x, h + 0.62, z), { tile: 0.8, base: null });
    P.box(M.wood, 0x6b4a3a, x + 1.16, 0, z, 0.08, 1.8, 0.9, { tile: 1 });
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.06).translate(0, 1.4, 0), new THREE.MeshStandardMaterial({ color: 0x8a6a4a }));
      const sail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 0.03).translate(0.3, 1.5, 0.03), new THREE.MeshStandardMaterial({ color: 0xfff7e6 }));
      const g = new THREE.Group();
      g.add(arm, sail);
      g.rotation.z = (i / 4) * Math.PI * 2;
      sails.add(g);
    }
    sails.position.set(x + 1.25, h - 0.3, z);
    sails.rotation.y = Math.PI / 2;
    group.add(sails);
  }
  const pondWater = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 36).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6cc4dc, roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  pondWater.position.set(POND.x, 0.06, POND.z);
  pondWater.renderOrder = 1;
  group.add(pondWater);
  for (let i = 0; i < 14; i++) {
    const a = R() * Math.PI * 2;
    const rr = POND.r + 0.1 + R() * 0.3;
    P.add(new THREE.CylinderGeometry(0.03, 0.04, 0.9 + R() * 0.5, 5), M.paint, 0x5f8a3a, mtx(POND.x + Math.cos(a) * rr, 0.5, POND.z + Math.sin(a) * rr, (R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3), { base: null });
  }

  // ---- benches
  for (const [x, z, yaw] of [[-11.5, 3.5, 0.9], [11.5, -3.0, -2.2], [-3.5, -10.5, 0.3], [4.5, -10.0, -0.3], [20, -11.5, 0]] as const) {
    P.box(M.wood, 0xc98a52, x, 0.42, z, 1.6, 0.08, 0.5, { ry: yaw, tile: 1 });
    P.box(M.wood, 0xc98a52, x - Math.sin(yaw) * 0.22, 0.6, z - Math.cos(yaw) * 0.22, 1.6, 0.4, 0.06, { ry: yaw, tile: 1 });
    for (const s of [-0.7, 0.7]) P.box(M.paint, 0x2f3a4a, x + Math.cos(yaw) * s, 0, z - Math.sin(yaw) * s, 0.08, 0.42, 0.46, { ry: yaw });
  }

  // ---- trees (instanced) and flowers
  const treeGeo = (() => {
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, c: number, m: THREE.Matrix4) => {
      g.applyMatrix4(m);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      const cc = new THREE.Color(c);
      for (let i = 0; i < n; i++) col.set([cc.r, cc.g, cc.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.deleteAttribute('uv');
      parts.push(g.index ? g.toNonIndexed() : g);
    };
    add(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 6, 1, true), 0x7a5a3a, mtx(0, 1.1, 0));
    add(new THREE.IcosahedronGeometry(1.55, 1), 0x6fae55, mtx(0, 3.0, 0));
    add(new THREE.IcosahedronGeometry(1.15, 1), 0x7fbf5f, mtx(0.75, 3.7, 0.3));
    add(new THREE.IcosahedronGeometry(1.0, 1), 0x5f9a4e, mtx(-0.6, 3.9, -0.35));
    return mergeAll(parts);
  })();
  // Inner trees first, then the ring outside (evens before odds, so the low tier can drop every other one).
  const treeSpots: [number, number, number][] = [];
  const outerRing: [number, number, number][] = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const r = 36 + R() * 14;
    outerRing.push([Math.cos(a) * r, Math.sin(a) * r, 1.1 + R() * 0.8]);
  }
  for (const [x, z] of [[-30, -28], [-29, -6], [-30, 26], [29, 28], [30, -28], [16, -29], [-16, -29], [29, -8], [-25, 26], [11, 28], [-12, 28], [20, 25], [-30, 12], [30, 2.5]]) treeSpots.push([x, z, 0.9 + R() * 0.4]);
  treeSpots.push(...outerRing.filter((_, i) => i % 2 === 0), ...outerRing.filter((_, i) => i % 2 === 1));
  const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), treeSpots.length);
  treeSpots.forEach(([x, z, s], i) => {
    trees.setMatrixAt(i, mtx(x, 0, z, 0, R() * 6, 0, s, s * (0.9 + R() * 0.3), s));
    trees.setColorAt(i, new THREE.Color().setHSL(0.27 + R() * 0.06, 0.45, 0.55 + R() * 0.15));
  });
  trees.castShadow = true;
  trees.receiveShadow = true;
  group.add(trees);
  let flowers: THREE.InstancedMesh | null = null;
  if (tier !== 'low') {
    const spots: [number, number][] = [];
    const bed = (x0: number, z0: number, x1: number, z1: number, n: number) => {
      for (let i = 0; i < n; i++) spots.push([x0 + R() * (x1 - x0), z0 + R() * (z1 - z0)]);
    };
    bed(-9.5, -24, -2.5, -22.2, 40);
    bed(3.5, -24, 10.5, -22.2, 40);
    bed(-14.2, 11.4, -13.4, 13.6, 10);
    bed(13.4, 11.4, 14.2, 13.6, 10);
    bed(21.6, 2, 22, 10, 26);
    bed(21.6, 13, 22, 21, 26);
    bed(-14, 19.6, -8, 19.9, 24);
    for (let i = 0; i < 60; i++) {
      const a = R() * Math.PI * 2;
      spots.push([Math.cos(a) * (13.2 + R() * 0.5), Math.sin(a) * (13.2 + R() * 0.5)]);
    }
    // Blooms: a flat six-petal disc with a raised centre, on a stem (a second batch).
    const petals = new THREE.CircleGeometry(0.075, 6).rotateX(-Math.PI / 2);
    const bloomGeo = mergeAll([petals]);
    const centreGeo = new THREE.IcosahedronGeometry(0.03, 0);
    centreGeo.translate(0, 0.015, 0);
    const stemGeo = new THREE.CylinderGeometry(0.008, 0.012, 1, 3, 1, true);
    stemGeo.translate(0, 0.5, 0);
    const leaf = new THREE.CircleGeometry(0.05, 4).rotateX(-Math.PI / 2).scale(1.6, 1, 0.7);
    leaf.translate(0.05, 0.35, 0);
    const stems = new THREE.InstancedMesh(mergeAll([stemGeo, leaf]), new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.9 }), spots.length);
    flowers = new THREE.InstancedMesh(mergeAll([bloomGeo, centreGeo]), new THREE.MeshStandardMaterial({ roughness: 0.7 }), spots.length);
    const cols = [C.flowerY, C.flowerP, 0xffffff, 0xb79cf0, C.tomato];
    spots.forEach(([x, z], i) => {
      const hgt = 0.22 + R() * 0.16;
      const yaw = R() * 6;
      stems.setMatrixAt(i, mtx(x, 0, z, 0, yaw, 0, 1, hgt, 1));
      flowers!.setMatrixAt(i, mtx(x, hgt, z, (R() - 0.5) * 0.4, yaw, 0, 0.9 + R() * 0.5));
      flowers!.setColorAt(i, new THREE.Color(cols[i % cols.length]));
    });
    flowers.add(stems);
    stems.position.set(0, 0, 0);
    group.add(flowers);
  }

  // ---- canopies (bouncy, so each is its own mesh to squash)
  const canopyMeshes: { id: string; mesh: THREE.Object3D; wobble: number }[] = [];
  const canopyMat = (a: number, b: number) => new THREE.MeshStandardMaterial({ map: stripeTexture(a, b, 12), roughness: 0.85, side: THREE.DoubleSide });
  for (const c of canopies()) {
    const g = new THREE.Group();
    let geo: THREE.BufferGeometry;
    let mat: THREE.Material;
    if (c.id === 'bandstand') {
      geo = new THREE.ConeGeometry(c.r, 1.6, 8, 1, true);
      geo.translate(0, 0.8, 0);
      mat = canopyMat(C.tomato, 0xffffff);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshStandardMaterial({ color: C.brass, metalness: 0.6, roughness: 0.3 }));
      tip.position.y = 1.65;
      g.add(tip);
    } else if (c.id === 'umbrella') {
      geo = new THREE.ConeGeometry(c.r, 0.6, 12, 1, true);
      geo.translate(0, 0.3, 0);
      mat = canopyMat(0xff7fb4, 0xffffff);
    } else {
      // Market awnings: a gentle pitched roof.
      geo = new THREE.CylinderGeometry(c.r * 0.6, c.r * 0.6, 3.9, 12, 1, true, -Math.PI / 2, Math.PI);
      geo.rotateZ(Math.PI / 2);
      geo.rotateY(Math.PI / 2);
      geo.scale(1, 0.4, 1);
      mat = c.id === 'gran-awning' ? canopyMat(C.bean, 0xfff1d6) : canopyMat(0x3f8f4a, 0xffffff);
    }
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    g.add(m);
    g.position.set(c.x, c.y, c.z);
    group.add(g);
    canopyMeshes.push({ id: c.id, mesh: g, wobble: 0 });
  }

  // ---- signs and the painted batch
  const signTex = atlas.texture();
  M.signs.map = signTex;
  M.signs.needsUpdate = true;
  const signGeo = mergeAll(signs.map(([g, m]) => g.applyMatrix4(m)));
  const signMesh = new THREE.Mesh(signGeo, M.signs);
  signMesh.receiveShadow = true;
  group.add(signMesh);
  // The closed sign shares the atlas.
  const clMesh = closedSign.children[1] as THREE.Mesh;
  (clMesh.material as THREE.MeshStandardMaterial).map = signTex;
  P.build(group);

  return {
    group,
    canopies: canopyMeshes,
    balloon,
    sails,
    bell: bellPivot,
    weathercock,
    fountainWater,
    pondWater,
    clockHands,
    pools,
    boards,
    trees,
    closedSign,
    tootomaticHorn: horn,
    sky,
    flowers,
    skyPuffs,
    mats: M,
    lanterns: [lanternMesh as unknown as THREE.Mesh],
    windowsMat: M.glass,
  };
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k);
    return n;
  });
  const hasColor = clean.some((g) => g.attributes.color);
  const hasUv = clean.some((g) => g.attributes.uv);
  for (const g of clean) {
    if (hasColor && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    if (!hasColor && g.attributes.color) g.deleteAttribute('color');
    if (hasUv && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!hasUv && g.attributes.uv) g.deleteAttribute('uv');
  }
  return mergeGeometries(clean, false)!;
}

/** A cornice band round a flat roof and the low garden walls on top. */
function roofTrim(P: Painter, M: Mats, x: number, z: number, hw: number, hd: number, h: number, wall: number, deck = 0x9a8f7a): void {
  const t = PARAPET.t;
  const ph = PARAPET.h;
  P.box(M.stone, 0xfffaf0, x, h - 0.32, z, hw * 2 + 0.16, 0.3, hd * 2 + 0.16, { base: null, tile: 1.5 });
  for (const [dx, dz, w, d] of [[0, -hd + t / 2, hw * 2, t], [0, hd - t / 2, hw * 2, t], [-hw + t / 2, 0, t, hd * 2 - 2 * t], [hw - t / 2, 0, t, hd * 2 - 2 * t]] as const) {
    P.box(M.plaster, wall, x + dx, h - 0.02, z + dz, w, ph - 0.06, d, { base: null, tile: 1.5 });
    P.box(M.stone, 0xfffaf0, x + dx, h + ph - 0.08, z + dz, w + 0.06, 0.1, d + 0.06, { base: null, tile: 1.5 });
  }
  // The roof deck, inset inside the walls.
  P.box(M.paint, deck, x, h - 0.02, z, hw * 2 - t * 2 - 0.02, 0.04, hd * 2 - t * 2 - 0.02, { base: null });
}

/** A bunch of flowers for window boxes and planters: one low-poly blob. */
const FLOWER_CLUMP = new THREE.SphereGeometry(0.12, 6, 4).scale(1.9, 0.85, 1);

interface BuildingOpts {
  x: number;
  z: number;
  hw: number;
  hd: number;
  h: number;
  wall: number;
  trim: number;
  door: 'n' | 's' | 'e' | 'w';
  roofCol: number;
  windowsPerSide: number;
  name?: string;
  timber?: boolean;
}

/** A storybook house: plaster walls, recessed windows with shutters and window boxes, a front door, and a roof garden. */
function building(P: Painter, M: Mats, atlas: SignAtlas, signs: [THREE.BufferGeometry, THREE.Matrix4][], o: BuildingOpts): void {
  const { x, z, hw, hd, h } = o;
  P.box(M.plaster, o.wall, x, 0, z, hw * 2, h, hd * 2, { tile: 1.6 });
  P.box(M.stone, C.stoneDark, x, 0, z, hw * 2 + 0.12, 0.45, hd * 2 + 0.12, { tile: 1.2 });
  roofTrim(P, M, x, z, hw, hd, h, o.wall);
  // Planters and a little shed on the roof garden.
  const rr = rng(Math.round(x * 13 + z * 7));
  for (let i = 0; i < 3; i++) {
    const px = x - hw + 0.7 + rr() * (hw * 2 - 1.4);
    const pz = z - hd + 0.7 + rr() * (hd * 2 - 1.4);
    P.box(M.wood, 0xc98a52, px, h, pz, 0.6, 0.35, 0.4, { base: null, tile: 1 });
    P.add(FLOWER_CLUMP, M.paint, [C.flowerP, C.flowerY, 0xffffff][i % 3], mtx(px, h + 0.42, pz, 0, 0, 0, 1.2), { base: null });
  }
  // Windows on each side, in two rows.
  const sides: { n: [number, number]; cx: number; cz: number; len: number; ry: number }[] = [
    { n: [0, 1], cx: x, cz: z + hd, len: hw * 2, ry: 0 },
    { n: [0, -1], cx: x, cz: z - hd, len: hw * 2, ry: Math.PI },
    { n: [1, 0], cx: x + hw, cz: z, len: hd * 2, ry: Math.PI / 2 },
    { n: [-1, 0], cx: x - hw, cz: z, len: hd * 2, ry: -Math.PI / 2 },
  ];
  const doorSide = { s: 0, n: 1, e: 2, w: 3 }[o.door];
  sides.forEach((s, si) => {
    const rows = h > 6 ? [1.6, 4.2] : [1.5, 3.6];
    for (const wy of rows) {
      for (let k = 0; k < o.windowsPerSide; k++) {
        const t = (k + 0.5) / o.windowsPerSide - 0.5;
        if (si === doorSide && wy < 2.5 && Math.abs(t) < 0.3) continue;
        const along = t * s.len * 0.8;
        const wx = s.cx + (s.ry === 0 || s.ry === Math.PI ? along : 0) + s.n[0] * 0.03;
        const wz = s.cz + (s.ry === 0 || s.ry === Math.PI ? 0 : along) + s.n[1] * 0.03;
        const across = s.ry === 0 || s.ry === Math.PI;
        // Frame (proud), glass (between), shutters, sill and window box.
        P.box(M.paint, o.trim, wx + s.n[0] * 0.02, wy - 0.05, wz + s.n[1] * 0.02, across ? 1.0 : 0.06, 1.3, across ? 0.06 : 1.0, { base: null });
        P.box(M.glass, 0x9fc3e8, wx + s.n[0] * 0.06, wy + 0.02, wz + s.n[1] * 0.06, across ? 0.82 : 0.04, 1.14, across ? 0.04 : 0.82, { base: null });
        P.box(M.paint, o.trim, wx + s.n[0] * 0.08, wy - 0.02, wz + s.n[1] * 0.08, across ? 0.05 : 0.03, 1.12, across ? 0.03 : 0.05, { base: null });
        for (const side of [-1, 1]) {
          const sx = across ? side * 0.72 : 0;
          const sz = across ? 0 : side * 0.72;
          P.box(M.wood, [C.tomato, 0x4aa3df, C.bean, 0x8a6bd1][(si + k) % 4], wx + sx + s.n[0] * 0.04, wy - 0.05, wz + sz + s.n[1] * 0.04, across ? 0.4 : 0.05, 1.3, across ? 0.05 : 0.4, { base: null, tile: 0.8 });
        }
        P.box(M.wood, 0xc98a52, wx + s.n[0] * 0.18, wy - 0.3, wz + s.n[1] * 0.18, across ? 1.0 : 0.3, 0.25, across ? 0.3 : 1.0, { base: null, tile: 1 });
        for (let f = 0; f < 2; f++) {
          const fo = (f - 0.5) * 0.44;
          P.add(FLOWER_CLUMP, M.paint, [C.flowerP, C.flowerY, 0xffffff, C.tomato][(f + k + si) % 4], mtx(wx + s.n[0] * 0.2 + (across ? fo : 0), wy - 0.02, wz + s.n[1] * 0.2 + (across ? 0 : fo), 0, across ? 0 : Math.PI / 2, 0), { base: null });
        }
      }
    }
    if (o.timber) {
      // Half-timbering: beams proud of the plaster.
      for (const by of [0.45, h / 2, h - 0.35]) P.box(M.wood, C.timber, s.cx + s.n[0] * 0.04, by - 0.08, s.cz + s.n[1] * 0.04, across(s) ? s.len + 0.08 : 0.08, 0.16, across(s) ? 0.08 : s.len + 0.08, { base: null, tile: 1 });
    }
  });
  // Front door with a canopy and step.
  const d = sides[doorSide];
  const acr = across(d);
  P.box(M.wood, [C.tomato, 0x4aa3df, C.bean, 0x8a6bd1][Math.abs(Math.round(x + z)) % 4], d.cx + d.n[0] * 0.05, 0.12, d.cz + d.n[1] * 0.05, acr ? 1.2 : 0.1, 2.2, acr ? 0.1 : 1.2, { base: null, tile: 1 });
  P.box(M.paint, o.trim, d.cx + d.n[0] * 0.03, 0.1, d.cz + d.n[1] * 0.03, acr ? 1.5 : 0.06, 2.5, acr ? 0.06 : 1.5, { base: null });
  P.box(M.stone, C.stone, d.cx + d.n[0] * 0.35, 0, d.cz + d.n[1] * 0.35, acr ? 1.6 : 0.6, 0.12, acr ? 0.6 : 1.6, { tile: 1 });
  P.box(M.brass, C.brass, d.cx + d.n[0] * 0.12 + (acr ? 0.35 : 0), 1.2, d.cz + d.n[1] * 0.12 + (acr ? 0 : 0.35), 0.08, 0.08, 0.08, { base: null });
  P.box(M.roof, o.roofCol, d.cx + d.n[0] * 0.45, 2.75, d.cz + d.n[1] * 0.45, acr ? 1.9 : 0.9, 0.12, acr ? 0.9 : 1.9, { base: null, tile: 0.8, rx: acr ? d.n[1] * -0.25 : 0, rz: acr ? 0 : d.n[0] * 0.25 });
  if (o.name) {
    const nm = atlas.rect(640, 170, plaque(o.name, { bg: '#fff7e6', border: hex(C.tomato) }));
    const sx = d.cx + d.n[0] * 0.08;
    const sz = d.cz + d.n[1] * 0.08;
    P.box(M.paint, C.ink, sx - d.n[0] * 0.04, 3.2, sz - d.n[1] * 0.04, acr ? 3.2 : 0.06, 0.8, acr ? 0.06 : 3.2, { base: null });
    signs.push([signPlane(nm, 3.0, 0.72), mtx(sx + d.n[0] * 0.01, 3.6, sz + d.n[1] * 0.01, 0, d.ry, 0)]);
  }
}

function across(s: { ry: number }): boolean {
  return s.ry === 0 || s.ry === Math.PI;
}

export function setBoard(mesh: THREE.Mesh, title: string, rows: { name: string; value: string; you: boolean }[], footer: string, accent: string): void {
  const mat = mesh.material as THREE.MeshBasicMaterial;
  mat.map?.dispose();
  mat.map = boardTexture(title, rows, footer, accent);
  mat.needsUpdate = true;
}
