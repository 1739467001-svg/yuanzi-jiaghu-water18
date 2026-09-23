# 服务端权威世界（联机产品形态）

对应 PRD v1.0 W02/W03、7.2/7.3 与 G2。本文说明世界服务的协议、权威规则、运行方式与已知边界。

## 运行方式

| 场景 | 命令 | 说明 |
| --- | --- | --- |
| 开发 | `npm run dev` | Vite dev + `/ws` 世界服务 + 全部 API + 运营后台；HMR 走独立端口 5174 |
| 单进程部署 | `npm run build && npm run world` | `server/world.mjs` 起 HTTP + WebSocket 同端口，静态资源从 `dist/` 提供，含全部 API |
| 静态演示 | `VITE_BASE_PATH=… VITE_STATIC_DEMO=true npm run build` | 无世界服务；客户端自动回退到同浏览器 BroadcastChannel 演示 |

环境变量：`PORT`（默认 5173）、`HOST`（默认 0.0.0.0）、`ATOM_DATA_DIR`、`VITE_WORLD_WS_URL`（显式指定 WS 地址，如经反代或 CDN 时）。

## 协议（`/ws?room=<id>&name=<昵称>&color=%23xxxxxx&token=<会话>`）

服务端 → 客户端：

| 消息 | 含义 |
| --- | --- |
| `welcome` | 自我标识（服务端分配的 `self.id`）、房间、容量、当前 peer 列表、可走区域 |
| `peer-joined` / `peer-left` | 成员加入/离开（含原因：closed/timeout/error） |
| `peer-moved` / `peer-state` | 位置/状态广播 |
| `move-accepted` / `move-rejected` | 移动意图的裁决结果 |
| `direct-undelivered` | 私聊目标不在线 |
| `zone-accepted` / `zone-rejected` / `peer-zone` | 区域转换裁决与广播 |
| `dm` / `invite` / `invite-reply` / `block` | 点对点私聊与邀请 |

客户端 → 服务端：`move`（目标点）、`state`（状态文案/朝向）、`zone`（目标区域）、`dm`/`invite`/`invite-reply`/`block`、`ping`。

## 权威规则（PRD 7.2）

- 可走区域、目标有效性与最终位置由**服务端**决定：客户端只提交意图，服务端用同一份网格定义（`walkable`/`findPath`）计算路径与落点，非法目标拒绝，地图外目标就近吸附到可走点。
- 客户端插值不改变权限：收到 `move-accepted` 后才纠正本地位置。
- 单人同房间只受容量限制（默认 20，PRD 15.1 设计目标）；满员返回 1013。
- 受控区域转换（PRD 7.3）：`town` ↔ `hall` 只能经声明入口切换；服务端校验入口存在与距离（≤6 米），通过后取消冲突会话、更新区域与落点并广播；失败保留原区域并告知原因。
- 心跳 15 秒、45 秒无消息视为掉线并清理，房间空了即回收（上限 50 个房间）。
- 断线重连补偿（PRD 15.4）：按“房间 + 稳定身份”记住最近有效位置与区域（TTL 120 秒）；游客使用会话内稳定 id（sessionStorage），登录用户使用账号 id；重连时 `welcome.resumed` 为 true 并带区域，客户端恢复到该区域。

## 隐私边界

- 私聊与邀请只在收发双方之间路由，不进入房间广播，也不写世界快照。
- 授权记忆（发送方开启时）由服务端落到发送方账号下，`agentId` 记为 `peer:<对方id>`。
- 未登录也可以进世界（`guest_` 前缀身份）；登录后使用账号 id，收藏/记忆可跨设备。

## 观测

`GET /api/world`（仅单进程 `npm run world` 形态）返回房间列表、在线人数、容量与运行时长，不含任何私人内容。

## 已知边界

- 断线重连后位置由服务端重置为出生点，尚未实现“恢复最近有效位置”（PRD 15.4）。
- 多标签页同一会话不会互相冲突（同一 token 同一 id，服务端按 id 覆盖），但“后进入者接管/只读”策略未实现。
- 跨房间迁移、展馆区域切换的服务端权威尚未接入（当前为单房间主镇）。
- 服务端不做模型调用；观展与社交仍由各客户端本地引擎驱动（观感不跨设备同步）。
