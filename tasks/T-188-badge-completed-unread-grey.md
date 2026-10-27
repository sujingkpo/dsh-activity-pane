---
doc-type: task
mutation: lifecycle
id: T-188
---

# T-188 侧栏「已完成」角标点按未读点亮

状态: active
关联: R-01-026
风险等级: minor
风险面: 无（改动落在侧栏 glyph 的呈现判据与无障碍文案，不触碰数据通路、不写宿主状态、不动窗格渲染）

## 背景与目标

东家反馈（2026-10-27）：「左侧的活动会话（三个点），如果已完成的都已经已读了，状态要置灰（增加标识是否存在未读）」。

现状：三枚状态点按各自计数点亮，只要「已完成」计数大于 0 就亮绿，全部读过之后仍然亮绿——点亮不携带「有没有没看过的」这层信息。经二问确认（东家全选推荐项）：

1. 呈现——「已完成」点改为按**未读完成数**点亮，全部已读时与计数为 0 同款置灰（点亮即表示还有未读）；
2. 文字通道——全部已读时无障碍名称与悬停提示追加「（已全部读）」，读屏用户不依赖颜色也能知道该点为何是灰的。

## 差距评估

- PRD：R-01-026/AC-10 只约束「存在未读时给提示环」，未规定全已读时该点的呈现（新增 AC-16 承接）。
- 代码：`src/client.mjs` 的 glyph 里 `dots` 三元组按 `counts.completed` 点亮，`aria-label` 只在有未读时追加后缀。
- 测试：badge-surfaces / badge-independence 的「点开关与计数一致」断言按计数写死，改口径后必失败（须同步改）。

## 收敛方案

1. `src/client.mjs`：`dots` 改为布尔点亮判据三元组，其中「已完成」取 `counts.completedUnread > 0`；`aria-label` 在未读为零且存在完成提醒时追加「（已全部读）」。
2. `e2e/specs`：badge-surfaces / badge-independence 按新口径改断言（新增 `unreadOf` 助手）；done-read-state 在全部已读的结算点补「点置灰 + 文案已全部读」两条断言。
3. `scripts/check.mjs`：补 AC-16 的 bundle 契约断言（新 `dots` 字面量、`（已全部读）`、旧按计数写法不得残留）。

## 测试计划

- `pnpm build:client` 重建 `.dsh-plugin/client.js`；`node scripts/check.mjs` 全绿（含新增 AC-16 断言）。
- E2E（按需）：`node e2e/run.mjs badge-surfaces`、`badge-independence`、`done-read-state`。
- MANUAL：让一个会话进入完成提醒但不点开（未读）→ 点应亮绿并带提示环；点开该会话后再看 → 点应置灰、悬停提示含「（已全部读）」。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| R-01-026/AC-16 | 新增：「已完成」点按未读点亮、全已读置灰并明说「已全部读」 | UNIT/E2E/MANUAL | add | `scripts/check.mjs#R-01-026/AC-16`、`e2e/specs/done-read-state.mjs#R-01-026/AC-16`、`scripts/acceptance.mjs#R-01-026/AC-16` |
| R-01-026/AC-10 | 不变 | UNIT/E2E | add | 未读提示环与未读条数口径未改，仍由同一 `completedUnread` 驱动 |
| SOLUTION | 更新：宿主侧栏角标节补「按未读点亮」与「已全部读」口径 | UNIT | none | 方案文档措辞同步，行为已由 AC-16 断言覆盖 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：有未读时点亮、全已读时点灰 | `src/client.mjs::counts.completedUnread > 0`、`e2e/specs/done-read-state.mjs#completedOn` |
| 异常 | 适用：无完成提醒时不追加「已全部读」后缀 | `src/client.mjs::counts.completed > 0 ? "（已全部读）" : ""` |
| 边界配置 | 适用：桌面窄条与右栏 tab 关闭时点开关仍按同一口径 | `e2e/specs/badge-independence.mjs#R-01-026/AC-16` |
| 副作用 | 适用：不改变计数、不改数据通路、不写宿主状态 | `scripts/check.mjs#R-01-026/AC-16`（仅改点亮判据，`badgeEntries`/计数断言不变） |

## 终态与证据

- 实现: 待回填（`src/client.mjs` glyph 的 `dots` 点亮判据与 `aria-label` 后缀）。
- 测试: 待回填（`node scripts/check.mjs` 与 e2e/specs 三个 spec 的断言结果）。
- SOLUTION 对照: 待回填（`### 宿主侧栏角标` 的职责行与「未读角标提示」条目）。
- commit: 待回填。
