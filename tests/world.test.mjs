import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldEngine,findPath,walkable,hallWalkable} from '../src/world/engine.js';
import {PLACES} from '../src/world/config.js';
import {demoReply,retrieve,allWorks} from '../server/chat.mjs';
import {memoryFor} from '../src/storage.js';

test('every building entrance can be reached without crossing walls or the river',()=>{
 for(const p of PLACES){const route=findPath([-3,1],p.entry);assert.ok(route.length,p.id);assert.deepEqual(route.at(-1),p.entry);for(let i=0;i<route.length;i++){assert.ok(walkable(...route[i]));if(i)assert.equal(Math.abs(route[i][0]-route[i-1][0])+Math.abs(route[i][1]-route[i-1][1]),1);}}
});
test('cross-river travel uses a bridge and cannot walk on water',()=>{const route=findPath([0,0],[0,10]);assert.ok(route.some(p=>p[1]===5));for(const [x,z] of route)if(z===5)assert.ok(x>=-5&&x<=-3||x>=9&&x<=11);});
test('indoor paths avoid all eight exhibit stands',()=>{const path=findPath([0,8],[0,-7],hallWalkable);assert.ok(path.length);assert.deepEqual(path.at(-1),[0,-7]);assert.ok(path.every(p=>hallWalkable(...p)));});
test('a full hour of local simulation remains finite and produces social memories',()=>{let count=0;const engine=new WorldEngine(()=>count++);for(let i=0;i<36000;i++)engine.tick(.1);assert.ok(count>20);assert.ok(engine.agents.some(a=>a.memory.length));for(const a of engine.agents){assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.z));assert.ok(a.memory.length<=20);assert.ok(a.path.every(p=>walkable(...p)));}});
test('private chat interrupts public activity and stays held until release',()=>{const e=new WorldEngine();e.hold('ayuan');const a=e.agents[0],x=a.x,z=a.z;for(let i=0;i<1000;i++)e.tick(.1);assert.equal(a.x,x);assert.equal(a.z,z);assert.equal(a.state,'与你交谈');assert.equal(a.partner,null);e.release(a.id);for(let i=0;i<200;i++)e.tick(.1);assert.equal(a.held,false);assert.notEqual(a.state,'与你交谈');});
test('content IDs and references remain isolated across competitions',()=>{assert.equal(allWorks.length,56);assert.equal(new Set(allWorks.map(w=>w.id)).size,56);assert.equal(allWorks.filter(w=>w.editionId==='funskills').length,38);for(const w of allWorks){assert.ok(w.id.startsWith(w.editionId+'--'));assert.equal(w.wechat,undefined);assert.equal(w.qr,undefined);}});
test('guide retrieves real exhibits and does not invent awards',()=>{const works=retrieve('推荐效率工具作品');assert.ok(works.length);assert.ok(works.every(w=>allWorks.some(real=>real.id===w.id)));const reply=demoReply({message:'谁是冠军',agentId:'ayuan'});assert.match(reply.text,/没有收录/);assert.equal(reply.mode,'demo');});
test('private memories are selected by exact agent identity and absent memories are not invented',()=>{const memories=[{agentId:'ayuan',text:'我喜欢写作'},{agentId:'moyu',text:'我喜欢编程'}];assert.deepEqual(memoryFor(memories,'ayuan'),[memories[0]]);const reply=demoReply({message:'你记得我吗',agentId:'ayuan',memories:[]});assert.match(reply.text,/还没有/);assert.equal(memoryFor([], 'ayuan').length,0);});

test('AI Town coordinates round trip without leaking private world fields',async()=>{const {townToScene,sceneToTown,publicActorSnapshot}=await import('../src/world/aiTownAdapter.js');const point={x:14,y:32},transform={originX:10,originY:20,scale:2};assert.deepEqual(sceneToTown(townToScene(point,transform),transform),point);const [actor]=publicActorSnapshot({players:[{id:'p:0',position:point,facing:{dx:1,dy:0},speed:1,human:'user'}],conversations:[{secret:'private'}],memories:[{secret:'private'}]},[{playerId:'p:0',name:'侠客'}],transform);assert.equal(actor.controller,'human');assert.equal(actor.angle,Math.PI/2);assert.equal(actor.name,'侠客');assert.equal(actor.conversations,undefined);assert.equal(actor.memories,undefined);assert.throws(()=>townToScene({x:NaN,y:0}));});

test('actors stand on the arch of the bridge rather than inside it',async()=>{const {terrainHeight}=await import('../src/world/engine.js');assert.ok(terrainHeight(-4,5)>.8);assert.ok(terrainHeight(10,5)>.8);assert.equal(terrainHeight(0,0),0);assert.equal(terrainHeight(0,5),0);});

test('day phases gate agent destinations and surface as world events', async () => {
  const {phaseAt, DAY_PHASES} = await import('../src/world/engine.js');
  assert.equal(phaseAt(7).name, '清晨');
  assert.equal(phaseAt(10).name, '上午');
  assert.equal(phaseAt(13).name, '午后');
  assert.equal(phaseAt(16).name, '傍晚');
  assert.equal(phaseAt(20).name, '入夜');
  assert.equal(phaseAt(2).name, '深夜');
  assert.equal(new Set(DAY_PHASES.map(p => p.name)).size, DAY_PHASES.length);
  const events = [];
  const engine = new WorldEngine(e => events.push(e));
  assert.equal(engine.phase().name, '清晨');
  const startClock = engine.clock;
  for (let i = 0; i < 4500; i++) engine.tick(.1); // 约 5 个游戏小时，时钟不跨天回绕
  assert.ok(engine.clock > startClock, '世界时钟应随时间推进');
  assert.ok(events.some(e => e.kind === 'phase'), '时辰流转应产生世界事件');
  // 每个agent在时辰偏好内选择去处：目的地kind需匹配某个阶段偏好，或回退到日程建筑。
  const {PLACES} = await import('../src/world/config.js');
  const preferred = new Set(DAY_PHASES.flatMap(p => p.prefer));
  for (const a of engine.agents) for (const id of a.places) assert.ok(preferred.has(id) || PLACES.some(p => p.id === id));
  assert.ok(engine.agents.every(a => Number.isFinite(a.x) && Number.isFinite(a.z)));
});

test('AI viewing state machine runs through all phases and records sourced impressions', async () => {
 const {WorldEngine}=await import('../src/world/engine.js');
 // 单件匹配作品 + 确定性驱动：只操作知微，直接推进 advanceView，不依赖 tick 随机排程。
 const works=[{id:'funskills--skillhub',title:'SkillHub',tagline:'团队技能一键共享',track:'效率工具',tags:['效率'],contentVersion:1}];
 const events=[];const engine=new WorldEngine(e=>events.push(e),()=>works);
 engine.clock=13;
 const shouguan=engine.agents.find(a=>a.id==='shouguan');
 const planned=engine.planView(shouguan);
 assert.ok(planned,'应能排下观展任务');
 assert.equal(planned.phase,'planned');
 assert.equal(planned.workId,'funskills--skillhub');
 assert.ok(events.some(e=>e.kind==='view'&&e.workId==='funskills--skillhub'));
 // 直接驱动状态机：planned→moving→observing→generating→completed
 const phases=['planned'];
 for(let i=0;i<600&&shouguan.viewing;i++){const before=shouguan.viewing.phase;engine.time+=.1;engine.advanceView(shouguan,.1);if(shouguan.viewing&&shouguan.viewing.phase!==before)phases.push(shouguan.viewing.phase);}
 assert.equal(shouguan.viewing,null,'观展任务应已完成并清理');
 assert.deepEqual(phases,['planned','moving','observing','generating']);
 const doneEvent=events.filter(e=>e.kind==='view'&&e.impression).at(-1);
 assert.ok(doneEvent,'应产生带观感的观展事件');
 assert.match(doneEvent.text,/留下了观感/);
 const impression=doneEvent.impression;
 assert.ok(impression.length<=60,'观感不超过 60 字');
 assert.match(impression,/观感/,'观感须标识为 AI 观点');
 assert.ok(shouguan.memory.some(m=>m.startsWith('看了《')),'公共记忆应记录观展');
 assert.equal(shouguan.views,1);
 // 冷却：唯一候选已看，同版本不再排
 assert.equal(engine.planView(shouguan),null);
 // 预算：全局观感生成有上限（阿原同样匹配效率工具）
 const ayuan=engine.agents.find(a=>a.id==='ayuan');
 engine.viewBudget=1;
 assert.ok(engine.planView(ayuan),'预算内可排');
 engine.viewBudget=0;
 assert.equal(engine.planView(ayuan),null,'预算耗尽后不再排');
});

test('viewing tasks cancel when the work is withdrawn or leaves the shared exhibition', async () => {
 const {WorldEngine}=await import('../src/world/engine.js');
 let works=[{id:'funskills--lifetool',title:'生活好帮手',tagline:'日常小事一键办好',track:'生活成长',tags:['生活'],contentVersion:1}];
 const events=[];const engine=new WorldEngine(e=>events.push(e),()=>works);
 engine.clock=13;
 const ayuan=engine.agents.find(a=>a.id==='ayuan');
 engine.planView(ayuan);
 assert.ok(ayuan.viewing);
 // 运营撤回：作品离开共享展位
 works=[];
 engine.tick(.1);
 assert.equal(ayuan.viewing,null,'撤回后任务立即取消');
 const cancel=events.find(e=>e.kind==='view-cancel');
 assert.ok(cancel,'应产生取消事件');
 assert.match(cancel.text,/作品已撤回|展位已更新/);
 assert.ok(!events.some(e=>e.kind==='view'&&e.impression),'取消不得产生观感');
 assert.equal(ayuan.views,0);
});

test('impression generator stays within limits and never fabricates results', async () => {
 const {generateImpression,impressionHasNoFabrication}=await import('../src/world/engine.js');
 const agent={name:'知微'};
 const work={title:'一个名字特别长的作品标题用来测试长度上限的情况',tagline:'一句话简介也刻意写得足够长以便触发截断逻辑验证',track:'效率工具',tags:['工具']};
 const text=generateImpression(agent,work);
 assert.ok(text.length<=60);
 assert.ok(impressionHasNoFabrication(text));
 assert.ok(generateImpression(agent,{title:'x',tagline:'',track:''}).length<=60,'缺字段时也要安全');
 assert.ok(!/第一名|冠军/.test(generateImpression({name:'阿原'},{title:'任何作品',tagline:'任何一句话',track:'任何赛道'})));
});
