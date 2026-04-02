import { NextRequest } from 'next/server'
import { getChannels, addChannel, updateChannel, removeChannel } from '@/lib/store/channels'

export const dynamic = 'force-dynamic'

function getParam(request: NextRequest, key: string): string {
  return new URL(request.url).searchParams.get(key) || ''
}

// GET /api/channels?projectId=xxx
export async function GET(request: NextRequest) {
  const projectId = getParam(request, 'projectId')
  if (!projectId) return Response.json({ success: false, error: 'projectId required' }, { status: 400 })
  const channels = getChannels(projectId)
  return Response.json({ success: true, channels })
}

// POST /api/channels?projectId=xxx — 添加渠道
export async function POST(request: NextRequest) {
  const projectId = getParam(request, 'projectId')
  if (!projectId) return Response.json({ success: false, error: 'projectId required' }, { status: 400 })

  const body = await request.json()
  const { type, name, enabled = true, dingtalk, feishu, wechat } = body

  if (!type || !name) {
    return Response.json({ success: false, error: 'type and name required' }, { status: 400 })
  }

  const channel = addChannel(projectId, { type, name, enabled, dingtalk, feishu, wechat })
  return Response.json({ success: true, channel })
}

// PUT /api/channels?projectId=xxx&channelId=yyy — 更新渠道
export async function PUT(request: NextRequest) {
  const projectId = getParam(request, 'projectId')
  const channelId = getParam(request, 'channelId')
  if (!projectId || !channelId) {
    return Response.json({ success: false, error: 'projectId and channelId required' }, { status: 400 })
  }

  const body = await request.json()
  const channel = updateChannel(projectId, channelId, body)
  if (!channel) return Response.json({ success: false, error: 'channel not found' }, { status: 404 })
  return Response.json({ success: true, channel })
}

// DELETE /api/channels?projectId=xxx&channelId=yyy — 删除渠道
export async function DELETE(request: NextRequest) {
  const projectId = getParam(request, 'projectId')
  const channelId = getParam(request, 'channelId')
  if (!projectId || !channelId) {
    return Response.json({ success: false, error: 'projectId and channelId required' }, { status: 400 })
  }

  const ok = removeChannel(projectId, channelId)
  if (!ok) return Response.json({ success: false, error: 'channel not found' }, { status: 404 })
  return Response.json({ success: true })
}
