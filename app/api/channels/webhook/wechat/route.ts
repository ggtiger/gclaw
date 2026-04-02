/**
 * 微信 ClawBot Webhook 端点
 * URL: POST /api/channels/webhook/wechat?key={botToken}
 * ClawBot 插件通过 Authorization: Bearer {botToken} 认证
 */

import { NextRequest } from 'next/server'
import { findChannelByWebhookKey } from '@/lib/store/channels'
import { parseClawBotMessage, verifyClawBotRequest, sendWechatMessage } from '@/lib/channels/wechat'
import { handleChannelMessage } from '@/lib/channels/channel-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const key = new URL(request.url).searchParams.get('key')
  if (!key) {
    return Response.json({ error: 'key required' }, { status: 400 })
  }

  // 通过 botToken 查找渠道（findChannelByWebhookKey 中 wechat 类型匹配 botToken 而非 botId）
  const found = findChannelByWebhookKey('wechat', key)
  if (!found) {
    return Response.json({ error: 'channel not found' }, { status: 404 })
  }

  const { projectId, channel } = found
  const config = channel.wechat
  if (!config) {
    return Response.json({ error: 'wechat config missing' }, { status: 400 })
  }

  // 验证 Authorization header
  const authHeader = request.headers.get('authorization')
  if (!verifyClawBotRequest(authHeader, config)) {
    return Response.json({ error: 'unauthorized' }, { status: 403 })
  }

  // 解析消息
  const body = await request.json()
  const { text, fromUser, conversationId } = parseClawBotMessage(body)

  if (!text) {
    return Response.json({ success: true, message: 'no text content' })
  }

  console.log(`[Webhook/ClawBot] Message from ${fromUser}: ${text.slice(0, 100)}`)

  // 调用 Agent 获取回复
  const reply = await handleChannelMessage(projectId, channel, text)

  // 通过 ilink API 回复
  await sendWechatMessage({
    token: config.botToken,
    toUserId: fromUser,
    content: reply,
  })

  // 同步返回回复
  return Response.json({
    success: true,
    reply: {
      text: reply,
      conversationId,
      msgType: 'text',
    },
  })
}
