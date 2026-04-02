import { NextRequest } from 'next/server'
import { getSettings, updateSettings } from '@/lib/store/settings'

export const dynamic = 'force-dynamic'

function getProjectId(request: NextRequest): string {
  return new URL(request.url).searchParams.get('projectId') || ''
}

export async function GET(request: NextRequest) {
  const projectId = getProjectId(request)
  const settings = getSettings(projectId)
  return Response.json(settings)
}

export async function PUT(request: NextRequest) {
  const projectId = getProjectId(request)
  const body = await request.json()
  const settings = updateSettings(projectId, body)
  return Response.json({ success: true, settings })
}
