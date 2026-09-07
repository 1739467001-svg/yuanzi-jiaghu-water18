import {PLACES,AGENTS} from './config.js';
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
 constructor(onEvent=()=>{}){this.time=0;this.onEvent=onEvent;this.paused=false;this.player={id:'you',name:'你',color:'#427ab5',x:-3,z:1,angle:0,path:[],state:'自在漫游'};this.agents=AGENTS.map((a,i)=>({...a,x:a.start[0],z:a.start[1],angle:0,path:[],state:'歇脚中',wait:2+i*1.7,step:i%2,memory:[],partner:null}));}
 movePlayer(x,z){this.player.path=findPath([this.player.x,this.player.z],[x,z]);this.player.state=this.player.path.length?'正在前往':'自在漫游';return this.player.path.length>0;}
 hold(id){this.agents.forEach(a=>{if(a.id===id||a.partner===id){a.partner=null;a.wait=8;a.state='歇脚中';}});const a=this.agents.find(a=>a.id===id);if(a){a.path=[];a.held=true;a.state='与你交谈';}}
 release(id){const a=this.agents.find(a=>a.id===id);if(a){a.held=false;a.wait=6;a.state='歇脚中';}}
 tick(dt){if(this.paused)return;dt=Math.min(dt,.1);this.time+=dt;this.advance(this.player,dt,3.2);
  for(const a of this.agents){if(a.held)continue;this.advance(a,dt,1.15);if(a.path.length)continue;a.wait-=dt;if(a.wait>0)continue;
   if(a.partner){a.partner=null;a.state='整理见闻';a.wait=6;continue;}
   const other=this.agents.find(b=>b.id!==a.id&&!b.held&&!b.path.length&&!b.partner&&b.wait>0&&Math.hypot(b.x-a.x,b.z-a.z)<3);
   if(other&&a.state!=='整理见闻'){a.partner=other.id;other.partner=a.id;a.state=`与${other.name}闲聊`;other.state=`与${a.name}闲聊`;a.wait=9;other.wait=9;a.angle=Math.atan2(other.x-a.x,other.z-a.z);other.angle=a.angle+Math.PI;
    const text=`${a.name}与${other.name}聊起了${['开源分享','最近看到的作品','如何把想法做成原型'][Math.floor(this.time)%3]}`;
    a.memory.push(text);other.memory.push(text);a.memory=a.memory.slice(-20);other.memory=other.memory.slice(-20);this.onEvent({id:`${a.id}-${this.time}`,text,kind:'chat',time:Date.now()});continue;}
   const destinationId=a.places[a.step++%a.places.length];const dest=PLACES.find(p=>p.id===destinationId);a.path=findPath([a.x,a.z],dest.entry);a.state=`前往${dest.short}`;a.wait=7+(a.step%5);this.onEvent({id:`${a.id}-${this.time}`,text:`${a.name}动身前往${dest.short}`,kind:'walk',time:Date.now()});
  }
 }
 advance(a,dt,speed){if(!a.path.length)return;const p=a.path[0],dx=p[0]-a.x,dz=p[1]-a.z,d=Math.hypot(dx,dz);a.angle=Math.atan2(dx,dz);if(d<speed*dt){a.x=p[0];a.z=p[1];a.path.shift();if(!a.path.length){a.state=a.id==='you'?'自在漫游':'看展与歇脚';}}else{a.x+=dx/d*speed*dt;a.z+=dz/d*speed*dt;}}
 snapshot(){return this.agents.map(({id,name,state,x,z,memory})=>({id,name,state,x,z,memory:[...memory]}));}
}

export function hallWalkable(x,z){return Math.abs(x)<=10&&Math.abs(z)<=8&&![-6.75,-2.25,2.25,6.75].some(a=>[-5,3].some(b=>Math.abs(x-a)<1.5&&Math.abs(z-b)<1.2));}

export function terrainHeight(x,z){if(z>=2.7&&z<=7.32&&[-4,10].some(b=>Math.abs(x-b)<=1.15)){const t=(z-2.7)/4.62;return .27+Math.sin(t*Math.PI)*.55;}return 0;}
