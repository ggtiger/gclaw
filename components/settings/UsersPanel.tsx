'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Shield, UserCog, Ban, CheckCircle, RefreshCw } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface UserItem {
  id: string
  username: string
  role: 'admin' | 'user'
  createdAt: string
  lastLoginAt?: string
  disabled: boolean
}

export function UsersPanel() {
  const { toast } = useToast()
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      if (res.status === 403) {
        setUsers([])
        return
      }
      const data = await res.json()
      setUsers(data.users || [])
    } catch {
      console.error('加载用户列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleUpdateRole = async (userId: string, role: 'admin' | 'user') => {
    setUpdating(userId)
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'updateRole', role }),
      })
      const data = await res.json()
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
      } else {
        toast(data.error || '操作失败', 'error')
      }
    } catch {
      toast('操作失败', 'error')
    } finally {
      setUpdating(null)
    }
  }

  const handleToggleDisabled = async (userId: string, disabled: boolean) => {
    setUpdating(userId)
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'toggleDisabled', disabled }),
      })
      const data = await res.json()
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, disabled } : u))
        toast(disabled ? '用户已禁用' : '用户已启用', 'success')
      } else {
        toast(data.error || '操作失败', 'error')
      }
    } catch {
      toast('操作失败', 'error')
    } finally {
      setUpdating(null)
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--color-bg-secondary)' }} />
        ))}
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="p-4 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
        仅管理员可查看此页面
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          <Users size={16} />
          用户管理
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)' }}>
            {users.length}
          </span>
        </div>
        <button onClick={loadUsers} className="p-1.5 rounded-md cursor-pointer transition-colors hover:bg-[var(--color-bg-secondary)]" style={{ color: 'var(--color-text-muted)' }}>
          <RefreshCw size={14} />
        </button>
      </div>

      {users.map(user => (
        <div
          key={user.id}
          className="flex items-center gap-3 p-3 rounded-lg border"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
        >
          {/* 头像 */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{
              backgroundColor: user.role === 'admin'
                ? 'var(--color-primary-15)'
                : 'var(--color-muted-10)',
              color: user.role === 'admin' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            }}
          >
            {user.username[0].toUpperCase()}
          </div>

          {/* 信息 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                {user.username}
              </span>
              {user.role === 'admin' && (
                <Shield size={12} style={{ color: 'var(--color-primary)' }} />
              )}
              {user.disabled && (
                <span className="text-[10px] px-1 py-0 rounded" style={{ backgroundColor: 'var(--color-error-10)', color: 'var(--color-error)' }}>
                  已禁用
                </span>
              )}
            </div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              注册 {formatDate(user.createdAt)}
              {user.lastLoginAt && ` · 最后登录 ${formatDate(user.lastLoginAt)}`}
            </div>
          </div>

          {/* 操作 */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* 角色选择 */}
            <select
              value={user.role}
              disabled={!!updating}
              onChange={e => handleUpdateRole(user.id, e.target.value as 'admin' | 'user')}
              className="text-xs px-2 py-1 rounded border outline-none cursor-pointer"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <option value="admin">管理员</option>
              <option value="user">普通用户</option>
            </select>

            {/* 禁用/启用 */}
            <button
              onClick={() => handleToggleDisabled(user.id, !user.disabled)}
              disabled={!!updating}
              className="p-1.5 rounded-md cursor-pointer transition-colors disabled:opacity-40"
              style={{
                color: user.disabled ? 'var(--color-success)' : 'var(--color-error)',
                backgroundColor: user.disabled
                  ? 'var(--color-success-10)'
                  : 'var(--color-error-10)',
              }}
              title={user.disabled ? '启用' : '禁用'}
            >
              {user.disabled ? <CheckCircle size={14} /> : <Ban size={14} />}
            </button>

            {updating === user.id && (
              <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
