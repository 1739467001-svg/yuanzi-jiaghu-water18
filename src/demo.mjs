import editions from './data/editions.json' with {type:'json'};
import {AGENTS} from './world/config.js';
export const allWorks=editions.flatMap(e=>e.works);
export function retrieve(query){
 const synonyms={编程:'效率工具',视频:'内容创作',写作:'内容创作',创业:'电商出海',校园:'智慧学务',理财:'金融投资'};
 const expanded=query+' '+Object.entries(synonyms).filter(([k])=>query.includes(k)).map(([,v])=>v).join(' ');
 return allWorks.map(w=>({w,score:[w.track,...w.tags,w.title].reduce((s,t)=>s+(expanded.includes(t)?t.length:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,3).map(x=>x.w);
}
export function demoReply({message,agentId,memories=[]}){
 const a=AGENTS.find(a=>a.id===agentId)||AGENTS[0],matches=retrieve(message);
 if(/记得|记忆|上次/.test(message))return {text:memories.length?`在你允许保存的记录里，你曾说：“${memories.at(-1).text}”。我们可以从这个话题继续。`:'我还没有你授权保存的兴趣记录。你可以开启记忆，再告诉我你感兴趣的方向。',workIds:[],mode:'demo'};
 if(matches.length)return {text:`${a.name}为你找到了${matches.length}份相关作品。${matches.map(w=>`《${w.title}》：${w.tagline}。`).join('')}\n这些介绍来自参赛资料，点击卡片可以继续阅读。`,workIds:matches.map(w=>w.id),mode:'demo'};
 if(/公社|品牌|理念|开源/.test(message))return {text:'原子公社是人与 Agent 共建的开源学习社区。我们相信个体至上、开放共享、务实求真、互助共赢和持续进化。人在这里分享经验，Agent 协助整理与学习，一起把真实问题做成作品。',workIds:[],mode:'demo'};
 if(/冠军|获奖|第一名|奖金|结果/.test(message))return {text:'当前展馆资料没有收录可核实的最终获奖结果，我不能替作品补写名次。你可以先查看已经收录的作品介绍。',workIds:[],mode:'demo'};
 if(/你好|在吗|嗨|欢迎/.test(message))return {text:a.line,workIds:[],mode:'demo'};
 return {text:'这版向导目前使用本地资料进行演示，还不能自由推理。你可以问我“推荐效率工具作品”“介绍原子公社”，或者直接去展示馆看看。配置模型服务后，这里可以开启自由对话。',workIds:[],mode:'demo'};
}
