import { NextRequest } from 'next/server'
import { generateCommand, optimizeCommand } from '@/lib/commands/ai-generator'
import type { CommandDefinition } from '@/types/commands'

export const dynamic = 'force-dynamic'

function sseStream(handler: (send: (event: string, data: unknown) => void) => Promise<void>) {
  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }
        try {
          await handler(send)
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : '未知错误'
          send('error', { message })
        } finally {
          controller.close()
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    }
  )
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action = 'generate', description, command, instruction, projectId } = body as {
    action?: 'generate' | 'optimize'
    description?: string
    command?: CommandDefinition
    instruction?: string
    projectId?: string
  }

  // 参数校验仍然用普通 JSON 响应返回
  if (action === 'generate') {
    if (!description || !description.trim()) {
      return Response.json({ error: '请提供工作流描述' }, { status: 400 })
    }
    if (!projectId) {
      return Response.json({ error: 'projectId is required' }, { status: 400 })
    }

    return sseStream(async (send) => {
      send('progress', { stage: 'generating', message: '正在生成工作流命令...' })
      const result = await generateCommand(description.trim(), projectId)
      send('progress', { stage: 'validating', message: '校验生成结果...' })
      send('result', { command: result })
      send('done', {})
    })
  }

  if (action === 'optimize') {
    if (!command) {
      return Response.json({ error: '请提供要优化的命令' }, { status: 400 })
    }

    return sseStream(async (send) => {
      send('progress', { stage: 'optimizing', message: '正在优化工作流命令...' })
      const result = await optimizeCommand(command, instruction?.trim(), projectId)
      send('progress', { stage: 'validating', message: '校验优化结果...' })
      send('result', { command: result })
      send('done', {})
    })
  }

  return Response.json({ error: `不支持的 action: ${action}` }, { status: 400 })
}
