import { expect, it } from 'vitest';
import { danceHit, targetInAim } from '../src/shared/neon';
it('laser aiming rejects rear targets and targets outside range',()=>{
 expect(targetInAim(0,0,Math.PI,0,-5,12,.965)).toBe(true);
 expect(targetInAim(0,0,Math.PI,0,5,12,.965)).toBe(false);
 expect(targetInAim(0,0,Math.PI,0,-13,12,.965)).toBe(false);
});
it('dance timing needs the right panel, beat window and a fresh beat',()=>{
 expect(danceHit(1,-3,1,-1)).toBe(0);
 expect(danceHit(1,3,1,-1)).toBe(null);
 expect(danceHit(.3,-3,1,-1)).toBe(null);
 expect(danceHit(1,-3,1,0)).toBe(null);
 expect(danceHit(2.5,3,-4,0)).toBe(1);
});
