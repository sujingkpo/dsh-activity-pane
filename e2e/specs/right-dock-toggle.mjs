// R-01-029/AC-01、AC-02、AC-03、AC-04（窗格总开关：停用后左右两列都不出现，宿主右栏
// 不再有本插件 tab、会话区左列不留窗格与浮动开关，中间列布局接管被还原；左侧栏角标、
// 明细弹窗与 Ctrl+Tab 快捷切换照常；重新启用即时恢复）
// 背景（东家 2026-11-12 两次纠偏）：2026-11-11 落地的 `dockEnabled` 语义是「停用后窗格
// 退回左列」——窗格仍在屏、仍全量渲染。东家要求改为「停用后连左侧也不出现」，且把唯一
// 开关入口搬到宿主「插件」页（该页无法在 e2e 壳层导航到，故 R-01-029/AC-06 由人工验收
// 覆盖，见 tasks/T-192 的测试影响表）。本 spec 只钉浏览器内可观测的三件事：
//   ① 运行期停用：两列都不再有窗格，浮动开关撤出，角标与弹窗照常推进；
//   ② 重新启用：窗格回到原位（position 未被写坏）；
//   ③ 启动即停用（装配期就跳过右栏接线）：宿主右栏根本没有本插件 tab。
//
// 观测口径：
//   - tab 存在性看宿主 dockkit 的 tab 条（按标题文字「活动会话」定位；宿主内部铸造的
//     记录 id 不是插件的 RIGHT_TAB_ID，见 badge-independence.mjs:45-46 的同段注释）；
//   - 角标快照经 `.dap-badge-glyph` 的 aria-label 读取，窗格挂载与否都可读；
//   - 「停用」在 e2e 里只能经 localStorage 预置（插件页卡片不在壳层里）——写的是与
//     其它呈现配置同一条三级回退链的存储键，等价于用户在插件页取消勾选后的生效值。

import { ensureFullDensity, newSessionWithMessage, openApp, until } from "../helpers.mjs";

const PANE_ENABLED_KEY = "dsh-activity-pane:dock-enabled";
const POSITION_KEY = "dsh-activity-pane:position";
const PANE_SELECTOR = "[data-dsh-activity-pane]";
const CONVERSATION_SELECTOR = '#root [data-slot="main"]';

/** 角标快照文本（glyph aria-label）：挂靠在宿主侧栏行内，不随窗格卸载。 */
function badgeLabel(page) {
	return page.evaluate(() => document.querySelector(".dap-badge-glyph")?.getAttribute("aria-label") ?? null);
}

/** 从角标文案解析某一类计数；解析不出返回 -1（判据不成立）。 */
function countOf(label, tone) {
	const match = new RegExp(`${tone}\\s*(\\d+)`).exec(String(label ?? ""));
	return match === null ? -1 : Number(match[1]);
}

/** 宿主右栏 tab 条里本插件的 tab（按标题文字定位）。 */
function dockTab(page) {
	return page.locator("[data-dockkit-tab]", { hasText: "活动会话" });
}

/** 写生效配置（等价于宿主「插件」页卡片里取消/勾选）：停用与启用都走这一条。 */
async function setPaneEnabled(page, enabled) {
	await page.evaluate(
		({ key, value }) => {
			window.localStorage.setItem(key, value);
		},
		{ key: PANE_ENABLED_KEY, value: enabled ? "true" : "false" },
	);
	// 生效值只在每轮 render 开头重读（localStorage 的 storage 事件不跨同页触发），所以写入
	// 之后必须由宿主侧的一次活动驱动下一轮同步。这个用例里持续有推送帧与 1s 时钟，调用方
	// 紧接着就用 until 断言目标状态；此处只留一个短窗口给事件循环，不做结果断言。
	await page.waitForTimeout(400);
}

export default async function rightDockToggle({ page, url, assert }) {
	await page.setViewportSize({ width: 1280, height: 760 });
	await openApp(page, url);
	await ensureFullDensity(page);
	// 前置：先有一个会话，窗格才有会话座可挂；角标入口行同时在宿主侧栏就位。
	await newSessionWithMessage(page, "e2e:fast 窗格开关甲");
	await until("角标入口行就位", async () => {
		const label = await badgeLabel(page);
		return typeof label === "string" && label.length > 0 ? label : null;
	});

	// 1) 基线：启用且位置为右栏时，宿主右栏出现本插件 tab。
	await page.locator(`${PANE_SELECTOR} .dap-settings`).click();
	await until("设置弹层打开", async () => ((await page.locator(`${PANE_SELECTOR} .dap-settings-pop`).isVisible()) ? true : null));
	await page.locator(`${PANE_SELECTOR} input[data-setting="position"]`).check();
	await until("窗格停靠到右侧栏", async () => ((await page.locator(`${PANE_SELECTOR}[data-dap-docked="right"]`).count()) > 0 ? true : null));
	assert.equal(await dockTab(page).count(), 1, "启用状态下宿主右栏 tab 条列出「活动会话」tab（AC-01）");

	// 2) 运行期停用：窗格从两列一起消失（不是搬回左列），浮动开关一并撤出。
	await setPaneEnabled(page, false);
	await until("停用后窗格从文档撤出", async () => ((await page.locator(PANE_SELECTOR).count()) === 0 ? true : null));
	// 再留一轮同步：若停靠面切换或右栏正文重挂把窗格带回，计数会重新变成 1。
	await page.waitForTimeout(600);
	assert.equal(await page.locator(PANE_SELECTOR).count(), 0, "停用后会话区左列不留窗格（不是退回左列；AC-02）");
	assert.equal(await page.locator(".dap-toggle").count(), 0, "停用后浮动开关一并撤出（AC-02）");
	assert.equal(await page.locator(`${PANE_SELECTOR}[data-dap-docked="right"]`).count(), 0, "停用后宿主右栏不再承载窗格（AC-02）");
	// 中间列布局接管必须还原：行方向与会话座的 flex 分配都是插件写进宿主外壳的内联样式。
	const centerInline = await page.evaluate((selector) => {
		const seat = document.querySelector(selector);
		const center = seat === null ? null : seat.parentElement;
		if (center === null) return null;
		const flex = [...center.children].find((child) => child !== seat && getComputedStyle(child).display !== "none") ?? null;
		return {
			flexDirection: center.style.flexDirection,
			alignItems: center.style.alignItems,
			seatFlex: seat.style.flex,
			seatMinWidth: seat.style.minWidth,
			hasSiblingColumn: flex !== null,
		};
	}, CONVERSATION_SELECTOR);
	assert.notEqual(centerInline, null, "停用后仍能找到会话座（用于核对中间列布局还原）");
	assert.equal(centerInline.flexDirection, "", "停用后中间列的 flexDirection 接管已还原（AC-02）");
	assert.equal(centerInline.alignItems, "", "停用后中间列的 alignItems 接管已还原（AC-02）");
	assert.equal(centerInline.seatFlex, "", "停用后会话座的 flex 接管已还原（AC-02）");
	assert.equal(centerInline.seatMinWidth, "", "停用后会话座的 minWidth 接管已还原（AC-02）");

	// 3) 停用期间角标照常推进：新建会话并等它完成，已完成计数必须增长。
	const before = countOf(await badgeLabel(page), "已完成");
	assert.ok(before >= 0, `停用时仍能读到角标已完成计数（实测 aria-label=${await badgeLabel(page)}）`);
	await newSessionWithMessage(page, "e2e:fast 窗格开关乙");
	const advanced = await until("停用期间角标随会话完成推进", async () => {
		const label = await badgeLabel(page);
		return countOf(label, "已完成") > before ? label : null;
	}, 30_000);
	const after = countOf(advanced, "已完成");
	assert.ok(after > before, `停用窗格期间角标仍随会话完成推进（之前 ${before} → 之后 ${after}；AC-03）`);

	// 4) 停用期间弹窗照常可用：三组俱在，且能列出刚完成的会话。
	await page.locator(".dap-badge-glyph").locator("xpath=ancestor::button[1]").click();
	await until("角标弹窗打开", async () => ((await page.locator(".dap-modal").isVisible()) ? true : null));
	for (const tone of ["running", "interaction", "completed"]) {
		assert.equal(await page.locator(`.dap-modal-group[data-tone="${tone}"]`).count(), 1, `停用窗格期间弹窗仍列出「${tone}」分组（AC-03）`);
	}
	const items = await page.locator('.dap-modal-group[data-tone="completed"] .dap-modal-item').count();
	assert.ok(items >= 1, `停用窗格期间弹窗仍能列出已完成会话（实测 ${items} 条；AC-03）`);
	await page.keyboard.press("Escape");
	await until("弹窗关闭", async () => ((await page.locator(".dap-modal").isVisible()) ? null : true));
	assert.equal(await page.locator(PANE_SELECTOR).count(), 0, "开关弹窗不会把停用的窗格重新推回前台（AC-02）");

	// 5) 重新启用：position 仍记着 right，窗格立刻回到右栏（同时钉住「停用不写坏 position」）。
	await setPaneEnabled(page, true);
	await until("重新启用后窗格回到右栏", async () => ((await page.locator(`${PANE_SELECTOR}[data-dap-docked="right"]`).count()) > 0 ? true : null));
	assert.ok(countOf(await badgeLabel(page), "已完成") >= after, "重新启用后角标计数不倒退（AC-03）");

	// 6) 启动即停用：装配期就跳过 react 探测与 tab 注册——重载后宿主右栏根本没有本插件 tab。
	// addInitScript 只影响后续导航，故放在最后一步；位置同时预置为 right，若注册未被跳过，
	// 窗格会立刻出现右栏形态，断言即刻失败。
	await page.addInitScript(
		({ paneEnabledKey, positionKey }) => {
			try {
				window.localStorage.setItem(paneEnabledKey, "false");
				window.localStorage.setItem(positionKey, "right");
			} catch {
				/* 存储不可用时本用例失去意义，交由后续断言暴露 */
			}
		},
		{ paneEnabledKey: PANE_ENABLED_KEY, positionKey: POSITION_KEY },
	);
	await page.goto(url, { waitUntil: "networkidle" });
	// 启动即停用下没有窗格可等：改等宿主侧栏角标就位（它是停用态仍存在的插件呈现）。
	await until("启动即停用后角标入口行仍就位", async () => {
		const label = await badgeLabel(page);
		return typeof label === "string" && label.length > 0 ? label : null;
	}, 30_000);
	assert.equal(await page.locator(PANE_SELECTOR).count(), 0, "启动即停用：两列都不出现窗格（AC-02）");
	assert.equal(await dockTab(page).count(), 0, "启动即停用：宿主右栏 tab 条里没有本插件的 tab（AC-02）");
}
