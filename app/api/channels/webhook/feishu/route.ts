/**
 * 飞书 Webhook 端点
 * URL: POST /api/channels/webhook/feishu?key={appId}
 */

import { NextRequest } from 'next/server'
import { findChannelByWebhookKey } from '@/lib/store/channels'
import { parseFeishuEvent, replyFeishu } from '@/lib/channels/feishu'
import { handleChannelMessage } from '@/lib/channels/channel-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const key = new URL(request.url).searchParams.get('key')
  if (!key) {
    return Response.json({ error: 'key required' }, { status: 400 })
  }

  const body = await request.json()

  // 查找对应的项目和渠道
  const found = findChannelByWebhookKey('feishu', key)
  if (!found) {
    return Response.json({ error: 'channel not found' }, { status: 404 })
  }

  const { projectId, channel } = found
  const config = channel.feishu
  if (!config) {
    return Response.json({ error: 'feishu config missing' }, { status: 400 })
  }

  // 解析事件
  const event = parseFeishuEvent(body)

  // URL 验证 challenge（飞书首次配置回调时发送）
  if (event.type === 'challenge') {
    return Response.json({ challenge: event.challenge })
  }

  // 忽略非消息事件
  if (event.type !== 'message' || !event.text) {
    return Response.json({ success: true, message: 'ignored' })
  }

  console.log(`[Webhook/Feishu] Message: ${event.text.slice(0, 100)}`)

  // 调用 Agent 获取回复
  const reply = await handleChannelMessage(projectId, channel, event.text)

  // 回复消息
  if (event.messageId) {
    await replyFeishu(config, event.messageId, reply)
  }

  return Response.json({ success: true })
}
