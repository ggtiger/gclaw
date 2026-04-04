import { NextRequest } from 'next/server'
import { getMessages, clearMessages } from '@/lib/store/messages'
import { updateProjectSettings } from '@/lib/store/settings'
import { isValidProjectId } from '@/lib/store/projects'

export const dynamic = 'force-dynamic'

function getProjectId(request: NextRequest): string {
  return new URL(request.url).searchParams.get('projectId') || ''
}

export async function GET(request: NextRequest) {
  const projectId = getProjectId(request)
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const before = searchParams.get('before') || undefined

  const result = getMessages(projectId, limit, before)
  return Response.json(result)
}

export async function DELETE(request: NextRequest) {
  const projectId = getProjectId(request)
  if (!projectId || !isValidProjectId(projectId)) {
    return Response.json({ error: 'Invalid projectId' }, { status: 400 })
  }
  clearMessages(projectId)
  updateProjectSettings(projectId, { sessionId: '' })
  return Response.json({ success: true })
}
