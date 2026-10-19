---
doc-type: task
mutation: lifecycle
id: T-180
---

# T-180 移除 pnpm verify 聚合脚本并同步调用点

状态: active
关联: R-01-027
风险等级: micro

## 背景与目标

C-104 已把本 fork 的验证改为全手动。东家批注同意把两个聚合脚本本身一并删掉，避免留下无人调用的空壳命令。

本任务只做减法与调用点同步，不改变任何产品可观察行为：

1. 从 `package.json` 移除 `verify`、`verify:fast` 两个脚本。
2. 把原先调用它们的三个位置改为内联分步命令，保持能力不丢：
   - `.githooks/pre-push.d/30-dsh-activity-pane-e2e.sh` → `pnpm lint && pnpm check && pnpm test:e2e`
   - `.github/workflows/ci.yml` → 分步 `pnpm lint` / `pnpm check` / `pnpm test:e2e`
   - `.github/workflows/npm-publish.yml` → 分步 `pnpm lint` / `pnpm check`
3. 同步文档口径：`SOLUTION.md` 的门禁归属条目、`AGENTS.md` 与 `CONVENTIONS.md` 的命令表与「仍可执行」表述。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| SOLUTION | 方案层演进：「E2E 与测试基建」门禁归属条目改为全手动分步入口 | UNIT | none | 仅描述命令形态变化，不改变任何被测行为；`scripts/check.mjs` 中与门禁相关的断言只覆盖 CI 触发策略，本任务不触碰其判据 |
| R-01-027/AC-01～AC-03 | 不变 | UNIT | 保留 | 完成确认与孤儿对账行为未改动，`scripts/host-reconcile.test.mjs` 照常通过 |

## 终态与证据

- 实现: 待补
