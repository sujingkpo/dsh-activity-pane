---
doc-type: conventions
mutation: living
owner: agent 主笔，项目属主审批
---

# CONVENTIONS — 本项目开发规范

## 高频规则

<!-- BEGIN AGENTMAP COMMIT CONVENTION -->
## Git 提交规范

- 标题使用 `emoji 中文类型(scope): 中文结果描述`；标题与正文之间须空一行（commit-msg 校验）。
- emoji/type 固定配对：⭐ 功能、✨ 改进、🐛 修复、📝 文档、🧪 测试、📌 计划、🧹 维护、⚙️ 配置、♻️ 重构、🚀 发布。
- `scope` 使用小写字母、数字和连字符，首字符须为字母或数字，不使用 subscope。
- 普通提交正文必须包含 `## 原因`、`## 影响`、`## 取舍`；Merge、Revert、fixup 与 squash 使用 Git 生成标题。
- 实现、修正或关闭 task 的提交：正文须引用对应 `T-nnn`。
  - 目的：`git blame` → commit → task 可反查。
  - 不涉及 task 的提交：不要求引用。
  - 被引用的 task 必须真实存在，commit-msg 校验。
- 上述提交格式是**约定**，不是自动门禁：`.githooks/` 在本仓库不安装（`core.hooksPath` 未指向它），格式靠自觉遵守，不会被提交或推送阻断。
- 需要临时启用校验时，由东家显式执行 `git config core.hooksPath .githooks`，用完执行 `git config --unset core.hooksPath` 关掉。
<!-- END AGENTMAP COMMIT CONVENTION -->

## AgentMap 本地参数

- agentmap 规范版本: 4

- 语义行阈值: 50 <!-- 代码审核分档阈值：task 的语义行数（剥离注释与空行后的 diff 增删合计）≤此值为 minor 档 -->
- 语义行排除路径: `*-lock.*`, `yarn.lock`, `*.min.js`, `*.min.css`, `dist/`, `build/`, `*.snap`, `*.pb.go`, `*_pb2.py`, `.dsh-plugin/` <!-- 语义行数不计入这些 lockfile 与生成物路径（glob）；.dsh-plugin/ 为 scripts/build-client.mjs 生成物，与 src 同步由 pre-commit 门禁字节级保证 -->
- 累计审计 task 间隔: 10 <!-- 自累计审计复位点起 completed task 达此数即须开累计审计 task -->
- 累计审计行数间隔: 300 <!-- 窗口全部提交（含短路改动）语义行合计达此数即须开累计审计 task，与 task 间隔先到先触发 -->
- 累计审计复位点: T-186 <!-- 升级登记：窗口自升级前最后一个 completed task 起算；每次累计审计收尾提交更新 -->
- 关键路径: 无 <!-- glob 列表，diff 命中即须 major 档；示例：`src/auth/**`, `src/billing/**`；「无」表示未登记 -->
- 需求组 01: 用户
- 需求组 02: 维护者
- 验证矩阵起始 task: T-001
- 代码审核起始 task: T-001
- 测试锚定模式: strict
- 测试锚点路径: scripts/check.mjs; scripts/acceptance.mjs; e2e/specs/*.mjs
- 核心文档上限: 96000 token
  - 登记理由: 2026-10 AgentMap v2 升级后按实测核心文档字节数登记的基线（PRD+SOLUTION+DOMAIN+CONVENTIONS+AGENTS 合计 238713 字节，token=字节/3 上浮 20% 向上取整到千位），供东家后续调整。

## 验证门禁

**本项目的验证一律手动：不挂 git hook、不自动跑测试、不因提交或推送被阻断。测试只在东家明确要求时执行。**

- 权威验证入口: 手动
- 完整验证命令（需要时手工执行）: `pnpm check`（core 单测 + 宿主对账 + client bundle 契约），`pnpm test:e2e`（浏览器 E2E）。
- `pnpm check` 会从工作树重建 `.dsh-plugin/client.js`；跑过后如需提交，把重建产物一并暂存即可（不跑也不会被门禁拦下）。
- 东家没要求测试时，agent 只做改动与自述，不主动运行 `pnpm check`、`pnpm test:e2e`、`pnpm lint`，也不以「未跑测试」为由阻塞交付。
- 聚合脚本 `pnpm verify` / `pnpm verify:fast` 已删除（C-104）；需要完整验证时分步跑 `pnpm lint`、`pnpm check`、`pnpm test:e2e`。
- 需要跑 E2E 时的既定事实：
  - 本机可直接跑，启动器自动探测（优先 `E2E_DSH_BIN`/`E2E_DSH_CLI`，其次已安装的 `DSH NEXT`，最后 `DSH Desktop`）。
  - 本机浏览器缓存走 `PLAYWRIGHT_BROWSERS_PATH` 环境变量；项目内也已安装 chromium-headless-shell。
- 已知失败 spec（基线既有，与本轮改动无关，跑全量时不计入回归判断）：`auto-update`、`background-jobs`、`card-content`、`loading-ready`。
- `.githooks/` 目录与脚本保留在仓库里作为可复用的参考实现，但**不安装**（`core.hooksPath` 未指向它时完全不生效）；要临时启用由东家显式执行 `git config core.hooksPath .githooks`，用完记得关掉。
- 保留但未启用的脚本清单：
  - `.githooks/pre-commit.d/20-agentmap-lint.sh`：AgentMap 结构与追溯检查。
  - `.githooks/pre-commit.d/25-test-impact.sh`：PRD/SOLUTION 变更的测试影响检查。
  - `.githooks/pre-commit.d/30-dsh-activity-pane-check.sh`：单测与 client bundle 契约。
  - `.githooks/pre-commit.d/35-staged-client-bundle.sh`：staged bundle 与源码字节一致。
  - `.githooks/pre-push.d/20-agentmap-lint.sh`：待推送历史的 AgentMap 不可变契约。
  - `.githooks/pre-push.d/25-test-impact.sh`：逐提交重放测试影响门禁。
  - `.githooks/pre-push.d/30-dsh-activity-pane-e2e.sh`：分步执行 `pnpm lint`、`pnpm check`、`pnpm test:e2e`。
- CI 门禁: 不适用：`.github/workflows/ci.yml` 仅保留 `workflow_dispatch` 手动触发，不再在 push 时自动运行；main 分支推送不再触发任何自动验证。
- GitHub Release 仍手工创建。
- npm 发布: `.github/workflows/npm-publish.yml` 仅由手工创建的 Release `published` 事件触发，与日常提交无关。
- 扫描来源：`.`

## 移动端真机验证（T-160～T-165 教训）

- 东家要求验证移动端时，以 WebKit + 移动 UA + 触屏 + 390×844 模拟移动壳层（dsh-web-mobile 生效）为准；不强制在每次改动后执行。
- 桌面壳层与移动壳层 DOM 结构不同：桌面探针通过不代表真机成立（T-160～T-163 连续四轮的教训）。
- 移动壳层已知差异：sidebar 槽位含 8 个按钮且坐标在屏外（抽屉收在屏外）。
- 移动壳层槽位本体恒 0 宽（0 宽壳内）。
- 几何判定沿父链取首个非零宽，并区分在屏与屏外（T-165 回归教训）。
- 锚点与判据不耦合宿主哈希类，宿主改版即碎。
- 锚点优先宿主语义属性（data-slot 等）加实测几何。
- 真机事实取证手段：构建内临时诊断码（渲染状态码由东家截图回报），用后即撤、不进提交；一次诊断码往返定位了四轮未解的根因（T-164）。
- 开发探针与东家同实例（主 dsh 环境），差异在客户端壳层；遇「桌面复现不出」先做壳层对齐，再迭代修复。

## 构建与开发工作流

- E2E（C-045、C-046、C-047、C-058，按需手动执行）：`pnpm test:e2e` 启动隔离测试环境（临时 `$DSH_HOME` + mock LLM + 随机端口 dsh web）并固定顺序执行 `e2e/specs/*.mjs`；每 spec 独立 Chromium/context 且只建立一个页面连接世代；首次使用先 `PLAYWRIGHT_BROWSERS_PATH=0 pnpm exec playwright install chromium-headless-shell`，失败截图落在 `e2e/fail-*.png`（已 gitignore）。
- 本地开发安装（在 profile 中挂载；pnpm `link:` 使 profile 内为指向本仓库的符号链接）：`dsh plugin --profile web add ./dsh-activity-pane`。
- `pnpm build:client` 生成 `.dsh-plugin/client.js`；`pnpm check`（按需）做 core 单元检查 + bundle 校验；`pnpm dev:watch` 监视 `src/*.mjs`，变化即重建 bundle。
- 热更开发：DSH 通过 `dsh-client-hmr` 监视已安装插件的 client bundle 文件，内容一变就推送 `rebuilt` 帧，浏览器单独热装该插件——不需要整页刷新，也不需要重启 `dsh web`（host 侧改动除外：本插件自 T-073 起 host 侧承载完成确认状态，改动 `src/host.mjs` 后需重启 `dsh web` 生效）。
- 本插件以 `link:` 依赖装入 profile（符号链接），且 `scripts/build-client.mjs` 采用原子写入（临时文件 + rename），流程是：
  1. `dsh plugin --profile web add ./dsh-activity-pane`，然后重启一次 `dsh web`（新增 bundle 需重启才进入加载名单；之后的热更无需再重启）。
  2. 在本仓库运行 `pnpm dev:watch`（或 `node scripts/watch.mjs`）。
  3. 改 `src/core.mjs` / `src/client.mjs` → watch 自动重建 `.dsh-plugin/client.js` → profile 侧同一文件同步更新 → 浏览器热装生效。
- 注意：`dsh-activity-pane` 会改动 profile 的 `package.json`（加 `file:` 依赖）并把插件加入 `dsh.profile.bundles`；离线快速实验可改用 DSH 会话内的 `cordis_define` / `cordis_run` 动态加载，不落盘。

