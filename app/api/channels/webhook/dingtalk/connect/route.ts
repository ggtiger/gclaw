/**
 * 钉钉 Stream 连接管理 API
 * GET  /api/channels/webhook/dingtalk/connect?projectId=&channelId= — 查询状态
 * POST /api/channels/webhook/dingtalk/connect — 启动/重连
 * DELETE /api/channels/webhook/dingtalk/connect — 断开
 */

import { NextRequest } from 'next/server'
import { getChannels } from '@/lib/store/channels'
import { dingtalkStream } from '@/lib/channels/dingtalk-stream'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId')
  const channelId = searchParams.get('channelId')

  if (projectId && channelId) {
    const status = dingtalkStream.getStatus(projectId, channelId)
    return Response.json(status)
  }

  return Response.json({ connections: dingtalkStream.getAllStatuses() })
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

  if (!channel.dingtalk?.appKey || !channel.dingtalk?.appSecret) {
    return Response.json({ error: '未配置 appKey 或 appSecret' }, { status: 400 })
  }

  try {
    await dingtalkStream.connect(projectId, channel)
    return Response.json({ success: true, status: 'connected' })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : '连接失败' },
      { status: 500 },
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

  await dingtalkStream.disconnect(projectId, channelId)
  return Response.json({ success: true })
}
