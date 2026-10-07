// Real action input through the neon round. Claims only local memory rooms.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { requireLocalPlaytest } from './autobuild/safety';
const base='http://localhost:5207/'; requireLocalPlaytest(base);
const phone=process.env.PHONE==='1', pad=process.env.PAD==='1', remote=process.env.REMOTE==='1';
const out=`/tmp/toyboxes-neon-${phone?'phone':pad?'pad':remote?'remote':'desktop'}`; mkdirSync(out,{recursive:true});
async function api(path:string,body?:unknown,headers:Record<string,string>={}) {
 const r=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
 const data=await r.json(); if(!r.ok)throw new Error(`${path}: ${r.status}`); return {data,headers:r.headers};
}
const free=(await api('/api/world')).data.slots.find((s:{roomId:string|null})=>!s.roomId);
const claim=await api('/api/room',{action:'claim',slot:free.slot,name:'Neon tester',pin:'2468',pinConfirm:'2468',browserId:`neon-test-${Date.now()}-owner`});
const roomId=claim.data.room.id;
const login=await api('/api/admin',{action:'login',password:'toyboxes-dev'},{'x-toyboxes-admin':'1'});
await api('/api/admin',{action:'saveContent',roomId,content:{rev:0,areas:[{id:'neon',name:'Neon space party',theme:{wall:0,floor:0,trim:4},props:[],published:true,experience:{kind:'neon'},pages:[]}],exhibits:[]}},{'x-toyboxes-admin':'1',cookie:(login.headers.get('set-cookie')??'').split(';')[0]});
const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const ctx=await browser.newContext(phone?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:800}});
await ctx.addInitScript(()=>localStorage.setItem('toyboxes.identity',JSON.stringify({browserId:'neon-test-player-000001',name:'Dancer'})));

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
await dbg('experienceCall','debugShortRound',7,7);await dbg('teleport',0,6,Math.PI);await page.waitForTimeout(300);await act();await until(async()=>(await dbg('experience')).state==='tag','start');
async function tag(kick:boolean){const e=await dbg('experience');const d=e.drones.find((d:any)=>d.available);await dbg('teleport',d.x,d.z+(kick?1:3),Math.PI);await page.waitForTimeout(180);await act(kick);}
await tag(false);if((await dbg('experience')).tags!==1)throw new Error('Laser input did not tag a drone');await page.waitForTimeout(450);await tag(true);if((await dbg('experience')).tags!==2)throw new Error('Baton input did not tag a drone');
await page.screenshot({path:`${out}/tag.png`});await until(async()=>(await dbg('experience')).state==='dance','dance stage');
let e=await dbg('experience');let tile=e.tiles[e.cue.tile];await dbg('teleport',tile.x,tile.z,Math.PI);
await until(async()=>{e=await dbg('experience');tile=e.tiles[e.cue.tile];await dbg('teleport',tile.x,tile.z,Math.PI);return e.cue.ready;},'dance beat');await act();if((await dbg('experience')).dances!==1)throw new Error('Dance input did not score');
const score=(await dbg('experience')).points;await act();if((await dbg('experience')).points!==score)throw new Error('Same beat scored twice');
await page.screenshot({path:`${out}/dance.png`});await until(async()=>(await dbg('experience')).state==='result','results');await page.screenshot({path:`${out}/result.png`});
await dbg('teleport',0,6,Math.PI);await page.waitForTimeout(250);await act();await until(async()=>(await dbg('experience')).state==='tag','replay');if((await dbg('experience')).points!==0)throw new Error('Replay did not reset points');
await dbg('teleport',-7,7,0);await page.waitForTimeout(250);await act();await until(async()=>(await dbg('state')).space==='room','exit');
await browser.close();if(errors.length)throw new Error(errors.join(' | '));console.log(`Neon laser, baton, dance, no double-score, results, replay and exit passed: ${out}`);
