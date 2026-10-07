// The eight lost moons: little glowing moonlets tucked away around the
// galaxy. Five float somewhere you can reach (two of them need a jump), one
// hangs at the edge of the comet loop, and two are found by doing something
// (poking the orrery's tiny black hole, feeding five gold orbs). Four found
// earn a star, all eight another.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COMET_MOON, DOCK_LEDGE, MOONS, RING, RING_SHELF, SIDE_STONE, cometCurve, ringPoint } from '../../shared/galaxy-rules';
import { box, circle, type Collider } from '../../world/physics';
import { HALO_FRAG, HALO_VERT } from './orbs';
import { underside, veinMaterial } from './props';

const UP = new THREE.Vector3(0, 1, 0);

export class Moons {
  readonly pos: (THREE.Vector3 | null)[];
  readonly colliders: Collider[] = [];
  readonly sideStone: Collider;
  private cores: THREE.InstancedMesh;
  private halos: THREE.InstancedMesh;
  private ledges = new THREE.Group();
  private side: THREE.Group;
  private m4 = new THREE.Matrix4();
  private flying: { id: number; t: number; from: THREE.Vector3; to: THREE.Vector3 }[] = [];
  mask = 0;
  stairOpen = false;

  constructor(scene: THREE.Scene, mask: number) {
    this.mask = mask;
    const shelf = ringPoint(RING_SHELF.s, RING_SHELF.r);
    // The comet loop's moon, at its offset across the path.
    const c = cometCurve();
    const a = c.at(COMET_MOON.u);
    const d = c.dir(COMET_MOON.u);
    const f = new THREE.Vector3(d.x, d.y, d.z);
    const right = new THREE.Vector3().crossVectors(f, UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, f).normalize();
    const comet = new THREE.Vector3(a.x, a.y, a.z).addScaledVector(right, COMET_MOON.ox).addScaledVector(up, COMET_MOON.oy);
    this.pos = MOONS.map((m) => {
      if (m.id === 0) return new THREE.Vector3(shelf.x, RING.top + 1.1, shelf.z);
      if (m.id === 3) return comet;
      return m.at ? new THREE.Vector3(m.at.x, m.at.y, m.at.z) : null;
    });

    // Moonlets: a pale cratered core and a soft halo, one draw call each.
    const geo = new THREE.IcosahedronGeometry(0.34, 2);
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
      v.multiplyScalar(1 - Math.max(0, Math.sin(v.x * 21) * Math.sin(v.y * 17) * Math.sin(v.z * 19)) * 0.12);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    this.cores = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#e8e4ff', emissive: new THREE.Color('#b9b0ff'), emissiveIntensity: 0.9, roughness: 0.6, flatShading: true }), 8);
    this.cores.frustumCulled = false;
    this.halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 8);
    this.halos.frustumCulled = false;
    for (let i = 0; i < 8; i++) this.halos.setColorAt(i, new THREE.Color('#c9c2ff'));
    scene.add(this.cores, this.halos);

    // The little places to stand: a shelf off the ring, an ice ledge past the dock.
    const green = veinMaterial('#2a6b58', '#3fb68b', { roughness: 0.4 });
    const ice = veinMaterial('#8fc4e6', '#bfe8ff', { roughness: 0.2 });
    const ledge = (x: number, y: number, z: number, r: number, mat: THREE.Material, seed: number) => {
      const top = new THREE.CylinderGeometry(r, r * 0.85, 0.6, 9).translate(0, -0.3, 0).toNonIndexed();
      top.setAttribute('color', new THREE.BufferAttribute(new Float32Array(top.getAttribute('position').count * 3).fill(0.1), 3));
      const roots = underside(r, 2.5 + r, seed, mat, { top: -0.55, count: 5 });
      const mesh = new THREE.Mesh(mergeGeometries([top, roots.geometry])!, mat);
      roots.geometry.dispose();
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      return mesh;
    };
    this.ledges.add(ledge(shelf.x, RING.top, shelf.z, RING_SHELF.radius, green, 81));
    this.ledges.add(ledge(DOCK_LEDGE.x, DOCK_LEDGE.y, DOCK_LEDGE.z, DOCK_LEDGE.r, ice, 82));
    scene.add(this.ledges);
    this.colliders.push(circle(shelf.x, shelf.z, RING_SHELF.radius, RING.top, 0.3, false), circle(DOCK_LEDGE.x, DOCK_LEDGE.z, DOCK_LEDGE.r, DOCK_LEDGE.y, 0.3, false));
    // A thin bridge of ring stone joins the shelf to the walkway's edge.
    const th = Math.atan2(shelf.z - RING.cz, shelf.x - RING.cx);
    this.colliders.push(box(RING.cx + Math.cos(th) * (RING.outer + 0.4), RING.cz + Math.sin(th) * (RING.outer + 0.4), 0.9, 0.7, Math.PI / 2 - th, RING.top, 0.3, false));
    this.side = new THREE.Group();
    this.side.add(ledge(SIDE_STONE.x, SIDE_STONE.y, SIDE_STONE.z, SIDE_STONE.r, veinMaterial('#2c2232', '#ff8a3d', { roughness: 0.85 }), 83));
    this.side.visible = false;
    scene.add(this.side);
    this.sideStone = circle(SIDE_STONE.x, SIDE_STONE.z, SIDE_STONE.r, SIDE_STONE.y, 0.3, false);
  }

  found(id: number): boolean {
    return (this.mask & (1 << id)) !== 0;
  }

  /** A moon you are touching now (body centre within reach), or -1. Comet and deed moons are found elsewhere. */
  touching(player: THREE.Vector3): number {
    for (let i = 0; i < 8; i++) {
      const p = this.pos[i];
      if (!p || i === 3 || this.found(i)) continue;
      if (i === 7 && !this.stairOpen) continue;
      if (Math.hypot(p.x - player.x, p.y - (player.y + 0.8), p.z - player.z) < 1.15) return i;
    }
    return -1;
  }

  /** Marks a moon found; it rises and flies off into the sky. */
  take(id: number, from: THREE.Vector3): void {
    this.mask |= 1 << id;
    this.flying.push({ id, t: 0, from: from.clone(), to: new THREE.Vector3(-60, 120, 40) });
  }

  extra(): Collider[] {
    return this.stairOpen ? [this.sideStone] : [];
  }

  update(dt: number, time: number): void {
    this.side.visible = this.stairOpen;
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < 8; i++) {
      const p = this.pos[i];
      const fly = this.flying.find((f) => f.id === i);
      let show = !!p && !this.found(i) && (i !== 7 || this.stairOpen);
      if (fly) {
        fly.t += dt;
        const u = Math.min(1, fly.t / 2.2);
        const e = u * u;
        v.lerpVectors(fly.from, fly.to, e);
        v.y += Math.sin(Math.min(1, fly.t * 2) * Math.PI) * 1.5;
        show = u < 1;
        if (u >= 1) this.flying = this.flying.filter((f) => f !== fly);
      } else if (p) v.set(p.x, p.y + Math.sin(time * 1.6 + i) * 0.15, p.z);
      if (!show) continue;
      q.setFromEuler(new THREE.Euler(time * 0.3 + i, time * 0.7, 0));
      sc.setScalar(1);
      this.m4.compose(v, q, sc);
      this.cores.setMatrixAt(n, this.m4);
      q.identity();
      const pulse = 2.2 + Math.sin(time * 3 + i) * 0.25;
      sc.setScalar(pulse);
      this.m4.compose(v, q, sc);
      this.halos.setMatrixAt(n, this.m4);
      n++;
    }
    this.cores.count = this.halos.count = n;
    this.cores.instanceMatrix.needsUpdate = true;
    this.halos.instanceMatrix.needsUpdate = true;
  }
}
