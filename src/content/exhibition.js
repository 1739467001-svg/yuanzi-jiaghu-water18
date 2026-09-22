// 共享展陈：每个房间固定一份已发布的 exhibitionId + layoutVersion。
// 真人与 AI 对同一展位看到相同作品；个人筛选只改变阅读面板，不改变展板。
// 首个共享展览按 PRD 待确认清单的默认方案：优先 FunSkills 审核通过作品。
import {allPublishedWorks} from './catalog.js';

export const SHARED_EXHIBITION={
 id:'exp-funskills-main-v1',
 title:'繁星之夜 · 推荐展陈',
 sourceEditionId:'funskills',
 layoutVersion:1,
 zoneSize:8,
};
export function exhibitionEntries(exhibition=SHARED_EXHIBITION){
 const works=exhibition.sourceEditionId?allPublishedWorks().filter(w=>w.editionId===exhibition.sourceEditionId):allPublishedWorks();
 return works;
}
export function exhibitionZoneCount(exhibition=SHARED_EXHIBITION){
 return Math.max(1,Math.ceil(exhibitionEntries(exhibition).length/exhibition.zoneSize));
}
export function exhibitionZone(exhibition=SHARED_EXHIBITION,zoneIndex=0){
 const entries=exhibitionEntries(exhibition);
 const start=zoneIndex*exhibition.zoneSize;
 return entries.slice(start,start+exhibition.zoneSize);
}
export function isExhibited(workId,exhibition=SHARED_EXHIBITION,zoneIndex=0){
 return exhibitionZone(exhibition,zoneIndex).some(w=>w.id===workId);
}
