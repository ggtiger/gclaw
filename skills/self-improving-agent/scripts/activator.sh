#!/bin/bash
# GClaw 自我改进提醒脚本
# 任务完成后注入评估提醒，帮助 Agent 捕获有价值的经验
# 开销: ~50-100 tokens

set -e

# 获取技能目录路径
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LEARNINGS_DIR="$SKILL_DIR/.learnings"

# 统计待处理条目
PENDING_COUNT=0
if [ -d "$LEARNINGS_DIR" ]; then
    PENDING_COUNT=$(grep -rh "Status\*\*: pending" "$LEARNINGS_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
fi

cat << EOF
<self-improvement-reminder>
完成任务后，评估是否有可提取的知识：
- 通过调试发现了非显而易见的解决方案？
- 发现了意外行为的变通方案？
- 学到了项目特有的模式或约定？
- 解决错误花费了较多时间？

如果是：记录到 skills/self-improving-agent/.learnings/
如果高价值（重复出现、广泛适用）：提升为项目记忆（update_memory）或提取为新技能。
${PENDING_COUNT:+
待处理经验条目: $PENDING_COUNT 条}
</self-improvement-reminder>
EOF
