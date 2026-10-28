// R-01-026/AC-09、R-01-026/AC-10、R-01-026/AC-11、R-01-026/AC-12
// 已完成会话的已读/未读标识与「已读即停闪」：
//   1) 未读完成提醒——窗格「已完成」分区里的卡片带 data-unread，状态点实心绿色、
//      胶囊文案标「已完成（未读）」、末行以 dap-pulse 1.2s 无限脉冲；
//   2) 已读——点开该会话即把已读游标推进到条目进入时刻，卡片转入已读呈现：state 点空心、
//      卡片弱化、末行动画停止（跨 ≥2 个脉冲周期复检，排除「恰好停在 none」）；
//   3) 侧栏角标弹窗的「已完成」组同样带未读标识（状态文本「未读 / 已读」+ 行 data-unread），
//      运行中/需要交互两组不带；从弹窗点进会话与点窗格卡片是同一次「我看过了」，
//      两条路径写同一份已读游标；
//   4) 侧栏 glyph 按未读完成数给出提示（data-badge-unread → 完成点 2.4s 慢呼吸），全部已读即摘、动画停止。
// 判据全部取自用户可观察呈现（计算样式、属性、文案），不依赖实现内部结构。
// 找卡一律用 data-wait / data-unread 结构选择器：宿主会用 LLM 回复改写会话标题。

import { ensureFullDensity, newSessionWithMessage, openApp, sendHeroMessage, until } from "../helpers.mjs";

// 「已完成」分区内的完成提醒卡（等待组按进入时刻新→旧排序，首张即最新完成项）。
const DONE_CARD = '.dap-done .dap-card[data-wait="done"]';

/** 打开侧栏角标弹窗（宿主「活动会话」入口行上的 glyph 承载点击）。 */
async function openBadgeModal(page) {
	await page.locator(".dap-badge-glyph").locator("xpath=ancestor::button[1]").click();
	await until("角标弹窗打开", async () => ((await page.locator(".dap-modal").isVisible()) ? true : null));
}

/** 关闭侧栏角标弹窗。 */
async function closeBadgeModal(page) {
	await page.keyboard.press("Escape");
	await until("角标弹窗关闭", async () => ((await page.locator(".dap-modal").isVisible()) ? null : true));
}

/** 窗格「已完成」分区首张卡片的已读/未读相关呈现快照。 */
function doneCardSnapshot(page, index = 0) {
	return page.evaluate((idx) => {
		const card = [...document.querySelectorAll('.dap-done .dap-card[data-wait="done"]')][idx];
		if (!card) return null;
		const dot = card.querySelector(".dap-dot");
		const foot = card.querySelector(".dap-foot :is(.dap-capsule, .dap-note)");
		const capsule = card.querySelector(".dap-capsule-text");
		return {
			// 属性存在即未读（toggleAttribute 语义，属性值为空串）；已读则整条属性不存在。
			unread: card.hasAttribute("data-unread"),
			dotBackground: dot === null ? null : getComputedStyle(dot).backgroundColor,
			dotBorder: dot === null ? null : getComputedStyle(dot).borderTopColor,
			opacity: Number(getComputedStyle(card).opacity),
			animationName: foot === null ? null : getComputedStyle(foot).animationName,
			animationIterations: foot === null ? null : getComputedStyle(foot).animationIterationCount,
			capsuleText: capsule === null ? null : capsule.textContent,
			// 左缘色条由 ::before 承载（卡片边框会被等待卡面/当前会话卡的整边着色顶掉）。
			leftBar: getComputedStyle(card, "::before").backgroundColor,
			titleWeight: card.querySelector(".dap-title") === null ? null : getComputedStyle(card.querySelector(".dap-title")).fontWeight,
		};
	}, index);
}

/** 角标 glyph 的未读提示（完成点慢呼吸）与无障碍读数。 */
function glyphSnapshot(page) {
	return page.evaluate(() => {
		const glyph = document.querySelector(".dap-badge-glyph");
		if (glyph === null) return null;
		const completedDot = glyph.querySelector('i[data-tone="completed"]');
		const completedStyle = completedDot === null ? null : getComputedStyle(completedDot);
		return {
			unread: glyph.getAttribute("data-badge-unread"),
		// 未读提示不再是外圈边框环，而是完成色点自身的慢呼吸（R-01-026/AC-17）。
			animationName: completedStyle === null ? null : completedStyle.animationName,
			label: glyph.getAttribute("aria-label") ?? "",
			// 「已完成」点的点亮判据是未读数（R-01-026/AC-16）：全部读过即与 0 计数同款置灰。
			completedOn: completedDot === null ? null : completedDot.getAttribute("data-on"),
		};
	});
}

/** 弹窗「已完成」组每条条目的已读/未读快照（行属性 + 状态文本 + 状态点底色）。 */
function modalCompletedItems(page) {
	return page.evaluate(() =>
		[...document.querySelectorAll('.dap-modal-group[data-tone="completed"] .dap-modal-item')].map((item) => ({
			unread: item.hasAttribute("data-unread"),
			stateText: item.querySelector(".dap-modal-item-state")?.textContent ?? null,
			stateHidden: item.querySelector(".dap-modal-item-state")?.hidden ?? null,
			dotBackground: getComputedStyle(item.querySelector(".dap-modal-dot")).backgroundColor,
			title: item.querySelector(".dap-modal-item-title")?.textContent ?? "",
		})),
	);
}

export default async function doneReadState({ page, url, assert }) {
	await page.setViewportSize({ width: 1280, height: 760 });
	await openApp(page, url);
	await ensureFullDensity(page);

	// ---- 未读：完成提醒进入「已完成」分区即为未读呈现 ----
	await sendHeroMessage(page, "e2e:fast 已读未读探针甲");
	await until("完成卡落入「已完成」分区", async () =>
		((await page.locator(DONE_CARD).count()) > 0 ? true : null), 30_000);
	const unread = await until("完成卡呈未读呈现", async () => {
		const snapshot = await doneCardSnapshot(page);
		return snapshot?.unread === true ? snapshot : null;
	}, 10_000);
	assert.equal(unread.unread, true, "新完成提醒在窗格「已完成」分区为未读（R-01-026/AC-09）");
	assert.equal(unread.dotBackground, "rgb(63, 191, 127)", `未读状态点为实心状态色（实测 ${unread.dotBackground}；R-01-026/AC-09、AC-12）`);
	assert.equal(unread.capsuleText, "已完成（未读）", `未读完成提醒的胶囊文案标注未读（实测 ${unread.capsuleText}；R-01-026/AC-09）`);
	assert.equal(unread.animationName, "dap-pulse", `未读完成提醒末行脉冲（实测 ${unread.animationName}；R-01-026/AC-09）`);
	assert.equal(unread.animationIterations, "infinite", "未读完成提醒末行为无界脉冲（R-01-026/AC-09）");
	assert.equal(unread.leftBar, "rgb(63, 191, 127)", `未读条目带左缘绿色条（实测 ${unread.leftBar}；R-01-026/AC-09、AC-12）`);

	// ---- 已读：点开该会话即推进已读游标，末行停止脉冲 ----
	await page.locator(DONE_CARD).first().click();
	const read = await until("完成卡转入已读呈现", async () => {
		const snapshot = await doneCardSnapshot(page);
		return snapshot?.unread === false ? snapshot : null;
	}, 10_000);
	assert.equal(read.unread, false, "点开会话后完成提醒转入已读（R-01-026/AC-11、AC-12）");
	assert.equal(read.capsuleText, "已完成", `已读后胶囊回落为「已完成」（实测 ${read.capsuleText}；R-01-026/AC-09）`);
	assert.equal(read.dotBackground, "rgba(0, 0, 0, 0)", `已读状态点为空心（实测 ${read.dotBackground}；R-01-026/AC-09、AC-12）`);
	assert.equal(read.leftBar, "rgba(0, 0, 0, 0)", `已读条目不再带左缘色条（实测 ${read.leftBar}；R-01-026/AC-09、AC-12）`);
	assert.equal(read.animationName, "none", `已读后末行停止脉冲（实测 ${read.animationName}；R-01-026/AC-11）`);
	assert.ok(read.opacity < unread.opacity, `已读条目整体弱化于未读（实测 ${unread.opacity} → ${read.opacity}；R-01-026/AC-11）`);
	assert.ok(Number(read.titleWeight) >= 400 && Number(read.titleWeight) < Number(unread.titleWeight), "已读条目标题回落为常规字重（R-01-026/AC-09）");
	// 跨 ≥2 个 1.2s 脉冲周期复检：已读不是「恰好停在 none」，而是确实不再续上。
	await page.waitForTimeout(3_000);
	const stillRead = await doneCardSnapshot(page);
	assert.equal(stillRead.animationName, "none", `3s 后末行仍未恢复脉冲（实测 ${stillRead.animationName}；R-01-026/AC-11）`);
	assert.equal(stillRead.unread, false, "3s 后条目仍为已读（R-01-026/AC-11）");

	// 再完成一个会话：此后「已完成」组同时存在已读与未读条目，弹窗的两态标识都能被看到。
	await newSessionWithMessage(page, "e2e:fast 已读未读探针乙");
	await until("第二张完成卡落入「已完成」分区", async () =>
		((await page.locator(DONE_CARD).count()) >= 2 ? true : null), 30_000);

	// ---- 未知/未读语义不得外溢：阻塞等待卡不带已读属性、照旧脉冲 ----
	await newSessionWithMessage(page, "e2e:ask 已读未读阻塞探针");
	const blocked = await until("阻塞等待卡出现并脉冲", async () => {
		const snapshot = await page.evaluate(() => {
			const card = document.querySelector('.dap-card[data-kind="awaiting"][data-wait="blocked"]');
			if (card === null) return null;
			const foot = card.querySelector(".dap-foot :is(.dap-capsule, .dap-note)");
			return {
				unread: card.hasAttribute("data-unread"),
				animationName: foot === null ? null : getComputedStyle(foot).animationName,
			};
		});
		return snapshot?.animationName === "dap-pulse" ? snapshot : null;
	}, 30_000);
	assert.equal(blocked.unread, false, "阻塞等待卡不带已读/未读属性（R-01-026/AC-12）");
	assert.equal(blocked.animationName, "dap-pulse", "阻塞等待卡照旧脉冲，不受已读门控影响（R-01-026/AC-11、AC-12）");

	// ---- 侧栏角标弹窗：「已完成」组带未读标识，其余组不带 ----
	await openBadgeModal(page);
	const modalItems = await modalCompletedItems(page);
	assert.ok(modalItems.length > 0, "弹窗「已完成」组列出条目（R-01-026/AC-09）");
	assert.ok(modalItems.some((item) => item.unread === true), `仍有未读完成提醒时弹窗条目标「未读」（实测 ${JSON.stringify(modalItems)}；R-01-026/AC-09）`);
	assert.ok(modalItems.some((item) => item.unread === false), "已读完成的条目在弹窗中标「已读」（R-01-026/AC-09）");
	for (const item of modalItems) {
		assert.equal(item.stateText, item.unread ? "未读" : "已读", `弹窗状态文本与条目已读态一致（实测 ${item.stateText}；R-01-026/AC-09）`);
		assert.equal(item.stateHidden, false, "「已完成」组的状态文本常显（R-01-026/AC-09）");
	}
	const otherGroups = await page.evaluate(() =>
		["running", "interaction"].flatMap((tone) =>
			[...document.querySelectorAll(`.dap-modal-group[data-tone="${tone}"] .dap-modal-item`)].map((item) => ({
				tone,
				unread: item.hasAttribute("data-unread"),
				stateHidden: item.querySelector(".dap-modal-item-state")?.hidden ?? null,
			}))),
	);
	assert.ok(otherGroups.length > 0, "运行中/需要交互组在探针运行期间存在条目");
	for (const item of otherGroups) {
		assert.equal(item.unread, false, `${item.tone} 组条目不参与已读/未读（R-01-026/AC-12）`);
		assert.equal(item.stateHidden, true, `${item.tone} 组条目的状态文本整段隐藏（R-01-026/AC-12）`);
	}

	// 从弹窗点进未读条目同样是「我看过了」：关掉弹窗重开后该条目转为已读。
	const beforeClick = await glyphSnapshot(page);
	assert.equal(beforeClick.unread, "true", "仍有未读完成提醒时角标挂未读提示（R-01-026/AC-10、AC-12）");
	assert.match(beforeClick.label, /（\d+ 个未读）/, "角标读数含未读完成数（R-01-026/AC-10）");
	assert.equal(beforeClick.animationName, "dap-badge-done-breathe", `未读时完成点自身以慢呼吸呈现未读提示（实测 ${beforeClick.animationName}；R-01-026/AC-10、AC-17）`);
	assert.match(beforeClick.label, /已完成 \d+（\d+ 个未读）/, `角标无障碍名称给出未读数（实测 ${beforeClick.label}；R-01-026/AC-10）`);
	await page.locator('.dap-modal-group[data-tone="completed"] .dap-modal-item[data-unread]').first().click();
	await until("弹窗条目激活后关闭弹窗", async () => ((await page.locator(".dap-modal").isVisible()) ? null : true));
	await openBadgeModal(page);
	const afterClick = await modalCompletedItems(page);
	assert.ok(!afterClick.some((item) => item.unread === true), `从弹窗点入的条目已转为已读（实测 ${JSON.stringify(afterClick)}；R-01-026/AC-11、AC-12）`);
	await closeBadgeModal(page);

	// ---- 一键已读（R-01-026/AC-13）：两处段头各一枚入口，无未读项时不呈现 ----
	// 都读完了：两处入口都应当隐藏（没有可标记的对象时不摆一个点了没反应的按钮）。
	await openBadgeModal(page);
	const modalReadAllIdle = await page.evaluate(() => {
		const button = document.querySelector('.dap-modal-group[data-tone="completed"] .dap-read-all');
		return button === null ? null : { hidden: button.hidden, text: button.textContent };
	});
	assert.ok(modalReadAllIdle !== null, "弹窗「已完成」组段头常驻一枚「全部已读」入口（R-01-026/AC-13）");
	assert.equal(modalReadAllIdle.hidden, true, "没有未读完成提醒时弹窗入口隐藏（R-01-026/AC-13）");
	await closeBadgeModal(page);
	const paneReadAllIdle = await page.evaluate(() => {
		const button = document.querySelector(".dap-done-head .dap-read-all");
		return button === null ? null : { hidden: button.hidden, aria: button.getAttribute("aria-label") };
	});
	assert.ok(paneReadAllIdle !== null, "窗格「已完成」分区段头常驻一枚「全部已读」入口（R-01-026/AC-13）");
	assert.equal(paneReadAllIdle.hidden, true, "没有未读完成提醒时窗格入口隐藏（R-01-026/AC-13）");

	// 再完成一个会话：重新出现未读项，两处入口显示且可访问名给出待标记条数。
	await newSessionWithMessage(page, "e2e:fast 已读未读探针丙");
	await until("第三张完成卡落入「已完成」分区", async () =>
		((await page.locator(DONE_CARD).count()) >= 3 ? true : null), 30_000);
	const armed = await until("窗格一键已读入口就位", async () => {
		const button = await page.evaluate(() => {
			const el = document.querySelector(".dap-done-head .dap-read-all");
			return el === null ? null : { hidden: el.hidden, aria: el.getAttribute("aria-label") ?? "" };
		});
		return button !== null && button.hidden === false ? button : null;
	}, 15_000);
	assert.match(armed.aria, /全部标记为已读（\d+）/, `窗格入口的可访问名称给出待标记条数（实测 ${armed.aria}；R-01-026/AC-13）`);
	const unreadBefore = await page.locator(`${DONE_CARD}[data-unread]`).count();
	assert.ok(unreadBefore > 0, `一键已读前分区内仍有未读条目（实测 ${unreadBefore}；R-01-026/AC-13）`);

	// 从弹窗段头触发：全部未读完成提醒一次转已读，入口随之隐藏；完成提醒本体不动。
	await openBadgeModal(page);
	const modalArmed = await page.evaluate(() => {
		const el = document.querySelector('.dap-modal-group[data-tone="completed"] .dap-read-all');
		return el === null ? null : { hidden: el.hidden, aria: el.getAttribute("aria-label") ?? "" };
	});
	assert.equal(modalArmed?.hidden, false, "存在未读完成提醒时弹窗入口显示（R-01-026/AC-13）");
	assert.match(modalArmed?.aria ?? "", /全部标记为已读（\d+）/, "弹窗入口的可访问名称同样给出待标记条数（R-01-026/AC-13）");
	await page.locator('.dap-modal-group[data-tone="completed"] .dap-read-all').click();
	const modalAfterReadAll = await until("一键已读后弹窗入口收起", async () => {
		const button = await page.evaluate(() => {
			const el = document.querySelector('.dap-modal-group[data-tone="completed"] .dap-read-all');
			return el === null ? null : { hidden: el.hidden };
		});
		return button?.hidden === true ? button : null;
	}, 10_000);
	assert.equal(modalAfterReadAll.hidden, true, "一键已读后弹窗入口不再显示（R-01-026/AC-13）");
	const modalAllRead = await modalCompletedItems(page);
	assert.ok(!modalAllRead.some((item) => item.unread === true), `一键已读后弹窗全部条目转为已读（实测 ${JSON.stringify(modalAllRead)}；R-01-026/AC-13）`);
	await closeBadgeModal(page);

	// 窗格侧同一状态：分区内不再有未读条目、入口收起、完成提醒与「移入历史」按钮仍在。
	const paneAfterReadAll = await until("一键已读后窗格分区无未读条目", async () => {
		const state = await page.evaluate(() => ({
			unread: document.querySelectorAll('.dap-done .dap-card[data-wait="done"][data-unread]').length,
			total: document.querySelectorAll('.dap-done .dap-card[data-wait="done"]').length,
			confirmButtons: document.querySelectorAll('.dap-done .dap-card[data-wait="done"] .dap-confirm:not([hidden])').length,
			readAllHidden: document.querySelector(".dap-done-head .dap-read-all")?.hidden ?? null,
		}));
		return state.unread === 0 && state.total > 0 ? state : null;
	}, 15_000);
	assert.equal(paneAfterReadAll.unread, 0, `一键已读后窗格分区内无未读条目（实测 ${paneAfterReadAll.unread}；R-01-026/AC-13）`);
	assert.equal(paneAfterReadAll.readAllHidden, true, "一键已读后窗格入口收起（R-01-026/AC-13）");
	assert.equal(
		paneAfterReadAll.confirmButtons,
		paneAfterReadAll.total,
		"一键已读不解除完成提醒：「移入历史」按钮仍在（R-01-026/AC-13）",
	);
	const settledGlyph = await until("全部已读后角标摘除未读提示", async () => {
		const snapshot = await glyphSnapshot(page);
		return snapshot?.unread === null ? snapshot : null;
	}, 10_000);
	assert.equal(settledGlyph.animationName, "none", `全部已读后完成点慢呼吸随之停止（实测 ${settledGlyph.animationName}；R-01-026/AC-10、AC-17）`);
	// 属性摘除与动效停止是同一件事的两面：慢呼吸由该属性驱动，属性不在即无动画。
	assert.doesNotMatch(settledGlyph.label, /个未读/, `全部已读后无障碍名称不再报未读数（实测 ${settledGlyph.label}；R-01-026/AC-10）`);
	// R-01-026/AC-16：全部已读后「已完成」点与计数为 0 同款置灰，文字通道明说「已全部读」。
	assert.equal(settledGlyph.completedOn, "false", `全部已读后「已完成」点置灰（实测 data-on=${settledGlyph.completedOn}；R-01-026/AC-16）`);
	assert.match(settledGlyph.label, /已完成 \d+（已全部读）/, `全部已读时无障碍名称明说「已全部读」（实测 ${settledGlyph.label}；R-01-026/AC-16）`);

	// ---- 全部移入历史（R-01-026/AC-14）：两处段头各一枚入口，动作复用卡片的完成确认 ----
	// 都读完了但完成提醒还在（上一段已证实 ack 未被触发），此刻两处入口都应可见。
	const paneDoneAll = await page.evaluate(() => {
		const button = document.querySelector(".dap-done-head .dap-done-all");
		return button === null ? null : { hidden: button.hidden, aria: button.getAttribute("aria-label") ?? "" };
	});
	assert.ok(paneDoneAll !== null, "窗格「已完成」分区段头常驻一枚「全部移入历史」入口（R-01-026/AC-14）");
	assert.equal(paneDoneAll.hidden, false, "分区内有完成提醒时窗格入口显示（与未读无关）（R-01-026/AC-14）");
	assert.match(paneDoneAll.aria, /全部标记为已读并移入历史（\d+）/, `窗格入口的可访问名称给出待确认条数（实测 ${paneDoneAll.aria}；R-01-026/AC-14）`);

	// 从弹窗段头触发一次：本组全部提交完成确认，完成提醒从「已完成」分区迁出，
	// 两处入口都随之隐藏；「最近历史」结构仍在（迁出目标不是删除）。
	await openBadgeModal(page);
	const modalDoneAll = await page.evaluate(() => {
		const button = document.querySelector('.dap-modal-group[data-tone="completed"] .dap-done-all');
		return button === null ? null : { hidden: button.hidden, aria: button.getAttribute("aria-label") ?? "" };
	});
	assert.equal(modalDoneAll?.hidden, false, "有完成提醒时弹窗入口显示（R-01-026/AC-14）");
	assert.match(modalDoneAll?.aria ?? "", /全部标记为已读并移入历史（\d+）/, "弹窗入口的可访问名称同样给出待确认条数（R-01-026/AC-14）");
	await page.locator('.dap-modal-group[data-tone="completed"] .dap-done-all').click();
	const paneCleared = await until("全部移入历史后窗格分区清空", async () => {
		const state = await page.evaluate(() => ({
			doneCards: document.querySelectorAll('.dap-done .dap-card[data-wait="done"]').length,
			recentHead: document.querySelector(".dap-recent-head span")?.textContent ?? null,
			doneAllHidden: document.querySelector(".dap-done-head .dap-done-all")?.hidden ?? null,
		}));
		return state.doneCards === 0 ? state : null;
	}, 20_000);
	assert.equal(paneCleared.doneCards, 0, `全部移入历史后分区内不再有完成提醒（实测 ${paneCleared.doneCards}；R-01-026/AC-14）`);
	assert.equal(paneCleared.doneAllHidden, true, "分区清空后窗格入口隐藏（R-01-026/AC-14）");
	assert.equal(paneCleared.recentHead, "最近历史", "迁出目标仍是「最近历史」分区，结构未被移除（R-01-026/AC-14）");
	await closeBadgeModal(page);
	const modalAfterDoneAll = await page.evaluate(() => {
		const button = document.querySelector('.dap-modal-group[data-tone="completed"] .dap-done-all');
		return button === null ? null : { hidden: button.hidden };
	});
	assert.equal(modalAfterDoneAll?.hidden, true, "弹窗入口在无完成提醒时隐藏（R-01-026/AC-14）");
}
