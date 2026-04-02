import { NextRequest } from 'next/server'
import { TOKEN_COOKIE_NAME } from '@/lib/auth/jwt'
import { addAuditLog } from '@/lib/store/audit-log'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // 从 cookie 中提取用户信息用于审计
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value

  // 审计：记录登出（尽力而为，token 可能已失效）
  if (token) {
    try {
      const { verifyToken } = await import('@/lib/auth/jwt')
      const payload = await verifyToken(token)
      if (payload) {
        addAuditLog('user:logout', payload.username, { userId: payload.userId })
      }
    } catch {
      // token 无效也允许登出
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${TOKEN_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`,
    },
  })
}
