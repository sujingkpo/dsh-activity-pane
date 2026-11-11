---
doc-type: task
mutation: lifecycle
id: T-190
---

# T-190 快捷会话切换（Ctrl+Tab 浮层）

状态: completed
关联: R-01-028
风险等级: major
风险面: 新增全局键盘热键（捕获期拦截 Ctrl+Tab）与跨会话跳转入口；实现外提到独立文件并改动构建脚本，实测语义行数超过 minor 阈值 50，按升档条件取 major

## 背景与目标

东家 2026-11-11 先提出在「中间运行的区域标题栏」新增快速切换会话功能，据此实现了一版挂在宿主 `conversation.session.header.lineage` 槽的标题栏切换器。同日东家改变方向：改为 `Ctrl+Tab` 唤出的快捷切换，并明确删掉标题栏入口、只留热键。

- 只快速切换【已完成、运行中】两种状态的会话。
- 未唤出时界面与现状逐像素一致；热键唤出居中浮层。
- 浮层展示除当前会话以外的其他会话，并在末尾单列当前会话作为取消出口；没有其他会话就显示没有。
- 有条目时展示两行：一行标题、一行最近一条用户消息首行。

先做技术评审（1–7 节：理解与模糊点 / 交互 / 数据与筛选 / 边界 / 风险与成本 / 待确认问题 / 结论），再经 `ask_user_question` 拍板键位、交互形态与标题栏入口去留后实施。

## 差距评估

- PRD：原无该功能需求。评审期新增 R-01-028 承载，11 条 AC 覆盖常态零侵入、热键唤出、循环高亮不抢焦点、松手提交、候选口径、空态、两行文本与不读日志、鼠标与 Esc、子代理不进候选、当前会话作取消出口、过渡动画。
- 代码：`src/core.mjs` 只有 `buildEntries`/`buildRecent`/`classifyActiveEntries` 等通用派生，没有「排除当前会话并三分段」的候选函数；`src/client.mjs` 只有窗格内与侧栏角标两个呈现面，没有全局热键入口；`scripts/build-client.mjs` 只拼三个源文件，没有第四个文件的接缝。
- 宿主侧事实（前一版标题栏方案实测）：`conversation.session.header.lineage` 是 single 槽且动态包后注册必然成为 winner，注册即遮蔽宿主 `dsh-client-ui-subagent` 的子代理切换器；该结论正是转向「不占槽位」的直接动因。
- 测试：`scripts/check.mjs` 无该需求任何断言；`document.addEventListener("click"` 禁用的既有断言（:3818）约束收起路径的实现通道。

## 收敛方案

1. `src/core.mjs`：新增导出纯函数 `switchCandidates(entries, currentId = null)`——只收 `kind` 为 `running`/`awaiting` 的条目（跳过 `subagent`/`job`），按 `currentId` 排除当前会话，三分段 `{ running, waiting, completed }`；组内顺序原样沿用入参，不重排。**不套用 `classifyActiveEntries`**：它不把错误提醒归入任何组，套用会让出错会话静默消失（东家口径：blocked/error 都进）。
2. 新建 `src/quick-switch.mjs`（独立文件，实现整体外提）：`export const QUICK_SWITCH_CSS`（`.dap-qs-*` 全部样式，含 `.dap-qs-menu[hidden] { display: none; }`——`display: flex` 会盖掉 UA hidden）与 `export function createQuickSwitch(deps)` 工厂，依赖全部经入参注入（`getSessionDetails`/`isDisposed`/`switchCandidates`/`resolveWorkspaceColors`/`makeEl`/`openSessionFromBadge`），返回 `{ publish, connect, dispose }`。
   - `publishQuickSwitchCandidates(entries, currentId, currentTitle)`：调用 `switchCandidates` 拿三段，一并按本帧候选工作区键调 `resolveWorkspaceColors` 取槽位配色；映射为行（标题空则回落 id；第二行只读 `detail.previews.userPreview`；标题行还带工作区标签），另由 `currentId`/`currentTitle` 现场合成「当前会话」行单列末组（取消出口），拼签名去重（含标题与工作区身份键）。
   - `ensureQuickSwitch`/`renderQuickSwitch`/`quickSwitchRowUnit`/`quickSwitchHead`：惰性建轻遮罩与浮层（`document.body` 直挂，`position: fixed` 居中）、行与段头按 id/tone 复用、只在位置变化时移动节点、空态「暂无其他会话」。
   - `paintQuickSwitchHighlight`：只写 `data-active`/`aria-selected` 与 `scrollIntoView`，全程不调 `focus()`。
   - `openQuickSwitch`/`closeQuickSwitch`/`cancelQuickSwitch`/`cycleQuickSwitch`/`commitQuickSwitch`：开合与循环、提交；退场打 `data-closing` 跑动画并由定时器收尾（`QUICK_SWITCH_CLOSE_MS = 260`），命中当前会话即只收起不跳转。
   - `onQuickSwitchKeyDown`/`onQuickSwitchKeyUp`：`Ctrl+Tab` 唤出并向后循环、`Ctrl+Shift+Tab` 向前、松开 Ctrl 提交、Esc 取消；`Alt`/`Meta` 同时按下不触发；捕获期 `preventDefault`/`stopPropagation`。
   - `connectQuickSwitch`/`disposeQuickSwitch`：常驻热键监听成对挂摘；卸载时收起浮层、清复用表与段头、移除 DOM、复位模型。
3. `src/client.mjs` 只保留五个接入点：`style.textContent += QUICK_SWITCH_CSS;`、`let quickSwitch` + `quickSwitchOf()`（注入取值器，`sessionDetailsById` 有 TDZ、`disposed` 可变）、`deriveActiveModel` 返回前 `quickSwitchOf().publish(active, currentIdOf(snapshot), mainTitle(...))`、装配块 `quickSwitchOf().connect()`、cleanup `quickSwitch?.dispose()`。
4. `scripts/build-client.mjs`：读入 `src/quick-switch.mjs`（剥 `export`）并插到 `client.mjs` 之前，与其余模块同处一个工厂作用域；`scripts/check-staged-client.mjs` 的 `inputs` 登记该文件。
5. `PRD.md`：新增 `#### R-01-028 快捷会话切换`（9 条 AC）+ M-006 里程碑索引行。
6. `SOLUTION.md`：追溯索引行（主责子系统改为「快捷切换器」）+ 新增 `### 快捷切换器` 子系统小节（职责 / 关键内部结构 / 代码位置）。
7. `DOMAIN.md`：术语「快捷切换器」+ 实体关系 + 跨模块不变量各一条。
8. `RATIONALE/C-108`：记录不占宿主槽位、Ctrl+Tab 键位、循环不抢焦点、实现外提独立文件、候选单点派生、只读既有预览六条决策与被否方案（含前一版标题栏槽方案的放弃原因）。
9. `scripts/check.mjs`：R-01-028 的 9 条 AC 契约断言（读 `src/quick-switch.mjs` 源码 + `switchCandidates` 行为级用例 + 「不得为浮层读日志」「实现不外溢回 client.mjs」的代码级断言）。

## 测试计划

- `pnpm build:client` 重建 `.dsh-plugin/client.js`；`node --check .dsh-plugin/client.js` 语法通过。
- `node scripts/check.mjs`（含新增 R-01-028 断言组）。
- MANUAL（按仓库「全手动验证」策略）：真实会话里确认未按热键时无任何额外节点、`Ctrl+Tab` 唤出并循环、`Ctrl+Shift+Tab` 反向、松开 Ctrl 跳转、Esc 取消、鼠标点选、空态文案、子代理会话不成为候选。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| R-01-028/AC-01 | 新增：常态零侵入、卸载回收 | UNIT | add | `scripts/check.mjs#R-01-028/AC-01`（不注册宿主槽位 + 五个接入点断言） |
| R-01-028/AC-02 | 新增：Ctrl+Tab 唤出、修饰键排除 | UNIT | add | `scripts/check.mjs#R-01-028/AC-02`（热键常量与监听挂摘成对） |
| R-01-028/AC-03 | 新增：循环高亮、Shift 反向、不抢焦点 | UNIT | add | `scripts/check.mjs#R-01-028/AC-03`（循环函数 + 无 focus 调用断言） |
| R-01-028/AC-04 | 新增：松手提交、未移动不跳转、点选同路径 | UNIT | add | `scripts/check.mjs#R-01-028/AC-04`（提交走 `openSessionFromBadge`） |
| R-01-028/AC-05 | 新增：候选口径（只收主会话 running/awaiting、排除当前、三分段） | UNIT | add | `scripts/check.mjs#R-01-028/AC-05`（`switchCandidates` 行为断言） |
| R-01-028/AC-06 | 新增：空态文案 | UNIT | add | `scripts/check.mjs#R-01-028/AC-06` |
| R-01-028/AC-07 | 新增：两行文本、只读既有预览、不读日志 | UNIT | add | `scripts/check.mjs#R-01-028/AC-07`（不触发日志读取断言） |
| R-01-028/AC-08 | 新增：鼠标点选与 Esc 取消 | UNIT | add | `scripts/check.mjs#R-01-028/AC-08` |
| R-01-028/AC-09 | 新增：子代理不进候选 | UNIT | add | `scripts/check.mjs#R-01-028/AC-09`（core 单点过滤断言） |
| R-01-028/AC-10 | 新增：当前会话作取消出口、选中自身不跳转 | UNIT | add | `scripts/check.mjs#R-01-028/AC-10`（末组合成行 + `if (current !== "" && id === current) return;`） |
| R-01-028/AC-11 | 新增：入场/退场过渡、定时器收尾、尊重降低动效 | UNIT | add | `scripts/check.mjs#R-01-028/AC-11`（两段 keyframes + `QUICK_SWITCH_CLOSE_MS` + reduced-motion） |
| R-01-028/AC-12 | 新增：标题行开头的工作区标签（槽位配色、与活动卡片同构）、不可得时隐藏、不额外回查 | UNIT | add | `scripts/check.mjs#R-01-028/AC-12`（`entry.workspaceKey` 取值 + `line.append(ws, title)` + `--dap-workspace-hue` 变量写入 + 签名含工作区字段） |
| SOLUTION | 新增：快捷切换器子系统小节 | UNIT | none | 方案文档同步，行为已由 AC-01～AC-09 断言覆盖 |
| DOMAIN | 新增：术语「快捷切换器」与不变量 | UNIT | none | 术语文档同步，不引入新行为 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：候选三分段、排除当前、只收主会话 | `scripts/check.mjs#R-01-028/AC-05`、`src/core.mjs::switchCandidates` |
| 异常 | 适用：入参非数组返回空三组、预览不可得整行隐藏、会话卸载后热键回调首行即返回 | `scripts/check.mjs#R-01-028/AC-06`、`src/quick-switch.mjs::if (isDisposed()) return;` |
| 边界配置 | 适用：候选为零时显示空态、`Alt`/`Meta` 同时按下不触发、未按过 Tab 时松手不跳转 | `scripts/check.mjs#R-01-028/AC-02`、`src/quick-switch.mjs::quickSwitchIndex < 0` |
| 副作用 | 适用：不为浮层读日志、不在 document 上拦 click、卸载全回收、实现不外溢回 client.mjs | `scripts/check.mjs#R-01-028/AC-07`、`src/quick-switch.mjs::disposeQuickSwitch`、`scripts/check.mjs#R-01-028/AC-01` |

## 终态与证据

- 实现: `src/core.mjs` 新增 `switchCandidates`；`src/quick-switch.mjs` 新建整套快捷切换（浮层、热键、候选发布、生命周期）；`src/client.mjs` 只保留样式并入、构造、publish、connect、dispose 五个接入点；`scripts/build-client.mjs` 拼入第四个源文件；`scripts/check-staged-client.mjs` 的 inputs 登记；`.dsh-plugin/client.js` 经 `pnpm build:client` 重建。
- 测试: `node scripts/check.mjs` 全过（含新增 R-01-028 断言组）；`node --check .dsh-plugin/client.js` 通过。按仓库「全手动验证」策略未跑 E2E。
- SOLUTION 对照: 已核对 `SOLUTION.md` 新增的 `### 快捷切换器`——职责、关键内部结构（零侵入、热键三段式、不抢焦点、候选单点派生、只读预览、行复用、生命周期）、代码位置与实现一致，实现与方案无漂移。
- commit: 26f63aa（⭐ 功能(activity-pane): 新增 Ctrl+Tab 快捷会话切换浮层）
- 语义行数: 907
- review:
  - 审核方: 自查（对抗性审查口径，按仓库 AGENTS.md 第七条主动构造反例）
  - 目的理解: 用 Alt+Tab 的肌肉记忆在会话间跳转，且不占用、不改变宿主标题行的任何像素——这要求实现完全不进入宿主渲染树。
  - 执行方式: 对照前一版标题栏实现逐条核对被放弃的理由是否真的消失；对热键时序（按下唤出 / 连按循环 / 松开提交 / Esc 取消 / 卸载中途）逐条走事件路径；核对四个收起与提交路径是否共用同一提交函数。
  - 问题与修复: 从零新写独立文件时按反例逐条落定，三处关键取舍写在代码注释里。(1) `keyup` 只认 `event.key === "Control"`——若对所有键都提交，按 Ctrl+C 复制就会误跳转。(2) `.dap-qs-menu` 的 `display: flex` 会盖掉 UA 的 `[hidden]`，故补 `.dap-qs-menu[hidden] { display: none; }`，否则浮层收起后仍在屏。(3) 候选函数一度想复用 `classifyActiveEntries`，实测它不归入错误提醒，会让出错会话从浮层里消失——改为自建三分段并注释说明原因。
  - 复审结论: 无 blocking finding。零侵入、热键唤出、循环与反向、不抢焦点、松手提交与未移动不跳转、候选口径、空态、两行文本与不读日志、鼠标与 Esc、子代理不进候选十条验收点均有对应断言或代码级证据；未引入 document click、未为浮层新增任何日志读取、未新增写回通道。已知平台限制：纯浏览器标签页里 `Ctrl+Tab` 被浏览器标签切换抢占、页面收不到事件，桌面壳 webview 无标签栏时可用，东家已知悉并仍选定该键位。
