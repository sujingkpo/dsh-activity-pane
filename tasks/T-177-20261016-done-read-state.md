---
doc-type: task
mutation: lifecycle
id: T-177
---

# T-177 完成提醒的已读/未读标识与「已读即停闪」

状态: active
关联: R-01-026
风险等级: standard

## 背景与目标

东家同一次反馈（2026-10-16，m00002）提出三件事；随后追加第四件（m00294「两处地方顺便增加一键已读功能」）：

1. 左侧「活动会话」列表：已完成会话的已读/未读标识不明显（也可能没有）。
2. 右侧「活动会话」对话区域：同上。
3. 退出条件：会话被标记为已读后，「已完成」标签不应再持续闪烁。
4. 追加：上述两处（窗格「已完成」分区与角标弹窗「已完成」组）各加一枚「一键已读」入口。
5. 再追加（m00407「右侧侧边栏的 再增加全部移入历史」）：同一两处再各加一枚「全部移入历史」入口——右侧栏停靠面板与角标弹窗都要能一次把整批完成提醒提交确认。

经确认（ask_user_question 三问）钉死落点：**左侧** = 宿主侧栏「活动会话」入口行点开的**角标弹窗**（分组：运行中/需要交互/已完成）；**右侧** = **右侧栏停靠的活动会话面板**（本插件 tab，与左列/右列停靠共用同一份窗格 DOM）；**要停的闪** = **已完成卡末行的「已完成」类型胶囊与正文**（卡片自身），不是列头/窄条/活动按钮的数量胶囊。

现状核查（改动前）：窗格「已完成」分区已有一版已读/未读标识（`src/client.mjs` 的 `.dap-done .dap-card[data-unread]`：实心/空心 7px 状态点 + 未读标题 `font-weight: 600`），但**角标弹窗完全没有该语义**（条目只有三态色点 + 标题 + 工作区），且已读后末行照旧以 `dap-pulse 1.2s infinite` 脉冲（`[data-kind="awaiting"] .dap-foot :is(.dap-capsule, .dap-note)`，阻塞/完成/错误三类共用）。已读游标本就存在（`dsh-activity-pane:done-read`，`markDoneRead`），只是只有窗格分区在消费。

## 差距评估

- PRD：R-01-002/AC-08（末行脉冲）与 AC-09（胶囊文案）未表达「已读停闪」与「未读文案」；R-01-026 原有 AC-01～AC-08 完全没有已读/未读与批量已读承诺——本次新增 AC-09～AC-13 并修订 R-01-002 两条。
- SOLUTION：「宿主侧栏角标」子系统的口径单点只写 `classifyActiveEntries(entries)`，未含已读游标；「窗格渲染器」无完成提醒已读/未读呈现条目——本次补齐两处。
- DOMAIN：无「完成提醒已读」「已读游标」词条，实体的已读关系与「完成提醒已读后停闪」不变量缺失——本次补齐。
- RATIONALE：本次在「本地已读游标」与「宿主 ack 状态」之间做了选择，且与 C-099 的「闪动通道」边界相关，属需要留痕的决策——新增 C-100。
- 代码：`classifyActiveEntries` 不接已读游标（弹窗与角标拿不到 unread）；`renderBadgeModal` 无状态文本与属性写入；glyph 无未读读数；末行脉冲规则无门控；弹窗点击不写已读游标（只有窗格点击写）；两处均无批量已读入口（只有逐条点击）。
- 测试：`scripts/check.mjs:4596` 钉住未门控的末行脉冲选择器（本次必须改）；弹窗/角标已读未读零覆盖。
- 差距（第 5 条）：批量确认此前完全缺失——完成提醒只能逐张卡片点「移入历史」，两处段头只有「全部已读」；PRD R-01-026 无对应承诺。

## 收敛方案

1. `src/core.mjs`：新增 `ROUND_DONE_LABELS` 与 `doneWaitLabel(unread)`（「已完成（未读）/已完成」唯一派生点）；`classifyActiveEntries(entries, doneReadById = null)` 增加已读游标入参，对完成提醒条目就地写入 `unread = doneEntryUnread(entry, readAt)`；不传游标时行为与之前完全一致。
2. `src/client.mjs`（数据）：`syncBadgeSurface` 传入 `doneReadById` 并算出 `badgeCounts.completedUnread`；完成提醒条目同时登记进 `doneEntriesById`（弹窗点击路径不经过窗格渲染循环）。
3. `src/client.mjs`（窗格）：`doneWaitLabel(entry.unread)` 驱动胶囊文案；`.dap-done` 分区强化已读/未读——未读实心点+光晕、左缘 `::before` 绿色条、标题加粗、末行脉冲；已读空心点（`:not([data-unread])`）、无左缘条、常规字重、整卡 0.72 弱化（悬停 0.88）；无障碍名称在未读时追加「未读」。
4. `src/client.mjs`（脉冲）：末行脉冲拆两支，`[data-kind="awaiting"]:not([data-wait="done"])`（阻塞/错误）与 `[data-kind="awaiting"][data-wait="done"][data-unread]`（未读完成）共用 `dap-pulse 1.2s`；已读完成提醒不落在任何脉冲规则内。
5. `src/client.mjs`（弹窗）：条目行新增常驻 `.dap-modal-item-state` 节点，逐轮写入「未读/已读」并 `toggleAttribute("data-unread")`；非「已完成」组一律摘属性、隐藏文本；CSS 用 `[data-unread]`（实心/加粗）与 `:not([data-unread])`（空心/常规）分支。
6. `src/client.mjs`（角标）：glyph 增加 `data-badge-unread` 与静态未读提示环（`::before`，`#3fbf7f`），无障碍名称追加「（n 个未读）」。
7. `src/client.mjs`（已读写入）：`openSessionFromBadge` 先调 `markDoneRead(sessionId)`——弹窗点击与卡片点击写同一份游标。
8. `src/client.mjs`（一键已读）：`advanceDoneReadCursor(id, entry)` 抽为单条游标推进并就地改写条目的 `unread`；`markAllDoneRead()` 遍历 `doneEntriesById` 批量推进、写盘一次；窗格「已完成」分区段头（`.dap-read-all`，骨架新增）与弹窗「已完成」组段头（`makeBadgeModalItem` 同级的 `readAll` 节点）各挂一枚入口，两处按未读数显隐、可访问名给出待标记条数。
9. `PRD.md`：R-01-026 `+AC-09～AC-13`；R-01-002/AC-08、AC-09 补「已读停闪」与「未读文案」分句。
10. `SOLUTION.md`：宿主侧栏角标新增已读/未读判定单点、已读写入单一入口、未读角标提示与一键已读；窗格渲染器新增完成提醒已读/未读呈现条目；追溯索引 R-01-026 落点文案更新。
11. `DOMAIN.md`：新增「完成提醒已读」「已读游标」「全部已读」词条、一条实体关系与一条不变量补句。
12. `RATIONALE.md`：新增 C-100。
13. `scripts/check.mjs`：`4596` 的脉冲断言改为两支选择器 + 反向断言；新增 `doneWaitLabel`、已读判定单点、未读角标、弹窗分组隔离与一键已读（两处入口、逐条推进、不触 ack）共五组契约断言。
14. `e2e/boot.mjs`：启动器路径改经 `E2E_DSH_BIN`/`E2E_DSH_CLI` 可覆盖（本机桌面端安装目录为 `DSH NEXT`，默认值保持 CI 与干净机器的既有路径）。
15. `e2e/specs/done-read-state.mjs`（新增）：未读呈现 → 点击转已读（含跨 ≥2 周期复检停闪）→ 阻塞卡不受门控影响 → 弹窗两态与分组隔离 → glyph 未读环与读数 → 弹窗点击也标记已读 → 无未读时两处一键已读入口隐藏 → 再次产生未读后从弹窗入口批量已读（弹窗与窗格同步转已读、入口收起、完成提醒与「移入历史」按钮仍在）。
16. `e2e/specs/badge-surfaces.mjs`：角标无障碍名称断言兼容未读后缀。
17. `src/client.mjs`（全部移入历史）：`ackAllDone()` 取 `doneEntriesById` 的 id 集合，先 `markAllDoneRead()`（一次处理掉整批不留未读）、再对每个 id 逐个 `void ackCompletion(id)`——复用卡片「移入历史」的同一枚写回（乐观更新与失败回滚逐条独立），不自建网络通道、不新增解除路径；窗格骨架段头新增 `.dap-done-all` 按钮（渲染期按 `done.length` 显隐，可访问名称「全部标记为已读并移入历史（n）」），弹窗「已完成」组段头同样新增一枚并记入 `groups.set(...)`；CSS 用中性次要按钮外观（绿色留给无副作用的「全部已读」），行尾对齐由 `[hidden] ~ .dap-done-all { margin-left: auto }` 在「全部已读」缺席时兜底。
18. `scripts/check.mjs`（新增）：AC-13 的反向断言改为**函数体切片**（`markAllDoneRead` 定义到其顶格制表符闭括号），避免函数体变长或其后紧跟其他函数时误判；新增 AC-14 三组断言（两处入口与显隐写法、`ackAllDone` 先 `markAllDoneRead()` 再 `ackCompletion(`、函数体切片内不自建 `fetch(`）。
19. `e2e/specs/done-read-state.mjs`（扩展）：在既有末尾追加「全部移入历史」段——分区有完成提醒时两处入口显示且读数带条数 → 从弹窗入口激活 → 窗格「已完成」分区清空、两处入口隐藏、「最近历史」结构仍在。
20. `PRD.md`/`SOLUTION.md`/`DOMAIN.md`：R-01-026 `+AC-14`；SOLUTION 子系统职责与关键内部结构补「已完成的批量动作」与「一键移入历史」、追溯索引落点文案更新；DOMAIN 新增「全部移入历史」词条。
21. `scripts/check.mjs`（行尾修复）：`clientSource` 与 `bundle` 读取后统一把 CRLF 归一为 LF——Windows 检出（core.autocrlf=true）下列含换行的源码/bundle 断言会整类失效（实测既有断言 `scripts/check.mjs:3749` 与 3852 在本次工作里以未改动的代码失败）。

## 测试计划

- unit（`scripts/check.mjs`）：既有限次动画断言不放松；新增已读/未读与停闪契约断言，以及全部移入历史的三组契约断言。
- E2E 新增段落：`done-read-state` 末尾的「全部移入历史」双向核对（入口显隐 + 分区清空）。
- E2E 新增 `done-read-state`：见上第 14 条。
- E2E 回归：`badge-surfaces`、`badge-independence`、`badge-interaction-pulse`、`completion-sync`、`compact-density`、`modal-stable-refresh`、`long-list`、`density-resource` 全部通过。
- E2E 基线失败：`background-jobs` 在改动前基线上同样失败（`等待超时：中间档母卡数量注出现`），与本次改动无关。
- MANUAL：桌面深色/浅色下未读/已读的目视区分度与已读后停闪（真机）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| R-01-026/AC-09 | 新增 | E2E + unit | 新增断言 | `e2e/specs/done-read-state.mjs` 断言卡片与弹窗两态标识；`scripts/check.mjs` 钉 `doneWaitLabel` 单点与弹窗分组隔离 |
| R-01-026/AC-10 | 新增 | E2E | 新增断言 | `e2e/specs/done-read-state.mjs`：未读环在位、读数含未读数、全部已读后摘除 |
| R-01-026/AC-11 | 新增 | E2E | 新增断言 | `e2e/specs/done-read-state.mjs`：点击转已读、3s 后仍不脉冲、弹窗点击同样写游标 |
| R-01-026/AC-12 | 新增 | E2E | 新增断言 | `e2e/specs/done-read-state.mjs`：阻塞卡不带属性且照旧脉冲；已读态在弹窗与窗格一致 |
| R-01-026/AC-13 | 新增 | E2E + unit | 新增断言 | `e2e/specs/done-read-state.mjs`：无未读时两处入口隐藏、有未读时显示且读数带条数、批量已读后两处同步转已读且按钮不消失；`scripts/check.mjs` 钉两处入口与逐条推进、不触 ack |
| R-01-026/AC-14 | 新增 | E2E + unit | 新增断言 | `e2e/specs/done-read-state.mjs`：分区有完成提醒时两处入口显示且读数带条数、激活后分区清空且两处入口隐藏、最近历史结构仍在；`scripts/check.mjs` 钉两处入口与「先清未读再逐条 ack」、不自建 fetch 通道 |
| R-01-002/AC-08 | 修改（补「已读停闪」分句） | E2E + unit | update | `e2e/specs/done-read-state.mjs` 与 `scripts/check.mjs` 的两支脉冲选择器断言 |
| R-01-002/AC-09 | 修改（补未读文案分句） | E2E + unit | update | `done-read-state` 断言「已完成（未读）」/「已完成」；unit 钉文案常量 |
| R-01-026/AC-01～AC-08 | 不变 | E2E | 保留 | `badge-surfaces`（含未读后缀兼容）、`badge-independence`、`badge-interaction-pulse`、`modal-stable-refresh` 全部通过 |
| R-01-002/AC-01～AC-07、AC-10～AC-14 | 不变 | E2E | 保留 | `completion-sync`、`compact-density` 通过；打开会话仍不解除提醒（写入的是本地已读游标，不触宿主 ack） |
| SOLUTION | 修改（新增判定单点、已读写入入口、未读角标提示、一键已读与一键移入历史；追溯索引 R-01-026 落点文案更新） | UNIT | none | 方案落点变更均由本表上方各行（AC-09～AC-14）的 E2E 与 unit 断言覆盖，未引入新的可执行测试需求 |
| PRD | 修改（R-01-026 新增 AC-09～AC-14；R-01-002/AC-08、AC-09 补分句） | UNIT | none | 新增验收点逐条锚定在本表上方各行；未新增的既有 AC 由 `badge-surfaces` 等既有 spec 保持覆盖 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：未读完成提醒在窗格与弹窗都为未读呈现，点击后转已读且停止脉冲 | `e2e/specs/done-read-state.mjs#R-01-026/AC-09`、`src/client.mjs::doneWaitLabel(entry.unread)` |
| 异常 | 适用：已读后跨 2 个以上 1.2s 周期仍不恢复脉冲（非「恰好停在 none」）；全部已读后角标未读环与读数一并摘除 | `e2e/specs/done-read-state.mjs#R-01-026/AC-11`、`src/client.mjs::data-badge-unread` |
| 边界配置 | 适用：阻塞等待与错误提醒没有已读语义，属性不存在、照旧脉冲；运行中与需要交互两组弹窗条目不参与已读未读 | `e2e/specs/done-read-state.mjs#R-01-026/AC-12`、`src/client.mjs::const unread = tone === "completed" ? entry.unread === true : null;` |
| 副作用 | 适用：打开会话仍不解除完成提醒（只写本地游标）、「移入历史」按钮行为不变、已读后胶囊文案回落但不隐藏胶囊、全部移入历史逐条走既有写回且不自建通道 | `e2e/specs/completion-sync.mjs#R-01-002/AC-05`、`src/client.mjs::function ackAllDone()` |
| 兼容性 | 适用：已读游标持久化于 localStorage，刷新后已读态恢复；角标无障碍名称新增未读后缀不破坏既有读数断言 | `e2e/specs/badge-surfaces.mjs#R-01-026/AC-01`、`src/client.mjs::function readDoneReadLedger()` |
| 可观测性 | 适用：两处未读标识均可用结构选择器与文案读出（data-unread 属性、状态文本、未读环属性） | `e2e/specs/done-read-state.mjs#R-01-026/AC-10`、`src/client.mjs::dap-modal-item-state` |
| 并发 | 适用：弹窗打开期间渲染随 1 秒时钟与推送逐轮执行，已读写入后同一轮的卡片与弹窗须落到同一状态 | `e2e/specs/modal-stable-refresh.mjs#R-02-003/AC-01`、`src/client.mjs::toggleAttribute("data-unread", unread)` |

## 自查清单

- 边界：已读/未读判定用「条目 `stateAt` vs 已读游标」，进入时刻不可得时保守判未读（`core.mjs#doneEntryUnread` 既有语义）；游标推进用 `current >= entered` 短路，重复点击不写盘。新回合结束推进 `stateAt` 后旧游标自动失效、条目重新变未读——e2e 用「第二个会话完成后仍有未读项」覆盖多条目混合态。
- 异常路径：`localStorage` 不可用时读写静默跳过（既有 `readDoneReadLedger`/`writeDoneReadLedger` 的 try/catch），已读态退化为「全部未读」而非报错；弹窗点击在导航服务缺失时仍先写游标再 return（`markDoneRead` 在 `openSessionFromBadge` 首行）。
- 批量确认：`ackAllDone` 复用的是卡片「移入历史」的 `ackCompletion`（乐观更新 + 失败回滚 + queueSync），未新增解除路径；先 `markAllDoneRead()` 是因为批量处理不该留下未读残留，即使其中某条 ack 失败回滚，已读态也只是呈现层差异、不影响提醒成立。分区为空时函数直接 return（无空转写盘）。`check.mjs` 用函数体切片排除「不自建 fetch 通道」。
- 回归影响：末行脉冲规则改为两支选择器后，阻塞/错误提醒与未读完成提醒照旧脉冲（e2e 实测 `dap-pulse`）；`badge-surfaces` 的读数正则与 `check.mjs:4596` 的旧选择器断言同步更新；`dap-opening` 的限次动画断言未动；一键已读不调用 `ackCompletion`（unit 反向断言），完成提醒与「移入历史」按钮在 e2e 中核对仍在。

## 终态与证据

- 实现: `src/core.mjs` 新增 `ROUND_DONE_LABELS`/`doneWaitLabel` 与 `classifyActiveEntries(entries, doneReadById)` 的已读游标入参；`src/client.mjs` 六处——①窗格胶囊文案接 `doneWaitLabel`、无障碍名称在未读时追加「未读」；②`.dap-done` 分区的已读/未读四通道 CSS（实心点+光晕/空心点、左缘 `::before` 绿条、标题字重、整卡 0.72 弱化）与末行脉冲两支选择器门控；③弹窗条目新增常驻 `.dap-modal-item-state` 与 `data-unread` 分支、非完成组摘属性；④glyph 的 `data-badge-unread` 静态提示环与「（n 个未读）」读数；⑤`openSessionFromBadge` 先写已读游标；⑥`advanceDoneReadCursor`/`markAllDoneRead` 与两处「全部已读」入口（窗格已完成分区段头 + 弹窗已完成组段头，按未读数显隐）；⑦`ackAllDone` 与两处「全部移入历史」入口（同两处段头，按分区条数显隐，逐条复用 `ackCompletion`）。`scripts/check.mjs` 另修 CRLF 归一（`clientSource`/`bundle`）。
- 测试: `node scripts/check.mjs` 全绿（含本次新增的脉冲门控、`doneWaitLabel` 单点、已读判定单点、未读角标、弹窗分组隔离、一键已读与全部移入历史六组契约断言）；`e2e/specs/done-read-state.mjs` PASS（未读呈现 → 点击转已读并跨 ≥2 周期复检停闪 → 阻塞卡不受门控 → 弹窗两态与分组隔离 → 未读环与读数 → 弹窗点击写游标 → 两处一键已读入口显隐与批量已读 → 两处全部移入历史入口显隐与分区清空）；回归 `badge-surfaces`、`badge-independence`、`badge-interaction-pulse`、`completion-sync`、`compact-density`、`modal-stable-refresh`、`long-list`、`density-resource` 全部 PASS；`background-jobs` 为基线既有失败（改动前同样超时，已对照确认）。
- SOLUTION 对照: 与 SOLUTION「宿主侧栏角标」新增的判定单点/已读写入单一入口/未读角标提示/一键已读/一键移入历史、「窗格渲染器」新增的完成提醒已读/未读呈现条目一致；PRD R-01-026/AC-09～AC-14 与 R-01-002/AC-08、AC-09 的分句均有对应实现与测试锚点。
- commit: 待填
