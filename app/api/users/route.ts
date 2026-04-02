import { NextRequest } from 'next/server'
import { getAllUsers, updateUserRole, toggleUserDisabled } from '@/lib/store/users'
import { requireAdmin } from '@/lib/auth/helpers'

export const dynamic = 'force-dynamic'

/** 获取所有用户列表（仅 admin） */
export async function GET(request: NextRequest) {
  const authResult = requireAdmin(request)
  if (authResult instanceof Response) return authResult

  const users = getAllUsers()
  return Response.json({ users })
}

/** 更新用户角色或禁用状态（仅 admin） */
export async function PUT(request: NextRequest) {
  const authResult = requireAdmin(request)
  if (authResult instanceof Response) return authResult

  const body = await request.json()
  const { userId, action, role, disabled } = body as {
    userId: string
    action: 'updateRole' | 'toggleDisabled'
    role?: 'admin' | 'user'
    disabled?: boolean
  }

  if (!userId) {
    return Response.json({ error: '缺少 userId' }, { status: 400 })
  }

  switch (action) {
    case 'updateRole': {
      if (!role) return Response.json({ error: '缺少 role' }, { status: 400 })
      // 不能降级自己
      if (userId === authResult.userId) {
        return Response.json({ error: '不能修改自己的角色' }, { status: 400 })
      }
      const ok = updateUserRole(userId, role)
      if (!ok) return Response.json({ error: '用户不存在' }, { status: 404 })
      return Response.json({ success: true })
    }
    case 'toggleDisabled': {
      if (typeof disabled !== 'boolean') return Response.json({ error: '缺少 disabled' }, { status: 400 })
      if (userId === authResult.userId) {
        return Response.json({ error: '不能禁用自己' }, { status: 400 })
      }
      const ok = toggleUserDisabled(userId, disabled)
      if (!ok) return Response.json({ error: '用户不存在' }, { status: 404 })
      return Response.json({ success: true })
    }
    default:
      return Response.json({ error: '未知操作' }, { status: 400 })
  }
}
