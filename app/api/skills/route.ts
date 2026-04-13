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
  const hasProject = isValidProjectId(projectId)
  const enabled = hasProject ? getEnabledSkills(projectId) : []

  // 判断是否为首次使用（项目有效但没有配置过启用列表）
  const isFirstUse = hasProject && enabled.length === 0

  let finalEnabled: string[]
  if (isFirstUse) {
    // 首次使用：默认启用所有平台自带技能，并持久化
    finalEnabled = available.filter(s => s.builtIn).map(s => s.name)
    setEnabledSkills(projectId, finalEnabled)
  } else {
    finalEnabled = enabled
  }

  // 合并 enabled 状态
  const merged = available.map(skill => ({
    ...skill,
    enabled: finalEnabled.includes(skill.name),
  }))

  return Response.json({ skills: merged, enabled: finalEnabled })
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
