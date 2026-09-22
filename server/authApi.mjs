// 账号接口：注册、登录、登出、当前用户。
// POST /api/auth/register {nickname,password}
// POST /api/auth/login    {nickname,password}
// POST /api/auth/logout
// GET  /api/auth/me
import {register,login,logout,userForToken,sameOrigin,readCookie,AUTH_COOKIE,SESSION_COOKIE_OPTIONS} from './auth.mjs';
const send=(res,status,body,headers={})=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');for(const[k,v]of Object.entries(headers))res.setHeader(k,v);res.end(JSON.stringify(body));};
const readBody=req=>new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>4096)reject(new Error('请求体过大'));});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error('请求体不是合法 JSON'));}});req.on('error',reject);});
const sessionCookie=token=>`${AUTH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_COOKIE_OPTIONS.maxAge}`;
const clearCookie=()=>`${AUTH_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;

export function authPlugin(){
 const plugin={name:'atom-auth-service',configureServer(server){
  server.middlewares.use(async (req,res,next)=>{
   const url=new URL(req.url,'http://localhost');
   if(!url.pathname.startsWith('/api/auth'))return next();
   try{
    if(url.pathname==='/api/auth/me'&&req.method==='GET'){
     const user=userForToken(readCookie(req.headers.cookie));
     return user?send(res,200,{user}):send(res,200,{user:null});
    }
    if(req.method!=='POST')return send(res,405,{error:'需要 POST',code:'method_not_allowed'});
    if(!sameOrigin(req))return send(res,403,{error:'来源校验失败',code:'bad_origin'});
    const body=await readBody(req);
    if(url.pathname==='/api/auth/register'){
     const user=register(body);
     const session=login(body);
     return send(res,200,{user,...session},{'Set-Cookie':sessionCookie(session.token)});
    }
    if(url.pathname==='/api/auth/login'){
     const session=login(body);
     return send(res,200,{user:session.user,token:session.token,expiresAt:session.expiresAt},{'Set-Cookie':sessionCookie(session.token)});
    }
    if(url.pathname==='/api/auth/logout'){
     logout(readCookie(req.headers.cookie));
     return send(res,200,{ok:true},{'Set-Cookie':clearCookie()});
    }
    return send(res,404,{error:'接口不存在',code:'not_found'});
   }catch(error){return send(res,400,{error:error.message,code:'bad_request'});}
  });
 }};
 plugin.configurePreviewServer=plugin.configureServer;
 return plugin;
}
