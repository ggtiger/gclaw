/**
 * API 渠道服务
 * 认证 + 异步消息处理
 */

import { executeChat } from '@/lib/claude/process-manager'
import { addMessage } from '@/lib/store/messages'
import { getChannels } from '@/lib/store/channels'
import { apiEventBus } from './api-events'
import { channelEventBus } from './channel-events'
import type { ChatMessage } from '@/types/chat'
import type { ChannelConfig } from '@/types/channels'
import { logger } from '@/lib/logger'

/**
 * 通过 projectId + Bearer API Key 认证
 * URL 路径携带 projectId，API Key 纯做认证
 */
export function authenticateApiChannel(
  projectId: string,
  authHeader: string | null
): ChannelConfig | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  const apiKey = authHeader.slice(7).trim()
  if (!apiKey) return null
  const channels = getChannels(projectId)
  return channels.find(ch => ch.type === 'api' && ch.enabled && ch.api?.apiKey === apiKey) || null
}

/**
 * 异步处理 API 渠道消息
 * 1. 持久化用户消息
 * 2. 调用 Agent
 * 3. 持久化助手消息
 * 4. 通过 apiEventBus 推送给第三方 SSE
 * 5. 通过 channelEventBus 推送给 Web UI
 */
export async function handleApiMessage(
  projectId: string,
  channel: ChannelConfig,
  requestId: string,
  message: string,
): Promise<void> {
  // 持久化用户消息
  const userMsg: ChatMessage = {
    id: `msg_${Date.now()}_api_user`,
    role: 'user',
    content: message,
    messageType: 'text',
    createdAt: new Date().toISOString(),
  }
  addMessage(projectId, userMsg)

  // 通知 Web UI 收到消息
  channelEventBus.emit(projectId, {
    type: 'channel_user_message',
    data: { message: userMsg },
  })
  channelEventBus.emit(projectId, {
    type: 'channel_start',
    data: {},
  })

  // 调用 Agent，收集完整回复
  let fullContent = ''

  try {
    for await (const event of executeChat(message, { projectId })) {
      if (event.event === 'delta' && typeof event.data.content === 'string') {
        fullContent += event.data.content
      }

      if (event.event === 'done') {
        if (fullContent.trim()) {
          const assistantMsg: ChatMessage = {
            id: `msg_${Date.now()}_api_assistant`,
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

          // 推送给第三方 SSE
          apiEventBus.emit(channel.id, {
            type: 'api_done',
            data: {
              requestId,
              content: fullContent,
              usage: assistantMsg.stats,
            },
          })

          // 推送给 Web UI
          channelEventBus.emit(projectId, {
            type: 'channel_done',
            data: { message: assistantMsg },
          })
        } else {
          apiEventBus.emit(channel.id, {
            type: 'api_done',
            data: { requestId },
          })
          channelEventBus.emit(projectId, {
            type: 'channel_done',
            data: {},
          })
        }
      }

      if (event.event === 'error') {
        const errMsg = (event.data.message as string) || '处理失败'
        logger.error(`[ApiService] Agent error: ${errMsg}`)
        apiEventBus.emit(channel.id, {
          type: 'api_error',
          data: { requestId, message: errMsg },
        })
        channelEventBus.emit(projectId, {
          type: 'channel_error',
          data: { message: errMsg },
        })
      }
    }
  } catch (err) {
    logger.error('[ApiService] executeChat error:', err)
    apiEventBus.emit(channel.id, {
      type: 'api_error',
      data: { requestId, message: 'Agent 执行异常' },
    })
    channelEventBus.emit(projectId, {
      type: 'channel_error',
      data: { message: 'Agent 执行异常' },
    })
  }
}
