/**
 * 钉钉 Webhook 端点
 * URL: POST /api/channels/webhook/dingtalk?key={appKey}
 */

import { NextRequest } from 'next/server'
import { findChannelByWebhookKey } from '@/lib/store/channels'
import { parseDingtalkMessage, replyDingtalk, verifyDingtalkSignature } from '@/lib/channels/dingtalk'
import { handleChannelMessage } from '@/lib/channels/channel-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 分钟超时（Agent 执行可能较长）

export async function POST(request: NextRequest) {
  const key = new URL(request.url).searchParams.get('key')
  if (!key) {
    return Response.json({ error: 'key required' }, { status: 400 })
  }

  // 查找对应的项目和渠道
  const found = findChannelByWebhookKey('dingtalk', key)
  if (!found) {
    return Response.json({ error: 'channel not found' }, { status: 404 })
  }

  const { projectId, channel } = found
  const config = channel.dingtalk
  if (!config) {
    return Response.json({ error: 'dingtalk config missing' }, { status: 400 })
  }

  // 验证签名
  const timestamp = request.headers.get('timestamp') || ''
  const sign = request.headers.get('sign') || ''
  if (timestamp && sign && !verifyDingtalkSignature(timestamp, sign, config.appSecret)) {
    return Response.json({ error: 'signature verification failed' }, { status: 403 })
  }

  // 解析消息
  const body = await request.json()
  const { text, imageUrl, sessionWebhook, senderNick } = parseDingtalkMessage(body)

  if (!text) {
    return Response.json({ success: true, message: 'no text content' })
  }

  // 构建附件
  const attachments = imageUrl ? [{
    id: `att_${Date.now()}_img`,
    filename: 'image.jpg',
    mimeType: 'image/jpeg',
    size: 0,
    url: imageUrl,
    type: 'image' as const,
  }] : undefined

  console.log(`[Webhook/Dingtalk] Message from ${senderNick}: ${text.slice(0, 100)}`)

  // 调用 Agent 获取回复
  const reply = await handleChannelMessage(projectId, channel, text, attachments)

  // 回复消息
  if (sessionWebhook) {
    await replyDingtalk(sessionWebhook, reply)
  }

  return Response.json({ success: true })
}
