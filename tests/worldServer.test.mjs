import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMove} from '../server/worldServer.mjs';

// 纯逻辑测试：服务端对移动意图的权威裁决（可走区域、桥、越界、建筑）。
const peer=(x,z)=>({x,z});
test('server accepts walkable targets and snaps them to the grid', () => {
 const result=resolveMove(peer(-3,1),{x:6,z:6});
 assert.ok(result,'广场目标应被接受');
 assert.ok(result.x>=-18&&result.x<=18&&result.z>=-14&&result.z<=14);
 assert.ok(Array.isArray(result.path)&&result.path.length>0,'应返回服务端计算的路径');
 assert.equal(result.path.at(-1)[0],result.x,'路径终点即落点');
});
test('server rejects invalid coordinates and building footprints', () => {
 assert.equal(resolveMove(peer(-3,1),{x:NaN,z:0}),null,'非法坐标拒绝');
 assert.equal(resolveMove(peer(-3,1),{x:undefined,z:0}),null,'缺坐标拒绝');
 // 建筑 footprint 内不可走（hall 位于 0,-9，7×5；吸附点必须在建筑外）。
 const hall=resolveMove(peer(-3,1),{x:0,z:-9});
 assert.ok(hall,'建筑中心目标被吸附到建筑外');
 assert.ok(Math.abs(hall.x-0)>3.5||Math.abs(hall.z+9)>2.5,'落点不得落在建筑 footprint 内');
});
test('server keeps river unreachable except at the bridges', () => {
 // 河心目标：吸附后的落点必须在岸上或桥面，不得停在河中。
 for(const [x,z] of [[0,5],[2,5],[-2,5],[7,5],[12,5]]){
  const result=resolveMove(peer(-3,1),{x,z});
  if(!result)continue;
  const onBridge=(result.x>=-5&&result.x<=-3)||(result.x>=9&&result.x<=11);
  const onLand=!(result.z>=4&&result.z<=6);
  assert.ok(onBridge||onLand,`落点 (${result.x},${result.z}) 不得停在河中`);
 }
 // 桥面目标可直接通行。
 assert.ok(resolveMove(peer(-3,1),{x:-4,z:5}),'桥面应可通行');
 assert.ok(resolveMove(peer(-3,1),{x:10,z:5}),'另一座桥应可通行');
});
test('server clamps targets outside the map into walkable space', () => {
 const result=resolveMove(peer(-3,1),{x:50,z:0});
 assert.ok(result,'地图外目标被就近吸附到可走点');
 assert.ok(result.x<=18&&result.z>=-14&&result.z<=14);
 const far=resolveMove(peer(-3,1),{x:-999,z:999});
 assert.ok(far,'极端目标也得到合法落点');
 assert.ok(far.x>=-18&&far.z<=14);
});

test('zone entries match the town config and only allow declared crossings', async () => {
 const {ZONE_ENTRIES}=await import('../server/worldServer.mjs');
 assert.ok(ZONE_ENTRIES.town,'主镇必须存在');
 assert.ok(ZONE_ENTRIES.hall,'展馆必须存在');
 // 入口与 src/world/config.js 的 PLACES 一致（hall entry [0,-4]；hall 回 town 的落点 [0,7]）。
 assert.deepEqual(ZONE_ENTRIES.town.entries.hall,[0,-4]);
 assert.deepEqual(ZONE_ENTRIES.hall.entries.town,[0,7]);
 for(const zone of Object.values(ZONE_ENTRIES)){
  assert.ok(Array.isArray(zone.spawn)&&zone.spawn.length===2,'每个区域必须有出生点');
  assert.ok(zone.spawn.every(Number.isFinite),'出生点坐标必须有限');
 }
});
