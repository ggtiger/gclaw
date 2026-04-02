import { NextRequest } from 'next/server'
import { resolvePermission } from '@/lib/claude/process-manager'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { requestId, decision } = body

  if (!requestId || !decision || !['allow', 'deny'].includes(decision)) {
    return Response.json(
      { error: 'requestId and decision (allow|deny) are required' },
      { status: 400 }
    )
  }

  resolvePermission(requestId, decision)

  return Response.json({ ok: true })
}
