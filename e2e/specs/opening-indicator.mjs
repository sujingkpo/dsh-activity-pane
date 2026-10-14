// R-01-005/AC-01、R-01-005/AC-02（打开中提示的时序纪律）
// 缺陷回归（东家 2026-10-14 反馈「右侧活动会话点击后一直闪烁，点击其他的会话，
// 点击过的仍在闪烁」）：卡片「打开中」提示必须自行收口，不得无界闪烁。三条可观测契约：
//   ① 提示动画为限次（computed animation-iteration-count 非 infinite）；
//   ② 限次窗口（0.9s × 3 = 2.7s）过后卡片上不存在仍在运行的动画；
//   ③ 属性滞留时由渲染期单向执法自愈（下一次渲染即摘除）。
// 修复前的实测对照：HEAD 版为 animation ... infinite，采样时 computed 值为
// "infinite" 且 3.4s 后仍有 1 个活动动画（opacity 0.739，即正在闪）——断言①在
// 修复前必失败，故本 spec 能真正锁住该缺陷而非空转。

import { ensureFullDensity, newSessionWithMessage, openApp, until } from "../helpers.mjs";

/** 打开中提示的动画实况：computed 迭代次数、动画名与仍在运行的动画个数。 */
function openingAnim(page, selector = ".dap-card") {
	return page.evaluate((sel) => {
		const card = document.querySelector(`[data-dsh-activity-pane] ${sel}`);
		if (card === null) return null;
		const style = getComputedStyle(card);
		return {
			hasAttr: card.hasAttribute("data-opening"),
			name: style.animationName,
			iteration: style.animationIterationCount,
			duration: style.animationDuration,
			running: card.getAnimations().length,
		};
	}, selector);
}

export default async function openingIndicator({ page, url, assert }) {
	await page.setViewportSize({ width: 1280, height: 760 });
	await openApp(page, url);
	await ensureFullDensity(page);
	for (const title of ["e2e:fast 提示甲", "e2e:fast 提示乙"]) {
		await newSessionWithMessage(page, title);
	}
	await until("两张卡片就位", async () => {
		const count = await page.locator("[data-dsh-activity-pane] .dap-card").count();
		return count >= 2 ? true : null;
	}, 30_000);

	// 契约①：手工挂上「打开中」属性后，动画必须是限次的——这是缺陷的直接回归点
	// （修复前该值为 infinite，卡片会一直闪到属性被摘除为止）。
	const forced = await page.evaluate(() => {
		const card = document.querySelector("[data-dsh-activity-pane] .dap-card");
		card.setAttribute("data-opening", "");
		const style = getComputedStyle(card);
		window.__openingCard = card;
		return { name: style.animationName, iteration: style.animationIterationCount, duration: style.animationDuration };
	});
	assert.equal(forced.name, "dap-opening", "「打开中」提示走专用 dap-opening 动画");
	assert.equal(forced.duration, "0.9s", "「打开中」提示单次时长 0.9s");
	assert.notEqual(forced.iteration, "infinite", `「打开中」提示不得为无限动画（实测 iteration=${forced.iteration}）`);
	assert.equal(forced.iteration, "3", "「打开中」提示播放固定 3 次后自行收口（与打开重试链时间窗对齐）");

	// 契约②：限次窗口过后不得再有动画在跑——无界闪烁的可观测判据。
	await page.waitForTimeout(3_400);
	const settled = await page.evaluate(() => {
		const card = window.__openingCard;
		return { running: card.getAnimations().length, iteration: getComputedStyle(card).animationIterationCount };
	});
	assert.equal(settled.running, 0, `限次窗口（约 2.7s）过后卡片上不得有仍在运行的动画（实测 ${settled.running} 个）`);

	// 契约③：属性滞留由渲染期单向执法自愈——下一次渲染即摘除，不依赖动画结束回调。
	// 这是「一次渲染即可自愈」的最小可判定形式：滞留属性必须被渲染管线清掉。
	const healed = await page.evaluate(async () => {
		const card = window.__openingCard;
		card.setAttribute("data-opening", "");
		const planted = card.hasAttribute("data-opening");
		// 经既有 UI 触发一次渲染（切换显示档位走同一渲染管线）。
		document.querySelector("[data-dsh-activity-pane] .dap-density")?.click();
		await new Promise((resolve) => setTimeout(resolve, 500));
		return { planted, afterRender: card.hasAttribute("data-opening") };
	});
	assert.equal(healed.planted, true, "前置：人为制造的滞留属性确实挂上");
	assert.equal(healed.afterRender, false, "属性滞留时下一次渲染即自愈摘除，不残留无界闪烁（渲染期单向执法）");

	// 常规路径（左列真实点击）：跳转后打开中提示随收链摘除，不留残留。
	await page.evaluate(() => {
		const cards = [...document.querySelectorAll("[data-dsh-activity-pane] .dap-card")];
		cards.find((card) => !card.hasAttribute("data-current"))?.click();
	});
	await until("跳转后打开中提示收口", async () => {
		const stuck = await page.evaluate(() => {
			const pane = document.querySelector("[data-dsh-activity-pane]");
			if (pane === null) return 0;
			return [...pane.querySelectorAll(".dap-card[data-opening]")].length;
		});
		return stuck === 0 ? true : null;
	}, 15_000);
	assert.equal((await openingAnim(page))?.hasAttr, false, "真实点击路径下打开中提示随收链摘除，不残留");
}
