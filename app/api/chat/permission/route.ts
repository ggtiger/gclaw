import { NextRequest } from 'next/server'
import { resolvePermission } from '@/lib/claude/process-manager'
import { addAuditLog } from '@/lib/store/audit-log'
import { getAuthUser } from '@/lib/auth/helpers'

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

  // 审计：记录权限审批决策
  const user = getAuthUser(request)
  addAuditLog(
    decision === 'allow' ? 'permission:allow' : 'permission:deny',
    user?.username || 'user',
    { requestId }
  )

  return Response.json({ ok: true })
}
