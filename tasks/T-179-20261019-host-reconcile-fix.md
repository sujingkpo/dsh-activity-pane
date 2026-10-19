---
doc-type: task
mutation: lifecycle
id: T-179
---

# T-179 修复 T-178 审核发现的宿主对账失效与实时清理判据过弱

状态: active
关联: R-01-002、R-01-027
风险等级: standard

## 背景与目标

T-178（提交 7ac23d2、8791e44）交付后，两位独立审核方各出一份报告，共同指向同一根因，并各自给出可复现证据。本篇承接其修复。T-178 已进入 completed 终态（按 AgentMap 纪律不可再修改），修复过程记录于此。

根因：`ctx.inject(deps, cb)` 的回调**首个实参是子 Context**，服务挂在它的同名属性上；把它当服务对象用会抛 `cannot get property "..." without inject`。

本次要解决的四件事：

1. **启动对账在生产中根本不执行**（审核 B-1，高）。`src/host.mjs` 原写 `ctx.inject(['sessionQuery'], (sessionQuery) => … sessionQuery.listSessions() …)`，运行即抛错，被 catch 吞成一条 warn，两张表一条记录都不删——R-01-027/AC-03 实际未实现。
2. **实时清理的判据比需求弱**（审核 P1，高）。原在 `session/disposed` 上直接删记录，但该事件是 **live Session store 移除**，而 `listSessions()` = persisted ∪ live：一个已 disposed 但日志仍在磁盘的主会话仍会被列出，此时 `ackedAt` 已被不可恢复地删掉，用户清场过的错误卡会重新亮起。
3. **确认写回会复活空壳记录**（审核 P2，中）。`POST /ack` 用 `current?.lastTurnEnd ?? null` 重建整条记录，若记录刚被清理，会写回一条没有回合事实的记录——正是 R-01-027 要消除的残留。
4. **测试强度不足**（审核 P5/P6/P7、N-1/N-2）。AC-02/AC-03 的证据全是源码正则 + 纯函数断言，没有执行级证据；B-1 正是从这个缺口漏过去的。

## 差距评估

- 代码（`src/host.mjs`）：两处 `ctx.inject` 回调形态（busy 懒回填、孤儿对账）。
- 代码（`src/host.mjs`）：`session/disposed` 监听判据过弱，见事件即删。
- 代码（`src/host.mjs`）：`POST /ack` 缺写回前置判断，记录已删时会复活空壳。
- 代码（`src/host.mjs`）：启动对账「先 await 列表、后取表快照」的顺序会误删并发新写入的记录。
- 文案：`src/host.mjs` 文件头仍写「错误提醒不消费 ack 游标，C-043」，与 `src/core.mjs` 已改为消费 `ackedAt` 直接冲突。
- 文案：PRD 的 R-01-002 陈述句未同步 AC-05/AC-13。
- 文案：该陈述句缺「经确认解除」这一路径，仍只写新回合覆盖。
- 文案：`DOMAIN.md` 显示档位未写「错误卡不收合」。
- 测试：缺「真删」的执行级证据；e2e 的错误卡按钮断言未锚定在错误卡内，确认写回断言只要求「存在任一 error 且 ackedAt 有限」，点击前旧值同样满足。
- 文档：`SOLUTION.md` 的会话移除对账与确认写回两处描述需按新实现改写。

## 收敛方案

1. `src/host.mjs` busy 懒回填与孤儿对账两处 `ctx.inject` 回调改取 `childCtx.sessionQuery`。
2. `src/core.mjs` 新增导出 `reconcileOrphans(ackIds, turnIds, listSessions)`：读取会话全集、判定孤儿、给出跳过原因（`no-query` / `list-failed` / `empty-corpus`），只判断不删除。使拒绝路径能被执行级测试真正触达。
3. `src/host.mjs` 对账改为「同步段先取两张表 id 快照、再 await 列表」，并复用 `reconcileOrphans` 的决定；`session/disposed` 改为调用 `reconcileOrphanRecords('disposed', [id])` 做单条复核，不再见事件即删。
4. `src/host.mjs` `POST /ack`：记录不存在时幂等返回 `{ ok: true, skipped: 'no-record' }`，不写。
5. 新增 `scripts/host-reconcile.test.mjs`：用假 cordis ctx（`inject` 如实用子 Context 回调）与内存版 KvTable 真正跑一遍 `apply()`，覆盖启动对账删除/保留、空全集不删、持久化未就绪不删、disposed 但仍在列表不删、真移除才删、确认写回不复活空壳、确认写回保留持久事实。接入 `package.json` 的 `check` 脚本。
6. `e2e/specs/error-reminder.mjs`：按钮断言收进错误卡内部并用 `exact`；确认写回断言改为「点击前没有 ackedAt、点击后有」以证明本轮写入，并断言 `lastTurnEnd` / `lastTurnEndKind` 仍保留。
7. 文案同步：`src/host.mjs` 文件头、`PRD.md` R-01-002 陈述句、`DOMAIN.md` 显示档位词条、`SOLUTION.md` 会话移除对账与确认写回两处。

## 测试计划

- unit（`scripts/host-reconcile.test.mjs`）：七组执行级断言，见收敛方案第 5 条。
- unit（`scripts/check.mjs`）：`reconcileOrphans` 的七组纯函数断言；源码断言改为匹配新形态，并新增「实时路径不得绕过会话列表直接删」「判定为跳过时不执行删除」「确认写回记录缺失时幂等返回」三条反向/正向契约。
- 反向验证：临时把 inject 回调改回「当服务对象」的旧写法，`host-reconcile.test.mjs` 必须变红（实测已确认报 `启动对账应删除不在会话全集内的提醒登记` 超时）。
- E2E 回归：`error-reminder`、`completion-sync`、`done-read-state`、`compact-density`、`badge-surfaces`、`session-lifecycle`。

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：孤儿被删、非孤儿保留、真移除被删 | `scripts/host-reconcile.test.mjs::启动对账`、`scripts/host-reconcile.test.mjs::真移除` |
| 异常 | 适用：列表抛错/非数组/拿不到查询能力时一条都不删 | `scripts/host-reconcile.test.mjs::会话全集为空`、`scripts/check.mjs::reconcileOrphans` |
| 边界配置 | 适用：会话全集为空、持久化未就绪、记录已被清理时的确认写回 | `scripts/host-reconcile.test.mjs::持久化未就绪`、`scripts/host-reconcile.test.mjs::空壳记录` |
| 副作用 | 适用：disposed 但仍在列表的会话，其记录不被删 | `scripts/host-reconcile.test.mjs::实时路径` |
| 并发 | 适用：确认写回与清理交错时不产生空壳记录 | `scripts/host-reconcile.test.mjs::空壳记录` |
| 回归 | 适用：完成提醒链路与档位呈现不受影响 | `e2e/specs/completion-sync.mjs::completionSync`、`e2e/specs/compact-density.mjs::compactDensity`、`e2e/specs/badge-surfaces.mjs::badgeSurfaces` |

## 自查清单

- 边界：`reconcileOrphans` 的四种跳过语义（no-query / list-failed / empty-corpus / 正常）与两张表合并去重都有执行级断言；确认写回覆盖「记录存在」与「记录不存在」两条分支。
- 异常路径：列表抛错、返回 `null`、拿不到查询能力三种情况下 `deleteIds` 均为空，宿主不执行任何删除；单条删除失败仍只记 warn 不中断整轮。
- 回归影响：错误提醒判定与按钮显隐未改动；中间档 CSS 未改动；改动集中在宿主侧 IO 与判定顺序，故回归完成提醒、档位、角标三个 spec。
- 测试有效性：已做反向验证——注入 B-1 的旧写法后 `host-reconcile.test.mjs` 变红；恢复后全绿。证明该测试确实能抓住「运行即抛错」这类缺陷，而不只是文本存在性。

## 终态与证据

（待修复完成后填写）
