// The laser tag match as a deterministic simulation: robot teams with
// perception, utility-scored behaviours, grid navigation and an aim model,
// bolts that bounce off mirrors and home gently on the player's lock, glow
// pips, power-ups and the score. No three.js here: the world draws it, and
// the tests run it headless. Same seed and same inputs give the same match.

import { ARENA, BASES, BASE_R, BOLT_Y, circleHitsPiece, clearLine, firstHit, inArena, LAYOUTS, POWER_PADS, reflectDir, spawnPoints, bankLine, type LayoutId, type Piece } from '../../shared/neon/arena';
import { DEFLECT_WINDOW, FIRE_GAP, HEAT_PER_SHOT, KNOBS, OUT_SECONDS, OVERHEAT, PIPS, PLAYER_BOLT_SPEED, SHIMMER, type Knobs, type TagDiff, type Team } from '../../shared/neon/tag';
import { rng } from '../../shared/neon/rng';

export type Role = 'player' | 'support' | 'runner' | 'anchor' | 'rusher' | 'cautious' | 'trick' | 'captain' | 'dummy';
export type BotState = 'patrol' | 'engage' | 'cover' | 'recharge' | 'flank' | 'power' | 'support';
export type Power = 'shield' | 'overdrive' | 'echo';

export interface TagConfig {
  layout: LayoutId;
  size: 2 | 3 | 4;
  diff: TagDiff;
  captain: boolean;
  seed: number;
  duration: number;
  echo: boolean;
  bpm: number;
  /** A single still target for the first-time lesson. */
  practice?: boolean;
}

export interface Agent {
  id: number;
  name: string;
  team: Team;
  player: boolean;
  role: Role;
  x: number;
  z: number;
  y: number;
  yaw: number;
  vx: number;
  vz: number;
  r: number;
  pips: number;
  maxPips: number;
  outT: number;
  shimmer: number;
  sinceHit: number;
  regen: number;
  tags: number;
  shield: number;
  overdrive: number;
  /** Bounces bolts take (Echo power-up). */
  echo: number;
  state: BotState;
  target: number | null;
  path: { x: number; z: number }[];
  pathAt: number;
  pathGoal: { x: number; z: number } | null;
  thinkT: number;
  seenAt: number;
  teleT: number;
  teleBank: { x: number; z: number } | null;
  cool: number;
  token: boolean;
  strafe: number;
  strafeT: number;
  stuckT: number;
  lastX: number;
  lastZ: number;
  hop: number;
  /** Seconds left of Volt's shield being down while he fires. */
  firing: number;
  /** Damage dealt by the player in the last few seconds (for assists). */
  hurtByPlayerAt: number;
  hitStop: number;
}

export interface Bolt {
  id: number;
  x: number;
  z: number;
  px: number;
  pz: number;
  vx: number;
  vz: number;
  team: Team;
  owner: number;
  life: number;
  bounces: number;
  maxBounces: number;
  beat: boolean;
  home: number | null;
  kind: 'shot' | 'bank' | 'reflect';
  dead: boolean;
}

export type TagEvent =
  | { k: 'fire'; a: number; bolt: Bolt }
  | { k: 'telegraph'; a: number; target: number; bank: boolean }
  | { k: 'hit'; a: number; by: number; bolt: Bolt }
  | { k: 'block'; a: number; bolt: Bolt }
  | { k: 'tag'; a: number; by: number; kind: Bolt['kind']; beat: boolean; assist: boolean }
  | { k: 'out'; a: number }
  | { k: 'respawn'; a: number }
  | { k: 'bounce'; x: number; z: number; bolt: Bolt }
  | { k: 'spark'; x: number; z: number; team: Team }
  | { k: 'reflect'; bolt: Bolt; by: number }
  | { k: 'spawnPower'; pad: number; power: Power }
  | { k: 'pickup'; a: number; power: Power }
  | { k: 'overheat' }
  | { k: 'mark'; a: number; target: number };

const NAMES: Record<Team, string[]> = { cyan: ['Pip', 'Dash', 'Sky'], magenta: ['Zap', 'Bloop', 'Glint', 'Volt'] };
const CYAN_ROLES: Role[] = ['support', 'runner', 'anchor'];
const MAGENTA_ROLES: Role[] = ['rusher', 'cautious', 'trick'];
const BOT_SPEED = 4.3;
const BOT_R = 0.45;
const PLAYER_R = 0.36;
const DT = 1 / 60;
const CELL = 1;
const GW = Math.round((ARENA.x1 - ARENA.x0) / CELL);
const GH = Math.round((ARENA.z1 - ARENA.z0) / CELL);

function gauss(r: () => number): number {
  const u = Math.max(1e-9, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class TagSim {
  readonly cfg: TagConfig;
  readonly knobs: Knobs;
  pieces: Piece[];
  agents: Agent[] = [];
  bolts: Bolt[] = [];
  events: TagEvent[] = [];
  time = 0;
  score: Record<Team, number> = { cyan: 0, magenta: 0 };
  /** Player blaster heat, 0 to 1, and overheat lock. */
  heat = 0;
  overheated = 0;
  fireCool = 0;
  powers: ({ power: Power; at: number } | null)[] = [null, null];
  private nextPower = 12;
  private r: () => number;
  private boltId = 0;
  private grid: Uint8Array;
  /** Team memory: where each enemy was last seen. */
  private memory: Record<Team, Map<number, { x: number; z: number; t: number }>> = { cyan: new Map(), magenta: new Map() };
  /** Beat as heard (from the clock in game, from time in tests). */
  beat = 0;
  /** Events worth points for the player, for the log. */
  readonly log: [number, 'tag' | 'bank' | 'reflect' | 'beat' | 'assist' | 'pickup'][] = [];
  over = false;
  suddenGlow = false;

  constructor(cfg: TagConfig) {
    this.cfg = cfg;
    this.knobs = KNOBS[cfg.diff];
    this.r = rng(cfg.seed);
    this.pieces = LAYOUTS[cfg.layout];
    this.grid = this.buildGrid();
    const cyanSpawns = spawnPoints('cyan');
    const magSpawns = spawnPoints('magenta');
    // The player is agent 0.
    this.agents.push(this.agent(0, 'You', 'cyan', true, 'player', cyanSpawns[1]));
    if (cfg.practice) {
      const d = this.agent(1, 'Practice bot', 'magenta', false, 'dummy', { x: 4.2, z: -28.6, yaw: 0 });
      this.agents.push(d);
      return;
    }
    let id = 1;
    for (let i = 0; i < cfg.size - 1; i++) this.agents.push(this.agent(id++, NAMES.cyan[i], 'cyan', false, CYAN_ROLES[i], cyanSpawns[[0, 2, 3][i]]));
    for (let i = 0; i < cfg.size; i++) {
      const captain = cfg.captain && i === cfg.size - 1;
      this.agents.push(this.agent(id++, captain ? 'Volt' : NAMES.magenta[i], 'magenta', false, captain ? 'captain' : MAGENTA_ROLES[i % 3], magSpawns[i]));
    }
  }

  private agent(id: number, name: string, team: Team, player: boolean, role: Role, at: { x: number; z: number; yaw: number }): Agent {
    return {
      id,
      name,
      team,
      player,
      role,
      x: at.x,
      z: at.z,
      y: 0,
      yaw: at.yaw,
      vx: 0,
      vz: 0,
      r: player ? PLAYER_R : role === 'captain' ? 0.6 : BOT_R,
      pips: role === 'dummy' ? 1 : PIPS,
      maxPips: role === 'dummy' ? 1 : PIPS,
      outT: 0,
      shimmer: 0,
      sinceHit: 99,
      regen: 0,
      tags: 0,
      shield: 0,
      overdrive: 0,
      echo: this.cfg?.echo && player ? 2 : 1,
      state: 'patrol',
      target: null,
      path: [],
      pathAt: -99,
      pathGoal: null,
      thinkT: (id * 0.037) % 0.1,
      seenAt: -99,
      teleT: 0,
      teleBank: null,
      cool: 1 + id * 0.17,
      token: false,
      strafe: id % 2 ? 1 : -1,
      strafeT: 1 + id * 0.3,
      stuckT: 0,
      lastX: at.x,
      lastZ: at.z,
      hop: 0,
      firing: 0,
      hurtByPlayerAt: -99,
      hitStop: 0,
    };
  }

  get player(): Agent {
    return this.agents[0];
  }

  get remaining(): number {
    return Math.max(0, this.cfg.duration - this.time);
  }

  /** Changes the cover layout (between rounds). */
  setLayout(id: LayoutId): void {
    this.pieces = LAYOUTS[id];
    this.grid = this.buildGrid();
    for (const a of this.agents) a.path = [];
  }

  // ---- navigation

  private buildGrid(): Uint8Array {
    const g = new Uint8Array(GW * GH);
    for (let j = 0; j < GH; j++)
      for (let i = 0; i < GW; i++) {
        const x = ARENA.x0 + (i + 0.5) * CELL;
        const z = ARENA.z0 + (j + 0.5) * CELL;
        g[j * GW + i] = !inArena(x, z, 0.55) || circleHitsPiece(x, z, 0.62, this.pieces) ? 1 : 0;
      }
    return g;
  }

  /** Whether a cell is open (for the tests). */
  open(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < GW && j < GH && !this.grid[j * GW + i];
  }

  cellOf(x: number, z: number): [number, number] {
    return [Math.max(0, Math.min(GW - 1, Math.floor((x - ARENA.x0) / CELL))), Math.max(0, Math.min(GH - 1, Math.floor((z - ARENA.z0) / CELL)))];
  }

  /** A* over the grid with an octile heuristic, then string-pulled. */
  findPath(fx: number, fz: number, tx: number, tz: number): { x: number; z: number }[] {
    let [si, sj] = this.cellOf(fx, fz);
    let [ti, tj] = this.cellOf(tx, tz);
    const nearestOpen = (i: number, j: number): [number, number] => {
      if (this.open(i, j)) return [i, j];
      for (let r = 1; r < 6; r++)
        for (let dj = -r; dj <= r; dj++)
          for (let di = -r; di <= r; di++) if (this.open(i + di, j + dj)) return [i + di, j + dj];
      return [i, j];
    };
    [si, sj] = nearestOpen(si, sj);
    [ti, tj] = nearestOpen(ti, tj);
    const N = GW * GH;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open: number[] = [];
    const fScore = new Float32Array(N).fill(Infinity);
    const h = (i: number, j: number) => {
      const dx = Math.abs(i - ti);
      const dy = Math.abs(j - tj);
      return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    const s = sj * GW + si;
    g[s] = 0;
    fScore[s] = h(si, sj);
    open.push(s);
    const goal = tj * GW + ti;
    let found = false;
    let guard = 0;
    while (open.length && guard++ < 4000) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (fScore[open[k]] < fScore[open[bi]]) bi = k;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % GW;
      const cj = (cur - ci) / GW;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (!this.open(ni, nj)) continue;
          if (di && dj && (!this.open(ci + di, cj) || !this.open(ci, cj + dj))) continue;
          const n = nj * GW + ni;
          if (closed[n]) continue;
          const ng = g[cur] + (di && dj ? Math.SQRT2 : 1);
          if (ng < g[n]) {
            g[n] = ng;
            came[n] = cur;
            fScore[n] = ng + h(ni, nj);
            open.push(n);
          }
        }
    }
    if (!found) return [];
    const cells: { x: number; z: number }[] = [];
    for (let c = goal; c !== -1; c = came[c]) {
      const i = c % GW;
      const j = (c - i) / GW;
      cells.push({ x: ARENA.x0 + (i + 0.5) * CELL, z: ARENA.z0 + (j + 0.5) * CELL });
    }
    cells.reverse();
    // String pulling: skip waypoints while the straight walk is clear.
    const out: { x: number; z: number }[] = [];
    let from = { x: fx, z: fz };
    let k = 0;
    while (k < cells.length) {
      let far = k;
      for (let m = cells.length - 1; m > k; m--) {
        if (this.walkable(from.x, from.z, cells[m].x, cells[m].z)) {
          far = m;
          break;
        }
      }
      out.push(cells[far]);
      from = cells[far];
      k = far + 1;
    }
    if (out.length && this.walkable(out[out.length - 1].x, out[out.length - 1].z, tx, tz) && inArena(tx, tz, 0.5)) out[out.length - 1] = { x: tx, z: tz };
    return out;
  }

  /** A straight walk for a bot's body is clear. */
  private walkable(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / 0.4));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (circleHitsPiece(ax + (bx - ax) * t, az + (bz - az) * t, BOT_R + 0.1, this.pieces)) return false;
    }
    return true;
  }

  // ---- perception

  canSee(a: Agent, b: Agent, fov = true): boolean {
    if (b.outT > 0) return false;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d > 22) return false;
    if (fov && !a.player) {
      const ang = Math.abs(wrap(Math.atan2(b.x - a.x, b.z - a.z) - a.yaw));
      if (ang > (70 * Math.PI) / 180 && d > 3) return false;
    }
    return clearLine(a.x, a.z, b.x, b.z, this.pieces);
  }

  /** Enemies the team can see right now (radar). */
  teamSees(team: Team): Set<number> {
    const out = new Set<number>();
    for (const a of this.agents) {
      if (a.team !== team || a.outT > 0) continue;
      for (const b of this.agents) if (b.team !== team && this.canSee(a, b, !a.player)) out.add(b.id);
    }
    return out;
  }

  // ---- the player's actions

  /** Fires the player's blaster. `onBeat` adds no heat. Returns the bolt or null when it cannot fire. */
  playerFire(onBeat: boolean, lock: number | null, bank: { x: number; z: number } | null): Bolt | null {
    const p = this.player;
    if (p.outT > 0 || this.fireCool > 0 || this.overheated > 0 || this.over) return null;
    this.fireCool = FIRE_GAP;
    if (!onBeat && p.overdrive <= 0) {
      this.heat += HEAT_PER_SHOT;
      if (this.heat >= 1 - 1e-6) {
        this.heat = 1;
        this.overheated = OVERHEAT;
        this.events.push({ k: 'overheat' });
      }
    }
    let ax: number;
    let az: number;
    const t = lock !== null ? this.agents[lock] : null;
    if (bank) {
      ax = bank.x - p.x;
      az = bank.z - p.z;
    } else if (t) {
      ax = t.x - p.x;
      az = t.z - p.z;
    } else {
      ax = Math.sin(p.yaw);
      az = Math.cos(p.yaw);
    }
    const l = Math.hypot(ax, az) || 1;
    const b = this.spawnBolt(p, (ax / l) * PLAYER_BOLT_SPEED, (az / l) * PLAYER_BOLT_SPEED, onBeat, bank ? null : lock, bank ? 'bank' : 'shot', p.echo + (bank ? 1 : 0));
    p.yaw = Math.atan2(ax, az);
    return b;
  }

  /** An enemy bolt that will reach the player within the deflect window. */
  deflectable(): Bolt | null {
    const p = this.player;
    if (p.outT > 0) return null;
    let best: Bolt | null = null;
    let bestT = Infinity;
    for (const b of this.bolts) {
      if (b.dead || b.team === p.team) continue;
      const rx = p.x - b.x;
      const rz = p.z - b.z;
      const sp2 = b.vx * b.vx + b.vz * b.vz;
      const t = (rx * b.vx + rz * b.vz) / sp2;
      if (t < 0 || t > DEFLECT_WINDOW + 0.05) continue;
      const cx = b.x + b.vx * t - p.x;
      const cz = b.z + b.vz * t - p.z;
      if (cx * cx + cz * cz > (p.r + 0.5) ** 2) continue;
      if (t < bestT) {
        bestT = t;
        best = b;
      }
    }
    return best;
  }

  /** Swings the prism blade: sends a close enemy bolt back at its shooter. */
  playerSwing(onBeat: boolean): Bolt | null {
    const b = this.deflectable();
    if (!b) return null;
    const p = this.player;
    const shooter = this.agents[b.owner];
    const dx = shooter.x - p.x;
    const dz = shooter.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    b.team = p.team;
    b.owner = p.id;
    b.vx = (dx / l) * PLAYER_BOLT_SPEED;
    b.vz = (dz / l) * PLAYER_BOLT_SPEED;
    b.x = p.x + (dx / l) * 0.6;
    b.z = p.z + (dz / l) * 0.6;
    b.px = b.x;
    b.pz = b.z;
    b.home = shooter.id;
    b.kind = 'reflect';
    b.beat = onBeat;
    b.life = 1.6;
    b.bounces = 0;
    this.events.push({ k: 'reflect', bolt: b, by: p.id });
    return b;
  }

  /** Where the player is this step (the game moves the player). */
  setPlayer(x: number, z: number, y: number, yaw: number, vx: number, vz: number): void {
    const p = this.player;
    p.x = x;
    p.z = z;
    p.y = y;
    p.yaw = yaw;
    p.vx = vx;
    p.vz = vz;
  }

  // ---- the step

  step(dt = DT): void {
    if (this.over) return;
    this.time += dt;
    this.fireCool = Math.max(0, this.fireCool - dt);
    if (this.overheated > 0) {
      this.overheated = Math.max(0, this.overheated - dt);
      if (this.overheated === 0) this.heat = 0;
    } else this.heat = Math.max(0, this.heat - dt * 0.35);
    for (const a of this.agents) this.stepAgent(a, dt);
    this.stepBolts(dt);
    this.stepPowers();
    // Separation between bodies.
    for (let i = 0; i < this.agents.length; i++)
      for (let j = i + 1; j < this.agents.length; j++) {
        const a = this.agents[i];
        const b = this.agents[j];
        if (a.outT > 0 || b.outT > 0) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = a.r + b.r;
        if (d < min && d > 1e-6) {
          const push = (min - d) / 2;
          if (!a.player) {
            a.x -= (dx / d) * push;
            a.z -= (dz / d) * push;
          }
          if (!b.player) {
            b.x += (dx / d) * push;
            b.z += (dz / d) * push;
          }
        }
      }
    if (this.time >= this.cfg.duration && !this.cfg.practice) {
      if (this.score.cyan === this.score.magenta) this.suddenGlow = true;
      else this.over = true;
    }
  }

  private stepAgent(a: Agent, dt: number): void {
    a.hitStop = Math.max(0, a.hitStop - dt);
    a.shimmer = Math.max(0, a.shimmer - dt);
    a.overdrive = Math.max(0, a.overdrive - dt);
    a.firing = Math.max(0, a.firing - dt);
    a.hop = Math.max(0, a.hop - dt);
    if (a.outT > 0) {
      a.outT -= dt;
      if (a.outT <= 0) {
        a.outT = 0;
        a.pips = a.maxPips;
        a.shimmer = SHIMMER;
        a.sinceHit = 99;
        if (a.role !== 'dummy') {
          const spots = spawnPoints(a.team);
          const s = spots[a.id % spots.length];
          a.x = s.x;
          a.z = s.z;
          a.yaw = s.yaw;
        }
        a.path = [];
        a.state = 'patrol';
        a.target = null;
        a.teleT = 0;
        this.releaseToken(a);
        this.events.push({ k: 'respawn', a: a.id });
      }
      return;
    }
    // Glow pips come back after a quiet spell, fast on your own base.
    a.sinceHit += dt;
    const onBase = Math.hypot(a.x - BASES[a.team].x, a.z - BASES[a.team].z) < BASE_R;
    if (a.pips < a.maxPips && (a.sinceHit > (a.player ? 3 : 5) || onBase)) {
      a.regen += dt;
      if (a.regen >= (onBase ? 0.6 : a.player ? 2.5 : 4)) {
        a.regen = 0;
        a.pips++;
      }
    } else a.regen = 0;
    if (a.player) return;
    if (a.role === 'dummy') {
      a.x = 4.2 + Math.sin(this.time * 0.7) * 0.9;
      a.z = -28.6;
      a.yaw = Math.atan2(this.player.x - a.x, this.player.z - a.z);
      return;
    }
    a.thinkT -= dt;
    if (a.thinkT <= 0) {
      a.thinkT += 0.1;
      this.think(a);
    }
    this.move(a, dt);
    this.aim(a, dt);
  }

  // ---- bot brains

  private enemiesOf(a: Agent): Agent[] {
    return this.agents.filter((b) => b.team !== a.team && b.outT <= 0);
  }

  private tokensOnPlayer(): number {
    return this.agents.filter((b) => b.token).length;
  }

  private releaseToken(a: Agent): void {
    a.token = false;
  }

  private think(a: Agent): void {
    const enemies = this.enemiesOf(a);
    const mem = this.memory[a.team];
    let best: Agent | null = null;
    let bestD = Infinity;
    for (const e of enemies) {
      if (!this.canSee(a, e)) continue;
      mem.set(e.id, { x: e.x, z: e.z, t: this.time });
      let d = Math.hypot(e.x - a.x, e.z - a.z) - (PIPS - e.pips) * 1.5;
      // Allies leave the player some glory: they prefer bots.
      if (a.team === 'cyan' && e.player) d += 100;
      if (a.team === 'magenta' && e.player) d -= 1;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    const prevTarget = a.target;
    a.target = best ? best.id : null;
    if (a.target !== prevTarget) {
      a.seenAt = this.time;
      if (a.token && (!best || !best.player)) this.releaseToken(a);
      if (best && a.team === 'cyan' && a.role === 'support') this.events.push({ k: 'mark', a: a.id, target: best.id });
    }
    // Utility scores.
    const targetedBy = enemies.filter((e) => e.target === a.id).length;
    const base = BASES[a.team];
    const distBase = Math.hypot(a.x - base.x, a.z - base.z);
    const scores: [BotState, number][] = [['patrol', 0.25]];
    if (best && a.pips >= 2) scores.push(['engage', 1.0]);
    if (best && ((a.pips <= 1 && targetedBy >= 1) || targetedBy >= 2)) scores.push(['cover', a.role === 'cautious' ? 1.2 : 0.95]);
    if (a.pips <= (a.role === 'cautious' ? 2 : 1) && distBase < 14) scores.push(['recharge', 1.1]);
    if (!best) {
      const seen = [...mem.entries()].filter(([id, m]) => this.time - m.t < 4 && this.agents[id].outT <= 0);
      if (seen.length && this.r() < this.knobs.flank + 0.3) scores.push(['flank', 0.6]);
    }
    const pad = this.powers.findIndex((p) => !!p);
    if (pad >= 0 && (a.role === 'runner' || a.role === 'rusher') && !best) scores.push(['power', 0.8]);
    if (a.role === 'support' && !best) scores.push(['support', 0.7]);
    scores.sort((x, y) => y[1] - x[1]);
    const cur = scores.find((s) => s[0] === a.state);
    if (!cur || scores[0][1] - cur[1] > 0.15) {
      if (scores[0][0] !== a.state) {
        a.state = scores[0][0];
        a.pathGoal = null;
      }
    }
    // Where to go.
    let goal: { x: number; z: number } | null = null;
    const t = a.target !== null ? this.agents[a.target] : null;
    switch (a.state) {
      case 'engage':
        goal = null;
        break;
      case 'cover': {
        if (t) goal = this.coverFrom(a, t);
        break;
      }
      case 'recharge':
        goal = { x: base.x + (a.id % 3) - 1, z: base.z };
        break;
      case 'flank': {
        const seen = [...mem.entries()].filter(([, m]) => this.time - m.t < 4).sort((p, q) => q[1].t - p[1].t)[0];
        if (seen) {
          const m = seen[1];
          const dx = m.x - a.x;
          const dz = m.z - a.z;
          const l = Math.hypot(dx, dz) || 1;
          const side = a.strafe;
          goal = this.clampGoal(m.x - (dx / l) * 5 + (-dz / l) * 6 * side, m.z - (dz / l) * 5 + (dx / l) * 6 * side);
        }
        break;
      }
      case 'power': {
        const p = this.powers.findIndex((q) => !!q);
        if (p >= 0) goal = POWER_PADS[p];
        break;
      }
      case 'support': {
        const p = this.player;
        if (p.outT <= 0) goal = this.clampGoal(p.x + Math.sin(p.yaw + Math.PI * 0.75) * 3, p.z + Math.cos(p.yaw + Math.PI * 0.75) * 3);
        break;
      }
      case 'patrol': {
        // Lanes toward the other half.
        const lanes = [-10, 0, 10];
        const lane = lanes[(a.id + Math.floor(this.time / 12)) % 3];
        const enemyBase = BASES[a.team === 'cyan' ? 'magenta' : 'cyan'];
        const mid = ARENA.cz;
        const zGoal = a.role === 'anchor' ? mid + (a.team === 'cyan' ? 4 : -4) : mid + (enemyBase.z - mid) * 0.55;
        goal = this.clampGoal(lane + Math.sin(this.time * 0.2 + a.id) * 2, zGoal);
        break;
      }
    }
    if (goal) {
      const moved = !a.pathGoal || Math.hypot(goal.x - a.pathGoal.x, goal.z - a.pathGoal.z) > 2;
      if (moved || this.time - a.pathAt > 1 || !a.path.length) {
        a.path = this.findPath(a.x, a.z, goal.x, goal.z);
        a.pathGoal = goal;
        a.pathAt = this.time;
      }
    } else a.path = [];
    // Stuck: little progress for 2 s while pathing.
    if (a.path.length) {
      a.stuckT += 0.1;
      if (a.stuckT >= 2) {
        if (Math.hypot(a.x - a.lastX, a.z - a.lastZ) < 0.3) {
          a.path = this.findPath(a.x, a.z, a.pathGoal?.x ?? a.x, a.pathGoal?.z ?? a.z);
          const [ci, cj] = this.cellOf(a.x, a.z);
          if (!this.open(ci, cj)) {
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
              if (this.open(ci + di, cj + dj)) {
                a.x = ARENA.x0 + (ci + di + 0.5) * CELL;
                a.z = ARENA.z0 + (cj + dj + 0.5) * CELL;
                break;
              }
          }
        }
        a.stuckT = 0;
        a.lastX = a.x;
        a.lastZ = a.z;
      }
    } else {
      a.stuckT = 0;
      a.lastX = a.x;
      a.lastZ = a.z;
    }
    if (a.role === 'rusher' && best && this.r() < 0.04) a.hop = 0.45;
  }

  private clampGoal(x: number, z: number): { x: number; z: number } {
    return { x: Math.max(ARENA.x0 + 1, Math.min(ARENA.x1 - 1, x)), z: Math.max(ARENA.z0 + 1, Math.min(ARENA.z1 - 1, z)) };
  }

  /** A spot behind the nearest cover, away from a threat. */
  private coverFrom(a: Agent, t: Agent): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const p of this.pieces) {
      if (p.kind === 'mirror') continue;
      const dx = p.x - t.x;
      const dz = p.z - t.z;
      const l = Math.hypot(dx, dz) || 1;
      const off = Math.max(p.hw, p.hd) + 1.0;
      const g = this.clampGoal(p.x + (dx / l) * off, p.z + (dz / l) * off);
      if (circleHitsPiece(g.x, g.z, BOT_R + 0.1, this.pieces)) continue;
      const d = Math.hypot(g.x - a.x, g.z - a.z);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    return best;
  }

  private move(a: Agent, dt: number): void {
    if (a.hitStop > 0) return;
    let wx = 0;
    let wz = 0;
    const t = a.target !== null ? this.agents[a.target] : null;
    if (a.state === 'engage' && t) {
      const dx = t.x - a.x;
      const dz = t.z - a.z;
      const d = Math.hypot(dx, dz) || 1;
      a.strafeT -= dt;
      if (a.strafeT <= 0) {
        a.strafe = -a.strafe;
        a.strafeT = 1.4 + this.r() * 1.6;
      }
      const near = a.role === 'rusher' ? 4 : 7;
      const far = a.role === 'rusher' ? 8 : 12;
      const radial = d > far ? 1 : d < near ? -0.8 : 0;
      wx = (dx / d) * radial + (-dz / d) * a.strafe * 0.55;
      wz = (dz / d) * radial + (dx / d) * a.strafe * 0.55;
    } else if (a.path.length) {
      const w = a.path[0];
      const dx = w.x - a.x;
      const dz = w.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) a.path.shift();
      else {
        wx = dx / d;
        wz = dz / d;
      }
    }
    const speed = BOT_SPEED * (a.role === 'runner' || a.role === 'rusher' ? 1.1 : a.role === 'captain' ? 0.8 : 1) * (a.teleT > 0 ? 0.5 : 1);
    const l = Math.hypot(wx, wz);
    const tx = l > 1e-6 ? (wx / l) * speed : 0;
    const tz = l > 1e-6 ? (wz / l) * speed : 0;
    const k = Math.min(1, dt * 8);
    a.vx += (tx - a.vx) * k;
    a.vz += (tz - a.vz) * k;
    let nx = a.x + a.vx * dt;
    let nz = a.z + a.vz * dt;
    // Resolve against cover and the walls.
    for (let pass = 0; pass < 2; pass++) {
      for (const p of this.pieces) {
        const push = pushOut(nx, nz, a.r, p);
        if (push) {
          nx += push[0];
          nz += push[1];
        }
      }
    }
    nx = Math.max(ARENA.x0 + a.r, Math.min(ARENA.x1 - a.r, nx));
    nz = Math.max(ARENA.z0 + a.r, Math.min(ARENA.z1 - a.r, nz));
    a.x = nx;
    a.z = nz;
    // Face the target while engaging, else the way we move.
    if (t && (a.state === 'engage' || a.teleT > 0 || this.canSee(a, t, false))) a.yaw += wrap(Math.atan2(t.x - a.x, t.z - a.z) - a.yaw) * Math.min(1, dt * 8);
    else if (Math.hypot(a.vx, a.vz) > 0.5) a.yaw += wrap(Math.atan2(a.vx, a.vz) - a.yaw) * Math.min(1, dt * 6);
  }

  private aim(a: Agent, dt: number): void {
    a.cool -= dt;
    const t = a.target !== null ? this.agents[a.target] : null;
    if (a.teleT > 0) {
      a.teleT -= dt;
      if (a.teleT <= 0) this.botFire(a);
      return;
    }
    if (a.cool > 0) return;
    // Bank shots for trick shooters when the target hides.
    const useMirrors = (a.role === 'trick' && this.knobs.mirrors >= 1) || (a.role === 'captain' && this.knobs.mirrors >= 2);
    let bank: { x: number; z: number } | null = null;
    let tgt = t;
    if (!tgt && useMirrors) {
      for (const e of this.enemiesOf(a)) {
        const m = this.memory[a.team].get(e.id);
        if (!m || this.time - m.t > 4) continue;
        const bl = bankLine(a.x, a.z, e.x, e.z, this.pieces);
        if (bl && bl.length < 22) {
          tgt = e;
          bank = { x: bl.px, z: bl.pz };
          break;
        }
      }
    }
    if (!tgt || tgt.outT > 0) return;
    if (!bank && !this.canSee(a, tgt)) return;
    if (this.time - a.seenAt < this.knobs.react) return;
    if (Math.hypot(tgt.x - a.x, tgt.z - a.z) > 20) return;
    if (tgt.player) {
      if (!a.token) {
        if (this.tokensOnPlayer() >= this.knobs.tokens + (this.cfg.captain ? 1 : 0)) return;
        a.token = true;
      }
    }
    // Telegraph, starting on the next beat when it is close.
    const toBeat = (Math.ceil(this.beat) - this.beat) * (60 / this.cfg.bpm);
    a.teleT = this.knobs.tele * (a.role === 'rusher' ? 0.8 : 1) + (toBeat < 0.25 ? toBeat : 0);
    a.teleBank = bank;
    a.target = tgt.id;
    this.events.push({ k: 'telegraph', a: a.id, target: tgt.id, bank: !!bank });
  }

  private botFire(a: Agent): void {
    const t = a.target !== null ? this.agents[a.target] : null;
    a.cool = this.knobs.cool * (0.85 + this.r() * 0.3) * (a.team === 'cyan' ? 1.15 : 1) * (t?.player ? 1.25 : 0.8);
    if (!t || t.outT > 0 || a.outT > 0) {
      this.releaseToken(a);
      return;
    }
    const speed = this.knobs.boltSpeed * (a.team === 'cyan' ? 0.95 : 1) * (t.player ? 1 : 1.25);
    let ax: number;
    let az: number;
    if (a.teleBank) {
      ax = a.teleBank.x - a.x;
      az = a.teleBank.z - a.z;
    } else {
      const d = Math.hypot(t.x - a.x, t.z - a.z);
      const flight = d / speed;
      const lead = t.player ? this.knobs.lead * (a.team === 'cyan' ? 0.6 : 1) : 0.9;
      ax = t.x + t.vx * flight * lead - a.x;
      az = t.z + t.vz * flight * lead - a.z;
    }
    // Robots are sharp against each other and kinder to the player.
    const err = (gauss(this.r) * this.knobs.err * (a.team === 'cyan' ? 1.2 : 1) * (t.player ? 1.35 : 0.55) * Math.PI) / 180;
    const ang = Math.atan2(ax, az) + err;
    this.spawnBolt(a, Math.sin(ang) * speed, Math.cos(ang) * speed, false, null, a.teleBank ? 'bank' : 'shot', a.teleBank ? 2 : 1);
    a.firing = 0.5;
    a.teleBank = null;
    if (t.player) {
      // Hand the token on after a moment.
      a.token = false;
    }
  }

  private spawnBolt(a: Agent, vx: number, vz: number, beat: boolean, home: number | null, kind: Bolt['kind'], maxBounces: number): Bolt {
    const l = Math.hypot(vx, vz) || 1;
    const x = a.x + (vx / l) * (a.r + 0.25);
    const z = a.z + (vz / l) * (a.r + 0.25);
    const b: Bolt = { id: this.boltId++, x, z, px: a.x, pz: a.z, vx, vz, team: a.team, owner: a.id, life: 2.2, bounces: 0, maxBounces, beat, home, kind, dead: false };
    this.bolts.push(b);
    this.events.push({ k: 'fire', a: a.id, bolt: b });
    return b;
  }

  private stepBolts(dt: number): void {
    for (const b of this.bolts) {
      if (b.dead) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.dead = true;
        continue;
      }
      // Gentle homing on the player's lock (and reflected bolts on their shooter).
      if (b.home !== null) {
        const t = this.agents[b.home];
        if (t && t.outT <= 0) {
          const want = Math.atan2(t.x - b.x, t.z - b.z);
          const cur = Math.atan2(b.vx, b.vz);
          const turn = Math.max(-1, Math.min(1, wrap(want - cur) / ((120 * Math.PI) / 180 * dt))) * ((120 * Math.PI) / 180) * dt;
          const sp = Math.hypot(b.vx, b.vz);
          b.vx = Math.sin(cur + turn) * sp;
          b.vz = Math.cos(cur + turn) * sp;
        }
      }
      b.px = b.x;
      b.pz = b.z;
      let nx = b.x + b.vx * dt;
      let nz = b.z + b.vz * dt;
      // Agents first (closest along the segment).
      let hitAgent: Agent | null = null;
      let hitT = Infinity;
      for (const a of this.agents) {
        if (a.outT > 0 || a.team === b.team || a.id === b.owner) continue;
        if (a.player && a.y > 0.72) continue;
        const t = segCircle(b.x, b.z, nx, nz, a.x, a.z, a.r + (a.player ? 0.08 : 0.18));
        if (t !== null && t < hitT) {
          hitT = t;
          hitAgent = a;
        }
      }
      const wall = firstHit(b.x, b.z, nx, nz, this.pieces, BOLT_Y);
      if (wall && wall.t < hitT) {
        const hx = b.x + (nx - b.x) * wall.t;
        const hz = b.z + (nz - b.z) * wall.t;
        if (wall.piece.kind === 'mirror' && b.bounces < b.maxBounces) {
          const [rvx, rvz] = reflectDir(b.vx, b.vz, wall.piece);
          b.vx = rvx;
          b.vz = rvz;
          b.bounces++;
          b.x = hx + rvx * dt * 0.3;
          b.z = hz + rvz * dt * 0.3;
          b.home = b.kind === 'bank' ? b.home : null;
          if (b.kind === 'shot') b.kind = 'bank';
          this.events.push({ k: 'bounce', x: hx, z: hz, bolt: b });
          continue;
        }
        b.dead = true;
        this.events.push({ k: 'spark', x: hx, z: hz, team: b.team });
        continue;
      }
      if (hitAgent) {
        b.dead = true;
        this.hitAgent(hitAgent, b);
        continue;
      }
      if (!inArena(nx, nz, -0.5)) {
        b.dead = true;
        this.events.push({ k: 'spark', x: Math.max(ARENA.x0, Math.min(ARENA.x1, nx)), z: Math.max(ARENA.z0, Math.min(ARENA.z1, nz)), team: b.team });
        continue;
      }
      b.x = nx;
      b.z = nz;
    }
    this.bolts = this.bolts.filter((b) => !b.dead);
  }

  private hitAgent(a: Agent, b: Bolt): void {
    if (a.shimmer > 0) {
      this.events.push({ k: 'block', a: a.id, bolt: b });
      return;
    }
    if (a.shield > 0) {
      a.shield--;
      this.events.push({ k: 'block', a: a.id, bolt: b });
      return;
    }
    // Volt's front shield, down only while he fires.
    if (a.role === 'captain' && a.firing <= 0) {
      const from = Math.atan2(b.x - a.x, b.z - a.z);
      if (Math.abs(wrap(from - a.yaw)) < Math.PI / 3) {
        this.events.push({ k: 'block', a: a.id, bolt: b });
        return;
      }
    }
    a.pips--;
    a.sinceHit = 0;
    a.hitStop = 0.045;
    const by = this.agents[b.owner];
    if (by?.player) a.hurtByPlayerAt = this.time;
    this.events.push({ k: 'hit', a: a.id, by: b.owner, bolt: b });
    if (a.pips <= 0) {
      a.outT = a.role === 'dummy' ? 1.2 : OUT_SECONDS;
      a.teleT = 0;
      this.releaseToken(a);
      const team = by?.team ?? (a.team === 'cyan' ? 'magenta' : 'cyan');
      this.score[team]++;
      if (by) by.tags++;
      const assist = !!by && !by.player && by.team === this.player.team && this.time - a.hurtByPlayerAt < 4;
      this.events.push({ k: 'tag', a: a.id, by: b.owner, kind: b.kind, beat: b.beat, assist });
      this.events.push({ k: 'out', a: a.id });
      if (by?.player) {
        const t = Math.round(this.time * 100) / 100;
        this.log.push([t, 'tag']);
        if (b.kind === 'bank') this.log.push([t, 'bank']);
        if (b.kind === 'reflect') this.log.push([t, 'reflect']);
        if (b.beat) this.log.push([t, 'beat']);
      } else if (assist) this.log.push([Math.round(this.time * 100) / 100, 'assist']);
      if (this.suddenGlow) this.over = true;
    }
  }

  private stepPowers(): void {
    if (this.cfg.practice) return;
    if (this.time >= this.nextPower) {
      this.nextPower += 30;
      const kinds: Power[] = this.cfg.echo ? ['shield', 'overdrive', 'echo'] : ['shield', 'overdrive'];
      for (let i = 0; i < 2; i++) {
        if (this.powers[i]) continue;
        const power = kinds[Math.floor(this.r() * kinds.length)];
        this.powers[i] = { power, at: this.time };
        this.events.push({ k: 'spawnPower', pad: i, power });
      }
    }
    for (let i = 0; i < 2; i++) {
      const p = this.powers[i];
      if (!p) continue;
      for (const a of this.agents) {
        if (a.outT > 0) continue;
        if (Math.hypot(a.x - POWER_PADS[i].x, a.z - POWER_PADS[i].z) < 0.9) {
          this.powers[i] = null;
          if (p.power === 'shield') a.shield = 3;
          else if (p.power === 'overdrive') a.overdrive = 8;
          else a.echo = 2;
          if (a.player) {
            this.heat = p.power === 'overdrive' ? 0 : this.heat;
            this.log.push([Math.round(this.time * 100) / 100, 'pickup']);
          }
          this.events.push({ k: 'pickup', a: a.id, power: p.power });
          break;
        }
      }
    }
  }

  /** Takes and clears the events since the last call. */
  take(): TagEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Who made the most tags. */
  mostTags(): Agent {
    return [...this.agents].sort((x, y) => y.tags - x.tags || (x.player ? -1 : 1))[0];
  }
}

function segCircle(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, r: number): number | null {
  const dx = bx - ax;
  const dz = bz - az;
  const fx = ax - cx;
  const fz = az - cz;
  const a = dx * dx + dz * dz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  if (c < 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-12) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

/** How far to push a circle out of a piece, or null. */
function pushOut(x: number, z: number, r: number, p: Piece): [number, number] | null {
  if (p.kind === 'pillar') {
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    const min = p.hw + r;
    if (d >= min || d < 1e-6) return null;
    return [(dx / d) * (min - d), (dz / d) * (min - d)];
  }
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const lx = (x - p.x) * c - (z - p.z) * s;
  const lz = (x - p.x) * s + (z - p.z) * c;
  const cx = Math.max(-p.hw, Math.min(p.hw, lx));
  const cz = Math.max(-p.hd, Math.min(p.hd, lz));
  let ox = lx - cx;
  let oz = lz - cz;
  let d = Math.hypot(ox, oz);
  if (d >= r) return null;
  if (d < 1e-6) {
    const px = p.hw - Math.abs(lx);
    const pz = p.hd - Math.abs(lz);
    if (px < pz) {
      ox = lx < 0 ? -1 : 1;
      oz = 0;
      d = -px;
    } else {
      ox = 0;
      oz = lz < 0 ? -1 : 1;
      d = -pz;
    }
  } else {
    ox /= d;
    oz /= d;
  }
  const depth = r - d;
  // Back to world (inverse rotation).
  return [(ox * c + oz * s) * depth, (-ox * s + oz * c) * depth];
}
