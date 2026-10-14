---
doc-type: task
mutation: lifecycle
id: T-175
---

# T-175 角标与弹窗的数据通路抽离窗格渲染面

状态: completed
关联: R-01-026
风险等级: standard

## 背景与目标

东家立项（2026-10-14，C-098）：宿主侧栏「活动会话」入口行的三状态角标与点开的弹窗，当前依赖右侧栏「活动会话」停靠页签处于打开状态；要求活动会话被关闭后后台仍持续运行、不依赖前台打开。属缺陷修复 + 需求补落点（角标/弹窗此前在 PRD/SOLUTION/DOMAIN 三层均无落点，本次经东家闸口走全链补齐 map 后修复）。

现状与期望差距：停靠模式下属实——该页签是右栏唯一停靠 tab，用户关闭即整列收起，插件正文组件卸载使 `sidebarRightHost` 归 null，`render()` 在 `ensurePane()` 返回 null 时整轮早退（第二处早退是窗格渲染签名去重，同样位于角标刷新之前），角标计数与弹窗明细冻结在关栏那一刻。期望：角标与弹窗与窗格卡片同源同口径，更新只依赖宿主会话/工作区/运行状态服务的订阅推送，窗格是否挂载、是否前台呈现都不影响。

## 差距评估

- PRD：新增 R-01-026（宿主侧栏角标与明细弹窗，AC-01～AC-07），已落地。
- SOLUTION：需求追溯索引、横切约束与子系统「宿主侧栏角标」已落地。
- DOMAIN：新增「宿主侧栏角标」词条及入口行/三状态角标/角标弹窗术语、两条实体关系与一条跨模块不变量，已落地。
- 代码：`src/client.mjs` 的 `render()` 派生段与窗格渲染段混写，两处早退（`pane === null`、渲染签名未变）都在角标刷新之前；`syncStatusBadges` 就地重算与 `src/core.mjs#statusBadges` 同口径的副本；窗口渲染层原本各自 filter 一遍三类条目用于弹窗明细。
- 测试：`scripts/check.mjs` 无角标解耦契约；`e2e/specs/` 对角标入口行、弹窗与「窗格卸载后是否仍更新」零覆盖（既有门禁全部锚定窗格在屏形态）。

## 收敛方案

1. `src/client.mjs`：把 `render()` 内的活动模型派生整段抽为窗格无关的 `deriveActiveModel()`（快照 → 活动/已完成/最近三分区、明细注入、订阅与回收记账），置于 `render()` 之前；`render()` 先派生、再按窗格可得性分流。
2. `src/client.mjs`：`syncStatusBadges(activeEntries, doneList)` 收口为 `syncBadgeSurface(activeEntries, doneList)`，在「窗格缺席」「骨架未就位」「在屏」三条路径各调用一次且都位于窗格渲染签名去重之前；去重另起 `lastBadgeSig`（计数三元组 + 三组明细 id），不与窗格渲染签名共用；不再接受脉冲面参数（角标不依赖窗格脉冲面）。
3. `src/core.mjs` 增 `classifyActiveEntries(entries)`（一次归类给出三组条目，`statusBadges` 复用其长度），`src/client.mjs` 的角标计数与弹窗明细改走该单点口径（运行中 = kind `running`；需要交互 = kind `awaiting` 且 `waitClass` `blocked`；已完成 = kind `awaiting` 且 `waitClass` `done`），删除就地重算副本。
4. `scripts/check.mjs`：新增 R-01-026 契约断言——派生函数存在且位于 `render()` 之前、派生体内不出现窗格标识符、`render()` 先派生再判窗格、窗格缺席分支内同时刷新角标与弹窗、`lastBadgeSig` 独立去重且三处调用点均在窗格签名去重之前、计数与三组明细取 `classifyActiveEntries` 单点、角标刷新面不自带网络通道。
5. `e2e/specs/badge-independence.mjs`（新增）与 `e2e/specs/badge-surfaces.mjs`（新增）：前者锚 AC-02/03/05/07（右栏 tab 关闭后角标推进、弹窗分组与条目跳转、Escape 焦点归还），后者锚 AC-01/02/04/06（角标结构与非主面板切换、宿主侧边栏折叠态推进、宿主布局缺失态推进且无本插件报错）。

## 测试计划

- unit（scripts/check.mjs）：R-01-026 解耦形态与口径单点契约；既有 161+ 断言全绿。
- E2E：
  - `e2e/specs/badge-independence.mjs`：R-01-026/AC-02、AC-03、AC-05、AC-07。
  - `e2e/specs/badge-surfaces.mjs`：R-01-026/AC-01、AC-02、AC-04、AC-06。
  - 其余既有 spec 全量回归（本次改动触及 `render()` 主体结构与派生段位置，须证无回归）。
- MANUAL：桌面深色/浅色主题下角标与弹窗呈现（宿主主题别名取色）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| SOLUTION | 方案层演进：新增子系统「宿主侧栏角标」与同源解耦横切约束 | UNIT/E2E | update | 两条新 spec 锚定新子系统行为 |
| R-01-026/AC-01、AC-02 | 新增 | E2E+UNIT | 新增断言 | badge-surfaces.mjs 角标结构与弹窗分组；check.mjs 口径单点 |
| R-01-026/AC-03 | 新增 | E2E+UNIT | 新增断言 | badge-independence.mjs 右栏关闭后推进；check.mjs 解耦形态 |
| R-01-026/AC-04、AC-06 | 新增 | E2E | 新增断言 | badge-surfaces.mjs 布局缺失态与侧栏折叠态 |
| R-01-026/AC-05、AC-07 | 新增 | E2E | 新增断言 | badge-independence.mjs 条目跳转与焦点归还 |
| R-01-001..R-01-025、R-02-001..004 | 不变 | E2E+UNIT | 保留 | `render()` 主体结构迁移须全量回归证明无行为变化 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：右栏「活动会话」页签被用户关闭（窗格卸载）后，新建会话完成时角标计数增长、弹窗列出该会话、条目跳转且窗格不回到前台 | `e2e/specs/badge-independence.mjs#R-01-026/AC-03`、`e2e/specs/badge-independence.mjs#R-01-026/AC-05`、`src/client.mjs::function deriveActiveModel` |
| 异常 | 适用：宿主布局缺失（会话座与其容器被摘除，窗格取不到座位）时角标仍推进且不产生本插件控制台报错；弹窗 Escape 关闭并把焦点归还入口行 | `e2e/specs/badge-surfaces.mjs#R-01-026/AC-04`、`e2e/specs/badge-independence.mjs#R-01-026/AC-07`、`src/client.mjs::function syncBadgeSurface` |
| 边界配置 | 适用：宿主侧边栏折叠为图标态时角标继续推进；窗格在屏但渲染签名未变时角标刷新不被签名短路（调用点位于签名去重之前） | `e2e/specs/badge-surfaces.mjs#R-01-026/AC-06`、`scripts/check.mjs#R-01-026/AC-03`、`src/client.mjs::lastBadgeSig` |
| 副作用 | 适用：窗格在屏路径的卡片渲染、签名去重、跨区迁移、数量徽标与既有 spec 行为不变 | `scripts/check.mjs#R-01-026`、`e2e/specs/opening-indicator.mjs#R-01-005/AC-01`、`src/client.mjs::if (sig === lastSig && optionSig === lastOptionSig) return;` |
| 并发 | 适用：两页面共享同一宿主服务与推送，一侧摘除会话座后另一侧创建会话完成，摘除侧角标仍推进（订阅推送与窗格挂载无关） | `e2e/specs/badge-surfaces.mjs#R-01-026/AC-04`、`src/client.mjs::function deriveActiveModel` |

## 终态与证据

- 实现: `src/client.mjs` 抽出窗格无关的 `deriveActiveModel()`（置于 `render()` 之前），`render()` 先派生再判窗格，窗格缺席分支刷新角标与弹窗后返回；`syncStatusBadges` 收口为 `syncBadgeSurface(activeEntries, doneList)` 并以 `lastBadgeSig` 独立去重，三处调用点均在窗格渲染签名去重之前。
- 测试: agentmap lint `passed`（acceptance-criteria=188、test-anchored=188）；`node scripts/check.mjs` → `check: all assertions passed`；`node e2e/run.mjs badge-independence` 与 `badge-surfaces` → PASS；全量 `node e2e/run.mjs`（24 个 spec）→ 22 PASS / 1 SKIP（mobile-shell）/ 1 FAIL，唯一失败的 `e2e/specs/background-jobs.mjs` 在同一基线工作树两次复跑均同样失败于 `e2e/specs/background-jobs.mjs:67` 的「中间档母卡数量注出现」超时，属既有问题。
- SOLUTION 对照: 需求追溯索引新增 R-01-026 一行，主责子系统为「宿主侧栏角标」，代码位置 `src/client.mjs`、`src/core.mjs` 与实现一致，口径单点为 `src/core.mjs#classifyActiveEntries(entries)`；`## 横切约束` 的「角标面与窗格面同源解耦」与实现呈现一致。
- commit: 60cd2ee
- review:
  - 审核方: Standards 轴子代理 66b6a7e5-7af9-4527-8cbd-ee4f26f367db；Spec 轴子代理 3d7aed91-0cdb-4e5b-95e1-980cc7aed34f（均独立于执行方，评审基线 eba080d8ee8fe9de6b3042e589fbe048ecba61f7）。
  - 目的理解: 角标与弹窗必须与窗格卡片同源同口径，其更新只依赖宿主会话/工作区/运行状态服务的订阅推送——窗格是否挂载、是否前台呈现都不影响；改动不得引入新的网络轮询，也不得重开用户主动关闭的页签。
  - 执行方式: code-review skill，两轴并行独立子代理（Standards 轴审仓库编码规范与结构，Spec 轴审 PRD/SOLUTION 契约与验收覆盖），只读工作树并逐条给出 file:line。
  - 问题与修复: 首轮 8 类发现全部处置——①AC-06 窄条态零证据（补 badge-surfaces 窄条分支：折叠窄条后新建会话并断言已完成计数增长）；②本 task 误引 C-090（改 C-098）；③until 判据空串判真（改真值语义，并修 spec 内被写成双反斜杠的正则）；④AC-03 把停靠页签机制写进 EARS 触发条件（改写为「承载窗格的前台容器」，机制词退场）；⑤check.mjs 窗格缺席分支用固定 400 字近似切片（改锚 `} = deriveActiveModel();` 到该分支后 `applyLayout();` 的区间，并加不含 `pane.` 的负断言）；⑥角标计数与弹窗明细重复 filter 同口径（core 新增 `classifyActiveEntries` 单点，`statusBadges` 复用其长度，SOLUTION 同步）；⑦「不新增轮询」断言锚错函数（从 `syncBadgeSurface` 改锚派生段 `deriveBody`）；⑧`debug.log` 等临时产物混入（已删）。Spec 轴复审另指出「需要交互」组缺非空驱动路径、全量 spec 计数写成 22（实为 24）、基线归因需可重复——已分别补 `e2e:ask` 驱动、修正计数、在同一基线上两次复跑证明失败可重复。
  - 复审结论: 两轴复审均判定首轮 8 条已消除（Standards 轴用 node 复现 bundle 三段拼接逐字相等并静态重放 check 全部切片断言为真；Spec 轴静态重放 9 条新断言全 PASS 并复核 `git ls-tree` 确认 debug.log 从未入库）；Spec 轴标注 (a)3 为部分覆盖并给出补测路径（已补）。残余风险：`deriveActiveModel()` 返回 8 元裸元组未拆分、`syncBadgeSurface` 的 `doneList` 为文档化保留参数（两处均为审核方同意保留项）；`scripts/check.mjs` 的 R-01-026 结构断言属文本契约而非行为契约。
