// components/panels/FocusPanel.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { Settings, Brain, PanelRightClose } from 'lucide-react'
import { useFocusData } from '@/hooks/useFocusData'
import { useProject } from '@/hooks/useProject'
import TodoList from './focus/TodoList'
import NoteList from './focus/NoteList'
import CalendarView from './focus/CalendarView'
import { FocusSettingsModal } from './focus/FocusSettings'
import MemoryList from './memory/MemoryList'
import { useMemoryData } from '@/hooks/useMemoryData'

interface Props {
  projectId: string
  onHide?: () => void
}

type MainTab = 'focus' | 'memory'

export default function FocusPanel({ projectId, onHide }: Props) {
  const {
    loading, todos, notes, events, settings,
    addTodo, toggleTodo, removeTodo,
    addNote, saveNote, removeNote,
    addEvent, removeEvent,
    saveSettings,
  } = useFocusData(projectId)

  // 从 project store 获取 ownerId
  const { projects } = useProject()
  const userId = useMemo(
    () => projects.find(p => p.id === projectId)?.ownerId,
    [projects, projectId]
  )

  const {
    loading: memoryLoading,
    semantic, procedural,
    searchQuery, setSearchQuery,
    archiveEntry, verifyEntry, consolidate,
  } = useMemoryData(userId, projectId)

  const [showSettings, setShowSettings] = useState(false)
  const [mainTab, setMainTab] = useState<MainTab>('focus')

  // 延迟显示骨架屏：加载快于 200ms 时跳过骨架屏，避免闪烁
  const [showSkeleton, setShowSkeleton] = useState(false)
  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false)
      return
    }
    const timer = setTimeout(() => setShowSkeleton(true), 200)
    return () => clearTimeout(timer)
  }, [loading])

  // 记忆条目总数
  const memoryCount = semantic.length + procedural.length

  return (
    <div className="flex flex-col overflow-hidden h-full bg-white dark:bg-transparent">
      {/* Header */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-5 pt-2 pb-2 shrink-0 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {onHide && (
            <button
              onClick={onHide}
              className="p-1 rounded-md text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors cursor-pointer"
              title="收起面板"
            >
              <PanelRightClose size={14} />
            </button>
          )}
          {/* 主 Tab 切换 */}
          <div className="flex gap-0.5 bg-gray-100 dark:bg-white/5 rounded-lg p-0.5">
            <button
              onClick={() => setMainTab('focus')}
              className={`text-[10px] font-medium px-2 py-0.5 rounded-md transition-colors ${
                mainTab === 'focus'
                  ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              专注
            </button>
            <button
              onClick={() => setMainTab('memory')}
              className={`text-[10px] font-medium px-2 py-0.5 rounded-md transition-colors flex items-center gap-0.5 ${
                mainTab === 'memory'
                  ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <Brain className="w-2.5 h-2.5" />
              记忆
              {memoryCount > 0 && (
                <span className="text-[8px] px-1 py-0 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400">
                  {memoryCount}
                </span>
              )}
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="专注模式设置"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Tab 内容 */}
      {mainTab === 'focus' ? (
        <>
          {/* Todos */}
          <div className="px-3 py-3 pt-0 pb-3 shrink-0">
            <TodoList todos={todos} loading={showSkeleton} onToggle={toggleTodo} onAdd={addTodo} onRemove={removeTodo} />
          </div>

          {/* Notes */}
          <div className="px-3 py-3 pt-0 pb-0 flex-1 min-h-0 overflow-hidden flex flex-col">
            <NoteList notes={notes} loading={showSkeleton} onAdd={addNote} onSave={saveNote} onRemove={removeNote} />
          </div>

          {/* Calendar */}
          <div className="px-3 py-3 pt-0 pb-3 shrink-0">
            <CalendarView events={events} loading={loading} onAdd={addEvent} onRemove={removeEvent} />
          </div>
        </>
      ) : (
        /* 记忆面板 */
        <div className="flex-1 min-h-0 overflow-hidden px-3 py-2 flex flex-col">
          <MemoryList
            semantic={semantic}
            procedural={procedural}
            loading={memoryLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onArchive={archiveEntry}
            onVerify={verifyEntry}
            onConsolidate={consolidate}
          />
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <FocusSettingsModal
          projectId={projectId}
          settings={settings}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
