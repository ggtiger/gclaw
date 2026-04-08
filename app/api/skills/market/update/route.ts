import { NextRequest } from 'next/server'
import { updateSkill } from '@/lib/services/skill-market'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { skillName } = body

  if (!skillName || typeof skillName !== 'string') {
    return Response.json({ error: 'skillName is required' }, { status: 400 })
  }

  const result = await updateSkill(skillName)
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 500 })
  }

  return Response.json({ success: true })
}
