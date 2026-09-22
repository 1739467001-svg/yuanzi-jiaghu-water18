// 同浏览器联机演示层：多个标签页通过 BroadcastChannel 组成一个“房间”，
// 各自操控自己的真人化身，只广播公开字段（id、昵称、衣带色、位置、朝向、状态）。
// 坐标边界复用 aiTownAdapter（townToScene/sceneToTown），不广播对话、记忆或收藏。
// 这是 G0 双账号位置原型的本地形态：没有账号体系，每个标签页是一个独立演示身份；
// 真人一对一聊天、服务端权威与重连补偿尚未接入（见 PRD v1.0 W02/W03）。
import {townToScene,sceneToTown} from './aiTownAdapter.js';
export const WORLD_CHANNEL='atom-jianghu-world-v1';
export const PEER_TIMEOUT=6000;
const TRANSFORM={originX:0,originY:0,scale:1};
const colorOk=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
const cleanName=name=>typeof name==='string'&&name.trim()?name.trim().slice(0,20):'同行侠客';
// 存在广播（hello/welcome）只带身份；位置广播（state）必须带有限坐标。
export function validatePresence(raw){
 if(!raw||typeof raw!=='object')return null;
 const {id,name,color}=raw;
 if(typeof id!=='string'||!id||id.length>64)return null;
 return {id,name:cleanName(name),color:colorOk(color)?color:'#427ab5'};
}
// 线上只接受白名单字段；任何多余字段直接丢弃，从结构上保证私密内容不出现在广播里。
export function validatePeer(raw){
 const presence=validatePresence(raw);
 if(!presence)return null;
 const {x,z,angle,state}=raw;
 if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>200||Math.abs(z)>200)return null;
 if(!Number.isFinite(angle))return null;
 return {...presence,x,z,angle,state:typeof state==='string'&&state.trim()?state.trim().slice(0,20):'自在漫游'};
}
export function peerFromSnapshot(snapshot,color){
 if(!snapshot||typeof snapshot.id!=='string')return null;
 return validatePeer({id:snapshot.id,name:snapshot.name,color,x:snapshot.x,z:snapshot.z,angle:snapshot.angle,state:snapshot.state});
}
export class PeerTable{
 constructor(onChange=()=>{},now=()=>Date.now()){this.peers=new Map();this.onChange=onChange;this.now=now;}
 upsert(peer){const old=this.peers.get(peer.id);this.peers.set(peer.id,{...peer,lastSeen:this.now()});if(!old)this.onChange('join',peer);}
 drop(id){const old=this.peers.get(id);if(old){this.peers.delete(id);this.onChange('leave',old);}}
 prune(timeout=PEER_TIMEOUT){const cutoff=this.now()-timeout;for(const[id,p]of[...this.peers])if(p.lastSeen<cutoff)this.drop(id);}
 list(){return [...this.peers.values()].filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)).map(({lastSeen,...p})=>p);}
 size(){return this.peers.size;}
}
// 本地玩家快照 → 上游坐标 → 广播字段（方向与 aiTownAdapter 一致，预留服务端权威迁移）。
export function snapshotToWire(snapshot,color){
 if(!snapshot||typeof snapshot.id!=='string')return null;
 let town;
 try{town=sceneToTown({x:snapshot.x,z:snapshot.z},TRANSFORM);}catch{return null;}
 return validatePeer({id:snapshot.id,name:snapshot.name,color,x:town.x,z:town.y,angle:snapshot.angle,state:snapshot.state});
}
// 私聊线上格式：点对点消息与邀请。任何私聊消息都必须带 to；
// 只有 to 指向自己的消息才会被路由给上层，旁观者（包括第三个标签页）结构上收不到正文。
const dmBody=body=>typeof body==='string'?body.slice(0,500):'';
const dmId=()=>'m_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
export function validateDirect(raw){
 if(!raw||typeof raw!=='object')return null;
 const {t,from,to}=raw;
 if(typeof from!=='string'||!from||typeof to!=='string'||!to)return null;
 if(!['dm','invite','invite-reply','block'].includes(t))return null;
 if(t==='dm'&&!dmBody(raw.body))return null;
 if(t==='invite-reply'&&typeof raw.accept!=='boolean')return null;
 // 只保留白名单字段：任何多余字段（包括潜在的敏感内容）不会进入上层。
 const out={t,from,to,time:Number.isFinite(raw.time)?raw.time:Date.now()};
 if(t==='dm'){out.id=typeof raw.id==='string'&&raw.id?raw.id:dmId();out.body=dmBody(raw.body);}
 if(t==='invite'||t==='invite-reply')out.session=typeof raw.session==='string'&&raw.session?raw.session:null;
 if(t==='invite-reply'){out.accept=!!raw.accept;out.reason=String(raw.reason||'').slice(0,60);}
 return out;
}
export function wireToScene(peer){
 const scene=townToScene({x:peer.x,y:peer.z},TRANSFORM);
 return {...peer,x:scene.x,z:scene.z};
}
export function createWorldLink({selfId,getIdentity=()=>({name:'同行侠客',color:'#427ab5'}),onEvent,onPeers,onDirect,channel=WORLD_CHANNEL,BC=globalThis.BroadcastChannel}={}){
 if(!BC||!selfId)return null;
 let bc;try{bc=new BC(channel);}catch{return null;}
 const table=new PeerTable((kind,peer)=>onEvent?.({kind,peer}));
 const post=msg=>{try{bc.postMessage(msg);}catch{}};
 const self=()=>{const{name,color}=getIdentity();return {id:selfId,name,color};};
 // 列表变化才通知（新 peer、名字变化、位置变化、离开），避免无意义重渲染。
 let lastListJson='';
 const notify=()=>{const list=table.list();const json=JSON.stringify(list);if(json!==lastListJson){lastListJson=json;onPeers?.(list);}};
 bc.onmessage=ev=>{
  const m=ev.data;
  if(!m||typeof m!=='object')return;
  // 私聊与邀请：只处理发给自己的，其余（含旁观者视角）直接忽略。
  if(['dm','invite','invite-reply','block'].includes(m.t)){
   if(m.to!==selfId)return;
   const direct=validateDirect(m);
   if(direct&&direct.from!==selfId)onDirect?.(direct);
   return;
  }
  if(m.t==='state'){const peer=validatePeer(m.actor);if(peer&&peer.id!==selfId){table.upsert(peer);notify();}}
  else if(m.t==='bye'){if(typeof m.id==='string'&&m.id!==selfId){table.drop(m.id);notify();}}
  else if(m.t==='hello'){const peer=validatePresence(m.actor);if(peer&&peer.id!==selfId){table.upsert(peer);post({t:'welcome',actor:self()});notify();}}
  else if(m.t==='welcome'){const peer=validatePresence(m.actor);if(peer&&peer.id!==selfId){table.upsert(peer);notify();}}
 };
 post({t:'hello',actor:self()});
 const timer=setInterval(()=>{table.prune();notify();},2000);
 notify();
 return {
  publish(snapshot,force=false){
   const{color}=getIdentity();
   const wire=snapshotToWire(snapshot,color);
   if(wire)post({t:'state',actor:wire});
  },
  peers(){return table.list();},
  // 私聊：全部点对点，正文不进入任何公开消息。
  sendDM(to,body){if(typeof to!=='string'||!to)return null;const msg={t:'dm',from:selfId,to,id:dmId(),body:dmBody(body),time:Date.now()};post(msg);return msg;},
  sendInvite(to,session){if(typeof to!=='string'||!to)return null;const msg={t:'invite',from:selfId,to,session:session||dmId(),time:Date.now()};post(msg);return msg;},
  sendInviteReply(to,session,accept,reason=''){const msg={t:'invite-reply',from:selfId,to,session,accept:!!accept,reason:String(reason).slice(0,60),time:Date.now()};post(msg);return msg;},
  sendBlock(to){const msg={t:'block',from:selfId,to,time:Date.now()};post(msg);return msg;},
  leave(){post({t:'bye',id:selfId});clearInterval(timer);try{bc.close();}catch{}},
 };
}
