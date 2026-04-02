'use client'

import { useState, useEffect, useCallback } from 'react'
import { Zap, RefreshCw, FileText, AlertCircle, Store } from 'lucide-react'
import type { SkillInfo } from '@/types/skills'
import { SkillMarketPanel } from './SkillMarketPanel'

type Tab = 'installed' | 'market'

export function SkillsPanel({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<Tab>('installed')
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

          {/* 刷新按钮 */}
          <button
            onClick={fetchSkills}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors cursor-pointer mb-3"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)',
              backgroundColor: 'var(--color-bg)',
            }}
          >
            <RefreshCw size={14} />
            刷新技能列表
          </button>

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
                    </div>
                    {skill.description && (
                      <div className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
                        {skill.description}
                      </div>
                    )}
                  </div>
                  {/* Toggle */}
                  <button
                    onClick={() => toggleSkill(skill.name, !skill.enabled)}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 cursor-pointer`}
                    style={{
                      backgroundColor: skill.enabled ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
                    }}
                  >
                    <span
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                      style={{
                        transform: skill.enabled ? 'translateX(22px)' : 'translateX(2px)',
                      }}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
