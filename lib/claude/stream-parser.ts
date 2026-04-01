import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { ParsedEvent, ConvertContext } from '@/types/claude'

/**
 * 创建新的转换上下文 — 每次 executeChat 调用时初始化一个
 */
export function createConvertContext(): ConvertContext {
  return {
    streamedTextLength: 0,
    lastModel: '',
    sentToolUseIds: new Set(),
  }
}

/**
 * 将 SDK 的 SDKMessage 转换为内部 ParsedEvent[]
 * 替代原来的 parseStreamLine()，直接处理结构化的 SDK 消息对象
 */
export function convertSDKMessage(
  msg: SDKMessage,
  ctx: ConvertContext
): ParsedEvent[] {
  const results: ParsedEvent[] = []

  switch (msg.type) {
    // ── system (init) ──────────────────────────────
    case 'system': {
      // SDKSystemMessage 有 subtype: 'init' | 'compact_boundary' | 'status' | 'hook_response'
      if ('subtype' in msg && msg.subtype === 'init' && 'model' in msg) {
        ctx.lastModel = (msg as { model: string }).model
        results.push({
          kind: 'init',
          sessionId: msg.session_id,
          model: ctx.lastModel,
        })
      }
      break
    }

    // ── stream_event (实时流式增量) ────────────────
    case 'stream_event': {
      const event = (msg as { event: Record<string, unknown> }).event
      if (!event || typeof event !== 'object') break

      const eventType = event.type as string | undefined

      // 文本增量
      if (eventType === 'content_block_delta') {
        const delta = event.delta as { type?: string; text?: string } | undefined
        if (delta?.type === 'text_delta' && delta.text) {
          ctx.streamedTextLength += delta.text.length
          results.push({ kind: 'delta', content: delta.text })
        }
        // thinking 增量
        if (delta?.type === 'thinking_delta' && 'thinking' in delta) {
          const thinking = (delta as { thinking?: string }).thinking
          if (thinking) {
            results.push({ kind: 'thinking', content: thinking })
          }
        }
      }

      // 工具调用开始 — 从 content_block_start 中提取
      if (eventType === 'content_block_start') {
        const block = event.content_block as {
          type?: string
          id?: string
          name?: string
          input?: Record<string, unknown>
        } | undefined
        if (block?.type === 'tool_use' && block.id && block.name) {
          ctx.sentToolUseIds.add(block.id)
          results.push({
            kind: 'tool_use',
            toolUseId: block.id,
            toolName: block.name,
            input: block.input || {},
          })
        }
      }

      // 工具调用输入增量 — content_block_delta + input_json_delta
      // 这里我们不逐块拼接 JSON，而是等 assistant 消息中的完整 input
      // stream_event 的 input_json_delta 太碎片化，跳过

      break
    }

    // ── assistant (完整的助手消息) ──────────────────
    case 'assistant': {
      const assistantMsg = msg as {
        message: {
          content: Array<{
            type: string
            text?: string
            thinking?: string
            id?: string
            name?: string
            input?: Record<string, unknown>
          }>
          model?: string
        }
      }

      if (assistantMsg.message?.model) {
        ctx.lastModel = assistantMsg.message.model
      }

      const content = assistantMsg.message?.content
      if (!Array.isArray(content)) break

      for (const block of content) {
        if (block.type === 'text' && block.text) {
          // 去重：如果 stream_event 已经发送了部分/全部文本，只发送增量
          const newText = block.text.slice(ctx.streamedTextLength)
          // 重置流式追踪（为下一轮做准备）
          ctx.streamedTextLength = 0
          if (newText) {
            results.push({ kind: 'delta', content: newText })
          }
        } else if (block.type === 'thinking' && block.thinking) {
          // thinking 不做去重，在 process-manager 中跳过即可
        } else if (block.type === 'tool_use' && block.id && block.name) {
          // 去重：如果 stream_event 已发送过此 tool_use id 则跳过
          // 但 stream_event 只发送了空 input，这里需要用完整 input 更新
          if (ctx.sentToolUseIds.has(block.id)) {
            // 已通过 stream_event 发送过 tool_use，但 input 可能不完整
            // 发送一个带完整 input 的更新事件
            // 实际上在 stream_event 中我们已发送了 tool_use（带空 input），
            // 这里的完整 input 需要用另一种方式处理
            // 简单起见：跳过（因为前端主要关心 tool_name 和 toolUseId）
            continue
          }
          results.push({
            kind: 'tool_use',
            toolUseId: block.id,
            toolName: block.name,
            input: block.input || {},
          })
        }
      }
      break
    }

    // ── user (工具结果) ────────────────────────────
    case 'user': {
      const userMsg = msg as {
        message: {
          role: string
          content: Array<{
            type: string
            tool_use_id?: string
            content?: string | unknown
            is_error?: boolean
          }> | string
        }
      }

      const content = userMsg.message?.content
      if (!Array.isArray(content)) break

      for (const block of content) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          results.push({
            kind: 'tool_result',
            toolUseId: block.tool_use_id,
            content:
              typeof block.content === 'string'
                ? block.content
                : JSON.stringify(block.content ?? ''),
            isError: !!block.is_error,
          })
        }
      }
      break
    }

    // ── result (完成/错误) ─────────────────────────
    case 'result': {
      // SDK 的 NonNullableUsage 依赖 @anthropic-ai/sdk 类型（未安装），
      // 需要通过 unknown 中间转换来安全访问属性
      const resultMsg = msg as unknown as {
        subtype: string
        is_error: boolean
        result?: string
        errors?: string[]
        total_cost_usd: number
        usage: Record<string, number>
        session_id: string
      }

      const rawUsage = resultMsg.usage
      const usage = rawUsage
        ? {
            inputTokens:
              rawUsage.input_tokens ?? rawUsage.inputTokens ?? 0,
            outputTokens:
              rawUsage.output_tokens ?? rawUsage.outputTokens ?? 0,
            cachedTokens:
              rawUsage.cache_read_input_tokens ??
              rawUsage.cacheReadInputTokens ??
              0,
          }
        : null

      if (resultMsg.is_error || resultMsg.subtype !== 'success') {
        const errorMsg =
          resultMsg.errors?.join('; ') ||
          resultMsg.result ||
          'Claude execution error'
        results.push({ kind: 'error', message: errorMsg })
      }

      results.push({
        kind: 'done',
        sessionId: resultMsg.session_id || null,
        usage,
        costUsd: resultMsg.total_cost_usd ?? null,
        summary: resultMsg.result || '',
      })
      break
    }

    // ── tool_progress (工具执行进度，忽略) ──────────
    case 'tool_progress':
    // ── auth_status (认证状态，忽略) ────────────────
    case 'auth_status':
      break

    default:
      // 未知消息类型，静默忽略
      break
  }

  return results
}
