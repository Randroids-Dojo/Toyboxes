// Every moving thing in the village drawn in a couple of draw calls: one
// BatchedMesh of toon parts (people, pigeons, ducks, tins, cups, gnomes...)
// with an optional matching outline batch, one instanced face atlas and one
// instanced set of blob shadows.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blobTexture } from '../../world/kit';
import { outline, toon } from './palette';
import { faceAtlas, FACES, type Face } from './textures';

const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();

/** Prepares a geometry for the batch: indexed, position + normal + color only. */
export function prep(geo: THREE.BufferGeometry, color = 0xffffff): THREE.BufferGeometry {
  let g = geo.index ? geo : mergeVertices(geo);
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) {
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    tmpC.setHex(color);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = tmpC.r;
      arr[i * 3 + 1] = tmpC.g;
      arr[i * 3 + 2] = tmpC.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  if (!g.index) g = mergeVertices(g);
  return g;
}

/** Merges coloured pieces into one batch geometry: [geometry, colour, matrix?]. */
export function compound(parts: [THREE.BufferGeometry, number, THREE.Matrix4?][]): THREE.BufferGeometry {
  const list = parts.map(([g, c, m]) => {
    const p = prep(g.clone(), c);
    if (m) p.applyMatrix4(m);
    return p;
  });
  return prep(mergeGeometries(list, false)!);
}

export function at(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

export class Figures {
  readonly group = new THREE.Group();
  readonly mesh: THREE.BatchedMesh;
  private line: THREE.BatchedMesh | null = null;
  private lineMat: THREE.MeshBasicMaterial;
  private geos = new Map<string, number>();
  private lineGeos = new Map<string, number>();
  private kinds: string[] = [];
  private faceMesh: THREE.InstancedMesh;
  private faceCell: THREE.InstancedBufferAttribute;
  private faceUsed = 0;
  private blobs: THREE.InstancedMesh;
  private blobUsed = 0;
  private outlined = false;
  private caps: { vertices: number; indices: number };
  private sources = new Map<string, THREE.BufferGeometry>();
  private colors: number[] = [];
  private matrices: THREE.Matrix4[] = [];
  private visible: boolean[] = [];
  private noOutline = new Set<number>();

  constructor(parent: THREE.Object3D, opts: { instances: number; vertices: number; indices: number; faces: number; blobs: number }) {
    const mat = toon({ vertexColors: true, rim: 0.28 });
    this.caps = { vertices: opts.vertices, indices: opts.indices };
    this.mesh = new THREE.BatchedMesh(opts.instances, opts.vertices, opts.indices, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.perObjectFrustumCulled = true;
    this.mesh.sortObjects = false;
    this.group.add(this.mesh);
    this.lineMat = outline(0.02);
    // Faces.
    const fg = new THREE.SphereGeometry(1.012, 14, 10, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.72, 1.45);
    const fm = toon({ map: faceAtlas(), transparent: false, rim: 0 });
    fm.alphaTest = 0.5;
    fm.polygonOffset = true;
    fm.polygonOffsetFactor = -2;
    fm.polygonOffsetUnits = -2;
    this.faceCell = new THREE.InstancedBufferAttribute(new Float32Array(opts.faces), 1);
    fg.setAttribute('aCell', this.faceCell);
    fm.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aCell;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv = vMapUv * vec2(0.25, 0.5) + vec2(mod(aCell, 4.0) * 0.25, 1.0 - (floor(aCell / 4.0) + 1.0) * 0.5);');
    };
    fm.customProgramCacheKey = () => 'puff-face';
    this.faceMesh = new THREE.InstancedMesh(fg, fm, opts.faces);
    this.faceMesh.count = 0;
    this.faceMesh.frustumCulled = false;
    this.group.add(this.faceMesh);
    // Blob shadows.
    const bg = new THREE.PlaneGeometry(1, 1);
    bg.rotateX(-Math.PI / 2);
    const bm = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.blobs = new THREE.InstancedMesh(bg, bm, opts.blobs);
    this.blobs.count = 0;
    this.blobs.renderOrder = 2;
    this.blobs.frustumCulled = false;
    this.group.add(this.blobs);
    parent.add(this.group);
  }

  /** Registers a part shape once (built lazily). */
  geo(name: string, make: () => THREE.BufferGeometry): string {
    if (!this.geos.has(name)) {
      const g = prep(make());
      this.sources.set(name, g);
      this.geos.set(name, this.mesh.addGeometry(g));
      if (this.line) this.lineGeos.set(name, this.line.addGeometry(g));
    }
    return name;
  }

  /** A new instance of a registered shape. */
  add(name: string, color = 0xffffff, opts: { outline?: boolean } = {}): number {
    const gid = this.geos.get(name);
    if (gid === undefined) throw new Error(`No figure part ${name}`);
    const id = this.mesh.addInstance(gid);
    this.mesh.setColorAt(id, tmpC.setHex(color));
    this.kinds[id] = name;
    this.colors[id] = color;
    this.matrices[id] = new THREE.Matrix4();
    this.visible[id] = true;
    if (opts.outline === false) this.noOutline.add(id);
    if (this.line) this.addLine(id);
    return id;
  }

  private addLine(id: number): void {
    const line = this.line!;
    const gid = this.lineGeos.get(this.kinds[id])!;
    const lid = line.addInstance(gid);
    if (lid !== id) throw new Error('Outline batch out of step');
    line.setVisibleAt(lid, !this.noOutline.has(id) && this.visible[id]);
  }

  set(id: number, m: THREE.Matrix4): void {
    this.mesh.setMatrixAt(id, m);
    this.matrices[id].copy(m);
    if (this.outlined) this.line!.setMatrixAt(id, m);
  }

  color(id: number, c: number): void {
    if (this.colors[id] === c) return;
    this.colors[id] = c;
    this.mesh.setColorAt(id, tmpC.setHex(c));
  }

  show(id: number, on: boolean): void {
    if (this.visible[id] === on) return;
    this.visible[id] = on;
    this.mesh.setVisibleAt(id, on);
    if (this.outlined) this.line!.setVisibleAt(id, on && !this.noOutline.has(id));
  }

  /** Outlines on medium and high. Built the first time they are wanted. */
  setOutlines(on: boolean, thickness = 0.02): void {
    (this.lineMat.userData.thickness as { value: number }).value = thickness;
    if (on && !this.line) {
      this.line = new THREE.BatchedMesh(this.mesh.maxInstanceCount, this.caps.vertices, this.caps.indices, this.lineMat);
      this.line.frustumCulled = false;
      this.line.perObjectFrustumCulled = true;
      this.line.sortObjects = false;
      for (const [name, g] of this.sources) this.lineGeos.set(name, this.line.addGeometry(g));
      for (let id = 0; id < this.kinds.length; id++) {
        if (this.kinds[id] === undefined) continue;
        this.addLine(id);
        this.line.setMatrixAt(id, this.matrices[id]);
      }
      this.group.add(this.line);
    }
    this.outlined = on;
    if (this.line) {
      this.line.visible = on;
      if (on) for (let id = 0; id < this.kinds.length; id++) if (this.kinds[id] !== undefined) {
        this.line.setMatrixAt(id, this.matrices[id]);
        this.line.setVisibleAt(id, this.visible[id] && !this.noOutline.has(id));
      }
    }
  }

  // ---- faces

  face(): number {
    const i = this.faceUsed++;
    this.faceMesh.count = this.faceUsed;
    return i;
  }

  setFace(i: number, m: THREE.Matrix4, f: Face): void {
    this.faceMesh.setMatrixAt(i, m);
    const cell = FACES.indexOf(f);
    if (this.faceCell.array[i] !== cell) {
      this.faceCell.array[i] = cell;
      this.faceCell.needsUpdate = true;
    }
    this.faceMesh.instanceMatrix.needsUpdate = true;
  }

  hideFace(i: number): void {
    this.faceMesh.setMatrixAt(i, tmpM.makeScale(0, 0, 0));
    this.faceMesh.instanceMatrix.needsUpdate = true;
  }

  // ---- blob shadows

  blob(): number {
    const i = this.blobUsed++;
    this.blobs.count = this.blobUsed;
    return i;
  }

  setBlob(i: number, x: number, y: number, z: number, size: number): void {
    this.blobs.setMatrixAt(i, tmpM.compose(new THREE.Vector3(x, y + 0.045, z), new THREE.Quaternion(), new THREE.Vector3(size, 1, size)));
    this.blobs.instanceMatrix.needsUpdate = true;
  }

  setBlobOpacity(o: number): void {
    (this.blobs.material as THREE.MeshBasicMaterial).opacity = o;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.mesh.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.line?.dispose();
    this.lineMat.dispose();
    this.faceMesh.geometry.dispose();
    (this.faceMesh.material as THREE.MeshToonMaterial).map?.dispose();
    (this.faceMesh.material as THREE.Material).dispose();
    this.faceMesh.dispose();
    this.blobs.geometry.dispose();
    (this.blobs.material as THREE.Material).dispose();
    this.blobs.dispose();
    for (const g of this.sources.values()) g.dispose();
  }
}
