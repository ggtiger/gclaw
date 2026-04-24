/**
 * 钉钉机器人消息处理
 * 文档: https://open.dingtalk.com/document/orgapp/robot-overview
 */

import crypto from 'crypto'
import type { DingtalkConfig } from '@/types/channels'

interface DingtalkMessage {
  msgtype: string
  text?: { content: string }
  picture?: { downloadCode: string; fileSize: number }
  richText?: { text: string }
  voice?: { downloadCode: string; duration: number }
  audio?: { downloadCode: string; duration: number }
  msgId: string
  createAt: string
  conversationType: string // '1'=单聊, '2'=群聊
  conversationId: string
  conversationTitle?: string
  senderId: string
  senderNick: string
  senderCorpId?: string
  sessionWebhook?: string
  sessionWebhookExpiredTime?: number
  isAdmin?: boolean
  chatbotCorpId?: string
  chatbotUserId?: string
  isInAtList?: boolean
  atUsers?: Array<{ dingtalkId: string; staffId?: string }>
}

/**
 * 验证钉钉回调签名
 */
export function verifyDingtalkSignature(
  timestamp: string,
  sign: string,
  appSecret: string,
): boolean {
  try {
    const stringToSign = `${timestamp}\n${appSecret}`
    const hmac = crypto.createHmac('sha256', appSecret)
    hmac.update(stringToSign)
    const computedSign = hmac.digest('base64')
    return computedSign === sign
  } catch {
    return false
  }
}

/**
 * 解析钉钉消息体，提取文本和图片内容
 */
export function parseDingtalkMessage(body: Record<string, unknown>): {
  text: string
  imageUrl?: string
  sessionWebhook: string | null
  senderNick: string
} {
  const msg = body as unknown as DingtalkMessage
  let text = ''
  let imageUrl: string | undefined

  if (msg.msgtype === 'text' && msg.text?.content) {
    text = msg.text.content.trim()
  } else if (msg.msgtype === 'picture' && msg.picture?.downloadCode) {
    text = '[图片消息]'
    // 钉钉图片需要通过 downloadCode 下载，这里记录标识
    imageUrl = msg.picture.downloadCode
  } else if (msg.msgtype === 'richText' && msg.richText?.text) {
    text = msg.richText.text.trim()
  } else if (msg.msgtype === 'voice' || msg.msgtype === 'audio') {
    const duration = msg.voice?.duration || msg.audio?.duration
    text = duration ? `[语音消息 ${Math.ceil(duration / 1000)}秒]` : '[语音消息]'
  } else if (msg.msgtype) {
    text = `[${msg.msgtype}消息]`
  }

  return {
    text,
    imageUrl,
    sessionWebhook: msg.sessionWebhook || null,
    senderNick: msg.senderNick || 'unknown',
  }
}

/**
 * 通过 sessionWebhook 回复钉钉消息
 */
export async function replyDingtalk(
  sessionWebhook: string,
  content: string,
): Promise<boolean> {
  try {
    const res = await fetch(sessionWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'text',
        text: { content },
      }),
      signal: AbortSignal.timeout(10000),
    })
    return res.ok
  } catch (err) {
    console.error('[Dingtalk] Reply failed:', err)
    return false
  }
}

/**
 * 获取钉钉 access_token（新版 API）
 */
export async function getAccessToken(config: DingtalkConfig): Promise<string | null> {
  try {
    const res = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appKey: config.appKey, appSecret: config.appSecret }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.accessToken || null
  } catch {
    return null
  }
}
