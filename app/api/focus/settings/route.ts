// app/api/focus/settings/route.ts
import { NextRequest } from 'next/server'
import { getFocusSettings, updateFocusSettings } from '@/lib/focus/store'
import { isValidProjectId } from '@/lib/store/projects'
import type { FocusSettings } from '@/types/focus'

export const dynamic = 'force-dynamic'

function getProjectId(request: NextRequest): string {
  return new URL(request.url).searchParams.get('projectId') || ''
}

export async function GET(request: NextRequest) {
  const projectId = getProjectId(request)
  if (!isValidProjectId(projectId)) return Response.json({ error: 'Invalid projectId' }, { status: 400 })
  return Response.json(getFocusSettings(projectId))
}

export async function PUT(request: NextRequest) {
  const projectId = getProjectId(request)
  if (!isValidProjectId(projectId)) return Response.json({ error: 'Invalid projectId' }, { status: 400 })
  const body: FocusSettings = await request.json()
  const settings = updateFocusSettings(projectId, body)
  return Response.json(settings)
}
