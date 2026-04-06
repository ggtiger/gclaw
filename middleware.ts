import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, TOKEN_COOKIE_NAME } from '@/lib/auth/jwt'

// 不需要认证的路径前缀
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/oauth',
  '/api/channels/webhook',
  '/login',
  '/register',
]

// 内部 API Key，用于技能环境调用 API
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'gclaw-internal-api-key'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 静态资源和 Next.js 内部路径直接放行
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // 公开路径直接放行
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 内部 API Key 认证（用于技能环境）
  const internalApiKey = request.headers.get('x-internal-api-key')
  if (internalApiKey === INTERNAL_API_KEY) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-internal-call', 'true')
    return NextResponse.next({
      request: { headers: requestHeaders },
    })
  }

  // 验证 token
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value

  if (!token) {
    // API 路由返回 401，页面路由放行（由客户端处理认证跳转）
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    return NextResponse.next()
  }

  const payload = await verifyToken(token)

  if (!payload) {
    // token 无效，清除 cookie
    const response = pathname.startsWith('/api/')
      ? NextResponse.json({ error: '未登录' }, { status: 401 })
      : NextResponse.next()
    response.cookies.set(TOKEN_COOKIE_NAME, '', { maxAge: 0, path: '/' })
    return response
  }

  // 已认证：在请求头中注入用户信息，供 API 路由使用
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', payload.userId)
  requestHeaders.set('x-user-name', payload.username)
  requestHeaders.set('x-user-role', payload.role)

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image).*)',
  ],
}
