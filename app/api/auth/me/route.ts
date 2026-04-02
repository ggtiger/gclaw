import { NextRequest } from 'next/server'
import { verifyToken, TOKEN_COOKIE_NAME } from '@/lib/auth/jwt'
import { getUserById } from '@/lib/store/users'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value

  if (!token) {
    return Response.json({ error: '未登录' }, { status: 401 })
  }

  const payload = await verifyToken(token)

  if (!payload) {
    // token 无效或过期
    return new Response(JSON.stringify({ error: '登录已过期' }), {
      status: 401,
      headers: {
        'Set-Cookie': `${TOKEN_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`,
      },
    })
  }

  const user = getUserById(payload.userId)

  if (!user) {
    return new Response(JSON.stringify({ error: '用户不存在' }), {
      status: 401,
      headers: {
        'Set-Cookie': `${TOKEN_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`,
      },
    })
  }

  return Response.json({ user })
}
