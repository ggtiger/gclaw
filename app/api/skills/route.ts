import { NextRequest } from 'next/server'
import { scanAvailableSkills } from '@/lib/claude/skills-dir'
import { getEnabledSkills, setEnabledSkills } from '@/lib/store/skills'

export const dynamic = 'force-dynamic'

export async function GET() {
  const available = scanAvailableSkills()
  const enabled = getEnabledSkills()

  // 合并 enabled 状态
  const merged = available.map(skill => ({
    ...skill,
    enabled: enabled.includes(skill.name),
  }))

  return Response.json({ skills: merged, enabled })
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const enabled = body.enabled || body.enabledSkills

  if (!Array.isArray(enabled)) {
    return Response.json({ error: 'enabled must be an array' }, { status: 400 })
  }

  setEnabledSkills(enabled)
  return Response.json({ success: true, enabled })
}
