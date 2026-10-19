---
doc-type: task
mutation: lifecycle
id: T-178
---

# T-178 错误提醒卡可确认清场 + 会话移除后的宿主记录对账清理

状态: active
关联: R-01-002、R-01-027
风险等级: standard

## 背景与目标

东家 2026-10-19（m00048）提出两件事：

1. 「错误的会话可以移入历史，或标记已完成」——错误提醒卡需要一条用户可主动清场的路径。现状：错误提醒只随新回合结束（`lastTurnEndKind` 被新 reason 覆盖）解除，若用户不再向该会话发消息，该卡永久停在活动区。C-043 当初否决过「错误卡提供移入历史按钮」，本次属带新证据的翻案（新证据：错误回合结束后无后续消息是常见场景，卡永不消失且用户无手段清场）。
2. 「工作区删除对应的会话后，活动会话需要同步删除」——会话被移除后，窗格各分区与宿主侧记录都应同步清理。现状：`~/.dsh/storages/dsh_activity_pane.json`（acks）与 `dsh_activity_pane_turns.json`（turn_stats）各 64 条记录中已有 3 条属已不存在会话（如 `session-b11f9476-1bc1-451f-b9d0-74bde71c0471`），且无任何代码会删除它们。

东家确认的口径（ask_user_question 三轮）：

- 错误卡按钮：与完成提醒同一枚「移入历史」、同一 ack 写回（不叫「标记已完成」，不加第二个按钮）。
- 删除场景：**只做「会话真的从会话服务列表消失」**。查实本机 `dsh-sessions-manager` 的「删除会话」是软删除——只写 `~/.dsh/sessions-manager-trash/index.json`，既不动磁盘日志也不动宿主 `sessions.list`；东家在明确这层取舍后仍选择「坚持只做从 sessions.list 消失，接受软删期间仍显示」，不引入对第三方插件文件/接口的耦合。
- 清理时机：会话离开 `sessions.list` 即清 + 启动时对账清理存量孤儿。

## 差距评估

- PRD：R-01-002/AC-05「错误提醒不由任何用户操作直接解除」、AC-10「仅完成提醒卡提供该按钮」、AC-13「不提供确认按钮」三处与新口径直接冲突，须改；「会话移除后的同步清理」此前没有任何需求承诺，须新增 R-01-027。
- SOLUTION：「显示过滤」与「核心数据与不变量」两处的错误提醒成立判定写的是「不消费 `ackedAt`、无确认按钮」，须改为与完成提醒共用同一 ack 游标；「完成确认宿主侧」子系统无任何记录清理路径，须补对账；需求追溯索引缺 R-01-027 行。
- DOMAIN：「错误提醒」「确认按钮」「完成确认」「生命周期」「跨模块不变量」五处涉及「错误卡无按钮」与「会话移除」，须同步。
- RATIONALE：C-043 的反面结论须以新条目修订（C-102）；记录清理口径是新决策（C-103）。
- 代码：`src/core.mjs:errorReminder` 不消费 `ackedAt`；`src/client.mjs:5491` 的 `confirm.hidden = entry.waitClass !== "done"` 只对完成卡显形；`src/host.mjs` 无任何记录删除路径。
- 测试：`scripts/check.mjs:3286` 钉住「错误提醒不消费 ack 游标」（本次必须反向改）、`scripts/check.mjs:4163` 钉住「仅完成提醒卡显示按钮」（本次必须改）；`scripts/acceptance.mjs:188` 的人工验收描述须同步。

## 收敛方案

1. `src/core.mjs`：`errorReminder` 增加 ack 游标判定——`lastTurnEndKind === 'error'` 且（`ackedAt` 非有限数 或 `lastTurnEnd > ackedAt`）即成立，与 `completionReminder` 共用同一游标比较口径；JSDoc 同步（R-01-002/AC-13，C-102）。
2. `src/client.mjs`：`confirm.hidden = entry.waitClass !== "done" && entry.waitClass !== "error"`——错误卡与完成卡共用同一枚按钮、同一文案与同一 `ackCompletion` 写回；中间档 CSS 维持 `data-wait="done"` 单档作用域不动（错误卡的错误信息正文是清场判断依据，不参与收合，审核后放弃最初的「复制一份 error 变体」设想）。
3. `src/host.mjs` 启动对账：新增 `reconcileOrphanRecords()`。
   - 判据：取 `sessionQuery.listSessions()` 的 id 集合，删掉两表中不在集合内的记录。
   - 删除：`acks` 与 `turnStats` 两表逐条 `delete`，按表分别 `broadcast()` / `broadcastBusy()`。
   - 时机：domain 打开后调用一次；另 `ctx.on('session/disposed', ...)` 实时删单条。
   - 判定单点：抽成 `src/core.mjs` 的纯函数 `orphanRecordIds(ids, live)`，空集合/非 Set 一律返回空。
   - 两道守卫：会话持久化未就绪即跳过；`live.size === 0` 即跳过（防启动期误删全表）。
4. `PRD.md`：R-01-002 的 AC-05/AC-10/AC-13 三处改写；新增 R-01-027（AC-01～AC-04）。
5. `SOLUTION.md`：错误提醒成立判定、分区不变量补会话移除对账不变量、完成确认宿主侧补清理通路、产品契约与追溯索引同步；核对日期改 2026-10-19。
6. `DOMAIN.md`：错误提醒/确认按钮/完成确认/生命周期/跨模块不变量五处同步。
7. `RATIONALE.md`：新增 C-102（翻案 C-043 错误卡子决定）、C-103（对账清理口径）。
8. `scripts/check.mjs`：错误提醒 ack 游标断言反向改（确认前成立、确认后不成立）；按钮显隐断言改为 done|error 两类；新增对账清理的契约断言（启动调用与 `session/disposed` 订阅、只用 `listSessions` 作权威判据、单条失败不中断）。
9. `scripts/acceptance.mjs`：R-01-002/AC-13 的人工验收描述同步（错误卡现在有按钮）。
10. `e2e/specs/error-reminder.mjs`（就地扩展，未新增文件）：已有错误卡断言由「按钮数量为 0」改为「存在且可见」；末尾追加构造 error 回合 → 点「移入历史」→ 卡片离开活动区且落进最近历史区 → 宿主登记仍保留 `lastTurnEndKind === 'error'` → 刷新后仍在历史区、不回活动区。

## 测试计划

- unit（`scripts/check.mjs`）：错误提醒 ack 游标三态（无 ack / ack 早于 lastTurnEnd / ack 晚于 lastTurnEnd）；两类卡共用按钮的显隐表达式；宿主对账函数的调用点与判据（用源码切片断言，不绑定具体行号）。
- E2E 扩展：`error-reminder`（错误卡按钮存在性、点击后迁入历史区、宿主登记保留持久事实、刷新后仍在历史区）。
- E2E 回归：`completion-sync`、`badge-surfaces`、`badge-interaction-pulse`、`done-read-state`、`compact-density` 全部通过（按钮显隐改动会触达这些 spec 的错误卡断言）。
- MANUAL：真实错误会话（429 耗尽）上点「移入历史」后卡片迁入最近历史区。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：错误卡可确认解除、孤儿记录被清理 | `scripts/check.mjs::errorReminder`、`e2e/specs/error-reminder.mjs::errorReminder` |
| 异常 | 适用：列表读取失败、持久化未就绪、会话全集为空或不可信时对账整体跳过且不删任何记录 | `scripts/check.mjs::reconcileOrphanRecords`、`scripts/check.mjs::orphanRecordIds` |
| 边界配置 | 适用：确认游标为 null/等于/晚于回合结束时刻；lastTurnEnd 缺字段（null/undefined）；孤儿判定输入为空集合、部分命中、重复 id | `scripts/check.mjs::errorReminder`、`scripts/check.mjs::orphanRecordIds` |
| 副作用 | 适用：归档不触发记录删除；确认写回不清回合结束原因；错误卡不参与中间档收合 | `scripts/check.mjs::dropSessionRecords`、`scripts/check.mjs::mediumCardRules` |
| 并发 | 适用：实时删除与启动对账可同时进行（键删除幂等） | `scripts/check.mjs::dropSessionRecords` |
| 回归 | 适用：完成提醒链路不受影响 | `e2e/specs/completion-sync.mjs::completionSync`、`e2e/specs/done-read-state.mjs::doneReadState` |

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| R-01-002/AC-05 | 修改（错误提醒可由确认解除） | unit | update | `scripts/check.mjs::errorReminder` 原有「不消费 ack 游标」断言反向改，补三态游标断言 |
| R-01-002/AC-10 | 修改（按钮扩到错误卡） | E2E + unit | update | `e2e/specs/error-reminder.mjs::errorReminder` 改为断言按钮存在且点击后迁移；`scripts/check.mjs::makeConfirmButton` 的显隐表达式断言改为 done 或 error |
| R-01-002/AC-13 | 修改（补确认解除分句） | E2E + unit | update | 同 AC-05/AC-10 的两个证据；另 `scripts/acceptance.mjs::R-01-002/AC-13` 的人工验收描述同步 |
| R-01-027/AC-01 | 新增 | unit | 新增断言 | `scripts/check.mjs::buildEntries` 与 `scripts/check.mjs::buildRecent` 的空快照断言（会话不在列表即不产出条目） |
| R-01-027/AC-02 | 新增 | unit | 新增断言 | `scripts/check.mjs::dropSessionRecords` 断言实时订阅存在、删除两张表、删除后经既有通道广播 |
| R-01-027/AC-03 | 新增 | unit | 新增断言 | `scripts/check.mjs::reconcileOrphanRecords` 断言启动对账调用、判据为会话全集、失败整体跳过、持久化未就绪跳过、空集合跳过；`scripts/check.mjs::orphanRecordIds` 九条行为级断言（空 Set/null/undefined/部分命中/重复 id/空 id/全在） |
| R-01-027/AC-04 | 新增 | unit | 新增断言 | `scripts/check.mjs::reconcileOrphanRecords` 断言对账不读归档集合 |
| SOLUTION | 修改 | UNIT | update | 同次变化由本 task 记录 |
| DOMAIN | 修改 | UNIT | none | 词条口径同步，不新增可执行断言（同次修改由本 task 记录） |

## 终态与证据

（待实现完成后填写）
