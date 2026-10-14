// dsh-activity-pane 宿主侧入口（C-030）：转发到 src/host.mjs 的实现。
// 本文件保持静态、免构建；实现改动只发生在 src/host.mjs。
import { apply, inject, name } from '../src/host.mjs'
// 新增配置通道（面板位置 / 隐藏最近历史 / 最近历史可折叠）：Config 由宿主设置服务
// 投影成设置表单，须从插件入口导出（cordis 取 plugin.Config 作为 schema）。
// 单独一行导出：原「export { apply, inject, name }」逐字保留，避免改动既有契约断言。
import { Config } from '../src/host.mjs'

export { apply, inject, name }
export { Config }