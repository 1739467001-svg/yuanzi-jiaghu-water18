import assert from 'node:assert/strict';
import {PLACES, AGENTS, THEMES} from '../src/world/config.js';
import {findPath, walkable} from '../src/world/engine.js';

const placeKinds = new Set(['hall','tea','workshop','library','pavilion','placeholder']);
const ids = values => values.map(v => v.id);
const unique = values => new Set(values).size === values.length;

assert.ok(PLACES.length >= 1, '地图至少需要一个建筑');
assert.ok(unique(ids(PLACES)), '建筑 id 必须唯一');
assert.ok(unique(ids(AGENTS)), '角色 id 必须唯一');
for (const place of PLACES) {
  assert.ok(placeKinds.has(place.kind), `未知建筑类型: ${place.id}`);
  assert.ok(Number.isFinite(place.x) && Number.isFinite(place.z), `缺少坐标: ${place.id}`);
  assert.ok(place.w > 0 && place.d > 0, `建筑尺寸必须为正数: ${place.id}`);
  assert.ok(Array.isArray(place.entry) && place.entry.length === 2, `入口格式错误: ${place.id}`);
  assert.ok(findPath([-3, 1], place.entry).length, `入口不可达: ${place.id}`);
  if (place.kind === 'placeholder') assert.equal(place.status, 'placeholder', `${place.id} 必须明确标为占位建筑`);
  else assert.notEqual(place.status, 'placeholder', `${place.id} 不应误标为占位建筑`);
}
const placeIds = new Set(ids(PLACES));
for (const agent of AGENTS) {
  assert.ok(Array.isArray(agent.places) && agent.places.length > 0, `角色没有日程地点: ${agent.id}`);
  for (const id of agent.places) assert.ok(placeIds.has(id), `${agent.id} 前往了不存在的建筑 ${id}`);
}
assert.deepEqual(Object.keys(THEMES).sort(), ['campus','jianghu','mystery','startup']);
console.log(`World config valid: ${PLACES.length} places (${PLACES.filter(p => p.kind === 'placeholder').length} placeholders), ${AGENTS.length} agents, ${Object.keys(THEMES).length} themes.`);
