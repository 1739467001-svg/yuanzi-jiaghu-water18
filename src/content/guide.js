// 展馆导览：结构化事实优先，语义检索兜底。
// 规则：奖项与结果没有收录就不生成；每个推荐都返回有效作品 ID 供引用卡片使用；
// “带我过去”只接受当前共享展位中存在的作品（由界面层校验）。
import {allPublishedWorks,queryWorks,publishedEditions} from './catalog.js';
import {AGENTS} from '../world/config.js';
export const GUIDE_AGENT_ID='shouguan';
export const GUIDE_AGENT=AGENTS.find(a=>a.id===GUIDE_AGENT_ID)||AGENTS[0];
export const GUIDE_QUESTIONS=['本届有哪些赛道？','效率工具有哪些作品？','星火计划是什么比赛？'];
const ROUTES=[
 {intent:'memory',test:/记得|记忆|上次|之前|认识我/},
 {intent:'award',test:/冠军|一等奖|金奖|银奖|铜奖|获奖|第一名|名次|排名|奖金|结果|谁赢了/},
 {intent:'brand',test:/公社|原子公社|理念|价值观|开源|品牌|是什么社区/},
 {intent:'edition',test:/星火计划|繁星之夜|黑客松|数智星光|比赛|赛事|大赛/},
 {intent:'stats',test:/赛道|分类|方向|多少|统计|几个/},
 {intent:'author',test:/作者|是谁做的|团队|谁做的/},
];
export function editionSummary(edition){
 const counts={};
 for(const w of edition.works)counts[w.track]=(counts[w.track]||0)+1;
 return {id:edition.id,title:edition.title,subtitle:edition.subtitle,description:edition.description,works:edition.works.length,tracks:Object.entries(counts).map(([track,count])=>({track,count}))};
}
export function guideReply({text='',memories=[]}={}){
 const q=(text||'').trim();
 if(!q)return {text:'想了解哪一届赛事、哪个赛道，或者哪一件作品？先查结构化事实，再聊兴趣。',workIds:[],intent:'empty'};
 const route=ROUTES.find(r=>r.test.test(q))?.intent;
 const works=allPublishedWorks();
 if(route==='memory'){
  if(memories.length)return {text:`在你授权保存的记录里，你曾提到“${memories.at(-1).text}”。我可以顺着这个话题找相关作品。`,workIds:[],intent:'memory'};
  return {text:'我还没有你授权保存的兴趣记录。开启记忆后，我们可以从你聊过的话题继续。',workIds:[],intent:'memory'};
 }
 if(route==='award')return {text:'当前展馆资料没有收录可核实的获奖名次，我不能替作品补写结果。已发布的是作品介绍本身。',workIds:[],intent:'award'};
 if(route==='brand')return {text:'原子公社是人与 Agent 共建的开源学习社区：个体至上、开放共享、务实求真、互助共赢、持续进化。真实赛事的作品与作者，是这片江湖里最鲜活的内容。',workIds:[],intent:'brand'};
 if(route==='edition'){
  const hit=publishedEditions().find(e=>q.includes(e.title)||e.subtitle.includes(q)||e.id.includes(q));
  if(hit){const s=editionSummary(hit);
   return s.works
    ?{text:`${s.title}（${s.subtitle}）。${s.description}\n赛道：${s.tracks.map(t=>`${t.track} ${t.count} 份`).join('，')}。`,workIds:hit.works.slice(0,4).map(w=>w.id),intent:'edition'}
    :{text:`${s.title}（${s.subtitle}）。${s.description}\n本届作品与结果资料仍在整理，核对后再开放作品清单。`,workIds:[],intent:'edition'};
  }
  const list=publishedEditions().map(e=>`${e.title} · ${e.works.length} 份`).join('；');
  return {text:`展示馆现有赛事：${list}。想先逛哪一届？`,workIds:[],intent:'edition'};
 }
 if(route==='stats'){
  const lines=publishedEditions().map(e=>`${e.title}：${e.works.length} 份作品，${e.tracks.length} 个赛道（${e.tracks.join('、')}）`);
  const cite=publishedEditions().flatMap(e=>e.works.slice(0,2).map(w=>w.id));
  return {text:`已发布的赛事结构：\n${lines.join('\n')}\n以上数字来自内容服务的已发布数据。`,workIds:cite,intent:'stats'};
 }
 if(route==='author'){
  const byAuthor=works.filter(w=>q.includes(w.author));
  if(byAuthor.length)return {text:`找到 ${byAuthor.length} 份署名“${byAuthor[0].author}”的作品。`,workIds:byAuthor.map(w=>w.id),intent:'author'};
 }
 const direct=works.find(w=>q.includes(w.title)||(q.length>=4&&w.title.includes(q)));
 if(direct)return {text:`《${direct.title}》——${direct.tagline}。${direct.description}（来自${direct.editionId==='funskills'?'繁星之夜':'原赛事'}参赛资料）`,workIds:[direct.id],intent:'work'};
 const trackHit=works.find(w=>q.includes(w.track));
 if(trackHit){
  const inTrack=queryWorks({track:trackHit.track});
  return {text:`「${trackHit.track}」赛道共有 ${inTrack.length} 份作品，先看这几份：${inTrack.slice(0,3).map(w=>`《${w.title}》${w.tagline}`).join('；')}。`,workIds:inTrack.slice(0,3).map(w=>w.id),intent:'track'};
 }
 const found=queryWorks({q});
 if(found.length)return {text:`按关键词找到 ${found.length} 份相关作品，先看前三份：${found.slice(0,3).map(w=>`《${w.title}》：${w.tagline}`).join('；')}。`,workIds:found.slice(0,3).map(w=>w.id),intent:'search'};
 return {text:'这一版导览只回答已发布资料里的内容，没有收录的我会直说。可以问我“有哪些赛道”“效率工具有哪些作品”，或者直接去展台看看。',workIds:[],intent:'fallback'};
}
