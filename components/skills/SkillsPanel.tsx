'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Zap, RefreshCw, FileText, AlertCircle, Store, Upload, Download, Trash2 } from 'lucide-react'
import type { SkillInfo } from '@/types/skills'
import { SkillMarketPanel } from './SkillMarketPanel'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import { isTauri } from '@/lib/tauri'

type Tab = 'installed' | 'market'

export function SkillsPanel({ projectId }: { projectId: string }) {
  const { toast } = useToast()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('installed')
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingSkill, setDeletingSkill] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const fetchSkills = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/skills?projectId=${encodeURIComponent(projectId)}`)
      const data = await res.json()
      setSkills(data.skills || [])
    } catch (err) {
      setError('加载技能列表失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchSkills()
  }, [fetchSkills])

  const toggleSkill = useCallback(async (name: string, enabled: boolean) => {
    // 乐观更新
    setSkills(prev =>
      prev.map(s => (s.name === name ? { ...s, enabled } : s))
    )
    try {
      const updatedEnabled = skills
        .map(s => (s.name === name ? { ...s, enabled } : s))
        .filter(s => s.enabled)
        .map(s => s.name)

      await fetch(`/api/skills?projectId=${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledSkills: updatedEnabled }),
      })
    } catch (err) {
      // 回滚
      setSkills(prev =>
        prev.map(s => (s.name === name ? { ...s, enabled: !enabled } : s))
      )
      console.error(err)
    }
  }, [skills])

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.zip')) {
      toast('请选择 zip 格式文件', 'error')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/skills/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        toast(`技能 "${data.skillName}" 安装成功`, 'success')
        fetchSkills()
      } else {
        toast(data.error || '上传失败', 'error')
      }
    } catch (err) {
      toast('上传失败', 'error')
      console.error(err)
    } finally {
      setUploading(false)
      // 重置 input 以便重复选择同一文件
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [fetchSkills, toast])

  const handleExport = useCallback(async (skillName: string) => {
    try {
      const res = await fetch(`/api/skills/export?name=${encodeURIComponent(skillName)}`)
      if (!res.ok) {
        const data = await res.json()
        toast(data.error || '导出失败', 'error')
        return
      }

      const filename = `${skillName}.zip`

      if (isTauri()) {
        const blob = await res.blob()
        const arrayBuffer = await blob.arrayBuffer()
        const content = Array.from(new Uint8Array(arrayBuffer))

        const { save } = await import('@tauri-apps/plugin-dialog')
        const savePath = await save({
          defaultPath: filename,
          filters: [{ name: 'ZIP', extensions: ['zip'] }],
        })
        if (savePath) {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('save_file_content', { path: savePath, content })
        }
      } else {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      toast('导出失败', 'error')
      console.error(err)
    }
  }, [toast])

  const handleDelete = useCallback(async (skillName: string) => {
    setDeletingSkill(skillName)
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast(`技能 "${skillName}" 已删除`, 'success')
        fetchSkills()
      } else {
        toast(data.error || '删除失败', 'error')
      }
    } catch (err) {
      toast('删除失败', 'error')
      console.error(err)
    } finally {
      setDeletingSkill(null)
    }
  }, [fetchSkills, toast])

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--color-bg-secondary)' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Tab 切换 */}
      <div className="flex gap-1 mb-3 p-0.5 rounded-lg" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
        <button
          onClick={() => setTab('installed')}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
          style={{
            backgroundColor: tab === 'installed' ? 'var(--color-bg)' : 'transparent',
            color: tab === 'installed' ? 'var(--color-text)' : 'var(--color-text-muted)',
            boxShadow: tab === 'installed' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
          }}
        >
          <Zap size={12} /> 已安装
        </button>
        <button
          onClick={() => setTab('market')}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
          style={{
            backgroundColor: tab === 'market' ? 'var(--color-bg)' : 'transparent',
            color: tab === 'market' ? 'var(--color-text)' : 'var(--color-text-muted)',
            boxShadow: tab === 'market' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
          }}
        >
          <Store size={12} /> 技能市场
        </button>
      </div>

      {tab === 'market' ? (
        <SkillMarketPanel onSkillInstalled={fetchSkills} />
      ) : (
        <>
          {/* 说明 */}
          <div className="text-xs mb-3 flex items-start gap-2" style={{ color: 'var(--color-text-muted)' }}>
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              将 <code className="px-1 rounded" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>.md</code> 技能文件放到 <code className="px-1 rounded" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>skills/</code> 目录中，然后刷新列表。
            </span>
          </div>

          {/* 刷新 + 上传按钮 */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={fetchSkills}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors cursor-pointer"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-secondary)',
                backgroundColor: 'var(--color-bg)',
              }}
            >
              <RefreshCw size={14} />
              刷新
            </button>
            {isAdmin && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors cursor-pointer disabled:opacity-50"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-primary)',
                    backgroundColor: 'var(--color-bg)',
                  }}
                >
                  <Upload size={14} />
                  {uploading ? '上传中...' : '上传 zip'}
                </button>
              </>
            )}
          </div>

          {error && (
            <div className="text-sm mb-3 px-3 py-2 rounded-lg" style={{
              backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
              color: 'var(--color-error)',
            }}>
              {error}
            </div>
          )}

          {/* 技能列表 */}
          {skills.length === 0 ? (
            <div className="text-center py-8">
              <FileText size={32} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
              <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                暂无技能文件
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {skills.map(skill => (
                <div
                  key={skill.name}
                  className="flex items-start gap-3 p-3 rounded-lg border transition-colors"
                  style={{
                    borderColor: skill.enabled ? 'var(--color-primary)' : 'var(--color-border)',
                    backgroundColor: skill.enabled ? 'color-mix(in srgb, var(--color-primary) 5%, transparent)' : 'var(--color-bg)',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Zap size={14} style={{ color: skill.enabled ? 'var(--color-primary)' : 'var(--color-text-muted)' }} />
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                        {skill.displayName}
                      </span>
                      {skill.version && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                          style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)' }}>
                          v{skill.version}
                        </span>
                      )}
                    </div>
                    {skill.description && (
                      <div className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
                        {skill.description}
                      </div>
                    )}
                  </div>
                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => handleExport(skill.name)}
                          className="p-1.5 rounded transition-colors cursor-pointer"
                          style={{ color: 'var(--color-text-muted)' }}
                          title="导出 zip"
                        >
                          <Download size={13} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(skill.name)}
                          disabled={deletingSkill === skill.name}
                          className="p-1.5 rounded transition-colors cursor-pointer disabled:opacity-50"
                          style={{ color: 'var(--color-error)' }}
                          title="删除技能"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                    {/* Toggle */}
                    <button
                      onClick={() => toggleSkill(skill.name, !skill.enabled)}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer`}
                      style={{
                        backgroundColor: skill.enabled ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
                      }}
                    >
                      <span
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                        style={{
                          transform: skill.enabled ? 'translateX(2px)' : 'translateX(-18px)',
                        }}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 删除确认对话框 */}
          {confirmDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
              <div className="rounded-xl p-5 shadow-xl max-w-xs w-full mx-4" style={{ backgroundColor: 'var(--color-surface)' }}>
                <div className="text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                  删除技能
                </div>
                <div className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
                  确定要删除技能 &ldquo;{confirmDelete}&rdquo; 吗？此操作不可撤销。
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="flex-1 px-3 py-2 rounded-lg text-xs border transition-colors cursor-pointer"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      const name = confirmDelete
                      setConfirmDelete(null)
                      handleDelete(name)
                    }}
                    disabled={deletingSkill === confirmDelete}
                    className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-error)', color: 'white' }}
                  >
                    {deletingSkill === confirmDelete ? '删除中...' : '删除'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
