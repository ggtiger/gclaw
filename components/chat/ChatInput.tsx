'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Square, Paperclip, Zap, Bot, X, Image as ImageIcon, FileText } from 'lucide-react'
import { TemplateSelector } from './TemplateSelector'
import type { ChatAttachment } from '@/types/chat'

interface Template {
  id: string
  name: string
  description: string
  systemPrompt: string
  firstMessage: string
  isBuiltIn: boolean
}

interface ChatInputProps {
  onSend: (message: string, attachments?: ChatAttachment[]) => void
  onAbort: () => void
  sending: boolean
  disabled?: boolean
  projectId?: string
  onTemplateSelect?: (template: Template) => void
  onOpenSkills?: () => void
  onOpenAgents?: () => void
}

export function ChatInput({ onSend, onAbort, sending, disabled, projectId, onTemplateSelect, onOpenSkills, onOpenAgents }: ChatInputProps) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)

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

  const uploadFile = useCallback(async (file: File): Promise<ChatAttachment | null> => {
    if (!projectId) return null
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('projectId', projectId)
      const res = await fetch('/api/chat/attachments', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json()
        console.error('上传失败:', err.error)
        return null
      }
      return await res.json()
    } catch (err) {
      console.error('上传失败:', err)
      return null
    }
  }, [projectId])

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    setUploading(true)
    const results = await Promise.all(fileArray.map(f => uploadFile(f)))
    setUploading(false)

    const newAttachments = results.filter((a): a is ChatAttachment => a !== null)
    if (newAttachments.length > 0) {
      setAttachments(prev => [...prev, ...newAttachments])
    }
  }, [uploadFile])

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  const handleSubmit = useCallback(() => {
    const hasInput = input.trim()
    const hasAttachments = attachments.length > 0
    if ((!hasInput && !hasAttachments) || sending || disabled || uploading) return

    onSend(hasInput ? input : (hasAttachments ? '(附件)' : ''), attachments)
    setInput('')
    setAttachments([])
    // 重置高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input, attachments, sending, disabled, uploading, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    requestAnimationFrame(() => {
      isComposingRef.current = false
    })
  }, [])

  // 粘贴图片
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    const imageFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      handleFiles(imageFiles)
    }
  }, [handleFiles])

  const canSend = (input.trim() || attachments.length > 0) && !disabled && !uploading

  return (
    <div className="px-4 py-3">
      {/* 模板选择器 */}
      {onTemplateSelect && (
        <div className="mb-2">
          <TemplateSelector projectId={projectId || ''} onSelect={onTemplateSelect} />
        </div>
      )}
      <div className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.25)] border border-white/50 dark:border-white/10 p-2 flex flex-col gap-2">
        {/* 附件预览区域 */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-2 pt-1">
            {attachments.map(att => (
              <div
                key={att.id}
                className="relative group/att flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/60 dark:bg-slate-700/60 border border-gray-200/60 dark:border-white/10 max-w-[200px]"
              >
                {att.type === 'image' ? (
                  <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-slate-600">
                    <img src={att.url} alt={att.filename} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 bg-purple-100 dark:bg-purple-500/20">
                    {att.type === 'code' || att.type === 'document' ? (
                      <FileText size={14} className="text-purple-600 dark:text-purple-400" />
                    ) : (
                      <FileText size={14} className="text-slate-500" />
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs truncate text-[var(--color-text)]">{att.filename}</div>
                  <div className="text-[10px] text-[var(--color-text-secondary)]">
                    {(att.size / 1024).toFixed(att.size > 1024 * 1024 ? 1 : 0)}
                    {att.size > 1024 * 1024 ? ' MB' : ' KB'}
                  </div>
                </div>
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity"
                  type="button"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onPaste={handlePaste}
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
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={18} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => {
                if (e.target.files) handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <button
              className="p-2 text-[var(--color-text-secondary)] hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-colors"
              title="技能管理"
              type="button"
              onClick={onOpenSkills}
            >
              <Zap size={18} />
            </button>
            <button
              className="p-2 text-[var(--color-text-secondary)] hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-colors"
              title="智能体管理"
              type="button"
              onClick={onOpenAgents}
            >
              <Bot size={18} />
            </button>
            <div className="h-4 w-px bg-[var(--color-border)] mx-1" />
            {uploading && (
              <span className="text-xs text-purple-500 animate-pulse">上传中...</span>
            )}
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
              disabled={!canSend}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shadow-sm ${canSend ? 'bg-purple-600 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 opacity-50 cursor-not-allowed'}`}
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
