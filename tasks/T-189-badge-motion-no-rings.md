---
doc-type: task
mutation: lifecycle
id: T-189
---

# T-189 侧栏角标三态动效改为无边框通道

状态: active
关联: R-01-026
风险等级: major
风险面: 侧栏 glyph 的用户可见动效语义（三态区分与降低动效回退）；实测语义行数超 minor 阈值 50，按升档条件取 major

## 背景与目标

东家反馈（2026-10-28）：「放大动画与提醒 不要新增边框，多做几个样式我看看，选择后再决定变更成什么样子的动画」。

现状三处动效各套了一圈 **border 环**：一次性新增强调用 `::after` 2px 实线光环（`dap-badge-halo`），未读提示用 `::before` 1.5px 绿环，「需要交互」常闪用 `::after` 2px 金环。18px 字形盒里这些环读起来是一条线而不是光晕，且与「不要新增边框」的要求冲突。

先做了 13 套候选的对照演示页（`.dsh-ops/badge-anim-demo.html`，含真实 1×、放大 3×、大预览连播与深浅主题），东家选定：

- 一次性新增强调 → **E 弹跳**（先上跳并压扁-拉长再落地，squash & stretch）
- 未读完成提醒 → **U4 完成点慢呼吸**（2.4s，放大 + 提亮）
- 「需要交互」常闪 → **W2 三点金色跑马**（错开 0.18s 依次放大提亮）

三套都不画任何圈层，全部只走 transform / filter。

## 差距评估

- PRD：R-01-026/AC-08 只要求「需要交互」持续强调动效，AC-10 只要求未读「呈现提示」，都没约束通道形态与三态区分方式（新增 AC-17 承接）。
- 代码：`src/client.mjs` 的 badge CSS 段有 3 处 border 环（`dap-badge-halo` 关键帧被复用两次）、两条常驻动画挂在 glyph 盒上。
- 测试：`scripts/check.mjs` 断言「未读提示环存在」（`[data-badge-unread]::before`）、`e2e/specs/done-read-state.mjs` 断言 `ringColor === rgb(63, 191, 127)` 与 `ringContent === "none"`——环消失后必失败（须同步改）。

## 收敛方案

1. `src/client.mjs`：
   - 「需要交互」→ `.dap-badge-glyph[data-badge-awaiting] i { animation: dap-badge-await-chase 1.5s ... }` + 三条 `nth-child` 延迟（0 / 0.18s / 0.36s），删掉 `::after` 金环。
   - 未读 → `.dap-badge-glyph[data-badge-unread] i[data-tone="completed"] { animation: dap-badge-done-breathe 2.4s ... }`，删掉 `::before` 绿环。
   - 新增 → `dap-badge-hop`（0.75s × 4 拍）与「需要交互」新增的 `dap-badge-hop-alert`（0.65s × 4 拍），删掉 `::after` 光环与 `dap-badge-halo` 关键帧。
   - 新增一条抑制规则：强调播放期间，点自身的常驻动效暂停；避免「跳一下 + 一直在跑」叠成噪声。
     选择器为 `.dap-badge-glyph[data-badge-hit] i[data-tone]`，声明 `animation: none;`。
   - 降低动效偏好：停动画但保留未读点 `scale(1.45) + brightness(1.62)`，状态不随动效消失。
   - 时长常量随动画长度改：`BADGE_HIT_MS = 3300`、`BADGE_ALERT_HIT_MS = 2900`。
2. `PRD.md`：R-01-026 新增 AC-17（三态动效通道、禁用边框环、强调期间暂停常驻动效、降低动效回退）。
3. `SOLUTION.md`：`### 宿主侧栏角标` 的职责行、未读提示条目、「需要交互」条目改写，并新增一次性强调条目（弹跳 + 收口常量 + bump 色相）。
4. `scripts/check.mjs`：把「提示环存在」断言换成 AC-17 两组契约——未读慢呼吸存在且 `[data-badge-unread]::before` 不得残留；三条关键帧 + 抑制规则存在且 `dap-badge-halo`/`[data-badge-awaiting]::after`/`[data-badge-hit]::after` 均不得残留。
5. `e2e/specs/done-read-state.mjs`：快照改取完成点的 `animationName`，未读时断言 `dap-badge-done-breathe`、全部已读后断言 `none`（替换原 `ringColor`/`ringContent`）。
6. `scripts/acceptance.mjs`：AC-16 条目改写（环 → 慢呼吸），另新增一条 AC-17 三态同场观感条目。

## 测试计划

- `pnpm build:client` 重建 `.dsh-plugin/client.js`；`node scripts/check.mjs` 全绿（含新增 AC-17 断言）。
- `python tools/test_impact_lint.py --report`、`python tools/agentmap_lint.py` 通过。
- MANUAL（`pnpm accept:manual` 中的 AC-17 条目）：三态同场确认无边框环、两条常驻动效靠节奏区分、一次性强调期间点动效暂停、降低动效下状态仍可辨。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| R-01-026/AC-17 | 新增：三态动效通道、禁用边框环、强调期间暂停常驻动效、降低动效回退 | UNIT/E2E/MANUAL | add | `scripts/check.mjs#R-01-026/AC-17`、`e2e/specs/done-read-state.mjs#R-01-026/AC-17`、`scripts/acceptance.mjs#R-01-026/AC-17` |
| R-01-026/AC-10 | 更新：未读提示由边框环改为完成点慢呼吸，读数口径不变 | UNIT/E2E | add | `scripts/check.mjs#R-01-026/AC-10`（`data-badge-done-breathe` 断言）、`e2e/specs/done-read-state.mjs#R-01-026/AC-10` |
| R-01-026/AC-08 | 更新：「需要交互」强调由呼吸+金环改为三点跑马 | UNIT | add | `scripts/check.mjs#R-01-026/AC-08`（`dap-badge-await-chase` 断言） |
| SOLUTION | 更新：角标节三处动效口径改写并新增一次性强调条目 | UNIT | none | 方案文档措辞同步，行为已由 AC-17 断言覆盖 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：三态各走独立动效通道且都不含边框环 | `scripts/check.mjs#R-01-026/AC-17`、`src/client.mjs::dap-badge-await-chase` |
| 异常 | 适用：一次性强调与常驻动效同现时不叠成噪声 | `scripts/check.mjs#R-01-026/AC-17`、`src/client.mjs::data-badge-hit] i[data-tone]` |
| 边界配置 | 适用：降低动效偏好下停动画但保留状态差异 | `src/client.mjs::dap-badge-done-breathe`、`scripts/acceptance.mjs#R-01-026/AC-17` |
| 副作用 | 适用：只改动效呈现，不动计数、通知与宿主写回 | `scripts/check.mjs#R-01-026/AC-16`、`src/client.mjs::counts.completedUnread > 0` |

## 终态与证据

- 实现: `src/client.mjs` 角标 CSS 段整体改写，三处动效各走独立通道。
  - 「需要交互」改为三点跑马 `dap-badge-await-chase`（1.5s，`nth-child` 延迟 0/0.18s/0.36s）。
  - 未读改为完成点慢呼吸 `dap-badge-done-breathe`（2.4s，放大 1.2→1.7 + 提亮）。
  - 新增改为弹跳 `dap-badge-hop`（0.75s×4）与 `dap-badge-hop-alert`（0.65s×4）。
  - 删除 `dap-badge-halo` 关键帧与三处边框环（未读 `::before`、常闪 `::after`、新增 `::after`）。
  - 新增抑制规则 `[data-badge-hit] i[data-tone] { animation: none; }`，强调期间暂停点动效。
  - `prefers-reduced-motion` 段停动画，但保留未读点 `scale(1.45) + brightness(1.62)`。
  - 时长常量改为 `BADGE_HIT_MS = 3300`、`BADGE_ALERT_HIT_MS = 2900`。
  - `.dsh-plugin/client.js` 经 `pnpm build:client` 重建。
- 测试: `node scripts/check.mjs` 全过（含新增 AC-17 两组契约断言）、`node scripts/check-staged-client.mjs` 通过、`python tools/test_impact_lint.py --report` 通过；`e2e/specs/done-read-state.mjs` 快照改取完成点 `animationName` 并通过 `node --check`（按仓库「全手动验证」策略未跑 E2E，东家未要求）。
- SOLUTION 对照: 已核对 `SOLUTION.md` 的 `### 宿主侧栏角标`——职责行补 AC-17、未读提示条目由边框环改写为完成点慢呼吸、「需要交互」条目改写为三点跑马、新增一次性强调条目（弹跳 + 收口常量 + bump 色相）；实现与方案无漂移。
- 待办: 提交后回填 commit 哈希与语义行数实测值。
