// 模型调用账本与预算（PRD 15.3 / UsageLedger）。
// 规则：按 requestId 去重；并发请求先预留再结算；达到每日预算 80% 降低后台 AI 活动，
// 达到 100% 暂停新的模型调用（看展、检索与真人聊天不受影响）。
// 单价：ATOM_LLM_PRICE_IN / ATOM_LLM_PRICE_OUT（每 1K token 的金额，与 ATOM_DAILY_BUDGET 同币种）；
// 未配置时退化为 token 计数口径（cost = total_tokens/1000），保证原型可运行。
// 数据落 data/usage-ledger.json（ATOM_DATA_DIR 可改），重启不丢失。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dataDir=process.env.ATOM_DATA_DIR||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data');
const ledgerPath=path.join(dataDir,'usage-ledger.json');
const DAY=86400000;
const dayKey=()=>new Date().toISOString().slice(0,10);
const readLedger=()=>{try{return JSON.parse(fs.readFileSync(ledgerPath,'utf8'));}catch{return {days:{}};}};
const writeLedger=ledger=>{const tmp=ledgerPath+'.tmp';fs.mkdirSync(path.dirname(ledgerPath),{recursive:true});fs.writeFileSync(tmp,JSON.stringify(ledger,null,2));fs.renameSync(tmp,ledgerPath);};
const dayOf=ledger=>{const key=dayKey();if(!ledger.days[key])ledger.days[key]={requests:[],reserved:0,settled:0};return ledger.days[key];};
// 单价配置：每 1K token 金额。返回 null 表示未配置（退化口径）。
export function priceConfig(){
 const priceIn=Number(process.env.ATOM_LLM_PRICE_IN);
 const priceOut=Number(process.env.ATOM_LLM_PRICE_OUT);
 if(!(priceIn>0)&&!(priceOut>0))return null;
 return {in:priceIn>0?priceIn:0,out:priceOut>0?priceOut:0};
}
// 成本换算：有单价按金额，否则按 1K token 计 1 个单位。
export function costOf({tokensIn=0,tokensOut=0}={}){
 const price=priceConfig();
 if(!price)return (Number(tokensIn)+Number(tokensOut))/1000;
 return (Number(tokensIn)/1000)*price.in+(Number(tokensOut)/1000)*price.out;
}
export function budgetState(dailyBudget){
 const ledger=readLedger();
 const day=dayOf(ledger);
 const spent=day.requests.reduce((n,r)=>n+(r.cost||0),0);
 const limit=Number(dailyBudget)>0?Number(dailyBudget):0;
 const ratio=limit>0?spent/limit:0;
 return {day:dayKey(),spent:Number(spent.toFixed(6)),limit,ratio:Number(ratio.toFixed(4)),state:limit<=0?'unlimited':ratio>=1?'exceeded':ratio>=.8?'throttled':'ok',requests:day.requests.length,unit:priceConfig()?'currency':'tokens/1K'};
}
// 调用前预留（并发安全：预留立即计入，结算时替换为实际值）。
export function reserve(requestId,estimatedCost){
 const ledger=readLedger();const day=dayOf(ledger);
 if(!day.requests.some(r=>r.requestId===requestId))day.requests.push({requestId,status:'reserved',cost:Number(estimatedCost)||0,tokensIn:0,tokensOut:0,time:Date.now()});
 day.reserved=day.requests.reduce((n,r)=>n+(r.cost||0),0);
 writeLedger(ledger);
 return budgetState(process.env.ATOM_DAILY_BUDGET);
}
export function settle(requestId,{model='',tokensIn=0,tokensOut=0,status='ok'}={}){
 const ledger=readLedger();const day=dayOf(ledger);
 const entry=day.requests.find(r=>r.requestId===requestId);
 if(!entry)return budgetState(process.env.ATOM_DAILY_BUDGET);
 entry.status=status;entry.model=model;entry.tokensIn=Number(tokensIn)||0;entry.tokensOut=Number(tokensOut)||0;
 // 失败调用不计成本（保留 token 记录便于排查）。
 entry.cost=status==='ok'?costOf({tokensIn:entry.tokensIn,tokensOut:entry.tokensOut}):0;
 day.reserved=day.requests.reduce((n,r)=>n+(r.cost||0),0);
 writeLedger(ledger);
 return budgetState(process.env.ATOM_DAILY_BUDGET);
}
export function usageSummary(){
 const day=dayOf(readLedger());
 const byModel={};
 for(const r of day.requests){
  const key=r.model||'(unknown)';
  if(!byModel[key])byModel[key]={model:key,requests:0,cost:0,tokensIn:0,tokensOut:0,failures:0};
  byModel[key].requests++;byModel[key].cost+=r.cost||0;byModel[key].tokensIn+=r.tokensIn||0;byModel[key].tokensOut+=r.tokensOut||0;
  if(r.status!=='ok')byModel[key].failures++;
 }
 return {day:dayKey(),requests:day.requests.length,models:Object.values(byModel).map(m=>({...m,cost:Number(m.cost.toFixed(6))})),unit:priceConfig()?'currency':'tokens/1K'};
}
export function recentRequests(limit=20){
 const day=dayOf(readLedger());
 return day.requests.slice(-limit).reverse();
}
