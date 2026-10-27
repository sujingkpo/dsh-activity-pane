// R-01-026/AC-01、R-01-026/AC-02、R-01-026/AC-04、R-01-026/AC-06（宿主侧栏角标与弹窗在无会话座/宿主侧栏折叠下仍活）
// 本 spec 覆盖三条「窗格不在正常前台形态」的边界：
//   - AC-04：宿主布局缺失（会话座 #root [data-slot="main"] 与其容器被摘除，ensurePane
//            取不到座位）时角标仍随会话状态推进，且不向控制台报本插件错误；
//   - AC-06：宿主侧边栏折叠为图标态时角标仍随会话状态推进；
//   - AC-01/AC-02：入口行角标的三状态语义与激活行为（弹窗三组、不切换宿主主面板）。
// 修复前：render() 在 ensurePane() 返回 null 时整轮早退、角标刷新不再执行，
// 两种情况下的角标计数都会冻结，下方计数增长断言必失败。

import { ensureFullDensity, newSessionWithMessage, openApp, until } from "../helpers.mjs";

/** 宿主侧边栏折叠态：frame = [data-shell-overlay].parentElement（与插件落位守卫同源）。 */
function hostDrawerCollapsed(page) {
	return page.evaluate(() => document.querySelector("[data-shell-overlay]")?.parentElement?.hasAttribute("data-sidebar-collapsed") === true);
}

/** 当前激活的宿主面板行（aria-current="page" 的导航按钮）标签，用于校验弹窗不切面板。 */
function activePanelLabel(page) {
	return page.evaluate(() => document.querySelector('nav button[aria-current="page"]')?.getAttribute("aria-label") ?? null);
}

/** 角标快照文本（glyph aria-label）。 */
function badgeLabel(page) {
	return page.evaluate(() => document.querySelector(".dap-badge-glyph")?.getAttribute("aria-label") ?? null);
}

/** 从角标文案取未读完成数（「（n 个未读）」括号里的数字）；无该后缀返回 0。 */
function unreadOf(label) {
	const match = /（(\d+) 个未读）/.exec(String(label ?? ""));
	return match === null ? 0 : Number(match[1]);
}

/** 从角标文案取「已完成」计数；取不到返回 -1。 */
function completedOf(label, tone = "已完成") {
	const match = new RegExp(`${tone}\\s*(\\d+)`).exec(String(label ?? ""));
	return match === null ? -1 : Number(match[1]);
}

export default async function badgeSurfaces({ browser, page, url, assert }) {
	await page.setViewportSize({ width: 1280, height: 760 });
	const consoleErrors = [];
	page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
	page.on("pageerror", (error) => consoleErrors.push(String(error)));

	await openApp(page, url);
	await ensureFullDensity(page);
	await newSessionWithMessage(page, "e2e:fast 角标静置甲");
	const initial = await until("角标入口行就位", () => badgeLabel(page));

	// ---- AC-01：三状态角标结构、无障碍名称与悬停提示 ----
	// 未读完成提醒存在时（R-01-026/AC-10）无障碍名称在后追加「（n 个未读）」，为 0 时不追加。
	assert.match(initial, /^运行中 \d+，需要交互 \d+，已完成 \d+(（\d+ 个未读）|（已全部读）)?$/, `角标无障碍名称给出三状态计数与已读口径（实测 ${initial}）`);
	const a11y = await page.evaluate(() => {
		const glyph = document.querySelector(".dap-badge-glyph");
		return {
			title: glyph?.getAttribute("title") ?? null,
			tones: [...glyph.querySelectorAll("i[data-tone]")].map((dot) => dot.getAttribute("data-tone")),
			dots: [...glyph.querySelectorAll("i[data-tone]")].map((dot) => ({
				tone: dot.getAttribute("data-tone"),
				on: dot.getAttribute("data-on") === "true",
			})),
			rowLabel: glyph.closest("button")?.getAttribute("aria-label") ?? null,
		};
	});
	assert.equal(a11y.title, initial, "角标悬停提示与无障碍名称同源（R-01-026/AC-01）");
	// R-01-026/AC-01：三枚点各自的数据开关与三类呈现口径一一对应（计数为 0 的点置灰不隐藏）。
	// R-01-026/AC-16：「已完成」点按**未读**完成提醒数点亮，全部已读即与 0 计数同款置灰。
	const labels = { running: "运行中", interaction: "需要交互", completed: "已完成" };
	for (const dot of a11y.dots) {
		// 运行中/需要交互按各自计数点亮；「已完成」按未读数点亮——全部已读时虽然计数大于 0
		// 也置灰（R-01-026/AC-16），点亮本身即代表「还有没看过的完成提醒」。
		const expectedOn = dot.tone === "completed" ? unreadOf(initial) > 0 : completedOf(initial, labels[dot.tone]) > 0;
		assert.equal(dot.on, expectedOn, `「${dot.tone}」点的点亮状态与该类呈现口径一致（R-01-026/AC-01、AC-16）`);
	}
	assert.deepEqual(a11y.tones, ["running", "interaction", "completed"], "角标由三枚状态点构成（R-01-026/AC-01）");
	assert.equal(a11y.rowLabel, "活动会话", `角标挂在宿主「活动会话」入口行的行按钮内（实测 rowLabel=${a11y.rowLabel}）`);

	// ---- R-01-026/AC-06（窄条形态）：窗格自身折叠为桌面窄条时角标仍随会话状态推进 ----
	await page.locator("[data-dsh-activity-pane] .dap-titlebar").click();
	await until("窗格折叠为桌面窄条", async () => ((await page.locator("[data-dsh-activity-pane][data-collapsed]").count()) > 0 ? true : null));
	const railBefore = completedOf(await badgeLabel(page));
	await newSessionWithMessage(page, "e2e:fast 角标静置条");
	const railAfter = await until("窄条形态下角标继续推进", async () => {
		const done = completedOf(await badgeLabel(page));
		return done > railBefore ? done : null;
	}, 30_000);
	assert.ok(railAfter > railBefore, `窗格折叠为窄条时角标仍随会话完成推进（${railBefore} → ${railAfter}；R-01-026/AC-06）`);
	// 窄条态由窄条本体（.dap-rail）承担展开，标题行此时不可见。
	await page.locator("[data-dsh-activity-pane] .dap-rail").click();
	await until("窗格恢复展开", async () => ((await page.locator("[data-dsh-activity-pane][data-collapsed]").count()) === 0 ? true : null));

	// ---- R-01-026/AC-01、AC-02（需要交互组）：回合转入待回复时角标「需要交互」计数增长，
	// 弹窗该组列出条目（此前只验证了空组的空态文案，缺非空驱动路径）。 ----
	await newSessionWithMessage(page, "e2e:ask 角标待回复探针");
	const blockedCount = await until("「需要交互」计数增长", async () => {
		const count = completedOf(await badgeLabel(page), "需要交互");
		return count > 0 ? count : null;
	}, 30_000);
	assert.ok(blockedCount > 0, `待回复会话使角标「需要交互」计数增长（实测 ${blockedCount}；R-01-026/AC-01）`);

	// ---- R-01-026/AC-02：激活入口行打开弹窗且不切换宿主主面板 ----
	const panelBefore = await activePanelLabel(page);
	await page.locator(".dap-badge-glyph").locator("xpath=ancestor::button[1]").click();
	await until("角标弹窗打开", async () => ((await page.locator(".dap-modal").isVisible()) ? true : null));
	assert.equal(await activePanelLabel(page), panelBefore, "激活入口行打开弹窗而不切换宿主主面板（R-01-026/AC-02）");
	for (const tone of ["running", "interaction", "completed"]) {
		assert.equal(await page.locator(`.dap-modal-group[data-tone="${tone}"]`).count(), 1, `弹窗按「${tone}」分组列出条目与计数（R-01-026/AC-02）`);
	}
	// R-01-026/AC-02：分组的条目数与角标该类计数一致；无条目的组显示空态文案（不整组消失）。
	const modalLabel = await badgeLabel(page);
	for (const tone of ["running", "interaction", "completed"]) {
		const listed = await page.locator(`.dap-modal-group[data-tone="${tone}"] .dap-modal-item`).count();
		assert.equal(listed, completedOf(modalLabel, labels[tone]), `「${tone}」组的条目数与角标计数一致（R-01-026/AC-02）`);
		if (listed === 0) {
			assert.equal(await page.locator(`.dap-modal-group[data-tone="${tone}"] .dap-modal-empty`).count(), 1, `空组「${tone}」显示空态文案（R-01-026/AC-02）`);
		}
	}
	await page.keyboard.press("Escape");
	await until("弹窗关闭", async () => ((await page.locator(".dap-modal").isVisible()) ? null : true));

	// ---- AC-06：宿主侧边栏折叠为图标态，角标仍随会话状态推进 ----
	await page.evaluate(() => document.querySelector("[data-shell-overlay]")?.parentElement?.setAttribute("data-sidebar-collapsed", ""));
	await until("宿主侧边栏折叠为图标态", () => hostDrawerCollapsed(page));
	const collapsedLabel = await badgeLabel(page);
	assert.ok(collapsedLabel !== null, "宿主侧边栏折叠后角标入口行仍保留");
	const collapsedBefore = completedOf(collapsedLabel);
	await newSessionWithMessage(page, "e2e:fast 角标静置乙");
	const collapsedAfter = await until("宿主侧边栏折叠态下角标继续推进", async () => {
		const done = completedOf(await badgeLabel(page));
		return done > collapsedBefore ? done : null;
	}, 30_000);
	assert.ok(collapsedAfter > collapsedBefore, `宿主侧边栏折叠态下角标仍随会话完成推进（${collapsedBefore} → ${collapsedAfter}；AC-06）`);
	await page.evaluate(() => document.querySelector("[data-shell-overlay]")?.parentElement?.removeAttribute("data-sidebar-collapsed"));
	await until("宿主侧边栏恢复展开", async () => ((await hostDrawerCollapsed(page)) ? null : true));

	// ---- AC-04：宿主布局缺失（无会话座）时角标仍随会话状态推进且不报错 ----
	// 会话座被摘除后 ensurePane() 取不到座位，窗格不再有落点；用第二个页面持有该形态，
	// 由主页面创立会话驱动状态推进（两页共享同一宿主服务与会话列表推送）。
	const seatlessContext = await browser.newContext();
	const seatlessPage = await seatlessContext.newPage();
	try {
		await openApp(seatlessPage, url);
		const seatsLeft = await seatlessPage.evaluate(() => {
			const pane = document.querySelector("[data-dsh-activity-pane]");
			const host = pane?.parentElement ?? null;
			if (host === null) return -1;
			host.remove();
			return document.querySelectorAll('#root [data-slot="main"]').length;
		});
		assert.equal(seatsLeft, 0, "宿主会话座与其容器已摘除（模拟宿主布局缺失）");
		await until("会话座摘除后窗格随之卸载", async () => ((await seatlessPage.locator("[data-dsh-activity-pane]").count()) === 0 ? true : null));
		const seatlessLabel = await badgeLabel(seatlessPage);
		assert.ok(seatlessLabel !== null, "会话座缺失时角标入口行仍在宿主侧栏");
		const seatlessBefore = completedOf(seatlessLabel);
		await newSessionWithMessage(page, "e2e:fast 角标静置丙");
		const seatlessAfter = await until("无会话座时角标继续推进", async () => {
			const done = completedOf(await badgeLabel(seatlessPage));
			return done > seatlessBefore ? done : null;
		}, 30_000);
		assert.ok(seatlessAfter > seatlessBefore, `宿主布局缺失时角标仍随会话完成推进（${seatlessBefore} → ${seatlessAfter}；AC-04）`);
		const own = consoleErrors.filter((text) => text.includes("dsh-activity-pane"));
		assert.deepEqual(own, [], `宿主布局缺失期间不产生本插件控制台报错（R-01-026/AC-04）：${JSON.stringify(consoleErrors)}`);
	} finally {
		await seatlessContext.close();
	}
}
