// 只读内容服务。赛事目录与作品数据统一来自 src/content/catalog.js 的发布过滤，
// 3D 展厅、阅读目录与 AI 导览读取同一份已发布数据。
// 运营后台（server/admin.mjs）的发布覆盖通过 opsStore 叠加到这里，
// 因此撤回一篇作品，目录、详情、共享展陈与导览立即一致生效。
// 运营“应用导入”后，开发服务器会按请求重新读取 editions.json；preview（纯 Node）模式下需重启。
// GET /api/content/health          服务与快照状态
// GET /api/content/catalog         完整已发布目录（前端统一入口）
// GET /api/exhibitions             赛事目录摘要（兼容旧命名，实际承载赛事目录）
// GET /api/exhibitions/{editionId} 一届赛事详情
// GET /api/works?edition=&track=&q=  筛选作品；生产版增加分页与稳定排序
// GET /api/works/{workId}          作品详情
import {catalog as staticCatalog} from '../src/content/catalog.js';
import {SHARED_EXHIBITION} from '../src/content/exhibition.js';
import {applyOverrides} from './opsStore.mjs';

// 开发态（Vite 模块运行器）按查询串重新求值模块，从而读取刚写入的 editions.json；
// preview 态（普通 Node）会抛错并回退到启动时加载的快照。
async function loadCatalogModule(){
 try{return await import('../src/content/catalog.js?ops='+Date.now());}
 catch{return {catalog:staticCatalog};}
}
const liveCatalog=mod=>applyOverrides(mod.catalog);
const livePublishedEditions=mod=>liveCatalog(mod).editions.filter(e=>e.publicationStatus==='已发布');
const livePublishedWorks=mod=>livePublishedEditions(mod).flatMap(e=>e.works.filter(w=>w.publicationStatus==='已发布'));
const liveWorksOf=edition=>edition.works.filter(w=>w.publicationStatus==='已发布');
const liveQuery=(mod,{editionId,track,q}={})=>livePublishedWorks(mod).filter(work=>
 (!editionId||work.editionId===editionId)&&
 (!track||track==='全部'||work.track===track)&&
 (!q||[work.title,work.author,work.track,work.tagline,work.description,...(work.tags||[])].join(' ').toLowerCase().includes(q.toLowerCase())));
const liveExhibitionEntryIds=mod=>livePublishedWorks(mod).filter(w=>w.editionId===SHARED_EXHIBITION.sourceEditionId).map(w=>w.id);
const liveZoneCount=mod=>Math.max(1,Math.ceil(liveExhibitionEntryIds(mod).length/SHARED_EXHIBITION.zoneSize));
const send=(res,status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
const routeId=(pathname,prefix)=>{const value=decodeURIComponent(pathname.slice(prefix.length));return value&&!value.includes('/')?value:null;};

export function contentPlugin(){
 const plugin={name:'atom-content-service',configureServer(server){
  server.middlewares.use(async (req,res,next)=>{
   const url=new URL(req.url,'http://localhost');
   if(!url.pathname.startsWith('/api/content')&&!url.pathname.startsWith('/api/exhibitions')&&!url.pathname.startsWith('/api/works'))return next();
   if(req.method!=='GET')return send(res,405,{error:'内容服务只读',code:'method_not_allowed'});
   const mod=await loadCatalogModule();
   const anyEdition=id=>liveCatalog(mod).editions.find(e=>e.id===id);
   const anyWork=id=>liveCatalog(mod).editions.flatMap(e=>e.works).find(w=>w.id===id);
   if(url.pathname==='/api/content/health')return send(res,200,{ok:true,snapshotId:mod.catalog.snapshotId,editions:livePublishedEditions(mod).length,works:liveQuery(mod).length});
   if(url.pathname==='/api/content/catalog'){
    return send(res,200,{snapshotId:mod.catalog.snapshotId,exhibition:{id:SHARED_EXHIBITION.id,layoutVersion:SHARED_EXHIBITION.layoutVersion,zoneCount:liveZoneCount(mod),entryIds:liveExhibitionEntryIds(mod)},editions:livePublishedEditions(mod).map(e=>({...e,works:liveWorksOf(e)}))});
   }
   if(url.pathname==='/api/exhibitions'){
    return send(res,200,{items:livePublishedEditions(mod).map(({works,...edition})=>({...edition,workCount:works.length}))});
   }
   if(url.pathname.startsWith('/api/exhibitions/')){
    const id=routeId(url.pathname,'/api/exhibitions/');
    const edition=livePublishedEditions(mod).find(e=>e.id===id);
    if(edition)return send(res,200,{...edition,works:liveWorksOf(edition)});
    const existing=anyEdition(id);
    if(existing&&existing.publicationStatus==='已撤回')return send(res,410,{error:'该赛事已撤回',code:'withdrawn'});
    return send(res,404,{error:'赛事不存在',code:'not_found'});
   }
   if(url.pathname==='/api/works'){
    const items=liveQuery(mod,{editionId:url.searchParams.get('edition'),track:url.searchParams.get('track'),q:url.searchParams.get('q')});
    return send(res,200,{items,total:items.length});
   }
   if(url.pathname.startsWith('/api/works/')){
    const id=routeId(url.pathname,'/api/works/');
    const work=liveQuery(mod).find(w=>w.id===id);
    if(work)return send(res,200,work);
    const existing=anyWork(id);
    if(existing&&existing.publicationStatus==='已撤回')return send(res,410,{error:'作品已撤回',code:'withdrawn'});
    return send(res,404,{error:'作品不存在',code:'not_found'});
   }
   return send(res,404,{error:'内容路径不存在',code:'not_found'});
  });
 }};
 plugin.configurePreviewServer=plugin.configureServer;
 return plugin;
}
