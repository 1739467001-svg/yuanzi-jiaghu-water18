// 固定路线性能基准（PRD 15.1 / N01）：首交互时间、固定路线帧率分位、渲染统计。
// 用法：先启动 npm run dev，再运行 node scripts/bench.mjs [时长秒] [输出json]
// 路线：小镇内 8 个地面途经点往返 + 一次展馆往返；每段等待到达或超时。
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
const durationSec=Number(process.argv[2]||90);
const outPath=process.argv[3]||'artifacts/perf-baseline.json';
const WAYPOINTS=[[520,430],[760,470],[430,560],[880,560],[600,380],[300,470],[950,430],[700,600]];
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const t0=Date.now();
await page.goto(base,{waitUntil:'domcontentloaded'});
await page.waitForSelector('.scene-pin.player',{timeout:20000});
// 首交互：名帖出现且引擎开始推进（玩家 pin 可见即视为可移动/可进入内容模式）。
await page.waitForFunction(()=>document.querySelector('.scene-pin.player')!==null,{timeout:20000});
const firstInteractiveMs=Date.now()-t0;
await page.waitForTimeout(1500);
const samples=[];
const stop=Date.now()+durationSec*1000;
let leg=0;
while(Date.now()<stop){
 const [x,y]=WAYPOINTS[leg%WAYPOINTS.length];
 await page.mouse.click(x,y);
 const legStart=Date.now();
 // 等待到达或超时（每段最多 6 秒），期间持续采样帧间隔。
 await page.waitForFunction(()=>{
  const pin=document.querySelector('.scene-pin.player');
  return !pin||pin.textContent.includes('你在这里')&&document.querySelector('.scene-pin.player')!==null;
 },{timeout:6000}).catch(()=>{});
 await page.waitForTimeout(300);
 leg++;
 if(leg%4===0){
  // 每 4 段进一次展馆再返回，覆盖展厅渲染。
  await page.getByRole('button',{name:'武林大会',exact:true}).click().catch(()=>{});
  await page.waitForTimeout(1200);
  await page.getByRole('button',{name:'返回小镇',exact:true}).click().catch(()=>{});
  await page.waitForTimeout(800);
 }
 if(leg>=WAYPOINTS.length*3)break;
}
// 帧间隔采样：在页面内用 rAF 记录 6 秒。
await page.evaluate(()=>{window.__frames=[];const tick=t=>{window.__frames.push(t);if(window.__frames.length<600)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
await page.waitForTimeout(6000);
const frames=await page.evaluate(()=>window.__frames||[]);
const deltas=[];for(let i=1;i<frames.length;i++)deltas.push(frames[i]-frames[i-1]);
const sorted=[...deltas].sort((a,b)=>a-b);
const pct=p=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]:0;
const perf=await page.evaluate(()=>window.__atomPerf?window.__atomPerf():null);
const result={
 date:new Date().toISOString(),
 base,durationSec,
 firstInteractiveMs,
 framesSampled:deltas.length,
 fps:{mean:deltas.length?Math.round(1000/(deltas.reduce((a,b)=>a+b,0)/deltas.length)):0,p10:Math.round(1000/pct(.9)),p50:Math.round(1000/pct(.5))},
 renderer:perf,
 viewport:{width:1440,height:900},
 device:{userAgent:await page.evaluate(()=>navigator.userAgent),cores:await page.evaluate(()=>navigator.hardwareConcurrency||null)},
 errors,
};
mkdirSync('artifacts',{recursive:true});
writeFileSync(outPath,JSON.stringify(result,null,2));
console.log('perf baseline:',JSON.stringify({firstInteractiveMs,fps:result.fps,renderer:result.renderer,errors},null,1));
console.log('written to',outPath);
await browser.close();
