/**
 * AI 自动生成 & 优化工作流命令
 */

import { callLLM } from '@/lib/llm'
import { validateCommand } from '@/lib/commands/validator'
import type { CommandDefinition } from '@/types/commands'
import fs from 'fs'
import path from 'path'

/** 从 LLM 返回的文本中提取 JSON（清理 markdown 代码块） */
function extractJSON(text: string): string {
  // 去掉 ```json ... ``` 或 ``` ... ``` 包裹
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  // 尝试直接找 { ... } 块
  const braceMatch = text.match(/\{[\s\S]*\}/)
  if (braceMatch) return braceMatch[0]
  return text.trim()
}

/** 加载内置命令作为 few-shot 示例 */
function loadExamples(): string {
  try {
    const filePath = path.join(process.cwd(), 'data', 'commands.json')
    const raw = fs.readFileSync(filePath, 'utf-8')
    const commands: CommandDefinition[] = JSON.parse(raw)
    const selected = commands.filter(c => c.id === 'code-review' || c.id === 'doc-generator')
    return selected.map(c => JSON.stringify(c, null, 2)).join('\n\n---\n\n')
  } catch {
    return '(无法加载示例)'
  }
}

const GENERATE_SYSTEM_PROMPT = `你是一个专业的工作流命令设计师。你的任务是根据用户的描述生成一个完整的 CommandDefinition JSON 对象。

## CommandDefinition JSON 结构

\`\`\`typescript
interface CommandDefinition {
  id: string                    // 唯一标识，必须是 kebab-case（小写字母、数字、连字符）
  name: string                  // 显示名称
  description: string           // 命令描述
  category?: string             // 分类：development | analysis | writing | automation | other
  scope: 'global' | 'project'  // 作用域
  enabled: boolean              // 是否启用
  parameters?: CommandParameter[] // 命令参数
  steps: CommandStep[]          // 工作流步骤（至少 1 个）
  output?: { format?: 'markdown' | 'json' | 'text'; saveTo?: string }
  createdAt: string             // ISO 时间字符串
  updatedAt: string             // ISO 时间字符串
}

interface CommandParameter {
  name: string       // 参数名，只允许字母、数字、下划线，不能以数字开头
  type: 'string' | 'number' | 'boolean' | 'enum' | 'file'
  required: boolean
  default?: any
  description: string
  values?: string[]  // enum 类型必须提供
  placeholder?: string
}
\`\`\`

## 5 种步骤类型

### 1. prompt（AI 对话）
\`\`\`json
{
  "id": "step-id",
  "type": "prompt",
  "name": "步骤名称",
  "systemPrompt": "系统提示词",
  "userMessage": "用户消息，支持模板变量",
  "tools": ["Read", "Bash", "Grep", "Write"],
  "outputVar": "变量名",
  "onError": "stop"
}
\`\`\`

### 2. script（脚本执行）
\`\`\`json
{
  "id": "step-id",
  "type": "script",
  "name": "步骤名称",
  "command": "shell 命令",
  "cwd": "工作目录（可选）",
  "outputVar": "变量名",
  "onError": "stop"
}
\`\`\`

### 3. condition（条件分支）
\`\`\`json
{
  "id": "step-id",
  "type": "condition",
  "name": "步骤名称",
  "if": "条件表达式，如：{{steps.xxx.output}} contains '关键词'",
  "then": "目标步骤ID 或 [步骤ID数组]",
  "else": "目标步骤ID 或 [步骤ID数组]（可选）"
}
\`\`\`

### 4. command-ref（引用其他命令）
\`\`\`json
{
  "id": "step-id",
  "type": "command-ref",
  "name": "步骤名称",
  "commandId": "被引用的命令ID",
  "params": { "key": "value" },
  "outputVar": "变量名"
}
\`\`\`

### 5. parallel（并行执行）
\`\`\`json
{
  "id": "step-id",
  "type": "parallel",
  "name": "步骤名称",
  "branches": [
    [ { "id": "branch1-step1", "type": "prompt", ... } ],
    [ { "id": "branch2-step1", "type": "prompt", ... } ]
  ],
  "outputVar": "变量名"
}
\`\`\`

## 模板变量语法
- \`{{date}}\` - 当前日期
- \`{{projectId}}\` - 项目 ID
- \`{{params.xxx}}\` - 引用参数值
- \`{{steps.xxx.output}}\` - 引用前面步骤的输出

## 校验规则
- id 必须是 kebab-case（只允许小写字母、数字和连字符）
- 所有步骤 id 必须唯一
- 禁止危险命令：rm -rf、rm -r、sudo、mkfs、dd if=、format、fdisk、chmod 777、chown -R
- 每个 prompt 步骤的 systemPrompt 末尾必须包含输出规则：
  "【输出规则】\\n- 当你使用工具将内容写入文件后，不要在对话中重复输出文件内容\\n- 只需简洁确认操作结果，保持输出简洁"

## 要求
- 只输出一个合法的 JSON 对象，不要包含任何其他文本
- 根据用户描述合理设计步骤结构
- prompt 步骤要有高质量的 systemPrompt
- 合理使用参数让命令更灵活
- scope 默认为 'project'
- enabled 设为 true`

/**
 * 根据自然语言描述生成一个工作流命令
 */
export async function generateCommand(
  description: string,
  projectId: string
): Promise<CommandDefinition> {
  const examples = loadExamples()

  const systemPrompt = `${GENERATE_SYSTEM_PROMPT}

## 参考示例

以下是 2 个内置命令的完整 JSON 结构，供你参考风格和结构：

${examples}`

  const userPrompt = `请根据以下描述生成一个工作流命令的完整 JSON：

${description}

请直接输出 JSON 对象，不要添加任何解释。`

  const result = await callLLM({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 4096,
    timeoutMs: 30000,
    projectId,
  })

  if (!result) {
    throw new Error('LLM 调用失败，未返回有效结果。请检查 API 配置。')
  }

  let parsed: CommandDefinition
  try {
    const jsonStr = extractJSON(result)
    parsed = JSON.parse(jsonStr) as CommandDefinition
  } catch (e) {
    throw new Error(`LLM 返回的 JSON 解析失败: ${(e as Error).message}\n\n原始输出片段: ${result.slice(0, 500)}`)
  }

  // 自动填充字段
  const now = new Date().toISOString()
  parsed.createdAt = now
  parsed.updatedAt = now
  parsed.enabled = true

  // 校验
  const validation = validateCommand(parsed)
  if (!validation.valid) {
    throw new Error(`生成的命令校验失败:\n${validation.errors.join('\n')}`)
  }

  return parsed
}

const OPTIMIZE_SYSTEM_PROMPT = `你是一个专业的工作流优化师。你的任务是优化给定的工作流命令，使其更加高效、健壮、易维护。

## 默认优化方向
1. **精简步骤**：合并冗余步骤，移除不必要的中间环节
2. **提高并行度**：将可以同时执行的步骤用 parallel 包裹
3. **增强错误处理**：为关键步骤添加合适的 onError 策略
4. **优化 prompt 质量**：改善 systemPrompt 和 userMessage，使指令更清晰精确
5. **完善参数设计**：添加缺失的参数校验、默认值和描述

## 规则
- 保持命令的 id 不变
- 保持命令的核心功能不变
- 只输出优化后的完整 JSON 对象
- 所有步骤 id 必须唯一且为 kebab-case
- 禁止危险命令（rm -rf、sudo 等）
- prompt 步骤的 systemPrompt 末尾需包含输出规则约束`

/**
 * 优化已有的工作流命令
 */
export async function optimizeCommand(
  command: CommandDefinition,
  instruction?: string
): Promise<CommandDefinition> {
  const userPrompt = `请优化以下工作流命令：

\`\`\`json
${JSON.stringify(command, null, 2)}
\`\`\`

${instruction ? `\n用户指定的优化方向：${instruction}` : '请按照默认优化方向进行全面优化。'}

请直接输出优化后的完整 JSON 对象，不要添加任何解释。`

  const result = await callLLM({
    system: OPTIMIZE_SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 4096,
    timeoutMs: 30000,
    projectId: command.scope === 'project' ? command.id : undefined,
  })

  if (!result) {
    throw new Error('LLM 调用失败，未返回有效结果。请检查 API 配置。')
  }

  let parsed: CommandDefinition
  try {
    const jsonStr = extractJSON(result)
    parsed = JSON.parse(jsonStr) as CommandDefinition
  } catch (e) {
    throw new Error(`LLM 返回的 JSON 解析失败: ${(e as Error).message}\n\n原始输出片段: ${result.slice(0, 500)}`)
  }

  // 保持原始 id 和时间
  parsed.id = command.id
  parsed.createdAt = command.createdAt
  parsed.updatedAt = new Date().toISOString()
  parsed.enabled = command.enabled

  // 校验
  const validation = validateCommand(parsed)
  if (!validation.valid) {
    throw new Error(`优化后的命令校验失败:\n${validation.errors.join('\n')}`)
  }

  return parsed
}
