// R-01-026/AC-08（宿主侧栏角标「需要交互」持续强调）：只要角标读数里「需要交互」的计数
// 大于 0，glyph 就持续闪；该计数归零（用户处理完交互）后停止。
//
// 背景（东家 2026-10-15 需求）：此前「需要交互」只有一次性强调——计数增加时播
// dap-badge-hit-alert（0.8s × 4）就收口，仍未处理的交互随后重新静默下去。待处理项要求
// 用户立刻行动，故改为常驻：计数 > 0 期间挂 data-badge-awaiting，由 CSS 走无界动画。
//
// 断言口径只看用户可观察呈现（计算样式与动画是否真的在走），不看实现细节：
//   1) 计数为 0 时：无 data-badge-awaiting、animationName 为 none；
//   2) 计数 > 0 时：属性就位、animationName 为 dap-badge-await-pulse、iterationCount
//      infinite、且 currentTime 在采样窗内确实推进（证明动画在跑而非仅声明）；
//   3) 交互被处理、计数归零后：属性摘除、animationName 回到 none。
//   4) prefers-reduced-motion 下：动效关闭但属性与金色状态色保留（状态不随动效消失）。
//
// 常闪是「无界动画」，会撞上仓库既有的「不得用 infinite」纪律（R-01-005/AC-01 的
// 「打开中」提示即因无界闪烁被否决）。二者的区别是承担的状态不同：那里是「正在尝试打开」
// 这类瞬时过程，无界即故障；这里是「有待你处理的交互」这类持续状态，无界正是要求。
// 因此本 spec 只针对该 glyph，不放松对 dap-opening 的限次断言。

import { ensureFullDensity, newSessionWithMessage, openApp, until } from "../helpers.mjs";

/** 「需要交互」计数（角标 aria-label 里读取）；取不到返回 -1。 */
function interactionCount(page) {
	return page.evaluate(() => {
		const label = document.querySelector(".dap-badge-glyph")?.getAttribute("aria-label") ?? "";
		const match = /需要交互\s*(\d+)/.exec(label);
		return match === null ? -1 : Number(match[1]);
	});
}

/** 角标常闪快照：属性、glyph 与其光环伪元素的计算动画。 */
function awaitingSnapshot(page) {
	return page.evaluate(() => {
		const glyph = document.querySelector(".dap-badge-glyph");
		if (glyph === null) return null;
		const glyphStyle = getComputedStyle(glyph);
		const haloStyle = getComputedStyle(glyph, "::after");
		const animation = glyph.getAnimations()[0] ?? null;
		return {
			awaiting: glyph.getAttribute("data-badge-awaiting"),
			name: glyphStyle.animationName,
			duration: glyphStyle.animationDuration,
			iterations: glyphStyle.animationIterationCount,
			color: glyphStyle.color,
			haloName: haloStyle.animationName,
			haloIterations: haloStyle.animationIterationCount,
			currentTime: animation?.currentTime ?? null,
		};
	});
}

export default async function badgeInteractionPulse({ page, url, assert }) {
	await page.setViewportSize({ width: 1280, height: 760 });
	await openApp(page, url);
	await ensureFullDensity(page);
	await until("角标入口行就位", async () =>
		((await page.locator(".dap-badge-glyph").count()) > 0 ? true : null));

	// ---- 计数为 0：不常闪（否则「一直在闪」就退化成与状态无关的噪声） ----
	await until("「需要交互」计数为 0", async () => ((await interactionCount(page)) === 0 ? true : null), 30_000);
	const idle = await awaitingSnapshot(page);
	assert.equal(idle.awaiting, null, "无待处理交互时角标不带持续强调属性（R-01-026/AC-08）");
	assert.equal(idle.name, "none", `无待处理交互时角标不播持续强调动画（实测 ${idle.name}；R-01-026/AC-08）`);

	// ---- 回合转入待回复 → 计数 > 0 → 持续强调就位 ----
	await newSessionWithMessage(page, "e2e:ask 角标常闪探针");
	await until("「需要交互」计数增长", async () => ((await interactionCount(page)) > 0 ? true : null), 30_000);
	const armed = await awaitingSnapshot(page);
	assert.equal(String(armed.awaiting), "true", "存在待处理交互时角标挂上持续强调开关（R-01-026/AC-08）");
	// 计数增长的那一瞬，一次性「新增」强调（dap-badge-hit-alert，0.8s × 4 ≈ 3.2s）正在播，
	// 它比常闪权重高、按设计先接管；常闪须在其收口后接手并一直持续——这正是本 spec 要钉的
	// 交接口，故不在这里断言当帧动画名（当帧是 alert，见 check.mjs 对两者同现的既有语义）。
	const steady = await until("一次性新增强调收口后常闪接手", async () => {
		const value = await awaitingSnapshot(page);
		return value.name === "dap-badge-await-pulse" ? value : null;
	}, 15_000);
	assert.equal(steady.name, "dap-badge-await-pulse", `角标常闪走 dap-badge-await-pulse（实测 ${steady.name}；R-01-026/AC-08）`);
	assert.equal(steady.duration, "1.6s", `角标常闪周期为 1.6s（实测 ${steady.duration}；R-01-026/AC-08）`);
	assert.equal(steady.iterations, "infinite", `角标常闪为无界动画（实测 ${steady.iterations}；R-01-026/AC-08）`);
	assert.equal(steady.haloName, "dap-badge-halo", `角标常闪带动外扩环（实测 ${steady.haloName}；R-01-026/AC-08）`);
	assert.equal(steady.haloIterations, "infinite", `外扩环同为无界动画（实测 ${steady.haloIterations}；R-01-026/AC-08）`);

	// 常闪必须真的持续：跨过若干个 1.6s 周期后仍在跑（一次性动画做不到这一点），
	// 且动画仍处于运行态——这是「一直闪直到处理完成」与「闪一轮就停」的分水岭。
	await page.waitForTimeout(4_000);
	const still = await awaitingSnapshot(page);
	assert.equal(still.name, "dap-badge-await-pulse", `4s 后（跨过 ≥2 个周期）角标仍在常闪（实测 ${still.name}；R-01-026/AC-08）`);
	assert.equal(String(still.awaiting), "true", "4s 后持续强调开关仍在位（R-01-026/AC-08）");
	assert.ok(
		((await interactionCount(page)) > 0),
		"4s 后「需要交互」计数仍 > 0——常闪与该状态同步，未自行收口（R-01-026/AC-08）",
	);

	// 声明了 infinite 不等于真的在跑：采样两帧证明 currentTime 确实推进（动画未被
	// reduced-motion 或其它规则掐掉，也证明这确实是活的常闪而非静止帧）。
	const t0 = await page.evaluate(() => document.querySelector(".dap-badge-glyph")?.getAnimations()[0]?.currentTime ?? null);
	assert.ok(Number.isFinite(t0), `持续强调动画可被计时（实测 currentTime=${t0}）`);
	await page.waitForTimeout(400);
	const t1 = await page.evaluate(() => document.querySelector(".dap-badge-glyph")?.getAnimations()[0]?.currentTime ?? null);
	assert.ok(Number.isFinite(t1) && t1 > t0, `持续强调动画在采样窗内确实推进（${t0}ms → ${t1}ms；R-01-026/AC-08）`);

	// ---- 处理完该交互 → 计数归零 → 常闪停止 ----
	// 回答宿主提问（与 auto-update spec 同一交互路径），使「需要交互」计数回落。
	await until("待回复提问呈现于主区", async () =>
		((await page.getByText("确认继续执行").count()) > 0 ? true : null), 20_000);
	await page.getByText("确认继续执行").click();
	await page.getByRole("button", { name: "Submit", exact: true }).click();
	await until("「需要交互」计数归零", async () => ((await interactionCount(page)) === 0 ? true : null), 30_000);
	// 归零瞬间可能正有一次性的「新增」强调在播（回答后回合继续，运行中/已完成计数随之变化），
	// 故等待它收口，验证的是「常闪确已交还、不会再被续上」而非某一帧恰好是 none。
	const released = await until("交互处理完成后常闪停止", async () => {
		const value = await awaitingSnapshot(page);
		return value.awaiting === null && value.name === "none" ? value : null;
	}, 15_000);
	assert.equal(released.awaiting, null, "交互处理完成后角标摘除持续强调属性（R-01-026/AC-08）");
	assert.equal(released.name, "none", `交互处理完成后角标停止常闪（实测 ${released.name}；R-01-026/AC-08）`);
	// 再跨一个 1.6s 周期复检：确认不是「恰好停在 none」，而是常闪确实不再续上。
	await page.waitForTimeout(2_000);
	const settled = await awaitingSnapshot(page);
	assert.equal(settled.awaiting, null, "2s 后持续强调属性仍未回来（计数归零即停，R-01-026/AC-08）");
	assert.equal(settled.name, "none", `2s 后角标仍未恢复常闪（实测 ${settled.name}；R-01-026/AC-08）`);

	// ---- 边界：prefers-reduced-motion 下只关动效、保留状态色 ----
	// 口径与既有 dap-await-pulse 一致：减弱动效的用户仍须看得见「有待处理交互」这个状态，
	// 只是不再用动画表达。故属性继续在位、动画被关掉、颜色仍为金色。
	await page.emulateMedia({ reducedMotion: "reduce" });
	await newSessionWithMessage(page, "e2e:ask 常闪减弱动效探针");
	await until("「需要交互」计数再次增长", async () => ((await interactionCount(page)) > 0 ? true : null), 30_000);
	// 等一次性「新增」强调（同样被 reduced-motion 关掉）不影响判据，直接取稳态快照。
	await page.waitForTimeout(600);
	const reduced = await awaitingSnapshot(page);
	assert.equal(String(reduced.awaiting), "true", "reduced-motion 下持续强调属性仍在位（状态不随动效消失；R-01-026/AC-08）");
	assert.equal(reduced.name, "none", `reduced-motion 下角标不播常闪动画（实测 ${reduced.name}；R-01-026/AC-08）`);
	assert.equal(reduced.haloName, "none", `reduced-motion 下外扩环也被关掉（实测 ${reduced.haloName}；R-01-026/AC-08）`);
	// 金色状态色必须留下：动效可以关，「有待处理交互」这个状态不能连颜色一起消失。
	assert.equal(
		reduced.color,
		"rgb(255, 202, 74)",
		`reduced-motion 下角标仍为金色状态色（实测 ${reduced.color}；R-01-026/AC-08）`,
	);
	assert.ok(
		((await interactionCount(page)) > 0),
		"reduced-motion 下「需要交互」计数仍 > 0——属性表达状态、动画只是修饰（R-01-026/AC-08）",
	);
}
