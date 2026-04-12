#!/bin/bash
# GClaw 会话启动上下文注入脚本
# 读取项目 .learnings/ 中的 pending 条目，输出摘要
# 由 gclaw-hooks.json SessionStart script action 调用
# stdout 输出会注入到 Agent 上下文

set -euo pipefail

PROJECT_DIR="${GCLAW_PROJECT_DIR:-.}"
LEARNINGS_DIR="${PROJECT_DIR}/.learnings"

if [ ! -d "$LEARNINGS_DIR" ]; then
  exit 0
fi

# 收集 pending 条目摘要
PENDING=""
for md_file in "$LEARNINGS_DIR"/*.md; do
  [ -f "$md_file" ] || continue
  # 提取 pending 状态的条目标题
  while IFS= read -r line; do
    if [[ "$line" =~ ^##\ \[([A-Z]+-[0-9]+-[0-9A-Z]+)\] ]]; then
      CURRENT_ID="${BASH_REMATCH[1]}"
    fi
    if [[ "$line" == *"Status"*": pending"* ]] && [ -n "${CURRENT_ID:-}" ]; then
      PENDING="${PENDING}\n- ${CURRENT_ID}"
      CURRENT_ID=""
    fi
  done < "$md_file"
done

if [ -z "$PENDING" ]; then
  # 无 pending 条目，输出简要状态
  TOTAL=$(grep -rh "^## \[" "$LEARNINGS_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
  if [ "${TOTAL:-0}" -gt 0 ]; then
    echo "[self-improvement] .learnings/ 中有 ${TOTAL} 条历史经验（均已处理），无待处理条目。"
  fi
  exit 0
fi

# 有 pending 条目，输出摘要
PENDING_COUNT=$(echo -e "$PENDING" | grep -c "^-")
echo "[self-improvement] .learnings/ 中有 ${PENDING_COUNT} 条待处理经验："
echo -e "$PENDING"
echo ""
echo "开始工作前，建议用 cat .learnings/ERRORS.md 等查看详情，避免重复犯错。"
