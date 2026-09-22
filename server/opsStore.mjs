// 运营状态存储：发布覆盖、审计流水与发布版本。
// 原为纯内存；现持久化到 data/ops-state.json（原子写入，写失败时回退为仅内存，
// 不阻断开发流程）。内容服务（server/content.mjs）读取这里的覆盖并叠加到目录上，
// 因此“发布 / 撤回 / 回滚”对内容接口、共享展陈与导览立即一致生效。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PUBLICATION_STATUSES} from '../src/content/catalog.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const statePath=process.env.ATOM_OPS_STATE_PATH||path.join(root,'data','ops-state.json');
const emptyState=()=>({editionOverrides:{},workOverrides:{},audit:[],versions:[]});
let state=emptyState();
try{
 if(fs.existsSync(statePath)){
  const loaded=JSON.parse(fs.readFileSync(statePath,'utf8'));
  state={...emptyState(),...loaded,
   editionOverrides:{...loaded.editionOverrides},workOverrides:{...loaded.workOverrides},
   audit:[...loaded.audit||[]],versions:[...loaded.versions||[]]};
 }
}catch{state=emptyState();}
let persistOk=true;
function persist(){
 try{
  const tmp=statePath+'.tmp';
  fs.mkdirSync(path.dirname(statePath),{recursive:true});
  fs.writeFileSync(tmp,JSON.stringify(state,null,2));
  fs.renameSync(tmp,statePath);
  persistOk=true;
 }catch{persistOk=false;} // 只读文件系统等场景：保持内存态，不阻断开发
}
function pushAudit(entry){state.audit.unshift({...entry,time:Date.now()});if(state.audit.length>200)state.audit.length=200;persist();}
function assertStatus(status){if(!PUBLICATION_STATUSES.includes(status))throw new Error(`非法的发布状态: ${status}`);}
export function overrideEdition(id,status){assertStatus(status);const before=state.editionOverrides[id]||null;state.editionOverrides[id]=status;pushAudit({actor:'运营(本地开发)',action:'设置赛事发布状态',target:id,before,after:status});}
export function overrideWork(id,status){assertStatus(status);const before=state.workOverrides[id]||null;state.workOverrides[id]=status;pushAudit({actor:'运营(本地开发)',action:'设置作品发布状态',target:id,before,after:status});}
export function clearOverrides(){state.editionOverrides={};state.workOverrides={};pushAudit({actor:'运营(本地开发)',action:'清除全部发布覆盖',target:'*',before:null,after:null});}
export function getAudit(){return state.audit;}
export function logAudit(entry){pushAudit({actor:'运营(本地开发)',...entry});}
export function isPersisted(){return persistOk;}
// 发布版本：把当前生效的覆盖组合存为快照，可命名、可回滚。
export function saveVersion(label=''){
 const id='v'+(state.versions.length+1);
 state.versions.unshift({id,label:label||id,time:Date.now(),editionOverrides:{...state.editionOverrides},workOverrides:{...state.workOverrides}});
 if(state.versions.length>20)state.versions.length=20;
 pushAudit({actor:'运营(本地开发)',action:'创建发布版本',target:id,before:null,after:label||id});
 return id;
}
export function listVersions(){return state.versions;}
export function rollbackVersion(id){
 const version=state.versions.find(v=>v.id===id);
 if(!version)throw new Error(`发布版本不存在: ${id}`);
 const before={editions:Object.keys(state.editionOverrides).length,works:Object.keys(state.workOverrides).length};
 state.editionOverrides={...version.editionOverrides};
 state.workOverrides={...version.workOverrides};
 pushAudit({actor:'运营(本地开发)',action:'回滚发布版本',target:id,before:JSON.stringify(before),after:JSON.stringify({editions:Object.keys(state.editionOverrides).length,works:Object.keys(state.workOverrides).length})});
}
export function applyOverrides(data){
 return {...data,editions:data.editions.map(e=>({
  ...e,
  ...(state.editionOverrides[e.id]?{publicationStatus:state.editionOverrides[e.id]}:{}),
  works:e.works.map(w=>state.workOverrides[w.id]?{...w,publicationStatus:state.workOverrides[w.id]}:w),
 }))};
}
