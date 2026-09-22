# 资产规范与接入管线

对应 PRD v1.0 第 14 节（3D 资产与主题扩展）与 A19。本文定义首批 3D 资产的登记格式、加载规则与接入路径；正式美术资产未到位前，场景使用程序化几何占位。

## 单一事实来源

`public/world-assets/manifest.json` 是资产登记的唯一来源。每个条目：

| 字段 | 约束 |
| --- | --- |
| `id` | 稳定标识，全清单唯一 |
| `kind` | `character` / `building` / `prop` / `decoration` |
| `glb` | 正式资产路径（以 `/` 开头）或 `null`（尚为程序化占位） |
| `fallback` | 程序化兜底标识（`procedural:character`、`procedural:atomSculpture`、`procedural:stand`） |
| `version` | 正整数，随资产更新递增 |
| `license` | 来源、授权状态与使用范围；未审核资产不得进入生产构建 |
| `requiredAnimations` | 角色必填：idle / walk / talk / listen / observe |

清单自身携带 `manifestVersion`、`mapVersion` 与约定（1 单位 = 1 米、脚底原点、正面朝 +Z）。

## 加载规则（src/world/assets.js）

- GLB 优先：`resolveAsset` 先尝试加载条目声明的 GLB。
- 失败即兜底：文件缺失、加载错误或场景为空时，回退到程序化占位，不阻断世界构建。
- 版本与地图绑定：清单声明 `mapVersion`；与当前地图版本不一致时应拒绝加载并回退（接入场景构建时落实）。
- 清单校验：`validateManifest` 检查必填、唯一 id、版本、授权与动画声明；`tests/assets.test.mjs` 对损坏契约逐条断言拒绝。

## 证明管线可用

- `scripts/make-proof-glb.mjs` 生成一个最小合法 GLB（二十面体“原子核”，20 三角形，PBR 金色材质）到 `public/world-assets/models/proof-atom-core.glb`。
- 测试直接解析该文件（GLTFLoader），确认几何与材质可读——正式 GLB 走的就是这条路径。
- 生成/复现：`node scripts/make-proof-glb.mjs`。

## 接入路径（下一步）

1. 品牌 GLB 到位后放入 `public/world-assets/models/`，在清单登记（填 `glb`、`version`、`license`）。
2. 首个接入点是小镇广场的原子轨道雕塑（清单条目 `atom-sculpture`，兜底 `procedural:atomSculpture`）：场景构建时读清单、解析条目、失败回退现状。
3. 角色接入需确认骨架兼容与五个必备动画；骨架不同的新 IP 需适配，不承诺任意新模型零代码接入。

## 尚未完成

正式 GLB、骨架与绑定动画、LOD、资产压缩后体积预算、纹理/字体/音乐清单登记。角色形象当前为依据用户提供 IP 特征（黑斗笠、蓝衣带、白脸、红脸颊、佩剑）制作的几何原型，需品牌外形审核。
