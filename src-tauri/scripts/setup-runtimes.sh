#!/bin/bash
# setup-runtimes.sh — 构建所有内嵌运行时（打包前调用）
#
# 依次构建 Node.js 和 Python 运行时到 src-tauri/node/ 和 src-tauri/python/
# 已存在的版本会自动跳过，使用 --force 重新下载
#
# 用法: bash scripts/setup-runtimes.sh [--force]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FORCE_FLAG=""
if [[ "${1:-}" == "--force" ]]; then
    FORCE_FLAG="--force"
fi

echo "========================================="
echo "  GClaw 内嵌运行时构建"
echo "========================================="
echo ""

# 1. Node.js
echo ">>> [1/2] Node.js"
bash "$SCRIPT_DIR/setup-node.sh" $FORCE_FLAG
echo ""

# 2. Python
echo ">>> [2/2] Python"
bash "$SCRIPT_DIR/setup-python.sh" $FORCE_FLAG
echo ""

echo "========================================="
echo "  所有运行时构建完成！"
echo "========================================="
echo ""
du -sh "$SCRIPT_DIR/../node" "$SCRIPT_DIR/../python" 2>/dev/null
echo ""
