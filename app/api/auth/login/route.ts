import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/store/users'
import { generateToken, getTokenMaxAge, TOKEN_COOKIE_NAME } from '@/lib/auth/jwt'
import { addAuditLog } from '@/lib/store/audit-log'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { username, password, rememberMe } = body

  if (!username || !password) {
    return Response.json(
      { error: '用户名和密码不能为空' },
      { status: 400 }
    )
  }

  const user = authenticateUser(username, password)

  if (!user) {
    // 统一错误信息，不区分用户名/密码错误
    return Response.json(
      { error: '用户名或密码错误' },
      { status: 401 }
    )
  }

  const token = await generateToken(
    { userId: user.id, username: user.username, role: user.role },
    rememberMe
  )

  // 审计：记录登录
  addAuditLog('user:login', user.username, { userId: user.id })

  const { passwordHash: _, ...safe } = user
  const maxAge = getTokenMaxAge(rememberMe)

  // 使用 NextResponse + cookies.set 确保在 standalone 模式下可靠设置 Cookie
  const response = NextResponse.json({ user: safe, token, maxAge })
  response.cookies.set(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    path: '/',
    maxAge,
    sameSite: 'lax',
  })
  return response
}
