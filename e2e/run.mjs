// E2E 套件运行器（C-045、C-046、C-047、C-058）：启动隔离测试环境，执行 e2e/specs/*.mjs。
//
// 每个 spec 默认导出 async ({ browser, page, url, mock, assert })：browser/page
// 属于该次隔离环境；runner 负责环境、浏览器与 context 生命周期。spec 固定顺序
// 执行，保持单机门禁的资源上限与日志顺序稳定。
// spec 可具名导出 mobileShell=true（隔离环境按名另装 dsh-web-mobile 手机壳层，
// 装不上记显式 SKIP）与 contextOptions（传给 newContext，如移动视口+触屏+UA）。
// 浏览器二进制为项目内安装（PLAYWRIGHT_BROWSERS_PATH=0）。
//
// 用法：`node e2e/run.mjs`（全量）或 `node e2e/run.mjs mobile-drawer`（指定 spec）。
// 备注：package.json 的 knownFailingE2e.specs 列出基线既有失败，对应 spec 失败时记
// KNOWN-FAIL 而非整轮红；本仓库验证默认手动，不为提交/推送自动执行。

import assert from "node:assert/strict";
import { readdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";

const here = dirname(fileURLToPath(import.meta.url));
const { bootE2e, formatPassTimings, settleCleanupSteps, E2E_SKIP } = await import("./boot.mjs");
const { chromium } = await import("playwright");
const MAX_CONCURRENCY = 1;

const specDir = join(here, "specs");

// 基线既有失败清单（package.json 的 knownFailingE2e.specs）：这些 spec 在 HEAD 上
// 就已失败，与本轮改动无关。它们仍然照常执行，但失败时记为 KNOWN-FAIL 而不是让
// 整轮跑红，避免每次全量都要人工逐个单跑排除嫌疑。清单为空时行为与原来完全一致。
const knownFailing = new Set(
	(JSON.parse(await readFile(join(here, "..", "package.json"), "utf8")).knownFailingE2e?.specs ?? []).map(
		(name) => (name.endsWith(".mjs") ? name : `${name}.mjs`),
	),
);
const requested = new Set(process.argv.slice(2).map((name) => (name.endsWith(".mjs") ? name : `${name}.mjs`)));
const allSpecFiles = (await readdir(specDir)).filter((name) => name.endsWith(".mjs")).sort();
const specFiles = requested.size === 0 ? allSpecFiles : allSpecFiles.filter((name) => requested.has(name));
if (specFiles.length === 0 || (requested.size > 0 && specFiles.length !== requested.size)) {
	console.error(`e2e: 找不到请求的 spec（可用：${allSpecFiles.join(", ")}）`);
	process.exit(1);
}

const failurePath = (name) => join(here, `fail-${name}.png`);

async function captureFailure(page, name) {
	await page?.screenshot({ path: failurePath(name) }).catch(() => {});
}

async function clearFailureArtifact(name) {
	await rm(failurePath(name), { force: true }).catch(() => {});
}

async function runSpec(name) {
	// spec 具名导出（可选）：mobileShell=true 请求隔离环境另装 dsh-web-mobile
	// 手机壳层；contextOptions 传给 newContext（移动壳层档用移动视口+触屏+UA）。
	const mod = await import(pathToFileURL(join(specDir, name)).href);
	const spec = mod.default;
	let env;
	let browser;
	let context;
	let page;
	let result = 0;
	let skipped = false;
	let knownFailed = false;
	let bootMs = 0;
	let browserMs = 0;
	let specMs = 0;
	let cleanupMs = 0;
	const start = Date.now();
	try {
		env = await bootE2e({ mobileShell: mod.mobileShell === true });
		bootMs = Date.now() - start;
		const browserStart = Date.now();
		// Native scrollbar hit-testing is part of the UI contract; Playwright's
		// headless default adds --hide-scrollbars, so keep the real gutter.
		browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
		context = await browser.newContext(mod.contextOptions ?? {});
		page = await context.newPage();
		browserMs = Date.now() - browserStart;
		const specStart = Date.now();
		await spec({ browser, page, url: env.url, mock: env.mock, assert });
		await clearFailureArtifact(name);
		specMs = Date.now() - specStart;
	} catch (error) {
		if (error?.code === E2E_SKIP) {
			// 环境性缺席（如 registry 不可达）不是被测行为失败：显式记账，不让覆盖静默消失。
			skipped = true;
			console.error(`e2e: SKIP ${name}（${error.message}）`);
		} else if (knownFailing.has(name)) {
			// 已知失败：照常取证（截图 + stderr 尾部）但不计入本轮失败数
			knownFailed = true;
			console.error(`e2e: KNOWN-FAIL ${name}（基线既有失败，不计入本轮回归）\n${error?.stack ?? error}`);
			await captureFailure(page, name);
		} else {
			result = 1;
			console.error(`e2e: FAIL ${name}\n${error?.stack ?? error}`);
			if (env?.webStderr.length > 0) console.error(`e2e: dsh web stderr 尾部：\n${env.webStderr.slice(-20).join("")}`);
			await captureFailure(page, name);
		}
	} finally {
		const cleanupStart = Date.now();
		const cleanupErrors = await settleCleanupSteps([
			["context", () => context?.close()],
			["browser", () => browser?.close()],
			["environment", () => env?.cleanup()],
		]);
		cleanupMs = Date.now() - cleanupStart;
		if (cleanupErrors.length > 0) {
			result = 1;
			console.error(`e2e: FAIL ${name} cleanup\n${cleanupErrors.join("\n")}`);
		}
	}
	if (result === 0 && !skipped && !knownFailed) {
		console.error(formatPassTimings(name, { boot: bootMs, browser: browserMs, spec: specMs, cleanup: cleanupMs, total: Date.now() - start }));
	}
	if (skipped) return "skip";
	if (knownFailed) return "known-fail";
	return result;
}

const suiteStart = Date.now();
let nextSpec = 0;
let failed = 0;
let skippedCount = 0;
let knownFailCount = 0;
async function worker() {
	for (;;) {
		const index = nextSpec;
		nextSpec += 1;
		if (index >= specFiles.length) return;
		const outcome = await runSpec(specFiles[index]);
		if (outcome === 1) failed += 1;
		else if (outcome === "skip") skippedCount += 1;
		else if (outcome === "known-fail") knownFailCount += 1;
	}
}
await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, specFiles.length) }, () => worker()));

const elapsed = Date.now() - suiteStart;
const knownNote = knownFailCount > 0 ? `（另 ${knownFailCount} 个 KNOWN-FAIL）` : "";
if (failed > 0) {
	console.error(`e2e: ${failed} 个 spec 失败${skippedCount > 0 ? `（另 ${skippedCount} 个 SKIP）` : ""}${knownNote}（${elapsed}ms）`);
	process.exit(1);
}
const passedCount = specFiles.length - knownFailCount - skippedCount;
// 只跑了已知失败 spec 时不谎称「全部通过」，直接说明本轮没有可判定的通过项。
const summary =
	passedCount > 0
		? `全部 ${passedCount} 个 spec 通过`
		: `本轮无通过的 spec`;
console.error(`e2e: ${summary}${skippedCount > 0 ? `（其中 ${skippedCount} 个 SKIP）` : ""}${knownNote}（${elapsed}ms）`);
