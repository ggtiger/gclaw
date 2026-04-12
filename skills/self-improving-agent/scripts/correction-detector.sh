#!/bin/bash
# GClaw 用户纠正自动检测脚本
# 从 stdin 读取 UserPromptSubmit 事件的 JSON 上下文
# 检测用户消息中的纠正/功能请求/知识纠正关键词
# 自动写入 .learnings/LEARNINGS.md 或 FEATURE_REQUESTS.md
set -euo pipefail

# 从 stdin 读取 JSON 上下文
CONTEXT=$(cat)

# 提取用户消息（尝试多个可能的字段名）
USER_MSG=$(echo "$CONTEXT" | grep -o '"prompt":"[^"]*"' | head -1 | sed 's/"prompt":"//;s/"$//')
if [ -z "$USER_MSG" ]; then
  USER_MSG=$(echo "$CONTEXT" | grep -o '"message":"[^"]*"' | head -1 | sed 's/"message":"//;s/"$//')
fi
if [ -z "$USER_MSG" ]; then
  USER_MSG=$(echo "$CONTEXT" | grep -o '"content":"[^"]*"' | head -1 | sed 's/"content":"//;s/"$//')
fi

# 无消息则退出
if [ -z "$USER_MSG" ]; then
  exit 0
fi

# URL 解码（处理 %XX 编码）
USER_MSG=$(echo "$USER_MSG" | python3 -c "import sys, urllib.parse; print(urllib.parse.unquote(sys.stdin.read()))" 2>/dev/null || echo "$USER_MSG")

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
DATE_PART=$(date -u +"%Y%m%d")
RAND_HEX=$(printf '%03x' $((RANDOM % 4096)))

# 确定目标目录
PROJECT_DIR="${GCLAW_PROJECT_DIR:-.}"
LEARNINGS_DIR="${PROJECT_DIR}/.learnings"
mkdir -p "$LEARNINGS_DIR"

# ── 检测纠正关键词 ──
CORRECTION_KEYWORDS="不对|不是这样|应该是|搞错了|错了吧|你错了|不是那个|别用|不要用|换成|用错了|写错了|改一下|不对啊|理解错了|你理解反了|反了|说反了"
# ── 检测功能请求关键词 ──
FEATURE_KEYWORDS="能不能|有没有办法|为什么不能|可以加|想要.*功能|需要.*功能|帮我加|增加.*功能|添加|支持一下"
# ── 检测知识纠正关键词 ──
KNOWLEDGE_KEYWORDS="过时了|已经更新|最新的是|官方文档说|不是你说的|实际上|正确的是|其实"

# 截取用户消息（最多 300 字符用于记录）
MSG_PREVIEW=$(echo "$USER_MSG" | head -c 300)

# 检测并分类
CATEGORY=""
TARGET_FILE=""

if echo "$USER_MSG" | grep -qiE "$CORRECTION_KEYWORDS"; then
  CATEGORY="correction"
  TARGET_FILE="${LEARNINGS_DIR}/LEARNINGS.md"
elif echo "$USER_MSG" | grep -qiE "$FEATURE_KEYWORDS"; then
  CATEGORY="feature"
  TARGET_FILE="${LEARNINGS_DIR}/FEATURE_REQUESTS.md"
elif echo "$USER_MSG" | grep -qiE "$KNOWLEDGE_KEYWORDS"; then
  CATEGORY="knowledge_gap"
  TARGET_FILE="${LEARNINGS_DIR}/LEARNINGS.md"
else
  # 不匹配任何模式，静默退出
  exit 0
fi

# 确保目标文件存在
if [ ! -f "$TARGET_FILE" ]; then
  BASENAME=$(basename "$TARGET_FILE")
  case "$BASENAME" in
    LEARNINGS.md)
      cat > "$TARGET_FILE" << 'HDR'
# 经验日志

开发过程中捕获的纠正、知识发现和最佳实践。重大任务前应先回顾。

**分类**: correction | insight | knowledge_gap | best_practice
**区域**: frontend | backend | infra | tests | docs | config
**状态**: pending | in_progress | resolved | wont_fix | promoted | promoted_to_skill

---

HDR
      ;;
    FEATURE_REQUESTS.md)
      cat > "$TARGET_FILE" << 'HDR'
# 功能请求

用户请求的当前不存在的功能。

---

HDR
      ;;
  esac
fi

# 根据分类写入不同格式的条目
if [ "$CATEGORY" = "feature" ]; then
  ENTRY_ID="FEAT-${DATE_PART}-${RAND_HEX}"
  cat >> "$TARGET_FILE" << ENTRY

## [${ENTRY_ID}] user_feature_request

**Logged**: ${TIMESTAMP}
**Priority**: medium
**Status**: pending
**Area**: backend

### 请求的功能
${MSG_PREVIEW}

### 用户上下文
(待 Agent 补充)

### 复杂度评估
unknown

### 建议实现
(待 Agent 分析)

### 元数据
- Frequency: first_time
- Source: auto-detected

---
ENTRY
else
  ENTRY_ID="LRN-${DATE_PART}-${RAND_HEX}"
  cat >> "$TARGET_FILE" << ENTRY

## [${ENTRY_ID}] ${CATEGORY}

**Logged**: ${TIMESTAMP}
**Priority**: medium
**Status**: pending
**Area**: backend

### 摘要
用户纠正/补充: ${MSG_PREVIEW}

### 详情
(待 Agent 根据上下文补充完整记录)

### 建议操作
(待补充)

### 元数据
- Source: user_feedback
- Tags: ${CATEGORY}, auto-detected

---
ENTRY
fi

echo "[self-improvement] 检测到用户${CATEGORY}，已自动记录 ${ENTRY_ID}"
