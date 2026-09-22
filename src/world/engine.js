import {PLACES,AGENTS} from './config.js';
// 时辰节律：一天 24 小时映射为 36 分钟真实时间（1 游戏小时 = 90 秒）。
// AI 按时辰偏好选择去处：清晨茶楼与工坊、午后看展与书院、傍晚亭台、入夜展会、深夜早歇。
export const DAY_PHASES=[
 {name:'清晨',from:6,to:9,prefer:['tea','workshop'],pace:1},
 {name:'上午',from:9,to:12,prefer:['tea','workshop','hall'],pace:1},
 {name:'午后',from:12,to:14,prefer:['hall','library'],pace:1},
 {name:'傍晚',from:14,to:18,prefer:['pavilion','library','workshop'],pace:1.15},
 {name:'入夜',from:18,to:22,prefer:['hall','pavilion','tea'],pace:1.3},
 {name:'深夜',from:22,to:6,prefer:['pavilion','tea'],pace:2},
];
export function phaseAt(hour){
 for(const p of DAY_PHASES){if(p.from<p.to){if(hour>=p.from&&hour<p.to)return p;}else if(hour>=p.from||hour<p.to)return p;}
 return DAY_PHASES[0];
}
// ---- AI 观展（PRD 8.3 H03）----
// 状态：planned → moving → observing → generating → completed；任一步可转 cancelled/failed。
// 观感是 AI 的观点，只引用结构化事实（标题/一句话/赛道/标签），不生成奖项、名次或效果承诺。
export const VIEW_PHASES=['planned','moving','observing','generating','completed'];
export const VIEW_DWELL_MS={min:8000,max:14000};      // 演示缩放：PRD 初始 20-40 秒的紧凑版
export const VIEW_COOLDOWN_MS=20*60*1000;             // 同一角色对同一内容版本的冷却（演示值，PRD 为 24 小时）
export const VIEW_SESSION_BUDGET=40;                  // 单次会话观感生成上限（PRD 全局/角色预算的本地形态）
export function generateImpression(agent,work){
 const tagline=(work?.tagline||'').replace(/[。.！!？?]$/,'');
 const track=work?.track||'这个方向';
 const openers=['有点意思','值得细看','说到我心上了','这个思路清爽'];
 const opener=openers[Math.abs((agent?.name||'').length+(work?.title||'').length)%openers.length];
 const text=`${opener}：${track}的《${work?.title||'这件作品'}》——${tagline}。这是我的观感，作品介绍来自参赛资料。`;
 return text.length>60?text.slice(0,57)+'…':text;
}
export function impressionHasNoFabrication(text){
 return !/冠军|一等奖|金奖|获奖|第一名|排名|奖金|保证|承诺/.test(text||'');
}
export function walkable(x,z){
 if(x < -18 || x >18 || z < -14 || z >14) return false;
 if(z>=4&&z<=6 && !(x>=-5&&x<=-3) && !(x>=9&&x<=11))return false;
 return !PLACES.some(p=>Math.abs(x-p.x)<p.w/2+.6&&Math.abs(z-p.z)<p.d/2+.6);
}
export function nearestWalkable(x,z,isWalkable=walkable){
 x=Math.max(-18,Math.min(18,Math.round(x)));z=Math.max(-14,Math.min(14,Math.round(z)));
 for(let r=0;r<40;r++)for(let a=-r;a<=r;a++)for(let b=-r;b<=r;b++)if(Math.abs(a)===r||Math.abs(b)===r)if(isWalkable(x+a,z+b))return [x+a,z+b];
 return [-2,0];
}
export function findPath(from,to,isWalkable=walkable){
 const start=nearestWalkable(...from,isWalkable),end=nearestWalkable(...to,isWalkable),key=p=>p.join(','),s=key(start),goal=key(end);
 const open=[start],seen=new Set([s]),previous=new Map();let found=false;
 while(open.length){const p=open.shift(),k=key(p);if(k===goal){found=true;break;}
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const n=[p[0]+dx,p[1]+dz],nk=key(n);if(!seen.has(nk)&&isWalkable(...n)){seen.add(nk);previous.set(nk,k);open.push(n);}}
 }
 if(!found)return [];
 let at=goal,result=[];while(at!==s){result.unshift(at.split(',').map(Number));at=previous.get(at);}return result;
}
export class WorldEngine{
 constructor(onEvent=()=>{},getExhibited=()=>[]){this.time=0;this.onEvent=onEvent;this.paused=false;this.clock=8;this.lastPhase=phaseAt(this.clock).name;this.getExhibited=getExhibited;this.viewBudget=VIEW_SESSION_BUDGET;this.player={id:'you',name:'你',color:'#427ab5',x:-3,z:1,angle:0,path:[],state:'自在漫游'};this.agents=AGENTS.map((a,i)=>({...a,x:a.start[0],z:a.start[1],angle:0,path:[],state:'歇脚中',wait:2+i*1.7,step:i%2,memory:[],partner:null,viewing:null,lastViewAt:{},views:0}));}
 phase(){return phaseAt(this.clock);}
 // 观展候选：与角色兴趣匹配、未在冷却期、仍在当前共享展位中的作品。
 viewCandidates(a){
  const exhibits=this.getExhibited()||[];
  const now=Date.now();
  return exhibits.filter(w=>!((a.lastViewAt[w.id+'@'+(w.contentVersion||1)]||0)+VIEW_COOLDOWN_MS>now)).filter(w=>{
   const hay=[w.track,...(w.tags||[]),w.title].join(' ');
   return (a.interests||[]).some(t=>hay.includes(t));
  });
 }
 planView(a){
  if(a.held||a.partner||a.viewing||this.viewBudget<=0)return null;
  const candidates=this.viewCandidates(a);
  if(!candidates.length)return null;
  const work=candidates[Math.floor(Math.random()*candidates.length)];
  const stand=(this.getExhibited()||[]).findIndex(w=>w.id===work.id);
  if(stand<0)return null;
  a.viewing={workId:work.id,version:work.contentVersion||1,stand,phase:'planned',until:this.time+2};
  this.onEvent({id:`${a.id}-view-${this.time}`,text:`${a.name}前往展会，想看看《${work.title}》`,kind:'view',time:Date.now(),actor:a.id,workId:work.id});
  return a.viewing;
 }
 advanceView(a,dt){
  const v=a.viewing;if(!v)return;
  const exhibits=this.getExhibited()||[];
  const work=exhibits.find(w=>w.id===v.workId);
  if(!work){ // 撤回或退出共享展位：任务立即取消，不生成观感。
   const reason=exhibits.length===0?'展位已更新':'作品已撤回';
   a.viewing=null;this.onEvent({id:`${a.id}-vcancel-${this.time}`,text:`${a.name}的观展任务取消（${reason}）`,kind:'view-cancel',time:Date.now(),actor:a.id,workId:v.workId});
   return;
  }
  if(this.time<v.until)return;
  if(v.phase==='planned'){v.phase='moving';v.until=this.time+2;a.state='去看展';}
  else if(v.phase==='moving'){v.phase='observing';v.until=this.time+(VIEW_DWELL_MS.min+Math.random()*(VIEW_DWELL_MS.max-VIEW_DWELL_MS.min))/1000;a.state='观展中';}
  else if(v.phase==='observing'){v.phase='generating';v.until=this.time+1.2;a.state='整理观感';}
  else if(v.phase==='generating'){
   const impression=generateImpression(a,work);
   a.memory.push(`看了《${work.title}》：${impression}`);a.memory=a.memory.slice(-20);
   a.lastViewAt[work.id+'@'+(work.contentVersion||1)]=Date.now();
   a.views=(a.views||0)+1;this.viewBudget=Math.max(0,this.viewBudget-1);
   v.phase='completed';
   this.onEvent({id:`${a.id}-vdone-${this.time}`,text:`${a.name}看完《${work.title}》，留下了观感`,kind:'view',time:Date.now(),actor:a.id,workId:work.id,impression});
   a.viewing=null;a.state='看展与歇脚';a.wait=4;
  }
 }
 movePlayer(x,z){this.player.path=findPath([this.player.x,this.player.z],[x,z]);this.player.state=this.player.path.length?'正在前往':'自在漫游';return this.player.path.length>0;}
 hold(id){this.agents.forEach(a=>{if(a.id===id||a.partner===id){a.partner=null;a.wait=8;a.state='歇脚中';}});const a=this.agents.find(a=>a.id===id);if(a){a.path=[];a.held=true;a.state='与你交谈';}}
 release(id){const a=this.agents.find(a=>a.id===id);if(a){a.held=false;a.wait=6;a.state='歇脚中';}}
 tick(dt){if(this.paused)return;dt=Math.min(dt,.1);this.time+=dt;this.clock=(this.clock+dt/90)%24;
  const phase=phaseAt(this.clock);
  if(phase.name!==this.lastPhase){this.lastPhase=phase.name;this.onEvent({id:`phase-${this.time}`,text:`时辰流转，江湖到了${phase.name}`,kind:'phase',time:Date.now()});}
  this.advance(this.player,dt,3.2);
  for(const a of this.agents){if(a.held)continue;
   if(a.viewing){this.advanceView(a,dt);continue;}
   this.advance(a,dt,1.15);if(a.path.length)continue;a.wait-=dt;if(a.wait>0)continue;
   if(a.partner){a.partner=null;a.state='整理见闻';a.wait=6;continue;}
   const other=this.agents.find(b=>b.id!==a.id&&!b.held&&!b.path.length&&!b.partner&&b.wait>0&&Math.hypot(b.x-a.x,b.z-a.z)<3);
   if(other&&a.state!=='整理见闻'){a.partner=other.id;other.partner=a.id;a.state=`与${other.name}闲聊`;other.state=`与${a.name}闲聊`;a.wait=9;other.wait=9;a.angle=Math.atan2(other.x-a.x,other.z-a.z);other.angle=a.angle+Math.PI;
    const viewTopic=[a,other].flatMap(x=>x.memory).map(m=>/^看了《(.+?)》/.exec(m)).find(Boolean);
    const topic=viewTopic?`展会上的《${viewTopic[1]}》`:['开源分享','最近看到的作品','如何把想法做成原型'][Math.floor(this.time)%3];
    const text=`${a.name}与${other.name}聊起了${topic}`;
    a.memory.push(text);other.memory.push(text);a.memory=a.memory.slice(-20);other.memory=other.memory.slice(-20);this.onEvent({id:`${a.id}-${this.time}`,text,kind:'chat',time:Date.now()});continue;}
   const phaseNow=phaseAt(this.clock);
   // 展会偏好的时辰里，每个决策周期有较高概率排一次观展任务（受会话预算与冷却约束）。
   if(phaseNow.prefer.includes('hall')&&Math.random()<.3){if(this.planView(a))continue;}
   const preferred=a.places.filter(id=>{const p=PLACES.find(p=>p.id===id);return p&&phaseNow.prefer.includes(p.kind);});
   const destinationId=preferred.length?preferred[a.step++%preferred.length]:a.places[a.step++%a.places.length];
   const dest=PLACES.find(p=>p.id===destinationId);a.path=findPath([a.x,a.z],dest.entry);a.state=`前往${dest.short}`;a.wait=(7+(a.step%5))*phaseNow.pace;this.onEvent({id:`${a.id}-${this.time}`,text:`${a.name}动身前往${dest.short}`,kind:'walk',time:Date.now()});
  }
 }
 advance(a,dt,speed){if(!a.path.length)return;const p=a.path[0],dx=p[0]-a.x,dz=p[1]-a.z,d=Math.hypot(dx,dz);a.angle=Math.atan2(dx,dz);if(d<speed*dt){a.x=p[0];a.z=p[1];a.path.shift();if(!a.path.length){a.state=a.id==='you'?'自在漫游':'看展与歇脚';}}else{a.x+=dx/d*speed*dt;a.z+=dz/d*speed*dt;}}
 snapshot(){return this.agents.map(({id,name,state,x,z,memory,viewing,views})=>({id,name,state,x,z,memory:[...memory],viewing:viewing?{workId:viewing.workId,stand:viewing.stand,phase:viewing.phase}:null,views:views||0}));}
}

export function hallWalkable(x,z){return Math.abs(x)<=10&&Math.abs(z)<=8&&![-6.75,-2.25,2.25,6.75].some(a=>[-5,3].some(b=>Math.abs(x-a)<1.5&&Math.abs(z-b)<1.2));}

export function terrainHeight(x,z){if(z>=2.7&&z<=7.32&&[-4,10].some(b=>Math.abs(x-b)<=1.15)){const t=(z-2.7)/4.62;return .27+Math.sin(t*Math.PI)*.55;}return 0;}
