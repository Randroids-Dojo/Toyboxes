// The sound check: Orbit claps four beats, you clap along on the next eight,
// then hold OK while a light fills. The middle of your claps sets your timing
// offset; the hold tells us whether this device reports a held button (some
// TV remotes do not), and if not, Easy holds turns on.

import * as THREE from 'three';
import { music, type Song } from '../../audio/music';
import type { SongMeta } from '../../shared/neon/songs';
import type { CameraShot, CaptureLabels } from '../../world/space';
import { nova as snd } from './sounds';
import { HEX } from './util';
import type { Mode, Nova } from './world';

const BPM = 100;
const META: SongMeta = { id: 'hello', name: 'Sound check', bpm: BPM, order: [{ name: 'a', bars: 6 }] };
const SONG: Song = {
  name: 'nova-sync',
  bpm: BPM,
  order: ['a'],
  space: 0.3,
  sections: [
    {
      name: 'a',
      bars: 6,
      tracks: [
        { voice: 'kick', pattern: 'x...x...x...x...', gain: 0.8 },
        { voice: 'clap', pattern: 'x...x...x...x...' + '.'.repeat(80), gain: 0.9 },
        { voice: 'hat', pattern: '..x...x...x...x.', gain: 0.5 },
        { voice: 'pad', pattern: 'Fmaj7 Fmaj7 Em7 Em7 Dm7 Cmaj7', every: 16, gain: 0.4 },
        { voice: 'bell', pattern: '.'.repeat(48) + 'C6' + '.'.repeat(15), gain: 0.4 },
      ],
    },
  ],
};

export interface SyncResult {
  offset: number | null;
  holdOk: boolean | null;
  presses: number;
}

/** The middle error, in ms, of presses against the nearest beat. Pure, for the tests. */
export function medianOffset(errorsMs: number[]): number | null {
  if (errorsMs.length < 5) return null;
  const s = [...errorsMs].sort((a, b) => a - b);
  const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return Math.max(-60, Math.min(300, Math.round(m)));
}

export class SyncMode implements Mode {
  readonly kind = 'sync';
  private errors: number[] = [];
  private holdDown: number | null = null;
  private holdOk: boolean | null = null;
  private el: HTMLElement;
  private ringEl: HTMLElement;
  private textEl: HTMLElement;
  private dotsEl: HTMLElement;
  private fillEl: HTMLElement;
  private lastBeat = -1;
  private done = false;
  private t = 0;
  private wasPaused = false;

  constructor(
    private nova: Nova,
    private onDone: (r: SyncResult) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'nova-sync';
    this.ringEl = document.createElement('div');
    this.ringEl.className = 'ring';
    this.fillEl = document.createElement('i');
    this.ringEl.appendChild(this.fillEl);
    this.textEl = document.createElement('b');
    this.dotsEl = document.createElement('div');
    this.dotsEl.className = 'dots';
    const labels = document.createElement('div');
    labels.className = 'labels';
    labels.innerHTML = '<span>Early</span><span>Late</span>';
    this.el.append(this.textEl, this.ringEl, this.dotsEl, labels);
    nova.layer.appendChild(this.el);
    this.textEl.textContent = 'Listen to Orbit';
    music.stop(0.05);
    // The clock is offset free here: we are measuring the offset.
    nova.clock.inputOffset = 0;
    music.play(SONG, { fadeIn: 0.05 });
    nova.clock.start(META, music.playing === SONG.name ? SONG.name : null, 120);
    nova.rin.setActive(true);
    nova.ctx.pose(null);
  }

  capture(): CaptureLabels | null {
    return this.done ? null : { action: null, kick: null, jump: null };
  }

  holds(): boolean {
    return !this.done;
  }

  step(h: number): void {
    this.nova.hud.update(h);
  }

  frame(dt: number, now: number, paused: boolean): void {
    const n = this.nova;
    this.t += dt;
    if (paused !== this.wasPaused) {
      this.wasPaused = paused;
      if (paused) n.clock.pause(now);
      else n.clock.resume(now);
    }
    if (paused || this.done) return;
    n.rin.poll(now);
    const beat = n.clock.beatAt(now);
    for (const e of n.rin.take()) {
      const b = n.clock.song ? n.clock.beatAt(e.at) : 0;
      if (e.down) {
        if (b > 3.5 && b < 11.5) {
          const near = Math.round(b);
          if (near >= 4 && near <= 11) {
            const errMs = ((b - near) * 60000) / BPM;
            this.errors.push(errMs);
            const dot = document.createElement('i');
            dot.style.left = `${50 + Math.max(-45, Math.min(45, errMs / 3))}%`;
            dot.style.background = Math.abs(errMs) < 45 ? HEX.lime : Math.abs(errMs) < 90 ? HEX.cyan : HEX.gold;
            this.dotsEl.appendChild(dot);
            n.floor.flash(0xb49cff, 0.6);
            snd.hit(Math.abs(errMs) < 45 ? 'P' : 'G');
            n.dancer.play('clap', 0.4);
            n.ctx.pose(n.dancer.pose);
          }
        } else if (b >= 11.5 && b < 14.5 && this.holdDown === null) {
          this.holdDown = e.at;
          snd.hold();
        }
      } else if (this.holdDown !== null && this.holdOk === null) {
        const held = (e.at - this.holdDown) / 1000;
        this.holdOk = held > 0.5;
      }
    }
    // The hold light fills while held.
    if (beat >= 12 && beat < 15) {
      const k = this.holdDown !== null && this.holdOk === null && n.rin.holding ? Math.min(1, (beat - 12) / 2) : this.holdOk ? 1 : 0;
      this.fillEl.style.transform = `scaleY(${k.toFixed(3)})`;
      if (k >= 1 && this.holdOk === null) {
        this.holdOk = true;
        snd.pose();
      }
    }
    const bi = Math.floor(beat);
    if (bi !== this.lastBeat && bi >= 0) {
      this.lastBeat = bi;
      this.ringEl.classList.remove('pulse');
      void this.ringEl.offsetWidth;
      this.ringEl.classList.add('pulse');
      if (bi < 4) {
        this.textEl.textContent = 'Listen to Orbit';
      } else if (bi < 12) this.textEl.textContent = `Clap on the beat! ${12 - bi}`;
      else if (bi < 15) this.textEl.textContent = 'Now hold it down!';
      if (bi === 4) n.hint('hint-clap', 'Press on every beat');
      if (bi >= 16) this.finish();
    }
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    music.stop(0.6);
    this.nova.clock.stop();
    this.nova.rin.setActive(false);
    this.onDone({ offset: medianOffset(this.errors), holdOk: this.holdDown === null ? null : (this.holdOk ?? false), presses: this.errors.length });
  }

  shot(dt: number): CameraShot | null {
    void dt;
    // Face the player, a little above, like a mirror.
    const p = this.nova.player();
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const target = new THREE.Vector3(p.x, 1.1, p.z);
    return { position: new THREE.Vector3(p.x + fx * 3.6 + fz * 0.8, 2.1, p.z + fz * 3.6 - fx * 0.8), target, blend: Math.min(1, this.t * 2.5) };
  }

  info(): Record<string, unknown> {
    const c = this.nova.clock;
    const now = performance.now();
    return { beat: c.running ? c.beatAt(now) : null, presses: this.errors.length, errors: this.errors, holdOk: this.holdOk, beats: c.running ? Array.from({ length: 16 }, (_, i) => c.perfOf((i * 60) / BPM)) : [] };
  }

  dispose(): void {
    this.el.remove();
    this.nova.rin.setActive(false);
    if (!this.done) music.stop(0.3);
  }
}
