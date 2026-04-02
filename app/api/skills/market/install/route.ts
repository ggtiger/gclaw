import { NextRequest } from 'next/server'
import { installSkill } from '@/lib/services/skill-market'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const { skillName } = await request.json()

  if (!skillName || typeof skillName !== 'string') {
    return Response.json({ success: false, error: 'skillName is required' }, { status: 400 })
  }

  try {
    const result = await installSkill(skillName)
    return Response.json(result)
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : '安装失败' },
      { status: 500 }
    )
  }
}
