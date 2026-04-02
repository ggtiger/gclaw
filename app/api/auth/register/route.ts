import { NextRequest } from 'next/server'
import { registerUser } from '@/lib/store/users'
import { addAuditLog } from '@/lib/store/audit-log'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { username, password } = body

  if (!username || !password) {
    return Response.json(
      { error: '用户名和密码不能为空' },
      { status: 400 }
    )
  }

  const result = registerUser(username, password)

  if (result.error) {
    return Response.json({ error: result.error }, { status: 400 })
  }

  // 审计：记录用户注册
  addAuditLog('user:register', result.user!.username, {
    userId: result.user!.id,
    role: result.user!.role,
  })

  // 返回用户信息（不含密码哈希）
  const { passwordHash: _, ...safe } = result.user!
  return Response.json({ user: safe }, { status: 201 })
}
