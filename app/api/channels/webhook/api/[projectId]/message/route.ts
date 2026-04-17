/**
 * API 渠道 - 发送消息端点
 * POST /api/channels/webhook/api/[projectId]/message
 * URL 路径携带 projectId，Bearer API Key 做认证
 */

import { NextRequest } from 'next/server'
import { authenticateApiChannel, handleApiMessage } from '@/lib/channels/api-service'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const authHeader = request.headers.get('authorization')
  const channel = authenticateApiChannel(projectId, authHeader)
  if (!channel) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { message?: string; attachments?: unknown[] }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const message = body.message?.trim()
  if (!message) {
    return Response.json({ error: 'message is required' }, { status: 400 })
  }

  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  handleApiMessage(projectId, channel, requestId, message).catch(err => {
    console.error('[ApiMessage] handleApiMessage unhandled error:', err)
  })

  return Response.json({ requestId }, { status: 202 })
}
