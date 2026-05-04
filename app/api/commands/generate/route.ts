import { NextRequest } from 'next/server'
import { generateCommand, optimizeCommand } from '@/lib/commands/ai-generator'
import type { CommandDefinition } from '@/types/commands'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action = 'generate', description, command, instruction, projectId } = body as {
      action?: 'generate' | 'optimize'
      description?: string
      command?: CommandDefinition
      instruction?: string
      projectId?: string
    }

    if (action === 'generate') {
      if (!description || !description.trim()) {
        return Response.json({ error: '请提供工作流描述' }, { status: 400 })
      }
      if (!projectId) {
        return Response.json({ error: 'projectId is required' }, { status: 400 })
      }

      const result = await generateCommand(description.trim(), projectId)
      return Response.json({ command: result })
    }

    if (action === 'optimize') {
      if (!command) {
        return Response.json({ error: '请提供要优化的命令' }, { status: 400 })
      }

      const result = await optimizeCommand(command, instruction?.trim())
      return Response.json({ command: result })
    }

    return Response.json({ error: `不支持的 action: ${action}` }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    return Response.json({ error: message }, { status: 500 })
  }
}
