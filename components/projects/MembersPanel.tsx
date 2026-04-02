'use client'

import { useState, useCallback } from 'react'
import { UserPlus, X, Shield, Pencil, Trash2, Search, Loader } from 'lucide-react'
import type { ProjectMember, ProjectRole } from '@/types/skills'

interface MembersPanelProps {
  projectId: string
}

const ROLE_LABELS: Record<ProjectRole, string> = {
  owner: '所有者',
  editor: '编辑者',
  viewer: '查看者',
}

const ROLE_COLORS: Record<ProjectRole, { bg: string; text: string }> = {
  owner: { bg: 'color-mix(in srgb, var(--color-warning, #f59e0b) 15%, transparent)', text: 'var(--color-warning, #f59e0b)' },
  editor: { bg: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', text: 'var(--color-primary)' },
  viewer: { bg: 'color-mix(in srgb, var(--color-text-muted) 15%, transparent)', text: 'var(--color-text-muted)' },
}

export function MembersPanel({ projectId }: MembersPanelProps) {
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [availableUsers, setAvailableUsers] = useState<{ userId: string; username: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [addingUserId, setAddingUserId] = useState<string | null>(null)

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/members?projectId=${encodeURIComponent(projectId)}`)
      const data = await res.json()
      setMembers(data.members || [])
    } catch (err) {
      console.error('Failed to load members:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const handleSearch = useCallback(async (keyword: string) => {
    setSearch(keyword)
    if (!keyword.trim()) {
      setAvailableUsers([])
      return
    }
    setSearching(true)
    try {
      const res = await fetch(
        `/api/projects/members?projectId=${encodeURIComponent(projectId)}&search=${encodeURIComponent(keyword)}`
      )
      const data = await res.json()
      setAvailableUsers(data.available || [])
    } catch {
      setAvailableUsers([])
    } finally {
      setSearching(false)
    }
  }, [projectId])

  const handleAddMember = async (userId: string, username: string) => {
    setAddingUserId(userId)
    try {
      const res = await fetch('/api/projects/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, userId, role: 'viewer' }),
      })
      if (res.ok) {
        setAvailableUsers(prev => prev.filter(u => u.userId !== userId))
        fetchMembers()
      }
    } finally {
      setAddingUserId(null)
    }
  }

  const handleRoleChange = async (userId: string, newRole: ProjectRole) => {
    try {
      const res = await fetch('/api/projects/members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, userId, role: newRole }),
      })
      if (res.ok) {
        fetchMembers()
      }
    } catch {}
  }

  const handleRemoveMember = async (userId: string) => {
    try {
      const res = await fetch(`/api/projects/members?projectId=${encodeURIComponent(projectId)}&userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        fetchMembers()
      }
    } catch {}
  }

  // 初始加载
  if (loading && members.length === 0) {
    fetchMembers()
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-10 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--color-bg-secondary)' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3">
      {/* 邀请用户 */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          <UserPlus size={12} className="inline mr-1" />
          邀请成员
        </label>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="搜索用户名..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs outline-none transition-colors focus:border-[var(--color-primary)]"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
            }}
          />
        </div>
        {/* 搜索结果 */}
        {searching && (
          <div className="text-xs py-1.5" style={{ color: 'var(--color-text-muted)' }}>搜索中...</div>
        )}
        {!searching && availableUsers.length > 0 && (
          <div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
            {availableUsers.map(u => (
              <div
                key={u.userId}
                className="flex items-center justify-between px-2 py-1.5 rounded-md transition-colors cursor-pointer"
                style={{ backgroundColor: 'var(--color-bg-secondary)' }}
                onClick={() => handleAddMember(u.userId, u.username)}
              >
                <span className="text-xs" style={{ color: 'var(--color-text)' }}>{u.username}</span>
                {addingUserId === u.userId ? (
                  <Loader size={12} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                ) : (
                  <UserPlus size={13} style={{ color: 'var(--color-primary)' }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 成员列表 */}
      <div className="space-y-1">
        <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
          成员 ({members.length})
        </div>
        {members.map(member => {
          const colors = ROLE_COLORS[member.role] || ROLE_COLORS.viewer
          return (
            <div
              key={member.userId}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md"
              style={{ backgroundColor: 'var(--color-bg-secondary)' }}
            >
              {/* 头像 */}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
                  color: 'var(--color-primary)',
                }}
              >
                {(member.username || '?')[0].toUpperCase()}
              </div>

              {/* 用户名 */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate" style={{ color: 'var(--color-text)' }}>
                  {member.username || member.userId.slice(0, 8)}
                </div>
              </div>

              {/* 角色选择 */}
              {member.role === 'owner' ? (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: colors.bg, color: colors.text }}
                >
                  {ROLE_LABELS[member.role]}
                </span>
              ) : (
                <select
                  value={member.role}
                  onChange={e => handleRoleChange(member.userId, e.target.value as ProjectRole)}
                  className="text-[10px] px-1 py-0.5 rounded border outline-none cursor-pointer"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--color-bg)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <option value="editor">编辑者</option>
                  <option value="viewer">查看者</option>
                </select>
              )}

              {/* 移除按钮 */}
              {member.role !== 'owner' && (
                <button
                  onClick={() => handleRemoveMember(member.userId)}
                  className="p-0.5 rounded cursor-pointer"
                  style={{ color: 'var(--color-text-muted)' }}
                  title="移除成员"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
