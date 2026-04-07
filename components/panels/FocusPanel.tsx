// components/panels/FocusPanel.tsx
'use client'

import { useState } from 'react'
import { Settings } from 'lucide-react'
import { useFocusData } from '@/hooks/useFocusData'
import TodoList from './focus/TodoList'
import NoteList from './focus/NoteList'
import CalendarView from './focus/CalendarView'
import { FocusSettingsModal } from './focus/FocusSettings'

interface Props {
  projectId: string
}

export default function FocusPanel({ projectId }: Props) {
  const {
    loading, todos, notes, events, settings,
    addTodo, toggleTodo, removeTodo,
    addNote, saveNote, removeNote,
    addEvent, removeEvent,
    saveSettings,
  } = useFocusData(projectId)

  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="flex flex-col overflow-hidden h-full bg-white dark:bg-transparent">
      {/* Header */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0 select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">专注模式</span>
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

      {/* Todos */}
      <div className="px-3 py-3 pt-0 pb-3 shrink-0">
        <TodoList todos={todos} loading={loading} onToggle={toggleTodo} onAdd={addTodo} onRemove={removeTodo} />
      </div>

      {/* Notes */}
      <div className="px-3 py-3 pt-0 pb-0 flex-1 min-h-0 overflow-hidden flex flex-col">
        <NoteList notes={notes} loading={loading} onAdd={addNote} onSave={saveNote} onRemove={removeNote} />
      </div>

      {/* Calendar */}
      <div className="px-3 py-3 pt-0 pb-3 shrink-0">
        <CalendarView events={events} loading={loading} onAdd={addEvent} onRemove={removeEvent} />
      </div>

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
