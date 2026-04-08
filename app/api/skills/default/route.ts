import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth/helpers'
import { getDefaultSkills, setDefaultSkills } from '@/lib/store/skills'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ skills: getDefaultSkills() })
}

export async function PUT(request: NextRequest) {
  const authResult = requireAdmin(request)
  if (authResult instanceof Response) return authResult

  const body = await request.json()
  const { skills } = body

  if (!Array.isArray(skills)) {
    return Response.json({ error: 'skills must be an array' }, { status: 400 })
  }

  setDefaultSkills(skills)
  return Response.json({ success: true, skills })
}
