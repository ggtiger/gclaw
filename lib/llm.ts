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

/**
 * 流式调用 LLM API，逐 chunk 返回文本
 *
 * 支持 Anthropic 和 OpenAI 兼容两种协议的 SSE 流式响应。
 * 失败时抛出异常，由调用方决定是否 fallback。
 */
export async function* callLLMStream(options: {
  system: string
  user: string
  maxTokens?: number
  model?: string
  timeoutMs?: number
  projectId?: string
}): AsyncGenerator<string, void, unknown> {
  const config = resolveProviderConfig(options.projectId)
  if (!config.apiKey) throw new Error('No API key configured')

  const model = options.model || getAssistantModel(options.projectId)
  const maxTokens = options.maxTokens || 512
  const timeoutMs = options.timeoutMs || 120000
  const baseUrl = config.baseUrl || 'https://api.anthropic.com'

  logger.info(`[callLLMStream] model=${model} | baseUrl=${baseUrl} | type=${config.providerType || 'anthropic'} | projectId=${options.projectId || '(无)'}`)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const isOpenAI = config.providerType === 'openai-compatible'

    const url = isOpenAI
      ? `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`
      : `${baseUrl}/v1/messages`

    const headers: Record<string, string> = isOpenAI
      ? {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        }
      : {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        }

    const body = isOpenAI
      ? JSON.stringify({
          model,
          max_tokens: maxTokens,
          stream: true,
          messages: [
            { role: 'system', content: options.system },
            { role: 'user', content: options.user },
          ],
        })
      : JSON.stringify({
          model,
          max_tokens: maxTokens,
          stream: true,
          system: options.system,
          messages: [{ role: 'user', content: options.user }],
        })

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })

    if (!resp.ok) {
      throw new Error(`LLM stream request failed: ${resp.status} ${resp.statusText}`)
    }

    if (!resp.body) {
      throw new Error('LLM stream response has no body')
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'event: ping') continue

        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6)
          if (dataStr === '[DONE]') return

          try {
            const parsed = JSON.parse(dataStr)

            if (isOpenAI) {
              // OpenAI format: choices[0].delta.content
              const content = parsed.choices?.[0]?.delta?.content
              if (content) yield content
            } else {
              // Anthropic format: type === 'content_block_delta'
              if (parsed.type === 'content_block_delta') {
                const text = parsed.delta?.text
                if (text) yield text
              }
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    }
  } finally {
    clearTimeout(timer)
  }
}
