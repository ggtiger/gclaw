#!/bin/bash
# setup-node.sh — 构建嵌入式 Node.js 运行时
#
# 参考: genvis/scripts/build-node-runtime-mac.sh
# 方法: 从 nodejs.org 官方下载预编译二进制
#
# 下载 Node.js 到 src-tauri/node/ 目录，精简体积。
#
# 用法: bash scripts/setup-node.sh [--arch arm64|x64] [--version 22.18.0] [--force]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAURI_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$TAURI_DIR/node"

# 默认参数
NODE_VERSION="22.18.0"
ARCH="arm64"
FORCE=false

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --arch)    ARCH="$2"; shift 2 ;;
        --version) NODE_VERSION="$2"; shift 2 ;;
        --force)   FORCE=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# 自动检测架构
if [[ "$ARCH" == "auto" ]]; then
    ARCH=$(uname -m)
    case $ARCH in
        arm64)  ARCH="arm64" ;;
        x86_64) ARCH="x64" ;;
        *)      echo "Unsupported arch: $ARCH"; exit 1 ;;
    esac
fi

# 架构映射
if [[ "$ARCH" == "x64" ]]; then
    NODE_ARCH="x64"
else
    NODE_ARCH="arm64"
fi

echo ""
echo "=== 构建 Node.js 运行时 ($ARCH) ==="
echo "Node.js: $NODE_VERSION  Arch: darwin-$NODE_ARCH"
echo ""

# 检查已存在的版本
if [[ "$FORCE" == false ]] && [[ -x "$OUTPUT_DIR/bin/node" ]]; then
    INSTALLED=$("$OUTPUT_DIR/bin/node" --version 2>/dev/null | sed 's/^v//' || echo "")
    if [[ "$INSTALLED" == "$NODE_VERSION" ]]; then
        echo "[skip] Node.js v$NODE_VERSION 已存在，跳过。使用 --force 重新下载。"
        exit 0
    fi
fi

# [1/6] 创建临时目录
TEMP_DIR=$(mktemp -d)
cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT
echo "[1/6] 临时目录: $TEMP_DIR"

# [2/6] 获取 SHA256 校验值
BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
FILE_NAME="node-v${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz"
DOWNLOAD_URL="$BASE_URL/$FILE_NAME"
SHASUMS_URL="$BASE_URL/SHASUMS256.txt"

echo "[2/6] 获取 SHA256 校验值..."
EXPECTED_HASH=$(curl -sL "$SHASUMS_URL" | grep "$FILE_NAME" | awk '{print $1}')

if [[ -z "$EXPECTED_HASH" ]]; then
    echo "Error: 未找到 $FILE_NAME 的 hash 值"
    echo "  请检查版本号: $NODE_VERSION"
    echo "  https://nodejs.org/dist/v${NODE_VERSION}/"
    exit 1
fi
echo "  SHA256: $EXPECTED_HASH"

# [3/6] 下载
DOWNLOAD_FILE="$TEMP_DIR/node.tar.gz"
echo "[3/6] 下载 Node.js v${NODE_VERSION} (darwin-${NODE_ARCH})..."
echo "  URL: $DOWNLOAD_URL"

if ! curl -L -f --progress-bar -o "$DOWNLOAD_FILE" "$DOWNLOAD_URL"; then
    echo ""
    echo "Error: 下载失败！"
    exit 1
fi

FILE_SIZE=$(du -h "$DOWNLOAD_FILE" | cut -f1)
echo "  已下载: $FILE_SIZE"

# 校验 SHA256
echo "  校验中..."
ACTUAL_HASH=$(shasum -a 256 "$DOWNLOAD_FILE" | awk '{print $1}')
if [[ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]]; then
    echo "Error: SHA256 不匹配！"
    echo "  Expected: $EXPECTED_HASH"
    echo "  Got: $ACTUAL_HASH"
    exit 1
fi
echo "  校验通过"

# [4/6] 解压
echo "[4/6] 解压..."
tar -xzf "$DOWNLOAD_FILE" -C "$TEMP_DIR"
NODE_SRC="$TEMP_DIR/node-v${NODE_VERSION}-darwin-${NODE_ARCH}"

if [[ ! -f "$NODE_SRC/bin/node" ]]; then
    echo "Error: node 二进制文件不存在！"
    exit 1
fi

# 拷贝到目标目录（只保留 bin + lib）
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
cp -R "$NODE_SRC/bin" "$OUTPUT_DIR/"
cp -R "$NODE_SRC/lib" "$OUTPUT_DIR/"

# 精简: 移除不需要的文件
echo "  精简中..."
NPM_DIR="$OUTPUT_DIR/lib/node_modules/npm"
if [[ -d "$NPM_DIR/docs" ]]; then
    rm -rf "$NPM_DIR/docs"
fi
if [[ -d "$NPM_DIR/man" ]]; then
    rm -rf "$NPM_DIR/man"
fi
if [[ -d "$NPM_DIR/changelogs" ]]; then
    rm -rf "$NPM_DIR/changelogs"
fi

# [5/6] 设置权限
echo "[5/6] 设置权限..."
chmod +x "$OUTPUT_DIR/bin/node"
chmod +x "$OUTPUT_DIR/bin/npm" 2>/dev/null || true
chmod +x "$OUTPUT_DIR/bin/npx" 2>/dev/null || true

# [6/6] 验证
echo "[6/6] 验证..."
NODE_EXE="$OUTPUT_DIR/bin/node"

VERSION_OUTPUT=$("$NODE_EXE" --version 2>&1)
echo "  版本: $VERSION_OUTPUT"

# 测试能否启动
if "$NODE_EXE" -e "console.log('  启动测试: OK')" 2>&1; then
    true
else
    echo "  错误: Node.js 启动失败！"
    exit 1
fi

# 测试 npm
if "$NODE_EXE" "$OUTPUT_DIR/bin/npm" --version >/dev/null 2>&1; then
    NPM_VER=$("$NODE_EXE" "$OUTPUT_DIR/bin/npm" --version 2>&1)
    echo "  npm: v$NPM_VER"
fi

# 统计大小
TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" | cut -f1)
echo ""
echo "=== 构建完成 ==="
echo "目录: $OUTPUT_DIR ($TOTAL_SIZE)"
echo ""
