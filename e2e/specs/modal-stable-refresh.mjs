// R-02-003/AC-01 + R-01-026/AC-02（缺陷回归）：弹窗明细在有活动会话时逐轮刷新而不重建条目。
//
// 缺陷（东家 2026-10-14 反馈「鼠标停在弹窗列表上一直闪」）：renderBadgeModal 每轮用
// badgeModalBody.replaceChildren(...) 整表重建三组条目节点，而该调用位于窗格渲染签名
// 去重之前——弹窗打开期间 render() 随 1 秒运行卡时钟与订阅推送逐轮执行，指针下的
// .dap-modal-item 被反复销毁重建，CSS :hover 与行尾箭头的 0.12s 过渡被打断重启，肉眼
// 即持续闪烁。同仓库卡片区早有同款教训（"每次渲染无条件 appendChild 会把所有卡片瞬时
// 移除再插回……悬停卡的 :hover 也随之丢失且不再补发"）。
// 东家观察：只有存在活动会话时才闪——活动会话正是那个 1 秒渲染时钟的开关。
//
// 实测（隔离环境，弹窗打开 + 指针停在首个条目、1.5s 采样窗）：
//   修复前：条目节点重建 14 次 / 指针命中元素翻转 14 次 / replaceChildren 14 次；
//   修复后：全部为 0。
//
// 断言口径只看用户可观察呈现：
//   1) 采样窗内窗格滚动区确有 DOM 写入（逐秒时长刷新）——保证窗内必然发生过渲染，
//      否则本 spec 空跑（判不成立即失败，不给假通过）；
//   2) 采样窗内弹窗体条目节点被移除 0 次（缺陷期为每秒约 10 次）；
//   3) 指针静止期间 :hover 不掉落重命中（缺陷期的直接症状）；
//   4) 稳态下组计数 DOM 零写入（R-02-003/AC-01「状态未变时跳过全部可见 DOM 写入」）。

import { ensureFullDensity, newSessionWithMessage, openApp, sendHeroMessage, until } from "../helpers.mjs";

/** 采样窗：覆盖慢速剧本（约 24×150ms）运行中的大半时段。 */
const WINDOW_MS = 2_500;

/** 角标快照文本（glyph aria-label）。 */
function badgeLabel(page) {
	return page.evaluate(() => document.querySelector(".dap-badge-glyph")?.getAttribute("aria-label") ?? null);
}

export default async function modalStableRefresh({ page, url, assert }) {
	await page.setViewportSize({ width: 1280, height: 760 });
	await openApp(page, url);
	await ensureFullDensity(page);
	// 先造一个已完成条目：弹窗三组里至少有一组非空，采样窗内有可悬停的条目行。
	await sendHeroMessage(page, "e2e:fast 弹窗稳定静置");
	await until("角标入口行就位", async () => { const label = await badgeLabel(page); return typeof label === "string" && label.length > 0 ? label : null; });

	// 运行中会话是闪烁的必要条件（东家观察：无活动会话时不闪）——它让 1 秒运行卡时钟常开，
	// 从而让 render() 在弹窗打开期间逐秒执行（缺陷的触发条件）。
	await newSessionWithMessage(page, "e2e:slow 弹窗稳定探针");
	await until("「运行中」计数增长", async () => {
		const label = await badgeLabel(page);
		return /运行中\s*[1-9]/.test(String(label ?? "")) ? label : null;
	}, 20_000);

	// 打开弹窗并把指针停在首个条目上；此后不再移动指针。
	await page.locator(".dap-badge-glyph").locator("xpath=ancestor::button[1]").click();
	await until("角标弹窗打开", async () => ((await page.locator(".dap-modal").isVisible()) ? true : null));
	const box = await until("弹窗首条条目行可量取包围盒", async () => await page.locator(".dap-modal-item").first().boundingBox());
	assert.ok(box !== null, "弹窗内至少列出一个可悬停的条目行");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.waitForTimeout(120);

	// 采样：窗内「渲染确实发生」的正向信号（窗格滚动区内出现 DOM 写入）、弹窗体条目
	// 节点被移除次数、首个条目 Node 引用是否被换掉，以及指针下面的 :hover 是否连续。
	const sample = await page.evaluate(async ({ durationMs }) => {
		const body = document.querySelector(".dap-modal-body");
		const pane = document.querySelector(".dap-scroll");
		if (body === null) return null;
		const state = { removedItems: 0, headSwapped: 0, paneWrites: 0, hoverFlips: 0, hoveredOnce: false, samples: 0 };
		let head = document.querySelector(".dap-modal-item");
		// 条目（或承载条目的子树）被移除即记一次重建：整表 replaceChildren 以弹窗体
		// 直接子节点被替换的形式出现，逐条 remove 则以条目自身出现。
		const observer = new MutationObserver((records) => {
			for (const record of records) {
				for (const node of record.removedNodes) {
					if (node.nodeType !== 1) {
						continue;
					}
					if (node.classList.contains("dap-modal-item") || node.querySelector?.(".dap-modal-item") !== null) {
						state.removedItems += 1;
					}
				}
			}
		});
		observer.observe(body, { childList: true, subtree: true });
		// 正向对照（防空跑的真实判据）：窗格滚动区里的运行卡每秒重算并写入已运行时长，
		// 故「窗内确有渲染发生」会表现为滚动区内的文本写入。它与弹窗体无关，不会因为
		// 缺陷被修好而消失——修复后它仍应 > 0，否则说明这次采样根本没赶上渲染。
		const paneObserver = new MutationObserver((records) => {
			for (const record of records) {
				if (record.type === "characterData" || record.type === "childList") {
					state.paneWrites += 1;
				}
			}
		});
		if (pane !== null) {
			paneObserver.observe(pane, { childList: true, subtree: true, characterData: true });
		}
		const raf = window.requestAnimationFrame.bind(window);
		const deadline = performance.now() + durationMs;
		let last = performance.now();
		let hovered = false;
		await new Promise((resolve) => {
			const tick = () => {
				const now = performance.now();
				const delta = now - last;
				last = now;
				state.samples += 1;
				const current = document.querySelector(".dap-modal-item");
				if (head !== null && current !== head) {
					state.headSwapped += 1;
					head = current;
				}
				// 指针在采样窗内一直没动：悬停态本应连续保持。条目若被销毁重建，
				// :hover 会掉落后重新命中，这里逐帧记录这种翻转次数。
				const nowHovered = document.querySelector(".dap-modal-item:hover") !== null;
				if (nowHovered) {
					state.hoveredOnce = true;
				}
				if (hovered && !nowHovered) {
					state.hoverFlips += 1;
				}
				hovered = nowHovered;
				if (now >= deadline) {
					resolve();
				} else {
					raf(tick);
				}
			};
			raf(tick);
		});
		observer.disconnect();
		paneObserver.disconnect();
		return state;
	}, { durationMs: WINDOW_MS });

	assert.ok(sample !== null, "采样期间弹窗体仍在文档内");
	// 非空跑门槛：窗格滚动区内确实出现 DOM 写入，证明采样窗覆盖了真实的逐秒渲染。
	assert.ok(
		sample.paneWrites > 0,
		`采样窗内窗格确有渲染写入 ${sample.paneWrites} 次——为 0 则本 spec 空跑、结论不成立`,
	);
	assert.ok(sample.hoveredOnce, "采样期间指针确有一个条目处于 :hover（判据锚在悬停真实发生时）");
	assert.equal(sample.headSwapped, 0, `弹窗条目节点跨轮保持同一 Node 引用（实测被换掉 ${sample.headSwapped} 次；R-02-003/AC-01）`);
	assert.equal(
		sample.hoverFlips,
		0,
		`指针静止时悬停态连续保持、不出现掉落重命中（实测翻转 ${sample.hoverFlips} 次；R-02-003/AC-01）`,
	);
	assert.equal(
		sample.removedItems,
		0,
		`有活动会话时弹窗明细逐轮刷新不重建条目节点（实测移除 ${sample.removedItems} 次 / ${WINDOW_MS}ms；R-02-003/AC-01）`,
	);

	// 刷新语义未被削弱：会话收尾后弹窗「已完成」组仍把新条目列入明细；
	// 条目数与角标计数的一致性在同一趟 evaluate 内读取，避免两次往返之间
	// 恰好跨过一次 render 而抖动失败（e2e/run.mjs 无重试）。
	const consistent = await until("弹窗「已完成」组列出新完成会话且与角标计数一致", async () => {
		const value = await page.evaluate(() => {
			const label = document.querySelector(".dap-badge-glyph")?.getAttribute("aria-label") ?? "";
			const matched = /已完成\s*(\d+)/.exec(label);
			return {
				listed: document.querySelectorAll('.dap-modal-group[data-tone="completed"] .dap-modal-item').length,
				badge: matched === null ? null : Number(matched[1]),
			};
		});
		return value.listed >= 2 && value.listed === value.badge ? value : null;
	}, 30_000);
	assert.ok(consistent.listed >= 2, `弹窗「已完成」组列出新完成会话（实测 ${consistent.listed} 条；R-01-026/AC-02）`);
	assert.equal(
		consistent.listed,
		consistent.badge,
		`弹窗「已完成」条目数与角标计数一致（条目 ${consistent.listed}，角标 ${consistent.badge}；R-01-026/AC-02）`,
	);

	// AC-01 的直接判据：重复渲染不得产生「值没变却仍写 DOM」的空转写入。
	// 上一段采样只覆盖条目节点（条目之外的组计数 span 是它的盲区），这里补上。
	// 判据用 characterDataOldValue 精确到「写前写后同值」——真实的内容变化（会话
	// 由运行中落定到已完成）允许写一次，只有同值重写才算违反「跳过全部可见 DOM 写入」。
	const writes = await page.evaluate(async () => {
		const body = document.querySelector(".dap-modal-body");
		if (body === null) return null;
		const spans = () => [...body.querySelectorAll(".dap-modal-group-count")];
		const snapshot = () => spans().map((el) => el.textContent).join("|");
		const isCount = (node) => {
			const el = node.nodeType === 3 ? node.parentElement : node;
			return el?.classList?.contains("dap-modal-group-count") === true;
		};
		const before = snapshot();
		let total = 0;
		let spurious = 0;
		const observer = new MutationObserver((records) => {
			for (const record of records) {
				if (!isCount(record.target)) {
					continue;
				}
				total += 1;
				// 文本节点被替换：oldValue 是替换前的内容，target.data 是替换后的。
				if (record.type === "characterData" && record.oldValue === record.target.data) {
					spurious += 1;
				}
				// 整段文本节点被换出（childList）：按节点类型无法读旧值，计入总数。
				if (record.type === "childList") {
					spurious += 1;
				}
			}
		});
		observer.observe(body, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
		await new Promise((resolve) => setTimeout(resolve, 2_200));
		observer.disconnect();
		return { before, after: snapshot(), total, spurious };
	});
	assert.ok(writes !== null, "采样期间弹窗体仍在文档内");
	assert.equal(
		writes.before,
		writes.after,
		`稳态下组计数文本不变（前 ${writes.before} / 后 ${writes.after}；R-02-003/AC-01）`,
	);
	assert.equal(
		writes.spurious,
		0,
		`状态未变时重复渲染不产生同值 DOM 写入（实测 ${writes.spurious} 次空转 / 共 ${writes.total} 次写入；R-02-003/AC-01）`,
	);
}
