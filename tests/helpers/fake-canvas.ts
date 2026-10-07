// A minimal fake document for Node, so code that paints canvas textures can run
// without a DOM. Every 2D context call is a no-op.

const noop = () => undefined;
const gradient = () => ({ addColorStop: noop });

function fakeContext(canvas: object): CanvasRenderingContext2D {
  const special: Record<string, unknown> = {
    canvas,
    createLinearGradient: gradient,
    createRadialGradient: gradient,
    createConicGradient: gradient,
    createPattern: () => ({ setTransform: noop }),
    measureText: () => ({ width: 0 }),
    getLineDash: () => [],
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }),
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }),
  };
  const store: Record<string | symbol, unknown> = {};
  return new Proxy(store, {
    get(_t, key) {
      if (typeof key === 'string' && key in special) return special[key];
      if (key in store) return store[key];
      return noop;
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function fakeCanvas(): HTMLCanvasElement {
  const c: Record<string, unknown> = { width: 300, height: 150, style: {} };
  const ctx = fakeContext(c);
  c.getContext = () => ctx;
  c.toDataURL = () => 'data:,';
  c.addEventListener = noop;
  c.removeEventListener = noop;
  return c as unknown as HTMLCanvasElement;
}

/** Installs a fake global document (only if none exists) and returns an uninstall function. */
export function installFakeCanvas(): () => void {
  const g = globalThis as { document?: unknown };
  if (g.document) return noop;
  g.document = {
    createElement: (tag: string) => (tag === 'canvas' ? fakeCanvas() : { style: {}, setAttribute: noop, appendChild: noop }),
    createElementNS: (_ns: string, tag: string) => (tag === 'canvas' ? fakeCanvas() : { style: {} }),
  };
  return () => {
    delete g.document;
  };
}
