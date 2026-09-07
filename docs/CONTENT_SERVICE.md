# 展馆内容服务

当前阶段新增了只读内容服务，统一提供赛事、赛道与作品数据。开发和 preview 服务都支持这些接口：

- `GET /api/content/health`：返回已发布赛事和作品数量。
- `GET /api/exhibitions`：赛事目录，只返回摘要和作品数量。
- `GET /api/exhibitions/{editionId}`：一届赛事的完整介绍、赛道和作品。
- `GET /api/works?edition=&track=&q=`：按赛事、赛道和关键词查询作品。
- `GET /api/works/{workId}`：作品详情。

当前数据全部来自经过白名单导入的 `src/data/editions.json`。服务层给每届赛事和作品加上 `status: published` 与 `version: 1`，并且只读，不提供未经审核的写入接口。

内容字段已经保留 `source` 和 `sourceStatus`，暂时不迁移微信号、群二维码或私人联系方式。正式运营后台接入前，发布状态仍是本地静态数据，不能当成云端审核系统。

下一小步是把 `App.jsx` 的静态导入改为读取这组接口，并增加加载、空数据和接口失败时的列表降级；之后再把同一查询结果提供给 AI 导览。
