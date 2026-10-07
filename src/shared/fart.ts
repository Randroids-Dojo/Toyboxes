// Cartoon puff challenge rules. Round points stay local.
export const PUFF_SECONDS = 30;
export const PUFF_GOAL = 5;
export const PUFF_TARGETS = [{x:-3,z:-3},{x:3,z:-5},{x:0,z:-6},{x:-5,z:0},{x:5,z:0}];
export function puffPressure(time:number):number {
  const phase=((time%2.4)+2.4)%2.4/1.2;
  return phase<=1?phase:2-phase;
}
export function puffReach(power:number):number {return 2+8*Math.max(0,Math.min(1,power));}
export function puffEnd(x:number,z:number,yaw:number,power:number) {
  const reach=puffReach(power);
  return {x:x+Math.sin(yaw)*reach,z:z+Math.cos(yaw)*reach};
}
export function puffHit(x:number,z:number,yaw:number,power:number,target:{x:number;z:number}):boolean {
  const end=puffEnd(x,z,yaw,power);
  return Math.hypot(end.x-target.x,end.z-target.z)<=1.25;
}
