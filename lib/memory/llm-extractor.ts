/**
 * LLM 辅助记忆提取器
 * 对话结束后调用轻量 LLM（Claude Haiku）提取结构化记忆
 * 作为关键词匹配的升级方案，提高提取精度
 *
 * 降级策略：API Key 缺失、调用失败、超时时返回 null，由调用方降级到正则提取
 */

import type { EpisodicEntry } from '@/types/memory'

/** LLM 提取模型（使用最便宜的 Haiku） */
const EXTRACT_MODEL = 'claude-haiku-4-20250414'
/** 超时时间（毫秒） */
const EXTRACT_TIMEOUT = 8000
/** 输入截断限制 */
const MAX_USER_MSG = 500
const MAX_REPLY = 1000

/** 情节记忆草稿（LLM 提取结果），扩展 title 字段供巩固使用 */
export type EpisodicDraft = Omit<EpisodicEntry, 'id' | 'timestamp'> & { title?: string }

const SYSTEM_PROMPT = `你是一个记忆提取助手。从用户和AI的对话中提取值得记住的信息。

你必须返回一个 JSON 对象，格式如下：
{
  "entries": [
    {
      "type": "preference | decision | error | discovery | milestone",
      "title": "简短标签式标题（2-8个字，如'Java开发偏好'、'科幻短剧爱好'）",
      "summary": "简短摘要（不超过100字）",
      "detail": "详细描述",
      "tags": ["标签1", "标签2"]
    }
  ]
}

提取规则：
1. type 类型说明：
   - preference: 用户表达的偏好、习惯、身份声明（如"不要用X"、"我喜欢Y"、"我是Z"）
   - decision: 用户做出的技术决策或选择（如"采用X框架"、"切换到Y方案"）
   - error: 用户遇到的错误及AI给出的解决方案
   - discovery: 发现的环境特性、系统行为、工具特点
   - milestone: 项目里程碑、功能完成、版本发布

2. title 标题规范（极其重要）：
   - 必须是简短的标签式短语，2-8个字，像目录标题
   - 好的例子："Java开发偏好"、"科幻短剧爱好"、"焦梦瑶喜好"、"兼职老师身份"
   - 坏的例子："用户表达了对焦梦瑶的喜好"、"用户喜欢看科幻类AI短剧"（这些是 summary 不是 title）
   - title 绝对不要以"用户"开头

3. 提取原则：
   - 只提取有长期价值的信息，跳过日常闲聊和一次性指令
   - 每条对话最多提取 1-2 条记忆，宁缺毋滥
   - summary 要精炼、可读，不要照搬原文
   - tags 提取 2-5 个有意义的关键词（技术栈、领域、行为等）
   - 如果对话没有值得记住的内容，返回 {"entries": []}

4. 从 AI 回复中也可以提取价值：
   - 如果 AI 成功解决了一个错误，提取解决方案作为 error 类型
   - 如果 AI 揭示了某个工具/系统的特性，提取为 discovery 类型

只返回 JSON，不要其他文字。`

/**
 * 使用 LLM 从对话中提取结构化记忆
 *
 * @returns 提取的情节记忆数组，失败时返回 null（由调用方降级到正则）
 */
export async function extractWithLLM(
  userMessage: string,
  assistantReply: string,
  projectId: string
): Promise<EpisodicDraft[] | null> {
  // 检查 API Key
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const truncatedUser = userMessage.slice(0, MAX_USER_MSG)
  const truncatedReply = assistantReply.slice(0, MAX_REPLY)

  const userPrompt = `## 用户消息
${truncatedUser}

## AI 回复
${truncatedReply}`

  try {
    const response = await Promise.race([
      callAnthropicAPI(apiKey, {
        model: EXTRACT_MODEL,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      timeout(EXTRACT_TIMEOUT),
    ])

    if (!response) return null

    // 提取文本内容
    const textBlock = response.content?.find((b: { type: string }) => b.type === 'text') as { type: 'text'; text: string } | undefined
    if (!textBlock?.text) return null

    const parsed = parseResponse(textBlock.text, projectId)
    return parsed
  } catch (err) {
    console.warn('[GClaw] LLM extraction failed, will fallback to regex:', (err as Error).message)
    return null
  }
}

/**
 * 解析 LLM 返回的 JSON 响应
 */
function parseResponse(text: string, projectId: string): EpisodicDraft[] | null {
  try {
    // 尝试提取 JSON（LLM 可能包裹在 markdown code block 中）
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const data = JSON.parse(jsonMatch[0])
    const entries = data.entries
    if (!Array.isArray(entries) || entries.length === 0) return null

    const validTypes = new Set(['preference', 'decision', 'error', 'discovery', 'milestone'])
    const result: EpisodicDraft[] = []

    for (const entry of entries.slice(0, 2)) { // 最多 2 条
      if (!entry.type || !validTypes.has(entry.type) || !entry.summary) continue

      result.push({
        projectId,
        type: entry.type,
        summary: String(entry.summary).slice(0, 200),
        detail: entry.detail ? String(entry.detail).slice(0, 500) : undefined,
        tags: Array.isArray(entry.tags)
          ? entry.tags.filter((t: unknown) => typeof t === 'string').slice(0, 5)
          : [],
        source: 'hook',
        // LLM 提取的简短标题，巩固时优先使用
        title: entry.title ? String(entry.title).slice(0, 30) : undefined,
      })
    }

    return result.length > 0 ? result : null
  } catch {
    return null
  }
}

/**
 * 直接调用 Anthropic Messages API（无需 SDK 依赖）
 */
export async function callAnthropicAPI(
  apiKey: string,
  body: {
    model: string
    max_tokens: number
    system: string
    messages: Array<{ role: string; content: string }>
  }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    throw new Error(`Anthropic API ${resp.status}: ${await resp.text()}`)
  }

  return resp.json()
}

/**
 * 超时 Promise
 */
export function timeout(ms: number): Promise<null> {
  return new Promise(resolve => setTimeout(() => resolve(null), ms))
}
