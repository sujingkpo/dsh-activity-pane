---
doc-type: task
mutation: lifecycle
id: T-191
---

# T-191 右栏停靠开关（彻底停掉右栏成本、保留左侧角标）

状态: completed
关联: R-01-029
风险等级: major
风险面: 触及宿主配置 schema（新增 `dockEnabled`）与窗格停靠判定的统一收口；同时改动折叠态渲染路径（整段跳过卡片写入）与 document 级监听的生命周期，任一处置不当会造成窗格「卡在旧内容」或监听线性累积

## 背景与目标

东家 2026-11-11 提问三连：「右侧边栏，打开活动会话，对于整体性能是否有影响，可否单独关闭右侧边栏，关闭后不影响左侧活动会话」。经代码勘察 + 技术评审团三轴并行取证，结论是：

- **有影响**，且影响集中在右栏挂载期——窗格 DOM 写入、逐卡 `getBoundingClientRect`、迁移量测全部落在右栏正文里。
- **能单独关闭，但既有三种手段都不是真关闭**：`position=left` 是搬家（面板仍在屏、仍全量渲染）；点 tab 上的 X 是真关但不可持久（全仓无 `tabClosed`/`userClosed` 键），且关掉后 4 路 store 订阅、2 路 SSE、1s/60s 定时器、3 组 MutationObserver 与全量派生（含 `loadNativeDetails`）照旧；折叠在右栏态直接不可用（`src/client.mjs` 右栏分支已摘掉 role/tabindex）。
- **关掉右栏不影响左栏角标**：角标（R-01-026）自建 `sidebar.panellist` 行 + 自建弹窗，与窗格只共享每轮派生，依赖方向单向（角标不依赖窗格）。

东家据此授权（m00140）：「若真要「彻底停掉右侧栏成本、保留左侧角标」 按此实现」。

目标：新增一个能力级开关，停用后宿主右栏连本插件的 tab 都不出现（装配期即跳过接线），窗格退回左列，左侧栏角标与弹窗完全不受影响；顺带修掉勘察中发现的三处既有缺陷。

## 差距评估

- PRD：原无该需求条目。`PRD.md` 对「停靠/右栏/右侧栏/right」grep 零命中——右栏实现已落地并被 `e2e/specs/badge-independence.mjs` 覆盖，却没有需求条目承载。本任务新增 R-01-029。
- 配置面：`src/host.mjs:49-53` 的 `Config` 只有 `position`/`recentHidden`/`recentCollapsible` 三项；硬约束是它与 `src/client.mjs` 的 `PANE_OPTION_DEFAULTS` 缺省值必须一致。
- 缺陷 1（绑定泄漏）：`bindPaneControls` 在 document 上挂 capture 阶段的 `pointerdown`/`keydown`，唯一解绑入口是 `ensurePane` 的「换了新窗格」分支（`src/client.mjs:4690`）与卸载段。右栏 tab 被关闭时 `ensurePane` 在早退点返回、不解绑——绑定成为没人解绑的常驻监听。
- 缺陷 2（折叠态残留）：左列折叠后切右栏，`data-collapsed="true"` 会把右栏正文压成 34px 窄条，而右栏态的标题行已摘掉 role/tabindex，用户既看不全也点不开。
- 缺陷 3（折叠态空转）：折叠窄条只靠桌面 `[data-collapsed="true"]` 的 `display:none` 收起滚动区（`src/client.mjs:1012-1017`），卡片仍被逐张写入并测量，量到的全是 0；全仓 `IntersectionObserver`、`clientWidth` 均零命中，没有任何零成本早退。
- 测试：`scripts/check.mjs` 无 `Config`/`PANE_OPTION`/`dockEnabled`/`data-setting` 断言；`e2e/specs` 28 个 spec 里无右栏开关用例。

## 收敛方案

1. `src/host.mjs`：`Config` 新增 `dockEnabled: schemastery.boolean().default(true).volatile()`（位于 `position` 与 `recentHidden` 之间），顶部注释补该项语义与「四项均为 `.volatile()`」。
2. `src/client.mjs` 配置面：新增 `DOCK_ENABLED_STORAGE_KEY = "dsh-activity-pane:dock-enabled"`、`PANE_OPTION_DEFAULTS.dockEnabled = true`、`paneOptions` 初始化项；`effectivePaneOption` **显式**加 `key === "dockEnabled"` 分支（既有布尔兜底落到 `recentCollapsible` 的键，漏加会读错项）；`refreshPaneOptions` 同步。
3. 停靠判定统一收口：`syncPaneDock` 的 `wantDock` 与 `ensurePane` 的 `wantRight` 都改为 `paneOptions.dockEnabled !== false && paneOptions.position === "right" && desktopQuery.matches`。停用只影响判定，不动 `position` 的值。
4. 装配期跳过接线：`connectSidebarRight` 首行加 `if (effectivePaneOption("dockEnabled") === false) return;` 与「已注册即返回」的幂等守卫；装配段改为 `if (effectivePaneOption("dockEnabled") !== false) { rightReact(); connectSidebarRight(); }`——停用态连 `require("react")` 都不发生。
5. 运行期可逆：`onSettingsChange` 新增 `dockEnabled` 分支，**先**写 `localStorage`/`writeHostConfig` **再**补接线（顺序不能反：`connectSidebarRight` 的启用判据读同一条回退链），补接线包 try/catch；末尾 `syncPaneDock()`。
6. 控件退场：设置弹层新增「启用右栏停靠」行；`syncSettingsControls` 统一布尔口径 `want = key === "position" ? paneOptions.position === "right" : paneOptions[key] === true`，并据 `dockUsable` 隐藏 `.dap-dock` 按钮与「面板停靠到右侧」整行。两处都需显式补 `[hidden]` 规则（`.dap-dock`、`.dap-settings-row` 都是 `display: flex`，会盖掉 UA `[hidden]`）。
7. 折叠态与右栏互斥（缺陷 2）：`syncPaneDock` 换面到右栏时复位 `collapsed`，并注释说明「右栏态标题行已摘掉激活语义，窄条点不开」。
8. 绑定回收（缺陷 1）：新增 `releaseDetachedPaneBinding(force)`——`if (boundPane === null) return;` / `if (force !== true && boundPane.isConnected === true) return;` / 依次 `unbindPaneControls?.()`、置空三变量。三个调用点：`ensurePane` 开头（`placeToggle()` 之后、`armFrameObserver()` 之前，`false`）、`syncPaneDock` 换面（`true`）、`cleanup`（`true`，替换原三行旧写法）。
9. 折叠态休眠（缺陷 3）：抽出 `syncPaneCounts(pane, listState, active, pulseSurface)`（原 `render` 的计数段整体搬入，返回 `nextPulseSignature`）；`render` 在签名去重之后新增 `if (collapsed) { pulseSignature = syncPaneCounts(...); pane.toggleAttribute("data-collapsed", true); return; }`——**刻意不提交 `lastSig`/`lastOptionSig`**（本轮没把卡片 DOM 更新到当前数据，记成「已渲染」会让展开时被同签名短路、停在旧内容）；`syncTracks` 在 `recById` 构造前加 `if (list.getBoundingClientRect().height === 0) return;`。
10. 右栏正文卸载守卫：`createRightPaneBody` 的 cleanup 只在窗格确实带 `data-dap-docked="right"` 时移除它，并补 `queueSync()`——否则停用后窗格已搬回左列，用户再关掉那个空置 tab 会顺手把左列窗格也摘了。
11. `writeStoredBool(key, value)` 新辅助，收敛原三处 `try { window.localStorage.setItem(...) } catch {}` 写法。
12. `e2e/specs/right-dock-toggle.mjs` 新增：基线停靠 → 运行期停用（窗格回左列、位置按钮退场）→ 停用期间角标推进 → 弹窗三组与已完成条目 → 重新启用即时恢复 → `addInitScript` 预置「启动即停用」（宿主右栏无本插件 tab、角标仍就位）。
13. 文档：`PRD.md` 新增 `#### R-01-029 右栏停靠开关`（5 条 AC）+ M-006 索引行；`SOLUTION.md` 追溯表新增一行；`RATIONALE/C-109` 记录八条决策与五条被否方案。

## 测试计划

- `node --check src/client.mjs`、`node --check src/host.mjs`。
- `pnpm build:client` 重建 `.dsh-plugin/client.js`，`node --check .dsh-plugin/client.js` 通过。
- `node --check e2e/specs/right-dock-toggle.mjs`。
- 按仓库「全手动验证」策略：`node e2e/run.mjs right-dock-toggle` 待东家确认后再跑（新增用例，尚无历史基线）。
- MANUAL：真实会话里切开关观察窗格落点、位置按钮退场、重载后右栏无 tab；左列折叠后切右栏确认窗格为完整形态；折叠状态下确认窄条计数仍随会话推进。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| R-01-029/AC-01 | 新增：启用时右栏呈现 tab 与正文 | E2E | add | `e2e/specs/right-dock-toggle.mjs` 第 1 段（`[data-dockkit-tab]` 按标题定位计数为 1） |
| R-01-029/AC-02 | 新增：停用后窗格回左列、右栏不承载 | E2E | add | 同上第 2 段（`[data-dap-docked="right"]` 计数 0、窗格仍在、`.dap-dock` 不可见）与第 6 段（启动即停用下列数 0） |
| R-01-029/AC-03 | 新增：停用期间角标与弹窗照常 | E2E | add | 同上第 3、4 段（已完成计数增长、三组俱在、条目 ≥1） |
| R-01-029/AC-04 | 新增：重新启用即时恢复 | E2E | add | 同上第 5 段（再停靠右栏成功、计数不倒退） |
| R-01-029/AC-05 | 新增：折叠态在换面时复位 | MANUAL | add | 折叠态断言需在真实会话里目视确认窄条形态已消失；E2E 未覆盖（折叠入口在标题行，右栏态下不可用） |
| R-01-026 既有 | 无变化：角标数据面未改 | E2E | keep | `e2e/specs/badge-independence.mjs` 仍应通过（未跑） |
| Config schema | 新增字段 | UNIT | none | `scripts/check.mjs` 无 Config 断言，本任务不新增（缺省值一致性靠人工核对 `src/host.mjs` 与 `PANE_OPTION_DEFAULTS` 两处） |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：停用后右栏无 tab、窗格在左列、角标推进、重新启用可恢复 | `e2e/specs/right-dock-toggle.mjs`、`src/client.mjs::syncPaneDock` |
| 异常 | 适用：宿主未提供 `sidebarRightTabs`/`slots` 时早退；`connectSidebarRight` 抛错时清 disposer | `src/client.mjs::connectSidebarRight` 的 `try/catch`、装配段 `catch` |
| 边界配置 | 适用：启动即停用（配置先行、tab 从未注册）；运行期停用（tab 已注册、运行期无法注销） | `e2e/specs/right-dock-toggle.mjs` 第 2、6 段 |
| 副作用 | 适用：折叠早退不提交签名（展开不被短路）；document 监听三路径回收；右栏正文卸载不误删左列窗格 | `src/client.mjs::if (collapsed) {` 段注释、`releaseDetachedPaneBinding`、`createRightPaneBody` 的 cleanup 守卫 |

## 终态与证据

- 实现: `src/host.mjs` `Config` 新增 `dockEnabled`；`src/client.mjs` 新增存储键/缺省值/生效值分支/停靠判定收口/装配期跳过/设置行与控件退场/折叠态复位/`releaseDetachedPaneBinding`/`syncPaneCounts`/`writeStoredBool`/折叠早退/轨道测量早退/右栏正文卸载守卫；`e2e/specs/right-dock-toggle.mjs` 新增；`.dsh-plugin/client.js` 经 `pnpm build:client` 重建。
- 测试: `node --check` 三处通过（`src/client.mjs`、`src/host.mjs`、`e2e/specs/right-dock-toggle.mjs`）；`node --check .dsh-plugin/client.js` 通过；`Select-String` 确认 `DOCK_ENABLED_STORAGE_KEY`/`releaseDetachedPaneBinding`/`syncPaneCounts`/`getBoundingClientRect().height === 0` 均已入 bundle。按仓库「全手动验证」策略未跑 `pnpm check` 与 E2E。
- SOLUTION 对照: `SOLUTION.md` 追溯表新增 R-01-029 行（子系统「窗格渲染器 / 宿主侧栏角标」，代码位置 `src/host.mjs`、`src/client.mjs`），与实现一致。
- commit: 待提交
- 语义行数: 待统计（`src/client.mjs` 与 `src/host.mjs` 的净增行数超过 minor 阈值 50，取 major）
- review:
  - 审核方: 自查（对抗性审查口径，按仓库 AGENTS.md 第七条主动构造反例）
  - 目的理解: 东家要的是「停掉右栏成本但角标不能跟着一起停」——不是隐藏、不是搬家，而是让右栏接线在停用态根本不建立。
  - 执行方式: 沿三条路径逐条走查——启动即停用（装配期）、运行期停用（已注册 tab 的运行期行为）、运行期重新启用（幂等与顺序）；对折叠态构造「折叠→切右栏」「折叠→数据推进→展开」两个反例；对 document 监听构造「tab 被关闭后早退」「换面摘除后重挂」两个反例。
  - 问题与修复: 已修四处。(1) 折叠早退最初把 `lastSig`/`lastOptionSig` 一并提交，构造反例发现「折叠期间数据推进 → 展开」会被同签名短路、卡片停在折叠前的旧内容——改为不提交。(2) `connectSidebarRight` 无幂等守卫，运行期反复切开关会让宿主右栏出现同 id 的重复注册——加 `if (rightTabDisposer !== null) return;`。(3) 重新启用时最初先写配置再补接线，反例发现判据读的是同一条回退链、顺序反过来会读到旧的 `false` 而早退——改为先落盘再接线。(4) 右栏正文 cleanup 原本无条件 `document.querySelector("[data-dsh-activity-pane]")?.remove()`，停用后窗格已回左列，用户再关掉空置 tab 会顺手摘掉左列窗格——加 `data-dap-docked="right"` 守卫并补 `queueSync()`。
  - 复审结论: 无 blocking finding。五条验收点均有对应断言或代码级证据；角标数据面零改动（R-01-026 不受影响）；停用态不引入新的常驻监听或定时器。已知限制：运行期停用后宿主右栏那个空置 tab 要到下次启动才消失（宿主不提供运行期注销 tab 类型），已写进 PRD 的 AC-02 而非假装能做到。
