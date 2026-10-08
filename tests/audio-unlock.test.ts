import { beforeAll, describe, expect, it, vi } from 'vitest';

// A stand-in for the browser's audio context, enough for sfx.ts.
class FakeContext {
  static made: FakeContext[] = [];
  state: string = 'suspended';
  sampleRate = 48000;
  currentTime = 0;
  destination = {};
  resumes = 0;
  blips = 0;
  constructor() {
    FakeContext.made.push(this);
  }
  resume(): Promise<void> {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }
  createGain() {
    const node = { gain: { value: 1, setTargetAtTime() {} }, connect: (n: unknown) => n };
    return node;
  }
  createBuffer(_ch: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    return { buffer: null, connect: (n: unknown) => n, start: () => this.blips++ };
  }
}

const session = { type: 'auto' };
let sfx: typeof import('../src/audio/sfx');

beforeAll(async () => {
  vi.stubGlobal('window', { AudioContext: FakeContext });
  vi.stubGlobal('navigator', { audioSession: session });
  sfx = await import('../src/audio/sfx');
});

describe('audio unlock', () => {
  it('starts audio on the first gesture and plays through silent mode', () => {
    expect(sfx.audioState()).toBe('none');
    sfx.unlockAudio();
    const c = FakeContext.made[0];
    expect(c.resumes).toBe(1);
    expect(c.blips).toBe(1);
    expect(sfx.audioState()).toBe('running');
    expect(session.type).toBe('playback');
  });

  it('leaves running audio alone', () => {
    sfx.unlockAudio();
    expect(FakeContext.made[0].resumes).toBe(1);
  });

  it('brings audio back after iOS interrupts it, or after the page was hidden', () => {
    const c = FakeContext.made[0];
    c.state = 'interrupted';
    sfx.unlockAudio();
    expect(c.resumes).toBe(2);
    sfx.suspendAudio(true);
    expect(sfx.audioState()).toBe('suspended');
    sfx.unlockAudio();
    expect(sfx.audioState()).toBe('running');
    expect(FakeContext.made).toHaveLength(1);
  });

  it('lets other apps play when the volume is all the way down', () => {
    sfx.setVolume(0);
    expect(session.type).toBe('ambient');
    sfx.setVolume(0.6);
    expect(session.type).toBe('playback');
  });
});
