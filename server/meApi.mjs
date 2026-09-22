// 账号数据接口：收藏与记忆的云端读写、本地迁移。
// 全部要求登录（服务端会话），游客只能使用浏览器本地存储。
// GET  /api/me                    收藏、记忆与版本
// PUT  /api/me/bookmarks          {bookmarks, baseVersion}
// POST /api/me/memories           {agentId, text, source}
// DELETE /api/me/memories         {id} 或 {all:true}
// POST /api/me/migrate            {bookmarks, memories} 本机 → 云端（用户选择后）
import {userForToken,sameOrigin,readCookie} from './auth.mjs';
import {getState,saveBookmarks,addMemory,deleteMemory,clearMemories,mergeLocal} from './userStore.mjs';
const send=(res,status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
const readBody=req=>new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>1e5)reject(new Error('请求体过大'));});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error('请求体不是合法 JSON'));}});req.on('error',reject);});
const currentUser=req=>userForToken(readCookie(req.headers.cookie));

export function meApiPlugin(){
 const plugin={name:'atom-me-service',configureServer(server){
  server.middlewares.use(async (req,res,next)=>{
   const url=new URL(req.url,'http://localhost');
   if(!url.pathname.startsWith('/api/me'))return next();
   const user=currentUser(req);
   if(!user)return send(res,401,{error:'请先登录',code:'unauthorized'});
   try{
    if(url.pathname==='/api/me'&&req.method==='GET')return send(res,200,{user,state:getState(user.id)});
    if(req.method!=='GET'&&!sameOrigin(req))return send(res,403,{error:'来源校验失败',code:'bad_origin'});
    if(url.pathname==='/api/me/bookmarks'&&req.method==='PUT'){
     const body=await readBody(req);
     const result=saveBookmarks(user.id,body.bookmarks,body.baseVersion);
     return send(res,result.ok?200:409,result);
    }
    if(url.pathname==='/api/me/memories'&&req.method==='POST'){
     const body=await readBody(req);
     const memory=addMemory(user.id,body);
     return send(res,200,{ok:true,memory,state:getState(user.id)});
    }
    if(url.pathname==='/api/me/memories'&&req.method==='DELETE'){
     const body=await readBody(req);
     const result=body.all?clearMemories(user.id):deleteMemory(user.id,body.id);
     return send(res,200,result);
    }
    if(url.pathname==='/api/me/migrate'&&req.method==='POST'){
     const body=await readBody(req);
     return send(res,200,mergeLocal(user.id,body));
    }
    return send(res,404,{error:'接口不存在',code:'not_found'});
   }catch(error){return send(res,400,{error:error.message,code:'bad_request'});}
  });
 }};
 plugin.configurePreviewServer=plugin.configureServer;
 return plugin;
}
