---
doc-type: rationale
mutation: append-only
id: C-110
owner: agent
---

# C-110 停靠开关升格为窗格总开关：唯一入口改宿主「插件」页，快捷切换改显式确认

日期: 2026-11-12

#### 上下文
C-109 落地的是「右栏停靠能力开关」（`dockEnabled`）：停用后窗格退回左列，右栏接线整段跳过。东家 2026-11-12 连续两次纠偏：先是「停用后连左侧也不出现」（m00614），随后把入口钉在宿主「插件设置」里（m00614 的 custom），同日又追加两件事（m00770）：① 快捷切换要「按下 Ctrl+Tab 打开、松开 Ctrl 不自动跳转、再次 Ctrl 或 Enter 或鼠标点行才确认，打开期间 Tab/Shift+Tab/↑↓ 仍可切换」；② 浮层里当前会话也要显示工作区标签，并新增「当前」分组放在最上面。

约束：验证策略全手动（CONVENTIONS.md）；本 fork 持续合并上游，改动以新增为主；`Config` schema 缺省值必须与 `PANE_OPTION_DEFAULTS` 一致。

#### 决策
1. **改名 `dockEnabled` → `paneEnabled`**：语义已从「是否停靠右栏」变成「窗格整体是否存在」，旧名会误导后续维护者。**localStorage 键串沿用旧值 `dsh-activity-pane:dock-enabled`**——改名键会让升级用户的选择丢失并留下孤儿键，代价大于命名一致性。
2. **停用后两列都不呈现**：`ensurePane` 首行早退（连左侧也不建），并新增 `releasePaneForDisabled()` 把已挂的窗格、浮动开关 `toggle`、遮罩 `data-drawer-open` 一并撤出，再 `applyLayout(true)` 还原插件写进宿主外壳的中间列内联样式（行方向、`flex` 分配）。不还原的话停用后宿主中央区会留着一列空地。`applyLayout` 因此新增首参 `forceRelease`。
3. **停用收口放在 `ensurePane` 之前**（`render()` 里紧接 `rightTabNeedsRequest` 消费块）：放在之后的话本轮仍会先建出一个窗格再撤，用户会看到一帧闪动。收口分支照常执行 `deriveActiveModel()` + `syncBadgeSurface()`，角标与弹窗不因停用而停摆（R-01-026/AC-03）。
4. **唯一入口是宿主「插件」页的设置卡片**：宿主**不按 `Config` schema 自动生成表单**（`dsh-client-ui-plugin-manager/lib/client.js:6019-6023` 只 `renderSlot("plugins.bundle.config")`，全 asar 无 schema 渲染器），所以插件必须把 React 组件注册进 `plugins.bundle.config`（key = 包名 `dsh-activity-pane`）。读写走已接好的 `configForms` 控制器：`subscribe`/`getSnapshot` 读、`controller.set("paneEnabled", next)` 写。
5. **面板内不再放这个开关**：窗格本身不在屏时，面板里的复选框也就没了入口——留着只会让「关掉后再也打不开」。设置弹层里的 `dockEnabled` 整行删除，标题行的 position 按钮恢复常显（它现在只切左右）。
6. **`subscribe`/`getSnapshot` 必须是稳定引用**：`useSyncExternalStore` 每次渲染拿到新闭包会无限重渲染（宿主 `dsh-win-pwsh7/client.js:521-524` 踩过同一个坑，注释里写着 "The result of getSnapshot should be cached"）。本插件在 `connectPaneSettingsSlot()` 里一次建好、闭包捕获 controller。
7. **卡片无条件挂载**：装配段里 `rightReact()`/`connectSidebarRight()` 仍按 `paneEnabled` 门控，但 `connectPaneSettingsSlot()` 不在门控里——它是停用态唯一能把窗格开回来的入口。卡片自身对缺 `configForms`、命名空间未服务、React 缺 `useSyncExternalStore` 三种情况全部退场（`return`），不注册空壳。
8. **`rightTabDisposer` / `rightSlotDisposer` 刻意不注销**：宿主 `sidebarRightTabs` 只提供 `register`，无运行期注销 API；强调 disposer 会让 tab 类型从宿主表里消失而插件侧留下悬空引用，重新启用时无法再注册。运行期停用后那个空置 tab 留到下次启动——这条限制如实写进 PRD AC-02，不假装能做到。
9. **快捷切换改显式确认**：新增 `quickSwitchConfirmArmed` 位。唤出浮层那次 Ctrl 的 `keyup` 只置位、不提交；此后任意一次 Ctrl `keyup` 才 `commitQuickSwitch()`。`openQuickSwitch`/`closeQuickSwitch` 都重置该位。浮层已打开时的 Ctrl+Tab 只 `cycle` 不提交；Tab/Shift+Tab/↑↓ 同样只 `cycle`；Enter 提交；Esc 取消；鼠标点行提交（与热键共用 `commitQuickSwitch`）。
10. **当前会话行置顶但仍排在循环末尾**：`publishQuickSwitchCandidates` 的 `model` 顺序改为 当前会话组 → running → waiting → done（文档序置顶），而 `renderQuickSwitch` 里 `quickSwitchOrder = [...order, ...cancelOrder]` 把当前行放到循环序列末尾——首按 Tab 不会白白停在「取消」项上。当前行的工作区标签与配色（`resolveWorkspaceColors` 纳入其 `workspaceKey`）与其它行同源。
11. **浮层底部常驻快捷键提示条**（东家 2026-11-12 追加，m01365）：C-108 曾按 2026-11-11 的反馈删掉常驻说明「松开 Ctrl 前往…」，本次改为一张 `QUICK_SWITCH_HINTS` 键位表（唤出 / 切换、移动、再按确认、确认、取消）+ `kbd` 键帽，只读、`pointer-events: none`、`flex: none` 固定在正文下方。旧的单行散文说明确实该删（它是操作提示，读一次就够），但改后的交互有「再按一次 Ctrl 才确认」这种反直觉动作，没有键位表用户不可能猜到——所以整体否掉的是散文、恢复的是键位表。文案表与 `onQuickSwitchKeyDown`/`onQuickSwitchKeyUp` 的键位分支同源，改键位必须两处一起改。排版按「辅助说明」定位：字号比正文小一档（10px，键帽 9px），整条 `justify-content: flex-end` 靠右——候选行与标题都左对齐，说明文字贴右边才不会与内容争视线（东家 2026-11-12 第一次追加）。同日第二次追加「还是有点太突出」，于是再压一档：整条 `opacity: .72`、键帽**去掉底色与描边**（带底会排出一串亮块，这是最主要的一处抢眼来源）、顶部洗线以 60% 混合淡化。

12. **「当前」做成真正的标签并前移**：原来它是贴在行尾的 10px 灰底小胶囊，深色主题下与行底色几乎同值，等于看不见（东家 2026-11-12：「当前会话的当前没有搞成标签」）。改为圆角胶囊，位置从行尾移到**标题行最前**（`line.append(here, ws, title)`），扫读序变成「当前 → 工作区 → 标题」。东家同轮追加「也增加边框和颜色」，于是配色定为**本插件自己的强调蓝**：`#65a0ff`（与运行态圆点、浮动开关、设置行 `accent-color` 同源），`color-mix` 混 16% 作底、46% 作 1px 描边；浅色主题换深一档的 `#2f7ae5`（`#65a0ff` 在浅底上偏淡）。**被否**：中性无彩色（第一版就是，东家看过仍嫌不够，要求加色）、取宿主强调色（宿主未暴露 `--dsw-*accent*` 变量，grep 全 asar 零命中，取宿主色会让标签随主题漂移且无法预判对比度）、做成实心填充色块（与工作区彩色胶囊抢同一个视觉层级，两个实心色块并排会互相削弱）。

13. **失焦即视为放弃，而不是继续挂在后台**：浮层打开期间窗口失焦（切应用、最小化、宿主切走、系统弹窗）就收起；`keydown` 首行再以 `document.hasFocus()` 复核。理由是 `window` 的 `blur` 在这些场景下会漏拍（焦点先进 iframe、宿主 webview 交接），只挂 `blur` 会留下「看不见却还在拦键」的浮层——此时用户按 Ctrl+Tab 会被吃掉但屏幕毫无反应。**被否**：失焦时保留浮层等回来（回来看到的是高亮停在旧位置、候选可能已过期的残影）、只靠 `blur` 不做 `hasFocus` 复核（漏拍场景无兜底）。
14. **「点其他区域」也算失焦，但走 `pointerdown` 且不吞事件**：东家 2026-11-12「我点击了其他区域也算失焦」。监听挂 `document` 的捕获期 `pointerdown`，命中面板内部与轻遮罩时直接 return，其余情况 `cancelQuickSwitch()`；**不** `preventDefault`/`stopPropagation`——用户点的那个按钮该响还得响，浮层只是顺手收起。用 `pointerdown` 而非 `click`：等 `click` 落地时宿主按钮的默认动作已经排上队，收浮层会让它晚半拍。**被否**：给浮层加全屏背板吃点击（会挡住宿主界面，且本功能刻意不用遮罩关闭）、`click` + `stopPropagation`（等于吞掉用户那次点击）。
15. **只保留两条失焦通道，`visibilitychange` 不重复挂**：切标签页/最小化都会先触发 `window` 的 `blur`，`visibilitychange` 与它覆盖同一场景；真漏拍时 `keydown` 首行的 `hasFocus()` 复核仍能兜住。东家 2026-11-12：「多余的失焦监听 如果没啥用就移除」。

#### 被否方案及原因
- 保留面板内的复选框 + 插件页两个入口：两处状态容易打架，且停用后面板内入口根本不可达。
- 让停用只摘窗格、不还原中间列样式：宿主中央区会留一列空白，看起来像布局塌了。
- 用 `display:none` 藏窗格代替移除：`.dsh-activity-pane` 仍是 flex 子项，宽度仍被分配；且 §停用的名义是「成本归零」，藏着不算。
- 在 `ensurePane` 之后做停用收口：会先建一帧窗格再撤，肉眼可见闪动。
- 停用时注销 tab 类型：见决策 8。
- 快捷切换维持「松手即跳转」再加一个 Enter：松手误跳正是东家要消除的手感问题，留着等于没改。
- 当前会话行也放进循环序列前段：首按 Tab 会停在「取消」项上，等于浪费一次按键。
- 继续不放任何热键说明（沿用 C-108）：显式确认语义下「再按 Ctrl 提交」不可猜，用户会以为浮层卡住。
- 用一行散文提示而非键位表：键帽 + 标签在 560px 宽的浮层里只需一行，扫读成本低于句子。
- 提示条可点击或可关闭：它不承担操作，`pointer-events: none` 避免鼠标划过浮层底部时误命中。

#### 影响面
R-01-029（改名为「窗格总开关」，新增 AC-06 插件页卡片）、R-01-028/AC-02、AC-03、AC-04、AC-08、AC-10、AC-12（显式确认、当前行置顶、当前行工作区标签、底部常驻快捷键提示条）、`src/host.mjs` 的 `Config`（`paneEnabled` + 四项 `.description()`）、`src/client.mjs`（设置卡片、停用收口、`applyLayout(forceRelease)`、`placeToggle` 早退）、`src/quick-switch.mjs`（确认位、按键分派、分组顺序、当前行标签）。角标子系统（R-01-026）实现不变。e2e 规格 `right-dock-toggle` 原用例依赖「停用后仍在左列」，与新语义冲突，需重写。
