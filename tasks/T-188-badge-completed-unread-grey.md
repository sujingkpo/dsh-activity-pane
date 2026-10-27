---
doc-type: task
mutation: lifecycle
id: T-188
---

# T-188 侧栏「已完成」角标点按未读点亮

状态: completed
关联: R-01-026
风险等级: major
侧栏 glyph 的点亮判据与无障碍文案（用户可见状态语义）；实测语义行数超 minor 阈值 50，按升档条件取 major

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

- 实现: `src/client.mjs` glyph 的点亮判据改为布尔三元组（`dots = [["running", counts.running > 0], ["interaction", counts.interaction > 0], ["completed", counts.completedUnread > 0]]`，2625 行），`aria-label` / `title` 在无未读但仍有完成提醒时追加「（已全部读）」（2619-2622 行），`data-on` 由布尔直接派生（2662 行）；CSS 段头注释与组件 JSDoc 同步置灰判据；`.dsh-plugin/client.js` 经 `pnpm build:client` 重建。
- 测试: `node scripts/check.mjs` 全过（含新增 AC-16 bundle 契约断言）、`node scripts/host-reconcile.test.mjs` 全过、`node scripts/check-staged-client.mjs` 通过、`python tools/test_impact_lint.py --report` 通过；三个 e2e spec 的断言已按新口径改写并通过 `node --check`（按仓库「全手动验证」策略未跑 E2E，东家未要求）。
- SOLUTION 对照: 已核对 `SOLUTION.md`——`### 宿主侧栏角标` 的职责行补「已完成」点按未读点亮（R-01-026/AC-16），「未读角标提示」条目补点亮判据与「（已全部读）」文字通道；实现与方案无漂移。
- commit: 29a46c9（⭐ 功能(activity-pane): 侧栏「已完成」点改按未读点亮，全已读即置灰）
- 语义行数: 93
- review:
  - 审核方: 自查（对抗性审查口径，按仓库 AGENTS.md 第七条主动构造反例）
  - 目的理解: 「已完成」状态点在完成提醒全部读过后应与计数为 0 同款置灰，使点亮本身代表「还有没看过的完成提醒」；同时保留未读时的点亮与提示环，并在无障碍名称里给出文字依据。
  - 执行方式: 逐条构造反例核对——① 有未读 / 全已读 / 无完成提醒三态下的 `data-on` 与 `aria-label`；② 未读计数归零瞬间提示环 `data-badge-unread` 摘除与点置灰是否同帧一致；③ `badgeCounts` 初值全 0 时是否误报「（已全部读）」；④ 右栏 tab 关闭、桌面窄条两种窗格不在场形态下判据是否仍生效；⑤ 是否引入新的计数通道或写宿主状态。
  - 问题与修复: 自查发现（1）新增的 label 注释与原有 AC-10 注释重复表述未读语义——已合并为一条，避免两处口径漂移；（2）首版 `dots` 直接改值仍保留注释「计数为 0 的点置灰」，与「已完成按未读」冲突——CSS 段头注释与组件 JSDoc 已改为分别陈述两条判据；（3）badge-surfaces / badge-independence 原断言写死「点开关 = 该类计数」，改口径后必失败——已新增 `unreadOf` 助手并改为按类取判据，done-read-state 补全已读结算点的置灰与文案断言。
  - 复审结论: 无 blocking finding。三态边界（有未读点亮+环 / 全已读灰点+已全部读 / 无完成提醒不追加后缀）各有断言或代码分支；未改动数据通路、计数口径与宿主写回，`badgeEntries` 与三组计数断言未变。
