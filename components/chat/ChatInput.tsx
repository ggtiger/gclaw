'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Square, Paperclip } from 'lucide-react'
import { TemplateSelector } from './TemplateSelector'

interface Template {
  id: string
  name: string
  description: string
  systemPrompt: string
  firstMessage: string
  isBuiltIn: boolean
}

interface ChatInputProps {
  onSend: (message: string) => void
  onAbort: () => void
  sending: boolean
  disabled?: boolean
  projectId?: string
  onTemplateSelect?: (template: Template) => void
}

export function ChatInput({ onSend, onAbort, sending, disabled, projectId, onTemplateSelect }: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 自动调整 textarea 高度
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [input, adjustHeight])

  // 聚焦输入框
  useEffect(() => {
    if (!sending) {
      textareaRef.current?.focus()
    }
  }, [sending])

  const handleSubmit = useCallback(() => {
    if (!input.trim() || sending || disabled) return
    onSend(input)
    setInput('')
    // 重置高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input, sending, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className="px-4 py-3">
      {/* 模板选择器 */}
      {onTemplateSelect && (
        <div className="mb-2">
          <TemplateSelector projectId={projectId || ''} onSelect={onTemplateSelect} />
        </div>
      )}
      <div className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)] border border-white/50 dark:border-white/10 p-2 flex flex-col gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          rows={1}
          disabled={disabled}
          className="w-full resize-none border-none bg-transparent focus:ring-0 focus:outline-none p-3 text-sm text-[var(--color-text)] placeholder-[var(--color-text-secondary)]/70 min-h-[56px] max-h-32"
        />
        <div className="flex justify-between items-center px-2 pb-1">
          {/* 左侧功能按钮组 */}
          <div className="flex items-center gap-1">
            <button
              className="p-2 text-[var(--color-text-secondary)] hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-colors"
              title="附加文件"
              type="button"
            >
              <Paperclip size={18} />
            </button>
            <div className="h-4 w-px bg-[var(--color-border)] mx-1" />
          </div>

          {/* 发送 / 停止按钮 */}
          {sending ? (
            <button
              onClick={onAbort}
              className="w-9 h-9 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center justify-center transition-colors shadow-sm"
              title="停止生成"
              type="button"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || disabled}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shadow-sm ${input.trim() ? 'bg-purple-600 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 opacity-50 cursor-not-allowed'}`}
              title="发送消息"
              type="button"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
