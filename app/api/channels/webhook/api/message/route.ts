/**
 * API 渠道 - 发送消息端点
 * POST /api/channels/webhook/api/message
 * 认证后异步执行 Agent，立即返回 202
 */

import { NextRequest } from 'next/server'
import { authenticateApiChannel, handleApiMessage } from '@/lib/channels/api-service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // 认证
  const authHeader = request.headers.get('authorization')
  const result = authenticateApiChannel(authHeader)
  if (!result) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId, channel } = result

  // 解析请求体
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

  // 异步执行，不阻塞响应
  handleApiMessage(projectId, channel, requestId, message).catch(err => {
    console.error('[ApiMessage] handleApiMessage unhandled error:', err)
  })

  return Response.json({ requestId }, { status: 202 })
}
