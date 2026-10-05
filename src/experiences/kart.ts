// A kart track: a designed circuit or a sketchbook drawing. Five computer
// drivers (a robot, a frog guy, a cat, a duck and a dino) lap it all the
// time; stop on the race pad in your kart to race them from the grid.
// Drifts, boost pads, slipstreams and rocket starts make passing possible.
// Every clean lap is timed, personal bests are kept on this device, and the
// board at the start line shows the best laps by name.

import * as THREE from 'three';
import { sfx } from '../audio/sfx';
import { api, type BoardRow } from '../net/api';
import { TRACK_CURB, TRACK_WIDTH, TrackPath, trackId } from '../shared/track';
import { confirmBox } from '../ui/dialogs';
import { button, h, type Panel } from '../ui/ui';
import { blob, cached, disposeTree, lightPoolTexture, mesh, plastic, roundBox, sign, signTexture } from '../world/kit';
import { box, circle, clamp, damp, wrapAngle, type Collider } from '../world/physics';
import { Sky } from '../world/sky';
import type { PlayerState, SpaceAction, SpaceView, Spot } from '../world/space';
import { Vehicle } from '../world/vehicles';
import { boardTexture, formatLap, ordinal, patternTexture, type ExperienceCtx } from './common';
import { DRIVERS, Driver, type DriverDef, type Mood } from './kart-drivers';

const HW = TRACK_WIDTH / 2;
const CURB = TRACK_CURB;
const RACE_LAPS_DEFAULT = 3;
/** Sideways grip the computer drivers plan corners with, a little under the karts' limit. */
const AI_GRIP = 10;
/** How hard the computer drivers brake before a corner, m/s squared. */
const AI_BRAKE = 8;
const PAD_BOOST = 1.1;
const ROCKET_BOOST = 1.2;
const DRAFT_BOOST = 0.8;
/** Seconds tucked in behind another kart to earn a slipstream. */
const DRAFT_TIME = 1.1;
const GRID_SLOTS = DRIVERS.length + 1;

interface Fx {
  sparks: THREE.Mesh[];
  sparkMat: THREE.MeshBasicMaterial;
  flame: THREE.Mesh;
}

interface Cpu {
  v: Vehicle;
  def: DriverDef;
  driver: Driver;
  fx: Fx;
  hint: number;
  s: number;
  /** Sideways position the driver is steering for, smoothed. */
  off: number;
  /** A pass in progress: the offset to hold and for how long. */
  passOff: number;
  passFor: number;
  /** Boost pad it decided to go for, by index, or -1. */
  padAim: number;
  /** Forward distance since the race started. */
  raced: number;
  /** Distance from its grid slot to the line. */
  toLine: number;
  /** Race time when it finished, in seconds. */
  finishedAt: number | null;
  mood: Mood;
  moodUntil: number;
  offFor: number;
  stuckFor: number;
  respawns: number;
  /** Longest stretch off the road, seconds (playtests check the driving). */
  offMax: number;
  draft: number;
  laps: number;
}

interface Race {
  state: 'countdown' | 'running' | 'over';
  t: number;
  laps: number;
  playerRaced: number;
  playerToLine: number;
  /** Race time when you finished, in seconds. */
  playerFinishedAt: number | null;
  shown: number;
  bestLap: number | null;
  /** When go was pressed during the countdown, for a rocket start. */
  pressedAt: number | null;
  finalLap: boolean;
}

interface Pad {
  s: number;
  offset: number;
}

/**
 * A strip along the track with the given cross-section: [sideways offset, height] pairs,
 * left to right. Triangles always face up, whichever way the loop was drawn.
 */
function ribbon(path: TrackPath, profile: [number, number][], vScale: number, flat: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const cols = profile.length;
  for (let k = 0; k <= path.n; k++) {
    const i = k % path.n;
    const nx = path.tz[i];
    const nz = -path.tx[i];
    const v = (k === path.n ? path.length : path.s[i]) / vScale;
    profile.forEach(([o, y], c) => {
      pos.push(path.x[i] + nx * o, y, path.z[i] + nz * o);
      uv.push(c / (cols - 1), v);
    });
    if (k < path.n) {
      for (let c = 0; c < cols - 1; c++) {
        const a = k * cols + c;
        idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
    }
  }
  // Flip the winding if the strip came out facing down.
  let up = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    up += (pos[b + 2] - pos[a + 2]) * (pos[c] - pos[a]) - (pos[b] - pos[a]) * (pos[c + 2] - pos[a + 2]);
  }
  if (up < 0) for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (flat) {
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  }
  return g;
}

/** Paint on the road: drawn a hair above it and pulled forward in depth so it never flickers. */
function decal(mat: THREE.Material, layer = 1): THREE.Material {
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -layer;
  mat.polygonOffsetUnits = -layer * 2;
  return mat;
}

/** A flat quad on the road between two distances along the lap and two sideways offsets. */
function roadQuad(p: TrackPath, s0: number, s1: number, o0: number, o1: number, y: number): THREE.BufferGeometry {
  const a = p.at(s0);
  const b = p.at(s1);
  const pt = (q: { x: number; z: number; tx: number; tz: number }, o: number) => [q.x + q.tz * o, y, q.z - q.tx * o];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...pt(a, o0), ...pt(a, o1), ...pt(b, o0), ...pt(b, o1)], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  // Face up whichever side of the line o0 and o1 fall.
  const cross = (b.x - a.x) * (o1 - o0) * a.tx + (b.z - a.z) * (o1 - o0) * a.tz;
  g.setIndex(cross >= 0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3]);
  return g;
}

function smoothLoop(src: Float32Array, half: number): Float32Array {
  const n = src.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -half; k <= half; k++) sum += src[(i + k + n) % n];
    out[i] = sum / (half * 2 + 1);
  }
  return out;
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
  private kartFx: Fx;
  private cpus: Cpu[] = [];
  private pad: Spot;
  private grid: { x: number; z: number; yaw: number; s: number }[] = [];
  private pads: Pad[] = [];
  private padMat: THREE.MeshBasicMaterial;
  private startLights: THREE.MeshStandardMaterial[] = [];
  private lampMats: THREE.MeshStandardMaterial[] = [];
  private pools: THREE.Mesh[] = [];
  private boardMesh: THREE.Mesh;
  private boardRows: BoardRow[] = [];
  /** Per centre-line point: racing line offset and the speed the computer drivers plan for. */
  private line: Float32Array;
  private plan: Float32Array;
  private clock = 0;
  private hint = 0;
  private timing = { started: false, lapStart: 0, dist: 0, s: 0, valid: true, last: null as number | null, wrongFor: 0, offFor: 0 };
  private best: number | null;
  private race: Race | null = null;
  private resultsOpen = false;
  private wasRiding = false;
  private tipShown = false;
  private stuckFor = 0;
  private draft = 0;
  private lastStage = 0;
  private turbos = 0;
  private flash: { text: string; until: number } | null = null;
  private hud: HTMLElement;
  private hudPos: HTMLElement;
  private hudTime: HTMLElement;
  private hudTop: HTMLElement;
  private hudSub: HTMLElement;
  private hudWarn: HTMLElement;
  private map: HTMLCanvasElement;
  private mapBg: HTMLCanvasElement;
  private mapXf: { cx: number; cz: number; k: number; size: number };
  private mapAt = 0;
  private lastFrame = performance.now();
  /** Playtests can run the computer drivers at race pace without a race. */
  private simPace = false;
  private disposed = false;
  private readonly bestKey: string;
  private readonly laps: number;

  constructor(private readonly ctx: ExperienceCtx) {
    const exp = ctx.area.experience;
    if (!exp || exp.kind !== 'kart') throw new Error('Not a kart track');
    this.laps = exp.laps || RACE_LAPS_DEFAULT;
    this.path = new TrackPath(exp.track);
    // Personal bests belong to this exact course.
    this.bestKey = `toyboxes.pb.${ctx.roomId}.${ctx.area.id}.${trackId(exp.track)}`;
    const stored = Number(localStorage.getItem(this.bestKey));
    this.best = stored > 0 ? stored : null;
    const p = this.path;
    const s = this.scene;
    const L = p.length;
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
    const M = 24;
    minX -= M;
    maxX += M;
    minZ -= M;
    maxZ += M;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    // ---- Ground and road. The road is at y 0, the grass just under it, and
    // the curbs are raised strips, so no two surfaces share a plane.
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
    const groundMat = new THREE.MeshStandardMaterial({ map: grass, roughness: 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX + 120, maxZ - minZ + 120).rotateX(-Math.PI / 2), groundMat);
    ground.position.set(cx, -0.04, cz);
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
        // Edge lines are part of the road texture, not a separate layer.
        g.fillStyle = '#f3efe4';
        g.fillRect(3, 0, 3, n);
        g.fillRect(n - 6, 0, 3, n);
      },
      [1, 1],
    );
    const road = new THREE.Mesh(
      ribbon(
        p,
        [
          [-HW, 0],
          [HW, 0],
        ],
        9,
        true,
      ),
      new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9 }),
    );
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
    const curbMat = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.6 });
    for (const sd of [1, -1]) {
      const prof: [number, number][] = [
        [sd * HW, 0],
        [sd * (HW + 0.18), 0.07],
        [sd * (HW + CURB - 0.18), 0.07],
        [sd * (HW + CURB), -0.04],
      ];
      const curb = new THREE.Mesh(ribbon(p, sd > 0 ? prof : prof.reverse(), 3, false), curbMat);
      curb.receiveShadow = true;
      s.add(curb);
    }

    // ---- Start line, grid and gantry with the start lights.
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
    const lineMesh = new THREE.Mesh(roadQuad(p, -0.9, 0.9, -HW, HW, 0.004), decal(new THREE.MeshStandardMaterial({ map: checks, roughness: 0.6 })));
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
    // Start lights face the grid, which is behind the line.
    gantry.add(mesh(roundBox(2.6, 0.8, 0.3, 0.1), plastic('#1d1830'), 0, 4.0, -0.1));
    const bulb = cached('slight', () => new THREE.SphereGeometry(0.24, 16, 12));
    for (let i = 0; i < 3; i++) {
      const m = new THREE.MeshStandardMaterial({ color: '#3a3448', emissive: new THREE.Color('#000000'), roughness: 0.3 });
      this.startLights.push(m);
      gantry.add(mesh(bulb, m, (i - 1) * 0.8, 4.0, -0.3, { cast: false }));
    }
    s.add(gantry);

    // Grid: two columns behind the line. You start at the back.
    const gridMat = decal(new THREE.MeshStandardMaterial({ color: '#fbf8f0', roughness: 0.6 }));
    for (let k = 0; k < GRID_SLOTS; k++) {
      const gs = L - (8 + k * 5.5);
      const lane = k % 2 ? -2.2 : 2.2;
      const q = p.at(gs, lane);
      this.grid.push({ x: q.x, z: q.z, yaw: q.heading, s: gs });
      s.add(new THREE.Mesh(roadQuad(p, gs + 1.15, gs + 1.35, lane - 1.0, lane + 1.0, 0.004), gridMat));
    }

    // ---- Boost pads on the long straights, away from the grid.
    const runs: { from: number; to: number }[] = [];
    let runStart = -1;
    const stepS = 2;
    for (let ss = 0; ss <= L + stepS; ss += stepS) {
      const straight = Math.abs(p.turnAhead(ss, 12)) < 0.1;
      if (straight && runStart < 0) runStart = ss;
      if ((!straight || ss > L) && runStart >= 0) {
        runs.push({ from: runStart, to: ss });
        runStart = -1;
      }
    }
    runs.sort((a, b) => b.to - b.from - (a.to - a.from));
    let lane = 1;
    for (const r of runs) {
      const len = r.to - r.from;
      if (len < 25 || this.pads.length >= 4) continue;
      const spots = len >= 100 ? [0.3, 0.7] : [0.45];
      for (const f of spots) {
        const ps = r.from + len * f;
        // Not on the grid or the line.
        const fromLine = p.delta(0, ps);
        if (fromLine > -45 && fromLine < 15) continue;
        this.pads.push({ s: ((ps % L) + L) % L, offset: lane * 2.2 });
        lane = -lane;
      }
    }
    const chevrons = patternTexture(
      64,
      (g, n) => {
        g.fillStyle = '#ff9d2e';
        g.fillRect(0, 0, n, n);
        g.fillStyle = '#ffe14d';
        for (const y0 of [0, n / 2]) {
          g.beginPath();
          g.moveTo(4, y0 + n / 2 - 4);
          g.lineTo(n / 2, y0 + 6);
          g.lineTo(n - 4, y0 + n / 2 - 4);
          g.lineTo(n - 4, y0 + n / 2 + 8);
          g.lineTo(n / 2, y0 + 18);
          g.lineTo(4, y0 + n / 2 + 8);
          g.closePath();
          g.fill();
        }
      },
      [1, 2],
    );
    this.padMat = decal(new THREE.MeshBasicMaterial({ map: chevrons })) as THREE.MeshBasicMaterial;
    for (const pd of this.pads) s.add(new THREE.Mesh(roadQuad(p, pd.s - 2.5, pd.s + 2.5, pd.offset - 1.5, pd.offset + 1.5, 0.004), this.padMat));

    // ---- Pit area beside the start, on whichever side has room.
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
    const raceMat = new THREE.MeshStandardMaterial({ color: '#ffd24a', emissive: new THREE.Color('#ffb21e'), emissiveIntensity: 0.5, roughness: 0.4 });
    this.lampMats.push(raceMat);
    const padMesh = mesh(roundBox(4.2, 0.06, 4.2, 0.03), raceMat, padQ.x, 0.03, padQ.z, { cast: false });
    padMesh.rotation.y = padQ.heading;
    s.add(padMesh);
    const padSign = sign('RACE', 2.6, 0.9, { bg: '#1d1830', fg: '#ffd24a', sub: 'Stop here in your kart', subColor: '#fffaf0', radius: 0.14 }, 0.4);
    const padSignQ = at(-14, HW + 8);
    padSign.position.set(padSignQ.x, 1.6, padSignQ.z);
    padSign.rotation.y = towardTrack(padSignQ.x, padSignQ.z);
    s.add(padSign);
    s.add(mesh(cached('padpost', () => new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8)), steel, padSignQ.x, 0.6, padSignQ.z));

    // Your kart, parked facing along the track.
    const kq = at(-4, HW + 6);
    this.kart = new Vehicle('kart', 'my-kart', kq.x, kq.z, kq.heading, '#e8574a');
    this.kart.racing = true;
    this.kartFx = this.makeFx(this.kart);
    s.add(this.kart.root);

    // Best laps board.
    const bq = at(12, HW + 9);
    const boardGroup = new THREE.Group();
    boardGroup.position.set(bq.x, 0, bq.z);
    boardGroup.rotation.y = towardTrack(bq.x, bq.z);
    for (const sx of [-2.2, 2.2]) boardGroup.add(mesh(roundBox(0.25, 2.2, 0.25, 0.06), steel, sx, 1.1, -0.1));
    this.boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.5), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.25 }));
    this.boardMesh.position.set(0, 3.6, 0.11);
    boardGroup.add(mesh(roundBox(5.3, 3.8, 0.2, 0.08), steel, 0, 3.6, 0));
    boardGroup.add(this.boardMesh);
    s.add(boardGroup);
    this.colliders.push(box(bq.x, bq.z, 2.6, 0.3, boardGroup.rotation.y, 5.5, 0.5, true));
    this.paintBoard();

    // Everything placed off the road keeps its distance from everything else.
    const props: { x: number; z: number; r: number }[] = [
      { ...this.arrival, r: 3 },
      { ...this.door, r: 3 },
      { ...this.pad, r: 3.5 },
      { x: kq.x, z: kq.z, r: 2.5 },
      { x: bq.x, z: bq.z, r: 3.2 },
      { x: padSignQ.x, z: padSignQ.z, r: 1.6 },
    ];
    const free = (x: number, z: number, r: number, road: number) => clear(x, z, road + r) && props.every((o) => Math.hypot(o.x - x, o.z - z) >= o.r + r);

    // ---- A grandstand along the longest straight, facing the road.
    const main = runs[0];
    if (main) {
      const mid = (main.from + main.to) / 2;
      stand: for (const ds of [0, 15, -15, 30, -30]) {
        for (const sd of [-side, side]) {
          const q = p.at(mid + ds, sd * (HW + CURB + 8.5));
          const ends = [p.at(mid + ds - 11, sd * (HW + CURB + 8.5)), p.at(mid + ds + 11, sd * (HW + CURB + 8.5))];
          if (![q, ...ends].every((e) => free(e.x, e.z, 4.5, HW + CURB + 3.5))) continue;
          this.buildStand(q.x, q.z, towardTrack(q.x, q.z));
          props.push({ x: q.x, z: q.z, r: 12 });
          break stand;
        }
      }
    }

    // ---- Fence around the grounds.
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
      const posts = Math.floor((Math.max(hw, hd) * 2) / 4);
      for (let i = 0; i <= posts; i++) {
        const tt = i / posts - 0.5;
        s.add(mesh(cached('fpost', () => new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6)), rail, x + (hw > hd ? tt * hw * 2 : 0), 0.55, z + (hd > hw ? tt * hd * 2 : 0), { cast: false }));
      }
    }

    // ---- Tyre stacks on the outside of the tight corners.
    const tyreMat = plastic('#24212e', { rough: 0.85 });
    const tyreGeo = cached('tyre', () => new THREE.TorusGeometry(0.4, 0.17, 8, 16).rotateX(Math.PI / 2));
    for (let ss = 0; ss < L; ss += 3) {
      const turn = p.turnAhead(ss, 12);
      if (Math.abs(turn) < 0.8) continue;
      const out = turn > 0 ? -1 : 1;
      const q = p.at(ss + 6, out * (HW + CURB + 2.4));
      if (!free(q.x, q.z, 0.7, HW + CURB + 1.0)) continue;
      props.push({ x: q.x, z: q.z, r: 1.6 });
      for (let k = 0; k < 3; k++) s.add(mesh(tyreGeo, tyreMat, q.x, 0.17 + k * 0.32, q.z));
      this.colliders.push(circle(q.x, q.z, 0.6, 1.1, 0.75, false));
    }

    // ---- Lamps along the track for night laps.
    const poleGeo = cached('lpole', () => new THREE.CylinderGeometry(0.08, 0.11, 3.4, 8));
    const headGeo = cached('lhead', () => new THREE.SphereGeometry(0.3, 14, 10));
    const poolMat = decal(new THREE.MeshBasicMaterial({ map: lightPoolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), 3);
    const poolGeo = new THREE.CircleGeometry(6, 24).rotateX(-Math.PI / 2);
    for (let ss = 0, k = 0; ss < L; ss += 32, k++) {
      const q = p.at(ss + 5, (k % 2 ? 1 : -1) * (HW + CURB + 1.5));
      if (!free(q.x, q.z, 0.4, HW + CURB + 1.0) || this.pools.some((o) => Math.hypot(o.position.x - q.x, o.position.z - q.z) < 13)) continue;
      props.push({ x: q.x, z: q.z, r: 0.6 });
      s.add(mesh(poleGeo, steel, q.x, 1.7, q.z));
      const m = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0.1 });
      this.lampMats.push(m);
      s.add(mesh(headGeo, m, q.x, 3.5, q.z, { cast: false }));
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.position.set(q.x, 0.08, q.z);
      pool.renderOrder = 2;
      this.pools.push(pool);
      s.add(pool);
      this.colliders.push(circle(q.x, q.z, 0.18, 3.4, 0.6, false));
    }

    // ---- Trees out of the way of the road and everything else.
    const trunkGeo = cached('trunk', () => new THREE.CylinderGeometry(0.18, 0.24, 1.6, 8));
    const crownGeo = cached('crown', () => new THREE.IcosahedronGeometry(1.3, 1));
    const trunkMat = plastic('#8a5a3b', { rough: 0.9 });
    const crowns = ['#4fae5a', '#5cbf63', '#3f9e55'].map((c) => plastic(c, { rough: 0.85 }));
    let seed = 17;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0, made = 0; i < 600 && made < 70; i++) {
      const x = minX + 3 + rnd() * (maxX - minX - 6);
      const z = minZ + 3 + rnd() * (maxZ - minZ - 6);
      if (!free(x, z, 1.5, HW + CURB + 4)) continue;
      const sc = 0.8 + rnd() * 0.6;
      props.push({ x, z, r: 1.5 });
      const t = mesh(trunkGeo, trunkMat, x, 0.8 * sc, z);
      t.scale.setScalar(sc);
      const c = mesh(crownGeo, crowns[made % crowns.length], x, 2.4 * sc, z);
      c.scale.setScalar(sc);
      s.add(t, c);
      this.colliders.push(circle(x, z, 0.3 * sc, 4, 0.5, false));
      made++;
    }

    // ---- The computer drivers' racing line and speed plan.
    const n = p.n;
    const spacing = L / n;
    const heading = (i: number) => Math.atan2(p.tx[((i % n) + n) % n], p.tz[((i % n) + n) % n]);
    const k3 = Math.max(1, Math.round(3 / spacing));
    const curv = new Float32Array(n);
    for (let i = 0; i < n; i++) curv[i] = wrapAngle(heading(i + k3) - heading(i - k3)) / (2 * k3 * spacing);
    const wide = smoothLoop(curv, Math.max(1, Math.round(8 / spacing)));
    const rawLine = new Float32Array(n);
    for (let i = 0; i < n; i++) rawLine[i] = clamp(wide[i] * 45, -1, 1) * (HW - 1.7);
    this.line = smoothLoop(smoothLoop(rawLine, Math.max(1, Math.round(6 / spacing))), Math.max(1, Math.round(6 / spacing)));
    const tight = smoothLoop(curv, k3);
    this.plan = new Float32Array(n);
    for (let i = 0; i < n; i++) this.plan[i] = Math.sqrt(AI_GRIP * 1.1 * (1 / Math.max(Math.abs(tight[i]), 1 / 300)));
    for (let pass = 0; pass < 2; pass++)
      for (let i = n - 1; i >= 0; i--) {
        const j = (i + 1) % n;
        const ds = (j === 0 ? L : p.s[j]) - p.s[i];
        this.plan[i] = Math.min(this.plan[i], Math.sqrt(this.plan[j] ** 2 + 2 * AI_BRAKE * ds));
      }

    // ---- Computer drivers, already out on track.
    DRIVERS.forEach((def, i) => {
      const q = p.at(L * (0.12 + i * 0.17), def.lane);
      const v = new Vehicle('kart', `cpu-${def.name}`, q.x, q.z, q.heading, def.kart);
      v.racing = true;
      const driver = new Driver(def);
      v.seat.add(driver.root);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTexture(def.name, 1.5, 0.42, { bg: '#1d1830', fg: def.kart, border: def.kart, radius: 0.14 }), depthWrite: false, transparent: true }));
      tag.scale.set(1.5, 0.42, 1);
      tag.position.set(0, 2.15, 0);
      v.root.add(tag);
      s.add(v.root);
      const near = p.nearest(q.x, q.z);
      this.cpus.push({ v, def, driver, fx: this.makeFx(v), hint: near.index, s: near.s, off: def.lane, passOff: 0, passFor: 0, padAim: -1, raced: 0, toLine: 0, finishedAt: null, mood: 'drive', moodUntil: 0, offFor: 0, stuckFor: 0, respawns: 0, offMax: 0, draft: 0, laps: 0 });
    });
    const welcome = blob(2.4);
    welcome.position.set(this.arrival.x, 0.02, this.arrival.z);
    s.add(welcome);

    // ---- HUD and minimap.
    this.hudTop = h('div', { class: 'kh-top' });
    this.hudPos = h('div', { class: 'kh-pos hidden' });
    this.hudTime = h('div', { class: 'kh-time' }, '--');
    this.hudSub = h('div', { class: 'kh-sub' });
    this.hudWarn = h('div', { class: 'kh-warn hidden' }, 'Wrong way');
    this.hud = h('div', { class: 'kart-hud' }, this.hudTop, h('div', { class: 'kh-row' }, this.hudPos, this.hudTime), this.hudSub, this.hudWarn);
    ctx.ui.hud.appendChild(this.hud);
    const size = 128;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.map = h('canvas', { class: 'kart-map hidden', width: size * dpr, height: size * dpr, 'aria-hidden': 'true' });
    ctx.ui.hud.appendChild(this.map);
    const spanX = maxX - minX - M * 2 + 16;
    const spanZ = maxZ - minZ - M * 2 + 16;
    this.mapXf = { cx, cz, k: (size * dpr) / Math.max(spanX, spanZ), size: size * dpr };
    this.mapBg = document.createElement('canvas');
    this.mapBg.width = this.mapBg.height = size * dpr;
    this.paintMapBg();
    this.paintHud();
    void this.loadBoard();
  }

  private makeFx(v: Vehicle): Fx {
    const sparkMat = new THREE.MeshBasicMaterial({ color: '#fff3c4' });
    const geo = cached('spark', () => new THREE.OctahedronGeometry(0.1, 0));
    const sparks = [-1, 1].map((sx) => {
      const m = mesh(geo, sparkMat, sx * 0.62, 0.1, -0.8, { cast: false });
      m.visible = false;
      v.body.add(m);
      return m;
    });
    const flame = mesh(
      cached('flame', () => new THREE.ConeGeometry(0.15, 0.6, 10).rotateX(-Math.PI / 2)),
      new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      0,
      0.42,
      -1.25,
      { cast: false },
    );
    flame.visible = false;
    v.body.add(flame);
    return { sparks, sparkMat, flame };
  }

  private buildStand(x: number, z: number, yaw: number): void {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    const concrete = plastic('#c9c2d6', { rough: 0.8 });
    const seat = plastic('#4aa3df', { rough: 0.6 });
    for (let t = 0; t < 3; t++) {
      g.add(mesh(roundBox(20, 0.6 + t * 0.7, 1.6, 0.06), concrete, 0, (0.6 + t * 0.7) / 2, -t * 1.6 + 1.6));
      g.add(mesh(roundBox(19.4, 0.16, 0.5, 0.05), seat, 0, 0.68 + t * 0.7, -t * 1.6 + 1.3));
    }
    for (const sx of [-9.8, 9.8]) g.add(mesh(roundBox(0.3, 4.6, 0.3, 0.06), plastic('#2f3a56'), sx, 2.3, -2.6));
    g.add(mesh(roundBox(20.6, 0.2, 5.4, 0.08), plastic('#e8574a', { rough: 0.5 }), 0, 4.7, 0.1));
    const title = sign('TOYBOX GRAND PRIX', 9, 0.9, { bg: '#1d1830', fg: '#ffd24a', radius: 0.14 }, 0.5);
    title.position.set(0, 4.15, 2.81);
    g.add(title);
    // A cheering crowd as two instanced meshes: bodies and heads.
    const count = 66;
    const bodies = new THREE.InstancedMesh(cached('fan', () => new THREE.CapsuleGeometry(0.22, 0.3, 4, 8)), new THREE.MeshStandardMaterial({ roughness: 0.7 }), count);
    const heads = new THREE.InstancedMesh(cached('fanhead', () => new THREE.SphereGeometry(0.17, 10, 8)), new THREE.MeshStandardMaterial({ roughness: 0.6 }), count);
    const shirts = ['#e8574a', '#f4b740', '#4aa3df', '#3fb68b', '#8a6bd1', '#ef6fa0', '#fffaf0'].map((c) => new THREE.Color(c));
    const skins = ['#f2c9a0', '#d9a07a', '#a8714f', '#7a4a32', '#5cbf63', '#aab4c6'].map((c) => new THREE.Color(c));
    const m4 = new THREE.Matrix4();
    let seed = 5;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < count; i++) {
      const t = i % 3;
      const fx = -9 + (Math.floor(i / 3) / (count / 3 - 1)) * 18 + (rnd() - 0.5) * 0.3;
      const fz = -t * 1.6 + 1.25;
      const fy = 0.68 + t * 0.7;
      m4.makeTranslation(fx, fy + 0.4, fz);
      bodies.setMatrixAt(i, m4);
      bodies.setColorAt(i, shirts[Math.floor(rnd() * shirts.length)]);
      m4.makeTranslation(fx, fy + 0.9, fz);
      heads.setMatrixAt(i, m4);
      heads.setColorAt(i, skins[Math.floor(rnd() * skins.length)]);
    }
    bodies.castShadow = true;
    g.add(bodies, heads);
    this.scene.add(g);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    this.colliders.push(box(x - fx * 0.1, z - fz * 0.1, 10.3, 2.6, yaw, 4.8, 0.4, true));
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
    if (this.race) {
      // Mid-race the button never gets you off; it puts you back on the road if you are lost.
      if (this.timing.offFor > 2.5 || this.stuckFor > 1.5) return { label: 'Back on track', short: 'Reset', run: () => this.respawn() };
      return { label: '', short: '', run: () => {} };
    }
    const onPad = Math.hypot(this.kart.pos.x - this.pad.x, this.kart.pos.z - this.pad.z) < 3 && Math.abs(this.kart.speed) < 4;
    if (onPad) return { label: 'Start a race', short: 'Race', run: () => void this.askRace() };
    return null;
  }

  private driftKey(): string {
    const d = this.ctx.ui.device;
    return d === 'pad' ? 'X' : d === 'touch' ? 'Brake' : 'Space';
  }

  private async askRace(): Promise<void> {
    const names = DRIVERS.map((d) => d.name);
    const go = await confirmBox(this.ctx.ui, {
      title: 'Race the computer drivers?',
      body: `${this.laps} laps against ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}. You start at the back. Hold ${this.driftKey()} while you turn to drift, and let go for a boost.`,
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
    v.drift = 0;
    v.boost = 0;
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
      c.off = i % 2 ? -2.2 : 2.2;
      c.passFor = 0;
      c.padAim = -1;
      c.raced = 0;
      c.toLine = L - g.s;
      c.finishedAt = null;
      c.mood = 'drive';
      c.draft = 0;
    });
    const mine = this.grid[GRID_SLOTS - 1];
    this.place(this.kart, mine);
    this.kart.frozen = true;
    this.ctx.snapCamera(mine.yaw);
    this.hint = this.path.nearest(mine.x, mine.z).index;
    this.timing = { started: false, lapStart: 0, dist: 0, s: mine.s, valid: true, last: this.timing.last, wrongFor: 0, offFor: 0 };
    this.race = { state: 'countdown', t: 0, laps: this.laps, playerRaced: 0, playerToLine: L - mine.s, playerFinishedAt: null, shown: -1, bestLap: null, pressedAt: null, finalLap: false };
    for (const m of this.startLights) this.setLight(m, null);
  }

  private endRace(message: string | null): void {
    for (const c of this.cpus) c.v.frozen = false;
    this.kart.frozen = false;
    this.race = null;
    for (const m of this.startLights) this.setLight(m, null);
    if (message) this.ctx.ui.toast(message);
  }

  private setLight(m: THREE.MeshStandardMaterial, color: string | null): void {
    m.color.set(color ?? '#3a3448');
    m.emissive.set(color ?? '#000000');
    m.emissiveIntensity = color ? 2.2 : 0;
  }

  private respawn(): void {
    const n = this.path.nearest(this.kart.pos.x, this.kart.pos.z);
    const q = this.path.at(n.s - 2, clamp(n.offset, -2, 2));
    this.place(this.kart, { x: q.x, z: q.z, yaw: q.heading });
    this.ctx.snapCamera(q.heading);
    this.hint = n.index;
    this.timing.offFor = 0;
    this.stuckFor = 0;
  }

  /** Who is where: finished racers by time, then everyone else by distance. */
  private standings(): { name: string; color: string; you: boolean; time: number | null; progress: number }[] {
    const race = this.race;
    if (!race) return [];
    const rows = [
      { name: this.ctx.name() || 'You', color: '#e8574a', you: true, time: race.playerFinishedAt, progress: race.playerRaced - race.playerToLine },
      ...this.cpus.map((c) => ({ name: c.def.name, color: c.def.kart, you: false, time: c.finishedAt, progress: c.raced - c.toLine })),
    ];
    return rows.sort((a, b) => (a.time !== null && b.time !== null ? a.time - b.time : a.time !== null ? -1 : b.time !== null ? 1 : b.progress - a.progress));
  }

  private showResults(race: Race): void {
    const ui = this.ctx.ui;
    const rows = this.standings();
    const place = rows.findIndex((r) => r.you) + 1;
    this.resultsOpen = true;
    const list = h(
      'ol',
      { class: 'race-results' },
      ...rows.map((r, i) =>
        h(
          'li',
          { class: r.you ? 'you' : '' },
          h('span', { class: 'rr-pos' }, ordinal(i + 1)),
          h('span', { class: 'rr-dot', style: `background:${r.color}` }),
          h('span', { class: 'rr-name' }, r.you ? `${r.name} (you)` : r.name),
          h('span', { class: 'rr-time' }, r.time !== null ? formatLap(r.time * 1000) : 'Still racing'),
        ),
      ),
    );
    const again = button('Race again', () => {
      ui.close(panel);
      if (this.kart.ridden && !this.disposed) this.startRace();
    }, 'primary');
    const done = button('Done', () => ui.close(panel), 'ghost');
    const panel: Panel = {
      el: h(
        'div',
        { class: 'card race-panel' },
        h('h2', {}, place === 1 ? 'You won!' : `You finished ${ordinal(place)}`),
        list,
        h('p', { class: 'rr-best' }, race.bestLap ? `Your best lap this race: ${formatLap(race.bestLap)}` : 'Finish a full lap to set a lap time'),
        h('div', { class: 'actions' }, done, again),
      ),
      light: true,
      onBack: () => ui.close(panel),
      onClose: () => {
        this.resultsOpen = false;
        if (this.race === race) this.endRace(null);
      },
      initial: () => again,
    };
    ui.open(panel);
  }

  // -------------------------------------------------------------------------
  // Simulation

  /** Index of the centre-line point at or before a distance along the lap. */
  private idx(s: number): number {
    const p = this.path;
    const d = ((s % p.length) + p.length) % p.length;
    let lo = 0;
    let hi = p.n - 1;
    let i = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (p.s[mid] <= d) {
        i = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return i;
  }

  step(dt: number, player: PlayerState): void {
    this.clock += dt;
    const p = this.path;
    const L = p.length;
    const riding = player.riding === this.kart;
    if (riding && !this.wasRiding && !this.tipShown) {
      this.tipShown = true;
      this.ctx.ui.toast(`Hold ${this.driftKey()} while you turn to drift. Let go for a boost.`, 'info', 4500);
    }
    this.wasRiding = riding;

    if (this.race && !riding) this.endRace('Race abandoned');

    // Your kart: grass slows it, and laps are timed.
    const near = p.nearest(this.kart.pos.x, this.kart.pos.z, this.hint, 8);
    if (near.dist > HW + CURB + 6) Object.assign(near, p.nearest(this.kart.pos.x, this.kart.pos.z));
    this.hint = near.index;
    this.kart.grip = near.dist < HW + CURB + 0.3 ? 1 : 0.5;
    if (riding) this.timeLap(near.s, near.dist, dt);
    this.stuckFor = riding && this.kart.throttleIn > 0.5 && Math.abs(this.kart.speed) < 0.6 && !this.kart.frozen ? this.stuckFor + dt : 0;
    if (this.kart.turbo) {
      if (riding) sfx.boost();
      this.kart.turbo = 0;
      this.turbos++;
    }
    const stage = this.kart.driftStage;
    if (riding && stage > this.lastStage) sfx.driftSpark(stage);
    this.lastStage = stage;

    // Countdown and start lights.
    const race = this.race;
    if (race) {
      race.t += dt;
      if (race.state === 'countdown') {
        if (this.kart.throttleIn > 0.5) race.pressedAt ??= race.t;
        else race.pressedAt = null;
        const n = Math.floor(race.t);
        if (n !== race.shown) {
          race.shown = n;
          if (n < 3) {
            this.setLight(this.startLights[n], '#ff3b30');
            this.ctx.ui.banner(String(3 - n), '#fffaf0');
            sfx.beep(false);
          } else {
            for (const m of this.startLights) this.setLight(m, '#3fe07a');
            this.ctx.ui.banner('GO!', '#3fb68b');
            sfx.beep(true);
            race.state = 'running';
            const rocket = race.pressedAt !== null && race.pressedAt >= 2;
            race.t = 0;
            for (const c of this.cpus) {
              c.v.frozen = false;
              // Some drivers nail the start too.
              if (Math.random() < c.def.daring * 0.6) c.v.boost = 0.7;
            }
            this.kart.frozen = false;
            if (rocket) {
              this.kart.boost = ROCKET_BOOST;
              sfx.boost();
              this.flashText('Rocket start!');
            }
            // Timing starts at the green light; the first crossing counts as the start of lap one.
            this.timing.started = true;
            this.timing.lapStart = this.clock;
            this.timing.dist = -race.playerToLine;
          }
        }
      } else if (race.t > 2 && race.t - dt <= 2) {
        for (const m of this.startLights) this.setLight(m, null);
      }
    }

    // Where every kart is along the lap, for slipstreams and passing.
    const karts: { v: Vehicle; s: number; off: number }[] = [{ v: this.kart, s: near.s, off: near.offset }];
    for (const c of this.cpus) {
      const cn = p.nearest(c.v.pos.x, c.v.pos.z, c.hint, 6);
      if (cn.dist > HW + CURB + 6) Object.assign(cn, p.nearest(c.v.pos.x, c.v.pos.z));
      c.hint = cn.index;
      const ds = p.delta(c.s, cn.s);
      if (Math.abs(ds) < 30) {
        if (race && race.state !== 'countdown') c.raced += ds;
        c.laps += ds / L;
      }
      c.s = cn.s;
      c.v.grip = cn.dist < HW + CURB + 0.3 ? 1 : 0.5;
      c.offFor = cn.dist > HW + CURB + 0.5 ? c.offFor + dt : 0;
      c.offMax = Math.max(c.offMax, c.offFor);
      karts.push({ v: c.v, s: cn.s, off: cn.offset });
    }

    // Boost pads and slipstreams, for everyone.
    this.padMat.map!.offset.y = (this.clock * 1.6) % 1;
    for (const k of karts) {
      if (k.v.grip < 1 || k.v.frozen) continue;
      for (const pd of this.pads) {
        if (Math.abs(p.delta(pd.s, k.s)) < 2.5 && Math.abs(k.off - pd.offset) < 1.9 && k.v.boost < PAD_BOOST - 0.2) {
          k.v.boost = PAD_BOOST;
          if (k.v === this.kart && riding) {
            sfx.boost();
            this.flashText('Boost!');
          }
        }
      }
      // A slipstream builds tucked in behind a kart on a straight, then needs a few seconds to build again.
      const tucked = k.v.speed > 11 && Math.abs(p.turnAhead(k.s, 15)) < 0.25 && karts.some((o) => o !== k && p.delta(k.s, o.s) > 2 && p.delta(k.s, o.s) < 9 && Math.abs(o.off - k.off) < 1.3);
      const isMe = k.v === this.kart;
      const cpu = isMe ? null : this.cpus.find((c) => c.v === k.v)!;
      let draft = isMe ? this.draft : cpu!.draft;
      draft = draft < 0 ? draft + dt : tucked ? draft + dt : Math.max(0, draft - dt * 2);
      if (draft >= DRAFT_TIME) {
        draft = -4;
        k.v.boost = Math.max(k.v.boost, DRAFT_BOOST);
        if (isMe && riding) {
          sfx.boost();
          this.flashText('Slipstream!');
        }
      }
      if (isMe) this.draft = draft;
      else cpu!.draft = draft;
    }

    // Computer drivers.
    const playerProgress = race ? race.playerRaced - race.playerToLine : 0;
    for (let ci = 0; ci < this.cpus.length; ci++) {
      const c = this.cpus[ci];
      const v = c.v;
      const me = karts[ci + 1];
      if (v.frozen) {
        v.drive(dt, 0, 0, 1, this.colliders);
        continue;
      }
      const racing = (race && race.state !== 'countdown' && c.finishedAt === null) || this.simPace;
      let skill = c.def.skill * (racing ? 1 : 0.9);
      let nerve = c.def.nerve * (racing ? 1 : 0.9);
      if (race && racing && !this.simPace) {
        // Keep the race close without making it a procession.
        const gap = c.raced - c.toLine - playerProgress;
        if (gap > 70) {
          skill *= 0.9;
          nerve *= 0.92;
        } else if (gap > 35) {
          skill *= 0.95;
          nerve *= 0.96;
        } else if (gap < -45) nerve *= 1.05;
      }
      if (race && c.finishedAt === null && race.state !== 'countdown' && c.raced - c.toLine >= race.laps * L) {
        c.finishedAt = race.t;
        c.mood = race.playerFinishedAt === null ? 'cheer' : 'sulk';
        c.moodUntil = this.clock + 5;
      }
      const speed = Math.max(0, v.speed);
      const look = 4 + speed * 0.45;
      const li = this.idx(me.s + look);
      let want = this.line[li] * 0.85 + c.def.lane * 0.5 * (1 - Math.min(1, Math.abs(this.line[li]) / 2));
      // Go for a boost pad ahead, if this driver is the type.
      if (c.padAim >= 0 && p.delta(me.s, this.pads[c.padAim].s) < -3) c.padAim = -1;
      if (c.padAim < 0)
        this.pads.forEach((pd, i) => {
          const d = p.delta(me.s, pd.s);
          // The same choice every frame of the approach, but a different one each lap.
          const roll = ((ci * 7 + i * 13 + Math.floor(c.laps) * 5) * 0.618034) % 1;
          if (d > 25 && d < 32 && roll < c.def.daring) c.padAim = i;
        });
      if (c.padAim >= 0) want = this.pads[c.padAim].offset;
      // Pass a slower kart instead of running into it.
      c.passFor = Math.max(0, c.passFor - dt);
      for (const o of karts) {
        if (o === me) continue;
        const d = p.delta(me.s, o.s);
        if (d > 0.5 && d < 9 && Math.abs(o.off - c.off) < 1.8 && o.v.speed < speed + 1.5) {
          const sideRoom = o.off > 0 ? -1 : 1;
          c.passOff = o.off + sideRoom * 2.4;
          c.passFor = 0.9;
        }
      }
      if (c.passFor > 0) want = c.passOff;
      want = clamp(want, -(HW - 1.1), HW - 1.1);
      c.off += (want - c.off) * damp(1.8, dt);
      const target = p.at(me.s + look, c.off);
      const desired = Math.atan2(target.x - v.pos.x, target.z - v.pos.z);
      const steer = clamp(wrapAngle(desired - v.yaw) * 2.6, -1, 1);
      const cornerV = this.plan[this.idx(me.s + speed * 0.3)] * nerve;
      const cruise = v.t.maxSpeed * skill;
      let throttle: number;
      if (speed > cornerV + 0.6) throttle = -clamp((speed - cornerV) / 4, 0.15, 1);
      else if (v.boost > 0 || speed < Math.min(cruise, cornerV) - 0.2) throttle = 1;
      else throttle = 0;
      const others = karts.filter((k) => k !== me).map((k) => circle(k.v.pos.x, k.v.pos.z, k.v.t.radius * 0.9, 1.2, 0.7, false));
      v.drive(dt, throttle, steer, 0, this.colliders.concat(others));
      // Stuck in a tyre wall or lost on the grass: back onto the road.
      c.stuckFor = speed < 1 ? c.stuckFor + dt : 0;
      if (c.offFor > 3 || c.stuckFor > 2.5) {
        let back = me.s - 2;
        for (let tries = 0; tries < 6 && karts.some((o) => o !== me && Math.abs(p.delta(o.s, back)) < 3.5); tries++) back -= 4;
        const q = p.at(back, 0);
        this.place(v, { x: q.x, z: q.z, yaw: q.heading });
        c.hint = this.idx(back);
        c.off = 0;
        c.offFor = 0;
        c.stuckFor = 0;
        c.respawns++;
      }
    }

    if (race && race.state === 'running') {
      const L2 = race.laps * L;
      const progress = race.playerRaced - race.playerToLine;
      if (!race.finalLap && race.laps > 1 && progress >= L2 - L) {
        race.finalLap = true;
        this.ctx.ui.banner('Final lap!', '#ffd24a');
        sfx.confirm();
      }
      if (race.playerFinishedAt === null && progress >= L2) {
        race.playerFinishedAt = race.t;
        const place = 1 + this.cpus.filter((c) => c.finishedAt !== null).length;
        this.ctx.ui.banner(place === 1 ? 'YOU WIN!' : ordinal(place), place === 1 ? '#ffd24a' : '#fffaf0');
        if (place === 1) sfx.goal();
        else sfx.confirm();
        for (const c of this.cpus)
          if (c.finishedAt === null) {
            c.mood = 'sulk';
            c.moodUntil = this.clock + 4;
          }
        race.state = 'over';
      }
    }
    if (race && race.state === 'over' && !this.resultsOpen) {
      const allIn = this.cpus.every((c) => c.finishedAt !== null);
      if (allIn || race.t - race.playerFinishedAt! > 6) this.showResults(race);
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
      if (this.race && this.race.state !== 'countdown') this.race.playerRaced += ds;
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

  private flashText(text: string): void {
    this.flash = { text, until: this.clock + 1.4 };
  }

  private paintHud(): void {
    const t = this.timing;
    const race = this.race;
    const riding = this.kart.ridden;
    this.hud.classList.toggle('hidden', !riding && !race);
    this.map.classList.toggle('hidden', !riding);
    let top = '';
    let pos = '';
    if (race) {
      const lap = Math.min(race.laps, Math.max(1, Math.floor((race.playerRaced - race.playerToLine) / this.path.length) + 1));
      const place = this.standings().findIndex((r) => r.you) + 1;
      top = race.state === 'countdown' ? 'Get ready' : race.state === 'over' ? 'Finished' : `Lap ${lap}/${race.laps}`;
      pos = race.state === 'countdown' ? '' : `${ordinal(place)}/${this.cpus.length + 1}`;
    } else {
      top = t.started ? (t.valid ? 'Lap time' : 'Lap not counted') : 'Cross the line to start a lap';
    }
    if (this.hudTop.textContent !== top) this.hudTop.textContent = top;
    if (this.hudPos.textContent !== pos) this.hudPos.textContent = pos;
    this.hudPos.classList.toggle('hidden', !pos);
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
    } else if (race?.state === 'countdown') {
      sub = 'Go on the last red light for a rocket start';
      delete this.hudSub.dataset.kind;
    } else if (this.flash && this.clock < this.flash.until) {
      sub = this.flash.text;
      this.hudSub.dataset.kind = 'good';
    } else delete this.hudSub.dataset.kind;
    if (this.hudSub.textContent !== sub) this.hudSub.textContent = sub;
    this.hudWarn.classList.toggle('hidden', !(riding && t.wrongFor > 1.2));
  }

  private paintMapBg(): void {
    const g = this.mapBg.getContext('2d')!;
    const { size, k } = this.mapXf;
    const p = this.path;
    g.clearRect(0, 0, size, size);
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i <= p.n; i++) {
      const [x, y] = this.toMap(p.x[i % p.n], p.z[i % p.n]);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokeStyle = 'rgba(29,24,48,0.85)';
    g.lineWidth = Math.max(5, TRACK_WIDTH * k + 4);
    g.stroke();
    g.strokeStyle = '#d8d0ec';
    g.lineWidth = Math.max(3, TRACK_WIDTH * k * 0.6);
    g.stroke();
    const a = p.at(0, -HW);
    const b = p.at(0, HW);
    const [ax, ay] = this.toMap(a.x, a.z);
    const [bx, by] = this.toMap(b.x, b.z);
    g.strokeStyle = '#1d1830';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.stroke();
  }

  private toMap(x: number, z: number): [number, number] {
    const { cx, cz, k, size } = this.mapXf;
    return [size / 2 + (x - cx) * k, size / 2 + (z - cz) * k];
  }

  private paintMap(): void {
    const g = this.map.getContext('2d')!;
    const { size } = this.mapXf;
    g.clearRect(0, 0, size, size);
    g.drawImage(this.mapBg, 0, 0);
    const dot = (x: number, z: number, color: string, r: number) => {
      const [px, py] = this.toMap(x, z);
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#1d1830';
      g.stroke();
    };
    const r = size / 26;
    for (const c of this.cpus) dot(c.v.pos.x, c.v.pos.z, c.def.kart, r);
    dot(this.kart.pos.x, this.kart.pos.z, '#e8574a', r * 1.35);
  }

  private updateFx(v: Vehicle, fx: Fx): void {
    const drifting = v.drift !== 0 && v.speed > 3;
    const stage = v.driftStage;
    fx.sparkMat.color.set(stage === 2 ? '#ff9d2e' : stage === 1 ? '#4fc3ff' : '#fff3c4');
    for (const sp of fx.sparks) {
      sp.visible = drifting;
      if (drifting) {
        sp.scale.setScalar((stage ? 1.8 : 0.9) * (0.6 + Math.random() * 0.9));
        sp.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      }
    }
    fx.flame.visible = v.boost > 0;
    if (fx.flame.visible) fx.flame.scale.set(1, 1, 0.7 + Math.random() * 0.7);
  }

  cutaway(): void {}

  update(night: number, _t: number, phase: number, focus: THREE.Vector3): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.sky.update(phase, focus);
    for (const m of this.lampMats) m.emissiveIntensity = 0.1 + night * 1.5;
    for (const pl of this.pools) (pl.material as THREE.MeshBasicMaterial).opacity = Math.max(0, night - 0.15) * 0.8;
    (this.boardMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25 + night * 0.5;
    for (const c of this.cpus) {
      if (c.mood !== 'drive' && this.clock > c.moodUntil) c.mood = 'drive';
      c.driver.animate(dt, c.v.steer, c.v.speed, c.mood);
      this.updateFx(c.v, c.fx);
    }
    this.updateFx(this.kart, this.kartFx);
    this.paintHud();
    if (this.kart.ridden && now - this.mapAt > 66) {
      this.mapAt = now;
      this.paintMap();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.hud.remove();
    this.map.remove();
    disposeTree(this.scene);
  }

  /** For scripted playtests. */
  debugInfo() {
    return {
      length: this.path.length,
      pad: this.pad,
      kart: { x: this.kart.pos.x, z: this.kart.pos.z, yaw: this.kart.yaw, speed: this.kart.speed, drift: this.kart.drift, stage: this.kart.driftStage, boost: this.kart.boost, turbos: this.turbos },
      start: this.path.at(0),
      race: this.race ? { state: this.race.state, raced: this.race.playerRaced, t: this.race.t, standings: this.standings().map((r) => r.name) } : null,
      results: this.resultsOpen,
      best: this.best,
      last: this.timing.last,
      pads: this.pads,
      cpus: this.cpus.map((c) => ({ name: c.def.name, kind: c.def.kind, s: c.s, speed: c.v.speed, laps: c.laps, offMax: c.offMax, respawns: c.respawns })),
      at: (s: number, off = 0) => this.path.at(s, off),
    };
  }

  /** Parks the computer drivers in a row facing the arrival spot, for close-up screenshots. */
  debugLineUp(on: boolean): boolean {
    const L = this.path.length;
    this.cpus.forEach((c, i) => {
      c.v.frozen = on;
      if (on) {
        const yaw = this.arrival.yaw;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const side = (i - 2) * 2.5;
        this.place(c.v, { x: this.arrival.x + fx * 5 + fz * side, z: this.arrival.z + fz * 5 - fx * side, yaw: yaw + Math.PI });
        c.mood = i % 2 ? 'cheer' : 'drive';
        c.moodUntil = this.clock + 60;
      } else {
        const q = this.path.at(L * (0.12 + i * 0.17), c.def.lane);
        this.place(c.v, { x: q.x, z: q.z, yaw: q.heading });
        c.hint = this.idx(L * (0.12 + i * 0.17));
        c.mood = 'drive';
      }
    });
    return true;
  }

  /** Puts you a few metres from the finish of the race, for playtests of the results. */
  debugNearFinish(): boolean {
    const race = this.race;
    if (!race || race.state !== 'running') return false;
    race.playerRaced = race.playerToLine + race.laps * this.path.length - 3;
    return true;
  }

  /** Runs the computer drivers at race pace for a while without drawing, for playtests. */
  debugSimulate(seconds: number) {
    const idle: PlayerState = { x: this.arrival.x, z: this.arrival.z, yaw: 0, vx: 0, vz: 0, riding: null };
    this.simPace = true;
    for (const c of this.cpus) {
      c.laps = 0;
      c.offMax = 0;
      c.respawns = 0;
    }
    const t0 = this.clock;
    for (let i = 0; i < seconds * 60; i++) this.step(1 / 60, idle);
    this.simPace = false;
    return { seconds: this.clock - t0, cpus: this.cpus.map((c) => ({ name: c.def.name, laps: c.laps, offMax: c.offMax, respawns: c.respawns })) };
  }
}
