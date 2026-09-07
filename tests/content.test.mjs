import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog, allPublishedWorks, findEdition, findWork, queryWorks} from '../server/content.mjs';

test('published catalog has stable edition and work IDs', () => {
  assert.equal(catalog.length, 2);
  assert.equal(allPublishedWorks.length, 56);
  assert.equal(new Set(catalog.map(e => e.id)).size, catalog.length);
  assert.equal(new Set(allPublishedWorks.map(w => w.id)).size, allPublishedWorks.length);
  assert.ok(allPublishedWorks.every(w => w.status === 'published' && w.version === 1));
});
test('edition and work detail are linked by stable IDs', () => {
  for (const edition of catalog) for (const work of edition.works) {
    assert.equal(work.editionId, edition.id);
    assert.equal(findWork(work.id).id, work.id);
  }
  assert.equal(findEdition('missing-edition'), undefined);
  assert.equal(findWork('missing-work'), undefined);
});
test('work query supports edition, track and text filters', () => {
  assert.equal(queryWorks({editionId: 'funskills'}).length, 38);
  assert.equal(queryWorks({editionId: 'hackathon', track: '科研实验'}).length, 4);
  const results = queryWorks({q: 'StoryMap'});
  assert.equal(results.length, 1);
  assert.equal(queryWorks({q: 'not-a-real-work'}).length, 0);
});
test('published content does not expose private contact fields', () => {
  for (const work of allPublishedWorks) {
    assert.equal(work.wechat, undefined);
    assert.equal(work.qr, undefined);
    assert.equal(work.contact, undefined);
  }
});
