// 资产加载层：单一事实来源是 public/assets/manifest.json。
// 正式 GLB 优先；缺失、加载失败或未审核时回退到程序化占位（现有几何原型）。
// 规则：换外观不能暗中改变入口与碰撞；版本不匹配拒绝加载；授权状态未审核不进入生产构建。
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {atomSculpture,character} from './models.js';
const manifestCache=new Map();
export function validateManifest(manifest){
 if(!manifest||typeof manifest!=='object')throw new Error('资产清单必须是对象');
 if(typeof manifest.manifestVersion!=='string'||!manifest.manifestVersion)throw new Error('清单缺少 manifestVersion');
 if(!Array.isArray(manifest.models)||manifest.models.length===0)throw new Error('清单至少需要一个模型条目');
 const ids=new Set();
 for(const m of manifest.models){
  if(typeof m.id!=='string'||!m.id)throw new Error('资产缺少稳定 id');
  if(ids.has(m.id))throw new Error(`资产 id 重复: ${m.id}`);
  ids.add(m.id);
  if(!Number.isInteger(m.version)||m.version<1)throw new Error(`资产 ${m.id} 的 version 必须是正整数`);
  if(typeof m.license!=='string'||!m.license)throw new Error(`资产 ${m.id} 未登记授权信息`);
  if(m.glb!=null&&(typeof m.glb!=='string'||!m.glb.startsWith('/')))throw new Error(`资产 ${m.id} 的 glb 必须是以 / 开头的路径或 null`);
  if(m.glb===null&&typeof m.fallback!=='string')throw new Error(`资产 ${m.id} 缺少程序化兜底`);
  if(m.kind==='character'&&!(Array.isArray(m.requiredAnimations)&&m.requiredAnimations.length>0))throw new Error(`角色资产 ${m.id} 需声明必备动画`);
 }
 return true;
}
export async function loadManifest(url='/assets/manifest.json'){
 if(manifestCache.has(url))return manifestCache.get(url);
 const response=await fetch(url);
 if(!response.ok)throw new Error(`资产清单加载失败: ${response.status}`);
 const manifest=await response.json();
 validateManifest(manifest);
 manifestCache.set(url,manifest);
 return manifest;
}
export function findAsset(manifest,id){return manifest.models.find(m=>m.id===id)||null;}
// 解析条目为可加入场景的对象：GLB 成功用 GLB，任何一步失败回退程序化占位。
// gltfLoader 可注入，便于测试与 WebGL 不可用时替换实现。
export async function resolveAsset(entry,{base='',gltfLoader}={}){
 const fallback=()=>{
  if(entry?.fallback==='procedural:atomSculpture')return atomSculpture(new T.Group());
  if(entry?.fallback==='procedural:character')return character('#427ab5',1);
  return null;
 };
 if(!entry||!entry.glb)return {object:fallback(),source:'procedural'};
 // 规范化为单斜杠拼接，避免 '//path' 被当成协议相对 URL。
 const prefix=base.endsWith('/')?base.slice(0,-1):base;
 const url=prefix+entry.glb;
 try{
  const loader=gltfLoader||new GLTFLoader();
  const gltf=await loader.loadAsync(url);
  if(!gltf?.scene)throw new Error('GLB 无场景');
  return {object:gltf.scene,source:'glb'};
 }catch{
  return {object:fallback(),source:'procedural'};
 }
}
