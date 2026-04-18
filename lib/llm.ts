/**
 * 轻量 LLM 调用工具
 *
 * 直接调用 Anthropic Messages API，不经过 chat stream，不污染会话。
 * 适用于：AI 生成提交信息、记忆提取、文本摘要等辅助场景。
 */

import { logger } from '@/lib/logger'
import { getSettings } from '@/lib/store/settings'

/** 获取辅助模型名称 */
export function getAssistantModel(projectId?: string): string {
  return getSettings(projectId || '').assistantModel || 'claude-haiku-4-20250414'
}

/** 获取 API Key + Base URL */
function getLLMConfig(projectId?: string): { apiKey: string; baseUrl: string } | null {
  const settings = getSettings(projectId || '')
  const apiKey = settings.apiKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  const baseUrl = settings.apiBaseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
  return { apiKey, baseUrl }
}

/**
 * 直接调用 Anthropic Messages API
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
  const config = getLLMConfig(options.projectId)
  if (!config) return null

  const model = options.model || getAssistantModel(options.projectId)
  const maxTokens = options.maxTokens || 512
  const timeoutMs = options.timeoutMs || 10000

  try {
    const resp = await Promise.race([
      fetch(`${config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: options.system,
          messages: [{ role: 'user', content: options.user }],
        }),
      }),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('LLM timeout')), timeoutMs)
      ),
    ])

    if (!resp) return null

    const data = await (resp as Response).json()
    const textBlock = data.content?.find((b: { type: string }) => b.type === 'text')
    return textBlock?.text?.trim() || null
  } catch (err) {
    logger.warn('[callLLM] failed:', (err as Error).message)
    return null
  }
}
