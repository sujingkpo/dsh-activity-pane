---
doc-type: task
mutation: lifecycle
id: T-192
---

# T-192 窗格总开关（停用后左右都不出现）+ 快捷切换显式确认 + 当前行工作区标签置顶

状态: completed
关联: R-01-029、R-01-028
风险等级: major
风险面: 改动窗格「存在与否」的总判定（`ensurePane` 首行早退 + 停用收口）与宿主插件页的设置卡片（新注册 `plugins.bundle.config` 槽、React 组件读写 `configForms`）；同时改 Ctrl+Tab 的提交语义（松开 Ctrl 不再跳转），任一处置不当会造成「关掉后再也打不开」「误跳会话」「无限重渲染」

## 背景与目标

东家 2026-11-12 三批反馈，逐条落成需求：

1. m00614：`dockEnabled=false` 的语义要改——**停用后连左侧也不出现**，且要能在宿主「插件设置」里重新打开。
2. m00770-1：快捷切换交互改造——「Ctrl+Tab 打开，松开 Ctrl 时不自动跳转会话，再次按 Ctrl 才算确认，或者 Enter、鼠标 click；打开期间 Tab 或 Shift+Tab 或 上/下 仍可切换」。
3. m00770-2：「列表展示时，当前会话也显示工作区标签，另新增当前标签，放在最上面显示」（经澄清只改浮层，不动窗格列表）。
4. m01365：「增加快捷键显示 quick switch」——浮层底部常驻一张键位表（唤出 / 切换、移动、再按确认、确认、取消）。这条反转了 C-108 的「不得常驻说明条」口径。
5. m01486：「快捷键信息小一点，靠右显示」；m01532 续：「还有有点太突出了，弱化一点」。
6. m01513：「当前会话的当前没有搞成标签」——行尾灰底小角标改成标题行最前的圆角胶囊。
7. m01532：「焦点 quick switch 如果焦点失焦后，要么忽略快捷键，要么关闭窗口」——失焦即收起，且 `hasFocus` 复核。
8. m01580：「我点击了其他区域也算失焦」——点浮层外任意区域同样收起（`pointerdown`，不吞事件）。
9. m01586：「当前的标签 也增加边框和颜色」——胶囊改强调蓝底 + 1px 描边，浅色主题换深一档。
10. m01613：「多余的失焦监听 如果没啥用就移除」——`visibilitychange` 通道删除，只留 `blur` + `pointerdown` + `hasFocus` 复核。

## 差距评估

- C-109 / T-191 落地的 `dockEnabled` 是「右栏停靠能力开关」：停用后窗格退回左列，仍在屏、仍全量渲染。与东家「停用后连左侧也不出现」的口径不符。
- 宿主**没有** schema→表单的通用渲染器：`dsh-client-ui-plugin-manager/lib/client.js:6019-6023` 只在包详情页 `renderSlot("plugins.bundle.config", { view: "page" }, { entryKey: pkg.name })`，表单由插件自带。原实现只把开关放在窗格标题行的设置弹层里——窗格停用后该入口不可达，等于「关掉后再也打不开」。
- 快捷切换原语义是「松开 Ctrl 即 `commitQuickSwitch()`」（Alt+Tab 手感），与东家「松手不跳、显式确认」冲突。
- 浮层当前行原先是「单列一组放在末尾、硬编码空工作区标签」，与「当前标签放最上面 + 也显示工作区标签」冲突。
- `e2e/specs/right-dock-toggle.mjs` 第 2 段断言「停用后窗格仍在左列」，与新语义直接矛盾，必须重写。

## 收敛方案

1. `src/host.mjs`：`Config` 的 `dockEnabled` 改名 `paneEnabled`（`.default(true).volatile().description(...)`），并为 `position`/`recentHidden`/`recentCollapsible` 各补 `.description()`（插件页卡片与宿主配置面板的提示文案来源）。
2. `src/client.mjs` 配置面：`DOCK_ENABLED_STORAGE_KEY` → `PANE_ENABLED_STORAGE_KEY`（**键串沿用 `dsh-activity-pane:dock-enabled`**，避免升级丢选择与留孤儿键）；`PANE_OPTION_DEFAULTS.paneEnabled = true`；`effectivePaneOption` 显式 `key === "paneEnabled"` 分支；`syncPaneDock`/`connectSidebarRight` 判据改名。
3. `ensurePane` 首行：`if (paneOptions.paneEnabled === false) return null;`——停用态**左右都不建窗格**。
4. 新增 `releasePaneForDisabled()`：摘 `[data-dsh-activity-pane]`、`releaseDetachedPaneBinding(true)`、清 `renderedPane`/`lastSig`/`lastOptionSig`/`pulseSignature`、`toggle.remove()`、`backdrop.removeAttribute("data-drawer-open")`、`applyLayout(true)`。**刻意不注销 `rightTabDisposer`/`rightSlotDisposer`**（宿主 `sidebarRightTabs` 无运行期注销 API）。
5. `applyLayout(forceRelease)` 新增首参；`placeToggle()` 首行停用早退（先 `toggle.remove()`）。
6. `render()` 在 `rightTabNeedsRequest` 消费块之后、`ensurePane` 之前插停用收口：`releasePaneForDisabled()` → `deriveActiveModel()` → `syncBadgeSurface()` → `renderBadgeModal()` → `return`。放在 `ensurePane` 之后会先建一帧窗格再撤，肉眼可见闪动。
7. 插件页设置卡片：新增 `PANE_SETTINGS_SLOT = "plugins.bundle.config"`、`PANE_SETTINGS_CSS`、`createPaneSettingsCard(react, controller, subscribe, getSnapshot)`（`useSyncExternalStore`，`view === "summary"` 返回 null，`controller.set("paneEnabled", !enabled)`）与 `connectPaneSettingsSlot()`。`subscribe`/`getSnapshot` 一次建好、稳定引用（否则 `useSyncExternalStore` 无限重渲染）。
8. 装配段：`paneWiringAttempted = true`；`rightReact()`/`connectSidebarRight()` 仍按 `paneEnabled` 门控；`connectPaneSettingsSlot()` **无条件**调用（停用态唯一入口）。`cleanup` 注销 `paneSettingsDisposer`。
9. `render()` 补接线块：`paneOptions.paneEnabled !== false && !paneWiringAttempted` 时补做 `rightReact()`+`connectSidebarRight()`（运行期重新启用）。
10. 面板内删掉 `dockEnabled` 复选框行；`syncSettingsControls` 去 `dockUsable`；`onSettingsChange` 去 `dockEnabled` 分支。
11. `src/quick-switch.mjs`：新增 `quickSwitchConfirmArmed`；`onQuickSwitchKeyUp` 仅 Control 且已置位才 `commitQuickSwitch()`，否则只置位；`onQuickSwitchKeyDown` 支持浮层内 Tab/Shift+Tab/↑↓ 循环、Enter 提交、Esc 取消、已打开时 Ctrl+Tab 只循环；`openQuickSwitch`/`closeQuickSwitch` 重置确认位。
12. `publishQuickSwitchCandidates` 增第 4 参 `currentWorkspace`，当前行带 `workspace`/`workspaceKey`；`model` 顺序改为 当前 → running → waiting → done；`quickSwitchOrder = [...order, ...cancelOrder]`（循环序当前行在末尾）。`client.mjs` 的 `publish` 调用补 `workspaceInfoForSession(...)`。
13. 浮层底部提示条：`QUICK_SWITCH_HINTS`（Object.freeze，5 项键位表）+ `createQuickSwitchFooter()`（`div.dap-qs-footer` + `role="note"`，键帽 `kbd.dap-qs-key`、标签 `span.dap-qs-hint-label`）；`menu.append(body, footer)`，footer `flex: none` / `border-top` / `pointer-events: none`，不参与循环序列；字号比正文小一档（10px / 键帽 9px）、`justify-content: flex-end` 整条靠右（东家同日追加「小一点、靠右」）。文案表与按键分派同源，改键位须两处同改（`scripts/check.mjs` 对两者都有硬断言）。
14. 文档：`PRD.md` R-01-029 改写为「窗格总开关」+ 新增 AC-06（插件页卡片）、R-01-028 的概述与 AC-02/03/04/08/10/12 同步新语义、索引行改名；`SOLUTION.md` 追溯表两行改写；`RATIONALE/C-110` 记录十条决策与七条被否方案；`C-109` 保留为历史（append-only，不修改）。
15. `C:\Users\czy\.dsh\profiles\desktop\cordis.patch.yml` 本插件条目 config 里 `dockEnabled: false` → `paneEnabled: false`（第 139 行）。

## 测试计划

- `node --check src/client.mjs`、`node --check src/quick-switch.mjs`、`node --check src/host.mjs`。
- `pnpm build:client` 重建 `.dsh-plugin/client.js`，`node --check .dsh-plugin/client.js`。
- 按仓库「全手动验证」策略（AGENTS.md 验证策略章节），E2E 待东家要求再跑。
- MANUAL：浮层里若当前会话行显示「当前」胶囊（在标题行最前、工作区标签之前）；切到别的窗口再切回来，浮层应当已收起，且失焦期间按 Ctrl+Tab 没有任何反应（不拦截、不弹层）。
- MANUAL：真实会话里在宿主「插件」页切总开关，确认窗格当场移除/恢复；确认停用后左列无空列、Ctrl+Tab 与角标照常；Ctrl+Tab 连按 Tab 后松开 Ctrl 不跳转，再按 Ctrl 才跳；浮层顶部为带工作区标签的当前会话行；浮层底部常驻一行键位提示（Ctrl+Tab / ↑↓ / Ctrl / Enter / Esc），鼠标划过提示条不拦截点击、Tab 循环不落在提示条上。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| R-01-029/AC-02 | 语义变更：停用后两列都不呈现 | E2E | rewrite | `e2e/specs/right-dock-toggle.mjs` 第 2 段原断言「窗格仍在左列」与新语义冲突，需改为「`[data-dsh-activity-pane]` 计数 0」并补「中间列内联样式已还原」 |
| R-01-029/AC-06 | 新增：插件页设置卡片 | MANUAL | add | e2e 壳层不加载宿主「插件」页，无法在浏览器用例里导航到该页；改由人工验收清单覆盖 |
| R-01-028/AC-04 | 语义变更：松开 Ctrl 不跳转 | MANUAL | update | e2e 无法可靠模拟「按下并松开 Ctrl」的两次手势；人工验收覆盖 |
| R-01-028/AC-02 | 语义反转：由「不得常驻说明条」改为「底部常驻键位表」 | UNIT | update | `scripts/check.mjs` 该条断言已反转为必须含 `QUICK_SWITCH_HINTS` / `dap-qs-footer` / `menu.append(body, footer)` / `pointer-events: none` |
| R-01-029/AC-01、AC-03、AC-04、AC-05 | 无变化 | E2E | keep | 既有断言仍成立 |
| Config schema | 字段改名 + 补 description | UNIT | none | `scripts/check.mjs` 无 Config 断言；缺省值一致性靠人工核对两处 |

## 终态与证据

- 实现: `src/host.mjs`（`paneEnabled` + 四项 `.description()` + 头注释重写）；`src/client.mjs`（改名、`releasePaneForDisabled`、`applyLayout(forceRelease)`、`placeToggle` 早退、`render` 停用收口与补接线块、`PANE_SETTINGS_SLOT`/`PANE_SETTINGS_CSS`/`createPaneSettingsCard`/`connectPaneSettingsSlot`、装配段与 `cleanup`）；`src/quick-switch.mjs`（`quickSwitchConfirmArmed`、按键分派重写、分组顺序、当前行工作区标签）；`.dsh-plugin/client.js` 经 `pnpm build:client` 重建（602166 字节）。
- 测试: `node --check` 三个源文件 exit 0；`node --check .dsh-plugin/client.js` exit 0；`grep dockEnabled|DOCK_ENABLED src/client.mjs` 零残留。按仓库策略未跑 `pnpm check` 与 E2E。
- SOLUTION 对照: 追溯表 R-01-028 与 R-01-029 两行已重写，子系统与代码位置与实现一致。
- commit: 待提交
- review:
  - 审核方: 自查（对抗性审查口径，按仓库 AGENTS.md 第七条主动构造反例）
  - 问题与修复: 已修三处。(1) 停用收口最初写在 `ensurePane` 之后，反例「运行期关开关」会先建一帧窗格再撤——前移到 `rightTabNeedsRequest` 消费块之后。(2) 卡片最初随 `rightReact()` 一起被 `paneEnabled` 门控，反例「停用后想重新打开」发现唯一的开关入口被自己关掉了——改为无条件挂载。(3) `subscribe`/`getSnapshot` 最初在组件体内每次渲染新建，反例「连续两次渲染」触发 `useSyncExternalStore` 无限重渲染——提到 `connectPaneSettingsSlot()` 里一次建好。
  - 已知限制: 运行期停用后宿主右栏那个空置 tab 要到下次启动才消失（宿主不提供运行期注销 tab 类型）；`paneEnabled` 的 root 级写入若被 profile 补丁锁定，卡片显示只读提示而非静默失败。
