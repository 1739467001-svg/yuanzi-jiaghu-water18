import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
// 用临时状态文件加载运营存储，避免测试污染开发态 data/ops-state.json。
const stateFile=path.join(mkdtempSync(path.join(tmpdir(),'atom-ops-')),'ops-state.json');
process.env.ATOM_OPS_STATE_PATH=stateFile;
const {overrideEdition,overrideWork,clearOverrides,getAudit,applyOverrides,saveVersion,listVersions,rollbackVersion}=await import('../server/opsStore.mjs');
const {planImport}=await import('../scripts/import-engine.mjs');
const {catalog}=await import('../src/content/catalog.js');

test('publish overrides apply to catalog reads and are audited', () => {
 clearOverrides();
 const before=applyOverrides(catalog).editions.find(e=>e.id==='funskills').publicationStatus;
 overrideEdition('funskills','已撤回');
 const after=applyOverrides(catalog).editions.find(e=>e.id==='funskills');
 assert.equal(after.publicationStatus,'已撤回');
 assert.equal(after.works.every(w=>w.publicationStatus==='已发布'),true,'赛事级撤回不下推作品状态');
 const withdrawn=applyOverrides({editions:[{id:'x',title:'x',works:[{id:'x--a',publicationStatus:'已发布'}]}]}).editions[0];
 assert.equal(withdrawn.works[0].publicationStatus,'已发布');
 assert.throws(()=>overrideEdition('funskills','已上线'),/非法的发布状态/);
 const audit=getAudit();
 assert.ok(audit.some(a=>a.action==='设置赛事发布状态'&&a.target==='funskills'&&a.after==='已撤回'));
});

test('work overrides only touch the targeted work', () => {
 clearOverrides();
 overrideWork('funskills--ecom-video','已撤回');
 const edition=applyOverrides(catalog).editions.find(e=>e.id==='funskills');
 const target=edition.works.find(w=>w.id==='funskills--ecom-video');
 const other=edition.works.find(w=>w.id!=='funskills--ecom-video');
 assert.equal(target.publicationStatus,'已撤回');
 assert.equal(other.publicationStatus,'已发布');
});

test('publish versions snapshot and rollback restores overrides', () => {
 clearOverrides();
 const clean=saveVersion('干净基线');
 assert.equal(applyOverrides(catalog).editions.find(e=>e.id==='funskills').publicationStatus,'已发布');
 overrideWork('funskills--ecom-video','已撤回');
 const withdrawn=applyOverrides(catalog).editions.find(e=>e.id==='funskills').works.find(w=>w.id==='funskills--ecom-video').publicationStatus;
 assert.equal(withdrawn,'已撤回');
 rollbackVersion(clean);
 const restored=applyOverrides(catalog).editions.find(e=>e.id==='funskills').works.find(w=>w.id==='funskills--ecom-video').publicationStatus;
 assert.equal(restored,'已发布');
 assert.equal(listVersions()[0].id,clean);
 assert.throws(()=>rollbackVersion('v-missing'),/发布版本不存在/);
});

test('import preview is read-only and honest about private fields', async () => {
 const fs=await import('node:fs');
 const editionPath=path.resolve(import.meta.dirname,'../src/data/editions.json');
 const before=fs.readFileSync(editionPath,'utf8');
 const plan=planImport();
 assert.equal(plan.totals.newWorks,0,'来源未变化时没有新增');
 assert.equal(plan.totals.updatedWorks,56);
 assert.ok(plan.totals.privateDropped>0,'应统计被剔除的私人联系字段');
 assert.deepEqual(plan.manualKept,['spark'],'手工维护的星火计划不随展示站导入');
 for(const edition of plan.editions){
  assert.ok(edition.newWorks.every(id=>typeof id==='string'&&id.includes('--')));
  assert.ok(Number.isInteger(edition.privateDropped)&&edition.privateDropped>=0);
 }
 assert.equal(fs.readFileSync(editionPath,'utf8'),before,'预览不得写任何文件');
});

test('import plan never carries private contact fields into the catalog contract', async () => {
 // 目录契约层再次兜底：即使来源带回 wechat/qr，规范化也会剔除。
 const {normalizeCatalog}=await import('../src/content/catalog.js');
 const {editions:[edition]}=normalizeCatalog([{id:'t',title:'t',tracks:['赛道'],works:[{id:'t--a',title:'a',author:'b',track:'赛道',tagline:'x',description:'y',tags:[],poster:'/p.jpg',thumb:'/t.jpg',source:'s',wechat:'wx',qr:'qr.png',contact:'a@b.c'}]}]);
 assert.equal(edition.works[0].wechat,undefined);
 assert.equal(edition.works[0].qr,undefined);
 assert.equal(edition.works[0].contact,undefined);
});
