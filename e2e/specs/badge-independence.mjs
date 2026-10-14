// R-01-026/AC-02、R-01-026/AC-03、R-01-026/AC-05、R-01-026/AC-07（宿主侧栏角标与弹窗的数据通路不依赖前台窗格打开）
// 缺陷回归（东家 2026-10-14 反馈「活动会话被关闭后，后台仍在运行，不依赖前台打开」）：
// 把窗格停靠到宿主右侧栏后关上该 tab——本插件是右栏唯一的停靠 tab，宿主规则是
// 「唯一停靠 tab 关闭 = 连整列一起收起」，正文组件随之卸载；此时左侧栏「活动会话」
// 入口行的三状态角标与点开的弹窗必须继续随会话状态推进。
// 修复前实测：render() 在 ensurePane() 返回 null（右栏 tab 关闭 → sidebarRightHost
// 为 null）时整轮早退，syncStatusBadges 永不执行——角标计数与弹窗明细冻结在关栏
// 那一刻；本 spec 的核心断言（已完成计数增长 + 弹窗列出该会话）在修复前必失败。
//
// 观测口径：`.dap-badge-glyph` 的 aria-label「运行中 X，需要交互 Y，已完成 Z」是角标
// 快照的唯一可读出口，挂在宿主侧栏行内、不随窗格卸载；弹窗明细经 `.dap-modal-item` 计数。

import { ensureFullDensity, newSessionWithMessage, openApp, until } from "../helpers.mjs";

/** 角标快照文本（glyph aria-label）：窗格是否挂载都可读。 */
function badgeLabel(page) {
	return page.evaluate(() => document.querySelector(".dap-badge-glyph")?.getAttribute("aria-label") ?? null);
}

/** 从角标文案解析某一类计数；解析不出返回 -1（判据不成立）。 */
function countOf(label, tone) {
	const pattern = new RegExp(`${tone}\\s*(\\d+)`);
	const match = pattern.exec(String(label ?? ""));
	return match === null ? -1 : Number(match[1]);
}

export default async function badgeIndependence({ page, url, assert }) {
	await page.setViewportSize({ width: 1280, height: 760 });
	await openApp(page, url);
	await ensureFullDensity(page);
	// 前置：先有一个会话，窗格才有会话座可挂；角标入口行同时在宿主侧栏就位。
	await newSessionWithMessage(page, "e2e:fast 角标独立甲");
	await until("角标入口行就位", async () => { const label = await badgeLabel(page); return typeof label === "string" && label.length > 0 ? label : null; });

	// 1) 停靠到宿主右侧栏，再关上该 tab（整列收起、窗格正文组件卸载）。
	await page.locator("[data-dsh-activity-pane] .dap-settings").click();
	await page.locator('[data-dsh-activity-pane] input[data-setting="position"]').check();
	await until("窗格停靠到右侧栏", async () => ((await page.locator('[data-dsh-activity-pane][data-dap-docked="right"]').count()) > 0 ? true : null));
	// 关闭控件挂在宿主 dockkit 的 tab 记录上，其 data-dockkit-tab-close 取的是宿主
	// 内部铸造的记录 id（实测 "tab2"，非插件 RIGHT_TAB_ID），故按 tab 标题文字定位。
	const dockTab = page.locator("[data-dockkit-tab]", { hasText: "活动会话" });
	assert.equal(await dockTab.count(), 1, "宿主右栏 tab 条列出本插件「活动会话」tab");
	const closeTab = dockTab.locator("[data-dockkit-tab-close]");
	assert.equal(await closeTab.count(), 1, "宿主右栏 tab 条提供本插件 tab 的关闭控件");
	await closeTab.click();
	await until("右栏 tab 关闭后窗格正文卸载", async () => ((await page.locator("[data-dsh-activity-pane]").count()) === 0 ? true : null));

	const frozen = await badgeLabel(page);
	// R-01-026/AC-01：三枚状态点各自的数据开关与三类计数一一对应（窗格卸载不影响行内角标结构）。
	const dots = await page.evaluate(() => [...document.querySelectorAll(".dap-badge-glyph i[data-tone]")].map((dot) => ({
		tone: dot.getAttribute("data-tone"),
		on: dot.getAttribute("data-on") === "true",
	}))) ;
	const labels = { running: "运行中", interaction: "需要交互", completed: "已完成" };
	for (const dot of dots) {
		assert.equal(dot.on, countOf(frozen, labels[dot.tone]) > 0, `「${dot.tone}」点的点亮状态与关栏时的该类计数一致（R-01-026/AC-01）`);
	}
	assert.ok(frozen !== null, "窗格卸载后角标入口行仍留在宿主侧栏（不随窗格消失）");
	const beforeCompleted = countOf(frozen, "已完成");
	assert.ok(beforeCompleted >= 0, `关栏时可读到已完成计数（实测 aria-label=${frozen}）`);

	// 2) 窗格不在场时新建会话并等它完成：角标「已完成」必须随之增长。
	await newSessionWithMessage(page, "e2e:fast 角标独立乙");
	const advanced = await until("角标计数随会话完成推进（不依赖窗格打开）", async () => {
		const label = await badgeLabel(page);
		return countOf(label, "已完成") > beforeCompleted ? label : null;
	}, 30_000);
	assert.ok(countOf(advanced, "已完成") > beforeCompleted, `窗格未挂载时角标仍随会话完成推进（关栏前 ${beforeCompleted} → 之后 ${countOf(advanced, "已完成")}）`);

	// 3) 弹窗明细走同一条数据通路：点开入口行可见窗格不在场时完成的会话。
	await page.locator(".dap-badge-glyph").locator("xpath=ancestor::button[1]").click();
	await until("角标弹窗打开", async () => ((await page.locator(".dap-modal").isVisible()) ? true : null));
	// AC-02：弹窗呈现三类分组；已完成组此刻必有条目，其余两组允许空态文案。
	for (const tone of ["running", "interaction", "completed"]) {
		assert.equal(await page.locator(`.dap-modal-group[data-tone="${tone}"]`).count(), 1, `弹窗列出「${tone}」分组（AC-02）`);
	}
	const items = await page.locator('.dap-modal-group[data-tone="completed"] .dap-modal-item').count();
	assert.ok(items >= 1, `弹窗「已完成」组列出窗格不在场时完成的会话（实测 ${items} 条）`);
	assert.equal(await page.locator("[data-dsh-activity-pane]").count(), 0, "打开弹窗不把窗格重新推到前台（右栏保持关闭；AC-02）");

	// 4) AC-05：激活弹窗条目跳转该会话，且不使窗格重新挂载到前台。
	await page.locator('.dap-modal-group[data-tone="completed"] .dap-modal-item').first().click();
	await until("弹窗关闭并跳转到条目会话", async () => ((await page.locator(".dap-modal").isVisible()) ? null : true));
	// 窗格此刻不在场，mainAreaHas 依赖窗格右缘定位，故改用会话座（#root [data-slot="main"]）
	// 内的标题文字判定：弹窗条目已把宿主切到该会话。
	await until("主区切换到弹窗条目指向的会话", () => page.evaluate(() =>
		document.querySelector('#root [data-slot="main"]')?.textContent?.includes("e2e:fast 角标独立乙") === true), 30_000);
	assert.equal(await page.locator("[data-dsh-activity-pane]").count(), 0, "弹窗条目跳转不把窗格重新推到前台（AC-05）");

	// 5) AC-07：Escape 关闭弹窗并把焦点归还激活入口行的元素。
	await page.locator(".dap-badge-glyph").locator("xpath=ancestor::button[1]").click();
	await until("角标弹窗再次打开", async () => ((await page.locator(".dap-modal").isVisible()) ? true : null));
	// 焦点在打开后的下一帧（rAF）落到关闭按钮，须轮询而非即时断言。
	await until("弹窗打开后焦点进入弹窗内", () => page.evaluate(() => document.activeElement?.classList.contains("dap-modal-close") === true));
	await page.keyboard.press("Escape");
	await until("弹窗关闭", async () => ((await page.locator(".dap-modal").isVisible()) ? null : true));
	await until("键盘焦点归还激活入口行的元素", () => page.evaluate(() =>
		document.activeElement?.classList.contains("dap-badge-glyph") === true
		|| document.activeElement?.closest("button")?.querySelector(".dap-badge-glyph") !== null
		|| document.activeElement?.closest("button")?.getAttribute("aria-label") === "活动会话"),
	5_000);
}
