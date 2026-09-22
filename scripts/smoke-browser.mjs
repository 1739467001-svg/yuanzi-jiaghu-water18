import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
fs.mkdirSync('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);await page.waitForSelector('.scene-pin.player');await page.waitForTimeout(1500);
 await page.screenshot({path:'artifacts/town-desktop.png'});
 await page.getByRole('button',{name:'武林大会',exact:true}).click();
 assert.equal(await page.locator('.work-card').count(),38);
 assert.equal(await page.locator('.exhibiting-badge').count(),8);
 assert.match(await page.locator('.result-line').textContent(),/公共展陈 展区 1\/\d+/);
 assert.match(await page.locator('.version-line').textContent(),/editions-snapshot-v1/);
 await page.getByRole('button',{name:/数智星光展/}).click();assert.equal(await page.locator('.work-card').count(),18);
 assert.equal(await page.locator('.exhibiting-badge').count(),0);
 await page.getByRole('button',{name:/繁星之夜/}).click();
 await page.getByRole('textbox',{name:'搜索作品'}).fill('StoryMap');assert.equal(await page.locator('.work-card').count(),1);
 await page.locator('.work-card').click();await page.getByRole('button',{name:'收藏到手札'}).click();assert.equal(await page.getByRole('button',{name:'已收入手札'}).count(),1);
 const link=page.url();await page.reload();await page.getByRole('dialog',{name:'StoryMap'}).waitFor();assert.equal(page.url(),link);
 await page.getByRole('dialog',{name:'StoryMap'}).getByRole('button',{name:'关闭窗口'}).click();await page.getByRole('button',{name:'关闭窗口'}).click();
 await page.getByRole('button',{name:'返回小镇',exact:true}).click();
 await page.getByRole('button',{name:'和阿原聊聊'}).click();await page.getByRole('checkbox').check();
 await page.getByRole('textbox',{name:'聊天消息'}).fill('我喜欢内容创作');await page.getByRole('button',{name:'发送消息',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.chat-work').length>0);
 await page.getByRole('button',{name:'你还记得我吗？',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.chat-messages').textContent.includes('在你允许保存'));
 await page.getByRole('button',{name:'关闭窗口'}).click();await page.getByRole('button',{name:/游历手札/}).click();await page.getByRole('button',{name:'私人记忆',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'删除这条记忆'}).count(),1);await page.getByRole('button',{name:'删除这条记忆'}).click();
 await page.getByRole('button',{name:'关闭窗口'}).click();await page.getByRole('button',{name:'和阿原聊聊'}).click();await page.getByRole('button',{name:'你还记得我吗？',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.chat-messages').textContent.includes('我还没有你授权保存'));
 // Arrow keys in the input must not switch exhibits or move the player.
 await page.getByRole('textbox',{name:'聊天消息'}).fill('输入框中的测试');await page.getByRole('textbox',{name:'聊天消息'}).press('ArrowLeft');assert.ok(await page.getByRole('dialog',{name:'与阿原聊聊'}).isVisible());
 await page.getByRole('button',{name:'关闭窗口'}).click();await page.getByRole('button',{name:'小镇设置',exact:true}).click();await page.getByRole('textbox',{name:'我的昵称'}).fill('行走的原子');await page.getByRole('button',{name:'虚拟校园',exact:true}).click();await page.getByRole('button',{name:'关闭窗口'}).click();await page.getByRole('button',{name:'小镇设置',exact:true}).click();assert.match(await page.getByRole('textbox',{name:'我的昵称'}).inputValue(),/行走的原子/);await page.getByRole('button',{name:'关闭窗口'}).click();
 await page.getByRole('button',{name:'切换夜景',exact:true}).click();await page.waitForTimeout(800);await page.screenshot({path:'artifacts/town-night.png'});
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(base);await mobile.waitForSelector('.scene-pin.player');assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);await mobile.screenshot({path:'artifacts/town-mobile.png'});await mobile.getByRole('button',{name:'武林大会',exact:true}).click();assert.equal(await mobile.locator('.work-card').count(),38);await mobile.screenshot({path:'artifacts/gallery-mobile.png'});await mobile.getByRole('textbox',{name:'搜索作品'}).fill('no-result-000');assert.equal(await mobile.locator('.work-card').count(),0);
 const fallback=await browser.newPage();fallback.on('pageerror',e=>errors.push(e.message));await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.includes('webgl'))return null;return original.call(this,type,...args);};});await fallback.goto(base);await fallback.getByRole('button',{name:'打开比赛展示馆'}).click();await fallback.getByRole('button',{name:'进入展示馆',exact:true}).click();assert.equal(await fallback.locator('.work-card').count(),38);
 if(process.env.TEST_STATIC_DEMO!=='true'){const response=await page.request.post(base+'/api/chat',{data:null});assert.equal(response.status(),400);}
 if(process.env.TEST_STATIC_DEMO!=='true'){
  const degraded=await browser.newPage();degraded.on('pageerror',e=>errors.push(e.message));
  await degraded.addInitScript(()=>{const original=window.fetch;window.fetch=(input,...args)=>String(input).includes('/api/content/catalog')?Promise.reject(new Error('offline')):original(input,...args);});
  await degraded.goto(base);await degraded.waitForSelector('.toast');
  assert.match(await degraded.locator('.toast').textContent(),/已切换本地内容快照/);
  await degraded.getByRole('button',{name:'武林大会',exact:true}).click();
  assert.equal(await degraded.locator('.work-card').count(),38);
  assert.match(await degraded.locator('.version-line').textContent(),/本地快照降级/);
 }
 // 联机演示：同一上下文的两个标签页应互相看到真人化身，关闭后清理。
 const room=await browser.newContext({viewport:{width:1280,height:800}});
 const seatA=await room.newPage();const seatB=await room.newPage();
 seatA.on('pageerror',e=>errors.push('netA:'+e.message));seatB.on('pageerror',e=>errors.push('netB:'+e.message));
 await seatA.goto(base);await seatB.goto(base);await seatA.waitForSelector('.scene-pin.player');await seatB.waitForSelector('.scene-pin.player');
 await seatA.waitForFunction(()=>document.querySelectorAll('.scene-pin.peer').length>0,null,{timeout:8000});
 assert.match(await seatA.locator('.world-status').textContent(),/访客 · 联机演示 1 人同行/);
 assert.match(await seatB.locator('.world-status').textContent(),/访客 · 联机演示 1 人同行/);
 assert.match(await seatA.locator('.scene-pin.peer').first().textContent(),/真人/);
 assert.match(await seatA.title(),/^\(1\)/);
 await seatA.screenshot({path:'artifacts/net-two-tabs.png'});
 // 私聊：点击真人名帖发起邀请，接受后一对一交谈；正文不进入公开动态。
 await seatA.locator('.scene-pin.peer').first().click();
 await seatB.waitForSelector('.invite-dialog',{timeout:6000});
 await seatB.getByRole('button',{name:/接受邀请/}).click();
 await seatA.waitForSelector('.dm-dialog',{timeout:6000});
 await seatA.getByRole('textbox',{name:'私聊消息'}).fill('私下交流测试正文');
 await seatA.getByRole('button',{name:'发送私聊'}).click();
 await seatB.waitForFunction(()=>document.querySelector('.dm-dialog .chat-messages').textContent.includes('私下交流测试正文'),{timeout:6000});
 const feedA=await seatA.locator('.happenings').innerText();
 const feedB=await seatB.locator('.happenings').innerText();
 assert.equal(feedA.includes('私下交流测试正文')||feedB.includes('私下交流测试正文'),false,'私聊正文不得进入公开动态');
 // “开始私下交流”由接受方记录，双方都不出现正文。
 assert.match(feedB,/私下交流/,'公开动态只记录“开始私下交流”的事实');
 assert.match(await seatA.locator('.scene-pin.peer').first().textContent(),/私语中/);
 await seatB.close();
 await seatA.waitForFunction(()=>document.querySelectorAll('.scene-pin.peer').length===0,null,{timeout:9000});
 assert.match(await seatA.locator('.world-status').textContent(),/本地世界/);
 assert.deepEqual(errors,[]);
 console.log('PASS: 38/18 works, search, bookmarking, deep-link reload, chat retrieval, opt-in memory, deletion, input focus, customization, night mode, mobile, no-WebGL fallback, invalid API input, two-tab presence, private DM. No page exceptions.');
}finally{await browser.close();}
