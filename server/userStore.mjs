// 按账号隔离的云端收藏与记忆（PRD M01/13.5）。
// 数据按 userId 分文件存放；记忆结构带来源、授权范围与过期时间，删除即时生效。
// 服务端是权威：客户端提交的收藏/记忆列表必须带 baseVersion，冲突时以服务端为准并返回当前版本。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dataDir=process.env.ATOM_DATA_DIR||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data');
const MEMORY_TTL_DAYS=30;
const DAY=86400000;
const fileFor=userId=>path.join(dataDir,'users',`${userId}.json`);
const readState=userId=>{
 try{return JSON.parse(fs.readFileSync(fileFor(userId),'utf8'));}catch{return {userId,version:1,bookmarks:[],memories:[]};}
};
const writeState=(userId,state)=>{
 const file=fileFor(userId);const tmp=file+'.tmp';
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(tmp,JSON.stringify(state,null,2));
 fs.renameSync(tmp,file);
};
export function getState(userId){
 const state=readState(userId);
 return {version:state.version||1,bookmarks:state.bookmarks||[],memories:(state.memories||[]).filter(m=>!m.expiresAt||m.expiresAt>Date.now())};
}
export function saveBookmarks(userId,bookmarks,baseVersion){
 const state=readState(userId);
 const current=state.version||1;
 if(Number(baseVersion)&&Number(baseVersion)!==current)return {ok:false,error:'数据版本已变化，请刷新后重试',code:'version_conflict',state:getState(userId)};
 const ids=[...new Set((bookmarks||[]).filter(id=>typeof id==='string'&&id))].slice(0,500);
 state.bookmarks=ids;state.version=current+1;
 writeState(userId,state);
 return {ok:true,state:getState(userId)};
}
export function addMemory(userId,{agentId,text,source}){
 if(!agentId||typeof text!=='string'||!text.trim())throw new Error('记忆缺少角色或内容');
 const state=readState(userId);
 const time=Date.now();
 const memory={id:crypto.randomUUID(),agentId,text:text.slice(0,300),source:(source||'你主动表达的兴趣').slice(0,40),time,expiresAt:time+MEMORY_TTL_DAYS*DAY};
 state.memories=[...(state.memories||[]),memory].slice(-200);
 state.version=(state.version||1)+1;
 writeState(userId,state);
 return memory;
}
export function deleteMemory(userId,id){
 const state=readState(userId);
 const before=(state.memories||[]).length;
 state.memories=(state.memories||[]).filter(m=>m.id!==id);
 const changed=state.memories.length!==before;
 if(changed){state.version=(state.version||1)+1;writeState(userId,state);}
 return {ok:changed,state:getState(userId)};
}
export function clearMemories(userId){
 const state=readState(userId);
 state.memories=[];state.version=(state.version||1)+1;
 writeState(userId,state);
 return {ok:true,state:getState(userId)};
}
// 本地→云端迁移：按用户选择合并，不做静默归并（PRD 13.5）。
export function mergeLocal(userId,{bookmarks=[],memories=[]}={}){
 const state=readState(userId);
 const mergedBookmarks=[...new Set([...(state.bookmarks||[]),...bookmarks.filter(b=>typeof b==='string')])].slice(0,500);
 const existingTexts=new Set((state.memories||[]).map(m=>`${m.agentId}:${m.text}`));
 const time=Date.now();
 const imported=(memories||[]).filter(m=>m&&typeof m.text==='string'&&m.agentId&&!existingTexts.has(`${m.agentId}:${m.text}`))
  .slice(0,100).map(m=>({id:crypto.randomUUID(),agentId:m.agentId,text:m.text.slice(0,300),source:(m.source||'从本机迁移').slice(0,40),time:Number(m.time)||time,expiresAt:(Number(m.expiresAt)||time)+MEMORY_TTL_DAYS*DAY}));
 state.bookmarks=mergedBookmarks;
 state.memories=[...imported,...(state.memories||[])].slice(0,300);
 state.version=(state.version||1)+1;
 writeState(userId,state);
 return {ok:true,imported:{bookmarks:mergedBookmarks.length-(state.bookmarks||[]).length+imported.length,memories:imported.length},state:getState(userId)};
}
