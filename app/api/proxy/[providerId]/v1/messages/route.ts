/**
 * 内置 Anthropic → OpenAI 协议代理
 *
 * 接收 Claude Agent SDK 发出的 Anthropic Messages API 请求，
 * 转换为 OpenAI Chat Completions API 格式转发到上游，
 * 再将上游响应转回 Anthropic 格式返回给 SDK。
 *
 * 路由: POST /api/proxy/{providerId}/v1/messages
 */

import { NextRequest } from 'next/server'
import { getGlobalSettings } from '@/lib/store/settings'
import type { ModelProvider } from '@/types/skills'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// ── 类型定义 ──

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | AnthropicContentBlock[] }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'thinking'; thinking: string }

interface AnthropicTool {
  name: string
  description?: string
  input_schema: Record<string, unknown>
}

interface AnthropicToolChoice {
  type: 'auto' | 'any' | 'tool'
  name?: string
}

interface AnthropicRequest {
  model: string
  messages: AnthropicMessage[]
  max_tokens: number
  system?: string | Array<{ type: 'text'; text: string }>
  tools?: AnthropicTool[]
  tool_choice?: AnthropicToolChoice
  stream?: boolean
  temperature?: number
  top_p?: number
  stop_sequences?: string[]
  metadata?: { user_id?: string }
  [key: string]: unknown
}

interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

// ── 请求转换 ──

/** 序列化 tool_result 内容（处理 string、text[]、非 text 块等） */
function serializeToolResultContent(content: string | AnthropicContentBlock[]): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return JSON.stringify(content)
  const parts: string[] = []
  for (const item of content) {
    if (typeof item === 'object' && 'type' in item && item.type === 'text' && 'text' in item) {
      parts.push((item as { type: 'text'; text: string }).text)
    } else {
      // 非 text 块序列化为 JSON（图片、tool_use 等罕见于 tool_result）
      try { parts.push(JSON.stringify(item)) } catch { parts.push('<unserializable>') }
    }
  }
  return parts.join('\n')
}

/** 转换 tool_choice：Anthropic → OpenAI */
function convertToolChoice(choice: AnthropicToolChoice | undefined): string | object | undefined {
  if (!choice) return undefined
  if (choice.type === 'auto') return 'auto'
  if (choice.type === 'any') return 'auto' // OpenAI 无 any 等价，降级为 auto
  if (choice.type === 'tool' && choice.name) {
    return { type: 'function', function: { name: choice.name } }
  }
  return undefined
}

function convertAnthropicToOpenAI(body: AnthropicRequest): {
  messages: OpenAIMessage[]
  tools?: OpenAITool[]
  tool_choice?: string | object
  model: string
  max_tokens?: number
  stream: boolean
  temperature?: number
  top_p?: number
  stop?: string[]
  user?: string
} {
  const messages: OpenAIMessage[] = []

  // system → role: "system" 消息
  if (body.system) {
    const systemText = typeof body.system === 'string'
      ? body.system
      : body.system.map(b => b.text).join('\n')
    messages.push({ role: 'system', content: systemText })
  }

  // 转换 messages
  for (const msg of body.messages) {
    const content = typeof msg.content === 'string' ? msg.content : msg.content

    if (msg.role === 'user') {
      if (typeof content === 'string') {
        messages.push({ role: 'user', content })
      } else {
        // 处理 content blocks
        const blocks = content as AnthropicContentBlock[]

        if (blocks.length === 0) {
          messages.push({ role: 'user', content: '' })
          continue
        }

        // 先处理 tool_result blocks → 转为 role: 'tool' 消息
        for (const block of blocks) {
          if (block.type === 'tool_result') {
            messages.push({
              role: 'tool',
              tool_call_id: block.tool_use_id,
              content: serializeToolResultContent(block.content),
            })
          }
        }

        // 非 tool_result 的内容合并为一条 user 消息
        const userParts: object[] = []
        for (const block of blocks) {
          if (block.type === 'text') {
            userParts.push({ type: 'text', text: block.text })
          } else if (block.type === 'image') {
            userParts.push({
              type: 'image_url',
              image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
            })
          }
        }

        if (userParts.length > 0) {
          const isMultimodal = userParts.some(p => 'type' in p && p.type === 'image_url')
          if (isMultimodal || userParts.length > 1) {
            messages.push({ role: 'user', content: JSON.stringify(userParts) })
          } else if (userParts.length === 1 && 'text' in (userParts[0] as { type: string; text: string })) {
            messages.push({ role: 'user', content: (userParts[0] as { type: 'text'; text: string }).text })
          }
        }
      }
    } else if (msg.role === 'assistant') {
      if (typeof content === 'string') {
        messages.push({ role: 'assistant', content })
      } else {
        const blocks = content as AnthropicContentBlock[]
        const textParts: string[] = []
        const toolCalls: NonNullable<OpenAIMessage['tool_calls']> = []

        for (const block of blocks) {
          if (block.type === 'text') {
            textParts.push(block.text)
          } else if (block.type === 'tool_use') {
            let argsStr: string
            try {
              argsStr = JSON.stringify(block.input)
            } catch {
              argsStr = '{}'
            }
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: { name: block.name, arguments: argsStr },
            })
          }
          // thinking 跳过
        }

        // 规范化：有 tool_calls 时 content 应为 null
        const hasText = textParts.length > 0 && textParts.some(t => t.length > 0)
        const hasToolCalls = toolCalls.length > 0
        messages.push({
          role: 'assistant',
          content: hasText ? textParts.join('\n') : (hasToolCalls ? null : ''),
          ...(hasToolCalls ? { tool_calls: toolCalls } : {}),
        })
      }
    }
  }

  // tools 转换
  const tools: OpenAITool[] | undefined = body.tools?.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description || '',
      parameters: t.input_schema,
    },
  }))

  // tool_choice 转换
  const toolChoice = convertToolChoice(body.tool_choice)

  return {
    messages,
    ...(tools && tools.length > 0 ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
    model: body.model,
    max_tokens: body.max_tokens,
    stream: body.stream ?? false,
    temperature: body.temperature,
    top_p: body.top_p,
    stop: body.stop_sequences,
    ...(body.metadata?.user_id ? { user: String(body.metadata.user_id) } : {}),
  }
}

// ── 响应转换 ──

function makeAnthropicError(type: string, message: string, status: number): Response {
  return new Response(
    JSON.stringify({
      type: 'error',
      error: { type, message },
    }),
    { status, headers: { 'content-type': 'application/json' } },
  )
}

/** 生成 Anthropic 消息 ID */
function msgId(): string {
  return `msg_proxy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// ── 非流式响应转换 ──

function convertOpenAIToAnthropic(data: Record<string, unknown>, requestModel: string): object {
  const choice = (data.choices as Array<Record<string, unknown>>)?.[0]
  if (!choice) {
    return {
      id: msgId(),
      type: 'message',
      role: 'assistant',
      model: requestModel,
      content: [{ type: 'text', text: '' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    }
  }

  const message = choice.message as Record<string, unknown>
  const content: Array<Record<string, unknown>> = []

  // 文本内容
  const text = message?.content as string | null
  if (text) {
    content.push({ type: 'text', text })
  }

  // 工具调用
  const toolCalls = message?.tool_calls as Array<Record<string, unknown>> | undefined
  if (toolCalls) {
    for (const tc of toolCalls) {
      const fn = tc.function as Record<string, string>
      let input: Record<string, unknown>
      try {
        const parsed = JSON.parse(fn.arguments || '{}')
        // 确保 input 是对象（非字典类型包裹为 {value: ...}）
        input = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? parsed
          : { value: parsed }
      } catch {
        input = { error_parsing_arguments: fn.arguments || '' }
      }
      content.push({
        type: 'tool_use',
        id: tc.id as string,
        name: fn.name,
        input,
      })
    }
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: '' })
  }

  // stop_reason 映射
  const finishReason = choice.finish_reason as string | null
  const stopReasonMap: Record<string, string> = {
    stop: 'end_turn',
    length: 'max_tokens',
    tool_calls: 'tool_use',
    function_call: 'tool_use',
    content_filter: 'stop_sequence',
  }
  const stopReason = stopReasonMap[finishReason || ''] || 'end_turn'

  // usage 映射
  const usage = data.usage as Record<string, number> | undefined
  const inputTokens = usage?.prompt_tokens ?? 0
  const outputTokens = usage?.completion_tokens ?? 0

  return {
    id: msgId(),
    type: 'message',
    role: 'assistant',
    model: requestModel,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  }
}

// ── 流式响应转换 ──

interface StreamState {
  textStarted: boolean
  textBlockClosed: boolean
  currentBlockIdx: number
  toolBlockStates: Map<number, { id: string; name: string; argsBuffer: string; started: boolean; closed: boolean }>
  totalInputTokens: number
  totalOutputTokens: number
  messageId: string
  model: string
  started: boolean
  finished: boolean
}

function newState(requestModel: string): StreamState {
  return {
    textStarted: false,
    textBlockClosed: false,
    currentBlockIdx: 0,
    toolBlockStates: new Map(),
    totalInputTokens: 0,
    totalOutputTokens: 0,
    messageId: msgId(),
    model: requestModel,
    started: false,
    finished: false,
  }
}

/** 获取 tcIdx 对应的 Anthropic block index */
function getToolBlockIdx(s: StreamState, tcIdx: number): number {
  let idx = 0
  for (const [key] of s.toolBlockStates) {
    if (key === tcIdx) break
    idx++
  }
  return s.textStarted ? idx + 1 : idx
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function ensureStarted(s: StreamState): string {
  if (s.started) return ''
  s.started = true
  return sse('message_start', {
    type: 'message_start',
    message: {
      id: s.messageId,
      type: 'message',
      role: 'assistant',
      model: s.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  }) + sse('ping', { type: 'ping' })
}

function startTextBlock(s: StreamState): string {
  if (s.textStarted) return ''
  s.textStarted = true
  const idx = s.currentBlockIdx++
  return sse('content_block_start', {
    type: 'content_block_start',
    index: idx,
    content_block: { type: 'text', text: '' },
  })
}

function closeTextBlock(s: StreamState): string {
  if (!s.textStarted || s.textBlockClosed) return ''
  s.textBlockClosed = true
  return sse('content_block_stop', {
    type: 'content_block_stop',
    index: 0,
  })
}

async function* convertStream(
  upstream: ReadableStream<Uint8Array>,
  requestModel: string,
): AsyncGenerator<string> {
  const s = newState(requestModel)
  const reader = upstream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue

        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6)
          if (dataStr === '[DONE]') continue

          let chunk: Record<string, unknown>
          try {
            chunk = JSON.parse(dataStr)
          } catch {
            continue
          }

          const choices = chunk.choices as Array<Record<string, unknown>> | undefined
          const choice = choices?.[0]
          if (!choice) continue

          const delta = choice.delta as Record<string, unknown> | undefined
          const finishReason = choice.finish_reason as string | null

          // 处理文本内容
          if (delta?.content != null && delta.content !== '') {
            yield ensureStarted(s)
            yield startTextBlock(s)
            yield sse('content_block_delta', {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: delta.content },
            })
            s.totalOutputTokens++
          }

          // 处理工具调用
          const toolCalls = delta?.tool_calls as Array<Record<string, unknown>> | undefined
          if (toolCalls) {
            for (const tc of toolCalls) {
              const tcIdx = tc.index as number ?? 0
              const tcId = tc.id as string | undefined
              const fn = tc.function as Record<string, string> | undefined

              yield ensureStarted(s)

              // 初始化 tool state（首次遇到此 tcIdx）
              if (!s.toolBlockStates.has(tcIdx)) {
                const blockIdx = s.currentBlockIdx++
                s.toolBlockStates.set(tcIdx, {
                  id: tcId || `tool_ph_${blockIdx}`,
                  name: fn?.name || '',
                  argsBuffer: '',
                  started: false,
                  closed: false,
                })
              }

              const state = s.toolBlockStates.get(tcIdx)!

              // 更新 id（placeholder 替换为真实 id）
              if (tcId && state.id.startsWith('tool_ph_')) {
                state.id = tcId
              }
              // 更新 name
              if (fn?.name) {
                state.name = fn.name
              }
              // 缓存 arguments
              if (fn?.arguments) {
                state.argsBuffer += fn.arguments
              }

              // 延迟发送 content_block_start：等 id 和 name 都就绪且非 placeholder
              if (!state.started && state.id && !state.id.startsWith('tool_ph_') && state.name) {
                yield closeTextBlock(s)
                state.started = true
                yield sse('content_block_start', {
                  type: 'content_block_start',
                  index: getToolBlockIdx(s, tcIdx),
                  content_block: {
                    type: 'tool_use',
                    id: state.id,
                    name: state.name,
                    input: {},
                  },
                })
              }

              // 发送增量 arguments（仅在 block start 已发送后）
              if (fn?.arguments && state.started && !state.closed) {
                yield sse('content_block_delta', {
                  type: 'content_block_delta',
                  index: getToolBlockIdx(s, tcIdx),
                  delta: { type: 'input_json_delta', partial_json: fn.arguments },
                })
              }
            }
          }

          // 处理结束
          if (finishReason) {
            yield ensureStarted(s)
            yield closeTextBlock(s)

            // 关闭所有已 start 的 tool blocks
            for (const [tcIdx, state] of s.toolBlockStates) {
              if (state.started && !state.closed) {
                state.closed = true
                yield sse('content_block_stop', {
                  type: 'content_block_stop',
                  index: getToolBlockIdx(s, tcIdx),
                })
              }
            }

            // stop_reason 映射
            const stopReasonMap: Record<string, string> = {
              stop: 'end_turn',
              length: 'max_tokens',
              tool_calls: 'tool_use',
              function_call: 'tool_use',
              content_filter: 'stop_sequence',
            }
            const stopReason = stopReasonMap[finishReason] || 'end_turn'

            // 更新 usage
            const usage = chunk.usage as Record<string, number> | undefined
            if (usage) {
              s.totalInputTokens = usage.prompt_tokens ?? s.totalInputTokens
              s.totalOutputTokens = usage.completion_tokens ?? s.totalOutputTokens
            }

            yield sse('message_delta', {
              type: 'message_delta',
              delta: { stop_reason: stopReason, stop_sequence: null },
              usage: { output_tokens: s.totalOutputTokens },
            })
            yield sse('message_stop', { type: 'message_stop' })
            s.finished = true
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  // 如果流异常结束（没有 finish_reason），发送结束事件
  if (s.started && !s.finished) {
    yield closeTextBlock(s)
    for (const [tcIdx, state] of s.toolBlockStates) {
      if (state.started && !state.closed) {
        state.closed = true
        yield sse('content_block_stop', {
          type: 'content_block_stop',
          index: getToolBlockIdx(s, tcIdx),
        })
      }
    }
    yield sse('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: s.totalOutputTokens },
    })
    yield sse('message_stop', { type: 'message_stop' })
  }
}

// ── 查找 Provider ──

function findProvider(providerId: string): ModelProvider | null {
  const settings = getGlobalSettings()
  const providers = settings.providers || []
  return providers.find(p => p.id === providerId) ?? null
}

// ── 主路由处理 ──

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
) {
  const { providerId } = await params

  // 查找 provider 配置
  const provider = findProvider(providerId)
  if (!provider) {
    return makeAnthropicError('not_found_error', `供应商 ${providerId} 未找到`, 404)
  }

  // 解析请求体
  let body: AnthropicRequest
  try {
    body = await request.json()
  } catch {
    return makeAnthropicError('invalid_request_error', '无法解析请求体', 400)
  }

  // 转换为 OpenAI 格式
  const openaiBody = convertAnthropicToOpenAI(body)

  // 模型名映射：供应商配了 model 则替换（SDK 发 Claude 模型名需转为上游模型名），
  // 否则保持请求原样（项目级 model 直接透传）
  const upstreamModel = provider.model || body.model
  openaiBody.model = upstreamModel

  // 截断 max_tokens：不同模型有不同的输出上限，超出会报错
  if (provider.maxOutputTokens && openaiBody.max_tokens && openaiBody.max_tokens > provider.maxOutputTokens) {
    openaiBody.max_tokens = provider.maxOutputTokens
  }

  const baseUrl = provider.baseUrl.replace(/\/+$/, '')
  const upstreamUrl = `${baseUrl}/v1/chat/completions`

  const requestBody = JSON.stringify(openaiBody)
  const bodySizeKB = (requestBody.length / 1024).toFixed(1)
  logger.info(`[Proxy] ${provider.name} → ${upstreamUrl} | model=${body.model} → ${upstreamModel} | stream=${openaiBody.stream} | msgs=${openaiBody.messages.length} | body=${bodySizeKB}KB | tools=${openaiBody.tools?.length || 0}`)

  // 转发到上游
  const ttfbStart = Date.now()
  let upstreamResp: Response
  try {
    upstreamResp = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`,
      },
      body: requestBody,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`[Proxy] 上游连接失败: ${msg}`)
    return makeAnthropicError('api_error', `上游连接失败: ${msg}`, 502)
  }

  // 上游错误 — 按状态码映射为 Anthropic 错误类型
  const ttfb = Date.now() - ttfbStart
  logger.info(`[Proxy] TTFB: ${ttfb}ms | status=${upstreamResp.status} | model=${upstreamModel}`)
  if (!upstreamResp.ok) {
    const errText = await upstreamResp.text().catch(() => '')
    logger.error(`[Proxy] 上游返回 ${upstreamResp.status}: ${errText.slice(0, 500)}`)
    const errorTypeMap: Record<number, string> = {
      400: 'invalid_request_error',
      401: 'authentication_error',
      403: 'permission_error',
      404: 'not_found_error',
      429: 'rate_limit_error',
      500: 'api_error',
      503: 'overloaded_error',
    }
    const errorType = errorTypeMap[upstreamResp.status] || 'api_error'
    return makeAnthropicError(errorType, `上游返回 ${upstreamResp.status}: ${errText.slice(0, 500)}`, upstreamResp.status)
  }

  // 流式响应
  if (openaiBody.stream && upstreamResp.body) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of convertStream(upstreamResp.body!, body.model)) {
            controller.enqueue(encoder.encode(chunk))
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          logger.error(`[Proxy] 流转换错误: ${msg}`)
          controller.enqueue(encoder.encode(sse('error', {
            type: 'error',
            error: { type: 'api_error', message: `流转换错误: ${msg}` },
          })))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }

  // 非流式响应
  const data = await upstreamResp.json() as Record<string, unknown>
  const anthropicResp = convertOpenAIToAnthropic(data, body.model)
  return Response.json(anthropicResp)
}
