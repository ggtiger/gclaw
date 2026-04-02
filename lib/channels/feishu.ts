/**
 * 飞书机器人消息处理
 * 文档: https://open.feishu.cn/document/server-docs/im-v1/message/create
 */

import crypto from 'crypto'
import type { FeishuConfig } from '@/types/channels'

/**
 * 验证飞书事件回调签名
 */
export function verifyFeishuSignature(
  timestamp: string,
  nonce: string,
  body: string,
  encryptKey: string,
): string {
  const content = timestamp + nonce + encryptKey + body
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * 解析飞书事件体
 * 返回 challenge（验证请求）或消息文本
 */
export function parseFeishuEvent(body: Record<string, unknown>): {
  type: 'challenge' | 'message' | 'unknown'
  challenge?: string
  text?: string
  messageId?: string
  chatId?: string
  chatType?: string
  senderId?: string
} {
  // URL 验证 challenge
  if (body.challenge && body.type === 'url_verification') {
    return { type: 'challenge', challenge: body.challenge as string }
  }

  // v2 事件格式
  const header = body.header as Record<string, unknown> | undefined
  const event = body.event as Record<string, unknown> | undefined

  if (header?.event_type === 'im.message.receive_v1' && event) {
    const message = event.message as Record<string, unknown> | undefined
    const sender = event.sender as Record<string, unknown> | undefined

    if (message) {
      const msgType = message.message_type as string
      let text = ''

      if (msgType === 'text') {
        try {
          const content = JSON.parse(message.content as string)
          text = content.text || ''
        } catch {
          text = (message.content as string) || ''
        }
      }

      return {
        type: 'message',
        text,
        messageId: message.message_id as string,
        chatId: message.chat_id as string,
        chatType: message.chat_type as string,
        senderId: (sender?.sender_id as Record<string, string>)?.open_id,
      }
    }
  }

  return { type: 'unknown' }
}

/**
 * 获取飞书 tenant_access_token
 */
export async function getTenantAccessToken(config: FeishuConfig): Promise<string | null> {
  try {
    const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: config.appId,
        app_secret: config.appSecret,
      }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return data.tenant_access_token || null
  } catch {
    return null
  }
}

/**
 * 通过飞书 OpenAPI 回复消息
 */
export async function replyFeishu(
  config: FeishuConfig,
  messageId: string,
  content: string,
): Promise<boolean> {
  try {
    const token = await getTenantAccessToken(config)
    if (!token) {
      console.error('[Feishu] Failed to get access token')
      return false
    }

    const res = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        msg_type: 'text',
        content: JSON.stringify({ text: content }),
      }),
      signal: AbortSignal.timeout(10000),
    })
    return res.ok
  } catch (err) {
    console.error('[Feishu] Reply failed:', err)
    return false
  }
}
