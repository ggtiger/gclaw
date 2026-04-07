// components/panels/focus/NoteList.tsx
'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, X, Eye, Edit3 } from 'lucide-react'
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer'
import type { FocusNote } from '@/types/focus'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

interface Props {
  notes: FocusNote[]
  loading: boolean
  onAdd: (title: string, content: string) => Promise<FocusNote | null>
  onSave: (note: FocusNote) => void
  onRemove: (id: string) => void
}

// ========== Markdown 编辑弹窗 ==========
function NoteEditorModal({
  note,
  isNew,
  onSave,
  onClose,
}: {
  note: FocusNote | null
  isNew: boolean
  onSave: (title: string, content: string) => Promise<FocusNote | null>
  onClose: () => void
}) {
  const [title, setTitle] = useState(note?.title || '')
  const [content, setContent] = useState(note?.content || '')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [saving, setSaving] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const handleSave = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    await onSave(title.trim(), content)
    setSaving(false)
    onClose()
  }

  if (!mounted) return null

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-[560px] max-w-[90vw] max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="笔记标题"
            className="flex-1 text-sm font-semibold bg-transparent outline-none placeholder:text-gray-400 text-gray-900 dark:text-white"
            autoFocus={isNew}
          />
          <div className="flex items-center gap-1 ml-3 shrink-0">
            {/* 编辑/预览切换 */}
            <div className="flex bg-gray-100 dark:bg-white/10 rounded-lg p-0.5">
              <button
                onClick={() => setMode('edit')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  mode === 'edit' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'
                }`}
              >
                <Edit3 className="w-3 h-3" /> 编辑
              </button>
              <button
                onClick={() => setMode('preview')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  mode === 'preview' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'
                }`}
              >
                <Eye className="w-3 h-3" /> 预览
              </button>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto thin-scrollbar p-4 min-h-0">
          {mode === 'edit' ? (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="支持 Markdown 语法..."
              className="w-full h-full min-h-[300px] text-sm bg-transparent outline-none resize-none placeholder:text-gray-400 text-gray-700 dark:text-gray-200 font-mono leading-relaxed"
              autoFocus={!isNew}
            />
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {content ? (
                <MarkdownRenderer content={content} />
              ) : (
                <p className="text-gray-400 text-sm">暂无内容，切换到编辑模式开始书写</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <span className="text-[10px] text-gray-400">
            Markdown 已支持 · {content.length} 字符
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 transition-colors"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
export default function NoteList({ notes, loading, onAdd, onSave, onRemove }: Props) {
  const [editorNote, setEditorNote] = useState<FocusNote | 'new' | null>(null)

  const handleEditorSave = async (title: string, content: string): Promise<FocusNote | null> => {
    if (editorNote === 'new') {
      return await onAdd(title, content)
    } else if (editorNote && typeof editorNote === 'object') {
      onSave({ ...editorNote, title, content })
      return editorNote
    }
    return null
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="text-amber-500">📝</span> 近期笔记
          {notes.length > 0 && (
            <span className="text-[10px] text-gray-400 font-normal">({notes.length})</span>
          )}
        </h2>
        <button
          onClick={() => setEditorNote('new')}
          className="text-purple-600 hover:opacity-80 text-xs font-medium bg-purple-100 dark:bg-purple-500/20 px-2 py-1 rounded-md transition-colors flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> 添加
        </button>
      </div>

      {/* 笔记列表 */}
      <div className="flex-1 overflow-y-auto thin-scrollbar min-h-0">
        <div className="flex flex-col gap-2">
          {loading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="bg-gray-100 dark:bg-white/5 rounded-lg p-3 animate-pulse">
                  <div className="h-3.5 w-2/3 rounded bg-gray-200 dark:bg-white/10 mb-2" />
                  <div className="h-3 w-full rounded bg-gray-200 dark:bg-white/10 mb-1" />
                  <div className="h-3 w-4/5 rounded bg-gray-200 dark:bg-white/10" />
                </div>
              ))}
            </div>
          ) : notes.length === 0 ? (
            <div className="bg-gray-100 dark:bg-white/5 rounded-lg p-3 text-xs text-gray-400 text-center">
              暂无笔记
            </div>
          ) : (
            notes.map(note => (
              <div
                key={note.id}
                onClick={() => setEditorNote(note)}
                className="bg-gray-100 dark:bg-white/5 rounded-lg p-3 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {note.title}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{timeAgo(note.createdAt)}</span>
                    <button
                      onClick={e => { e.stopPropagation(); onRemove(note.id) }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{note.content}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Markdown 编辑弹窗 */}
      {editorNote && (
        <NoteEditorModal
          note={typeof editorNote === 'object' ? editorNote : null}
          isNew={editorNote === 'new'}
          onSave={handleEditorSave}
          onClose={() => setEditorNote(null)}
        />
      )}
    </div>
  )
}
