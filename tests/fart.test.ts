import {describe,it,expect} from 'vitest';
import {puffPressure,puffReach,puffHit} from '../src/shared/fart';
describe('cartoon puff challenge',()=>{
 it('cycles pressure and clamps reach to a playable range',()=>{expect(puffPressure(0)).toBeCloseTo(0);expect(puffPressure(1.2)).toBeCloseTo(1);expect(puffPressure(2.4)).toBeCloseTo(0);expect(puffReach(-1)).toBe(2);expect(puffReach(2)).toBe(10);});
 it('requires the endpoint to reach the hoop, including direction and pressure',()=>{const t={x:0,z:-6};expect(puffHit(0,0,Math.PI,.5,t)).toBe(true);expect(puffHit(0,0,0,.5,t)).toBe(false);expect(puffHit(0,0,Math.PI,0,t)).toBe(false);expect(puffHit(0,0,Math.PI,1,t)).toBe(false);});
});
