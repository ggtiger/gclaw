#!/bin/bash
# GClaw 自动错误记录器
# 从 stdin 读取 JSON 上下文，自动生成结构化 ERR 条目写入 .learnings/ERRORS.md
# 由 gclaw-hooks.json 的 script action 调用

set -euo pipefail

# 从 stdin 读取 JSON 上下文
CONTEXT=$(cat)

# 提取字段（使用简单字符串解析，不依赖 jq）
TOOL_NAME=$(echo "$CONTEXT" | grep -o '"toolName":"[^"]*"' | head -1 | sed 's/"toolName":"//;s/"//')
TOOL_INPUT=$(echo "$CONTEXT" | grep -o '"toolInput":[^}]*' | head -1 | sed 's/"toolInput"://')
TOOL_RESPONSE=$(echo "$CONTEXT" | grep -o '"toolResponse":"[^"]*"' | head -1 | sed 's/"toolResponse":"//;s/"$//')
ERROR_MSG=$(echo "$CONTEXT" | grep -o '"error":"[^"]*"' | head -1 | sed 's/"error":"//;s/"$//')
TIMESTAMP=$(echo "$CONTEXT" | grep -o '"timestamp":"[^"]*"' | head -1 | sed 's/"timestamp":"//;s/"$//')

# 如果没有时间戳，使用当前时间
if [ -z "$TIMESTAMP" ]; then
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
fi

# 生成条目 ID: ERR-YYYYMMDD-XXX（3位随机十六进制）
DATE_PART=$(echo "$TIMESTAMP" | cut -c1-10 | tr -d '-')
RAND_HEX=$(printf '%03x' $((RANDOM % 4096)))
ENTRY_ID="ERR-${DATE_PART}-${RAND_HEX}"

# 确定目标目录：优先使用 GCLAW_PROJECT_DIR，否则用 cwd
PROJECT_DIR="${GCLAW_PROJECT_DIR:-.}"
LEARNINGS_DIR="${PROJECT_DIR}/.learnings"
ERRORS_FILE="${LEARNINGS_DIR}/ERRORS.md"

# 创建目录和文件（如不存在）
mkdir -p "$LEARNINGS_DIR"
if [ ! -f "$ERRORS_FILE" ]; then
  cat > "$ERRORS_FILE" << 'HEADER'
# 错误日志

> 由 self-improving-agent 技能自动记录。Agent 可补充详情后将 Status 改为 resolved。

---
HEADER
fi

# 生成摘要（截断过长的错误信息）
if [ -n "$ERROR_MSG" ]; then
  SUMMARY=$(echo "$ERROR_MSG" | head -c 120)
elif [ -n "$TOOL_RESPONSE" ]; then
  SUMMARY=$(echo "$TOOL_RESPONSE" | head -c 120)
else
  SUMMARY="${TOOL_NAME:-unknown} 执行失败"
fi

# 清理 TOOL_INPUT 用于上下文记录
if [ -n "$TOOL_INPUT" ]; then
  CTX_INPUT=$(echo "$TOOL_INPUT" | head -c 500)
else
  CTX_INPUT="(无)"
fi

# 确定区域
AREA="backend"
if echo "$CTX_INPUT" | grep -qi "\.tsx\|\.jsx\|\.css\|component\|hook\|page\."; then
  AREA="frontend"
elif echo "$CTX_INPUT" | grep -qi "\.test\.\|spec\.\|__tests__"; then
  AREA="tests"
elif echo "$CTX_INPUT" | grep -qi "\.ya?ml\|\.json\|\.env\|config"; then
  AREA="config"
fi

# 写入条目
cat >> "$ERRORS_FILE" << ENTRY

## [${ENTRY_ID}] ${TOOL_NAME:-unknown}

**Logged**: ${TIMESTAMP}
**Priority**: medium
**Status**: pending
**Area**: ${AREA}

### 摘要
${SUMMARY}

### 错误信息
\`\`\`
$(echo "${ERROR_MSG:-${TOOL_RESPONSE}}" | head -c 1000)
\`\`\`

### 上下文
- 工具: ${TOOL_NAME:-unknown}
- 输入: ${CTX_INPUT}

### 建议修复
(待 Agent 补充)

### 元数据
- Reproducible: unknown
- Source: auto-recorded

---
ENTRY

echo "[self-improvement] 自动记录错误 ${ENTRY_ID} 到 .learnings/ERRORS.md"
