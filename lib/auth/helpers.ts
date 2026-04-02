import { NextRequest } from 'next/server'
import type { UserRole } from '@/lib/store/users'

export interface AuthUser {
  userId: string
  username: string
  role: UserRole
}

/**
 * 从请求头中获取已认证用户信息（由 middleware 注入）
 */
export function getAuthUser(request: NextRequest): AuthUser | null {
  const userId = request.headers.get('x-user-id')
  const username = request.headers.get('x-user-name')
  const role = request.headers.get('x-user-role')

  if (!userId || !username || !role) return null

  return { userId, username, role: role as UserRole }
}

/**
 * 要求管理员权限，否则返回 403
 */
export function requireAdmin(request: NextRequest): AuthUser | Response {
  const user = getAuthUser(request)
  if (!user) {
    return Response.json({ error: '未登录' }, { status: 401 })
  }
  if (user.role !== 'admin') {
    return Response.json({ error: '权限不足' }, { status: 403 })
  }
  return user
}
