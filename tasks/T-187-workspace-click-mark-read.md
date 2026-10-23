---
doc-type: task
mutation: lifecycle
id: T-187
---

# T-187 工作区点击会话联动「已完成」已读

状态: active
关联: R-01-026
风险等级: minor
风险面: 无（语义行数低于阈值；改动落在 client 半侧单一派生点，宿主半与数据表未动）

## 背景与目标

东家提问（2026-10-23）：在宿主工作区/会话侧栏点击一个会话，插件「已完成」分区里的未读标记能否同步转已读。经四问确认口径（东家全选推荐项）：

1. 范围——只联动插件「已完成」未读（本地已读游标），不写宿主完成确认账本、不解除完成提醒；
2. 触发——以「当前会话切换」为信号（覆盖工作区点击与其它入口打开会话），不限于窗格/弹窗点击；
3. 默认——默认开启，不加配置开关；
4. 首屏——刷新/重连后首次落到的当前会话只登记基线，不算「看过」。

## 差距评估

- PRD：R-01-026/AC-11 只承诺「激活窗格卡片或角标弹窗条目」推进已读，未覆盖窗格之外的入口（已新增 AC-15）。
- 代码：`src/client.mjs` 已读游标只在 `bindCardActivation` 点击路径与 `openSessionFromBadge` 两处推进；`deriveActiveModel` 派生「已完成」分区时只读游标、不写。
- 测试：`scripts/check.mjs` 只有 AC-11～AC-14 的断言，无联动断言。

## 收敛方案

1. `src/client.mjs`：新增 `syncWorkspaceReadLink(done, currentId)`，在每轮派生注入 `unread` 之后调用。
   - 信号：比较 `currentIdOf(snapshot)`（宿主 `retainedBy.mainView` 口径）与上一次值，不同即视为切换。
   - 登记：切换时把目标会话写入待结算表 `linkedReadPending`（sessionId → 切换时刻）。
   - 结算：条目出现在「已完成」分区且仍为未读时，用 `advanceDoneReadCursor` 推进同一枚游标并 `writeDoneReadLedger` 写盘。
   - 首帧：只登记基线，不推进游标。
   - 兜底：待结算条目超过 60s 仍未出现即丢弃。
   - 边界：函数内不触碰 `ackCompletion`，不解除完成提醒。
2. 测试：`scripts/check.mjs` 增 R-01-026/AC-15 断言（调用点、待结算登记、游标推进、写盘、无 ackCompletion、首帧基线分支）。

## 测试计划

- `pnpm build:client` 重建 `.dsh-plugin/client.js`；`node scripts/check.mjs` 全绿（含新增 AC-15 断言）。
- MANUAL：在宿主工作区里点击一个处于未读的完成会话。
  - 预期一：窗格「已完成」卡片转已读（空心点、常规字重、停脉冲）。
  - 预期二：侧栏角标未读提示环消失。
  - 预期三：完成提醒卡仍留在「已完成」分区，仍可点「移入历史」。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| R-01-026/AC-15 | 新增：窗格之外切换会话即已读，只清未读不解除提醒，首屏不算 | UNIT | 新增 | `scripts/check.mjs` 联动断言组 |
| R-01-026/AC-09～AC-13 | 不变 | UNIT | 保留 | 已读判定与角标未读读数仍走 core#doneEntryUnread 单点 |
| R-01-002/AC-05 | 不变 | UNIT | 保留 | 联动路径不调用 ackCompletion（断言钉住） |
| SOLUTION | 更新：补回 R-01-026 角标模块与 R-01-027 对账不变量（合并回退修复） | UNIT | none | 方案文档补齐追溯与口径，行为不变，已由 R-01-026/AC-15 断言覆盖 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：工作区点击未读完成会话即转已读 | `src/client.mjs::syncWorkspaceReadLink`、`scripts/check.mjs#R-01-026/AC-15` |
| 异常 | 适用：完成提醒记录晚于切换到达时留待结算，超窗丢弃 | `src/client.mjs::syncWorkspaceReadLink`（linkedReadPending 分支） |
| 边界配置 | 适用：刷新/重连首屏落会话不误清未读 | `scripts/check.mjs#R-01-026/AC-15`（linkedCurrentSeen 基线断言） |
| 副作用 | 适用：不解除完成提醒、不跳转、不新增网络通道 | `scripts/check.mjs#R-01-026/AC-15`（无 ackCompletion 断言）、`#R-01-026` 派生面无 fetch 断言 |

## 终态与证据

- 实现: `src/client.mjs` `syncWorkspaceReadLink`（2203-2252）、派生点调用（6408-6412）、卸载清理 `linkedReadPending.clear()`；`.dsh-plugin/client.js` 经 `pnpm build:client` 同步。
- 测试: `node scripts/check.mjs` 全过（含新增 AC-15 断言）；`node scripts/check-staged-client.mjs` 通过；按仓库「全手动验证」策略未跑 E2E（东家未要求）。
- 待办: 提交后回填 commit 哈希、SOLUTION 对照与独立 review 证据，再把状态改为 completed。
- 语义行数: 待提交后按 lint 口径回填（`git diff -M` 剥注释与空行、排除 `.dsh-plugin/`）。
