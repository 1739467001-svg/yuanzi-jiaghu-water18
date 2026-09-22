import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryFor,isExpired,memoryRemainingDays,newMemory,MEMORY_TTL_DAYS} from '../src/storage.js';
const DAY=86400000;
test('new memories carry an expiry and stay visible until it passes', () => {
 const memory=newMemory({agentId:'ayuan',text:'我在做电商选题'});
 assert.ok(memory.expiresAt>memory.time);
 assert.equal(memory.expiresAt-memory.time,MEMORY_TTL_DAYS*DAY);
 assert.equal(isExpired(memory),false);
 assert.equal(memoryRemainingDays(memory),MEMORY_TTL_DAYS);
 const now=Date.now();
 assert.equal(isExpired(memory,now+MEMORY_TTL_DAYS*DAY+1000),true,'到期后不再可用');
 assert.equal(memoryRemainingDays(memory,now+MEMORY_TTL_DAYS*DAY+1000),0);
});
test('expired memories are filtered out of retrieval but not silently deleted', () => {
 const memories=[
  newMemory({agentId:'ayuan',text:'新鲜兴趣'}),
  {...newMemory({agentId:'ayuan',text:'过期兴趣'}),time:Date.now()-31*DAY,expiresAt:Date.now()-1*DAY},
  {...newMemory({agentId:'qinghe',text:'别人的新鲜兴趣'})},
 ];
 const live=memoryFor(memories,'ayuan');
 assert.equal(live.length,1);
 assert.equal(live[0].text,'新鲜兴趣');
 assert.equal(memories.length,3,'过期记录仍留在存储中，不静默清空');
 // 旧数据（无 expiresAt）按创建时间回推 TTL。
 const legacy=[{id:'x',agentId:'ayuan',text:'旧记录',time:Date.now()-31*DAY}];
 assert.equal(memoryFor(legacy,'ayuan').length,0);
 assert.equal(memoryFor(legacy,'ayuan',Date.now()-60*DAY).length,1);
});
test('per-agent isolation is preserved with expiry filtering', () => {
 const memories=[newMemory({agentId:'ayuan',text:'给阿原'}),newMemory({agentId:'qinghe',text:'给青禾'})];
 assert.deepEqual(memoryFor(memories,'qinghe').map(m=>m.text),['给青禾']);
 assert.deepEqual(memoryFor(memories,'ayuan').map(m=>m.text),['给阿原']);
 assert.equal(memoryFor(memories,'unknown').length,0);
 assert.equal(memoryFor([],'ayuan').length,0);
});
