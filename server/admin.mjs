// 运营后台接口：草稿预览、发布、撤回、发布版本与回滚、导入任务与审计流水。
// 发布覆盖与审计持久化在 data/ops-state.json（见 opsStore.mjs），重启不丢失；
// 导入任务把来源展示站数据写入 editions.json 并复制媒体，开发态下内容服务随后按请求热加载。
// GET  /api/admin/content           全量目录（含草稿与撤回）+ 版本 + 审计 + 持久化状态
// POST /api/admin/publication       {scope:'edition'|'work', id, status}
// POST /api/admin/reset             清除全部发布覆盖
// POST /api/admin/version           {label} 创建发布版本（当前生效覆盖的快照）
// POST /api/admin/rollback          {id} 回滚到指定发布版本
// POST /api/admin/import/preview   来源数据差异预览（不写文件）
// POST /api/admin/import/apply     应用导入（写 editions.json + 复制媒体）
import {applyOverrides,overrideEdition,overrideWork,clearOverrides,getAudit,isPersisted,saveVersion,listVersions,rollbackVersion,logAudit} from './opsStore.mjs';
import {catalog,PUBLICATION_STATUSES} from '../src/content/catalog.js';
import {planImport,runImport} from '../scripts/import-engine.mjs';

const send=(res,status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
const readBody=req=>new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>1e5)reject(new Error('请求体过大'));});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error('请求体不是合法 JSON'));}});req.on('error',reject);});

export function adminPlugin(){
 const plugin={name:'atom-admin-service',configureServer(server){
  server.middlewares.use(async (req,res,next)=>{
   const url=new URL(req.url,'http://localhost');
   if(!url.pathname.startsWith('/api/admin'))return next();
   try{
    if(url.pathname==='/api/admin/content'&&req.method==='GET'){
     const full=applyOverrides(catalog);
     return send(res,200,{snapshotId:catalog.snapshotId,statuses:PUBLICATION_STATUSES,persisted:isPersisted(),editions:full.editions,versions:listVersions(),audit:getAudit()});
    }
    if(url.pathname==='/api/admin/publication'&&req.method==='POST'){
     const body=await readBody(req);
     const {scope,id,status}=body;
     if(!PUBLICATION_STATUSES.includes(status))return send(res,400,{error:'非法的发布状态',code:'bad_status'});
     if(scope==='edition'){
      if(!catalog.editions.some(e=>e.id===id))return send(res,404,{error:'赛事不存在',code:'not_found'});
      overrideEdition(id,status);
     }else if(scope==='work'){
      if(!catalog.editions.flatMap(e=>e.works).some(w=>w.id===id))return send(res,404,{error:'作品不存在',code:'not_found'});
      overrideWork(id,status);
     }else return send(res,400,{error:'scope 必须是 edition 或 work',code:'bad_scope'});
     return send(res,200,{ok:true,audit:getAudit().slice(0,20)});
    }
    if(url.pathname==='/api/admin/reset'&&req.method==='POST'){
     clearOverrides();
     return send(res,200,{ok:true,audit:getAudit().slice(0,20)});
    }
    if(url.pathname==='/api/admin/version'&&req.method==='POST'){
     const body=await readBody(req);
     const id=saveVersion(String(body.label||'').slice(0,40));
     return send(res,200,{ok:true,id,versions:listVersions(),audit:getAudit().slice(0,20)});
    }
    if(url.pathname==='/api/admin/rollback'&&req.method==='POST'){
     const body=await readBody(req);
     rollbackVersion(String(body.id||''));
     return send(res,200,{ok:true,versions:listVersions(),audit:getAudit().slice(0,20)});
    }
    if(url.pathname==='/api/admin/import/preview'&&req.method==='POST'){
     const plan=planImport();
     return send(res,200,{ok:true,plan});
    }
    if(url.pathname==='/api/admin/import/apply'&&req.method==='POST'){
     const summary=runImport();
     logAudit({action:'应用来源导入',target:'editions.json',before:null,after:`${summary.editions} 届 / ${summary.works} 条`});
     return send(res,200,{ok:true,summary,audit:getAudit().slice(0,20),note:'已写入 editions.json 并复制媒体；如使用 preview 模式请重启开发服务器。'});
    }
    return send(res,404,{error:'运营接口不存在',code:'not_found'});
   }catch(error){return send(res,400,{error:error.message,code:'bad_request'});}
  });
 }};
 plugin.configurePreviewServer=plugin.configureServer;
 return plugin;
}
