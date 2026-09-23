# 部署就绪清单

本文说明把原子江湖部署到云服务器前的准备、三种部署形态、已知缺口与检查顺序。所有命令在本机验证过；生产环境的安全与容量需在开放前另行评估。

## 运行要求

- Node.js 22.12+（本机验证版本 v22.22.1）。
- 依赖安装：`npm ci`。
- 端口：开发与 preview 默认 5173（`vite.config.js` 中 `strictPort`）；云上建议用反向代理（Nginx/Caddy）暴露 443。

## 三种形态

| 形态 | 命令 | 能力 | 适用 |
| --- | --- | --- | --- |
| 静态演示 | `VITE_BASE_PATH=/Atomic-Jianghu/ VITE_STATIC_DEMO=true npm run build`，产物 `dist/` 托管到任意静态主机或 GitHub Pages | 品牌、小镇、展馆、目录、导览、观展、本地记忆；无内容接口、无模型代理、无运营后台 | 公开演示、评审 |
| 本地开发 | `npm run dev` | 上述全部 + `/api/content/*` 内容服务 + `/api/chat` 模型代理 + `/admin.html` 运营后台 + 联机演示 | 内部调试 |
| 联机产品 | `npm run build && npm run world` | 单进程：静态资源 + 全部 API + WebSocket 世界服务（跨设备互见与私聊） | 小范围试用/上云 |
| 开发 | `npm run dev` | 同上 + HMR + 内容热加载 + 运营后台 | 内部调试 |

注意：`preview` 是普通 Node 进程，`server/content.mjs` 的热加载分支会失败并回退到启动时快照——应用导入后需重启 preview。开发态（`npm run dev`）无需重启。

## 环境变量（.env.local，勿提交）

| 变量 | 用途 | 默认 |
| --- | --- | --- |
| `ATOM_LLM_BASE_URL` | OpenAI 兼容模型服务地址 | `https://api.openai.com/v1` |
| `ATOM_LLM_API_KEY` | 密钥；同时是“演示/模型”模式开关 | 空（本地资料演示） |
| `ATOM_LLM_MODEL` | 模型名 | 空 |
| `ATOM_SESSION_LIMIT` | 每进程请求上限（原型保护） | 100 |
| `ATOM_OPS_STATE_PATH` | 运营状态文件位置 | `data/ops-state.json` |

不要把密钥放进 `VITE_` 前缀变量（会打进前端包）。

## 已补齐的缺口（相比首版）

1. 身份与鉴权：本地账号体系（scrypt、HttpOnly 会话、来源校验）。
2. 服务端权威世界：WebSocket 世界服务，跨设备互见、权威移动裁决、点对点私聊。
3. 持久预算：用量账本 + 每日预算 80%/100% 门禁。
4. 运营后台权限：/api/admin 要求运营角色，开发态提权 + 审计。

## 上线前必须完成（P0 缺口）

1. **身份与鉴权**：当前没有账号体系，界面标注“访客”；`playerId`/昵称不可作为身份依据。需要先接入稳定 userId 与服务端会话。
2. **服务端权威世界**：联机目前是同浏览器多标签（BroadcastChannel）。跨设备需服务端权威位置、房间与重连补偿。
3. **持久预算与计费**：`ATOM_SESSION_LIMIT` 只是进程内计数，重启归零；需要持久账本（requestId 去重、并发预留、硬上限）。
4. **运营后台权限**：`/admin.html` 目前无鉴权，任何能访问开发端口的人都能发布/撤回；生产必须加登录与角色，并确认 `data/ops-state.json` 的备份策略。
5. **私聊隐私**：私聊正文不进入公开事件流与世界快照（有测试保证），但同浏览器联机不等于端到端隐私；跨设备需服务端转发与权限校验。
6. **性能基准**：PRD 目标设备（M1/M2 16GB Mac 与中端 Windows 独显机）实测未做；`npm run bench` 只在本机 headless Chrome 记录过（首交互 1.40s、60 FPS 锁定）。

## 建议的上线顺序

1. 内部预览：静态构建（GitHub Pages 或对象存储 + CDN），确认品牌、内容与分享链接。
2. 邀请内测：`npm run preview` + 反向代理 + HTTPS；配置模型服务；开启运营后台前加基础鉴权。
3. 公开开放：补齐上表 1—5 项，具备内容撤回、模型停用、列表降级与版本回滚能力后再开放。

## 快速自检

```bash
npm ci
npm test                  # 49 项
npm run validate:world
npm run build
npm run preview           # 另一终端
npm run test:e2e          # 默认打 127.0.0.1:5173
npm run bench 60          # 性能基线（需 dev 或 preview 在跑）
```

静态形态自检：

```bash
VITE_BASE_PATH=/Atomic-Jianghu/ VITE_STATIC_DEMO=true npm run build
VITE_BASE_PATH=/Atomic-Jianghu/ npx vite preview --port 4173
TEST_BASE_URL=http://127.0.0.1:4173/Atomic-Jianghu/ TEST_STATIC_DEMO=true npm run test:e2e
```

（`preview` 必须带同样的 `VITE_BASE_PATH`，否则资源路径不匹配。）
