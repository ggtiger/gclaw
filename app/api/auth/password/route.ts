import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth/helpers'
import { updateUserPassword } from '@/lib/store/users'
import { addAuditLog } from '@/lib/store/audit-log'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const user = getAuthUser(request)
  if (!user) {
    return Response.json({ error: '未登录' }, { status: 401 })
  }

  let body: { oldPassword?: string; newPassword?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 })
  }

  const { oldPassword, newPassword } = body
  if (!oldPassword || !newPassword) {
    return Response.json({ error: '请填写旧密码和新密码' }, { status: 400 })
  }

  const result = updateUserPassword(user.userId, oldPassword, newPassword)

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 400 })
  }

  addAuditLog('user:password_change', user.username, { userId: user.userId })

  return Response.json({ ok: true })
}
