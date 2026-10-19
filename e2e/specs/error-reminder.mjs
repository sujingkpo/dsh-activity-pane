// R-01-002/AC-05、R-01-002/AC-06、R-01-002/AC-09、R-01-002/AC-10、R-01-002/AC-12、R-01-002/AC-13、R-01-002/AC-14、R-01-009/AC-12、R-01-009/AC-13
// mock LLM HTTP failure → Agent error turn/end → Host completion registry → SSE → browser error card。
// AC-05 此处覆盖打开会话不解除；切换保持由 core 契约覆盖。AC-13 此处覆盖错误成立，活动后代抑制与新回合覆盖由 core 契约覆盖。

import {
MOCK_ERROR_MESSAGE, RELATIVE_AGE_PATTERN, activateCard, activityAcks, ensureFullDensity, openApp, paneRegions, sendHeroMessage, until
} from "../helpers.mjs";

const TITLE = "e2e:error 跨边界故障探针";

export default async function errorReminder({ page, url, mock, assert }) {
	await openApp(page, url);
	await ensureFullDensity(page);
	await page.evaluate(() => document.body.setAttribute("data-ds-dark-theme", ""));
	await sendHeroMessage(page, TITLE);

	try {
		await until("模型故障形成错误提醒", async () => {
			const regions = await paneRegions(page);
			return regions?.active.includes(TITLE) &&
				regions.active.includes("错误") &&
				regions.active.includes(MOCK_ERROR_MESSAGE)
				? regions
				: null;
		}, 20_000);
	} catch (error) {
		const acks = await activityAcks(page);
		throw new Error(`${error.message}；Host 快照：${JSON.stringify(acks)}`);
	}

	assert.ok(mock.scenarioLog.includes("error"), "请求实际命中 error mock 剧本");
	const errorBadge = await page.evaluate(() => {
		const count = document.querySelector("[data-dsh-activity-pane] .dap-count");
		if (!count) return null;
		return {
			text: count.textContent.trim(),
			tone: count.getAttribute("data-tone"),
			background: getComputedStyle(count).backgroundColor,
			animation: getComputedStyle(count).animationName,
		};
	});
	assert.ok(errorBadge && /^\d+\/\d+$/.test(errorBadge.text), "错误提醒时列头保持 n/m 计数（R-01-001/AC-04～AC-06）");
	assert.deepEqual(
		{ tone: errorBadge.tone, background: errorBadge.background, animation: errorBadge.animation },
		{ tone: "error", background: "rgba(40, 29, 31, 0.97)", animation: "dap-await-pulse" },
		"错误提醒优先驱动红色数量徽标并脉冲（R-01-002/AC-06）",
	);
	const pane = page.locator("[data-dsh-activity-pane]");
	const errorCard = pane.locator(`[role="button"]`).filter({ hasText: TITLE }).first();
	// R-01-002/AC-10（C-102）：错误提醒卡与完成提醒卡共用同一枚「移入历史」按钮。
	const errorDismiss = pane.getByRole("button", { name: "移入历史" });
	assert.equal(await errorDismiss.count(), 1, "错误提醒卡提供「移入历史」按钮（R-01-002/AC-10）");
	assert.equal(await errorDismiss.isVisible(), true, "错误提醒卡「移入历史」按钮可见（R-01-002/AC-10）");
	const errorElapsed = await until("错误提醒统计行保留上一轮耗时", () =>
		errorCard.locator(".dap-token-stats .dap-token-time").textContent().then((text) => (text ?? "").trim() || null),
	);
	assert.match(errorElapsed, /^(?:\d+s|\d+m\d+s|\d+h\d+m\d+s)$/, "错误提醒统计行最右侧显示固定上一轮耗时（R-01-009/AC-12）");
	// R-01-009/AC-13：错误等待卡沿用列表投影中的可用 token 字段，缺失速率不伪造。
	const errorStats = await until("错误提醒统计行状态就绪", () =>
		errorCard.locator(".dap-token-stats").evaluate((stats) => ({
			hidden: stats.hidden,
			main: stats.querySelector(".dap-token-main")?.textContent.trim() ?? "",
			time: stats.querySelector(".dap-token-time")?.textContent.trim() ?? "",
		})).catch(() => null),
	);
	assert.equal(errorStats.hidden, false, "错误提醒存在可用 token 字段时显示统计行（R-01-009/AC-13）");
	assert.match(errorStats.main, /输入/, "错误提醒统计行保留计费输入 token（R-01-009/AC-13）");
	assert.match(errorStats.main, /输出/, "错误提醒统计行保留输出 token（R-01-009/AC-13）");
	assert.equal(errorStats.time, errorElapsed, "错误提醒耗时与 token 统计字段位于同一行（R-01-009/AC-12、AC-13）");
	assert.equal(await errorCard.locator(".dap-await-head .dap-token-time").count(), 0, "错误提醒胶囊同行不重复显示耗时（R-01-009/AC-12）");
	// R-01-002/AC-14：错误提醒胶囊右侧显示进入错误状态的相对时间。
	const errorAge = await until("错误提醒显示进入状态相对时间", () =>
		errorCard.locator(".dap-await-age").textContent().then((text) => (text ?? "").trim() || null),
	);
	assert.match(errorAge, RELATIVE_AGE_PATTERN, "错误提醒胶囊右侧显示相对时间分级文案（R-01-002/AC-14）");

	await activateCard(page, TITLE);
	await until("打开会话不解除错误提醒", async () => {
		const regions = await paneRegions(page);
		return regions?.active.includes(TITLE) && regions.active.includes(MOCK_ERROR_MESSAGE) ? regions : null;
	});

	await openApp(page, url);

	await ensureFullDensity(page);
	await until("刷新后恢复错误提醒", async () => {
		const regions = await paneRegions(page);
		return regions?.active.includes(TITLE) &&
			regions.active.includes("错误") &&
			regions.active.includes(MOCK_ERROR_MESSAGE)
			? regions
			: null;
	}, 20_000);
	const refreshedErrorElapsed = await until("刷新后恢复错误提醒耗时", () =>
		errorCard.locator(".dap-token-stats .dap-token-time").textContent().then((text) => (text ?? "").trim() || null),
	);
	assert.equal(refreshedErrorElapsed, errorElapsed, "错误提醒刷新后仍保留同一轮耗时（R-01-009/AC-12）");
	const refreshedErrorStats = await until("刷新后恢复错误提醒统计行状态", () =>
		errorCard.locator(".dap-token-stats").evaluate((stats) => ({
			hidden: stats.hidden,
			main: stats.querySelector(".dap-token-main")?.textContent.trim() ?? "",
			time: stats.querySelector(".dap-token-time")?.textContent.trim() ?? "",
		})).catch(() => null),
	);
	assert.equal(refreshedErrorStats.hidden, false, "错误提醒刷新后仍显示可用 token 统计行（R-01-009/AC-13）");
	assert.match(refreshedErrorStats.main, /输入/, "错误提醒刷新后恢复计费输入 token（R-01-009/AC-13）");
	assert.match(refreshedErrorStats.main, /输出/, "错误提醒刷新后恢复输出 token（R-01-009/AC-13）");
	assert.equal(refreshedErrorStats.time, refreshedErrorElapsed, "错误提醒刷新后耗时仍位于 token 统计行（R-01-009/AC-12、AC-13）");
	assert.equal(await errorCard.locator(".dap-await-head .dap-token-time").count(), 0, "错误提醒刷新后胶囊同行不重复显示耗时（R-01-009/AC-12）");
	// R-01-002/AC-14：刷新后状态年龄由宿主持久登记恢复，仍显示相对时间。
	const refreshedErrorAge = await until("刷新后恢复进入状态相对时间", () =>
		errorCard.locator(".dap-await-age").textContent().then((text) => (text ?? "").trim() || null),
	);
	assert.match(refreshedErrorAge, RELATIVE_AGE_PATTERN, "错误提醒刷新后仍显示状态年龄（R-01-002/AC-14）");

	// R-01-002/AC-05、AC-10、AC-13（C-102）：错误提醒经确认解除——点「移入历史」后卡片迁入
	// 最近历史区、活动区不再有它；刷新后仍不在活动区（ackedAt 已持久化，且 lastTurnEndKind
	// 未被清除，故不是靠抹掉持久事实"骗过"判定）。
	await pane.getByRole("button", { name: "移入历史" }).first().click();
	// 同时要求「离开活动区」与「落进最近历史区」：只断言前者的话，acks SSE 快照尚未到达、
	// 卡片被首次渲染吞掉的瞬间也会成立（审核指出的假通过）。
	await until("错误提醒经确认后迁入最近历史区", async () => {
		const regions = await paneRegions(page);
		return regions !== null && !regions.active.includes(TITLE) && regions.recent.includes(TITLE) ? regions : null;
	}, 20_000);
	const dismissedAcks = await activityAcks(page);
	const dismissedRecord = Object.values(dismissedAcks ?? {}).find(
		(record) => record?.lastTurnEndKind === "error" && Number.isFinite(record?.ackedAt),
	);
	assert.ok(dismissedRecord, "确认后宿主登记仍保留错误回合的结束原因（C-102：不抹除持久事实）");
	await openApp(page, url);
	await ensureFullDensity(page);
	const afterReload = await paneRegions(page);
	assert.ok(
		afterReload !== null && !afterReload.active.includes(TITLE) && afterReload.recent.includes(TITLE),
		"刷新后已确认的错误提醒仍在最近历史区、不回到活动区（R-01-002/AC-05、AC-13）",
	);
}
