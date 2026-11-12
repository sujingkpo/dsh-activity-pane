// @description 快捷会话切换（R-01-028）：Ctrl+Tab 唤出的居中浮层。打开期间 Tab /
//   Shift+Tab / ↑↓ 循环候选，但**松开 Ctrl 不再自动跳转**（东家 2026-11-12 反馈：
//   按住 Ctrl 连按会误跳）；确认改为显式动作——再次按下并松开 Ctrl、Enter、或鼠标点行，
//   Esc 取消。不占用宿主标题行槽位——宿主的子代理切换器保持原样，本模块只在 document
//   上装一个常驻 keydown/keyup 监听。窗口失焦（切标签页、宿主切走、系统弹窗抢焦点）
//   期间一律不接管快捷键，并把已打开的浮层收起（东家 2026-11-12 反馈）。
// @author czy
// @date 2026-11-11

/** 浮层与行的全部样式。client.mjs 在既有 CSS 模板串之后以 += 并入同一 style 元素，
 *  不新增 style 节点（卸载沿用既有的 style.remove() 一次性回收）。 */
export const QUICK_SWITCH_CSS = `/* ---- 快捷会话切换（新增功能，R-01-028）----
   热键唤出的居中浮层：常态完全不存在（未按热键时连 DOM 都不建），因此不改变宿主标题行、
   面包屑与工具簇的任何像素；浮层 portal 到 body，不受标题区 overflow 裁剪。 */
/* 轻遮罩：**只在提交之后**出现——浮层先淡出，它同时压一层浅暗并迅速消退，
   用这 0.2s 盖住「新会话还没画出来」的空档。唤出时不显示（不打扰当前视图），
   也不拦任何指针事件（本功能不用鼠标关闭）。 */
.dap-qs-veil {
  position: fixed;
  inset: 0;
  z-index: 2147482959;
  opacity: 0;
  background: color-mix(in srgb, var(--dsw-alias-bg-mask-2, #0b0d12) 45%, transparent);
  pointer-events: none;
}
.dap-qs-veil[hidden] { display: none; }
.dap-qs-veil[data-closing] { animation: dap-qs-veil-out .26s ease-out forwards; }
@keyframes dap-qs-veil-out {
  from { opacity: .55; }
  to { opacity: 0; }
}
.dap-qs-menu {
  position: fixed;
  z-index: 2147482960;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  left: 50%;
  top: 14vh;
  /* 面板宽度：东家 2026-11-11 反馈 336px 显得小气，先放宽到 420，再要求更宽——取
     560px（接近宿主对话框的 600px 口径），窄视口按 100vw 让位。 */
  width: 560px;
  max-width: min(640px, 100vw - 24px);
  max-height: min(620px, 64vh);
  padding: 6px;
  overflow: hidden;
  border: .5px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .08));
  border-radius: var(--dsw-radius-lg, 12px);
  /* 底色必须**不透明**：宿主 --dsw-specific-menu 是 70% 透明的菜单面（#fcfdfeb3），
     直接沿用会让面板透出背后内容、显得发灰（东家 2026-11-11 反馈「完全不够明」）。
     改取不透明的 bg-layer-2，深浅主题各自给实心底。 */
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  box-shadow: var(--dsw-alias-bg-mask-drop, 0 18px 48px rgba(0, 0, 0, .28));
  transform: translateX(-50%);
  /* 入场/退场过渡（东家 2026-11-11 反馈：切换会话有延时，加过渡掩盖空档）。
     退场由 closeQuickSwitch 打 data-closing 触发，动画跑完才落 hidden。 */
  animation: dap-qs-in .14s cubic-bezier(.2, .8, .3, 1);
}
.dap-qs-menu[data-closing] {
  pointer-events: none;
  animation: dap-qs-out .13s ease-in forwards;
}
@keyframes dap-qs-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(.97); }
  to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}
@keyframes dap-qs-out {
  from { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  to { opacity: 0; transform: translateX(-50%) translateY(-4px) scale(.98); }
}
/* 遮罩不参与入场（唤出时不显示），只在退场段压一层浅暗兜住空档。 */
/* 降低动效偏好：与仓库既有口径一致，整段关闭（宿主 reduced-motion 同步）。 */
@media (prefers-reduced-motion: reduce) {
  .dap-qs-menu, .dap-qs-menu[data-closing],
  .dap-qs-veil, .dap-qs-veil[data-closing] { animation: none; }
}
.dap-qs-body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
/* 面板自带 display:flex 会盖掉 UA 的 [hidden] 规则，必须显式声明（本仓库惯例，
   见 .dap-modal-group-items[hidden]、.dap-settings-pop[hidden]）。 */
.dap-qs-menu[hidden] { display: none; }
.dap-qs-group {
  flex: none;
  padding: 8px 11px 3px;
  color: var(--dsw-alias-label-tertiary, #9aa0a6);
  font-size: 11px;
  line-height: 16px;
}
.dap-qs-row {
  box-sizing: border-box;
  display: flex;
  flex: none;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 7px 11px;
  border: 0;
  border-radius: var(--dsw-radius-md, 8px);
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2328);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dap-qs-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
}
/* 热键循环的高亮：与鼠标 hover 同一底色，另加左缘强调条便于在快速连按时定位。 */
.dap-qs-row[data-active] {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
  box-shadow: inset 2px 0 0 var(--dsw-alias-label-primary, #1f2328);
}
.dap-qs-dot {
  flex: none;
  width: 7px;
  height: 7px;
  margin-top: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary, #9aa0a6);
}
.dap-qs-row[data-tone="running"] .dap-qs-dot { background: #65a0ff; }
.dap-qs-row[data-tone="blocked"] .dap-qs-dot { background: #d8a12a; }
.dap-qs-row[data-tone="error"] .dap-qs-dot { background: #e5534b; }
.dap-qs-row[data-tone="done"] .dap-qs-dot { background: #3fbf7f; }
/* 当前会话行：不是「可跳转目标」，而是取消出口（选中即收起、不动当前视图）。
   用空心圈 + 右侧「当前」角标区分，避免与可跳转行混淆。该行自 2026-11-12 起也带
   工作区标签（.dap-qs-ws），并与其它行共用同一套槽位配色变量。 */
.dap-qs-row[data-current] .dap-qs-dot {
  box-sizing: border-box;
  border: 1.5px solid var(--dsw-alias-label-secondary, #6b7280);
  background: transparent;
}
/* 「当前」分组置顶（东家 2026-11-12 反馈）：分组在文档序里排最前，段头文案「当前会话」；
   循环序列仍把它放最后，首按 Tab 先落在可跳转候选上。
   工作区标签（东家 2026-11-11 反馈：与活动卡片一致——放在标题行开头、带槽位配色）。
   着色公式与活动卡片的 .dap-workspace 同源：读同一组 --dap-workspace-* 自定义属性
   （由 renderQuickSwitch 按行写入），深/浅主题各取一套 L/C，文字用前景色、底色用
   独立背景色、描边用前景色，均在 OKLCH 空间按变体混合强度呈现，前景与背景同色相族。 */
.dap-qs-ws {
  flex: none;
  max-width: 40%;
  overflow: hidden;
  padding: 0 7px;
  border-radius: 999px;
  --dap-qs-ws-color: oklch(
     var(--dap-workspace-dark-l, 0.78)
     var(--dap-workspace-dark-c, 0.16)
     var(--dap-workspace-hue, 235)
   );
  --dap-qs-ws-bg: oklch(
     var(--dap-workspace-bg-dark-l, 0.38)
     var(--dap-workspace-bg-dark-c, 0.06)
     var(--dap-workspace-hue, 235)
   );
  color: var(--dap-qs-ws-color);
  background: color-mix(in oklch, var(--dap-qs-ws-bg) var(--dap-workspace-bg-dark-mix, 31%), transparent);
  border: 1px solid color-mix(in oklch, var(--dap-qs-ws-color) var(--dap-workspace-bg-dark-border-mix, 52%), transparent);
  font-size: 10.5px;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
body:not([data-ds-dark-theme]) .dap-qs-ws {
  --dap-qs-ws-color: oklch(
     var(--dap-workspace-light-l, 0.48)
     var(--dap-workspace-light-c, 0.15)
     var(--dap-workspace-hue, 235)
   );
  --dap-qs-ws-bg: oklch(
     var(--dap-workspace-bg-light-l, 0.84)
     var(--dap-workspace-bg-light-c, 0.06)
     var(--dap-workspace-hue, 235)
   );
  background: color-mix(in oklch, var(--dap-qs-ws-bg) var(--dap-workspace-bg-light-mix, 27%), transparent);
  border-color: color-mix(in oklch, var(--dap-qs-ws-color) var(--dap-workspace-bg-light-border-mix, 42%), transparent);
}
.dap-qs-ws[hidden] { display: none; }
/* 「当前」标签（东家 2026-11-12 反馈：原来那个行尾灰底小胶囊看不出来，要真做成标签）：
   自本次起排进标题行**最前面**、工作区标签之前，与 .dap-qs-ws 同款圆角胶囊但走中性强调色
   ——工作区标签是彩色族、这枚是单色，两者同排才不打架。底色用正文色的低混合，
   深浅主题各自跟随，不需要另写 body:not([data-ds-dark-theme]) 分支。 */
.dap-qs-here {
  flex: none;
  box-sizing: border-box;
  padding: 0 7px;
  border-radius: 999px;
  /* 用本插件自己的强调蓝（与运行态圆点、浮动开关同源），而不是宿主的强调色：
     宿主未暴露 --dsw-*accent* 变量，取宿主色会让标签随主题漂移。 */
  color: var(--dap-qs-here-color, #65a0ff);
  background: color-mix(in oklch, var(--dap-qs-here-color, #65a0ff) 16%, transparent);
  border: 1px solid color-mix(in oklch, var(--dap-qs-here-color, #65a0ff) 46%, transparent);
  font-size: 10.5px;
  line-height: 13px;
  font-weight: 500;
  white-space: nowrap;
}
/* 浅色主题：#65a0ff 在浅底上偏淡，换深一档的同一色相（白底对比度约 4.5:1）。 */
body:not([data-ds-dark-theme]) .dap-qs-here {
  --dap-qs-here-color: #2f7ae5;
}
.dap-qs-texts {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: 3px;
  min-width: 0;
}
/* 标题行：工作区标签在前、标题在后，共处一行（东家 2026-11-11 反馈：
   与活动会话卡片的标题行同一排布）。 */
.dap-qs-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.dap-qs-title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 18px;
}
.dap-qs-info {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-size: 12px;
  line-height: 17px;
}
/* 底部快捷键提示条（东家 2026-11-12 反馈：浮层里要能看到快捷键）。
   与正文分开：正文可滚动，提示条固定贴在面板底部、不随候选滚动移出视野；
   只读不点（不参与鼠标交互，也不吃指针事件，避免遮住末行候选的点击）；
   整条靠右（东家 2026-11-12 追加）：候选与标题都左对齐，说明文字放右边不抢视线。 */
.dap-qs-footer {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 3px 9px;
  padding: 6px 11px 5px;
  border-top: .5px solid color-mix(in oklch, var(--dsw-alias-border-l1, rgba(0, 0, 0, .08)) 60%, transparent);
  color: var(--dsw-alias-label-tertiary, #9aa0a6);
  /* 比正文小一档：辅助说明不该与候选行争字号（东家 2026-11-12：快捷键信息小一点）。
     再压一档不透明度：它是「需要时才瞄一眼」的说明，不该与候选行同强度
     （东家 2026-11-12 追加：还有有点太突出了，弱化一点）。 */
  font-size: 10px;
  line-height: 15px;
  opacity: .72;
  pointer-events: none;
}
.dap-qs-hint {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}
/* 键帽：无底色、无描边，只用等宽字体与外边距把它和标签分开——
   有底色就会在面板底部排出一串亮块，太抢视线（东家 2026-11-12：弱化一点）。
   与 macOS/Windows 两套宿主外观都不冲突。 */
.dap-qs-key {
  box-sizing: border-box;
  display: inline-block;
  min-width: 15px;
  padding: 0 2px;
  border-radius: 3px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 9px;
  line-height: 14px;
  text-align: center;
}
.dap-qs-empty {
  flex: none;
  padding: 16px 12px;
  color: var(--dsw-alias-label-tertiary, #9aa0a6);
  font-size: 13px;
  line-height: 19px;
  text-align: center;
}
`;

/** 触发热键（与 Ctrl 组合，Shift 反向）：改这一处即可换键。默认 Tab——
 *  注意纯浏览器标签页会把 Ctrl+Tab 抢作标签切换、页面收不到该事件；桌面壳
 *  （无标签栏的 webview）可用。若实测收不到，把 HOTKEY_KEY 改成未被占用的键
 *  （如 "Q"）即可，其余逻辑无需改动。 */
const HOTKEY_KEY = "Tab";

/** 需要 Ctrl 组合的触发键集合（由 HOTKEY_KEY 派生，保持单一事实来源）。 */
const HOTKEY_CYCLE_KEYS = new Set([HOTKEY_KEY]);

/** 退场动画时长（ms）：与 CSS 的 dap-qs-out .13s、dap-qs-veil-out .26s 对齐取上限，
 *  到期才落 hidden——面板「淡出」而非瞬灭，掩盖切换会话的延时。 */
const QUICK_SWITCH_CLOSE_MS = 260;

/** 快速松开 Ctrl 的判定窗口（ms，东家 2026-11-12 新增的第二档交互）。
 *  Ctrl 按下到松开不足这么久 → 视为「快速按一下」：这次松开**直接提交**（tap 档）；
 *  超过这么久 → 沿用旧口径：唤出那一次的松开只置位，须再次 Ctrl / Enter / 点行确认。
 *  为什么要分档：短按 Ctrl+Tab 是「点一下就走」的肌肉记忆，强制再按一次 Ctrl 反而拖慢；
 *  长按 Ctrl 时人往往在逐行挑（按住 Ctrl 连按 Tab），松开就跳会误伤。
 *  2000 与东家原话「超过2s」一致，改这一处即可调整分档。 */
const QUICK_SWITCH_TAP_MS = 2000;

/** 浮层底部快捷键提示条（东家 2026-11-12 反馈：浮层里要能看到快捷键）。
 *  单一事实来源：文案与 onQuickSwitchKeyDown/KeyUp 的键位表一一对应，改键位时
 *  这张表必须同步改——它是玩家唯一能读到的说明。
 *  形如 { keys: ["Ctrl", "Tab"], label: "唤出 / 切换" }，keys 渲染成键帽。
 *  第三节描述**当前这一下**走哪一档（tap 档「松开即跳」/ hold 档「再按确认」），
 *  随 Ctrl 按住的时长实时切换（见 syncQuickSwitchHintMode），故文案是变量。 */
const QUICK_SWITCH_HINT_TAP_LABEL = "松开即跳";
const QUICK_SWITCH_HINT_HOLD_LABEL = "再按确认";
const QUICK_SWITCH_HINTS = Object.freeze([
	{ keys: ["Ctrl", "Tab"], label: "唤出 / 切换" },
	{ keys: ["↑", "↓"], label: "移动" },
	{ keys: ["Ctrl"], label: QUICK_SWITCH_HINT_HOLD_LABEL, mode: "ctrl" },
	{ keys: ["Enter"], label: "确认" },
	{ keys: ["Esc"], label: "取消" },
]);

/**
 * 构造快捷会话切换器。全部外部依赖以入参注入，模块自身不引用 client.mjs 的闭包变量。
 * @param {object} deps
 * @param {() => Map} deps.getSessionDetails 取会话详情表（含 previews）。
 * @param {() => boolean} deps.isDisposed 实例是否已卸载（监听回调首行复核）。
 * @param {Function} deps.switchCandidates core 纯函数：活动条目 → 三分段候选。
 * @param {Function} deps.resolveWorkspaceColors core 纯函数：工作区键 → 槽位配色映射。
 * @param {Function} deps.makeEl 建带类名的元素。
 * @param {Function} deps.openSessionFromBadge 既有会话跳转通道。
 * @returns {{ publish: Function, connect: Function, dispose: Function }}
 */
export function createQuickSwitch(deps) {
	const { getSessionDetails, isDisposed, switchCandidates, resolveWorkspaceColors, makeEl, openSessionFromBadge } = deps;

	/** 浮层根节点（惰性创建，body 直系子项）与轻遮罩。 */
	let quickSwitchEl = null;
	let quickSwitchEls = null;
	/** 轻遮罩：只服务切换延时的观感，不接任何指针事件。 */
	let quickSwitchVeil = null;
	let quickSwitchOpen = false;
	/** 退场动画的收尾定时器（隐藏 DOM / 摘 data-closing）。 */
	let quickSwitchCloseTimer = null;
	/** 本帧候选模型：[{ tone, label, rows: [{ id, title, info, tone, current }] }]。 */
	let quickSwitchModel = [];
	let quickSwitchModelSig = "";
	/** 当前会话 id（发布时记录）：提交到自身即取消，不触发跳转。 */
	let quickSwitchCurrentId = "";
	/** 平铺后的候选 id 序列（循环顺序 = 分组顺序 + 组内顺序）。 */
	let quickSwitchOrder = [];
	/** 当前高亮序号：-1 = 无高亮（刚唤出、还没按过 Tab）。 */
	let quickSwitchIndex = -1;
	/** 确认待命（东家 2026-11-12 反馈的交互改造）：唤出那一次按住 Ctrl 的松开是
	 *  「打开动作的一部分」，不算确认；此后任意一次 Ctrl 按下并松开才算确认提交。
	 *  置位即表示「打开动作的 Ctrl 已经松过了」，false 时收到的 Ctrl keyup 只置位。 */
	let quickSwitchConfirmArmed = false;
	/** 本次 Ctrl 按下的时刻（Date.now()，ms）：配合 QUICK_SWITCH_TAP_MS 判断这一下是
	 *  「快速点按」还是「长按」。0 = 当前没有按着 Ctrl（时长未知 → 按 hold 档处理）。 */
	let quickSwitchCtrlDownAt = 0;
	/** 跨过 2s 那一刻的翻档定时器：按住 Ctrl 不动时没有事件可依赖，只能靠它把提示条
	 *  从「松开即跳」改成「再按确认」。 */
	let quickSwitchTapTimer = null;
	/** 复用单元：id → 行骨架（跨轮只改文本与 tone，不重建节点）。 */
	const quickSwitchRowUnits = new Map();
	/** 本帧工作区槽位配色：workspaceKey → { foreground, background }（渲染层只查表）。 */
	let quickSwitchColors = new Map();
	/** 分组段头：tone → 节点（只在有该组条目时出现在浮层里）。 */
	const quickSwitchHeads = new Map();
	/** 常驻热键监听的摘除函数（dispose 时调用）。 */
	let hotkeyDisposer = null;

	/** 取（或补建）一行骨架：状态点 + 两行文本（标题行含工作区标签 / 最近一条用户消息
	 *  首行）+ 可选「当前」角标。骨架常驻，跨轮只改文本与 tone——内容刷新不销毁
	 *  指针下的行。 */
	function quickSwitchRowUnit(id) {
		let unit = quickSwitchRowUnits.get(id);
		if (unit !== undefined) return unit;
		const el = document.createElement("button");
		el.type = "button";
		el.className = "dap-qs-row";
		el.dataset.id = id;
		const dot = makeEl("span", "dap-qs-dot");
		const texts = makeEl("span", "dap-qs-texts");
		// 标题行：工作区标签排在标题**之前**、同一行（与活动卡片标题行同构）。
		const line = makeEl("span", "dap-qs-line");
		const title = makeEl("span", "dap-qs-title");
		const info = makeEl("span", "dap-qs-info");
		// 工作区标签常驻、按行是否有工作区切换 hidden。
		const ws = makeEl("span", "dap-qs-ws");
		ws.hidden = true;
		// 「当前」标签常驻、按行是否当前会话切换 hidden：避免增删节点导致行宽跳动。
		// 位置在标题行最前（东家 2026-11-12 反馈），扫读顺序变成「当前 → 工作区 → 标题」。
		const here = makeEl("span", "dap-qs-here");
		here.textContent = "当前";
		here.hidden = true;
		line.append(here, ws, title);
		texts.append(line, info);
		el.append(dot, texts);
		// 鼠标路径与热键共用同一个提交函数：点行即提交，不需要先确认高亮。
		el.addEventListener("click", () => {
			const target = el.dataset.id ?? "";
			if (target === "") return;
			commitQuickSwitch(target);
		});
		unit = { el, dot, title, info, ws, here };
		quickSwitchRowUnits.set(id, unit);
		return unit;
	}

	/** 取（或补建）分组段头节点。 */
	function quickSwitchHead(tone, label) {
		let head = quickSwitchHeads.get(tone);
		if (head === undefined) {
			head = makeEl("div", "dap-qs-group");
			head.dataset.tone = tone;
			quickSwitchHeads.set(tone, head);
		}
		if (head.textContent !== label) head.textContent = label;
		return head;
	}

	/** 底部快捷键提示条（东家 2026-11-12 反馈：浮层里要能直接看到怎么按）。
	 *  只读装饰：不接指针事件（CSS 侧 pointer-events: none），不参与键盘循环，
	 *  也不随候选滚动——它贴在面板底部，正文滚动条只滚 .dap-qs-body。
	 *  文案来自 QUICK_SWITCH_HINTS，与按键分派同源。 */
	function createQuickSwitchFooter() {
		const footer = makeEl("div", "dap-qs-footer");
		// 让读屏把这段读成一句说明而不是几个孤立词。
		footer.setAttribute("role", "note");
		/** 描述「这一下 Ctrl 怎么算确认」的那一格文案节点：随按住的时长改写，
		 *  故单独留引用（其余键帽的文案是常量，建好不再变）。 */
		let modeLabel = null;
		for (const hint of QUICK_SWITCH_HINTS) {
			const item = makeEl("span", "dap-qs-hint");
			if (hint.mode === "ctrl") {
				// 数据属性只是查询锚点（样式仍只认类名），方便定位这一格。
				item.dataset.mode = hint.mode;
			}
			for (const key of hint.keys) {
				const cap = makeEl("kbd", "dap-qs-key");
				cap.textContent = key;
				item.append(cap);
			}
			const label = makeEl("span", "dap-qs-hint-label");
			label.textContent = hint.label;
			item.append(label);
			footer.append(item);
			if (hint.mode === "ctrl") modeLabel = label;
		}
		return { footer, modeLabel };
	}

	/** 提示条第三节的口径：Ctrl 按下不足 QUICK_SWITCH_TAP_MS 就是「松开即跳」，
	 *  超过则是「再按确认」。只在文案真的变了时写 DOM（syncBadgeSurface 同理）。 */
	function syncQuickSwitchHintMode() {
		const label = quickSwitchEls?.modeLabel;
		if (label === null || label === undefined) return;
		// 文案跟着「此刻松开 Ctrl 会不会直接跳」走，四态全覆盖：
		//   · 按着 Ctrl，且（已待命 或 还没到阈值）→ 松开就跳 → 「松开即跳」；
		//   · 按着 Ctrl 但已超阈值、且尚未待命 → 松开不跳 → 「再按确认」；
		//   · 没按着 Ctrl（无论是否已待命）→ 都得再按一下 → 「再按确认」。
		// 待命态下再按住 Ctrl 时，松开一定提交，故只要按着就是「松开即跳」。
		const held = quickSwitchCtrlDownAt !== 0;
		const fast = held && Date.now() - quickSwitchCtrlDownAt < QUICK_SWITCH_TAP_MS;
		const tap = held && (quickSwitchConfirmArmed || fast);
		const next = tap ? QUICK_SWITCH_HINT_TAP_LABEL : QUICK_SWITCH_HINT_HOLD_LABEL;
		if (label.textContent !== next) label.textContent = next;
	}

	/** 长按 Ctrl 不动时没有任何事件可依赖，翻档只能靠定时器：在跨过阈值的瞬间再刷一次。
	 *  重复调用安全（先清旧的），Ctrl 一松开就清掉。 */
	function armQuickSwitchTapTimer() {
		clearQuickSwitchTapTimer();
		if (quickSwitchCtrlDownAt === 0) return;
		const remain = QUICK_SWITCH_TAP_MS - (Date.now() - quickSwitchCtrlDownAt);
		if (remain <= 0) {
			syncQuickSwitchHintMode();
			return;
		}
		quickSwitchTapTimer = setTimeout(() => {
			quickSwitchTapTimer = null;
			syncQuickSwitchHintMode();
		}, remain);
	}

	/** 清掉翻档定时器（关灯、松开 Ctrl、卸载都会走到）。 */
	function clearQuickSwitchTapTimer() {
		if (quickSwitchTapTimer === null) return;
		clearTimeout(quickSwitchTapTimer);
		quickSwitchTapTimer = null;
	}

	/** 惰性建浮层骨架：轻遮罩 + 面板（role=dialog）+ 可滚动正文 + 空态提示 + 快捷键提示条。
	 *  提示条自 2026-11-12 起常驻（东家要求浮层里能看到快捷键）；此前版本的注释写的是
	 *  「不再常驻一行文字」，那条口径已被本次需求取代。 */
	function ensureQuickSwitch() {
		if (quickSwitchEl !== null && quickSwitchEl.isConnected) return quickSwitchEl;
		if (quickSwitchVeil === null || !quickSwitchVeil.isConnected) {
			quickSwitchVeil = makeEl("div", "dap-qs-veil");
			quickSwitchVeil.hidden = true;
			document.body.append(quickSwitchVeil);
		}
		const menu = makeEl("div", "dap-qs-menu");
		menu.hidden = true;
		menu.setAttribute("role", "dialog");
		menu.setAttribute("aria-label", "切换会话");
		const body = makeEl("div", "dap-qs-body");
		const empty = makeEl("div", "dap-qs-empty");
		empty.textContent = "暂无其他会话";
		const { footer, modeLabel } = createQuickSwitchFooter();
		menu.append(body, footer);
		document.body.append(menu);
		quickSwitchEl = menu;
		quickSwitchEls = { menu, body, empty, footer, modeLabel };
		return menu;
	}

	/** 把工作区槽位配色写到标签元素上：变量名与活动卡片的 .dap-workspace 完全同名，
	 *  两个主题各一套 L/C，颜色公式由 CSS 侧计算。值未变则不重写，避免逐帧改 style。 */
	function paintWorkspaceColor(el, workspaceKey) {
		const color = quickSwitchColors.get(String(workspaceKey ?? "").trim());
		const foreground = color?.foreground;
		const background = color?.background;
		const variables = {
			"--dap-workspace-hue": foreground?.hue,
			"--dap-workspace-dark-l": foreground?.darkL,
			"--dap-workspace-dark-c": foreground?.darkC,
			"--dap-workspace-light-l": foreground?.lightL,
			"--dap-workspace-light-c": foreground?.lightC,
			"--dap-workspace-bg-dark-l": background?.dark?.l,
			"--dap-workspace-bg-dark-c": background?.dark?.c,
			"--dap-workspace-bg-dark-mix": background?.dark?.mix,
			"--dap-workspace-bg-dark-border-mix": background?.dark?.borderMix,
			"--dap-workspace-bg-light-l": background?.light?.l,
			"--dap-workspace-bg-light-c": background?.light?.c,
			"--dap-workspace-bg-light-mix": background?.light?.mix,
			"--dap-workspace-bg-light-border-mix": background?.light?.borderMix,
		};
		for (const [property, value] of Object.entries(variables)) {
			const next = value === undefined ? "" : String(value);
			if (el.style.getPropertyValue(property) === next) continue;
			if (next === "") el.style.removeProperty(property);
			else el.style.setProperty(property, next);
		}
	}

	/** 按当前候选模型重建浮层顺序：按 id 复用行、只在位置真正变化时移动节点（避免
	 *  连按 Tab 时行闪烁）。空候选显示「暂无其他会话」。 */
	function renderQuickSwitch() {
		const menu = ensureQuickSwitch();
		const { body, empty } = quickSwitchEls;
		// 提示条第三节的文案随「这一下 Ctrl 已按住多久」变化，重绘时顺手对齐一次。
		syncQuickSwitchHintMode();
		const desired = [];
		const order = [];
		// 当前会话行不进循环序列的前段：先循环全部可跳转候选，最后才轮到它
		// （选中自身 = 取消），首按 Tab 不会停在自身白白浪费一次按键。
		const cancelOrder = [];
		for (const group of quickSwitchModel) {
			if (group.rows.length === 0) continue;
			desired.push(quickSwitchHead(group.tone, group.label));
			for (const row of group.rows) {
				const unit = quickSwitchRowUnit(row.id);
				if (unit.el.dataset.tone !== row.tone) unit.el.dataset.tone = row.tone;
				if (unit.title.textContent !== row.title) unit.title.textContent = row.title;
				if (unit.info.textContent !== row.info) unit.info.textContent = row.info;
				// 工作区标签：条目带工作区就显示，空则整块隐藏（不占行宽）；
				// 配色按工作区身份键写入同名的 --dap-workspace-* 变量（与活动卡片同源）。
				const wsTitle = String(row.workspace ?? "").trim();
				if (unit.ws.textContent !== wsTitle) unit.ws.textContent = wsTitle;
				unit.ws.hidden = wsTitle === "";
				paintWorkspaceColor(unit.ws, row.workspaceKey);
				// 「当前」角标与空心圈只在本行是当前会话时出现。
				if (row.current) unit.el.setAttribute("data-current", "");
				else unit.el.removeAttribute("data-current");
				unit.here.hidden = !row.current;
				// 第二行不可得时整行隐藏：只留标题行，不留一行空白占位。
				unit.info.hidden = row.info === "";
				desired.push(unit.el);
				(row.current ? cancelOrder : order).push({ id: row.id, el: unit.el });
			}
		}
		// 循环序列：可跳转候选在前、「当前行」（取消出口）在末尾。文档序（上面 desired）
		// 由 model 决定，当前行置顶——两者刻意不同（东家 2026-11-12 反馈：标签置顶显示，
		// 但首按 Tab 不该停在取消项上）。
		quickSwitchOrder = [...order, ...cancelOrder];
		if (desired.length === 0) desired.push(empty);
		empty.hidden = desired.length !== 1 || desired[0] !== empty;
		for (const [index, el] of desired.entries()) {
			const ref = body.children[index] ?? null;
			if (ref !== el) body.insertBefore(el, ref);
		}
		while (body.children.length > desired.length) body.lastElementChild?.remove();
		// 复用单元回收：本轮不再出现的会话行移出文档（id 回填时按新内容重建）。
		// 注意 alive 必须含「当前会话」那一行——它不在循环序列前段，但在文档里。
		const alive = new Set([...order, ...cancelOrder].map((entry) => entry.id));
		for (const [id, unit] of [...quickSwitchRowUnits]) {
			if (alive.has(id)) continue;
			unit.el.remove();
			quickSwitchRowUnits.delete(id);
		}
		menu.hidden = !quickSwitchOpen;
		paintQuickSwitchHighlight();
		return menu;
	}

	/** 高亮只改属性：连按 Tab / ↑↓ 时不动 DOM 结构，也不抢键盘焦点（焦点留在宿主输入框，
	 *  由显式确认动作提交）。 */
	function paintQuickSwitchHighlight() {
		for (const [index, entry] of quickSwitchOrder.entries()) {
			const on = index === quickSwitchIndex;
			if (on) entry.el.setAttribute("data-active", "");
			else entry.el.removeAttribute("data-active");
			entry.el.setAttribute("aria-selected", on ? "true" : "false");
		}
		const active = quickSwitchOrder[quickSwitchIndex]?.el ?? null;
		if (active !== null) active.scrollIntoView?.({ block: "nearest" });
	}

	/** 发布本帧候选（deriveActiveModel 每轮调用）：条目只做归类，排序沿用 buildEntries；
	 *  当前会话单列一组「当前会话」并**置顶**（东家 2026-11-12 反馈：当前标签放在最上面
	 *  显示），它是**取消出口**，选中即收起、不动当前视图（东家 2026-11-11 反馈：不含
	 *  自身就没法取消）；循环序列里仍排在最后，首按 Tab 不浪费在取消项上。第二行只读
	 *  既有预览（memoPreviews / detail.previews），缺就留空——不为浮层触发读取。
	 *  签名未变即不碰 DOM。 */
	function publishQuickSwitchCandidates(entries, currentId, currentTitle, currentWorkspace) {
		const groups = switchCandidates(entries, currentId);
		quickSwitchCurrentId = currentId === null || currentId === undefined ? "" : String(currentId);
		// 工作区槽位配色：与活动卡片同源（同一 core 纯函数 + 同一组自定义属性名），
		// 由本帧候选的工作区键一次性解析，行渲染时只写变量、不做二次计算。
		// 当前会话行现在也带工作区标签，其身份键一并纳入（否则它的胶囊取不到槽位色）。
		const colorByWorkspace = resolveWorkspaceColors([
			...groups.running, ...groups.waiting, ...groups.completed,
		].map((entry) => entry.workspaceKey).concat(currentId === null || currentId === undefined ? [] : [currentWorkspace?.key ?? ""]));
		quickSwitchColors = colorByWorkspace;
		const toRow = (entry) => {
			const detail = getSessionDetails().get(String(entry.id));
			// 第二行取「最近一条用户消息的物理首行」，来源单一：既有日志窗口派生的
			// detail.previews（applyLogEvents 写入，随窗口事件以 SYNC_MIN_INTERVAL_MS
			// 节奏刷新）。没有窗口（紧凑档压制、日志未落地）就留空，渲染层只显示标题行
			// ——绝不为浮层把条目加进 previewFallbackIds 触发日志分页深翻（档位资源
			// 纪律，DOMAIN.md:127-131）。
			const preview = detail?.previews?.userPreview ?? "";
			// 标题兜底：mainTitle 可能返回空串（会话命名尚未落地），此时回落 id，
			// 保证「一行标题」永不为空。
			const title = String(entry.title ?? "").trim();
			return {
				id: String(entry.id),
				title: title === "" ? String(entry.id) : title,
				info: String(preview).trim(),
				// 工作区标签：buildEntries 已把工作区标题/键算好，这里原样取，不回查。
				workspace: String(entry.workspaceTitle ?? "").trim(),
				// 工作区身份键：只用于取槽位配色（与活动卡片同一套 12 槽 + 3 背景变体）。
				workspaceKey: String(entry.workspaceKey ?? "").trim(),
				tone: entry.kind === "running" ? "running" : entry.waitClass === "done" ? "done" : entry.waitClass === "error" ? "error" : "blocked",
				current: false,
			};
		};
		// 当前会话行不依赖它是否出现在活动条目里（空闲会话通常不在 active 中）：
		// 由 currentId + 标题 + 工作区归属现场合成，保证任何时刻都有取消出口。
		// 工作区由调用方（deriveActiveModel 里的 workspaceInfoForSession）算好传入，
		// 与活动卡/历史卡同一份归属口径（东家 2026-11-12 反馈：当前会话也要显示
		// 工作区标签）——本模块不回查会话详情、不新增数据依赖。
		const currentRow = quickSwitchCurrentId === ""
			? null
			: {
				id: quickSwitchCurrentId,
				title: String(currentTitle ?? "").trim() || quickSwitchCurrentId,
				info: "",
				workspace: String(currentWorkspace?.title ?? "").trim(),
				workspaceKey: String(currentWorkspace?.key ?? "").trim(),
				tone: "current",
				current: true,
			};
		// 「当前」分组置顶（东家 2026-11-12 反馈：当前标签放在最上面显示）；循环序列里
		// 它仍排在末尾（见 renderQuickSwitch 的 order/cancelOrder 分流）——首按 Tab
		// 不应停在「原地不动」的取消项上。
		const model = [
			...(currentRow === null ? [] : [{ tone: "current", label: "当前会话", rows: [currentRow] }]),
			{ tone: "running", label: "运行中", rows: groups.running.map(toRow) },
			{ tone: "waiting", label: "等待行动", rows: groups.waiting.map(toRow) },
			{ tone: "done", label: "已完成", rows: groups.completed.map(toRow) },
		];
		// 签名必须含工作区标签与身份键：换了工作区但标题相同也要刷新（AC-12）。
		const sig = model
			.map((group) => `${group.tone}:${group.rows.map((row) => `${row.id}\u0000${row.title}\u0000${row.info}\u0000${row.workspace}\u0000${row.workspaceKey}\u0000${row.tone}`).join("\u0001")}`)
			.join("\u0002");
		// 当前行的工作区也参与签名（上面 model 已含它），无需额外键。
		if (sig === quickSwitchModelSig) return;
		quickSwitchModelSig = sig;
		quickSwitchModel = model;
		if (quickSwitchOpen) renderQuickSwitch();
	}

	/** 打开浮层：只在热键按下时发生；打开后不再抢焦点，键盘事件由文档级监听接管。
	 *  遮罩此刻**不**显形——它只服务退场（切换会话的延时观感），唤出时不该压暗当前视图。 */
	function openQuickSwitch() {
		if (quickSwitchOpen) return;
		quickSwitchOpen = true;
		quickSwitchIndex = -1;
		// 唤出本次的 Ctrl 还按着：那次松开按「按住的时长」分两档处理（东家 2026-11-12 二次改造）——
		// 快速点按（不足 QUICK_SWITCH_TAP_MS）→ 松开即提交；长按 → 只置位，须再按确认。
		quickSwitchConfirmArmed = false;
		armQuickSwitchTapTimer();
		// 上一次退场还没收尾就再次唤出：取消收尾，直接复用现有节点。
		if (quickSwitchCloseTimer !== null) {
			clearTimeout(quickSwitchCloseTimer);
			quickSwitchCloseTimer = null;
		}
		const menu = renderQuickSwitch();
		menu.removeAttribute("data-closing");
		menu.hidden = false;
		if (quickSwitchVeil !== null) {
			quickSwitchVeil.removeAttribute("data-closing");
			quickSwitchVeil.hidden = true;
		}
		paintQuickSwitchHighlight();
		// 失焦收口只留两条：窗口 blur（切应用/最小化/宿主切走）+ 点浮层外（pointerdown）。
		// 页面转隐藏（visibilitychange）与 blur 覆盖同一场景，且 keydown 首行的 hasFocus()
		// 复核已兜住漏拍，故不再单独挂——东家 2026-11-12：多余的失焦监听移除。
		window.addEventListener("blur", cancelQuickSwitch);
		document.addEventListener("pointerdown", onQuickSwitchPointerDown, true);
	}

	/** 收起浮层：清高亮、摘窗口级监听，先跑退场过渡再落 hidden——切换本身有延时，
	 *  面板不要「啪」地消失；遮罩同时压一层浅暗（0.26s）盖住新会话尚未画出的空档。
	 *  重复调用安全。 */
	function closeQuickSwitch() {
		if (!quickSwitchOpen) return;
		quickSwitchOpen = false;
		quickSwitchIndex = -1;
		quickSwitchConfirmArmed = false;
		// 时长基准与翻档定时器一起清：下次唤出由新的 Ctrl keydown 重新打点。
		quickSwitchCtrlDownAt = 0;
		clearQuickSwitchTapTimer();
		syncQuickSwitchHintMode();
		paintQuickSwitchHighlight();
		window.removeEventListener("blur", cancelQuickSwitch);
		document.removeEventListener("pointerdown", onQuickSwitchPointerDown, true);
		const menu = quickSwitchEl;
		const veil = quickSwitchVeil;
		if (menu === null || menu.hidden) return;
		menu.setAttribute("data-closing", "");
		if (veil !== null) {
			// 遮罩先显形再跑淡出动画：基态 opacity 为 0，只有动画能把浅暗推上去。
			veil.hidden = false;
			veil.setAttribute("data-closing", "");
		}
		// 用定时器而非 animationend：reduced-motion 下动画被关掉，事件永不触发，
		// 面板会永久卡在可见态。定时器与动画时长对齐，两种偏好下都收得住。
		if (quickSwitchCloseTimer !== null) clearTimeout(quickSwitchCloseTimer);
		quickSwitchCloseTimer = setTimeout(() => {
			quickSwitchCloseTimer = null;
			menu.removeAttribute("data-closing");
			menu.hidden = true;
			if (veil !== null) {
				veil.removeAttribute("data-closing");
				veil.hidden = true;
			}
		}, QUICK_SWITCH_CLOSE_MS);
	}

	/** 取消（Esc / 窗口失焦）：收起且不跳转。 */
	function cancelQuickSwitch() {
		closeQuickSwitch();
	}

	/** 点浮层外任意区域即收起（东家 2026-11-12：「点击了其他区域也算失焦」）。
	 *  用 pointerdown 而非 click：等 click 落地时宿主按钮的默认动作已经排上队了，
	 *  我们要在那之前把浮层收掉。捕获期但**不** preventDefault / stopPropagation——
	 *  用户点哪就点哪，浮层只是顺手收起，不能把这次点击吞掉。
	 *  屏蔽：面板内部（含行点击，那条路径自己会提交）、轻遮罩（本功能不用它关闭）。 */
	function onQuickSwitchPointerDown(event) {
		if (!quickSwitchOpen) return;
		const menu = quickSwitchEl;
		if (menu === null) return;
		const target = event.target;
		if (target instanceof Node && menu.contains(target)) return;
		if (target instanceof Node && quickSwitchVeil !== null && quickSwitchVeil.contains(target)) return;
		cancelQuickSwitch();
	}

	/** 循环高亮：dir 为 +1 向后、-1 向前（Shift+Tab）。首按时落在第一项上；
	 *  高亮移动**不**提交，须再按一次 Ctrl / Enter / 点行才前往（东家 2026-11-12）。
	 *  候选为空时保持无高亮。顺序里「当前会话」排在末尾，首按 Tab 永远先落到
	 *  真正可跳转的目标上。 */
	function cycleQuickSwitch(dir) {
		if (quickSwitchOrder.length === 0) {
			paintQuickSwitchHighlight();
			return;
		}
		const count = quickSwitchOrder.length;
		quickSwitchIndex = quickSwitchIndex < 0 ? (dir > 0 ? 0 : count - 1) : (quickSwitchIndex + dir + count) % count;
		paintQuickSwitchHighlight();
	}

	/** 提交：跳转到目标会话；目标是**当前会话**或空则不跳转——这就是「选中自身＝取消」
	 *  的出口（鼠标点行、Enter、再次按下并松开 Ctrl 共用本函数）。 */
	function commitQuickSwitch(explicitId) {
		const id = typeof explicitId === "string" && explicitId !== ""
			? explicitId
			: (quickSwitchOrder[quickSwitchIndex]?.id ?? "");
		const current = quickSwitchCurrentId;
		closeQuickSwitch();
		if (id === "") return;
		if (current !== "" && id === current) return;
		openSessionFromBadge(id);
	}

	/** 常驻热键监听（东家 2026-11-12 交互改造后的键位表）：
	 *   - 未打开：Ctrl+Tab 唤出并向后循环、Ctrl+Shift+Tab 唤出并向前循环；
	 *   - 已打开：Tab / Shift+Tab / ↓ / ↑ 循环，Enter 确认，Esc 取消，鼠标点行确认；
	 *   - 已打开：**松开 Ctrl 不提交**（按住 Ctrl 连按 Tab 会误跳），改由「再次按下并
	 *     松开 Ctrl」确认（见 onQuickSwitchKeyUp）。
	 *  捕获期拦截——宿主或浏览器默认的 Tab 焦点转移不得先跑。
	 *  注：纯浏览器标签页里 Ctrl+Tab 被浏览器标签切换抢占，页面收不到该事件；桌面壳
	 *  的 webview 没有标签栏，热键可用（用户 2026-11-11 拍板仍用 Ctrl+Tab）。 */
	function onQuickSwitchKeyDown(event) {
		if (isDisposed()) return;
		// 窗口本身没有焦点时一律不接管快捷键（东家 2026-11-12：失焦后要么忽略、要么关闭）。
		// window 的 blur 事件并不总在第一时间到（焦点先进 iframe、宿主 webview 交接、
		// 系统弹窗抢焦点等场景都可能漏一拍），所以每个按键再确认一次真实焦点。
		// 这条放在最前：失焦期间连 Esc 也不处理——浮层此刻已由 blur 收起。
		if (!document.hasFocus()) {
			// 兜底：真的漏了 blur（浮层还在屏），也在这里补一次收起，避免「看不见却还在拦键」。
			if (quickSwitchOpen) closeQuickSwitch();
			return;
		}
		// Ctrl 按下的时刻：tap / hold 两档的分档基准（东家 2026-11-12 二次改造）。
		// 打点在 Control 自己的 keydown 上，而不是 Ctrl+Tab 那一刻——用户可能先按住
		// Ctrl 停一会儿再按 Tab，「Ctrl 按了多久」说的是 Ctrl 本身。
		// event.repeat 的自动重复不能重置打点，否则按住不放会被反复刷新成 0 秒。
		if (event.key === "Control" && !event.repeat) {
			quickSwitchCtrlDownAt = Date.now();
			if (quickSwitchOpen) {
				// 浮层已开着又按下 Ctrl（hold 档的「再按一次」）：新的一轮按住重新计时。
				syncQuickSwitchHintMode();
				armQuickSwitchTapTimer();
			}
		}
		if (event.key === "Escape" && quickSwitchOpen) {
			event.preventDefault();
			event.stopPropagation();
			cancelQuickSwitch();
			return;
		}
		if (quickSwitchOpen) {
			// 浮层打开期间的循环键：Tab / Shift+Tab / ↓ / ↑ 同一条 cycleQuickSwitch，
			// 方向语义统一为「向下/向后 = +1」。这些键**不**触发确认，只有 Enter、
			// 再次 Ctrl（keyup）、鼠标点行才提交。
			if (event.key === "Tab") {
				event.preventDefault();
				event.stopPropagation();
				cycleQuickSwitch(event.shiftKey ? -1 : 1);
				return;
			}
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				event.stopPropagation();
				cycleQuickSwitch(event.key === "ArrowDown" ? 1 : -1);
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				event.stopPropagation();
				commitQuickSwitch();
				return;
			}
		}
		if (!HOTKEY_CYCLE_KEYS.has(event.key)) return;
		if (!event.ctrlKey || event.altKey || event.metaKey) return;
		// 打点必须在 openQuickSwitch 之前：后者要用「这一刻」决定 arm 哪种确认口径。
		if (quickSwitchCtrlDownAt === 0) quickSwitchCtrlDownAt = Date.now();
		event.preventDefault();
		event.stopPropagation();
		if (!quickSwitchOpen) {
			openQuickSwitch();
			cycleQuickSwitch(event.shiftKey ? -1 : 1);
			return;
		}
		// 已打开时再按 Ctrl+Tab：照常循环（不提交），语义与 Tab 一致。
		cycleQuickSwitch(event.shiftKey ? -1 : 1);
	}

	/** 松开 Ctrl：两档（东家 2026-11-12 二次改造）。
	 *   - **tap 档**：本次 Ctrl 按下不足 QUICK_SWITCH_TAP_MS——这是「Ctrl+Tab 点一下就
	 *     走」的用法，松开直接提交，不必再按一次；
	 *   - **hold 档**：按住超过阈值（多半在逐行挑）——松开只把浮层置为「确认待命」，
	 *     仍须再次 Ctrl / Enter / 点行确认。
	 *  全程用 keyup：按下即判会让「按住 Ctrl 连按 Tab 再放开」的老习惯在按下瞬间就跳。 */
	function onQuickSwitchKeyUp(event) {
		if (event.key !== "Control") return;
		// 先把这一轮的时长结算掉：即使浮层没开（只是单独按了一下 Ctrl），也要把打点
		// 清干净——留着会让下一次 Ctrl+Tab 拿旧时刻算时长，永远落进 hold 档。
		const downAt = quickSwitchCtrlDownAt;
		quickSwitchCtrlDownAt = 0;
		clearQuickSwitchTapTimer();
		if (!quickSwitchOpen) return;
		if (!quickSwitchConfirmArmed) {
			// 唤出那一次 Ctrl 的松开：按「按下时长」分两档。
			quickSwitchConfirmArmed = true;
			const tapped = downAt !== 0 && Date.now() - downAt < QUICK_SWITCH_TAP_MS;
			if (tapped) {
				commitQuickSwitch();
				return;
			}
			// hold 档：浮层留在屏上等第二次 Ctrl，提示条同步改回「再按确认」。
			syncQuickSwitchHintMode();
			return;
		}
		// 「再按一次 Ctrl」的松开：照旧提交（不论这一次按多短）。
		commitQuickSwitch();
	}

	/** 接线：装常驻热键监听（slots/react 都不再需要）。返回成对摘除函数。 */
	function connectQuickSwitch() {
		if (hotkeyDisposer !== null) return hotkeyDisposer;
		document.addEventListener("keydown", onQuickSwitchKeyDown, true);
		document.addEventListener("keyup", onQuickSwitchKeyUp, true);
		hotkeyDisposer = () => {
			document.removeEventListener("keydown", onQuickSwitchKeyDown, true);
			document.removeEventListener("keyup", onQuickSwitchKeyUp, true);
			hotkeyDisposer = null;
		};
		return hotkeyDisposer;
	}

	/** 卸载回收：摘热键与窗口监听、移除浮层 DOM 与复用单元。重复调用安全。 */
	function disposeQuickSwitch() {
		try {
			hotkeyDisposer?.();
		} catch {
			// 宿主已拆掉文档对象时摘监听会抛：忽略，后续 DOM 回收照常执行。
		}
		hotkeyDisposer = null;
		// 卸载要立刻清干净：退场定时器与浮层都直接回收，不等动画（实例已死，
		// 留一个 200ms 后自删的定时器只会拖住引用）。
		if (quickSwitchCloseTimer !== null) {
			clearTimeout(quickSwitchCloseTimer);
			quickSwitchCloseTimer = null;
		}
		// 翻档定时器同理：实例已死，留着只会在 2s 后戳一次悬空 DOM。
		clearQuickSwitchTapTimer();
		quickSwitchCtrlDownAt = 0;
		quickSwitchOpen = false;
		window.removeEventListener("blur", cancelQuickSwitch);
		document.removeEventListener("pointerdown", onQuickSwitchPointerDown, true);
		quickSwitchRowUnits.clear();
		quickSwitchHeads.clear();
		quickSwitchEl?.remove();
		quickSwitchEl = null;
		quickSwitchEls = null;
		quickSwitchVeil?.remove();
		quickSwitchVeil = null;
		quickSwitchModel = [];
		quickSwitchModelSig = "";
		quickSwitchCurrentId = "";
		quickSwitchOrder = [];
	}

	return {
		/** 每轮派生后发布候选（签名未变即不碰 DOM）。 */
		publish: publishQuickSwitchCandidates,
		/** 装常驻热键监听。 */
		connect: connectQuickSwitch,
		dispose: disposeQuickSwitch,
	};
}
