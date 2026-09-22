import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePeer,validateDirect,PeerTable,snapshotToWire,wireToScene,createWorldLink,WORLD_CHANNEL,PEER_TIMEOUT} from '../src/world/net.js';
const waitFor=async(predicate,timeout=3000)=>{const start=Date.now();while(Date.now()-start<timeout){if(predicate())return true;await new Promise(r=>setTimeout(r,20));}return predicate();};
const room1='test-room-net-'+Math.random().toString(36).slice(2,8);
const room2='test-room-dm-'+Math.random().toString(36).slice(2,8);
import {publicActorSnapshot} from '../src/world/aiTownAdapter.js';

test('wire format only carries whitelisted public fields', () => {
 const wire=snapshotToWire({id:'p_1',name:'少侠',x:2.5,z:-3.5,angle:1.2,state:'前往茶楼',memory:['私人内容'],messages:[{role:'user',content:'私聊'}]},'#427ab5');
 assert.deepEqual(Object.keys(wire).sort(),['angle','color','id','name','state','x','z'].sort());
 assert.equal(JSON.stringify(wire).includes('私聊'),false);
 assert.equal(JSON.stringify(wire).includes('私人'),false);
 const back=wireToScene(wire);
 assert.equal(back.x,2.5);assert.equal(back.z,-3.5);
 // 坐标经过上游适配边界（townToScene/sceneToTown），非法坐标被拒绝。
 assert.equal(snapshotToWire({id:'p',name:'n',x:NaN,z:0,angle:0,state:''},'#000000'),null);
 assert.equal(validatePeer({id:'p',name:'n',color:'#zzzzzz',x:1,z:1,angle:0}).color,'#427ab5','非法颜色回退默认');
 assert.equal(validatePeer({id:'p',name:'x'.repeat(50),color:'#427ab5',x:1,z:1,angle:0}).name.length<=20,true);
 assert.equal(validatePeer({id:'',x:0,z:0,angle:0}),null);
 assert.equal(validatePeer({id:'p',x:9999,z:0,angle:0}),null,'越界坐标拒绝');
 assert.equal(validatePeer(null),null);
});

test('peer table tracks join, leave and timeout pruning', () => {
 let now=1000;const events=[];const table=new PeerTable((kind,peer)=>events.push(`${kind}:${peer.id}`),()=>now);
 table.upsert(validatePeer({id:'a',name:'甲',color:'#427ab5',x:0,z:0,angle:0,state:'漫游'}));
 table.upsert(validatePeer({id:'a',name:'甲',color:'#427ab5',x:1,z:0,angle:0,state:'漫游'}));
 assert.equal(events.filter(e=>e==='join:a').length,1,'重复 upsert 不重复触发加入');
 assert.equal(table.size(),1);
 assert.equal(table.list()[0].lastSeen,undefined,'对外列表不暴露内部字段');
 table.drop('a');
 assert.deepEqual(events,['join:a','leave:a']);
 table.upsert(validatePeer({id:'b',name:'乙',color:'#427ab5',x:0,z:0,angle:0,state:'漫游'}));
 now+=PEER_TIMEOUT+10;
 table.prune();
 assert.equal(table.size(),0,'超时未心跳的 peer 被清理');
});

test('two world links see each other, exchange positions and part cleanly', async (t) => {
 const eventsA=[];const eventsB=[];const peersA=[];const peersB=[];
 const A=createWorldLink({selfId:'p_a',getIdentity:()=>({name:'少侠甲',color:'#427ab5'}),onEvent:e=>eventsA.push(e.kind+':'+e.peer.id),onPeers:l=>peersA.push(l),channel:room1});
 const B=createWorldLink({selfId:'p_b',getIdentity:()=>({name:'少侠乙',color:'#719783'}),onEvent:e=>eventsB.push(e.kind+':'+e.peer.id),onPeers:l=>peersB.push(l),channel:room1});
 t.after(()=>{A?.leave();B?.leave();});
 await waitFor(()=>eventsA.some(e=>e.startsWith('join:'))&&eventsB.some(e=>e.startsWith('join:')));
 // 存在握手：加入事件立即触发，但位置未知前不进入可渲染列表。
 assert.ok(eventsA.includes('join:p_b')&&eventsB.includes('join:p_a'));
 assert.equal(A.peers().length,0,'未收到位置广播前不渲染');
 assert.equal(B.peers().length,0);
 // 位置广播：B 移动后 A 的 peer 表更新。
 A.publish({id:'p_a',name:'少侠甲',x:-3,z:4,angle:.5,state:'自在漫游'});
 B.publish({id:'p_b',name:'少侠乙',x:7,z:-2,angle:-1.5,state:'看展与歇脚'});
 await waitFor(()=>A.peers().length>0);
 assert.equal(A.peers().length,1);
 assert.equal(B.peers().length,1);
 const seen=B.peers()[0];
 assert.equal(seen.x,-3);assert.equal(seen.z,4);
 assert.equal(seen.name,'少侠甲');
 // 离开：bye 立即生效。
 A.leave();
 await new Promise(r=>setTimeout(r,60));
 assert.equal(B.peers().length,0);
 assert.ok(eventsB.includes('leave:p_a'));
 B.leave();
});

test('link is unavailable without BroadcastChannel or self id', () => {
 assert.equal(createWorldLink({selfId:'',BC:class{}}),null);
 assert.equal(createWorldLink({selfId:'p',BC:null}),null,'无 BroadcastChannel 时不影响本地世界');
});

test('upstream public actor snapshot never leaks conversations or memories', () => {
 const snapshot=publicActorSnapshot({players:[{id:'u1',position:{x:3,y:4},facing:{dx:0,dy:1},speed:1,human:true}]},[{playerId:'u1',name:'上游玩家'}],{originX:0,originY:0,scale:1});
 assert.deepEqual(snapshot,[{id:'u1',name:'上游玩家',controller:'human',position:{x:3,y:0,z:4},angle:0,speed:1}]);
 assert.throws(()=>publicActorSnapshot({players:[{id:'u1',position:{x:NaN,y:0}}]},[]),/Invalid world coordinates/);
});

test('private chat routes only to the addressee and never reaches observers or the public feed', async (t) => {
 const directsA=[],directsB=[],directsC=[],publicEvents=[];
 const A=createWorldLink({selfId:'p_a',onDirect:m=>directsA.push(m),channel:room2});
 const B=createWorldLink({selfId:'p_b',onDirect:m=>directsB.push(m),channel:room2});
 const C=createWorldLink({selfId:'p_c',onDirect:m=>directsC.push(m),onEvent:e=>publicEvents.push(e.kind),channel:room2});
 t.after(()=>{A?.leave();B?.leave();C?.leave();});
 await waitFor(()=>directsB.length>0);
 // 邀请与接受
 const invite=A.sendInvite('p_b');
 assert.ok(invite&&invite.to==='p_b');
 await waitFor(()=>directsB.some(m=>m.t==='invite'));
 assert.equal(directsB.filter(m=>m.t==='invite').length,1);
 assert.equal(directsC.length,0,'旁观者收不到邀请');
 const reply=B.sendInviteReply('p_a',invite.session,true);
 await waitFor(()=>directsA.some(m=>m.t==='invite-reply'&&m.accept));
 assert.equal(directsA.filter(m=>m.t==='invite-reply'&&m.accept).length,1);
 assert.equal(directsC.length,0);
 // 私聊正文只到对方
 const dm=A.sendDM('p_b','只有我们两人可见');
 await waitFor(()=>directsB.some(m=>m.t==='dm'));
 const received=directsB.find(m=>m.t==='dm');
 assert.equal(received.body,'只有我们两人可见');
 assert.equal(directsC.length,0,'旁观者结构上收不到私聊正文');
 assert.ok(!publicEvents.some(k=>k==='dm'),'私聊不产生公开事件');
 // 发送给自己的消息不被路由回来
 A.sendDM('p_a','自言自语');
 await waitFor(()=>directsB.some(m=>m.t==='dm'));
 assert.equal(directsA.filter(m=>m.t==='dm').length,0);
 // 屏蔽
 A.sendBlock('p_b');
 await waitFor(()=>directsB.some(m=>m.t==='block'));
 assert.ok(directsB.some(m=>m.t==='block'&&m.from==='p_a'));
 // 非法私聊消息被拒绝
 assert.equal(validateDirect({t:'dm',from:'p_a',to:'p_b',body:''}),null);
 assert.equal(validateDirect({t:'invite',from:'p_a'}),null);
 assert.equal(validateDirect({t:'dm',from:'p_a',to:'p_b',body:'x',extra:'泄漏字段'}).extra,undefined,'白名单字段');
 A.leave();B.leave();C.leave();
});
