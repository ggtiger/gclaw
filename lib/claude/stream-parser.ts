import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { ParsedEvent, ConvertContext } from '@/types/claude'

// 过滤 SDK 工具调用轮次中的占位文本（如 "(no content)"）
const NOISE_PATTERN = /^[\s()]*(?:no content[)\s]*)+$/i

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
        // 打印 SDK 加载的技能列表
        if ('skills' in msg) {
          console.log('[GClaw SDK] Loaded skills:', (msg as { skills: string[] }).skills)
        }
        results.push({
          kind: 'init',
          sessionId: msg.session_id,
          model: ctx.lastModel,
        })
      }

      // compact_boundary: 对话压缩边界
      if ('subtype' in msg && msg.subtype === 'compact_boundary') {
        const meta = (msg as { compact_metadata?: { trigger?: string; pre_tokens?: number } }).compact_metadata
        results.push({
          kind: 'compact_boundary',
          trigger: (meta?.trigger as 'manual' | 'auto') || 'auto',
          preTokens: meta?.pre_tokens || 0,
        })
      }

      // status: 压缩进行中等状态变化
      if ('subtype' in msg && msg.subtype === 'status') {
        const status = (msg as { status?: string | null }).status
        results.push({
          kind: 'status',
          status: status === 'compacting' ? 'compacting' : null,
        })
      }

      // hook_response: hook 脚本执行结果
      if ('subtype' in msg && msg.subtype === 'hook_response') {
        const hookMsg = msg as {
          hook_name?: string
          hook_event?: string
          stdout?: string
          stderr?: string
          exit_code?: number
        }
        results.push({
          kind: 'hook_response',
          hookName: hookMsg.hook_name || '',
          hookEvent: hookMsg.hook_event || '',
          stdout: hookMsg.stdout || '',
          stderr: hookMsg.stderr || '',
          exitCode: hookMsg.exit_code,
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
          // 过滤 SDK 占位文本
          if (NOISE_PATTERN.test(block.text)) continue
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
          // stream_event 已发送过带空 input 的 tool_use，
          // 这里用完整 input 再发一次，前端会更新对应的 tool 数据
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

    // ── tool_progress (工具执行进度) ──────────────
    case 'tool_progress': {
      const progressMsg = msg as {
        tool_use_id?: string
        tool_name?: string
        elapsed_time_seconds?: number
      }
      if (progressMsg.tool_use_id && progressMsg.tool_name) {
        results.push({
          kind: 'tool_progress',
          toolUseId: progressMsg.tool_use_id,
          toolName: progressMsg.tool_name,
          elapsedSeconds: progressMsg.elapsed_time_seconds || 0,
        })
      }
      break
    }
    // ── auth_status (认证状态，忽略) ────────────────
    case 'auth_status':
      break

    default:
      // 未知消息类型，静默忽略
      break
  }

  return results
}
