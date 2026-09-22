// 导入引擎：从来源展示站数据生成目录，支持“差异预览”与“应用导入”两步。
// 预览不写任何文件；应用时写 editions.json 并复制必要媒体。
// 规则不变：重复导入是更新而非覆盖；已发布状态保留；私人字段（微信/二维码/联系方式）永不进入目录。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataPath=path.resolve(out,'src/data','editions.json');
const SOURCES=[
 {id:'funskills',title:'繁星之夜',subtitle:'FunSkills 决赛作品展',folder:'繁星之夜-showcase',ext:'jpg',description:'从真实需求出发，让创意成为可以分享的技能。探索电商出海、金融投资、效率工具、内容创作与生活成长方向的参赛作品。',note:'现有展示资料收录 38 条记录，正式决赛名单与人数仍待运营核对。'},
 {id:'hackathon',title:'数智星光展',subtitle:'浙江工商大学 AI 黑客松',folder:'hackathon-showcase',ext:'webp',description:'从校园里的真实问题出发，18 支团队用 AI 探索学务、评奖、空间预约、科研与院务文化的新解法。',note:'作品介绍来自原展示站；技术效果与成果数字为作者资料陈述。'},
];
const PRIVATE_SOURCE_FIELDS=['wechat','qr','qrTitle','qrNote','contact','phone','email'];
const readPrevious=()=>{
 try{return JSON.parse(fs.readFileSync(dataPath,'utf8'));}catch{return [];}
};
const loadSource=source=>{
 const ctx={window:{}};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'选手作品信息',source.folder,'assets','data.js'),'utf8'),ctx);
 return ctx.window;
};
function buildEdition(source,previousEdition){
 const window=loadSource(source);
 const works=window.WORKS.map(w=>({
  id:source.id+'--'+w.slug,slug:w.slug,title:w.title,author:w.author,track:w.track,tagline:w.tagline,description:w.blurb,tags:w.tags,subtitle:w.en,
  poster:`/works/${source.id}/${w.slug}.${source.ext}`,thumb:`/works/${source.id}/thumbs/${w.slug}.${source.ext}`,
  source:`选手作品信息/${source.folder}/assets/data.js`,sourceStatus:'原展示资料',editionId:source.id,
  ...(w.highlight?{highlight:w.highlight}:{}),
 }));
 const previousWorks=previousEdition?.works||[];
 const diff={
  newWorks:works.filter(w=>!previousWorks.some(o=>o.id===w.id)).map(w=>w.id),
  updatedWorks:works.filter(w=>previousWorks.some(o=>o.id===w.id)).map(w=>w.id),
  staleWorks:previousWorks.filter(o=>!works.some(w=>w.id===o.id)).map(o=>o.id),
  privateDropped:window.WORKS.reduce((n,w)=>n+PRIVATE_SOURCE_FIELDS.filter(f=>w[f]).length,0),
 };
 // 应用导入时的作品状态：已有记录保留，新记录默认待审核。
 const withStatus=works.map(w=>{const old=previousWorks.find(o=>o.id===w.id);return old?{...w,publicationStatus:old.publicationStatus||'待审核',contentVersion:Number(old.contentVersion)||1}:{...w,publicationStatus:'待审核',contentVersion:1};});
 return {edition:{id:source.id,title:source.title,subtitle:source.subtitle,description:source.description,note:source.note,
   tracks:Object.keys(window.TRACKS),trackColors:Object.fromEntries(Object.entries(window.TRACKS).map(([k,v])=>[k,v.color])),
   works:[...withStatus,...diff.staleWorks.map(id=>previousWorks.find(o=>o.id===id))],
   eventStage:previousEdition?.eventStage||'未知',
   publicationStatus:previousEdition?.publicationStatus||'待审核',
   contentVersion:previousEdition?.contentVersion||1},diff};
}
export function planImport(base=root){
 const previous=readPrevious();
 const editions=SOURCES.map(source=>buildEdition(source,previous.find(e=>e.id===source.id)));
 const importedIds=new Set(editions.map(e=>e.edition.id));
 const manualKept=previous.filter(e=>!importedIds.has(e.id)).map(e=>e.id);
 return {
  editions:editions.map(({edition,diff})=>({id:edition.id,title:edition.title,...diff})),
  manualKept,
  totals:{newWorks:editions.reduce((n,e)=>n+e.diff.newWorks.length,0),updatedWorks:editions.reduce((n,e)=>n+e.diff.updatedWorks.length,0),staleWorks:editions.reduce((n,e)=>n+e.diff.staleWorks.length,0),privateDropped:editions.reduce((n,e)=>n+e.diff.privateDropped,0)},
 };
}
export function runImport(base=root){
 const previous=readPrevious();
 const editions=SOURCES.map(source=>buildEdition(source,previous.find(e=>e.id===source.id)));
 for(const source of SOURCES){
  const window=loadSource(source);
  for(const w of window.WORKS)for(const sub of ['','thumbs/']){
   const target=path.join(out,'public','works',source.id,sub);
   fs.mkdirSync(target,{recursive:true});
   fs.copyFileSync(path.join(base,'选手作品信息',source.folder,'assets','works',sub,w.slug+'.'+source.ext),path.join(target,w.slug+'.'+source.ext));
  }
 }
 // 手工维护的赛事（如星火计划介绍稿）不在展示站目录中，按原样保留。
 for(const e of previous)if(!editions.some(r=>r.edition.id===e.id))editions.push({edition:e});
 fs.writeFileSync(dataPath,JSON.stringify(editions.map(e=>e.edition),null,2));
 return {works:editions.reduce((n,e)=>n+e.edition.works.length,0),editions:editions.length};
}
