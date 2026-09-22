import test from 'node:test';
import assert from 'node:assert/strict';
import {guideReply, GUIDE_QUESTIONS, editionSummary, GUIDE_AGENT} from '../src/content/guide.js';
import {allPublishedWorks, findWork} from '../src/content/catalog.js';
const valid = ids => ids.every(id => findWork(id));
const texts = [
  '本届有哪些赛道', '有哪些赛道和作品数', '效率工具有哪些作品', '金融投资方向有什么',
  '带我看看电商视频全能版', '星火计划是什么比赛', '繁星之夜是什么', '谁是本届一等奖',
  '获得金奖的作品是谁', '介绍原子公社', '你还记得我吗', '推荐一些内容创作的作品',
  '今天天气怎么样', '谁是作者', 'StoryMap', '',
];
test('every guide citation resolves to a published work', () => {
  for (const text of texts) {
    const reply = guideReply({text});
    assert.ok(valid(reply.workIds), `引用无效: ${text} -> ${reply.workIds.join(',')}`);
    assert.ok(reply.intent, 'intent 必须存在');
    assert.ok(reply.text.length > 0);
  }
});
test('structured facts take priority: stats, tracks, editions', () => {
  const stats = guideReply({text: '本届有哪些赛道'});
  assert.equal(stats.intent, 'stats');
  assert.match(stats.text, /繁星之夜：38 份作品，5 个赛道/);
  assert.match(stats.text, /数智星光展：18 份作品/);
  assert.match(stats.text, /星火计划：0 份作品，4 个赛道/);
  const track = guideReply({text: '效率工具有哪些作品'});
  assert.equal(track.intent, 'track');
  assert.equal(track.workIds.length, 3);
  assert.ok(track.workIds.every(id => findWork(id).track === '效率工具'));
  const edition = guideReply({text: '星火计划是什么比赛'});
  assert.equal(edition.intent, 'edition');
  assert.match(edition.text, /星火燎原/);
  assert.match(edition.text, /仍在整理/);
  assert.equal(edition.workIds.length, 0);
});
test('awards and unindexed questions are answered honestly', () => {
  for (const q of ['谁是本届一等奖', '获得金奖的作品是谁', '最终排名是什么']) {
    const reply = guideReply({text: q});
    assert.equal(reply.intent, 'award');
    assert.match(reply.text, /没有收录/);
    assert.equal(reply.workIds.length, 0);
  }
  const fallback = guideReply({text: '今天天气怎么样'});
  assert.equal(fallback.intent, 'fallback');
  assert.equal(fallback.workIds.length, 0);
  assert.match(fallback.text, /未收录|没有收录|只回答已发布资料/);
});
test('direct work lookup, brand and memory routes stay in scope', () => {
  const direct = guideReply({text: '带我看看电商视频全能版'});
  assert.equal(direct.intent, 'work');
  assert.equal(direct.workIds[0], 'funskills--ecom-video');
  const brand = guideReply({text: '介绍原子公社'});
  assert.equal(brand.intent, 'brand');
  assert.match(brand.text, /个体至上/);
  const remembered = guideReply({text: '你还记得我吗', memories: [{text: '我在做电商选题'}]});
  assert.equal(remembered.intent, 'memory');
  assert.match(remembered.text, /我在做电商选题/);
  const forgot = guideReply({text: '你还记得我吗', memories: []});
  assert.match(forgot.text, /没有.*授权保存|还没有/);
});
test('empty input asks for a direction', () => {
  const reply = guideReply({text: ''});
  assert.equal(reply.intent, 'empty');
  assert.equal(reply.workIds.length, 0);
});
test('edition summary counts tracks from published works only', () => {
  const funskills = allPublishedWorks().find(w => w.editionId === 'funskills');
  const summary = editionSummary({id: 'funskills', title: '繁星之夜', subtitle: 'x', description: 'y', works: allPublishedWorks().filter(w => w.editionId === 'funskills')});
  assert.equal(summary.works, 38);
  assert.equal(summary.tracks.length, 5);
  assert.ok(summary.tracks.every(t => t.count > 0));
  assert.equal(GUIDE_AGENT.id, 'shouguan');
  assert.equal(GUIDE_QUESTIONS.length >= 3, true);
});
