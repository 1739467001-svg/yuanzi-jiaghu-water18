// 本地账号与会话（联机产品形态的第一块）。
// 规则：密码只存 scrypt 散列；会话令牌随机、HttpOnly、SameSite=Strict、有过期时间；
// 身份只认服务端会话，不认前端传来的 playerId 或昵称（PRD 4.1/4.2）。
// 数据落在 data/（users.json + sessions.json），可通过 ATOM_DATA_DIR 改位置，便于测试隔离。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const dataDir=process.env.ATOM_DATA_DIR||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data');
const usersPath=path.join(dataDir,'users.json');
const sessionsPath=path.join(dataDir,'sessions.json');
const SESSION_TTL=7*86400000;
const ROLES=['guest','member','operator','admin'];
const readJson=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}};
const writeJson=(file,value)=>{const tmp=file+'.tmp';fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,file);};
const hashPassword=password=>{const salt=crypto.randomBytes(16).toString('hex');const derived=crypto.scryptSync(String(password),salt,64).toString('hex');return `${salt}:${derived}`;};
const verifyPassword=(password,stored)=>{
 if(typeof stored!=='string'||!stored.includes(':'))return false;
 const [salt,derived]=stored.split(':');
 const candidate=crypto.scryptSync(String(password),salt,64);
 const expected=Buffer.from(derived,'hex');
 return candidate.length===expected.length&&crypto.timingSafeEqual(candidate,expected);
};
const publicUser=u=>({id:u.id,nickname:u.nickname,role:u.role,createdAt:u.createdAt});
const NICK_RE=/^[\u4e00-\u9fa5A-Za-z0-9_-]{2,20}$/;
const users=()=>readJson(usersPath,{});
const saveUsers=list=>writeJson(usersPath,list);
const sessions=()=>readJson(sessionsPath,{});
const saveSessions=list=>writeJson(sessionsPath,list);

export function register({nickname,password}={}){
 if(!NICK_RE.test(nickname||''))throw new Error('昵称需 2—20 位，可用中文、字母、数字、下划线或连字符');
 if(typeof password!=='string'||password.length<8)throw new Error('密码至少 8 位');
 const list=users();
 const id='u_'+crypto.randomBytes(6).toString('hex');
 if(Object.values(list).some(u=>u.nickname===nickname))throw new Error('该昵称已被占用');
 list[id]={id,nickname,role:'member',passwordHash:hashPassword(password),createdAt:Date.now()};
 saveUsers(list);
 return publicUser(list[id]);
}
export function login({nickname,password}={}){
 const list=users();
 const user=Object.values(list).find(u=>u.nickname===nickname);
 if(!user||!verifyPassword(password,user.passwordHash))throw new Error('昵称或密码不正确');
 const token=crypto.randomBytes(32).toString('hex');
 const all=sessions();
 all[token]={userId:user.id,expiresAt:Date.now()+SESSION_TTL};
 saveSessions(all);
 return {token,expiresAt:all[token].expiresAt,user:publicUser(user)};
}
export function logout(token){
 if(!token)return;
 const all=sessions();
 delete all[token];
 saveSessions(all);
}
export function userForToken(token){
 if(!token)return null;
 const all=sessions();
 const session=all[token];
 if(!session)return null;
 if(session.expiresAt<=Date.now()){delete all[token];saveSessions(all);return null;}
 const user=users()[session.userId];
 return user?publicUser(user):null;
}
export function setRole(userId,role){
 if(!ROLES.includes(role))throw new Error(`非法的角色: ${role}`);
 const list=users();
 if(!list[userId])throw new Error(`用户不存在: ${userId}`);
 list[userId].role=role;
 saveUsers(list);
 return publicUser(list[userId]);
}
export function roleRank(role){return Math.max(0,ROLES.indexOf(role));}
export function canOperate(user){return !!user&&roleRank(user.role)>=roleRank('operator');}
export const AUTH_COOKIE='atom_session';
export const SESSION_COOKIE_OPTIONS={httpOnly:true,sameSite:'strict',path:'/',maxAge:SESSION_TTL/1000};
export function readCookie(header,name=AUTH_COOKIE){
 if(typeof header!=='string')return null;
 for(const part of header.split(';')){
  const [key,...value]=part.trim().split('=');
  if(key===name)return decodeURIComponent(value.join('='));
 }
 return null;
}
// 请求来源与 Host 不一致时拒绝，避免跨站携带 Cookie 的写操作。
export function sameOrigin(req){
 const origin=req.headers.origin;
 if(!origin)return true;
 const host=req.headers.host;
 try{return new URL(origin).host===host;}catch{return false;}
}
