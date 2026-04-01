'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Square, Paperclip } from 'lucide-react'

interface ChatInputProps {
  onSend: (message: string) => void
  onAbort: () => void
  sending: boolean
  disabled?: boolean
}

export function ChatInput({ onSend, onAbort, sending, disabled }: ChatInputProps) {
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
    <div className="border-t px-4 py-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      <div
        className="flex items-end gap-2 rounded-xl border px-3 py-2 transition-colors focus-within:border-[var(--color-primary)]"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
      >
        {/* 附件按钮 (预留) */}
        <button
          className="p-1.5 rounded-lg transition-colors cursor-pointer self-end mb-0.5"
          style={{ color: 'var(--color-text-muted)' }}
          title="附加文件"
          type="button"
        >
          <Paperclip size={18} />
        </button>

        {/* 输入框 */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[var(--color-text-muted)]"
          style={{ color: 'var(--color-text)', maxHeight: '200px' }}
        />

        {/* 发送 / 停止按钮 */}
        {sending ? (
          <button
            onClick={onAbort}
            className="p-1.5 rounded-lg transition-colors cursor-pointer self-end mb-0.5"
            style={{ backgroundColor: 'var(--color-error)', color: 'white' }}
            title="停止生成"
            type="button"
          >
            <Square size={18} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || disabled}
            className="p-1.5 rounded-lg transition-colors cursor-pointer self-end mb-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: input.trim() ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
              color: input.trim() ? 'white' : 'var(--color-text-muted)',
            }}
            title="发送消息"
            type="button"
          >
            <Send size={18} />
          </button>
        )}
      </div>
      <div className="text-xs text-center mt-2" style={{ color: 'var(--color-text-muted)' }}>
        GClaw &middot; 基于 Claude Code SDK
      </div>
    </div>
  )
}
