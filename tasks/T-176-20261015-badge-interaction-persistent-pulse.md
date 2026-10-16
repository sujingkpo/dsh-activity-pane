---
doc-type: task
mutation: lifecycle
id: T-176
---

# T-176 「需要交互」角标常闪 + 弹窗明细刷新不重建条目

状态: active
关联: R-01-026
风险等级: standard

## 背景与目标

东家在同一次会话内提出两件事：

1. 缺陷（2026-10-15，m00002）：点开宿主侧栏「活动会话」入口行的弹窗后，鼠标停在列表上时列表持续闪烁。观察补充（m00195）：「有活动会话时才会闪烁，没有活动会话不闪烁」——把触发条件钉在「存在运行中会话」上。
2. 需求（2026-10-15，m00370）：「另外如果是存在 `需要交互` 动画需要一直闪，直到处理完成」。即「需要交互」计数大于 0 期间角标持续强调，处理完成（计数归零）后停止；东家经确认选定作用于侧栏角标入口行的金色强调（现有 `data-badge-alert` 为计数增加时播一轮 0.8s × 4 即收口）。

缺陷侧根因（已实测）：`renderBadgeModal()` 每轮用 `badgeModalBody.replaceChildren(...)` 整表重建三组条目节点，而该调用位于窗格渲染签名去重闸口之前——弹窗打开期间 `render()` 随运行卡的 1 秒时钟与订阅/推送逐轮执行，指针下的 `.dap-modal-item` 被反复销毁重建，CSS `:hover` 与行尾箭头的 0.12s 过渡被反复打断重启，肉眼即持续闪烁。这与仓库卡片区既有教训同因（`src/client.mjs` 注释：「每次渲染无条件 appendChild 会把所有卡片瞬时移除再插回……悬停卡的 :hover 也随之丢失且不再补发」）。

需求侧要点：常闪是**无界动画**，与仓库既有「不得使用 infinite」的纪律（R-01-005/AC-01 的「打开中」提示即因无界闪烁被否决）表面冲突。二者承担的状态不同——那里是「正在尝试打开」这类瞬时过程，无界即故障；这里是「有待你处理的交互」这类持续状态，无界正是要求。故本次只为该 glyph 引入常闪，不放松对 `dap-opening` 的限次断言（`scripts/check.mjs:3914`）。

## 差距评估

- PRD：R-01-026 原有 AC-01～AC-07，没有「持续强调」这条承诺——本次新增 AC-08（已落地）。
- SOLUTION：「宿主侧栏角标」子系统「快照与订阅」条目只写了「计数增加即播一次强调」，未描述持续强调——本次补一条（已落地）。
- DOMAIN：无需改动（「宿主侧栏角标」「三状态角标」词条已覆盖，常闪只是该角标的视觉呈现细节，不引入新术语）。
- RATIONALE：无既有决策否决常闪；但「无界动画」在本仓库有强背景（R-01-005/AC-01 的否决史），属需要留痕的决策——新增 C-099。
- 代码缺陷侧：`renderBadgeModal()` 为整表 `replaceChildren` 重建（修复前 `src/client.mjs:2447`）。
- 代码需求侧：glyph 只有一次性强调；「需要交互」计数不在 glyph 上留下任何持续状态。
- 测试：弹窗刷新稳定性零覆盖（既有 spec 只验分组、计数与键盘语义）；「需要交互」持续强调零覆盖。

## 收敛方案

1. `src/client.mjs`（缺陷侧）：`renderBadgeModal()` 改为按 `entry.id` 增量复用——`ensureBadgeModal()` 一次建起三组常驻骨架（段头 / 计数 / 空态 / 条目容器，`tone → { group, count, empty, items, byId }`），`renderBadgeModal()` 只改文案、计数与顺序；条目节点跨轮复用，顺序未变时不碰 DOM（`const ref = rec.items.children[index] ?? null; if (ref !== item.el) rec.items.insertBefore(item.el, ref);`），与卡片区同一条纪律。
2. `src/client.mjs`（需求侧）：新增 `[data-badge-awaiting]` 状态与其 CSS——金色呼吸 `dap-badge-await-pulse`（1.6s ease-in-out infinite，brightness 1.9 / scale 1.28）+ 复用 `dap-badge-halo` 关键帧的外扩环（1.6s ease-out infinite）。属性按计数**声明式**给出（`"data-badge-awaiting": counts.interaction > 0 ? "true" : undefined`），随宿主重渲染与 React 重挂自动跟随，计数归零即摘。
3. `src/client.mjs`（需求侧）：与一次性强调的关系靠 CSS 级联而非 JS 互斥——常闪规则在前、一次性的 `[data-badge-hit]`/`[data-badge-hit][data-badge-alert]` 在后（后者还多一个属性、权重更高），故新增强调播放期间自动接管，其收口定时器摘属性后自然落回常闪。
4. `src/client.mjs`（需求侧）：`prefers-reduced-motion` 下只关动效、保留金色状态色（与 `dap-await-pulse` 同一条口径：状态反馈不随动效一起消失）。
5. `PRD.md`：R-01-026 新增 AC-08。
6. `SOLUTION.md`：「宿主侧栏角标」新增「需要交互」持续强调条目。
7. `RATIONALE.md`：新增 C-099（常闪与既有「禁止无界动画」纪律的边界）。
8. `scripts/check.mjs`：无需改动——仓库对该 glyph 无任何断言（grep 无 `dap-badge-glyph`/`data-badge-hit`/`data-badge-alert`/halo 命中），既有 `infinite` 断言均针对其它元素。
9. 测试：新增 `e2e/specs/modal-stable-refresh.mjs`（缺陷回归，锚 R-02-003/AC-01、R-01-026/AC-02）与 `e2e/specs/badge-interaction-pulse.mjs`（常闪回归，锚 R-01-026/AC-08）。

## 测试计划

- unit（scripts/check.mjs）：既有 163 条断言全绿（本次不改 check.mjs，其角色是证既有契约不被破坏）。
- E2E：
  - `e2e/specs/modal-stable-refresh.mjs`：R-02-003/AC-01、R-01-026/AC-02——有运行中会话时弹窗逐轮刷新而不重建条目节点（采样窗内条目被移除 0 次），且刷新语义未被削弱（新完成会话仍列入「已完成」组、条目数与角标计数一致）。
  - `e2e/specs/badge-interaction-pulse.mjs`：R-01-026/AC-08——计数 0 时常闪关闭；计数 > 0 时常闪就位并跨 ≥2 个周期仍持续（区分「一直闪」与「闪一轮就停」）；处理完成后归零即停且 2s 后不再回来。
  - 相关面回归：`badge-surfaces`、`badge-independence`、`opening-indicator`。
- MANUAL：桌面深色/浅色主题下常闪观感与弹窗悬停稳定性（真机目视）。

## 测试影响

| 需求/AC | 变化类型 | 验证层 | 动作 | 证据/理由 |
| --- | --- | --- | --- | --- |
| SOLUTION | 方案层演进：「宿主侧栏角标」新增「需要交互」持续强调条目 | E2E | update | `e2e/specs/badge-interaction-pulse.mjs` 锚定该行为 |
| R-01-026/AC-08 | 新增 | E2E | 新增断言 | `e2e/specs/badge-interaction-pulse.mjs`：计数 0 关闭 / > 0 常闪且跨周期持续 / 归零即停 |
| R-01-026/AC-01、AC-02、AC-04、AC-06 | 不变 | E2E | 保留 | 角标结构、弹窗分组与折叠态推进不受常闪影响；既有 spec 回归通过 |
| R-01-026/AC-03、AC-05、AC-07 | 不变 | E2E | 保留 | 窗格卸载后推进、条目跳转、Escape 焦点归还不受本次改动影响 |
| R-02-003/AC-01 | 新增覆盖（既有承诺，本轮补回归） | E2E | 新增断言 | `e2e/specs/modal-stable-refresh.mjs`：弹窗明细逐轮刷新不重建条目节点 |

## 验证矩阵

| 维度 | 适用性/理由 | 可执行证据 |
| --- | --- | --- |
| 成功 | 适用：存在待处理交互时角标持续闪（跨 ≥2 个 1.6s 周期仍在跑），处理完成后停止；弹窗在有运行中会话时逐轮刷新而不重建条目 | `e2e/specs/badge-interaction-pulse.mjs#R-01-026/AC-08`、`e2e/specs/modal-stable-refresh.mjs#R-02-003/AC-01`、`src/client.mjs::"data-badge-awaiting": counts.interaction > 0 ? "true" : undefined,` |
| 异常 | 适用：计数为 0 时常闪不得残留（关闭路径）；弹窗条目被移除 0 次而窗内确有渲染写入（判据非空跑）；一次性新增强调收口后常闪接手 | `e2e/specs/badge-interaction-pulse.mjs#R-01-026/AC-08`、`e2e/specs/modal-stable-refresh.mjs#R-02-003/AC-01`、`src/client.mjs::animation: dap-badge-await-pulse 1.6s ease-in-out infinite;` |
| 边界配置 | 适用：`prefers-reduced-motion` 下只关动效、保留金色状态色（spec 断言计算色为 `rgb(255, 202, 74)`）；宿主侧栏折叠态与窗格窄条态角标仍活；宿主布局缺失态仍活 | `e2e/specs/badge-interaction-pulse.mjs#R-01-026/AC-08`、`src/client.mjs::.dap-badge-glyph[data-badge-awaiting],`、`e2e/specs/badge-surfaces.mjs#R-01-026/AC-06`、`e2e/specs/badge-surfaces.mjs#R-01-026/AC-04` |
| 副作用 | 适用：条目复用不得改变弹窗既有语义（分组、计数、空态、条目跳转、Escape 焦点归还）；常闪不得影响其它元素的动画纪律（`dap-opening` 仍限次） | `e2e/specs/badge-surfaces.mjs#R-01-026/AC-01`、`e2e/specs/badge-independence.mjs#R-01-026/AC-07`、`scripts/check.mjs#R-01-005/AC-01`、`e2e/specs/opening-indicator.mjs#R-01-005/AC-01`、`src/client.mjs::function makeBadgeModalItem(tone) {` |
| 并发 | 适用：弹窗打开期间渲染由 1 秒运行卡时钟与订阅/SSE 推送共同驱动，采样窗内条目节点跨轮保持同一 Node 引用且指针静止时 :hover 不掉落重命中 | `e2e/specs/modal-stable-refresh.mjs#R-02-003/AC-01`、`src/client.mjs::const ref = rec.items.children[index] ?? null;` |

## 终态与证据

- 实现: `src/client.mjs`——①缺陷侧：`ensureBadgeModal()` 一次建成三组常驻骨架（`tone → { count, empty, items, byId }`），`renderBadgeModal()` 改为按 `entry.id` 增量复用条目节点、只改文案与顺序，`count`/`title`/`ws` 均先比再写，顺序未变时不触碰 DOM；旧实现 `badgeModalBody.replaceChildren(...)` 整表重建已删除。②需求侧：新增 `data-badge-awaiting` 声明式属性（`counts.interaction > 0` 时给出）与 `dap-badge-await-pulse`（1.6s ease-in-out infinite）+ 复用 `dap-badge-halo` 的外扩环；与一次性 `data-badge-hit`/`data-badge-alert` 的交接口交给 CSS 级联；`prefers-reduced-motion` 下只关动效、保留金色状态色。`PRD.md` 新增 AC-08，`SOLUTION.md` 补「「需要交互」持续强调」与「弹窗明细的稳定刷新」两条，`RATIONALE.md` 新增 C-099。
- 测试: `node scripts/build-client.mjs` → BUILD_OK；`node scripts/check.mjs` → `check: all assertions passed`；`PYTHONUTF8=1 python3 tools/agentmap_lint.py --report` → `agentmap lint passed`（requirements=29、acceptance-criteria=189、test-anchored=189）；`PYTHONUTF8=1 python3 tools/test_impact_lint.py --report` → `test impact lint passed`，`Test impact changes: +R-01-026/AC-08`。E2E（`PLAYWRIGHT_BROWSERS_PATH="C:/Users/czy/AppData/Local/ms-playwright"`；`e2e/run.mjs:17` 默认写 0 而仓库内 `.local-browsers` 为空，必须显式覆盖）：新增 `badge-interaction-pulse.mjs`、`modal-stable-refresh.mjs` 与相关面 `badge-surfaces`、`badge-independence`、`opening-indicator` 共 5 spec 全 PASS；全量 `node e2e/run.mjs` → 24 PASS / 1 SKIP（mobile-shell，`dsh-web-mobile` 不可安装）/ 1 FAIL，唯一失败为 `background-jobs.mjs:67`「中间档母卡数量注出现」超时，属本机既有环境限制（T-175 证据已记录、非本次引入）。
- 缺陷证伪（回归有真实判别力）: ①`modal-stable-refresh.mjs` 在 `git show HEAD:src/client.mjs` 上（还原旧整表重建）FAIL 于 `弹窗条目节点跨轮保持同一 Node 引用（实测被换掉 24 次）`；②把 `rec.count.textContent` 改回无条件赋值（违反 R-02-003/AC-01）时 FAIL 于 `状态未变时重复渲染不产生同值 DOM 写入（实测 3 次空转 / 共 3 次写入）`；③把 `data-badge-awaiting` 改为 `undefined` 时 `badge-interaction-pulse.mjs` FAIL 于 `存在待处理交互时角标挂上持续强调开关`（`'null' !== 'true'`）。三者恢复后均复跑 PASS。
- SOLUTION 对照: 需求追溯索引 R-01-026 行（主责子系统「宿主侧栏角标」）未变；子系统条目新增「「需要交互」持续强调」（对应 AC-08）与「弹窗明细的稳定刷新」（对应 R-02-003/AC-01、R-01-026/AC-02），实现位置均落在 `src/client.mjs`，与代码一致；`## 横切约束` 既有条目无需改动。
- commit: 待填（按用户偏好，改动留在本地工作树，未经明确决定不提交）
- review:
  - 审核方: Standards 轴子代理 fec711e0-2496-4d1b-b635-992e17ea0f29；Spec 轴子代理 b464db44-c733-4128-a5f0-278cc5d9ce3d（均独立于执行方；评审基线 HEAD `0c9db33` 的未提交工作树）。
  - 目的理解: 两轴均被告知——本次要同时兑现「弹窗悬停不闪烁」（东家观察「有活动会话时才闪」，即 1 秒运行卡时钟常开期间的逐轮重渲染）与「存在 `需要交互` 时常闪直到处理完成」；常闪须与仓库既有「瞬时过程不得无界」（`dap-opening` 限次断言）划清边界；弹窗复用不得削弱既有刷新语义。
  - 执行方式: code-review skill，两轴并行独立子代理，只读工作树并逐条给出 file:line。
  - 问题与修复: **Standards 轴**——①C-099 违反 RATIONALE「不写代码路径/行号」纪律（改述为「门禁至今断言该提示为限次动画」）；②`rec.group` 存入但从不读取（删除该字段并同步 JSDoc）；③`BADGE_MODAL_GROUPS` 自称单点口径却在 `renderBadgeModal` 重复硬编码三元组（渲染改为直接遍历该常量取 `badgeEntries[tone]`）；④`badgeModalBody` 退化为中间人（连同声明与卸载清理一并删除，就位判据收敛为 `badgeModalGroups !== null`）；⑤`item.title.textContent` 无条件赋值而 `ws` 有守卫（统一为先比再写）；⑥task 边界配置行声称的 reduced-motion 覆盖无证据、且 `::after` 双冒号会破坏 lint 锚点解析（spec 补断言计算色 `rgb(255, 202, 74)` 的分支，锚点改用无冒号 CSS 选择器）。**Spec 轴**——⑦`rec.count.textContent` 每轮无条件写入违反 R-02-003/AC-01 且属断言盲区（代码改先比再写，spec 补「同值 DOM 写入 = 0」判据并用缺陷注入证伪，3 次空转必失败）；⑧「渲染时钟 armed」守卫用角标 aria-label 属过期值代理量（改用窗格滚动区 DOM 写入作为正向信号，判据 `paneWrites > 0`）；⑨条目数与角标计数分两趟读取存在抖动窗口（合并进同一趟 evaluate 并用 until 轮询）；⑩「悬停不丢」只由节点未重建间接代表（补 `hoverFlips === 0` 逐帧判据，直接锚定指针静止时 :hover 不掉落重命中）。
  - 复审结论: 两轴共 10 条 finding 全部处置并复跑验证——`check.mjs` 全绿、两条 lint 通过、5 个相关 spec 全 PASS、全量套件 24 PASS；三条独立缺陷注入各自命中预期判据（24 次节点替换 / 3 次同值写入 / `'null' !== 'true'`）。残余风险：(a) 新增的 1.6s 常闪是仓库第五个无界动画族，`scripts/check.mjs` 对该 glyph 无任何断言，防误改只靠 `badge-interaction-pulse.mjs`（Spec 轴指出、执行方接受：加 check 断言会把 CSS 字面量锁死，与本次「结构改写不触碰既有断言」的取向一致）；(b)「一次性新增强调与常闪同现期间的级联接管」无当帧断言（spec 只在稳态接手后断言，级联正确性由 CSS 权重与源码顺序保证，属静态推理而非实测）；(c) 本次为覆盖弹窗内部结构改写，未新增 `check.mjs` 结构断言（既有 check 无相关断言，风险由 e2e 承担）。
