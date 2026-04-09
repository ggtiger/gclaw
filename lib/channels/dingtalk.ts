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
 * 通过钉钉 OpenAPI 发送消息（需要 access_token）
 */
export async function getAccessToken(config: DingtalkConfig): Promise<string | null> {
  try {
    const res = await fetch('https://oapi.dingtalk.com/gettoken', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    const url = new URL('https://oapi.dingtalk.com/gettoken')
    url.searchParams.set('appkey', config.appKey)
    url.searchParams.set('appsecret', config.appSecret)

    const tokenRes = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) })
    const data = await tokenRes.json()
    return data.access_token || null
  } catch {
    return null
  }
}
