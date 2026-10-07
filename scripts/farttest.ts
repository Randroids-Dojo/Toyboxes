// Actual desktop, touch, controller and remote inputs in local memory only.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { requireLocalPlaytest } from './autobuild/safety';
const base='http://localhost:5207/'; requireLocalPlaytest(base);
const phone=process.env.PHONE==='1', pad=process.env.PAD==='1', remote=process.env.REMOTE==='1';
const out=`/tmp/toyboxes-fart-${phone?'phone':pad?'pad':remote?'remote':'desktop'}`; mkdirSync(out,{recursive:true});
async function api(path:string,body?:unknown,headers:Record<string,string>={}) {
 const r=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
 const data=await r.json(); if(!r.ok)throw new Error(`${path}: ${r.status}`); return {data,headers:r.headers};
}
const free=(await api('/api/world')).data.slots.find((s:{roomId:string|null})=>!s.roomId);
const claim=await api('/api/room',{action:'claim',slot:free.slot,name:'Puff tester',pin:'2468',pinConfirm:'2468',browserId:`fart-test-${Date.now()}-owner`});
const roomId=claim.data.room.id;
const login=await api('/api/admin',{action:'login',password:'toyboxes-dev'},{'x-toyboxes-admin':'1'});
await api('/api/admin',{action:'saveContent',roomId,content:{rev:0,areas:[{id:'fart',name:'Fart simulator',theme:{wall:0,floor:0,trim:4},props:[],published:true,experience:{kind:'fart'},pages:[]}],exhibits:[]}},{'x-toyboxes-admin':'1',cookie:(login.headers.get('set-cookie')??'').split(';')[0]});
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const ctx=await browser.newContext(phone?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:800}});
await ctx.addInitScript(()=>localStorage.setItem('toyboxes.identity',JSON.stringify({browserId:'fart-test-player-000001',name:'Puff tester'})));

await ctx.addInitScript(time=>localStorage.setItem('toyboxes.settings',JSON.stringify({time})),phone?'night':'day');
const page=await ctx.newPage();const errors:string[]=[];page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.message);});
if(pad)await page.addInitScript(`(() => {
 const pad={buttons:new Array(17).fill(0),axes:[0,0,0,0],connected:true}; window.__pad=pad;
 const snapshot=()=>({id:'Test Pad (STANDARD GAMEPAD)',index:0,connected:pad.connected,mapping:'standard',timestamp:performance.now(),axes:pad.axes.slice(),buttons:pad.buttons.map(v=>({pressed:v>0.5,touched:v>0,value:v}))});
 Object.defineProperty(navigator,'getGamepads',{value:()=>pad.connected?[snapshot(),null,null,null]:[null,null,null,null]});
})();`);
async function dbg(f:string,...args:unknown[]){return page.evaluate(([f,a])=>(window as any).toyboxes.debug[f as string](...(a as unknown[])),[f,args] as const);}
async function act(kick=false){
 if(phone)await page.locator(kick?'.tbtn-kick':'.tbtn-action').tap();
 else if(pad){const b=kick?2:0;await page.evaluate(b=>(window as any).__pad.buttons[b]=1,b);await page.waitForTimeout(400);await page.evaluate(b=>(window as any).__pad.buttons[b]=0,b);await page.waitForTimeout(180);}
 else await page.keyboard.press(kick?'KeyF':remote?'Enter':'KeyE');
 await page.waitForTimeout(160);
}
async function until(check:()=>Promise<boolean>,what:string){const end=Date.now()+15000;while(Date.now()<end){if(await check())return;await page.waitForTimeout(100);}await page.screenshot({path:`${out}/failure.png`});throw new Error(`Timed out: ${what}: ${JSON.stringify(await dbg('state'))}`);}
await page.goto(`${base}?room=${roomId}`);await page.waitForSelector('body.ready');await until(async()=>(await dbg('state')).space==='room','room');
await page.waitForTimeout(1200);
if(pad){await page.evaluate(()=>(window as any).__pad.buttons[13]=1);await page.waitForTimeout(160);await page.evaluate(()=>(window as any).__pad.buttons[13]=0);await page.waitForTimeout(200);if(await page.evaluate(()=>document.body.dataset.device)!=='pad')throw new Error('Controller did not activate');}
const door=(await dbg('spots')).areaDoors[0];await dbg('teleport',door.x,door.z+.3,Math.PI);await page.waitForTimeout(300);await act();await until(async()=>(await dbg('state')).space==='area','arena');
await page.screenshot({path:`${out}/arena.png`});
await dbg('experienceCall','debugShortRound',14);await dbg('teleport',0,6,Math.PI);await page.waitForTimeout(300);await act();await until(async()=>(await dbg('experience')).state==='playing','start');
// A short opening puff faces away from the hoop. It must register a miss.
await dbg('teleport',0,6,0);await act();await page.waitForTimeout(850);
let e=await dbg('experience');if(e.shots!==1||e.hits!==0)throw new Error('Miss did not count exactly one puff');
// Place the player at the range shown by the live pressure meter, then use real input.
e=await dbg('experience');await dbg('teleport',e.target.x,e.target.z+2+8*e.pressure,Math.PI);await act();
await until(async()=>(await dbg('experience')).hits===1,'pressure puff hit');await page.screenshot({path:`${out}/hit.png`});
await page.waitForTimeout(800);e=await dbg('experience');
if(remote){await dbg('teleport',e.target.x,e.target.z+2+8*e.pressure,Math.PI);await act();}
else{await dbg('teleport',e.target.x,e.target.z+4.4,Math.PI);await act(true);}
await until(async()=>(await dbg('experience')).hits===2,'second hoop');
e=await dbg('experience');if(e.shots!==3)throw new Error('Input repeats created extra puffs');
await page.screenshot({path:`${out}/puffs.png`});await until(async()=>(await dbg('experience')).state==='result','result');
if((await dbg('experience')).hits!==2)throw new Error('Results lost the hoop count');await page.screenshot({path:`${out}/result.png`});
await dbg('teleport',0,6,Math.PI);await page.waitForTimeout(250);await act();await until(async()=>(await dbg('experience')).state==='playing','replay');
e=await dbg('experience');if(e.hits!==0||e.shots!==0)throw new Error('Replay did not reset the round');
// Win a complete second round, so the five-hoop goal is tested as well as timeout.
await dbg('experienceCall','debugShortRound',30);
for(let i=0;i<5;i++){
 await page.waitForTimeout(800);e=await dbg('experience');
 const reach=remote?2+8*e.pressure:4.4;
 if(e.target.z<0)await dbg('teleport',e.target.x,e.target.z+reach,Math.PI);
 else if(e.target.x<0)await dbg('teleport',e.target.x+reach,e.target.z,-Math.PI/2);
 else await dbg('teleport',e.target.x-reach,e.target.z,Math.PI/2);
 await act(!remote);await until(async()=>(await dbg('experience')).hits===i+1,`winning hoop ${i+1}`);
}
if((await dbg('experience')).state!=='result')throw new Error('Five hoops did not finish the round');
await page.screenshot({path:`${out}/win.png`});
await dbg('teleport',-7,7,0);await page.waitForTimeout(250);await act();await until(async()=>(await dbg('state')).space==='room','exit');
await browser.close();if(errors.length)throw new Error(errors.join(' | '));console.log(`Puff miss, aimed hit, second hoop, timeout, replay, five-hoop win and exit passed: ${out}`);
