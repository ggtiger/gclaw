import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, TOKEN_COOKIE_NAME } from '@/lib/auth/jwt'

// 不需要认证的路径前缀
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/oauth',
  '/login',
  '/register',
]

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

  // 验证 token
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value

  if (!token) {
    return handleUnauthorized(request, pathname)
  }

  const payload = await verifyToken(token)

  if (!payload) {
    // token 无效，清除 cookie
    const response = handleUnauthorized(request, pathname)
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

function handleUnauthorized(request: NextRequest, pathname: string) {
  // API 路由返回 401
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  // 页面路由重定向到登录页
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('redirect', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，除了：
     * - _next/static (静态文件)
     * - _next/image (图片优化)
     */
    '/((?!_next/static|_next/image).*)',
  ],
}
