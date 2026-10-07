// The beat clock: one mapping from performance.now() to the song time being
// heard, shared by the dance, the duels, laser tag and every beat-driven
// visual. It follows the audio clock (music.beat(), corrected for output
// latency) with smoothing, because the audio clock moves in coarse steps on
// some devices, and keeps running on its own when audio is muted, blocked or
// stalled, so silent play still works.

import { music } from '../../audio/music';
import { beatToSec, bpmAt, secToBeat, type SongMeta } from '../../shared/neon/songs';

/** How far apart the two clocks may drift before we snap instead of easing. */
const SNAP = 0.08;
/** How much of the drift to take each sync. */
const EASE = 0.06;

export class BeatClock {
  song: SongMeta | null = null;
  /** Name of the music Song this clock follows (null runs free). */
  private follow: string | null = null;
  private anchorPerf = 0;
  private anchorSec = 0;
  private pausedSec: number | null = null;
  private lastMeasured = -1;
  private lastChange = 0;
  private stalled = false;
  private synced = false;
  /** Player timing offset: presses are judged this many ms earlier (positive for players who press late). */
  inputOffset = 0;
  /** Display offset: visuals are drawn this many ms ahead. */
  videoOffset = 0;

  /**
   * Starts timing a song whose first beat is heard `leadMs` from now. Pass the
   * music Song's name so the clock can follow the audio once it plays.
   */
  start(song: SongMeta, followName: string | null, leadMs = 120, now = performance.now()): void {
    this.song = song;
    this.follow = followName;
    this.anchorPerf = now + leadMs;
    this.anchorSec = 0;
    this.pausedSec = null;
    this.lastMeasured = -1;
    this.lastChange = now;
    this.stalled = false;
    this.synced = false;
  }

  stop(): void {
    this.song = null;
    this.follow = null;
    this.pausedSec = null;
  }

  get running(): boolean {
    return !!this.song;
  }

  get paused(): boolean {
    return this.pausedSec !== null;
  }

  /** Whether the clock is locked to audible music right now. */
  get audible(): boolean {
    return this.synced && !this.stalled;
  }

  /** Call once per frame. */
  sync(now = performance.now()): void {
    if (!this.song || this.pausedSec !== null || !this.follow) return;
    if (music.playing !== this.follow || music.isPaused) return;
    const b = music.beat();
    if (b < 0) return;
    // The audio clock can freeze (a suspended context, a blocked autoplay):
    // then we run free and pick the music up again when it moves.
    if (Math.abs(b - this.lastMeasured) > 1e-6) {
      this.lastMeasured = b;
      this.lastChange = now;
      if (this.stalled) {
        this.stalled = false;
        this.synced = false;
      }
    } else if (now - this.lastChange > 250) {
      this.stalled = true;
      return;
    }
    const measured = beatToSec(this.song, b);
    const err = measured - this.secAt(now);
    if (!this.synced || Math.abs(err) > SNAP) {
      this.anchorPerf = now;
      this.anchorSec = measured;
      this.synced = true;
      return;
    }
    // Ease toward the audio clock without jumps.
    this.anchorSec = this.secAt(now) + err * EASE;
    this.anchorPerf = now;
  }

  /** Song seconds being heard at a performance.now() time. */
  secAt(perf: number): number {
    if (this.pausedSec !== null) return this.pausedSec;
    return this.anchorSec + (perf - this.anchorPerf) / 1000;
  }

  /** Song seconds a press at `perf` is judged at, after the player's offset. */
  judgeSec(perf: number): number {
    return this.secAt(perf - this.inputOffset);
  }

  /** Song seconds to draw for a frame at `perf`. */
  drawSec(perf = performance.now()): number {
    return this.secAt(perf + this.videoOffset);
  }

  beatAt(perf = performance.now()): number {
    return this.song ? secToBeat(this.song, this.secAt(perf)) : 0;
  }

  drawBeat(perf = performance.now()): number {
    return this.song ? secToBeat(this.song, this.drawSec(perf)) : 0;
  }

  bpm(perf = performance.now()): number {
    return this.song ? bpmAt(this.song, this.beatAt(perf)) : 120;
  }

  /** The performance.now() time a song second will be heard (for scripted playtests). */
  perfOf(sec: number): number {
    return this.anchorPerf + (sec - this.anchorSec) * 1000 + this.inputOffset;
  }

  /** Holds the clock (and the music) where it is. */
  pause(now = performance.now()): void {
    if (!this.song || this.pausedSec !== null) return;
    this.pausedSec = this.secAt(now);
    if (this.follow && music.playing === this.follow) music.pause();
  }

  /** Carries on from the held time; the music restarts with it. */
  resume(now = performance.now()): void {
    if (this.pausedSec === null) return;
    this.anchorSec = this.pausedSec;
    this.anchorPerf = now + 80;
    this.pausedSec = null;
    this.synced = false;
    this.lastChange = now;
    if (this.follow && music.playing === this.follow) music.resume();
  }

  /** Distance in seconds from a press to the nearest beat (positive late). */
  beatError(perf: number): number {
    if (!this.song) return 1;
    const b = secToBeat(this.song, this.judgeSec(perf));
    const near = Math.round(b);
    return beatToSec(this.song, b) - beatToSec(this.song, near);
  }
}
