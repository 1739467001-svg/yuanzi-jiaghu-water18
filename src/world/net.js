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

// ---- WebSocket 传输（服务端权威世界）----
// 连接参数来自 VITE_WORLD_WS_URL；缺省时与页面同源（开发/单机部署均适用）。
// 协议见 server/worldServer.mjs：welcome/peer-joined/peer-left/peer-moved/peer-state
// + 点对点 dm/invite/invite-reply/block。BroadcastChannel 作为同浏览器兜底。
export function worldWsUrl(env=import.meta.env||{}){
 if(env.VITE_WORLD_WS_URL)return env.VITE_WORLD_WS_URL;
 if(typeof location==='undefined')return null;
 const protocol=location.protocol==='https:'?'wss:':'ws:';
 const room=new URLSearchParams(location.search).get('room')||'atom-jianghu';
 let stableId='';
 try{stableId=sessionStorage.getItem('atom-jianghu:player-id')||'';}catch{}
 const idParam=stableId?`&id=${encodeURIComponent(stableId)}`:'';
 return `${protocol}//${location.host}/ws?room=${encodeURIComponent(room)}${idParam}`;
}
export function createWsWorldLink({selfId,getIdentity=()=>({name:'同行侠客',color:'#427ab5'}),onEvent,onPeers,onDirect,room='atom-jianghu',url=null,WebSocketImpl=globalThis.WebSocket}={}){
 if(!WebSocketImpl||!selfId)return null;
 let socket;
 try{socket=new WebSocketImpl(url||worldWsUrl());}catch{return null;}
 const table=new PeerTable((kind,peer)=>onEvent?.({kind,peer}));
 const outbox=[];
 let selfServerId=selfId; // 服务端在 welcome 中分配，用于 direct 路由与广播身份
 let selfZone='town';
 const post=msg=>{
  if(socket.readyState===1){socket.send(JSON.stringify(msg));return;}
  if(socket.readyState===0){outbox.push(msg);if(outbox.length>20)outbox.shift();}
 };
 let lastListJson='';
 const notify=()=>{const list=table.list();const json=JSON.stringify(list);if(json!==lastListJson){lastListJson=json;onPeers?.(list);}};
 const onMessage=ev=>{
  let m;try{m=JSON.parse(ev.data);}catch{return;}
  if(!m||typeof m!=='object')return;
  if(m.t==='welcome'){
   if(m.self?.id)selfServerId=m.self.id;
   if(m.self?.zone)selfZone=m.self.zone;
   if(m.resumed)onEvent?.({kind:'resumed',peer:{id:m.self?.id,zone:m.self?.zone},x:m.self?.x,z:m.self?.z});
   onEvent?.({kind:'identity',id:m.self?.id,name:m.self?.name});
   for(const peer of (m.peers||[])){
    const valid=validatePeer({...peer,angle:peer.angle??0,state:peer.state||'自在漫游'});
    if(valid&&valid.id!==selfId){table.upsert(valid);onEvent?.({kind:'join',peer:valid});}
   }
   notify();
   return;
  }
  if(m.t==='peer-joined'){
   const valid=validatePeer({...m,angle:m.angle??0,state:m.state||'自在漫游'});
   if(valid&&valid.id!==selfServerId){table.upsert(valid);onEvent?.({kind:'join',peer:valid});notify();}
   return;
  }
  if(m.t==='peer-left'){if(m.id!==selfServerId){table.drop(m.id);notify();}return;}
  if(m.t==='peer-zone'){
   const existing=table.peers.get(m.id);
   if(existing)table.upsert({...existing,zone:m.zone,x:m.x,z:m.z});
   onEvent?.({kind:'peer-zone',peer:{id:m.id,zone:m.zone}});
   notify();
   return;
  }
  if(m.t==='zone-accepted'){selfZone=m.zone;onEvent?.({kind:'zone-accepted',peer:{id:selfServerId,zone:m.zone},x:m.x,z:m.z});return;}
  if(m.t==='zone-rejected'){onEvent?.({kind:'zone-rejected',peer:{id:selfServerId,reason:m.reason}});return;}
  if(m.t==='public-event'){onEvent?.({kind:'public-event',peer:{id:m.event?.actor||'ai',text:m.event?.text,kind:m.event?.kind,time:m.event?.time}});return;}
  if(m.t==='peer-moved'||m.t==='peer-state'){
   if(m.id===selfServerId)return;
   const existing=table.peers.get(m.id);
   if(!existing)return;
   table.upsert({...existing,x:m.t==='peer-moved'?m.x:existing.x,z:m.t==='peer-moved'?m.z:existing.z,angle:Number.isFinite(m.angle)?m.angle:existing.angle,state:m.state||existing.state});
   notify();
   return;
  }
  if(m.t==='move-accepted'){onEvent?.({kind:'move-accepted',x:m.x,z:m.z,path:m.path||[]});return;}
  if(m.t==='move-rejected'){onEvent?.({kind:'move-rejected',reason:m.reason});return;}
  if(m.t==='direct-undelivered'){onEvent?.({kind:'undelivered',to:m.to});return;}
  if(['dm','invite','invite-reply','block'].includes(m.t)){
   if(m.to!==selfServerId)return;
   const direct=validateDirect(m);
   if(direct&&direct.from!==selfServerId)onDirect?.(direct);
  }
 };
 socket.addEventListener('message',onMessage);
 socket.addEventListener('open',()=>{
  const{name,color}=getIdentity();
  post({t:'hello',name,color});
  while(outbox.length)post(outbox.shift());
 });
 socket.addEventListener('close',()=>{table.peers.clear();notify();});
 return {
  kind:'ws',
  socket,
  publish(snapshot){
   const{color}=getIdentity();
   // 位置意图提交给服务端校验；本地先不动，最终位置以 move-accepted 为准。
   post({t:'move',id:selfServerId,x:snapshot.x,z:snapshot.z,state:snapshot.state,angle:snapshot.angle,color});
  },
  sendDM(to,body){const msg={t:'dm',from:selfServerId,to,id:dmId(),body:dmBody(body),time:Date.now()};post(msg);return msg;},
  sendInvite(to){const msg={t:'invite',from:selfServerId,to,session:dmId(),time:Date.now()};post(msg);return msg;},
  sendInviteReply(to,session,accept,reason=''){const msg={t:'invite-reply',from:selfServerId,to,session,accept:!!accept,reason:String(reason).slice(0,60),time:Date.now()};post(msg);return msg;},
  sendBlock(to){const msg={t:'block',from:selfServerId,to,time:Date.now()};post(msg);return msg;},
  publishEvent(event){const msg={t:'public-event',kind:event?.kind,text:event?.text,actor:event?.actor,time:Date.now()};post(msg);return msg;},
  requestZone(zone){const msg={t:'zone',zone:String(zone||''),time:Date.now()};post(msg);return msg;},
  zone(){return selfZone;},
  peers(){return table.list();},
  leave(){try{post({t:'bye'});socket.close();}catch{}},
 };
}
// 传输选择：显式 WS > 同源 WS 可用 > BroadcastChannel（同浏览器演示）。
export function createTransport({wsUrl=null,prefer='auto',...options}={}){
 if(prefer==='broadcast')return createWorldLink(options);
 if(prefer==='ws')return createWsWorldLink({...options,url:wsUrl});
 if(typeof WebSocket!=='undefined'){
  const ws=createWsWorldLink({...options,url:wsUrl});
  if(ws)return ws;
 }
 return createWorldLink(options);
}
