'use client'

import { useState, useEffect, useCallback } from 'react'
import { Zap, Save } from 'lucide-react'
import type { SkillInfo } from '@/types/skills'
import { useToast } from '@/components/ui/Toast'

export function DefaultSkillsPanel() {
  const { toast } = useToast()
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [skillsRes, defaultRes] = await Promise.all([
        fetch('/api/skills'),
        fetch('/api/skills/default'),
      ])
      const skillsData = await skillsRes.json()
      const defaultData = await defaultRes.json()
      const defaultNames: string[] = defaultData.skills || []
      const available: SkillInfo[] = skillsData.skills || []

      // 如果没有配置过默认技能，默认全选
      const isInitial = defaultNames.length === 0
      setSkills(available.map(s => ({
        ...s,
        enabled: isInitial ? true : defaultNames.includes(s.name),
      })))
      if (isInitial && available.length > 0) {
        setDirty(true)
      }
    } catch (err) {
      console.error('Failed to load skills:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const toggleSkill = (name: string) => {
    setSkills(prev => prev.map(s => (s.name === name ? { ...s, enabled: !s.enabled } : s)))
    setDirty(true)
  }

  const toggleAll = () => {
    const allEnabled = skills.every(s => s.enabled)
    setSkills(prev => prev.map(s => ({ ...s, enabled: !allEnabled })))
    setDirty(true)
  }

  const save = async () => {
    const names = skills.filter(s => s.enabled).map(s => s.name)
    try {
      await fetch('/api/skills/default', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: names }),
      })
      setDirty(false)
      toast('默认技能已保存', 'success')
    } catch (err) {
      console.error(err)
      toast('保存失败', 'error')
    }
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--color-bg-secondary)' }} />
        ))}
      </div>
    )
  }

  const enabledCount = skills.filter(s => s.enabled).length

  return (
    <div className="p-4">
      <div className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
        设置新项目创建时默认启用的技能。当前已启用 {enabledCount}/{skills.length} 个。
      </div>

      {/* 全选/取消全选 */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={toggleAll}
          className="text-xs px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
          style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)' }}
        >
          {skills.every(s => s.enabled) ? '取消全选' : '全选'}
        </button>
        {dirty && (
          <button
            onClick={save}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors cursor-pointer"
          >
            <Save size={12} />
            保存
          </button>
        )}
      </div>

      {/* 技能列表 */}
      <div className="flex flex-col gap-2">
        {skills.map(skill => (
          <div
            key={skill.name}
            className="flex items-center gap-2 p-2.5 rounded-xl border transition-colors"
            style={{
              borderColor: skill.enabled ? 'var(--color-primary)' : 'var(--color-border)',
              backgroundColor: skill.enabled ? 'color-mix(in srgb, var(--color-primary) 5%, transparent)' : 'transparent',
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
            {/* Toggle */}
            <button
              onClick={() => toggleSkill(skill.name)}
              className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer"
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
        ))}
      </div>
    </div>
  )
}
