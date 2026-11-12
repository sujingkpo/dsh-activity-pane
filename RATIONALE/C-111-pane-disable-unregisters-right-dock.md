---
doc-type: rationale
mutation: append-only
id: C-111
owner: agent
---

# C-111 停用窗格时右栏入口一并注销：宿主 register 返回的就是运行期 disposer

日期: 2026-11-12

#### 上下文
东家 2026-11-12：`关闭 启用活动会话窗格, 右侧侧边栏也不再注册入口`。C-110 决策 8 曾判「刻意不注销 rightTabDisposer / rightSlotDisposer：宿主 sidebarRightTabs 只提供 register、没有运行期注销 API」，PRD R-01-029/AC-02 也如实写着「已注册的 tab 类型保留至下次启动」。本次对照宿主实现复核，该判断是误读：`dsh-client-ui-sidebar-right/lib/client.js:4905` 的 `register(definition)` 文档注释写明 "Register one tab type for the caller's lifetime. The caller holds the returned disposer inside its own ctx.effect… @returns idempotent disposer."，实现（:4923-4933）是 `const dispose = this.ctx.effect(() => { this.ids.add(id); const slot = this.enter(kind, entry); this.refresh(); return () => { this.ids.delete(id); this.leave(kind, slot, entry); this.refresh(); }; }, …)`，返回的闭包调用即撤除并 refresh。tab 条（`tabTypes = { subscribe, getSnapshot: () => tabs.entries() }`，:5662-5665）与引导页（`tabs.guide()`，:5728-5731）读同一张表，所以注销即等于「入口不再注册」。被否的前提不是「做不到」，是「没找到」。

#### 决策
1. **停用时注销 tab 类型与席位**：新增 `releaseRightDockWiring()`，停用分支第一件事就调它（在 `releasePaneForDisabled()` 之前）。顺序是**先关 tab → 再摘正文/标题席位 → 最后注销 tab 类型**。理由：关 tab 会让正文 React 组件卸载，此刻席位还在，宿主走的是自己那条正常卸载路径；反过来先注销类型，tab 立刻退化成「这类内容还没有可用的查看方式」的空壳（`:1629 tab.unavailable`），用户看到的是一个点开也没内容的入口。
2. **必须先关 tab，只注销类型不够**：宿主「没有注册类型的 tab」是一种被承认的状态，不是错误——旧 tab 会继续占着 tab 条、整列也不会收起。`closeTab` reducers（`:1326-1342`）在关闭最后一条停靠 tab 时自己追加 `planSetMode(state, "push")` + `planSetExpanded(state, false)`，即宿主负责把列收起，插件不必自己做。
3. **关闭走 `closeIn(sessionId, tabId)`，缺席时退回 `close(tabId)`**：`closeIn` 的注释明确标着 "Not part of `ISidebarRight`: the Tab domain's path."，但它对所有**已采纳 store** 的会话都有效（`:2538-2546`），而 `close()` 只作用于在屏会话（`:2654-2656` 经 `this.require()`）。故运行时探类型而非写死：有 `closeIn` 就按会话关（后台会话的残留 tab 也能清），否则退回只关在屏会话。两者都对未采纳 store 的会话静默无操作，所以遍历`sessions.list` 全量 id 是安全的。
4. **tab 记录的字段是 `id`，不是 `tabId`**：`tabsIn(sessionId)`（`:2486-2488`）直接返回 `Object.values(layout.tabs)`，记录形如 `{ id, kind, contentId, title }`（见 `:1255-1260`）。按 `tab.tabId` 读会永远拿到 `undefined` 而静默跳过——这条踩过，记下来。
5. **停用期要清扫「之后才出现的」残留 tab**：宿主把每个会话的右栏布局持久化在 `localStorage` 的 `dsh.sidebar-right.v1.<sessionId>`（`:886-926` 的 `readSidebarLayout/writeSidebarLayout`），注销 tab 类型**不会**清掉已存记录。停用那一刻清扫只覆盖当前已采纳 store 的会话；用户之后切到别的会话时，宿主在 seat 挂载时采纳 store 并从 localStorage 恢复布局，旧的空壳 tab 就复活了。故 `sweepRightDockTabs()` 以「在屏会话 id」（`currentIdOf`）为触发键，一变就重开一个**三轮**的清扫窗口（`rightDockSweepRounds = 3`）——采纳是异步的，晚于会话切换的那一拍，只扫一次会漏。重新启用时必须把 `rightDockSweptFor`/`rightDockSweepRounds` 一起作废，否则重注册后的 tab 会被当成残留关掉。
6. **注销后必须复位 `paneWiringAttempted` 与 `sidebarRightHost`**：重新启用要靠 render 的补接线块重注册，而那块的门是 `!paneWiringAttempted`；不复位的话「停用→启用」一次之后就再也不会接线。`connectSidebarRight` 内部的 `if (rightTabDisposer !== null) return;` 保证重注册幂等。
7. **disposer 先本地取引用再置空**：`const disposeTab = rightTabDisposer; rightTabDisposer = null; try { disposeTab(); } catch {}`。若先调用再置空，disposer 抛错时守卫会永远非 null，此后既不会再注销也不会再注册。宿主注释保证 disposer 幂等，故 `catch` 只吞宿主已卸载的情况。

#### 被否方案及原因
- 维持 C-110 决策 8（保留注册，只清正文）：东家要的是「不再注册入口」，保留一个点开是「这类内容还没有可用的查看方式」的空壳 tab 正是他要消除的东西。
- 只注销 tab 类型、不关已打开的 tab：tab 记录还在布局里，tab 条照旧列出它（无类型可认领）。
- 先注销类型再关 tab：关 tab 时正文组件已经失去类型，宿主渲染路径退化，空壳会先闪一帧。
- 直接删除 localStorage 里的 `dsh.sidebar-right.v1.<sessionId>`：越权且粗鲁——那一份记录里还有用户其它插件的 tab，删掉等于清空别人的右栏布局。
- 每次 render 都全量扫一遍所有会话的 tab：`tabsIn` 只对已采纳 store 有内容，全量扫大部分是空转；且每轮扫会让用户在停用期手动做的事被反复覆盖。改用「在屏会话变化 + 三轮窗口」。
- 在 `releasePaneForDisabled()` 里顺手注销：两者职责不同，且注销必须在撤窗格之前（关 tab 会卸载正文，此刻窗格还挂在右栏宿主里由它自己摘），混在一起后顺序就不可读了。

#### 影响面
R-01-029（AC-02 删掉「宿主不提供运行期注销」的限制说法并补「右栏入口一并撤除」，AC-04 补「重新注册并重开 tab」，概述段补运行期撤除）、`src/client.mjs`（`closeRightDockTabs`/`sweepRightDockTabs`/`releaseRightDockWiring`、`rightDockSweptFor`/`rightDockSweepRounds`、停用分支与补接线块、`releasePaneForDisabled` 注释、设置卡片说明文案）、`src/host.mjs`（`Config` 头部注释与 `paneEnabled` 的 `.description()`）、`scripts/check.mjs`（新增 R-01-029/AC-02 契约断言四条）、`e2e/specs/right-dock-toggle.mjs`（第 2 段补「运行期停用后 tab 条里没有本插件 tab」、第 6 段既有断言不变）。角标子系统（R-01-026）与快捷切换（R-01-028）实现不变。
