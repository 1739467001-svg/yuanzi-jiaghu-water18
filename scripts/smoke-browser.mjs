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
 await page.getByRole('button',{name:/数智星光展/}).click();assert.equal(await page.locator('.work-card').count(),18);
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
 await page.getByRole('button',{name:'关闭窗口'}).click();await page.getByRole('button',{name:'小镇设置',exact:true}).click();await page.getByRole('textbox',{name:'我的昵称'}).fill('行走的原子');await page.getByRole('button',{name:'虚拟校园',exact:true}).click();await page.getByRole('button',{name:'关闭窗口'}).click();assert.match(await page.getByRole('button',{name:'定制我的侠客'}).textContent(),/行走的原子/);
 await page.getByRole('button',{name:'切换夜景',exact:true}).click();await page.waitForTimeout(800);await page.screenshot({path:'artifacts/town-night.png'});
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(base);await mobile.waitForSelector('.scene-pin.player');assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);await mobile.screenshot({path:'artifacts/town-mobile.png'});await mobile.getByRole('button',{name:'武林大会',exact:true}).click();assert.equal(await mobile.locator('.work-card').count(),38);await mobile.screenshot({path:'artifacts/gallery-mobile.png'});await mobile.getByRole('textbox',{name:'搜索作品'}).fill('no-result-000');assert.equal(await mobile.locator('.work-card').count(),0);
 const fallback=await browser.newPage();fallback.on('pageerror',e=>errors.push(e.message));await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.includes('webgl'))return null;return original.call(this,type,...args);};});await fallback.goto(base);await fallback.getByRole('button',{name:'打开比赛展示馆'}).click();await fallback.getByRole('button',{name:'进入展示馆',exact:true}).click();assert.equal(await fallback.locator('.work-card').count(),38);
 const response=await page.request.post(base+'/api/chat',{data:null});assert.equal(response.status(),400);
 assert.deepEqual(errors,[]);
 console.log('PASS: 38/18 works, search, bookmarking, deep-link reload, chat retrieval, opt-in memory, deletion, input focus, customization, night mode, mobile, no-WebGL fallback, invalid API input. No page exceptions.');
}finally{await browser.close();}
