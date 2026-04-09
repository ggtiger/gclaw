/**
 * 渠道消息处理核心服务
 * 接收渠道消息 -> 调用 Agent -> 回复渠道
 * 同时通过 SSE 事件总线将消息和 Agent 响应实时推送到 Web UI
 */

import { executeChat } from '@/lib/claude/process-manager'
import { addMessage } from '@/lib/store/messages'
import { channelEventBus } from './channel-events'
import type { ChatMessage, ChatAttachment } from '@/types/chat'
import type { ChannelConfig } from '@/types/channels'

/**
 * 处理来自渠道的消息，调用 Agent 获取回复
 * 同时通过 channelEventBus 实时推送事件到 Web UI
 */
export async function handleChannelMessage(
  projectId: string,
  _channel: ChannelConfig,
  incomingText: string,
  attachments?: ChatAttachment[],
): Promise<string> {
  // 持久化用户消息
  const userMsg: ChatMessage = {
    id: `msg_${Date.now()}_channel_user`,
    role: 'user',
    content: incomingText,
    messageType: 'text',
    createdAt: new Date().toISOString(),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  }
  addMessage(projectId, userMsg)

  // 通过 SSE 推送用户消息到 Web UI
  channelEventBus.emit(projectId, {
    type: 'channel_user_message',
    data: { message: userMsg },
  })

  // 调用 Agent，收集完整回复，同时流式推送到前端
  let fullContent = ''

  // 通知前端 Agent 开始处理
  channelEventBus.emit(projectId, {
    type: 'channel_start',
    data: {},
  })

  try {
    for await (const event of executeChat(incomingText, { projectId })) {
      if (event.event === 'delta' && typeof event.data.content === 'string') {
        fullContent += event.data.content
        // 流式推送 delta 到前端
        channelEventBus.emit(projectId, {
          type: 'channel_delta',
          data: { content: event.data.content },
        })
      }

      if (event.event === 'tool_use') {
        channelEventBus.emit(projectId, {
          type: 'channel_tool_use',
          data: event.data,
        })
      }

      if (event.event === 'tool_result') {
        channelEventBus.emit(projectId, {
          type: 'channel_tool_result',
          data: event.data,
        })
      }

      if (event.event === 'done') {
        if (fullContent.trim()) {
          const assistantMsg: ChatMessage = {
            id: `msg_${Date.now()}_channel_assistant`,
            role: 'assistant',
            content: fullContent,
            messageType: 'text',
            createdAt: new Date().toISOString(),
            stats: event.data.usage
              ? {
                  costUsd: (event.data.costUsd as number) || 0,
                  inputTokens: (event.data.usage as Record<string, number>).inputTokens || 0,
                  outputTokens: (event.data.usage as Record<string, number>).outputTokens || 0,
                  cachedTokens: (event.data.usage as Record<string, number>).cachedTokens || 0,
                  model: (event.data.model as string) || '',
                }
              : undefined,
          }
          addMessage(projectId, assistantMsg)

          // 推送完成事件（含完整消息）到前端
          channelEventBus.emit(projectId, {
            type: 'channel_done',
            data: { message: assistantMsg },
          })
        } else {
          channelEventBus.emit(projectId, {
            type: 'channel_done',
            data: {},
          })
        }
      }

      if (event.event === 'error') {
        const errMsg = event.data.message as string || '处理失败'
        if (!fullContent) fullContent = `[错误] ${errMsg}`
        channelEventBus.emit(projectId, {
          type: 'channel_error',
          data: { message: errMsg },
        })
      }
    }
  } catch (err) {
    console.error('[ChannelService] executeChat error:', err)
    if (!fullContent) fullContent = '[错误] Agent 执行异常'
    channelEventBus.emit(projectId, {
      type: 'channel_error',
      data: { message: 'Agent 执行异常' },
    })
  }

  return fullContent || '[无回复]'
}
