import { NextRequest } from 'next/server'
import { getCommands, getAllCommands, createCommand } from '@/lib/commands/registry'
import { validateCommand } from '@/lib/commands/validator'
import { assertValidProjectId } from '@/lib/store/projects'
import type { CommandDefinition } from '@/types/commands'

export const dynamic = 'force-dynamic'

function getProjectId(request: NextRequest): string {
  return new URL(request.url).searchParams.get('projectId') || ''
}

export async function GET(request: NextRequest) {
  const projectId = getProjectId(request)
  const { searchParams } = new URL(request.url)
  const includeDisabled = searchParams.get('includeDisabled') === 'true'

  if (!projectId) {
    return Response.json({ error: 'projectId is required' }, { status: 400 })
  }

  try {
    assertValidProjectId(projectId)
  } catch {
    return Response.json({ error: 'Invalid projectId' }, { status: 400 })
  }

  const commands = includeDisabled
    ? getAllCommands(projectId)
    : getCommands(projectId)

  return Response.json({ commands })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { command, scope, projectId } = body as {
    command: CommandDefinition
    scope: 'global' | 'project'
    projectId?: string
  }

  if (!command) {
    return Response.json({ error: 'command is required' }, { status: 400 })
  }

  if (!scope || (scope !== 'global' && scope !== 'project')) {
    return Response.json({ error: 'scope must be "global" or "project"' }, { status: 400 })
  }

  if (scope === 'project' && !projectId) {
    return Response.json({ error: 'projectId is required for project scope' }, { status: 400 })
  }

  if (projectId) {
    try {
      assertValidProjectId(projectId)
    } catch {
      return Response.json({ error: 'Invalid projectId' }, { status: 400 })
    }
  }

  // 校验命令定义
  const validation = validateCommand(command)
  if (!validation.valid) {
    return Response.json({ error: 'Validation failed', errors: validation.errors }, { status: 400 })
  }

  const created = createCommand(command, scope, projectId)
  return Response.json({ success: true, command: created })
}
