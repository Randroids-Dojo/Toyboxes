// Little Puffington's look: the palette, the three-step toon ramp, the toon
// material with a soft rim, inverted-hull outlines and the painted
// architecture material (vertex colours carry the baked shading).

import * as THREE from 'three';

export const C = {
  sky: 0x7ec8f2,
  haze: 0xfce9c8,
  grass: 0x9ccb6b,
  grassShade: 0x6fa35a,
  flowerY: 0xffd45c,
  flowerP: 0xff8fb1,
  path: 0xe9d3a8,
  grout: 0xc9ae80,
  cream: 0xfff1d6,
  butter: 0xffe29a,
  blush: 0xf9c6b8,
  mint: 0xcdebd3,
  timber: 0x6b4a3a,
  terracotta: 0xd9663f,
  slate: 0x6c7fa8,
  moss: 0x7f9f5a,
  brass: 0xf2b33d,
  brassHi: 0xffe7a3,
  ink: 0x2b1d3a,
  lilac: 0x6e5a9e,
  stone: 0xe8dcc8,
  stoneDark: 0xb9a98f,
  hedge: 0x5f9a4e,
  hedgeDark: 0x47803d,
  leaf: 0x6fae55,
  water: 0x7fd3e8,
  tomato: 0xe8574a,
  bean: 0x6fbf3b,
  gold: 0xffd24a,
  white: 0xffffff,
};

export const BUNTING = [0xe8574a, 0xffd45c, 0x4aa3df, 0x3fb68b, 0xf58a6b, 0x8a6bd1];

export const SKIN = [0xffd9b8, 0xf2c19a, 0xd9a07a, 0xa8714f, 0x7a4e36, 0xffe0c9];

let ramp: THREE.DataTexture | null = null;

/** Three soft steps: shadow (lilac-tinted by the hemisphere), mid, lit. */
export function toonRamp(): THREE.DataTexture {
  if (ramp) return ramp;
  const data = new Uint8Array([110, 110, 110, 255, 185, 185, 185, 255, 255, 255, 255, 255]);
  ramp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
}

/** Toon material with an optional fresnel rim (medium and high). */
export function toon(opts: { color?: number; vertexColors?: boolean; rim?: number; emissive?: number; map?: THREE.Texture | null; transparent?: boolean } = {}): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: opts.color ?? 0xffffff, gradientMap: toonRamp(), vertexColors: opts.vertexColors ?? false, emissive: opts.emissive ?? 0x000000, map: opts.map ?? null, transparent: opts.transparent ?? false });
  const rim = { value: opts.rim ?? 0.35 };
  m.userData.rim = rim;
  m.onBeforeCompile = (s) => {
    s.uniforms.uRim = rim;
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim;')
      .replace(
        '#include <opaque_fragment>',
        `{ float fres = pow(1.0 - abs(dot(normalize(-vViewPosition), normal)), 3.0);
           outgoingLight += vec3(1.0, 0.95, 0.85) * fres * uRim; }
         #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'puff-toon';
  return m;
}

/** Back-face hull outlines in deep plum; works with instancing and batching. */
export function outline(thickness = 0.022): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide });
  const th = { value: thickness };
  m.userData.thickness = th;
  m.onBeforeCompile = (s) => {
    s.uniforms.uThick = th;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uThick;').replace('#include <begin_vertex>', 'vec3 transformed = vec3(position) + normalize(normal) * uThick;');
  };
  m.customProgramCacheKey = () => 'puff-outline';
  return m;
}

/** Painted architecture: vertex colours carry the colour and baked shading. */
export function painted(map: THREE.Texture | null = null, opts: { rough?: number; metal?: number; emissive?: number; emissiveIntensity?: number } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: opts.rough ?? 0.82, metalness: opts.metal ?? 0, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1 });
}

export function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

export function mix(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}
