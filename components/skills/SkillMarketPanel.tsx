'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Download, Check, RefreshCw, ExternalLink, ArrowUpCircle } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface MarketSkill {
  name: string
  displayName: string
  description: string
  author?: string
  version?: string
  downloads?: number
  category?: string
  installed: boolean
  installedVersion?: string
}

interface SkillMarketPanelProps {
  onSkillInstalled?: () => void
}

export function SkillMarketPanel({ onSkillInstalled }: SkillMarketPanelProps) {
  const { toast } = useToast()
  const [skills, setSkills] = useState<MarketSkill[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [installing, setInstalling] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  const loadSkills = useCallback(async (resetPage = false) => {
    const currentPage = resetPage ? 1 : page
    if (resetPage) setPage(1)

    setLoading(true)
    try {
      const params = new URLSearchParams({ q: searchQuery, page: String(currentPage), limit: '20' })
      const res = await fetch(`/api/skills/market?${params}`)
      const data = await res.json()

      if (data.success) {
        const newSkills = data.data.skills as MarketSkill[]
        if (resetPage || currentPage === 1) {
          setSkills(newSkills)
        } else {
          setSkills(prev => [...prev, ...newSkills])
        }
        setTotal(data.data.total)
        setHasMore(data.data.hasMore)
      }
    } catch (err) {
      console.error('Failed to load market skills:', err)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, page])

  useEffect(() => { loadSkills(true) }, [])

  useEffect(() => {
    const timer = setTimeout(() => loadSkills(true), 500)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleInstall = async (skillName: string) => {
    setInstalling(skillName)
    try {
      const res = await fetch('/api/skills/market/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillName }),
      })
      const data = await res.json()

      if (data.success) {
        setSkills(prev => prev.map(s => s.name === skillName ? { ...s, installed: true } : s))
        onSkillInstalled?.()
      } else {
        toast(data.error || '安装失败', 'error')
      }
    } catch (err) {
      console.error('Install failed:', err)
      toast('安装失败', 'error')
    } finally {
      setInstalling(null)
    }
  }

  const handleUpdate = async (skillName: string) => {
    setUpdating(skillName)
    try {
      const res = await fetch('/api/skills/market/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillName }),
      })
      const data = await res.json()

      if (data.success) {
        toast('更新成功', 'success')
        // 更新本地状态：installedVersion 设为市场版本
        setSkills(prev => prev.map(s =>
          s.name === skillName ? { ...s, installedVersion: s.version } : s
        ))
        onSkillInstalled?.()
      } else {
        toast(data.error || '更新失败', 'error')
      }
    } catch (err) {
      console.error('Update failed:', err)
      toast('更新失败', 'error')
    } finally {
      setUpdating(null)
    }
  }

  const hasUpdate = (skill: MarketSkill) =>
    skill.installed && skill.version && skill.installedVersion && skill.version !== skill.installedVersion

  return (
    <div className="space-y-3">
      {/* 搜索栏 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索技能..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
            }}
          />
        </div>
        <button
          onClick={() => loadSkills(true)}
          disabled={loading}
          className="p-2 rounded-lg border transition-colors cursor-pointer"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          title="刷新"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        <a
          href="https://skillhub.tencent.com"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg border transition-colors"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          title="打开 SkillHub"
        >
          <ExternalLink size={14} />
        </a>
      </div>

      {/* 统计 */}
      {total > 0 && (
        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          共 {total} 个技能
        </div>
      )}

      {/* 技能列表 */}
      {loading && skills.length === 0 ? (
        <div className="py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          加载中...
        </div>
      ) : skills.length === 0 ? (
        <div className="text-center py-8">
          <Search size={28} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {searchQuery ? '未找到匹配的技能' : '暂无可用技能'}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {skills.map(skill => (
            <div
              key={skill.name}
              className="p-3 rounded-lg border transition-colors"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                      {skill.displayName || skill.name}
                    </span>
                    {hasUpdate(skill) ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 15%, transparent)', color: 'var(--color-warning)' }}>
                        v{skill.installedVersion} → v{skill.version}
                      </span>
                    ) : skill.installed && skill.installedVersion ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                        style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)' }}>
                        v{skill.installedVersion}
                      </span>
                    ) : skill.version ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                        style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)' }}>
                        v{skill.version}
                      </span>
                    ) : null}
                    {skill.installed && !hasUpdate(skill) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, transparent)', color: 'var(--color-success)' }}>
                        已安装
                      </span>
                    )}
                  </div>
                  <div className="text-xs line-clamp-2 mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                    {skill.description || '暂无描述'}
                  </div>
                  <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                    {skill.author && <span>{skill.author}</span>}
                    {skill.downloads !== undefined && (
                      <span className="flex items-center gap-0.5">
                        <Download size={10} /> {skill.downloads.toLocaleString()}
                      </span>
                    )}
                    {skill.category && (
                      <span className="px-1 py-0.5 rounded"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)', color: 'var(--color-primary)' }}>
                        {skill.category}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {hasUpdate(skill) ? (
                    <button
                      onClick={() => handleUpdate(skill.name)}
                      disabled={updating !== null}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--color-warning) 15%, transparent)',
                        color: 'var(--color-warning)',
                      }}
                    >
                      {updating === skill.name ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" />
                          <span>更新中</span>
                        </>
                      ) : (
                        <>
                          <ArrowUpCircle size={12} />
                          <span>更新</span>
                        </>
                      )}
                    </button>
                  ) : skill.installed ? (
                    <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-success)' }}>
                      <Check size={14} />
                    </div>
                  ) : (
                    <button
                      onClick={() => handleInstall(skill.name)}
                      disabled={installing !== null}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: 'var(--color-primary)',
                        color: '#fff',
                      }}
                    >
                      {installing === skill.name ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" />
                          <span>安装中</span>
                        </>
                      ) : (
                        <>
                          <Download size={12} />
                          <span>安装</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 加载更多 */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => { setPage(p => p + 1); loadSkills(false) }}
            disabled={loading}
            className="px-4 py-1.5 text-xs transition-colors cursor-pointer disabled:opacity-50"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {loading ? '加载中...' : '加载更多'}
          </button>
        </div>
      )}
    </div>
  )
}
