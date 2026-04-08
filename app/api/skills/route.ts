import { NextRequest } from 'next/server'
import { scanAvailableSkills } from '@/lib/claude/skills-dir'
import { getEnabledSkills, setEnabledSkills } from '@/lib/store/skills'
import { isValidProjectId } from '@/lib/store/projects'

export const dynamic = 'force-dynamic'

function getProjectId(request: NextRequest): string {
  return new URL(request.url).searchParams.get('projectId') || ''
}

export async function GET(request: NextRequest) {
  const projectId = getProjectId(request)
  const available = scanAvailableSkills()
  const enabled = isValidProjectId(projectId) ? getEnabledSkills(projectId) : []

  // 合并 enabled 状态
  const merged = available.map(skill => ({
    ...skill,
    enabled: enabled.includes(skill.name),
  }))

  return Response.json({ skills: merged, enabled })
}

export async function PUT(request: NextRequest) {
  const projectId = getProjectId(request)

  if (!isValidProjectId(projectId)) {
    return Response.json({ error: 'Invalid projectId' }, { status: 400 })
  }

  const body = await request.json()
  const enabled = body.enabled || body.enabledSkills

  if (!Array.isArray(enabled)) {
    return Response.json({ error: 'enabled must be an array' }, { status: 400 })
  }

  setEnabledSkills(projectId, enabled)
  return Response.json({ success: true, enabled })
}
