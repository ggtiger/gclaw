import { NextRequest } from 'next/server'
import { updateCommand, deleteCommand } from '@/lib/commands/registry'
import { validateCommand } from '@/lib/commands/validator'
import { assertValidProjectId } from '@/lib/store/projects'
import type { CommandDefinition } from '@/types/commands'

export const dynamic = 'force-dynamic'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ commandId: string }> }
) {
  const { commandId } = await params
  const body = await request.json()
  const { updates, scope, projectId } = body as {
    updates: Partial<CommandDefinition>
    scope: 'global' | 'project'
    projectId?: string
  }

  if (!updates) {
    return Response.json({ error: 'updates is required' }, { status: 400 })
  }

  if (!scope || (scope !== 'global' && scope !== 'project')) {
    return Response.json({ error: 'scope must be "global" or "project"' }, { status: 400 })
  }

  if (projectId) {
    try {
      assertValidProjectId(projectId)
    } catch {
      return Response.json({ error: 'Invalid projectId' }, { status: 400 })
    }
  }

  // 如果更新包含 steps，需要重新校验
  if (updates.steps) {
    // 构造一个完整的命令对象用于校验
    const mockCmd = {
      id: commandId,
      name: updates.name || 'temp',
      description: updates.description || '',
      scope,
      enabled: true,
      steps: updates.steps,
      createdAt: '',
      updatedAt: '',
      ...updates,
    } as CommandDefinition
    const validation = validateCommand(mockCmd)
    if (!validation.valid) {
      return Response.json({ error: 'Validation failed', errors: validation.errors }, { status: 400 })
    }
  }

  try {
    const result = updateCommand(commandId, updates, scope, projectId)
    if (!result) {
      return Response.json({ error: 'Command not found' }, { status: 404 })
    }
    return Response.json({ success: true, command: result })
  } catch (err) {
    console.error('[Commands API] Failed to update command:', err)
    return Response.json(
      { error: '更新命令失败：' + (err instanceof Error ? err.message : '未知错误') },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ commandId: string }> }
) {
  const { commandId } = await params
  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') as 'global' | 'project' | null
  const projectId = searchParams.get('projectId') || undefined

  if (!scope || (scope !== 'global' && scope !== 'project')) {
    return Response.json({ error: 'scope query param is required' }, { status: 400 })
  }

  if (projectId) {
    try {
      assertValidProjectId(projectId)
    } catch {
      return Response.json({ error: 'Invalid projectId' }, { status: 400 })
    }
  }

  try {
    const deleted = deleteCommand(commandId, scope, projectId)
    if (!deleted) {
      return Response.json({ error: 'Command not found' }, { status: 404 })
    }
    return Response.json({ success: true })
  } catch (err) {
    console.error('[Commands API] Failed to delete command:', err)
    return Response.json(
      { error: '删除命令失败：' + (err instanceof Error ? err.message : '未知错误') },
      { status: 500 }
    )
  }
}
