'use client'

import { useState, useCallback } from 'react'
import { GitBranch, Plus, Trash2, X } from 'lucide-react'
import type { BranchInfo } from '@/types/chat'
import { MAX_BRANCHES } from '@/types/chat'

interface BranchSwitcherProps {
  projectId: string
  activeBranch: string
  onSwitch: (branchId: string) => void
}

const BRANCH_COLORS = [
  'var(--color-primary)',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#14b8a6',
]

export function BranchSwitcher({ projectId, activeBranch, onSwitch }: BranchSwitcherProps) {
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')

  const fetchBranches = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/chat/branches?projectId=${encodeURIComponent(projectId)}`)
      const data = await res.json()
      setBranches(data.branches || [])
    } catch {
      setBranches([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useState(() => { fetchBranches() })

  const handleCreate = async () => {
    if (!newBranchName.trim()) return
    try {
      const res = await fetch('/api/chat/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          fromMessageId: '', // 需要由外部传入
          name: newBranchName.trim(),
        }),
      })
      if (res.ok) {
        setShowCreate(false)
        setNewBranchName('')
        fetchBranches()
      }
    } catch {}
  }

  const handleDelete = async (branchId: string) => {
    try {
      const res = await fetch(
        `/api/chat/branches?projectId=${encodeURIComponent(projectId)}&branchId=${encodeURIComponent(branchId)}`,
        { method: 'DELETE' }
      )
      if (res.ok) {
        fetchBranches()
        if (activeBranch === branchId) {
          onSwitch('main')
        }
      }
    } catch {}
  }

  const totalBranches = 1 + branches.length // main + 其他分支

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5" style={{
      backgroundColor: 'var(--color-bg-secondary)',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <GitBranch size={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />

      {/* 主线 */}
      <button
        onClick={() => onSwitch('main')}
        className="px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors"
        style={{
          backgroundColor: activeBranch === 'main'
            ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)'
            : 'transparent',
          color: activeBranch === 'main' ? 'var(--color-primary)' : 'var(--color-text-muted)',
          border: activeBranch === 'main' ? '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)' : '1px solid transparent',
        }}
      >
        主线
      </button>

      {/* 分支列表 */}
      {branches.map((branch, idx) => (
        <div key={branch.id} className="flex items-center gap-0.5">
          <button
            onClick={() => onSwitch(branch.id)}
            className="px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer transition-colors flex items-center gap-1"
            style={{
              backgroundColor: activeBranch === branch.id
                ? `color-mix(in srgb, ${BRANCH_COLORS[idx % BRANCH_COLORS.length]} 15%, transparent)`
                : 'transparent',
              color: activeBranch === branch.id
                ? BRANCH_COLORS[idx % BRANCH_COLORS.length]
                : 'var(--color-text-muted)',
              border: activeBranch === branch.id
                ? `1px solid color-mix(in srgb, ${BRANCH_COLORS[idx % BRANCH_COLORS.length]} 30%, transparent)`
                : '1px solid transparent',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: BRANCH_COLORS[idx % BRANCH_COLORS.length] }}
            />
            {branch.name}
          </button>
          <button
            onClick={() => handleDelete(branch.id)}
            className="p-0.5 rounded cursor-pointer opacity-0 group-hover:opacity-100 hover:opacity-100"
            style={{ color: 'var(--color-text-muted)' }}
            title="删除分支"
          >
            <Trash2 size={10} />
          </button>
        </div>
      ))}

      {/* 创建新分支 */}
      {totalBranches < MAX_BRANCHES && (
        showCreate ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={newBranchName}
              onChange={e => setNewBranchName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setShowCreate(false); setNewBranchName('') }
              }}
              placeholder="分支名称"
              className="px-1.5 py-0.5 rounded text-[11px] border outline-none w-20"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
              }}
            />
            <button
              onClick={handleCreate}
              className="text-[11px] cursor-pointer font-medium"
              style={{ color: 'var(--color-primary)' }}
            >创建</button>
            <button
              onClick={() => { setShowCreate(false); setNewBranchName('') }}
              className="cursor-pointer"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="p-0.5 rounded cursor-pointer"
            style={{ color: 'var(--color-text-muted)' }}
            title="新建分支"
          >
            <Plus size={13} />
          </button>
        )
      )}
    </div>
  )
}
