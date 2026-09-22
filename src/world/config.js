// 布局唯一来源：建筑、入口、角色日程与展陈锚点都在此定义，产物共享 MAP_VERSION。
export const MAP_VERSION='atom-town-v1';
export const CONFIG_VERSION='characters-v1';
export const PLACES = [
 {id:'hall',name:'武林大会展示馆',short:'武林大会',subtitle:'每一份作品，都值得被看见',x:0,z:-9,w:7,d:5,kind:'hall',entry:[0,-4],description:'历届赛事与真实作品在这里相遇。阅读作品、认识作者，找到你的下一次共创灵感。'},
 {id:'tea',name:'江湖茶楼',short:'江湖茶楼',subtitle:'一盏茶，遇见同路人',x:-11,z:-6,w:5.5,d:4.5,kind:'tea',entry:[-10,-2],description:'分享正在做的事，也听听别人的新想法。这里的 AI 侠客可以聊作品、聊创作，陪你寻找下一步。'},
 {id:'workshop',name:'共创工坊',short:'共创工坊',subtitle:'把一个想法，做成一个作品',x:11,z:-5,w:5,d:5,kind:'workshop',entry:[10,-1],description:'人提供经验与认知，Agent 协助整理与探索。带上一个真实问题，和伙伴一起开始。'},
 {id:'library',name:'开源书院',short:'开源书院',subtitle:'分享，是最好的学习',x:-12,z:10,w:5,d:4,kind:'library',entry:[-8,10],description:'个体至上、开放共享、务实求真、互助共赢、持续进化。这里保存原子公社的共建理念。'},
 {id:'pavilion',name:'星火亭',short:'星火亭',subtitle:'星星之火，从一次相遇开始',x:12,z:10,w:3.5,d:3.5,kind:'pavilion',entry:[12,7],description:'这里是未来活动的相聚之所。星火计划的赛事介绍已有资料，最终参赛作品与结果仍在整理中。'},
 {id:'future-lodge',name:'功能待定建筑',short:'功能待定',subtitle:'先留一盏灯，等下一种可能',x:6,z:10,w:4.5,d:3.5,kind:'placeholder',status:'placeholder',entry:[6,7],description:'这是一座可替换的 3D 建筑占位。它先保留江湖街区的尺度、入口和展板，等后续明确功能后再换成客栈、推理所、校园空间或新的社区设施。'},
];
export const AGENTS = [
 {id:'ayuan',name:'阿原',role:'点灯人 · 迎新伙伴',color:'#427ab5',start:[-2,0],places:['tea','hall'],line:'少侠，欢迎来到原子江湖。先喝杯茶，还是去看看大家的作品？',interests:['生活成长','内容创作','效率工具']},
 {id:'shouguan',name:'知微',role:'守馆人 · 作品导览',color:'#719783',start:[1,-4],places:['hall','workshop'],line:'每个作品背后都有一个真实的问题。你对哪个方向感兴趣？',interests:['电商出海','金融投资','效率工具','内容创作','生活成长']},
 {id:'qinghe',name:'青禾',role:'共创者 · 创业交流',color:'#94a678',start:[-9,-1],places:['tea','workshop'],line:'先找到一个值得解决的小问题，再把它做出来。你最近在探索什么？',interests:['电商出海','智慧学务','科研实验']},
 {id:'moyu',name:'墨语',role:'记录者 · 内容创作',color:'#a17b9e',start:[8,1],places:['library','tea'],line:'好的经验值得被记录。来聊聊你最想分享的一个故事。',interests:['内容创作','生活成长','院务文化']},
 {id:'xingzhou',name:'行舟',role:'匠人 · 技术实践',color:'#b68b54',start:[10,-1],places:['workshop','hall'],line:'实践见真章。我们可以从一个能跑起来的小原型开始。',interests:['效率工具','科研实验','空间预约']},
 {id:'xiaoman',name:'小满',role:'书友 · 开源学习',color:'#be7770',start:[-7,10],places:['library','tea'],line:'分享是最好的学习。你想从哪一类作品开始看起？',interests:['评奖测评','智慧学务','生活成长']},
 {id:'zhaolu',name:'朝露',role:'探索者 · 生活成长',color:'#77969e',start:[-5,2],places:['pavilion','library'],line:'进步不一定很大，每天有一点新发现就很好。',interests:['生活成长','内容创作']},
 {id:'xinghe',name:'星河',role:'旅人 · 社区共建',color:'#7d84aa',start:[10,7],places:['pavilion','hall'],line:'一个人可以出发，一群人能走得更远。欢迎来江湖结识伙伴。',interests:['院务文化','空间预约','金融投资']},
];
export const THEMES={jianghu:{name:'原子江湖',roof:'#42746d',grass:'#b9c8a3',sky:'#e9eee6'},startup:{name:'创业社区',roof:'#587c92',grass:'#bdcbb1',sky:'#e8eef0'},mystery:{name:'推理小镇',roof:'#625d79',grass:'#aab6af',sky:'#e7e5ee'},campus:{name:'虚拟校园',roof:'#ad7860',grass:'#b9cd9d',sky:'#eef0e1'}};
