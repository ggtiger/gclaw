/**
 * 微信连接管理 API
 * GET  /api/channels/webhook/wechat/connect?projectId=&channelId= — 查询状态
 * POST /api/channels/webhook/wechat/connect — 启动/重连
 * DELETE /api/channels/webhook/wechat/connect — 断开
 */

import { NextRequest } from 'next/server'
import { getChannels } from '@/lib/store/channels'
import { wechatPoller } from '@/lib/channels/wechat-poller'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId')
  const channelId = searchParams.get('channelId')

  if (projectId && channelId) {
    const status = wechatPoller.getStatus(projectId, channelId)
    return Response.json(status)
  }

  // 返回所有连接状态
  return Response.json({ connections: wechatPoller.getAllStatuses() })
}

export async function POST(request: NextRequest) {
  const { projectId, channelId } = await request.json()
  if (!projectId || !channelId) {
    return Response.json({ error: 'projectId, channelId required' }, { status: 400 })
  }

  const channels = getChannels(projectId)
  const channel = channels.find(c => c.id === channelId)
  if (!channel) {
    return Response.json({ error: 'channel not found' }, { status: 404 })
  }

  if (!channel.wechat?.botToken) {
    return Response.json({ error: '未配置 botToken，请先扫码登录' }, { status: 400 })
  }

  try {
    await wechatPoller.connect(projectId, channel)
    return Response.json({ success: true, status: 'connecting' })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '连接失败' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId')
  const channelId = searchParams.get('channelId')

  if (!projectId || !channelId) {
    return Response.json({ error: 'projectId, channelId required' }, { status: 400 })
  }

  wechatPoller.disconnect(projectId, channelId)
  return Response.json({ success: true })
}
