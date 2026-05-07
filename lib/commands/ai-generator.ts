/**
 * AI 自动生成 & 优化工作流命令
 */

import { callLLM } from '@/lib/llm'
import { validateCommand } from '@/lib/commands/validator'
import type { CommandDefinition } from '@/types/commands'
import { DATA_DIR } from '@/lib/store/projects'
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

/** 尝试修复被截断的 JSON 字符串 */
function repairTruncatedJSON(jsonStr: string): string {
  let str = jsonStr.trim()
  // 如果已经是合法 JSON，直接返回
  try { JSON.parse(str); return str } catch { /* continue */ }

  // 修复未闭合的字符串：如果奇数个未转义引号，补一个引号
  const unescapedQuotes = str.match(/(?<!\\)"/g)
  if (unescapedQuotes && unescapedQuotes.length % 2 !== 0) {
    str += '"'
  }

  // 移除末尾不完整的键值对（如 "key": "未完成的值 ）
  // 先去掉末尾的逗号
  str = str.replace(/,\s*$/, '')

  // 计算未闭合的括号并补全
  let braces = 0
  let brackets = 0
  let inString = false
  let escape = false
  for (const ch of str) {
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') braces++
    else if (ch === '}') braces--
    else if (ch === '[') brackets++
    else if (ch === ']') brackets--
  }

  // 补全未闭合的括号
  for (let i = 0; i < brackets; i++) str += ']'
  for (let i = 0; i < braces; i++) str += '}'

  return str
}

/** 加载一个精简的内置命令作为 few-shot 示例（只保留结构，缩短长文本字段） */
function loadExample(): string {
  try {
    const filePath = path.join(DATA_DIR, 'commands.json')
    console.log('[AI Generator] Loading example from:', filePath)
    const raw = fs.readFileSync(filePath, 'utf-8')
    const commands: CommandDefinition[] = JSON.parse(raw)
    const selected = commands.find(c => c.id === 'code-review')
    if (!selected) return '(无示例)'
    // 精简：截断长字段，只保留结构参考
    const slim = {
      ...selected,
      steps: selected.steps.map(s => ({
        ...s,
        systemPrompt: 'systemPrompt' in s && typeof (s as any).systemPrompt === 'string'
          ? (s as any).systemPrompt.slice(0, 150) + '...（省略）'
          : undefined,
      })),
    }
    return JSON.stringify(slim, null, 2)
  } catch {
    return '(无法加载示例)'
  }
}

const GENERATE_SYSTEM_PROMPT = `你是工作流命令设计师。根据用户描述生成 CommandDefinition JSON。

## 结构

\`\`\`typescript
interface CommandDefinition {
  id: string           // kebab-case
  name: string
  description: string
  category?: 'development' | 'analysis' | 'writing' | 'automation' | 'other'
  scope: 'global' | 'project'
  enabled: boolean
  autoExecute?: boolean // 自动执行模式，跳过步骤间确认，适合无需人工干预的流水线任务
  parameters?: { name: string; type: 'string'|'number'|'boolean'|'enum'|'file'; required: boolean; default?: any; description: string; values?: string[]; placeholder?: string }[]
  steps: CommandStep[] // 至少1个
  output?: { format?: 'markdown'|'json'|'text'; saveTo?: string }
  createdAt: string    // ISO
  updatedAt: string    // ISO
}
\`\`\`

## 步骤类型（仅支持以下6种，type 字段只允许这6个值）
1. **prompt** - AI 调用: { id, type:"prompt", name, systemPrompt, userMessage, tools?:["Read","Bash","Grep","Write"], agent?, maxTurns?, outputVar?, onError? }
2. **script** - Shell 脚本/命令执行（bash、sh 等都用此类型）: { id, type:"script", name, command, cwd?, outputVar?, timeout?, retryCount?(重试次数，默认0), retryDelay?(重试间隔ms，默认3000), onError? }
3. **condition** - 条件分支: { id, type:"condition", name, if, then, else?, onError? }
4. **command-ref** - 引用其他命令: { id, type:"command-ref", name, commandId, params?, outputVar?, onError? }
5. **parallel** - 并行执行: { id, type:"parallel", name, branches:[[step,...],[step,...]], outputVar?, onError? }
6. **dynamic-exec** - AI动态生成并执行命令: { id, type:"dynamic-exec", name, intent（意图描述）, cwd?, constraints?（约束）, outputVar?, onError? }

☹️ 严禁使用 "bash"、"shell"、"exec" 等未列出的类型。执行 shell 命令请使用 type:"script"。如果需要 AI 动态生成命令再执行，使用 type:"dynamic-exec"。

模板变量: {{date}}, {{projectId}}, {{params.xxx}}, {{steps.xxx.output}}

## 规则
- id 只允许小写字母、数字、连字符
- 禁止危险命令(rm -rf, sudo等)
- prompt步骤的systemPrompt末尾必须包含："【输出规则】\n- 当你使用工具将内容写入文件后，不要在对话中重复输出文件内容\n- 只需简洁确认操作结果，保持输出简洁"
- 只输出一个合法JSON对象，不包含其他文本
- scope默认'project'，enabled设为true
- autoExecute 默认不设置（false），当工作流为全自动流水线且无需用户介入时可设为 true

## 脚本目录规范
- 项目命令文件存放在 .commands/commands.json
- 较长的脚本应保存到 .commands/scripts/ 目录
- script 步骤可以用 "scripts/文件名" 引用脚本文件（如 "scripts/build.sh"）
- 短命令直接写在 command 字段中即可`

/**
 * 根据自然语言描述生成一个工作流命令
 */
export async function generateCommand(
  description: string,
  projectId: string
): Promise<CommandDefinition> {
  const example = loadExample()

  const systemPrompt = `${GENERATE_SYSTEM_PROMPT}

## 参考示例

${example}`

  const userPrompt = `请根据以下描述生成一个工作流命令的完整 JSON：

${description}

请直接输出 JSON 对象，不要添加任何解释。`

  const result = await callLLM({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 8192,
    timeoutMs: 120000,
    projectId,
  })

  if (!result) {
    throw new Error('LLM 调用失败，未返回有效结果。请检查 API 配置。')
  }

  let parsed: CommandDefinition
  try {
    let jsonStr = extractJSON(result)
    try {
      parsed = JSON.parse(jsonStr) as CommandDefinition
    } catch {
      // 尝试修复被截断的 JSON
      jsonStr = repairTruncatedJSON(jsonStr)
      parsed = JSON.parse(jsonStr) as CommandDefinition
    }
  } catch (e) {
    throw new Error(`LLM 返回的 JSON 解析失败（可能输出被截断）: ${(e as Error).message}\n\n原始输出片段: ${result.slice(0, 500)}`)
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
- prompt 步骤的 systemPrompt 末尾需包含输出规则约束
- 步骤类型只允许 6 种：prompt、script、condition、command-ref、parallel、dynamic-exec。严禁使用 "bash"、"shell"、"exec" 等未列出的类型，执行 shell 命令请使用 type:"script"，需要 AI 动态生成命令再执行使用 type:"dynamic-exec"`

/**
 * 优化已有的工作流命令
 */
export async function optimizeCommand(
  command: CommandDefinition,
  instruction?: string,
  projectId?: string
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
    maxTokens: 8192,
    timeoutMs: 120000,
    projectId,
  })

  if (!result) {
    throw new Error('LLM 调用失败，未返回有效结果。请检查 API 配置。')
  }

  let parsed: CommandDefinition
  try {
    let jsonStr = extractJSON(result)
    try {
      parsed = JSON.parse(jsonStr) as CommandDefinition
    } catch {
      jsonStr = repairTruncatedJSON(jsonStr)
      parsed = JSON.parse(jsonStr) as CommandDefinition
    }
  } catch (e) {
    throw new Error(`LLM 返回的 JSON 解析失败（可能输出被截断）: ${(e as Error).message}\n\n原始输出片段: ${result.slice(0, 500)}`)
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
