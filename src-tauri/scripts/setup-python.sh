#!/bin/bash
# setup-python.sh — 构建嵌入式 Python 运行时
#
# 参考: genvis/scripts/build-python-runtime-mac.sh
# 方法: python-build-standalone (Astral)
#
# 下载独立 Python 到 src-tauri/python/ 目录，
# 安装 skills 所需的 pip 包 (requests, pyyaml)，并精简体积。
#
# 用法: bash scripts/setup-python.sh [--arch arm64|x64] [--force]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAURI_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$TAURI_DIR/python"

# 默认参数
PYTHON_VERSION="3.12.13"
RELEASE_TAG="20260325"
ARCH="arm64"
FORCE=false

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --arch)   ARCH="$2"; shift 2 ;;
        --force)  FORCE=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# 检测当前系统架构
if [[ "$ARCH" == "auto" || -z "$ARCH" ]]; then
    ARCH=$(uname -m)
    case $ARCH in
        arm64)  ARCH="arm64" ;;
        x86_64) ARCH="x64" ;;
        *)      echo "Unsupported arch: $ARCH"; exit 1 ;;
    esac
fi

# 架构映射
if [[ "$ARCH" == "x64" ]]; then
    PYTHON_ARCH="x86_64"
else
    PYTHON_ARCH="aarch64"
fi

echo ""
echo "=== 构建 Python 运行时 ($ARCH) ==="
echo "Python: $PYTHON_VERSION  Release: $RELEASE_TAG  Arch: $PYTHON_ARCH-apple-darwin"
echo ""

# 检查已存在的版本
if [[ "$FORCE" == false ]] && [[ -x "$OUTPUT_DIR/bin/python3" ]]; then
    INSTALLED=$("$OUTPUT_DIR/bin/python3" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')" 2>/dev/null || echo "")
    if [[ "$INSTALLED" == "$PYTHON_VERSION" ]]; then
        echo "[skip] Python $PYTHON_VERSION 已存在，跳过。使用 --force 重新下载。"
        exit 0
    fi
fi

# [1/5] 创建临时目录
TEMP_DIR=$(mktemp -d)
cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT
echo "[1/5] 临时目录: $TEMP_DIR"

# [2/5] 下载
DOWNLOAD_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE_TAG}/cpython-${PYTHON_VERSION}+${RELEASE_TAG}-${PYTHON_ARCH}-apple-darwin-install_only.tar.gz"
DOWNLOAD_FILE="$TEMP_DIR/python.tar.gz"

echo "[2/5] 下载 Python ${PYTHON_VERSION} (${PYTHON_ARCH})..."
echo "  URL: $DOWNLOAD_URL"

if ! curl -L -f --progress-bar -o "$DOWNLOAD_FILE" "$DOWNLOAD_URL"; then
    echo ""
    echo "Error: 下载失败！请检查:"
    echo "  1. Release tag: $RELEASE_TAG"
    echo "  2. Python version: $PYTHON_VERSION"
    echo "  3. https://github.com/astral-sh/python-build-standalone/releases/tag/$RELEASE_TAG"
    exit 1
fi

FILE_SIZE=$(du -h "$DOWNLOAD_FILE" | cut -f1)
echo "  已下载: $FILE_SIZE"

# [3/5] 解压
echo "[3/5] 解压..."
EXTRACT_DIR="$TEMP_DIR/extracted"
mkdir -p "$EXTRACT_DIR"
tar -xzf "$DOWNLOAD_FILE" -C "$EXTRACT_DIR"

# 定位 Python 目录
if [[ -d "$EXTRACT_DIR/python/bin" ]]; then
    PYTHON_SRC="$EXTRACT_DIR/python"
elif [[ -d "$EXTRACT_DIR/python/install/bin" ]]; then
    PYTHON_SRC="$EXTRACT_DIR/python/install"
else
    echo "Error: 找不到 Python 目录！"
    ls -la "$EXTRACT_DIR"
    exit 1
fi

if [[ ! -f "$PYTHON_SRC/bin/python3" ]]; then
    echo "Error: python3 二进制文件不存在！"
    exit 1
fi

echo "  找到: $PYTHON_SRC"

# 拷贝到目标目录
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
cp -R "$PYTHON_SRC/"* "$OUTPUT_DIR/"

# 精简: 移除不需要的文件
echo "  精简中..."
PYTHON_LIB="$OUTPUT_DIR/lib/python${PYTHON_VERSION%.*}"

if [[ -d "$PYTHON_LIB/test" ]]; then
    rm -rf "$PYTHON_LIB/test"
fi
if [[ -d "$PYTHON_LIB/idlelib" ]]; then
    rm -rf "$PYTHON_LIB/idlelib"
fi
if [[ -d "$PYTHON_LIB/tkinter" ]]; then
    rm -rf "$PYTHON_LIB/tkinter"
fi
find "$OUTPUT_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$OUTPUT_DIR" -name "*.pyo" -delete 2>/dev/null || true

# 清理 site-packages 中多余的包（保留 pip 和 setuptools）
SITE_PACKAGES="$PYTHON_LIB/site-packages"
if [[ -d "$SITE_PACKAGES" ]]; then
    find "$SITE_PACKAGES" -mindepth 1 -maxdepth 1 \
        ! -name 'pip' ! -name 'pip-*' ! -name 'setuptools' ! -name 'setuptools-*' \
        ! -name '_distutils_hack' ! -name 'distutils-precedence' ! -name 'README.txt' \
        -exec rm -rf {} + 2>/dev/null || true
fi

# [4/5] 安装 pip 包
echo "[4/5] 安装 pip 包: requests, pyyaml ..."
PYTHON_EXE="$OUTPUT_DIR/bin/python3"

if ! "$PYTHON_EXE" -m pip --version >/dev/null 2>&1; then
    echo "  安装 pip..."
    "$PYTHON_EXE" -m ensurepip --default-pip 2>&1 || true
fi

"$PYTHON_EXE" -m pip install --no-cache-dir --no-compile requests pyyaml

# [5/5] 验证
echo "[5/5] 验证..."

VERSION_OUTPUT=$("$PYTHON_EXE" --version 2>&1)
echo "  版本: $VERSION_OUTPUT"

# 测试 C 扩展
if "$PYTHON_EXE" -c "import _ctypes, _ssl, _socket; print('  C 扩展: OK')" 2>&1; then
    true
else
    echo "  警告: 部分 C 扩展不可用"
fi

# 测试已安装的包
if "$PYTHON_EXE" -c "import requests; import yaml; print('  requests + pyyaml: OK')" 2>&1; then
    true
else
    echo "  错误: pip 包导入失败！"
    exit 1
fi

# 统计大小
TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" | cut -f1)
echo ""
echo "=== 构建完成 ==="
echo "目录: $OUTPUT_DIR ($TOTAL_SIZE)"
echo ""
