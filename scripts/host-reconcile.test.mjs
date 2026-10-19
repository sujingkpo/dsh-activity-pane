// @description 宿主侧对账清理的执行级测试（R-01-027/AC-02、AC-03、AC-04）：用假的 cordis ctx
//   与内存版 KvTable 真正跑一遍 apply()，断言「哪些记录被删、哪些被保留」。
//   这类测试存在的理由：源码正则断不出一条「一运行就抛错」的路径——T-178 首轮审核的 B-1
//   （ctx.inject 回调被当成服务对象，对账永远抛错且在 catch 里静默吞掉）就是这么漏过去的。
// @author czy
// @date 2026-10-19
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { apply } from '../src/host.mjs'

/** 内存版 KvTable：只实现本插件用到的契约（get / put / delete / entries / size）。
 *  delete 的语义与 dsh-storage-domain 一致：记录不存在返回 false 且不触发变更。 */
function createTable(initial = {}) {
	const records = new Map(Object.entries(initial))
	return {
		get: (key) => records.get(key),
		put: async (key, value) => {
			records.set(key, value)
		},
		delete: async (key) => {
			if (!records.has(key)) return false
			records.delete(key)
			return true
		},
		entries: () => [...records.entries()][Symbol.iterator](),
		keys: () => [...records.keys()][Symbol.iterator](),
		get size() {
			return records.size
		},
		/** 测试专用：读当前键集合。 */
		keysNow: () => [...records.keys()].sort(),
	}
}

/** 构造一个最小可用的假 ctx：只实现 host.mjs 真正调用的那几个面。
 *  - inject(deps, cb)：cordis 语义为「cb 收到子 Context」，这里如实用 childCtx 回调；
 *  - get(name)：只解析 sessionPersistence，用于持久化就绪守卫；
 *  - webServer.register：捕获 handler 供测试直接调用。 */
function createHost({ sessions = [], persistence = {}, ackSeed = {}, turnSeed = {} } = {}) {
	const ackTable = createTable(ackSeed)
	const turnTable = createTable(turnSeed)
	const handlers = new Map()
	const events = new Map()
	const warnings = []
	let sessionQueryCalls = 0

	const services = {
		storageDomain: {
			open: async (spec) => ({
				table: (tableName) => (tableName === 'acks' ? ackTable : turnTable),
				close: async () => {},
				domainName: spec.name,
			}),
		},
		sessionQuery: {
			async listSessions() {
				sessionQueryCalls += 1
				return sessions
			},
		},
	}

	const ctx = {
		logger: { warn: (message) => warnings.push(String(message)) },
		// 子 Context 只暴露当前注入的服务，与 cordis 的「inject 后服务挂到子 ctx 上」一致。
		inject: (deps, callback) => {
			const child = {}
			for (const dep of deps) child[dep] = services[dep]
			return callback(child)
		},
		get: (name) => (name === 'sessionPersistence' ? persistence.value : undefined),
		effect: () => {},
		on: (event, handler) => {
			if (!events.has(event)) events.set(event, [])
			events.get(event).push(handler)
			return () => {}
		},
		webServer: {
			register: ({ path, handler }) => {
				handlers.set(path, handler)
			},
		},
		connection: { requestRejection: () => undefined },
	}
	return { ctx, ackTable, turnTable, handlers, events, warnings, stats: () => sessionQueryCalls }
}

/** 触发一次事件派发（宿主侧 ctx.emit 的替身）。 */
async function emit(runtime, event, ...args) {
	for (const handler of runtime.events.get(event) ?? []) await handler(...args)
}

/** 等待异步 fire-and-forget 生效：轮询直到条件成立或超时。 */
async function settle(predicate, message) {
	const deadline = Date.now() + 2000
	for (;;) {
		if (predicate()) return
		if (Date.now() > deadline) throw new Error(message)
		await new Promise((resolve) => setTimeout(resolve, 10))
	}
}

/** 调用已注册的 HTTP handler，返回 { status, body }。
 *  handler 内部是 fire-and-forget 的 promise 链，所以必须等 res.end 被真正调用，
 *  不能只 await handler 的返回值（那是 undefined）。 */
async function callApi(handler, { method, url, body }) {
	const req = new EventEmitter()
	req.method = method
	req.url = url
	let settleResponse
	const responded = new Promise((resolve) => {
		settleResponse = resolve
	})
	const res = {
		status: 0,
		payload: '',
		writeHead(status) {
			this.status = status
			return this
		},
		end(payload) {
			this.payload = payload ?? ''
			settleResponse()
			return this
		},
	}
	// readJsonBody 在监听器挂上之后才读 body：下一拍再吐数据，避免丢事件。
	setImmediate(() => {
		if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)))
		req.emit('end')
	})
	await Promise.resolve(handler(req, res))
	await responded
	return { status: res.status, body: res.payload === '' ? null : JSON.parse(res.payload) }
}

// ---- 启动对账（AC-03）----
{
	const persistence = { value: {} }
	const runtime = createHost({
		persistence,
		sessions: [{ header: { id: 'live-1' } }],
		ackSeed: { 'live-1': { lastTurnEnd: 1, ackedAt: null }, 'gone-1': { lastTurnEnd: 2, ackedAt: 3 } },
		turnSeed: { 'live-1': { busyMs: 10 }, 'gone-2': { busyMs: 20 } },
	})
	apply(runtime.ctx)
	await settle(() => runtime.ackTable.keysNow().join() === 'live-1', '启动对账应删除不在会话全集内的提醒登记')
	assert.deepEqual(runtime.ackTable.keysNow(), ['live-1'], '启动对账删除孤儿提醒登记，保留仍在列表的会话')
	assert.deepEqual(runtime.turnTable.keysNow(), ['live-1'], '启动对账删除孤儿运行时长记账，保留仍在列表的会话')
}

// ---- 会话全集为空 / 持久化未就绪：一律不删（防止启动瞬间清空全表）----
{
	const persistence = { value: {} }
	const runtime = createHost({
		persistence,
		sessions: [],
		ackSeed: { a: { lastTurnEnd: 1 }, b: { lastTurnEnd: 2 } },
		turnSeed: { a: { busyMs: 1 }, b: { busyMs: 2 } },
	})
	apply(runtime.ctx)
	await new Promise((resolve) => setTimeout(resolve, 80))
	assert.deepEqual(runtime.ackTable.keysNow(), ['a', 'b'], '会话全集为空时不删除任何提醒登记')
	assert.deepEqual(runtime.turnTable.keysNow(), ['a', 'b'], '会话全集为空时不删除任何运行时长记账')
	assert.ok(
		runtime.warnings.some((line) => line.includes('empty-corpus')),
		'跳过时留一条 warn 说明原因（便于线上定位）',
	)
}
{
	const persistence = { value: undefined }
	const runtime = createHost({
		persistence,
		sessions: [{ header: { id: 'live-1' } }],
		ackSeed: { 'live-1': { lastTurnEnd: 1 }, 'gone-1': { lastTurnEnd: 2 } },
	})
	apply(runtime.ctx)
	await new Promise((resolve) => setTimeout(resolve, 80))
	assert.deepEqual(runtime.ackTable.keysNow(), ['gone-1', 'live-1'], '持久化未就绪时不删除任何记录')
	assert.ok(
		runtime.warnings.some((line) => line.includes('会话持久化未就绪')),
		'持久化未就绪时留一条 warn',
	)
}

// ---- 实时路径（AC-02）：disposed 只是「复核提示」，判据仍是会话服务列表 ----
{
	const persistence = { value: {} }
	// disposed 但日志仍在磁盘：listSessions 依旧会列出它 —— 记录必须保留（P1 回归）。
	const runtime = createHost({
		persistence,
		sessions: [{ header: { id: 'disposed-but-listed' } }],
		ackSeed: { 'disposed-but-listed': { lastTurnEnd: 1, ackedAt: null } },
		turnSeed: { 'disposed-but-listed': { busyMs: 5 } },
	})
	apply(runtime.ctx)
	await emit(runtime, 'session/disposed', { id: 'disposed-but-listed' })
	await new Promise((resolve) => setTimeout(resolve, 80))
	assert.deepEqual(
		runtime.ackTable.keysNow(),
		['disposed-but-listed'],
		'session/disposed 后若该会话仍被会话服务列出，提醒登记必须保留（不清空用户的确认状态）',
	)
	assert.deepEqual(
		runtime.turnTable.keysNow(),
		['disposed-but-listed'],
		'session/disposed 后若该会话仍被会话服务列出，运行时长记账必须保留',
	)
}
{
	const persistence = { value: {} }
	// 真移除：disposed 且会话服务确实不再列出 —— 两张表都要删。
	// 列表里放一个无关会话，确保走的是「逐条判定」而不是被空集合守卫整体挡掉。
	const runtime = createHost({
		persistence,
		sessions: [{ header: { id: 'other' } }],
		ackSeed: { 'really-gone': { lastTurnEnd: 1, ackedAt: null } },
		turnSeed: { 'really-gone': { busyMs: 5 } },
	})
	apply(runtime.ctx)
	await settle(() => runtime.ackTable.keysNow().join() === '', '启动对账应删掉桌面上已不存在的会话记录')
	// 重新放回一条，走实时路径验证同样的结论。
	runtime.ackTable.put('disposed-gone', { lastTurnEnd: 3, ackedAt: null })
	runtime.turnTable.put('disposed-gone', { busyMs: 9 })
	await emit(runtime, 'session/disposed', { id: 'disposed-gone' })
	await settle(
		() => runtime.ackTable.keysNow().join() === '',
		'disposed 且会话服务不再列出时，实时复核应删掉该会话的提醒登记',
	)
	assert.deepEqual(runtime.turnTable.keysNow(), [], 'disposed 且会话服务不再列出时，运行时长记账同样被删')
}

// ---- 确认写回（AC-02）：记录已被清理时不得复活空壳记录 ----
{
	const persistence = { value: {} }
	const runtime = createHost({ persistence, sessions: [{ header: { id: 'live-1' } }] })
	apply(runtime.ctx)
	await settle(() => runtime.handlers.has('/dsh-activity-pane/api'), '应注册 HTTP 路由')
	const handler = runtime.handlers.get('/dsh-activity-pane/api')
	const skipped = await callApi(handler, {
		method: 'POST',
		url: '/dsh-activity-pane/api/ack',
		body: { sessionId: 'never-existed' },
	})
	assert.equal(skipped.status, 200, '记录不存在时确认写回幂等成功（不报错）')
	assert.equal(skipped.body?.skipped, 'no-record', '记录不存在时明确标记为跳过')
	assert.deepEqual(runtime.ackTable.keysNow(), [], '记录不存在时不写入空壳记录（否则正是 R-01-027 要消除的残留）')
}
{
	const persistence = { value: {} }
	const runtime = createHost({
		persistence,
		sessions: [{ header: { id: 'live-1' } }],
		ackSeed: { 'live-1': { lastTurnEnd: 7, lastTurnEndKind: 'error', lastTurnEndError: 'boom', ackedAt: null } },
	})
	apply(runtime.ctx)
	await settle(() => runtime.handlers.has('/dsh-activity-pane/api'), '应注册 HTTP 路由')
	const handler = runtime.handlers.get('/dsh-activity-pane/api')
	const ok = await callApi(handler, {
		method: 'POST',
		url: '/dsh-activity-pane/api/ack',
		body: { sessionId: 'live-1' },
	})
	assert.equal(ok.status, 200, '记录存在时确认写回成功')
	const record = runtime.ackTable.get('live-1')
	assert.equal(record.lastTurnEnd, 7, '确认写回保留回合结束时刻（C-102）')
	assert.equal(record.lastTurnEndKind, 'error', '确认写回保留回合结束原因（C-102：错误提醒确认后仍可判定）')
	assert.equal(record.lastTurnEndError, 'boom', '确认写回保留错误信息（C-102）')
	assert.ok(Number.isFinite(record.ackedAt), '确认写回推进 ackedAt')
}

console.log('host-reconcile: all assertions passed')
