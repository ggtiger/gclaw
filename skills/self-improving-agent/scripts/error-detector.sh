#!/bin/bash
# GClaw 自我改进错误检测脚本
# 检测命令执行失败，提醒记录到经验日志

set -e

# 从环境变量读取工具输出
OUTPUT="${CLAUDE_TOOL_OUTPUT:-}"

# 错误模式匹配（大小写不敏感）
ERROR_PATTERNS=(
    "error:"
    "Error:"
    "ERROR:"
    "failed"
    "FAILED"
    "command not found"
    "No such file"
    "Permission denied"
    "fatal:"
    "Exception"
    "Traceback"
    "npm ERR!"
    "ModuleNotFoundError"
    "SyntaxError"
    "TypeError"
    "ReferenceError"
    "exit code"
    "non-zero"
    "ENOENT"
    "EACCES"
    "EEXIST"
    "Cannot find module"
    "Build error"
    "Compilation failed"
)

# 检查输出是否包含错误模式
contains_error=false
for pattern in "${ERROR_PATTERNS[@]}"; do
    if [[ "$OUTPUT" == *"$pattern"* ]]; then
        contains_error=true
        break
    fi
done

# 仅在检测到错误时输出提醒
if [ "$contains_error" = true ]; then
    cat << 'EOF'
<error-detected>
检测到命令错误。如果满足以下条件，请记录到 skills/self-improving-agent/.learnings/ERRORS.md：
- 错误是意外的或非显而易见的
- 需要调查才能解决
- 可能在类似场景中重复出现
- 解决方案对后续会话有帮助

格式：[ERR-YYYYMMDD-XXX]
</error-detected>
EOF
fi
