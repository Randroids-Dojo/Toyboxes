// A kart track built from a sketchbook drawing. Three computer drivers lap
// it all the time; stop on the race pad in your kart to start a proper race
// from the grid. Every clean lap is timed, personal bests are kept on this
// device, and the board at the start line shows the best laps by name.

import * as THREE from 'three';
import { sfx } from '../audio/sfx';
import { api, type BoardRow } from '../net/api';
import { TRACK_WIDTH, TrackPath } from '../shared/track';
import { confirmBox } from '../ui/dialogs';
import { h } from '../ui/ui';
import { blob, cached, disposeTree, lightPoolTexture, mesh, plastic, roundBox, sign } from '../world/kit';
import { box, circle, clamp, wrapAngle, type Collider } from '../world/physics';
import { Sky } from '../world/sky';
import type { PlayerState, SpaceAction, SpaceView, Spot } from '../world/space';
import { Vehicle } from '../world/vehicles';
import { boardTexture, formatLap, ordinal, patternTexture, type ExperienceCtx } from './common';

const HW = TRACK_WIDTH / 2;
const CURB = 0.9;
const RACE_LAPS_DEFAULT = 3;

interface Cpu {
  v: Vehicle;
  name: string;
  skill: number;
  lane: number;
  hint: number;
  s: number;
  /** Forward distance since the race started. */
  raced: number;
  /** Distance from its grid slot to the line. */
  toLine: number;
  finishedAt: number | null;
}

interface Race {
  state: 'countdown' | 'running' | 'over';
  t: number;
  laps: number;
  playerRaced: number;
  playerToLine: number;
  playerFinishedAt: number | null;
  shown: number;
  bestLap: number | null;
}

function ribbon(path: TrackPath, inner: number, outer: number, vScale: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k <= path.n; k++) {
    const i = k % path.n;
    const nx = path.tz[i];
    const nz = -path.tx[i];
    pos.push(path.x[i] + nx * inner, 0, path.z[i] + nz * inner, path.x[i] + nx * outer, 0, path.z[i] + nz * outer);
    const v = (k === path.n ? path.length : path.s[i]) / vScale;
    uv.push(0, v, 1, v);
    if (k < path.n) {
      const a = k * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // The strip may wind either way depending on the drawing; normals always point up.
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

export class KartTrack implements SpaceView {
  readonly indoor = false;
  readonly scene = new THREE.Scene();
  readonly colliders: Collider[] = [];
  readonly door: Spot;
  readonly lectern = null;
  readonly chest = null;
  readonly areaDoors = [];
  readonly exhibitSpots = [];
  readonly sun: THREE.DirectionalLight;
  readonly arrival: { x: number; z: number; yaw: number };
  private sky: Sky;
  private path: TrackPath;
  private kart: Vehicle;
  private cpus: Cpu[] = [];
  private pad: Spot;
  private grid: { x: number; z: number; yaw: number; s: number }[] = [];
  private lampMats: THREE.MeshStandardMaterial[] = [];
  private pools: THREE.Mesh[] = [];
  private boardMesh: THREE.Mesh;
  private boardRows: BoardRow[] = [];
  private clock = 0;
  private hint = 0;
  private timing = { started: false, lapStart: 0, dist: 0, s: 0, valid: true, last: null as number | null, wrongFor: 0, offFor: 0 };
  private best: number | null;
  private race: Race | null = null;
  private hud: HTMLElement;
  private hudTime: HTMLElement;
  private hudTop: HTMLElement;
  private hudSub: HTMLElement;
  private hudWarn: HTMLElement;
  private disposed = false;
  private readonly bestKey: string;
  private readonly laps: number;

  constructor(private readonly ctx: ExperienceCtx) {
    const exp = ctx.area.experience;
    if (!exp || exp.kind !== 'kart') throw new Error('Not a kart track');
    this.laps = exp.laps || RACE_LAPS_DEFAULT;
    this.path = new TrackPath(exp.track);
    this.bestKey = `toyboxes.pb.${ctx.roomId}.${ctx.area.id}`;
    const stored = Number(localStorage.getItem(this.bestKey));
    this.best = stored > 0 ? stored : null;
    const p = this.path;
    const s = this.scene;
    this.sky = new Sky(s);
    this.sun = this.sky.sun;
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -40;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 40;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < p.n; i++) {
      minX = Math.min(minX, p.x[i]);
      maxX = Math.max(maxX, p.x[i]);
      minZ = Math.min(minZ, p.z[i]);
      maxZ = Math.max(maxZ, p.z[i]);
    }
    const M = 22;
    minX -= M;
    maxX += M;
    minZ -= M;
    maxZ += M;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    const grass = patternTexture(
      128,
      (g, n) => {
        g.fillStyle = '#7fc25a';
        g.fillRect(0, 0, n, n);
        let r = 7;
        const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 500; i++) {
          g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,50,0,0.07)';
          g.fillRect(rnd() * n, rnd() * n, 2, 4);
        }
      },
      [(maxX - minX + 120) / 6, (maxZ - minZ + 120) / 6],
    );
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX + 120, maxZ - minZ + 120).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
    ground.position.set(cx, 0, cz);
    ground.receiveShadow = true;
    s.add(ground);

    const asphalt = patternTexture(
      128,
      (g, n) => {
        g.fillStyle = '#4b4e5e';
        g.fillRect(0, 0, n, n);
        let r = 11;
        const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 900; i++) {
          g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
          g.fillRect(rnd() * n, rnd() * n, 2, 2);
        }
      },
      [1, 1],
    );
    const road = new THREE.Mesh(ribbon(p, -HW, HW, 9), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9, side: THREE.DoubleSide }));
    road.position.y = 0.03;
    road.receiveShadow = true;
    s.add(road);
    const curbTex = patternTexture(
      32,
      (g, n) => {
        g.fillStyle = '#e8574a';
        g.fillRect(0, 0, n, n / 2);
        g.fillStyle = '#fbf8f0';
        g.fillRect(0, n / 2, n, n / 2);
      },
      [1, 1],
    );
    for (const [a, b] of [
      [HW, HW + CURB],
      [-HW - CURB, -HW],
    ]) {
      const curb = new THREE.Mesh(ribbon(p, a, b, 3), new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.6, side: THREE.DoubleSide }));
      curb.position.y = 0.05;
      curb.receiveShadow = true;
      s.add(curb);
    }

    // Start line and gantry.
    const checks = patternTexture(
      64,
      (g, n) => {
        const q = n / 4;
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) {
            g.fillStyle = (x + y) % 2 ? '#1d1830' : '#fbf8f0';
            g.fillRect(x * q, y * q, q, q);
          }
      },
      [4, 1],
    );
    const a0 = p.at(-0.9);
    const a1 = p.at(0.9);
    const line = new THREE.BufferGeometry();
    const nl = (q: { x: number; z: number; tx: number; tz: number }, o: number) => [q.x + q.tz * o, 0, q.z - q.tx * o];
    line.setAttribute('position', new THREE.Float32BufferAttribute([...nl(a0, -HW), ...nl(a0, HW), ...nl(a1, -HW), ...nl(a1, HW)], 3));
    line.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    line.setIndex([0, 2, 1, 1, 2, 3]);
    line.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    const lineMesh = new THREE.Mesh(line, new THREE.MeshStandardMaterial({ map: checks, roughness: 0.6, side: THREE.DoubleSide }));
    lineMesh.position.y = 0.07;
    lineMesh.receiveShadow = true;
    s.add(lineMesh);
    const start = p.at(0);
    const gantry = new THREE.Group();
    gantry.position.set(start.x, 0, start.z);
    gantry.rotation.y = start.heading;
    const steel = plastic('#2f3a56', { rough: 0.5 });
    for (const sx of [-1, 1]) {
      gantry.add(mesh(roundBox(0.4, 5, 0.4, 0.08), steel, sx * (HW + 1.4), 2.5, 0));
      this.colliders.push(circle(start.x + start.tz * sx * (HW + 1.4), start.z - start.tx * sx * (HW + 1.4), 0.35, 5, 0.6, true));
    }
    gantry.add(mesh(roundBox(TRACK_WIDTH + 3.4, 1.1, 0.5, 0.15), plastic('#e8574a', { rough: 0.5 }), 0, 5, 0));
    const banner = sign(ctx.area.name, TRACK_WIDTH + 2.4, 0.9, { bg: '#1d1830', fg: '#fffaf0', glow: '#ffd24a', radius: 0.15 }, 0.5);
    banner.position.set(0, 5, -0.28);
    banner.rotation.y = Math.PI;
    gantry.add(banner);
    const banner2 = banner.clone();
    banner2.position.z = 0.28;
    banner2.rotation.y = 0;
    gantry.add(banner2);
    s.add(gantry);

    // Grid: four slots behind the line, staggered.
    const L = p.length;
    for (let k = 0; k < 4; k++) {
      const gs = L - (9 + k * 6);
      const q = p.at(gs, k % 2 ? -2.1 : 2.1);
      this.grid.push({ x: q.x, z: q.z, yaw: q.heading, s: gs });
      const mark = mesh(roundBox(1.9, 0.02, 0.18, 0.01), plastic('#fbf8f0'), q.x + q.tx * 1.2, 0.07, q.z + q.tz * 1.2, { cast: false });
      mark.rotation.y = q.heading + Math.PI / 2;
      s.add(mark);
    }

    // Pit area beside the start, on whichever side has room.
    const clear = (x: number, z: number, need: number) => this.path.nearest(x, z).dist >= need;
    let side = 1;
    let pitS = L - 4;
    search: for (const sOff of [L - 4, L - 30, 30, L * 0.5]) {
      for (const sd of [1, -1]) {
        const q = p.at(sOff, sd * (HW + 11));
        if (clear(q.x, q.z, HW + 8)) {
          side = sd;
          pitS = sOff;
          break search;
        }
      }
    }
    const at = (ds: number, off: number) => p.at(pitS + ds, side * off);
    const towardTrack = (x: number, z: number) => {
      const n = this.path.nearest(x, z);
      const c = p.at(n.s);
      return Math.atan2(c.x - x, c.z - z);
    };
    const arr = at(0, HW + 10);
    this.arrival = { x: arr.x, z: arr.z, yaw: towardTrack(arr.x, arr.z) };
    const doorSpot = at(0, HW + 15.5);
    this.door = { x: doorSpot.x, z: doorSpot.z };
    const doorQ = at(0, HW + 17);
    const doorGroup = new THREE.Group();
    doorGroup.position.set(doorQ.x, 0, doorQ.z);
    doorGroup.rotation.y = towardTrack(doorQ.x, doorQ.z);
    doorGroup.add(mesh(roundBox(3.2, 3.4, 0.5, 0.12), plastic('#8a6bd1', { rough: 0.5 }), 0, 1.7, 0));
    doorGroup.add(mesh(roundBox(2.2, 2.6, 0.6, 0.1), plastic('#2b2340', { rough: 0.4 }), 0, 1.3, 0));
    const doorSign = sign(`Back to ${ctx.ownerName}'s room`, 3.4, 0.6, { bg: '#fffaf0', fg: '#2b2340', radius: 0.14 }, 0.3);
    doorSign.position.set(0, 3.0, 0.31);
    doorGroup.add(doorSign);
    s.add(doorGroup);
    this.colliders.push(box(doorQ.x, doorQ.z, 1.6, 0.3, doorGroup.rotation.y, 3.4, 0.5, true));

    const padQ = at(-14, HW + 5);
    this.pad = { x: padQ.x, z: padQ.z };
    const padMat = new THREE.MeshStandardMaterial({ color: '#ffd24a', emissive: new THREE.Color('#ffb21e'), emissiveIntensity: 0.5, roughness: 0.4 });
    this.lampMats.push(padMat);
    const padMesh = mesh(roundBox(4.2, 0.06, 4.2, 0.03), padMat, padQ.x, 0.04, padQ.z, { cast: false });
    padMesh.rotation.y = padQ.heading;
    s.add(padMesh);
    const padSign = sign('RACE', 2.6, 0.9, { bg: '#1d1830', fg: '#ffd24a', sub: 'Stop here in your kart', subColor: '#fffaf0', radius: 0.14 }, 0.4);
    const padSignQ = at(-14, HW + 8);
    padSign.position.set(padSignQ.x, 1.6, padSignQ.z);
    padSign.rotation.y = towardTrack(padSignQ.x, padSignQ.z);
    s.add(padSign);
    const post = mesh(cached('padpost', () => new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8)), steel, padSignQ.x, 0.6, padSignQ.z);
    s.add(post);

    // Your kart, parked facing along the track.
    const kq = at(-4, HW + 6);
    this.kart = new Vehicle('kart', 'my-kart', kq.x, kq.z, kq.heading, '#e8574a');
    s.add(this.kart.root);

    // Best laps board.
    const bq = at(12, HW + 9);
    const boardGroup = new THREE.Group();
    boardGroup.position.set(bq.x, 0, bq.z);
    boardGroup.rotation.y = towardTrack(bq.x, bq.z);
    for (const sx of [-2.2, 2.2]) boardGroup.add(mesh(roundBox(0.25, 2.2, 0.25, 0.06), steel, sx, 1.1, -0.1));
    this.boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.5), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.25 }));
    this.boardMesh.position.set(0, 3.6, 0.06);
    boardGroup.add(mesh(roundBox(5.3, 3.8, 0.2, 0.08), steel, 0, 3.6, -0.06));
    boardGroup.add(this.boardMesh);
    s.add(boardGroup);
    this.colliders.push(box(bq.x, bq.z, 2.6, 0.3, boardGroup.rotation.y, 5.5, 0.5, true));
    this.paintBoard();

    // Fence around the grounds.
    const rail = plastic('#fbf8f0', { rough: 0.6 });
    const edges: [number, number, number, number][] = [
      [cx, minZ, (maxX - minX) / 2, 0.2],
      [cx, maxZ, (maxX - minX) / 2, 0.2],
      [minX, cz, 0.2, (maxZ - minZ) / 2],
      [maxX, cz, 0.2, (maxZ - minZ) / 2],
    ];
    for (const [x, z, hw, hd] of edges) {
      this.colliders.push(box(x, z, hw, hd, 0, 1.4, 0.4, false));
      s.add(mesh(roundBox(hw > hd ? hw * 2 : 0.16, 0.16, hd > hw ? hd * 2 : 0.16, 0.05), rail, x, 0.9, z, { cast: false }));
      const posts = Math.floor(Math.max(hw, hd) * 2 / 4);
      for (let i = 0; i <= posts; i++) {
        const tt = i / posts - 0.5;
        s.add(mesh(cached('fpost', () => new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6)), rail, x + (hw > hd ? tt * hw * 2 : 0), 0.55, z + (hd > hw ? tt * hd * 2 : 0), { cast: false }));
      }
    }

    // Tyre stacks on the outside of the tight corners.
    const tyreMat = plastic('#24212e', { rough: 0.85 });
    const tyreGeo = cached('tyre', () => new THREE.TorusGeometry(0.4, 0.17, 8, 16).rotateX(Math.PI / 2));
    const placed: Spot[] = [];
    for (let ss = 0; ss < L; ss += 3) {
      const turn = p.turnAhead(ss, 12);
      if (Math.abs(turn) < 1.0) continue;
      const out = turn > 0 ? -1 : 1;
      const q = p.at(ss + 6, out * (HW + CURB + 2.2));
      if (!clear(q.x, q.z, HW + CURB + 1.6) || placed.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 3.2)) continue;
      if (Math.hypot(q.x - this.pad.x, q.z - this.pad.z) < 6) continue;
      placed.push(q);
      for (let k = 0; k < 3; k++) s.add(mesh(tyreGeo, tyreMat, q.x, 0.17 + k * 0.32, q.z));
      this.colliders.push(circle(q.x, q.z, 0.6, 1.1, 0.75, false));
    }

    // Lamps along the track for night laps.
    const poleGeo = cached('lpole', () => new THREE.CylinderGeometry(0.08, 0.11, 3.4, 8));
    const headGeo = cached('lhead', () => new THREE.SphereGeometry(0.3, 14, 10));
    const poolMat = new THREE.MeshBasicMaterial({ map: lightPoolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const poolGeo = new THREE.CircleGeometry(6, 24).rotateX(-Math.PI / 2);
    for (let ss = 0, k = 0; ss < L; ss += 32, k++) {
      const q = p.at(ss + 5, (k % 2 ? 1 : -1) * (HW + CURB + 1.4));
      if (!clear(q.x, q.z, HW + CURB + 1.0)) continue;
      s.add(mesh(poleGeo, steel, q.x, 1.7, q.z));
      const m = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0.1 });
      this.lampMats.push(m);
      s.add(mesh(headGeo, m, q.x, 3.5, q.z, { cast: false }));
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.position.set(q.x, 0.09, q.z);
      pool.renderOrder = 2;
      this.pools.push(pool);
      s.add(pool);
      this.colliders.push(circle(q.x, q.z, 0.18, 3.4, 0.6, false));
    }

    // Trees out of the way of the road and the pit.
    const trunkGeo = cached('trunk', () => new THREE.CylinderGeometry(0.18, 0.24, 1.6, 8));
    const crownGeo = cached('crown', () => new THREE.IcosahedronGeometry(1.3, 1));
    const trunkMat = plastic('#8a5a3b', { rough: 0.9 });
    const crowns = ['#4fae5a', '#5cbf63', '#3f9e55'].map((c) => plastic(c, { rough: 0.85 }));
    let seed = 17;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const keepOut = [this.arrival, this.door, this.pad, kq, bq];
    for (let i = 0, made = 0; i < 400 && made < 60; i++) {
      const x = minX + 3 + rnd() * (maxX - minX - 6);
      const z = minZ + 3 + rnd() * (maxZ - minZ - 6);
      if (!clear(x, z, HW + CURB + 5) || keepOut.some((o) => Math.hypot(o.x - x, o.z - z) < 7)) continue;
      const sc = 0.8 + rnd() * 0.6;
      const t = mesh(trunkGeo, trunkMat, x, 0.8 * sc, z);
      t.scale.setScalar(sc);
      const c = mesh(crownGeo, crowns[made % crowns.length], x, 2.4 * sc, z);
      c.scale.setScalar(sc);
      s.add(t, c);
      this.colliders.push(circle(x, z, 0.3 * sc, 4, 0.5, false));
      made++;
    }

    // Computer drivers, already out on track.
    const drivers: [string, string, number, number][] = [
      ['Zippy', '#4aa3df', 0.9, 1.8],
      ['Bolt', '#3fb68b', 0.94, -1.8],
      ['Turbo', '#8a6bd1', 0.975, 0],
    ];
    drivers.forEach(([name, color, skill, lane], i) => {
      const q = p.at(L * (0.2 + i * 0.27), lane);
      const v = new Vehicle('kart', `cpu-${name}`, q.x, q.z, q.heading, color);
      s.add(v.root);
      const near = p.nearest(q.x, q.z);
      this.cpus.push({ v, name, skill, lane, hint: near.index, s: near.s, raced: 0, toLine: 0, finishedAt: null });
    });
    // Little shadows for karts are part of the vehicle; add one under the arrival spot as a visual anchor.
    const welcome = blob(2.4);
    welcome.position.set(this.arrival.x, 0.06, this.arrival.z);
    s.add(welcome);

    // HUD.
    this.hudTop = h('div', { class: 'kh-top' });
    this.hudTime = h('div', { class: 'kh-time' }, '--');
    this.hudSub = h('div', { class: 'kh-sub' });
    this.hudWarn = h('div', { class: 'kh-warn hidden' }, 'Wrong way');
    this.hud = h('div', { class: 'kart-hud' }, this.hudTop, this.hudTime, this.hudSub, this.hudWarn);
    ctx.ui.hud.appendChild(this.hud);
    this.paintHud();
    void this.loadBoard();
  }

  // -------------------------------------------------------------------------
  // Board

  private async loadBoard(): Promise<void> {
    const r = await api.scores(this.ctx.roomId, this.ctx.area.id, this.ctx.browserId);
    if (this.disposed || !r.ok || r.data.kind !== 'kart') return;
    this.boardRows = r.data.board;
    if (r.data.best && (!this.best || r.data.best < this.best)) {
      this.best = r.data.best;
      localStorage.setItem(this.bestKey, String(this.best));
    }
    this.paintBoard();
    this.paintHud();
  }

  private paintBoard(): void {
    const mat = this.boardMesh.material as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    const tex = boardTexture(
      'Best laps',
      this.boardRows.map((r) => ({ name: r.name, value: formatLap(r.value), you: r.you })),
      this.best ? `Your best ${formatLap(this.best)}` : 'Cross the line to start a lap',
      '#ffd24a',
    );
    mat.map = tex;
    mat.emissiveMap = tex;
    mat.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // SpaceView

  rideables(): Vehicle[] {
    return [this.kart];
  }

  extraColliders(): Collider[] {
    return this.cpus.map((c) => circle(c.v.pos.x, c.v.pos.z, c.v.t.radius * 0.9, 1.2, 0.7, false));
  }

  actions(): SpaceAction[] {
    return [];
  }

  holdsTime(): boolean {
    return this.kart.ridden;
  }

  rideAction(player: PlayerState): { label: string; short: string; run: () => void } | null {
    if (player.riding !== this.kart) return null;
    if (this.race && this.race.state !== 'over') return { label: '', short: '', run: () => {} };
    const onPad = Math.hypot(this.kart.pos.x - this.pad.x, this.kart.pos.z - this.pad.z) < 3 && Math.abs(this.kart.speed) < 4;
    if (onPad) return { label: 'Start a race', short: 'Race', run: () => void this.askRace() };
    return null;
  }

  private async askRace(): Promise<void> {
    const go = await confirmBox(this.ctx.ui, {
      title: 'Race the computer drivers?',
      body: `${this.laps} laps against ${this.cpus.map((c) => c.name).join(', ')}. You start at the back of the grid.`,
      ok: 'Race!',
      cancel: 'Not now',
    });
    if (go && this.kart.ridden && !this.disposed) this.startRace();
  }

  private place(v: Vehicle, slot: { x: number; z: number; yaw: number }): void {
    v.pos.set(slot.x, 0, slot.z);
    v.yaw = slot.yaw;
    v.speed = 0;
    v.steer = 0;
    v.sync();
  }

  private startRace(): void {
    const L = this.path.length;
    this.cpus.forEach((c, i) => {
      const g = this.grid[i];
      this.place(c.v, g);
      c.v.frozen = true;
      c.hint = this.path.nearest(g.x, g.z).index;
      c.s = g.s;
      c.raced = 0;
      c.toLine = L - g.s;
      c.finishedAt = null;
    });
    const mine = this.grid[3];
    this.place(this.kart, mine);
    this.kart.frozen = true;
    this.ctx.snapCamera(mine.yaw);
    this.hint = this.path.nearest(mine.x, mine.z).index;
    this.timing = { started: false, lapStart: 0, dist: 0, s: mine.s, valid: true, last: this.timing.last, wrongFor: 0, offFor: 0 };
    this.race = { state: 'countdown', t: 0, laps: this.laps, playerRaced: 0, playerToLine: L - mine.s, playerFinishedAt: null, shown: -1, bestLap: null };
  }

  private endRace(message: string | null): void {
    for (const c of this.cpus) c.v.frozen = false;
    this.kart.frozen = false;
    this.race = null;
    if (message) this.ctx.ui.toast(message);
  }

  // -------------------------------------------------------------------------
  // Simulation

  step(dt: number, player: PlayerState): void {
    this.clock += dt;
    const p = this.path;
    const L = p.length;
    const riding = player.riding === this.kart;

    if (this.race && !riding) this.endRace('Race abandoned');

    // Your kart: grass slows it, and laps are timed.
    const near = p.nearest(this.kart.pos.x, this.kart.pos.z, this.hint, 8);
    if (near.dist > HW + CURB + 6) Object.assign(near, p.nearest(this.kart.pos.x, this.kart.pos.z));
    this.hint = near.index;
    this.kart.grip = near.dist < HW + CURB + 0.3 ? 1 : 0.5;
    if (riding) this.timeLap(near.s, near.dist, dt);

    // Countdown.
    const race = this.race;
    if (race) {
      race.t += dt;
      if (race.state === 'countdown') {
        const n = Math.floor(race.t);
        if (n !== race.shown) {
          race.shown = n;
          if (n < 3) {
            this.ctx.ui.banner(String(3 - n), '#fffaf0');
            sfx.beep(false);
          } else {
            this.ctx.ui.banner('GO!', '#3fb68b');
            sfx.beep(true);
            race.state = 'running';
            race.t = 0;
            for (const c of this.cpus) c.v.frozen = false;
            this.kart.frozen = false;
            // Timing starts at the green light; the first crossing counts as the start of lap one.
            this.timing.started = true;
            this.timing.lapStart = this.clock;
            this.timing.dist = -race.playerToLine;
          }
        }
      }
    }

    // Computer drivers.
    const karts = [this.kart, ...this.cpus.map((c) => c.v)];
    for (const c of this.cpus) {
      const v = c.v;
      const cn = p.nearest(v.pos.x, v.pos.z, c.hint, 6);
      c.hint = cn.index;
      const ds = p.delta(c.s, cn.s);
      if (Math.abs(ds) < 30) {
        if (race && race.state === 'running') c.raced += ds;
      }
      c.s = cn.s;
      v.grip = cn.dist < HW + CURB + 0.3 ? 1 : 0.5;
      if (v.frozen) {
        v.drive(dt, 0, 0, 1, this.colliders);
        continue;
      }
      let skill = c.skill;
      if (race && race.state === 'running') {
        // Keep the race close without making it a procession.
        const gap = c.raced - c.toLine - (race.playerRaced - race.playerToLine);
        if (gap > 50) skill *= 0.93;
        else if (gap < -40) skill = Math.min(1.02, skill * 1.05);
        if (c.finishedAt === null && c.raced - c.toLine >= race.laps * L) c.finishedAt = this.clock;
      } else {
        skill *= 0.92;
      }
      const speed = Math.abs(v.speed);
      const turnSoon = Math.abs(p.turnAhead(cn.s + 2, 10 + speed * 0.9));
      const lane = c.lane * clamp(1 - turnSoon, 0.2, 1);
      const look = 4 + speed * 0.5;
      const target = p.at(cn.s + look, lane);
      const want = Math.atan2(target.x - v.pos.x, target.z - v.pos.z);
      const steer = clamp(wrapAngle(want - v.yaw) * 2.4, -1, 1);
      const top = v.t.maxSpeed * skill;
      const corner = turnSoon > 1.7 ? 0.42 : turnSoon > 1.2 ? 0.55 : turnSoon > 0.8 ? 0.72 : turnSoon > 0.5 ? 0.88 : 1;
      const targetSpeed = top * corner;
      const throttle = speed < targetSpeed ? 1 : speed > targetSpeed + 1.5 ? -0.7 : 0.15;
      const others = karts.filter((k) => k !== v).map((k) => circle(k.pos.x, k.pos.z, k.t.radius * 0.9, 1.2, 0.7, false));
      v.drive(dt, throttle, steer, 0, this.colliders.concat(others));
    }

    if (race && race.state === 'running') {
      const L2 = race.laps * L;
      if (race.playerFinishedAt === null && race.playerRaced - race.playerToLine >= L2) {
        race.playerFinishedAt = this.clock;
        const place = 1 + this.cpus.filter((c) => c.finishedAt !== null).length;
        const raceMs = Math.round(race.t * 1000);
        this.ctx.ui.banner(place === 1 ? 'YOU WIN!' : ordinal(place), place === 1 ? '#ffd24a' : '#fffaf0');
        if (place === 1) sfx.goal();
        else sfx.confirm();
        this.ctx.ui.toast(`You finished ${ordinal(place)} of ${this.cpus.length + 1} in ${formatLap(raceMs)}${race.bestLap ? `, best lap ${formatLap(race.bestLap)}` : ''}`, 'good', 6000);
        race.state = 'over';
        setTimeout(() => {
          if (this.race === race) this.endRace(null);
        }, 2500);
      }
    }
  }

  private timeLap(s: number, dist: number, dt: number): void {
    const p = this.path;
    const L = p.length;
    const t = this.timing;
    const ds = p.delta(t.s, s);
    if (Math.abs(ds) > 25) {
      // A jump along the lap means a shortcut across the grass.
      if (t.started && t.valid) this.ctx.ui.toast('Shortcut! That lap will not count.', 'bad');
      t.valid = false;
    } else {
      t.dist += ds;
      if (this.race && this.race.state === 'running') this.race.playerRaced += ds;
    }
    t.wrongFor = ds < -0.01 && Math.abs(this.kart.speed) > 2 ? t.wrongFor + dt : Math.max(0, t.wrongFor - dt * 2);
    t.offFor = dist > HW + CURB + 0.3 ? t.offFor + dt : 0;
    const crossed = t.s > L - 25 && s < 25 && ds > 0;
    t.s = s;
    if (!crossed) return;
    const now = this.clock;
    if (t.started && t.valid && t.dist > L * 0.92) {
      const ms = Math.round((now - t.lapStart) * 1000);
      const prevBest = this.best;
      t.last = ms;
      if (this.race) this.race.bestLap = this.race.bestLap ? Math.min(this.race.bestLap, ms) : ms;
      const isBest = !prevBest || ms < prevBest;
      if (isBest) {
        this.best = ms;
        localStorage.setItem(this.bestKey, String(ms));
        this.ctx.ui.banner('New best lap!', '#ffd24a');
      }
      sfx.lap(isBest);
      this.flashLap(ms, prevBest);
      void api.lap(this.ctx.roomId, this.ctx.area.id, this.ctx.browserId, this.ctx.name(), ms).then((r) => {
        if (r.ok && r.data.improved) void this.loadBoard();
      });
    }
    t.started = true;
    t.lapStart = now;
    t.dist = 0;
    t.valid = true;
  }

  private lapFlash: { ms: number; delta: number | null; until: number } | null = null;

  private flashLap(ms: number, prevBest: number | null): void {
    this.lapFlash = { ms, delta: prevBest ? ms - prevBest : null, until: this.clock + 3 };
  }

  private paintHud(): void {
    const t = this.timing;
    const race = this.race;
    const riding = this.kart.ridden;
    this.hud.classList.toggle('hidden', !riding && !race);
    let top = '';
    if (race) {
      const lap = Math.min(race.laps, Math.max(1, Math.floor((race.playerRaced - race.playerToLine) / this.path.length) + 1));
      const me = race.playerRaced - race.playerToLine;
      const ahead = this.cpus.filter((c) => (c.finishedAt !== null && race.playerFinishedAt === null) || c.raced - c.toLine > me).length;
      top = race.state === 'countdown' ? 'Get ready' : `Lap ${lap}/${race.laps} · ${ordinal(ahead + 1)} of ${this.cpus.length + 1}`;
    } else {
      top = t.started ? (t.valid ? 'Lap time' : 'Lap not counted') : 'Cross the line to start a lap';
    }
    if (this.hudTop.textContent !== top) this.hudTop.textContent = top;
    let time = '--';
    if (this.lapFlash && this.clock < this.lapFlash.until) time = formatLap(this.lapFlash.ms);
    else if (t.started && (!race || race.state === 'running')) time = formatLap((this.clock - t.lapStart) * 1000);
    if (this.hudTime.textContent !== time) this.hudTime.textContent = time;
    this.hudTime.classList.toggle('flash', !!this.lapFlash && this.clock < this.lapFlash.until);
    const parts = [`Best ${formatLap(this.best)}`];
    if (t.last) parts.push(`Last ${formatLap(t.last)}`);
    let sub = parts.join(' · ');
    if (this.lapFlash && this.clock < this.lapFlash.until && this.lapFlash.delta !== null) {
      const d = this.lapFlash.delta;
      sub = `${d <= 0 ? '−' : '+'}${(Math.abs(d) / 1000).toFixed(2)} vs best`;
      this.hudSub.dataset.kind = d <= 0 ? 'good' : 'bad';
    } else delete this.hudSub.dataset.kind;
    if (this.hudSub.textContent !== sub) this.hudSub.textContent = sub;
    this.hudWarn.classList.toggle('hidden', !(riding && t.wrongFor > 1.2));
  }

  cutaway(): void {}

  update(night: number, _t: number, phase: number, focus: THREE.Vector3): void {
    this.sky.update(phase, focus);
    for (const m of this.lampMats) m.emissiveIntensity = 0.1 + night * 1.5;
    for (const pl of this.pools) (pl.material as THREE.MeshBasicMaterial).opacity = Math.max(0, night - 0.15) * 0.8;
    (this.boardMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25 + night * 0.5;
    this.paintHud();
  }

  dispose(): void {
    this.disposed = true;
    this.hud.remove();
    disposeTree(this.scene);
  }

  /** For scripted playtests. */
  debugInfo() {
    return {
      length: this.path.length,
      pad: this.pad,
      kart: { x: this.kart.pos.x, z: this.kart.pos.z, yaw: this.kart.yaw },
      start: this.path.at(0),
      race: this.race ? { state: this.race.state, raced: this.race.playerRaced } : null,
      best: this.best,
      last: this.timing.last,
      cpus: this.cpus.map((c) => ({ name: c.name, s: c.s, speed: c.v.speed })),
      at: (s: number, off = 0) => this.path.at(s, off),
    };
  }
}
