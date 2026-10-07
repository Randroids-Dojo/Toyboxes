// The Golden Paddle's light rig, scaled by tier. Low uses the sky's light,
// a warm fill, emissive bulbs and painted light pools (no point lights);
// medium adds the three chandeliers as real lights; high adds Old Lucky's
// bay, the River Wheel and the lounge.

import * as THREE from 'three';
import type { Tier } from '../../world/space';
import { Batch } from './batch';
import { BLACKJACK, CAPTAIN_TABLE, CLERESTORY, FALLS, LOUNGE_TABLES, OLD_LUCKY, RIVER_WHEEL, ROULETTE, SALOON, STERN, LOGBOOK } from './layout';
import { C, canvasTex, type Mats } from './materials';

export interface Chandelier {
  group: THREE.Group;
  x: number;
  z: number;
  y: number;
}

/** A soft round glow painted on a floor or a felt. */
function poolTexture(): THREE.CanvasTexture {
  return canvasTex(
    128,
    128,
    (g, s) => {
      const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)');
      grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    },
    false,
  );
}

export class Lights {
  readonly group = new THREE.Group();
  readonly chandeliers: Chandelier[] = [];
  /** Every decorative bulb on the boat that is not part of a game. */
  readonly bulbs: THREE.InstancedMesh;
  private bulbBase: THREE.Color[] = [];
  private festoon: number[] = [];
  private pools: THREE.Mesh[] = [];
  private poolMat: THREE.MeshBasicMaterial;
  private warm: THREE.HemisphereLight;
  private chandLights: THREE.PointLight[] = [];
  private extra: THREE.PointLight[] = [];
  private owned: { dispose(): void }[] = [];
  /** 1 normally; a jackpot ceremony dims the room and the chandeliers swell. */
  dim = 1;
  glow = 0;

  constructor(private m: Mats) {
    const own = <X extends { dispose(): void }>(x: X): X => {
      this.owned.push(x);
      return x;
    };
    this.warm = new THREE.HemisphereLight('#ffd9a0', '#3a1c14', 0.55);
    this.group.add(this.warm);

    const bulbSpots: { p: THREE.Vector3; color: string; festoon?: number }[] = [];
    const crystalMat = own(new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0.12, roughness: 0.15, metalness: 0.1 }));

    // Three chandeliers down the clerestory.
    for (const x of [-7, 0, 7]) {
      const top = CLERESTORY.height - 0.12;
      // Hung low enough for the follow camera, which looks down from about 5 m, to see.
      const y = 4.25;
      const g = new THREE.Group();
      g.position.set(x, 0, 0);
      const b = new Batch();
      const cb = new Batch();
      b.add(new THREE.CylinderGeometry(0.03, 0.03, top - y - 0.6, 6), m.brass, 0, (top + y + 0.6) / 2, 0);
      b.add(new THREE.SphereGeometry(0.16, 14, 10), m.brass, 0, y + 0.55, 0);
      b.add(new THREE.CylinderGeometry(0.22, 0.08, 0.5, 14), m.brass, 0, y + 0.25, 0);
      b.add(new THREE.SphereGeometry(0.12, 12, 8), m.brass, 0, y - 0.05, 0);
      for (const [r, yy, n] of [[0.95, y + 0.05, 10], [0.6, y + 0.5, 6]] as const) {
        b.add(new THREE.TorusGeometry(r, 0.035, 8, 40).rotateX(Math.PI / 2), m.brass, 0, yy, 0);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const cx = Math.cos(a) * r;
          const cz = Math.sin(a) * r;
          // Arm curving out from the hub, a cup and a candle bulb.
          b.add(new THREE.CylinderGeometry(0.015, 0.015, r, 5).rotateZ(Math.PI / 2).rotateY(-a), m.brass, cx / 2, yy - 0.04, cz / 2);
          b.add(new THREE.CylinderGeometry(0.06, 0.035, 0.07, 10), m.brass, cx, yy + 0.04, cz);
          bulbSpots.push({ p: new THREE.Vector3(x + cx, yy + 0.15, cz), color: C.chandelier });
          // Crystal drops hang between the arms.
          const a2 = a + Math.PI / n;
          cb.add(new THREE.OctahedronGeometry(0.05, 0).scale(1, 1.8, 1), crystalMat, Math.cos(a2) * r, yy - 0.16, Math.sin(a2) * r);
          cb.add(new THREE.OctahedronGeometry(0.035, 0).scale(1, 1.8, 1), crystalMat, Math.cos(a2) * r, yy - 0.3, Math.sin(a2) * r);
        }
      }
      b.build(g);
      cb.build(g, { cast: false });
      this.group.add(g);
      this.chandeliers.push({ group: g, x, z: 0, y });
      const pl = new THREE.PointLight(C.chandelier, 18, 16, 1.6);
      pl.position.set(x, y + 0.2, 0);
      this.chandLights.push(pl);
      this.group.add(pl);
    }

    // Green-shaded pendant lamps over the tables and the chart table.
    const shadeMat = own(new THREE.MeshStandardMaterial({ color: '#1f5a3a', roughness: 0.4, emissive: new THREE.Color('#2a6a3a'), emissiveIntensity: 0.25, side: THREE.DoubleSide }));
    const lamps = new Batch();
    const pendant = (x: number, z: number, y: number, ceiling: number, wide = 1) => {
      lamps.add(new THREE.CylinderGeometry(0.012, 0.012, ceiling - y, 5), m.brass, x, (ceiling + y) / 2, z);
      lamps.add(new THREE.CylinderGeometry(0.12 * wide, 0.5 * wide, 0.32, 20, 1, true), shadeMat, x, y, z);
      lamps.add(new THREE.TorusGeometry(0.5 * wide, 0.02, 6, 24).rotateX(Math.PI / 2), m.brass, x, y - 0.16, z);
      bulbSpots.push({ p: new THREE.Vector3(x, y - 0.1, z), color: '#fff0d0' });
    };
    pendant(ROULETTE.x + 0.6, ROULETTE.z, 3.0, SALOON.height - 0.12, 1.3);
    pendant(ROULETTE.x - 1.2, ROULETTE.z, 3.0, SALOON.height - 0.12, 0.9);
    pendant(BLACKJACK.x, BLACKJACK.z + 0.6, 3.0, SALOON.height - 0.12, 1.3);
    pendant(LOGBOOK.table.x, LOGBOOK.table.z, 2.7, SALOON.height - 0.12, 1.0);
    pendant(CAPTAIN_TABLE.x, CAPTAIN_TABLE.z + 0.6, 2.8, 4.48, 1.3);
    lamps.build(this.group, { cast: false });

    // Light pools: on the felts, under the chandeliers, in front of Old Lucky.
    const poolTex = own(poolTexture());
    this.poolMat = own(new THREE.MeshBasicMaterial({ map: poolTex, color: '#ffcf8a', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }));
    const greenPool = own(this.poolMat.clone());
    greenPool.color.set('#d8ffb0');
    greenPool.opacity = 0.22;
    const bluePool = own(this.poolMat.clone());
    bluePool.color.set('#9fb7e8');
    bluePool.opacity = 0.25;
    const pool = (x: number, y: number, z: number, w: number, d: number, mat: THREE.Material) => {
      const p = new THREE.Mesh(own(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)), mat);
      p.position.set(x, y, z);
      p.renderOrder = 2;
      this.group.add(p);
      this.pools.push(p);
    };
    for (const x of [-7, 0, 7]) pool(x, 0.012, 0, 7, 7, this.poolMat);
    pool(OLD_LUCKY.x, 0.012, -8.4, 7, 4.5, this.poolMat);
    pool(ROULETTE.x, 1.0, ROULETTE.z, 3.6, 2.2, greenPool);
    pool(BLACKJACK.x, 0.96, BLACKJACK.z + 0.6, 3.0, 2.0, greenPool);
    pool(LOGBOOK.table.x, 0.012, LOGBOOK.table.z, 4, 3.2, this.poolMat);
    pool(CAPTAIN_TABLE.x, 0.97, CAPTAIN_TABLE.z + 0.6, 3.0, 2.0, greenPool);
    pool(FALLS.x, 0.012, FALLS.z + 2.2, 5, 3.4, bluePool);
    for (const t of LOUNGE_TABLES) pool(t.x, 0.77, t.z, 0.9, 0.9, bluePool);

    // Little lamps on the lounge tables.
    const ll = new Batch();
    const lampShade = own(new THREE.MeshStandardMaterial({ color: '#cfe3ff', emissive: new THREE.Color('#9fb7e8'), emissiveIntensity: 0.9, roughness: 0.5 }));
    for (const t of LOUNGE_TABLES) {
      ll.add(new THREE.CylinderGeometry(0.02, 0.05, 0.3, 8), m.brass, t.x, 0.92, t.z);
      ll.add(new THREE.CylinderGeometry(0.08, 0.14, 0.16, 14), lampShade, t.x, 1.12, t.z);
    }
    ll.build(this.group, { cast: false });

    // Festoon strings over the stern deck, from the deckhouse to the masts.
    let fi = 0;
    const string = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number) => {
      const pts: THREE.Vector3[] = [];
      const n = Math.max(6, Math.round(Math.hypot(bx - ax, bz - az) / 0.55));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push(new THREE.Vector3(ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(t * Math.PI) * sag, az + (bz - az) * t));
      }
      lamps.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.012, 4, false), m.trim, 0, 0, 0, 0, 0, 0, '#2a2a2a');
      for (let i = 1; i < n; i++) bulbSpots.push({ p: pts[i].clone().add(new THREE.Vector3(0, -0.07, 0)), color: ['#ffcf7a', '#ff9a6a', '#fff0c0', '#9fd8ff'][(fi + i) % 4], festoon: fi + i });
      fi += n;
    };
    for (const z of [-6, -2, 2, 6]) string(STERN.x0 + 0.1, 5.9, z, 21, 6.3, z > 0 ? 7.5 : -7.5, 0.6);
    string(21, 6.3, -7.5, 21, 6.3, 7.5, 0.9);
    lamps.build(this.group, { cast: false });

    // Every bulb in one instanced mesh, coloured per instance.
    const bulbGeo = own(new THREE.SphereGeometry(0.055, 10, 8));
    this.bulbs = new THREE.InstancedMesh(bulbGeo, m.bulb, bulbSpots.length);
    const mm = new THREE.Matrix4();
    bulbSpots.forEach((s, i) => {
      mm.makeTranslation(s.p.x, s.p.y, s.p.z);
      this.bulbs.setMatrixAt(i, mm);
      const col = new THREE.Color(s.color);
      this.bulbBase.push(col);
      this.bulbs.setColorAt(i, col);
      this.festoon.push(s.festoon ?? -1);
    });
    this.bulbs.instanceMatrix.needsUpdate = true;
    this.bulbs.frustumCulled = false;
    this.group.add(this.bulbs);

    // High tier: Old Lucky's bay, the River Wheel and the lounge get real lights too.
    const bay = new THREE.SpotLight('#ffcf8a', 9, 16, 0.5, 0.8, 1.6);
    bay.position.set(0, 8.2, -5.5);
    bay.target.position.set(0, 1.8, OLD_LUCKY.z + 1);
    this.group.add(bay.target);
    const wheel = new THREE.PointLight('#ffd27a', 5, 10, 1.8);
    wheel.position.set(RIVER_WHEEL.x - 3.6, RIVER_WHEEL.y + 2.4, 0);
    const lounge = new THREE.PointLight('#9fb7e8', 16, 14, 1.6);
    lounge.position.set(-16.5, 3.6, 0);
    this.extra.push(bay as unknown as THREE.PointLight, wheel, lounge);
    this.group.add(bay, wheel, lounge);
  }

  setQuality(t: Tier): void {
    for (const l of this.chandLights) l.visible = t !== 'low';
    for (const l of this.extra) l.visible = t === 'high';
    for (const p of this.pools) p.visible = true;
  }

  /**
   * Chandeliers hide when the camera comes close, so the follow camera never
   * flies through them. `beat` gently pulses the festoons with the music.
   */
  update(t: number, night: number, cam: THREE.Vector3, beat: number): void {
    for (const ch of this.chandeliers) {
      const d = Math.hypot(cam.x - ch.x, cam.z - ch.z);
      ch.group.visible = !(d < 2.4 && cam.y > ch.y - 1.5);
      ch.group.rotation.y = Math.sin(t * 0.3 + ch.x) * 0.04;
    }
    const swell = 1 + this.glow * 0.8;
    for (const l of this.chandLights) l.intensity = 18 * this.dim * swell;
    this.warm.intensity = (0.55 + night * 0.1) * this.dim;
    this.m.bulb.emissiveIntensity = (0.95 + night * 0.35) * (0.6 + 0.4 * this.dim) * swell;
    this.poolMat.opacity = (0.26 + night * 0.12) * this.dim;
    // Festoons chase softly, two bulbs a beat, never faster than 3 flashes a second.
    const col = new THREE.Color();
    const step = Math.floor(beat * 2);
    for (let i = 0; i < this.festoon.length; i++) {
      const f = this.festoon[i];
      if (f < 0) continue;
      const on = (f + step) % 6 < 4;
      col.copy(this.bulbBase[i]).multiplyScalar(on ? 1 : 0.35);
      this.bulbs.setColorAt(i, col);
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.bulbs.dispose();
  }
}
