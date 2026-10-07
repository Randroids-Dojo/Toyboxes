// A solo cartoon pressure-and-aim challenge built from a sketchbook request.
import * as THREE from 'three';
import {h} from '../ui/ui';
import {sfx} from '../audio/sfx';
import {disposeTree} from '../world/kit';
import {box,type Collider} from '../world/physics';
import type {PlayerState,SpaceAction,SpaceView} from '../world/space';
import type {ExperienceCtx} from './common';
import {puffPressure,puffEnd,puffHit,PUFF_SECONDS,PUFF_GOAL,PUFF_TARGETS} from '../shared/fart';

export class FartSimulator implements SpaceView {
 readonly scene=new THREE.Scene();
 readonly indoor=false;
 readonly door={x:-7,z:7};
 readonly arrival={x:0,z:6,yaw:Math.PI};
 readonly lectern=null;readonly chest=null;readonly areaDoors=[];readonly exhibitSpots=[];
 readonly colliders:Collider[]=[];
 readonly sun=new THREE.DirectionalLight(0xffedcf,2);
 private hud:HTMLElement;private title:HTMLElement;private meter:HTMLProgressElement;private message:HTMLElement;
 private target=new THREE.Group();private marker:THREE.Mesh;
 private puffs:{mesh:THREE.Group;x:number;z:number;end:{x:number;z:number};life:number;hit:boolean;target:number;resolved:boolean}[]=[];
 private state:'idle'|'playing'|'result'='idle';private elapsed=0;private hits=0;private shots=0;private cooldown=0;
 private duration=PUFF_SECONDS;private feedback='Five hoops. Thirty seconds. One silly challenge.';
 constructor(ctx:ExperienceCtx) {
  this.scene.background=new THREE.Color(0x87c4df);
  this.scene.add(new THREE.HemisphereLight(0xffffff,0x45503d,2.5));this.sun.position.set(8,15,5);this.scene.add(this.sun);
  const make=(g:THREE.BufferGeometry,color:number,x:number,y:number,z:number)=>{
   const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:0.7,emissive:color,emissiveIntensity:0.12}));m.position.set(x,y,z);this.scene.add(m);return m;
  };
  make(new THREE.BoxGeometry(18,.4,18),0x93bd76,0,-.2,0);
  make(new THREE.BoxGeometry(12,.04,12),0xf0d9a5,0,.03,0);
  for(const [x,z,hw,hd] of [[-9,0,.2,9],[9,0,.2,9],[0,-9,9,.2],[0,9,9,.2]]){
   this.colliders.push(box(x,z,hw,hd));make(new THREE.BoxGeometry(hw*2,.5,hd*2),0x62894e,x,.25,z);
  }
  for(let i=0;i<12;i++){
   const x=i%2?-12:12,z=-10+Math.floor(i/2)*5;
   make(new THREE.CylinderGeometry(.2,.3,3,8),0x785738,x,1.5,z);make(new THREE.SphereGeometry(1.5,12,8),0x4f8d61,x,3.3,z);
  }
  for(let i=0;i<9;i++){const cloud=new THREE.Group();for(let j=0;j<3;j++){
   const c=new THREE.Mesh(new THREE.SphereGeometry(.8+j*.2,12,8),new THREE.MeshBasicMaterial({color:0xfff9eb}));c.position.set(j*.9,j%2*.3,0);cloud.add(c);
  }cloud.position.set(Math.sin(i*5)*24,7+i%3,-15-Math.cos(i*3)*12);this.scene.add(cloud);}
  make(new THREE.CylinderGeometry(1.1,1.1,.1,32),0xfff7d5,0,.1,6);
  make(new THREE.TorusGeometry(1,.15,8,32),0x6b42ad,-7,1.3,7).rotation.y=Math.PI/4;
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.18,12,40),new THREE.MeshStandardMaterial({color:0xffcf4d,emissive:0xffaa00,emissiveIntensity:.5}));this.target.add(ring);
  const flag=new THREE.Mesh(new THREE.ConeGeometry(.4,.7,8),new THREE.MeshStandardMaterial({color:0xff7763}));flag.position.y=1.8;this.target.add(flag);this.scene.add(this.target);
  this.marker=make(new THREE.CylinderGeometry(1.25,1.25,.045,40),0xffcf4d,0,.09,0);
  this.hud=h('div',{class:'fart-hud'});this.title=h('strong',{},'Fart simulator');
  this.meter=h('progress',{max:'1',value:'0','aria-label':'Puff pressure'}) as HTMLProgressElement;
  this.message=h('div',{});this.hud.append(this.title,this.meter,this.message);ctx.ui.hud.appendChild(this.hud);this.moveTarget();this.show();
 }
 private moveTarget(){const t=PUFF_TARGETS[this.hits%PUFF_TARGETS.length];this.target.position.set(t.x,1.3,t.z);this.marker.position.set(t.x,.09,t.z);}
 private start(){for(const p of this.puffs){this.scene.remove(p.mesh);disposeTree(p.mesh);}this.puffs=[];this.elapsed=0;this.hits=0;this.shots=0;this.cooldown=0;this.state='playing';this.feedback='Face the gold hoop. Time the pressure, then let rip!';this.moveTarget();this.show();}
 actions(p:PlayerState):SpaceAction[]{
  if(Math.hypot(p.x-this.door.x,p.z-this.door.z)<2)return [];
  if(this.state!=='playing')return [{x:0,z:6,range:1.8,label:'Start the puff challenge',short:'Start',run:()=>this.start()}];
  return [{x:p.x,z:p.z,range:.2,label:'Let rip toward the hoop',short:'Fart',run:()=>this.fire(p,puffPressure(this.elapsed))}];
 }
 kickAction(p:PlayerState){return this.state==='playing'?{label:'Quick puff',run:()=>this.fire(p,.3)}:null;}
 private fire(p:PlayerState,power:number){
  if(this.cooldown>0)return;this.cooldown=.7;this.shots++;
  const end=puffEnd(p.x,p.z,p.yaw,power),target=PUFF_TARGETS[this.hits%PUFF_TARGETS.length];
  const cloud=new THREE.Group();
  for(let i=0;i<6;i++){const b=new THREE.Mesh(new THREE.SphereGeometry(.18+i*.025,10,8),new THREE.MeshStandardMaterial({color:i%2?0xb5df73:0xe1f69a,transparent:true,opacity:.85,emissive:0x87aa44,emissiveIntensity:.3}));b.position.set(Math.sin(i*2)*.25,Math.cos(i*3)*.2,Math.cos(i*2)*.25);cloud.add(b);}
  cloud.position.set(p.x,1.1,p.z);this.scene.add(cloud);
  this.puffs.push({mesh:cloud,x:p.x,z:p.z,end,life:0,hit:puffHit(p.x,p.z,p.yaw,power,target),target:this.hits,resolved:false});
  sfx.puff(power);this.feedback=`Pfffft! ${Math.round(power*100)}% pressure`;this.show();
 }
 step(dt:number,p:PlayerState){
  this.target.rotation.y=Math.atan2(p.x-this.target.position.x,p.z-this.target.position.z);
  this.cooldown=Math.max(0,this.cooldown-dt);
  if(this.state==='playing'){this.elapsed+=dt;if(this.elapsed>=this.duration){this.state='result';this.feedback='Time is up. Try the white pad for another round.';}}
  for(const puff of this.puffs){
   puff.life+=dt;const t=Math.min(1,puff.life/.5);
   puff.mesh.position.set(puff.x+(puff.end.x-puff.x)*t,1.1+Math.sin(t*Math.PI)*.4,puff.z+(puff.end.z-puff.z)*t);puff.mesh.scale.setScalar(.7+puff.life);puff.mesh.rotation.y+=dt*2;
   if(!puff.resolved&&puff.life>=.5){puff.resolved=true;
    if(this.state==='playing'&&puff.hit&&puff.target===this.hits){this.hits++;sfx.ding(false);this.feedback='Bullseye! A fresh hoop is ready.';this.moveTarget();if(this.hits>=PUFF_GOAL){this.state='result';this.feedback='Five hoops cleared! Champion of the silly breeze.';}}
    else if(this.state==='playing')this.feedback='Miss. Move closer or change the pressure and aim.';
   }
   for(const b of puff.mesh.children)(b as THREE.Mesh<THREE.SphereGeometry,THREE.MeshStandardMaterial>).material.opacity=Math.max(0,.85-puff.life*.75);
   if(puff.life>=1.2){this.scene.remove(puff.mesh);disposeTree(puff.mesh);}
  }
  this.puffs=this.puffs.filter(p=>p.life<1.2);this.show();
 }
 private show(){
  this.meter.value=this.state==='playing'?puffPressure(this.elapsed):0;
  const title=this.state==='playing'?`Fart simulator · ${Math.max(0,Math.ceil(this.duration-this.elapsed))}s`:this.state==='result'?'Puff challenge complete':'Fart simulator';
  if(this.title.textContent!==title)this.title.textContent=title;
  const text=`${this.hits}/${PUFF_GOAL} hoops · ${this.shots} puffs\n${this.state==='playing'?`Pressure ${Math.round(this.meter.value*100)}% · Action: fart · Kick: quick puff`:'Action: start on the white pad'}\n${this.feedback}`;
  if(this.message.textContent!==text)this.message.textContent=text;
 }
 holdsTime(){return this.state==='playing';}cutaway(_cam:THREE.Vector3){}
 update(_night:number,t:number,_phase:number,_focus:THREE.Vector3){this.target.rotation.z=Math.sin(t*2)*.08;}
 dispose(){this.hud.remove();disposeTree(this.scene);}
 debugShortRound(seconds:number){this.duration=seconds;}
 debugInfo(){return {state:this.state,elapsed:this.elapsed,hits:this.hits,shots:this.shots,pressure:puffPressure(this.elapsed),target:PUFF_TARGETS[this.hits%PUFF_TARGETS.length],cooldown:this.cooldown,door:this.door};}
}
