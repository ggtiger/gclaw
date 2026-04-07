// components/panels/memory/MemoryList.tsx
'use client'

import { useState } from 'react'
import { Search, Tag, Archive, CheckCircle, Clock, Sparkles } from 'lucide-react'
import type { SemanticEntry, ProceduralEntry } from '@/types/memory'

interface Props {
  semantic: SemanticEntry[]
  procedural: ProceduralEntry[]
  loading: boolean
  searchQuery: string
  onSearchChange: (q: string) => void
  onArchive: (id: string, level: 'semantic' | 'procedural') => void
  onVerify: (id: string, level: 'semantic' | 'procedural') => void
  onConsolidate: () => void
}

type TabType = 'semantic' | 'procedural'

const semanticTypeLabels: Record<string, string> = {
  user_profile: '用户画像',
  preference: '偏好',
  project_knowledge: '项目知识',
  environment: '环境',
  entity_relation: '关系',
}

const proceduralTypeLabels: Record<string, string> = {
  runbook: '操作手册',
  lesson: '经验教训',
  error_resolution: '错误解决',
  best_practice: '最佳实践',
}

const verificationBadge: Record<string, { label: string; className: string }> = {
  verified: { label: '已验证', className: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' },
  unverified: { label: '未验证', className: 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400' },
  outdated: { label: '已过时', className: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400' },
}

export default function MemoryList({
  semantic, procedural, loading,
  searchQuery, onSearchChange,
  onArchive, onVerify, onConsolidate,
}: Props) {
  const [tab, setTab] = useState<TabType>('semantic')
  const [consolidating, setConsolidating] = useState(false)

  const handleConsolidate = async () => {
    setConsolidating(true)
    await onConsolidate()
    setConsolidating(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 搜索栏 */}
      <div className="flex items-center gap-1.5 px-1 mb-2">
        <div className="flex items-center flex-1 min-w-0 gap-1.5 bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1">
          <Search className="w-3 h-3 text-gray-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="搜索记忆..."
            className="flex-1 min-w-0 text-xs bg-transparent outline-none text-gray-700 dark:text-gray-300 placeholder:text-gray-400"
          />
        </div>
        <button
          onClick={handleConsolidate}
          disabled={consolidating}
          className="shrink-0 p-1 rounded-lg bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-500/30 transition-colors disabled:opacity-50"
          title="巩固记忆"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-0.5 mb-2 bg-gray-100 dark:bg-white/5 rounded-lg p-0.5">
        <button
          onClick={() => setTab('semantic')}
          className={`flex-1 text-[10px] font-medium py-1 rounded-md transition-colors ${
            tab === 'semantic'
              ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          语义 ({semantic.length})
        </button>
        <button
          onClick={() => setTab('procedural')}
          className={`flex-1 text-[10px] font-medium py-1 rounded-md transition-colors ${
            tab === 'procedural'
              ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          程序 ({procedural.length})
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar space-y-1.5">
        {loading ? (
          <div className="space-y-1.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse rounded-lg bg-gray-100 dark:bg-white/5 h-16" />
            ))}
          </div>
        ) : tab === 'semantic' ? (
          semantic.length === 0 ? (
            <EmptyState message="暂无语义记忆" />
          ) : (
            semantic.map(entry => (
              <SemanticCard key={entry.id} entry={entry} onArchive={onArchive} onVerify={onVerify} />
            ))
          )
        ) : procedural.length === 0 ? (
          <EmptyState message="暂无程序记忆" />
        ) : (
          procedural.map(entry => (
            <ProceduralCard key={entry.id} entry={entry} onArchive={onArchive} onVerify={onVerify} />
          ))
        )}
      </div>
    </div>
  )
}

function SemanticCard({
  entry,
  onArchive,
  onVerify,
}: {
  entry: SemanticEntry
  onArchive: (id: string, level: 'semantic' | 'procedural') => void
  onVerify: (id: string, level: 'semantic' | 'procedural') => void
}) {
  return (
    <div className="group rounded-lg bg-white/50 dark:bg-white/5 border border-gray-100 dark:border-white/[0.06] p-2.5 transition-colors hover:bg-white dark:hover:bg-white/[0.08]">
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400">
              {semanticTypeLabels[entry.type] || entry.type}
            </span>
            {entry.scope === 'project' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
                项目
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{entry.title}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{entry.content}</p>
          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-0.5 mt-1">
              {entry.tags.slice(0, 3).map(tag => (
                <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                  <Tag className="w-2.5 h-2.5" />{tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {!entry.lastVerifiedAt && (
            <button
              onClick={() => onVerify(entry.id, 'semantic')}
              className="p-0.5 text-gray-400 hover:text-green-500 transition-colors"
              title="验证"
            >
              <CheckCircle className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => onArchive(entry.id, 'semantic')}
            className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
            title="归档"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {entry.lastVerifiedAt && (
        <div className="flex items-center gap-0.5 mt-1 text-[10px] text-green-500">
          <CheckCircle className="w-2.5 h-2.5" /> 已验证
        </div>
      )}
    </div>
  )
}

function ProceduralCard({
  entry,
  onArchive,
  onVerify,
}: {
  entry: ProceduralEntry
  onArchive: (id: string, level: 'semantic' | 'procedural') => void
  onVerify: (id: string, level: 'semantic' | 'procedural') => void
}) {
  const badge = verificationBadge[entry.verification] || verificationBadge.unverified

  return (
    <div className="group rounded-lg bg-white/50 dark:bg-white/5 border border-gray-100 dark:border-white/[0.06] p-2.5 transition-colors hover:bg-white dark:hover:bg-white/[0.08]">
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">
              {proceduralTypeLabels[entry.type] || entry.type}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{entry.title}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{entry.content}</p>
          {entry.triggers.length > 0 && (
            <div className="flex flex-wrap gap-0.5 mt-1">
              {entry.triggers.slice(0, 3).map(t => (
                <span key={t} className="text-[10px] px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {entry.verification === 'unverified' && (
            <button
              onClick={() => onVerify(entry.id, 'procedural')}
              className="p-0.5 text-gray-400 hover:text-green-500 transition-colors"
              title="验证"
            >
              <CheckCircle className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => onArchive(entry.id, 'procedural')}
            className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
            title="归档"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-gray-400 dark:text-gray-500">
      <Clock className="w-6 h-6 mb-1.5" />
      <p className="text-[10px]">{message}</p>
    </div>
  )
}
