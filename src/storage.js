const PREFIX='atom-jianghu-v1:';
// 记忆保留周期（PRD 9.3 候选值，上线前由产品/后端最终确认）：原文 30 天、私人摘要 90 天。
// 到期后不再参与检索与展示，但记录仍留在本地，由用户显式删除或后续同步策略处理，不做静默清空。
export const MEMORY_TTL_DAYS=30;
const DAY=86400000;
export function readStore(key,fallback){try{const raw=localStorage.getItem(PREFIX+key);return raw===null?fallback:JSON.parse(raw);}catch{return fallback;}}
export function writeStore(key,value){try{localStorage.setItem(PREFIX+key,JSON.stringify(value));return true;}catch{return false;}}
export function isExpired(memory,now=Date.now()){
 if(!memory)return true;
 // 没有时间戳的旧记录无法判断期限，视为仍然有效（不清空用户数据）。
 if(!Number.isFinite(memory.expiresAt)&&!Number.isFinite(memory.time))return false;
 const expiresAt=Number.isFinite(memory.expiresAt)?memory.expiresAt:memory.time+MEMORY_TTL_DAYS*DAY;
 return expiresAt<=now;
}
export function memoryFor(memories,agentId,now=Date.now()){
 return (memories||[]).filter(m=>m.agentId===agentId&&!isExpired(m,now));
}
export function memoryRemainingDays(memory,now=Date.now()){
 if(!memory)return 0;
 if(!Number.isFinite(memory.expiresAt)&&!Number.isFinite(memory.time))return MEMORY_TTL_DAYS;
 const expiresAt=Number.isFinite(memory.expiresAt)?memory.expiresAt:memory.time+MEMORY_TTL_DAYS*DAY;
 return Math.max(0,Math.ceil((expiresAt-now)/DAY));
}
export function newMemory({agentId,text,source}){
 const time=Date.now();
 return {id:crypto.randomUUID(),agentId,text,time,expiresAt:time+MEMORY_TTL_DAYS*DAY,source:source||'你主动表达的兴趣'};
}
