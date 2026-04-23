/**
 * 轻量 LLM 调用工具
 *
 * 支持 Anthropic 和 OpenAI 兼容两种协议格式。
 * 适用于：AI 生成提交信息、记忆提取、文本摘要等辅助场景。
 */

import { logger } from '@/lib/logger'
import { getSettings, resolveProviderConfig } from '@/lib/store/settings'

/** 获取辅助模型名称 */
export function getAssistantModel(projectId?: string): string {
  return getSettings(projectId || '').assistantModel || 'claude-haiku-4-20250414'
}

/**
 * 直接调用 LLM API（自动根据供应商类型选择协议）
 *
 * @returns 返回模型回复的文本内容；失败时返回 null
 */
export async function callLLM(options: {
  system: string
  user: string
  maxTokens?: number
  model?: string
  timeoutMs?: number
  projectId?: string
}): Promise<string | null> {
  const config = resolveProviderConfig(options.projectId)
  if (!config.apiKey) return null

  const model = options.model || getAssistantModel(options.projectId)
  const maxTokens = options.maxTokens || 512
  const timeoutMs = options.timeoutMs || 10000
  const baseUrl = config.baseUrl || 'https://api.anthropic.com'

  logger.info(`[callLLM] model=${model} | baseUrl=${baseUrl} | type=${config.providerType || 'anthropic'} | projectId=${options.projectId || '(无)'}`)

  try {
    const resp = await Promise.race([
      config.providerType === 'openai-compatible'
        ? callOpenAI(baseUrl, config.apiKey, model, options.system, options.user, maxTokens)
        : callAnthropic(baseUrl, config.apiKey, model, options.system, options.user, maxTokens),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('LLM timeout')), timeoutMs)
      ),
    ])

    if (!resp) return null
    return resp
  } catch (err) {
    logger.warn('[callLLM] failed:', (err as Error).message)
    return null
  }
}

/** Anthropic Messages API */
async function callAnthropic(
  baseUrl: string, apiKey: string, model: string,
  system: string, user: string, maxTokens: number
): Promise<string | null> {
  const resp = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  const data = await resp.json()
  const textBlock = data.content?.find((b: { type: string }) => b.type === 'text')
  return textBlock?.text?.trim() || null
}

/** OpenAI Chat Completions API */
async function callOpenAI(
  baseUrl: string, apiKey: string, model: string,
  system: string, user: string, maxTokens: number
): Promise<string | null> {
  const resp = await fetch(`${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  const data = await resp.json()
  return data.choices?.[0]?.message?.content?.trim() || null
}
