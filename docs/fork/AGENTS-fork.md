<!--
	本文件是仓库根 AGENTS.md 的正文来源：根 AGENTS.md 与本文件逐字一致，只放在两处。
	分工：本 fork 不维护上游 AgentMap 工作系统的文档副本，本文件只承载 fork 项目说明。
	合并上游时：若根 AGENTS.md 冲突，先取上游版本（git checkout --theirs -- AGENTS.md）让合并走完；
	合并提交完成后，用本文件内容覆盖根 AGENTS.md，恢复 fork 项目说明。
-->
# AGENTS

## 项目概览

- `dsh-activity-pane` 是 **DSH（DeepSeek Harness）客户端插件**，不是 CLI：由宿主加载、注入客户端服务并渲染 UI。
- 功能：把正在运行、等待用户行动、刚完成/出错的会话集中到一个可贴边、可滚动的「活动会话总览窗格」；窄屏转为抽屉 + 浮动开关。
- 包形态：`type: module`、`main: ./.dsh-plugin/index.mjs`、`exports` 暴露 `.` / `./client` / `./cordis.patch.yml` / `./package.json`；`dsh.bundle.patch = ./cordis.patch.yml`、`dsh.client.platform = web`。
- 依赖面：运行时只用 `@deepseek-ai/schemastery`、`@deepseek-ai/dsh-storage-domain`、`zod`，不依赖任何第三方插件；`devDependencies` 只有 `playwright`。

## 目录与职责

- `src/client.mjs` — 浏览器运行时（注入 `sessions`/`workspaces`/`uiSession`/`remote.session`/`jobs`/`uiWorkspace`，负责窗格 DOM、样式、卡片渲染与交互）。
- `src/core.mjs` — 纯函数层（快照 → 条目映射、时间线折叠、徽标统计等），不触碰 DOM，可 Node 单测。
- `src/host.mjs` — 宿主半：订阅 `session/event` 维护完成/错误提醒事实与每会话 busy 记账，暴露 `/dsh-activity-pane/api/{ack,acks,acks/stream,busy,busy/stream}`；持久化到 `dsh-storage-domain` 的两张表（`acks` 与 `dsh_activity_pane_turns.turn_stats`）。
- `src/navigation.mjs` — 卡片点击/键盘激活与卸载绑定。
- `.dsh-plugin/index.mjs` — 静态宿主入口，转发 `apply`/`inject`/`name`/`Config` 自 `src/host.mjs`；免构建，不要在此写实现。
- `.dsh-plugin/client.js` — **生成物且入库**：由 `scripts/build-client.mjs` 拼接 `core.mjs` + `navigation.mjs` + `client.mjs` 得到，禁止手改。
- `scripts/` — 构建、单元检查、staged bundle 一致性、watch、人工验收清单、性能基线。
- `e2e/` — `run.mjs` 运行器 + `boot.mjs` 隔离环境 + `specs/*.mjs`（28 个 spec）+ `mock-llm.mjs`。
- `tools/` — AgentMap 校验器（Python）：`agentmap_lint.py`、`test_impact_lint.py`、`agentmap_validate_commit_msg.py`。
- 其它：`cordis.patch.yml`（以独立 bundle 挂载插件）、`assets/`（截图）、`screenshots.json`。

## 验证策略：全手动

**本项目不挂任何自动门禁：不装 git hook、CI 不在 push 时跑、不因提交或推送被测试阻断。测试只在东家明确要求时执行。**

- 东家没要求时，agent 改完即交付，不主动运行 `pnpm check`、`pnpm test:e2e`、`pnpm lint`。
- 不跑测试不构成交付阻塞，也不需要为此道歉或加「未验证」免责声明；如实说明改了什么即可。
- `.githooks/` 里的脚本保留作参考实现，但**不安装**（`core.hooksPath` 未指向它时不生效）。
- 聚合脚本 `pnpm verify` / `pnpm verify:fast` 已删除；需要完整验证时分步跑 `pnpm lint`、`pnpm check`、`pnpm test:e2e`。

## 构建与验证命令

| 命令 | 作用 |
| --- | --- |
| `pnpm build:client` | 由 `src/*.mjs` 重建 `.dsh-plugin/client.js`（原子写入） |
| `pnpm check` / `pnpm test` | 同一命令：`node scripts/check.mjs` + `node scripts/host-reconcile.test.mjs`（按需） |
| `pnpm lint` | `lint:agentmap` + `lint:test-impact`（Python 3，按需，实测约 40 秒） |
| `pnpm test:e2e` | 全量浏览器 E2E（隔离 `$DSH_HOME` + mock LLM + 随机端口，按需，约 8–25 分钟） |
| `pnpm test:e2e:known-good` | 只跑 5 个稳定 spec 的冒烟集合（按需） |
| `pnpm dev:watch` | 监视 `src/*.mjs`，变化即重建 bundle（配合 dsh-client-hmr 热装） |
| `pnpm accept:manual` | 打印人工验收清单（观感/真机类条目） |
| `pnpm check:staged-client` | 校验 Git index 中源码与 staged bundle 字节一致 |

- 工具链：pnpm 11.5.0、Node `>=20`（CI 用 24.16.0）、Python 3 跑 `tools/*.py`。
- 依赖未安装时先 `pnpm install`；本仓库不用 npm / yarn。
- 单跑一个 e2e spec：`node e2e/run.mjs <spec名>`（`e2e/run.mjs:17` 默认 `PLAYWRIGHT_BROWSERS_PATH ??= "0"`，即用项目内 `node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/.local-browsers` 下的 chromium-headless-shell，已安装）。
- E2E 失败截图落在 `e2e/fail-*.png`（已 gitignore）。

## 测试与需求锚定

- 本项目采用 AgentMap 活文档工作流：`PRD.md`（需求 R-gg-nnn 与验收点 `<R-ID>/AC-nn`）、`SOLUTION.md`（方案与需求追溯索引）、`DOMAIN.md`（术语）、`RATIONALE/`（决策 C-nnn，每条一个条目文件，只追加）、`TODO.md`（想法池）、`CONVENTIONS.md`（过程规范与本地参数）、`tasks/`（T-nnn 执行轨迹）。
- **`CONVENTIONS.md` 是本仓库过程规范的权威载体**（提交规范、验证策略、移动端验证教训）；需要时查阅。
- 测试锚点路径已登记为 `scripts/check.mjs`、`scripts/acceptance.mjs`、`e2e/specs/*.mjs`，模式 `strict`：写测试时以 `// R-gg-nnn/AC-nn` 注释锚定对应验收点。
- 改动 PRD 的 AC 或正文时，建议顺手同步对应测试或验收证据；这是维护建议，不是自动门禁，不做也不会被拦。

## 代码风格约定

- 缩进统一 **tab**；文件与函数写中文注释，测试类文件头部用 `@description` / `@author` / `@date`（见 `scripts/host-reconcile.test.mjs`）。
- 无 ESLint / Prettier：风格以既有文件为准，且**同一文件内保持一致**——`src/host.mjs`、`scripts/watch.mjs`、`scripts/build-client.mjs` 是单引号 + 无分号；`src/client.mjs`、`src/core.mjs`、`scripts/check.mjs` 是双引号 + 分号。改哪个文件就沿用哪个。
- 约束写法：`src/host.mjs:49` 的 `Config` schema 默认值必须与 `src/client.mjs` 的 `PANE_OPTION_DEFAULTS` 保持一致。
- 仓库事实遵循「新增而非改写」：`.dsh-plugin/index.mjs` 明确要求原有 `export { apply, inject, name }` 逐字保留。

## 提交规范（约定，非自动门禁）

- 标题：`emoji 中文类型(scope): 中文结果描述`，标题与正文空一行；emoji/type 固定配对（⭐ 功能、✨ 改进、🐛 修复、📝 文档、🧪 测试、📌 计划、🧹 维护、⚙️ 配置、♻️ 重构、🚀 发布）。
- 普通提交正文建议含 `## 原因` / `## 影响` / `## 取舍`；实现、修正或关闭 task 的提交建议引用对应 `T-nnn`。
- 以上都不会被 hook 校验（`.githooks/` 未安装），写了更好，没写不阻断。
- `pnpm check` 会重建 `.dsh-plugin/client.js`；如果你跑过它再提交，记得一并暂存这个生成物。

## 本地开发挂载

- 以 `link:` 方式装入 profile：`dsh plugin --profile web add ./dsh-activity-pane`，随后**重启一次 `dsh web`**（新增 bundle 需重启进入加载名单）。
- 之后改 `src/core.mjs`/`src/client.mjs` → `pnpm dev:watch` 重建 → 浏览器热装，无需刷新；**改 `src/host.mjs`（宿主半）必须重启 `dsh web`**。

## 安全与操作注意

- `.gitignore` 含 `.githooks`、`.github`、`.dsh-auto-pass`、`.pnpm-store`、`node_modules/` 等，但这些 hook 与 CI 文件**已被 Git 跟踪**，忽略规则不影响其生效或修改。
- 工作区可能存在未跟踪的调试残留（`debug.log`、`tmp-rc-diff/`、`.dsh-ops/`）：与代码改动无关，不要顺手清理或提交。
- 跑 `scripts/check.mjs` 与 E2E 需完整文件权限（会 `spawnSync` 捕获子进程，受限沙箱下会报 EPERM）。
- fork 关系：`origin` = `git@github.com:sujingkpo/dsh-activity-pane.git`，`upstream` = `https://github.com/ccll/dsh-activity-pane.git`；改动只存在本 fork，合并上游时优先新增/扩展，避免重排既有代码以降低冲突。
- `AGENTS.md` 上游会拿它比对 `tools/agentmap_lint.py` 的 `CANONICAL_FILES_SHA256`（AgentMap 工作系统原文的哈希）。本 fork 用项目说明覆盖后，`pnpm lint:agentmap` 会报一条 `AGENTS.md: must match the canonical AgentMap runtime contract`；这是有意接受的成本（上游自己的 AGENTS.md 同样不匹配该哈希），其余 lint 结论不受影响。
- 本 fork 的 CI（`.github/workflows/ci.yml`）只保留 `workflow_dispatch` 手动触发，push 不再自动跑验证。
