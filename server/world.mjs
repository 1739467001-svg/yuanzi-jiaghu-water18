// 独立世界服务（生产/预览形态）：HTTP + WebSocket 同端口。
// 用法：npm run world  （默认 5173，PORT 可改；ATOM_DATA_DIR 指定数据目录）
// 同时提供 /api/content/*、/api/chat、/api/auth、/api/me、/api/admin（与 dev 一致），
// 因此单进程即可作为“联机产品”部署单元。
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// server/ 的上一级即项目根（atom-jianghu），dist 在其下。
const port=Number(process.env.PORT)||5173;
const host=process.env.HOST||'0.0.0.0';
const dist=path.join(root,'dist');
if(!existsSync(dist))console.warn('[world] 未找到 dist/，请先执行 npm run build');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.woff2':'font/woff2'};

// 中间件集合：直接复用各插件的 configureServer 逻辑（以 http.Server 形态接入）。
const plugins=[
 (await import('./authApi.mjs')).authPlugin(),
 (await import('./meApi.mjs')).meApiPlugin(),
 (await import('./admin.mjs')).adminPlugin(),
 (await import('./content.mjs')).contentPlugin(),
 (await import('./chat.mjs')).chatPlugin(process.env),
];
const middlewares=[];
for(const plugin of plugins){
 if(typeof plugin.configureServer==='function'){
  const server={middlewares:{use:fn=>middlewares.push(fn)}};
  await plugin.configureServer(server);
 }
}
const server=createServer((req,res)=>{
 let index=0;
 const next=()=>{
  const handler=middlewares[index++];
  if(!handler){serveStatic(req,res);return;}
  handler(req,res,next);
 };
 next();
});
function serveStatic(req,res){
 const url=new URL(req.url,'http://localhost');
 let filePath=path.join(dist,decodeURIComponent(url.pathname));
 if(!filePath.startsWith(dist)){res.statusCode=403;res.end();return;}
 const isDir=()=>{try{return statSync(filePath).isDirectory();}catch{return false;}};
 if(isDir()||!existsSync(filePath))filePath=path.join(dist,'index.html');
 try{
  const body=readFileSync(filePath);
  res.setHeader('Content-Type',mime[path.extname(filePath)]||'application/octet-stream');
  res.end(body);
 }catch{res.statusCode=404;res.end('not found');}
}
const {attachWorldServer,worldServerState}=await import('./worldServer.mjs');
attachWorldServer(server,{path:'/ws'});
// 运维观测：房间、在线人数、容量、运行时长（不含任何私人内容）。
// 以中间件形式注册在 chat 之前，避免被 /api/ 前缀守卫拦截。
middlewares.unshift((req,res,next)=>{
 if(!req.url||!req.url.startsWith('/api/world'))return next();
 const url=new URL(req.url,'http://localhost');
 if(url.pathname!=='/api/world'||req.method!=='GET'){res.statusCode=404;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'接口不存在'}));return;}
 const state=worldServerState();
 res.statusCode=200;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
 res.end(JSON.stringify({ok:true,uptime:Math.round(process.uptime()),rooms:state.rooms,capacity:state.capacity,node:process.version}));
});
server.listen(port,host,()=>{
 console.log(`原子江湖世界服务已启动: http://${host}:${port}  (WebSocket: /ws)`);
});
