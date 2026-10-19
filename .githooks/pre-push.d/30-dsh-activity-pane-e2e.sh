#!/usr/bin/env bash
# dsh-activity-pane 完整门禁（C-046、T-085）：快速检查 + 浏览器 E2E。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
export PLAYWRIGHT_BROWSERS_PATH=0
# pnpm verify 已从 package.json 移除（C-104：验证默认手动），这里内联原来的两步
exec pnpm lint && pnpm check && pnpm test:e2e
