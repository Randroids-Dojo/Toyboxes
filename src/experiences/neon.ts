// Neon space party: laser tag, glowing batons and a floor-panel dance final.
import * as THREE from 'three';
import { h } from '../ui/ui';
import { disposeTree } from '../world/kit';
import { box, type Collider } from '../world/physics';
import type { PlayerState, SpaceAction, SpaceView } from '../world/space';
import type { ExperienceCtx } from './common';
import { danceCue, danceHit, targetInAim, NEON_TILES, NEON_TAG_SECONDS, NEON_DANCE_SECONDS } from '../shared/neon';

const COLORS = [0xff48c4, 0x49d9ff, 0xffd04d, 0x54f8a9];
export class NeonParty implements SpaceView {
  readonly scene = new THREE.Scene();
  readonly indoor = false;
  readonly door = { x: -7, z: 7 };
  readonly arrival = { x: 0, z: 6, yaw: Math.PI };
  readonly lectern = null;
  readonly chest = null;
  readonly areaDoors = [];
  readonly exhibitSpots = [];
  readonly colliders: Collider[] = [];
  readonly sun = new THREE.DirectionalLight(0xbcb0ff, 2);
  private hud: HTMLElement;
  private tiles: THREE.Mesh[] = [];
  private drones: { mesh: THREE.Group; cooldown: number }[] = [];
  private beams: { mesh: THREE.Mesh; life: number }[] = [];
  private baton = new THREE.Group();
  private state: 'idle' | 'tag' | 'dance' | 'result' = 'idle';
  private elapsed = 0;
  private clock = 0;
  private points = 0;
  private tags = 0;
  private dances = 0;
  private lastBeat = -1;
  private fireWait = 0;
  private swing = 0;
  private feedback = 'Start at the glowing launch pad';
  private danceSeconds = NEON_DANCE_SECONDS;
  private tagSeconds = NEON_TAG_SECONDS;

  constructor(ctx: ExperienceCtx) {
    this.scene.background = new THREE.Color(0x100825);
    this.scene.add(new THREE.HemisphereLight(0xb8b0ff, 0x19112d, 2.5));
    this.sun.position.set(6, 12, 8); this.scene.add(this.sun);
    const mesh = (g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, glow = false) => {
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, emissive: glow ? color : 0, emissiveIntensity: glow ? 0.75 : 0, roughness: 0.4 }));
      m.position.set(x, y, z); this.scene.add(m); return m;
    };
    mesh(new THREE.BoxGeometry(18, 0.4, 18), 0x221442, 0, -0.2, 0);
    for (const [x, z, hw, hd] of [[-9,0,0.2,9],[9,0,0.2,9],[0,-9,9,0.2],[0,9,9,0.2]]) {
      this.colliders.push(box(x, z, hw, hd));
      mesh(new THREE.BoxGeometry(hw*2, 0.35, hd*2), 0x8246df, x, 0.18, z, true);
    }
    for (let i=0; i<4; i++) {
      const tile=NEON_TILES[i];
      this.tiles.push(mesh(new THREE.BoxGeometry(3.4,0.08,3.4), COLORS[i],tile.x,0.08,tile.z,true));
      const drone=new THREE.Group();
      const body=new THREE.Mesh(new THREE.SphereGeometry(0.52,16,12),new THREE.MeshStandardMaterial({color:COLORS[i],emissive:COLORS[i],emissiveIntensity:0.45}));
      drone.add(body);
      const visor=new THREE.Mesh(new THREE.BoxGeometry(0.75,0.15,0.22),new THREE.MeshBasicMaterial({color:0xffffff}));
      visor.position.set(0,0.12,0.46); drone.add(visor);
      this.scene.add(drone); this.drones.push({mesh:drone,cooldown:0});
    }
    const launch=mesh(new THREE.CylinderGeometry(1.1,1.1,0.1,32),0xe1faff,0,0.08,6,true);
    launch.name='Launch pad';
    const exit=mesh(new THREE.TorusGeometry(1,0.15,8,32),0x54f8a9,-7,1.3,7,true); exit.rotation.y=Math.PI/4;
    const disco=mesh(new THREE.IcosahedronGeometry(0.9,1),0xffffff,0,5,-1,true); disco.name='Disco ball';
    // Stars and distant planets stay beyond the floor, away from player contact.
    for(let i=0;i<80;i++) mesh(new THREE.SphereGeometry(0.045,4,3),0xc9b6ff,Math.sin(i*7)*35,4+(i%15),-15-Math.cos(i*4)*15,true);
    mesh(new THREE.SphereGeometry(3,24,16),0x803fcb,-16,7,-24);
    mesh(new THREE.TorusGeometry(4.8,0.1,8,48),0xff48c4,-16,7,-24,true).rotation.x=1.1;
    const grip=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,0.35,8),new THREE.MeshStandardMaterial({color:0x22293e}));
    const blade=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,1.25,8),new THREE.MeshBasicMaterial({color:0x54f8a9}));
    blade.position.y=0.8; this.baton.add(grip,blade); this.scene.add(this.baton);
    this.hud=h('div',{class:'neon-hud'}); ctx.ui.hud.appendChild(this.hud); this.show();
  }
  private start() {
    this.state='tag'; this.elapsed=0; this.points=0; this.tags=0; this.dances=0; this.lastBeat=-1;
    this.feedback='Face a drone. Tag with Action or swing with Kick';
    for(const d of this.drones) d.cooldown=0;
    this.show();
  }
  actions(p: PlayerState): SpaceAction[] {
    if(Math.hypot(p.x-this.door.x,p.z-this.door.z)<2) return [];
    if(this.state==='idle'||this.state==='result') return [{x:0,z:6,range:1.8,label:'Start a neon party',short:'Start',run:()=>this.start()}];
    return [{x:p.x,z:p.z,range:0.2,label:this.state==='tag'?'Fire a laser tag': 'Dance on the beat',short:this.state==='tag'?'Tag':'Dance',run:()=>this.state==='tag'?this.tag(p,false):this.dance(p)}];
  }
  kickAction(p: PlayerState) {
    if(this.state==='tag') return {label:'Swing glowing baton',run:()=>this.tag(p,true)};
    if(this.state==='dance') return {label:'Dance',run:()=>this.dance(p)};
    return null;
  }
  private tag(p: PlayerState, close: boolean) {
    if(this.fireWait>0) return;
    this.fireWait=close?0.45:0.3; this.swing=close?0.3:0;
    const candidates=this.drones.filter(d=>d.cooldown<=0&&targetInAim(p.x,p.z,p.yaw,d.mesh.position.x,d.mesh.position.z,close?2.4:12,close?-0.1:0.965));
    candidates.sort((a,b)=>a.mesh.position.distanceToSquared(new THREE.Vector3(p.x,1,p.z))-b.mesh.position.distanceToSquared(new THREE.Vector3(p.x,1,p.z)));
    const hit=candidates[0];
    const end=hit?hit.mesh.position.clone():new THREE.Vector3(p.x+Math.sin(p.yaw)*10,1.2,p.z+Math.cos(p.yaw)*10);
    const from=new THREE.Vector3(p.x,1.2,p.z), delta=end.clone().sub(from);
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,delta.length(),6),new THREE.MeshBasicMaterial({color:close?0x54f8a9:0x49d9ff}));
    beam.position.copy(from.add(end).multiplyScalar(0.5)); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
    this.scene.add(beam); this.beams.push({mesh:beam,life:0.18});
    if(hit) { hit.cooldown=1.3; this.points+=close?15:10; this.tags++; this.feedback=close?'Baton tag! +15':'Laser tag! +10'; }
    else this.feedback='Miss. Face a drone and try again';
    this.show();
  }
  private dance(p: PlayerState) {
    const beat=danceHit(this.elapsed,p.x,p.z,this.lastBeat);
    if(beat!==null) {this.lastBeat=beat;this.points+=20;this.dances++;this.feedback='Perfect glow step! +20';}
    else this.feedback='Move onto the named panel, then dance when it says NOW';
    this.show();
  }
  step(dt: number,p: PlayerState) {
    this.clock+=dt; this.fireWait=Math.max(0,this.fireWait-dt); this.swing=Math.max(0,this.swing-dt);
    this.baton.position.set(p.x+0.45,0.9,p.z); this.baton.rotation.z=this.swing>0?-1.4:0.2; this.baton.rotation.y=p.yaw;
    for(let i=0;i<this.drones.length;i++) {
      const d=this.drones[i]; d.cooldown=Math.max(0,d.cooldown-dt); d.mesh.visible=d.cooldown<=0;
      d.mesh.position.set(Math.sin(this.clock*0.55+i*1.7)*5,1.3+Math.sin(this.clock*2+i)*0.25,-2+Math.cos(this.clock*0.4+i*1.7)*4);
      d.mesh.rotation.y=this.clock+i;
    }
    for(const b of this.beams) {b.life-=dt;if(b.life<=0){this.scene.remove(b.mesh);disposeTree(b.mesh);}}
    this.beams=this.beams.filter(b=>b.life>0);
    if(this.state==='tag'||this.state==='dance') {
      this.elapsed+=dt;
      if(this.state==='tag'&&this.elapsed>=this.tagSeconds) {this.state='dance';this.elapsed=0;this.feedback='Dance final! Follow the lit panel and wait for NOW';}
      else if(this.state==='dance'&&this.elapsed>=this.danceSeconds) {this.state='result';this.feedback=this.points>=160?'You beat the robot dancers!':'Robot dancers scored 160. Try another round!';}
    }
    const cue=danceCue(this.elapsed);
    this.tiles.forEach((t,i)=>{const m=t.material as THREE.MeshStandardMaterial;m.emissiveIntensity=this.state==='dance'?(i===cue.tile?(cue.ready?2:1):0.05):0.4;});
    this.show();
  }
  private show() {
    let title='Neon space party';
    let instruction='Action: start on the white pad. Back: leave';
    if(this.state==='tag') {title=`Laser tag · ${Math.ceil(this.tagSeconds-this.elapsed)}s`;instruction='Action: laser · Kick: glowing baton';}
    if(this.state==='dance') {const cue=danceCue(this.elapsed);title=`Dance final · ${Math.ceil(this.danceSeconds-this.elapsed)}s`;instruction=`${NEON_TILES[cue.tile].name} panel · ${cue.ready?'NOW! Dance!':'Wait for the beat'}`;}
    if(this.state==='result') {title='Party complete';instruction=`${this.tags} tags · ${this.dances} dance steps · Robots: 160`;}
    const text=`${title}
${this.points} points
${instruction}
${this.feedback}`;
    if(this.hud.textContent!==text)this.hud.textContent=text;
  }
  holdsTime(){return this.state==='tag'||this.state==='dance';}
  cutaway(_cam:THREE.Vector3){}
  update(_night:number,t:number,_phase:number,_focus:THREE.Vector3){const ball=this.scene.getObjectByName('Disco ball');if(ball)ball.rotation.y=t*0.5;}
  dispose(){this.hud.remove();disposeTree(this.scene);}
  debugShortRound(tag:number,dance:number){this.tagSeconds=tag;this.danceSeconds=dance;}
  debugInfo(){return {state:this.state,elapsed:this.elapsed,points:this.points,tags:this.tags,dances:this.dances,cue:danceCue(this.elapsed),tiles:NEON_TILES,drones:this.drones.map(d=>({x:d.mesh.position.x,z:d.mesh.position.z,available:d.cooldown<=0})),door:this.door};}
}
