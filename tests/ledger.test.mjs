import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
// 每个测试用独立数据目录，避免共享账本互相影响。
const ledgerForTest=async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'atom-ledger-'));
 process.env.ATOM_DATA_DIR=dir;
 return import('../server/usageLedger.mjs?t='+Date.now()+Math.random().toString(36).slice(2,6));
};

test('budget states follow the 80% throttle and 100% stop thresholds', async () => {
 const {budgetState,reserve}=await ledgerForTest();
 process.env.ATOM_DAILY_BUDGET='10';
 assert.equal(budgetState(10).state,'ok');
 reserve('r1',4);
 assert.equal(budgetState(10).state,'ok');
 reserve('r2',4.5);
 const throttled=budgetState(10);
 assert.equal(throttled.state,'throttled','达到 80% 进入降级');
 assert.ok(throttled.spent>=8);
 reserve('r3',2);
 assert.equal(budgetState(10).state,'exceeded','达到 100% 暂停新调用');
 assert.equal(budgetState(0).state,'unlimited');
});

test('reserve then settle keeps the ledger deduplicated and settled with real usage', async () => {
 const {budgetState,reserve,settle,recentRequests}=await ledgerForTest();
 const id='r_settle';
 reserve(id,5);
 reserve(id,5); // 同一 requestId 只记一次
 const before=budgetState(10);
 assert.equal(before.requests,1);
 settle(id,{model:'demo-model',tokensIn:120,tokensOut:80,cost:0.2,status:'ok'});
 const after=budgetState(10);
 assert.equal(after.requests,1,'结算不新增记录');
 assert.ok(after.spent<before.spent,'结算后按实际值替换预留');
 const [entry]=recentRequests(5);
 assert.equal(entry.requestId,id);
 assert.equal(entry.status,'ok');
 assert.equal(entry.tokensIn,120);
 assert.equal(entry.tokensOut,80);
});

test('failed calls are recorded so budget reflects real spend', async () => {
 const {reserve,settle,recentRequests}=await ledgerForTest();
 reserve('r_fail',1);
 settle('r_fail',{status:'failed'});
 const entry=recentRequests(10).find(r=>r.requestId==='r_fail');
 assert.equal(entry.status,'failed');
});

test('ledger persists to disk and survives a fresh module read', async () => {
 const dir=mkdtempSync(path.join(tmpdir(),'atom-ledger-'));
 process.env.ATOM_DATA_DIR=dir;
 const {reserve}=await import('../server/usageLedger.mjs?fresh='+Date.now());
 reserve('r_persist',1);
 const ledgerFile=path.join(dir,'usage-ledger.json');
 assert.ok(existsSync(ledgerFile),'账本应落盘');
 const onDisk=JSON.parse(readFileSync(ledgerFile,'utf8'));
 const today=new Date().toISOString().slice(0,10);
 assert.ok(onDisk.days[today],'按日分桶');
 assert.equal(onDisk.days[today].requests.length,1);
});
