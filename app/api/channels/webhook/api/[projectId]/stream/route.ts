/**
 * API 渠道 - SSE 流端点
 * GET /api/channels/webhook/api/[projectId]/stream
 * URL 路径携带 projectId，Bearer API Key 做认证
 */

import { NextRequest } from 'next/server'
import { authenticateApiChannel } from '@/lib/channels/api-service'
import { apiEventBus } from '@/lib/channels/api-events'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const authHeader = request.headers.get('authorization')
  const channel = authenticateApiChannel(projectId, authHeader)
  if (!channel) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ channelId: channel.id, projectId })}\n\n`))

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`))
        } catch {
          clearInterval(heartbeat)
        }
      }, 30_000)

      const unsubscribe = apiEventBus.subscribe(channel.id, (event) => {
        try {
          const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
          controller.enqueue(encoder.encode(sseData))
        } catch {
          // 连接已关闭
        }
      })

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        unsubscribe()
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
