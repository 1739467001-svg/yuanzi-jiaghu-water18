// 服务端权威世界（PRD W02/W03/G2）。
// 职责：房间管理、加入/离开、位置校验与广播、私聊点对点路由、心跳与超时清理。
// 权威规则：可走区域由服务端的 walkable() 决定（与客户端同一份网格定义），
// 客户端只提交意图（目标点），最终位置由服务端计算；非法目标直接拒绝。
// 私聊正文只在收发双方之间路由，不进入房间广播（PRD 9.1）。
import {WebSocketServer} from 'ws';
import {walkable,nearestWalkable,findPath,terrainHeight} from '../src/world/engine.js';
import {userForToken,readCookie,sameOrigin} from './auth.mjs';
import {addMemory} from './userStore.mjs';

const HEARTBEAT_MS=15000;
const PEER_TIMEOUT_MS=45000;
const MAX_ROOMS=50;
const ROOM_CAPACITY=20; // PRD 15.1 设计目标：20 位真人 + 8 位 AI
const rooms=new Map();
const roomOf=id=>rooms.get(id);
const ensureRoom=id=>{
 if(!rooms.has(id)){
  if(rooms.size>=MAX_ROOMS)return null;
  rooms.set(id,{id,peers:new Map(),version:1});
 }
 return rooms.get(id);
};
const publicSnapshot=room=>[...room.peers.values()].map(p=>({id:p.id,name:p.name,color:p.color,x:p.x,z:p.z,angle:p.angle,state:p.state,controller:'human'}));
const broadcast=(room,message,exceptId)=>{
 const payload=JSON.stringify(message);
 for(const peer of room.peers.values()){
  if(peer.id===exceptId)continue;
  if(peer.socket.readyState===1)peer.socket.send(payload);
 }
};
const sendTo=(peer,message)=>{if(peer.socket.readyState===1)peer.socket.send(JSON.stringify(message));};
const leaveRoom=(peer,reason='left')=>{
 const room=roomOf(peer.roomId);
 if(!room)return;
 room.peers.delete(peer.id);
 broadcast(room,{t:'peer-left',id:peer.id,reason});
 if(room.peers.size===0)rooms.delete(room.id);
};
// 移动意图：服务端决定是否可走与最终落点（PRD 7.2：服务端决定可走区域与最终位置）。
export function resolveMove(peer,{x,z}){
 if(!Number.isFinite(x)||!Number.isFinite(z))return null;
 const target=nearestWalkable(x,z,walkable);
 if(!walkable(target[0],target[1]))return null;
 if(target[0]===peer.x&&target[1]===peer.z)return {x:peer.x,z:peer.z,path:[]};
 const path=findPath([peer.x,peer.z],target,walkable);
 if(!path.length)return null;
 return {x:target[0],z:target[1],path};
}
function handleMessage(peer,raw){
 let message;
 try{message=JSON.parse(raw);}catch{return;}
 if(!message||typeof message!=='object')return;
 const room=roomOf(peer.roomId);
 if(!room)return;
 switch(message.t){
  case 'move':{
   // move 同时携带轻量状态（如“私人交谈中”），与位置一起广播。
   if(typeof message.state==='string'&&message.state)peer.state=message.state.slice(0,20);
   if(Number.isFinite(message.angle))peer.angle=message.angle;
   const resolved=resolveMove(peer,message);
   if(!resolved)return sendTo(peer,{t:'move-rejected',reason:'目标不可通行'});
   peer.path=resolved.path;peer.x=resolved.x;peer.z=resolved.z;
   peer.socket.send(JSON.stringify({t:'move-accepted',x:peer.x,z:peer.z,path:peer.path}));
   broadcast(room,{t:'peer-moved',id:peer.id,x:peer.x,z:peer.z,angle:peer.angle,state:peer.state});
   break;
  }
  case 'state':{
   // 轻量状态同步（状态文案/朝向）：不做位置校验，位置只认 move。
   if(typeof message.state==='string')peer.state=message.state.slice(0,20);
   if(Number.isFinite(message.angle))peer.angle=message.angle;
   broadcast(room,{t:'peer-state',id:peer.id,state:peer.state,angle:peer.angle});
   break;
  }
  case 'dm':
  case 'invite':
  case 'invite-reply':
  case 'block':{
   if(typeof message.to!=='string'||!message.to)return;
   const target=room.peers.get(message.to);
   if(!target)return sendTo(peer,{t:'direct-undelivered',to:message.to});
   // 私聊：只发给目标，不进房间广播；正文不落世界快照。
   const forward={...message,from:peer.id,to:message.to,time:Date.now()};
   if(message.t==='dm'){
    if(typeof forward.body!=='string'||!forward.body)return;
    forward.body=forward.body.slice(0,500);
    // 授权记忆：发送方开启记忆时，由服务端落一条（PRD M01）。
    if(message.remember&&peer.userId)addMemory(peer.userId,{agentId:'peer:'+message.to,text:forward.body,source:'与同行侠客的私聊'}).catch(()=>{});
   }
   if(message.t==='invite-reply')forward.accept=!!message.accept;
   sendTo(target,forward);
   break;
  }
  case 'ping':sendTo(peer,{t:'pong',time:Date.now()});break;
  default:break;
 }
}
export function attachWorldServer(server,{path='/ws'}={}){
 const wss=new WebSocketServer({server,path});
 wss.on('connection',(socket,request)=>{
  let url;
  try{url=new URL(request.url,'http://localhost');}catch{socket.close();return;}
  const roomId=(url.searchParams.get('room')||'atom-jianghu').slice(0,40);
  const token=url.searchParams.get('token')||readCookie(request.headers.cookie||'');
  const user=token?userForToken(token):null;
  const peerId=user?user.id:'guest_'+Math.random().toString(36).slice(2,10);
  const room=ensureRoom(roomId);
  if(!room){socket.close(1013,'房间已满');return;}
  if(room.peers.size>=ROOM_CAPACITY){socket.close(1013,'房间已满，请稍后再试');return;}
  const name=(url.searchParams.get('name')||user?.nickname||'同行侠客').slice(0,20);
  const color=/^#[0-9a-f]{6}$/i.test(url.searchParams.get('color')||'')?url.searchParams.get('color'):'#427ab5';
  const peer={id:peerId,name,color,roomId,x:-3,z:1,angle:0,state:'自在漫游',path:[],socket,userId:user?.id||null,lastSeen:Date.now()};
  room.peers.set(peer.id,peer);
  socket.isAlive=true;
  sendTo(peer,{t:'welcome',self:{id:peer.id,name:peer.name,color:peer.color},room:roomId,capacity:ROOM_CAPACITY,peers:publicSnapshot(room).filter(p=>p.id!==peer.id),walkable:{minX:-18,maxX:18,minZ:-14,maxZ:14}});
  broadcast(room,{t:'peer-joined',id:peer.id,name:peer.name,color:peer.color,x:peer.x,z:peer.z,angle:peer.angle,state:peer.state},peer.id);
  socket.on('message',raw=>{peer.lastSeen=Date.now();handleMessage(peer,String(raw));});
  socket.on('pong',()=>{socket.isAlive=true;peer.lastSeen=Date.now();});
  socket.on('close',()=>leaveRoom(peer,'closed'));
  socket.on('error',()=>leaveRoom(peer,'error'));
 });
 const heartbeat=setInterval(()=>{
  for(const room of rooms.values()){
   for(const peer of [...room.peers.values()]){
    if(Date.now()-peer.lastSeen>PEER_TIMEOUT_MS){leaveRoom(peer,'timeout');continue;}
    if(peer.socket.readyState===1){peer.socket.isAlive=false;try{peer.socket.ping();}catch{}}
   }
  }
 },HEARTBEAT_MS);
 wss.on('close',()=>{clearInterval(heartbeat);for(const room of rooms.values())room.peers.clear();rooms.clear();});
 return wss;
}
export function roomSummary(roomId){const room=rooms.get(roomId);return room?{id:room.id,peers:[...room.peers.values()].map(p=>({id:p.id,name:p.name}))}:null;}
export function worldServerState(){
 return {rooms:[...rooms.values()].map(r=>({id:r.id,peers:r.peers.size})),capacity:ROOM_CAPACITY};
}
