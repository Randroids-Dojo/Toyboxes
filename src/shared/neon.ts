// Local round rules. No persistent or shared scores.
export const NEON_TAG_SECONDS = 24;
export const NEON_DANCE_SECONDS = 21;
export const NEON_BEAT = 1.5;
export const NEON_TILES = [{ x: -3, z: 1, name: 'Pink' }, { x: 3, z: 1, name: 'Blue' }, { x: -3, z: -4, name: 'Gold' }, { x: 3, z: -4, name: 'Green' }];
export function targetInAim(px: number, pz: number, yaw: number, tx: number, tz: number, range: number, cone: number): boolean {
  const dx = tx - px, dz = tz - pz, d = Math.hypot(dx, dz);
  return d <= range && (d < 0.01 || (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d >= cone);
}
export function danceCue(time: number): { tile: number; beat: number; ready: boolean } {
  const beat = Math.floor(time / NEON_BEAT);
  return { tile: [0, 3, 1, 2][beat % 4], beat, ready: time % NEON_BEAT >= 0.85 && time % NEON_BEAT <= 1.4 };
}
export function danceHit(time: number, x: number, z: number, lastBeat: number): number | null {
  const cue = danceCue(time), tile = NEON_TILES[cue.tile];
  return cue.ready && cue.beat !== lastBeat && Math.hypot(x - tile.x, z - tile.z) < 1.8 ? cue.beat : null;
}
