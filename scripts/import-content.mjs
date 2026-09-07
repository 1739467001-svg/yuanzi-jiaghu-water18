import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'../..');
const out=path.resolve(import.meta.dirname,'..');
const editions=[
 {id:'funskills',title:'繁星之夜',subtitle:'FunSkills 决赛作品展',folder:'繁星之夜-showcase',ext:'jpg',description:'从真实需求出发，让创意成为可以分享的技能。探索电商出海、金融投资、效率工具、内容创作与生活成长方向的参赛作品。',note:'现有展示资料收录 38 条记录，正式决赛名单与人数仍待运营核对。'},
 {id:'hackathon',title:'数智星光展',subtitle:'浙江工商大学 AI 黑客松',folder:'hackathon-showcase',ext:'webp',description:'从校园里的真实问题出发，18 支团队用 AI 探索学务、评奖、空间预约、科研与院务文化的新解法。',note:'作品介绍来自原展示站；技术效果与成果数字为作者资料陈述。'},
];
const result=editions.map(e=>{
 const folder=path.join(root,'选手作品信息',e.folder);const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(folder,'assets/data.js'),'utf8'),ctx);
 const works=ctx.window.WORKS.map(w=>{
  for(const sub of ['', 'thumbs/']){
   const target=path.join(out,'public/works',e.id,sub);fs.mkdirSync(target,{recursive:true});
   fs.copyFileSync(path.join(folder,'assets/works',sub,w.slug+'.'+e.ext),path.join(target,w.slug+'.'+e.ext));
  }
  return {id:e.id+'--'+w.slug,slug:w.slug,title:w.title,author:w.author,track:w.track,tagline:w.tagline,description:w.blurb,tags:w.tags,subtitle:w.en,poster:`/works/${e.id}/${w.slug}.${e.ext}`,thumb:`/works/${e.id}/thumbs/${w.slug}.${e.ext}`,source:`选手作品信息/${e.folder}/assets/data.js`,sourceStatus:'原展示资料',editionId:e.id};
 });
 return {id:e.id,title:e.title,subtitle:e.subtitle,description:e.description,note:e.note,tracks:Object.keys(ctx.window.TRACKS),works};
});
fs.writeFileSync(path.join(out,'src/data/editions.json'),JSON.stringify(result,null,2));
console.log('Imported',result.reduce((a,e)=>a+e.works.length,0),'works; private contacts and QR codes excluded.');
