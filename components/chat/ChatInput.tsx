'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Send, Square, Paperclip, Zap, Bot, X, FileText, Sparkles, Crown, FolderOpen, Clock, ChevronDown, Check, Terminal } from 'lucide-react'
import { TemplateSelector } from './TemplateSelector'
import { SchedulePicker } from './SchedulePicker'
import { ContextRing } from './SessionInfoPopover'
import type { ChatAttachment } from '@/types/chat'
import type { AgentInfo } from '@/types/skills'
import type { CommandDefinition } from '@/types/commands'
import { useSettingsStore } from '@/lib/store/useSettingsStore'
import { CommandParamsDialog } from './CommandParamsDialog'

/** 模型 ID → 短名称（按钮显示） */
function shortModelName(id: string): string {
  if (!id) return ''
  const m = id.match(/^claude-(sonnet|opus|haiku)-(\d+(?:-\d+)*)/)
  if (m) return m[1][0].toUpperCase() + m[1].slice(1) + ' ' + m[2].replace(/-/g, '.')
  if (id.toLowerCase().startsWith('deepseek')) return 'DeepSeek'
  return id.length > 16 ? id.slice(0, 14) + '..' : id
}

interface Template {
  id: string
  name: string
  description: string
  systemPrompt: string
  firstMessage: string
  isBuiltIn: boolean
}

// @-mention 候选项（Agent 或 子项目）
interface MentionItem {
  type: 'agent' | 'project'
  name: string
  description: string
  isCoordinator?: boolean
  coordinator?: string
  memberNames?: string[]
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
  onScheduleSend?: (message: string, schedule: { mode: 'once' | 'interval'; runAt?: string; intervalMs?: number; label: string }) => void
  onOpenSchedules?: () => void
  onOpenSettings?: () => void
  contextUsage?: number
  contextInputTokens?: number
  contextMaxTokens?: number
  onCompact?: () => void
  onClearChat?: () => void
  onSendCommand?: (commandId: string, params?: Record<string, unknown>, cwd?: string) => void
}

export function ChatInput({ onSend, onAbort, sending, disabled, projectId, onTemplateSelect, onOpenSkills, onOpenAgents, onScheduleSend, onOpenSchedules, onOpenSettings, contextUsage, contextInputTokens, contextMaxTokens, onCompact, onClearChat, onSendCommand }: ChatInputProps) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [showSchedulePicker, setShowSchedulePicker] = useState(false)
  // ── 模型选择器：从 store 响应式读取当前模型 + 供应商 ──
  const projectSettings = useSettingsStore(state => state.projectSettings)
  const effectiveCwd = useSettingsStore(state => state.effectiveCwd)
  const globalSettings = useSettingsStore(state => state.globalSettings)
  const storeModel = projectSettings?.model || globalSettings?.defaultModel || ''
  const storeProviderId = projectSettings?.providerId || globalSettings?.activeProviderId || ''

  const [currentModel, setCurrentModel] = useState('')
  const [modelList, setModelList] = useState<{ id: string; name: string }[]>([])
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)

  // ── @-mention 自动完成 ──
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([])
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState(-1)
  const [mentionIndex, setMentionIndex] = useState(0)

  // ── /slash 命令自动完成 ──
  const [slashCommands, setSlashCommands] = useState<CommandDefinition[]>([])
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashParamsDialog, setSlashParamsDialog] = useState<{ open: boolean; command: CommandDefinition | null }>({ open: false, command: null })

  // 加载自定义命令列表
  useEffect(() => {
    if (!projectId) return
    fetch(`/api/commands?projectId=${encodeURIComponent(projectId)}`)
      .then(r => r.json())
      .then(data => setSlashCommands(data.commands || []))
      .catch(() => {})
  }, [projectId])

  // 加载 agents + 子项目列表（一次性 API）
  useEffect(() => {
    if (!projectId) return
    fetch(`/api/agents?projectId=${projectId}`)
      .then(r => r.json())
      .then(data => {
        const agents: AgentInfo[] = data.agents || []
        const items: MentionItem[] = agents
          .filter(a => a.enabled)
          .map(a => ({
            type: 'agent' as const,
            name: a.name,
            description: a.description,
            isCoordinator: a.isCoordinator,
          }))

        // 秘书项目：添加子项目
        if (data.subProjects) {
          for (const sp of data.subProjects) {
            items.push({
              type: 'project',
              name: sp.name,
              description: sp.coordinator
                ? `协调人: ${sp.coordinator}`
                : (sp.memberNames?.length ? `成员: ${sp.memberNames.join('、')}` : '暂无智能体'),
              coordinator: sp.coordinator,
              memberNames: sp.memberNames,
            })
          }
        }

        setMentionItems(items)
      })
      .catch(() => {})
  }, [projectId])

  // ── 模型选择器：从 store 同步当前模型，切换供应商时清空缓存 ──
  useEffect(() => {
    setCurrentModel(storeModel)
  }, [storeModel])

  useEffect(() => {
    setModelList([]) // 供应商变更时清空缓存，重新拉取
  }, [storeProviderId])

  const handleToggleModelPicker = useCallback(async () => {
    if (showModelPicker) { setShowModelPicker(false); return }
    setShowModelPicker(true)
    if (modelList.length > 0) return
    setLoadingModels(true)
    try {
      const body: Record<string, string> = {}
      if (storeProviderId) body.providerId = storeProviderId
      const res = await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.models) setModelList(data.models)
    } catch {} finally { setLoadingModels(false) }
  }, [showModelPicker, modelList.length, storeProviderId])

  const handleSelectModel = useCallback(async (modelId: string) => {
    setCurrentModel(modelId)
    setShowModelPicker(false)
    // 直接更新正式状态（对话框选模型是立即生效的）
    const state = useSettingsStore.getState()
    if (state.projectSettings) {
      useSettingsStore.setState({
        projectSettings: { ...state.projectSettings, model: modelId },
        draftProject: state.draftProject ? { ...state.draftProject, model: modelId } : state.draftProject,
      })
    }
    // 持久化到后端
    if (projectId) {
      fetch(`/api/settings?projectId=${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
      }).catch(() => {})
    }
  }, [projectId])

  // 过滤匹配的 mention items
  const filteredItems = useMemo(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    return mentionItems.filter(item =>
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    )
  }, [mentionQuery, mentionItems])

  // 过滤匹配的 slash commands
  const filteredSlashCommands = useMemo(() => {
    if (slashQuery === null) return []
    const q = slashQuery.toLowerCase()
    if (!q) return slashCommands.filter(c => c.enabled)
    return slashCommands
      .filter(c => c.enabled)
      .filter(cmd =>
        cmd.id.toLowerCase().includes(q) ||
        cmd.name.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        (cmd.category || '').toLowerCase().includes(q)
      )
  }, [slashQuery, slashCommands])

  // 选择 mention item
  const selectMention = useCallback((item: MentionItem) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const cursorPos = textarea.selectionStart
    const before = input.slice(0, mentionStart)
    const after = input.slice(cursorPos)
    const newText = `${before}@${item.name} ${after}`
    setInput(newText)
    setMentionQuery(null)

    requestAnimationFrame(() => {
      const pos = before.length + item.name.length + 2
      textarea.setSelectionRange(pos, pos)
      textarea.focus()
    })
  }, [input, mentionStart])

  // 选择 slash command
  const selectSlashCommand = useCallback((cmd: CommandDefinition) => {
    setInput('')
    setSlashQuery(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    if (cmd.parameters && cmd.parameters.length > 0) {
      setSlashParamsDialog({ open: true, command: cmd })
    } else {
      onSendCommand?.(cmd.id)
    }
  }, [onSendCommand])

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
    setMentionQuery(null)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input, attachments, sending, disabled, uploading, onSend])

  // 处理输入变化 + 检测 @-mention
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart
    setInput(value)

    const textBeforeCursor = value.slice(0, cursorPos)
    const atMatch = textBeforeCursor.match(/@([^@\s]*)$/)
    if (atMatch) {
      const atPos = cursorPos - atMatch[0].length
      if (atPos === 0 || textBeforeCursor[atPos - 1] === ' ' || textBeforeCursor[atPos - 1] === '\n') {
        setMentionQuery(atMatch[1])
        setMentionStart(atPos)
        setMentionIndex(0)
        setSlashQuery(null)
        return
      }
    }
    setMentionQuery(null)

    // 检测 /slash 命令
    const slashMatch = value.match(/^\/([^\s]*)$/)
    if (slashMatch) {
      setSlashQuery(slashMatch[1])
      setSlashIndex(0)
      return
    }
    setSlashQuery(null)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // /slash 命令键盘导航
      if (slashQuery !== null && filteredSlashCommands.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSlashIndex(i => (i + 1) % filteredSlashCommands.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSlashIndex(i => (i - 1 + filteredSlashCommands.length) % filteredSlashCommands.length)
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          selectSlashCommand(filteredSlashCommands[slashIndex])
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setSlashQuery(null)
          return
        }
      }

      if (mentionQuery !== null && filteredItems.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setMentionIndex(i => (i + 1) % filteredItems.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setMentionIndex(i => (i - 1 + filteredItems.length) % filteredItems.length)
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          selectMention(filteredItems[mentionIndex])
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setMentionQuery(null)
          return
        }
      }

      if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [mentionQuery, filteredItems, mentionIndex, selectMention, handleSubmit, slashQuery, filteredSlashCommands, slashIndex, selectSlashCommand]
  )

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    requestAnimationFrame(() => {
      isComposingRef.current = false
    })
  }, [])

  // AI 优化提示词
  const handleOptimize = useCallback(async () => {
    if (!input.trim() || optimizing) return
    setOptimizing(true)
    try {
      const res = await fetch('/api/chat/optimize-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input }),
      })
      const data = await res.json()
      if (data.optimized) {
        setInput(data.optimized)
      }
    } catch {
      // 静默失败，保持原输入
    } finally {
      setOptimizing(false)
    }
  }, [input, optimizing])

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

  // 统计子项目数量，用于 placeholder
  const projectCount = mentionItems.filter(i => i.type === 'project').length

  return (
    <div className="chat-input px-2 py-2">

      <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-md rounded-lg border border-gray-200/50 dark:border-white/10 p-2 flex flex-col gap-2 shadow-sm relative">
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
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onPaste={handlePaste}
          placeholder={projectCount > 0
            ? `@项目名 或 @智能体 发送任务... (Enter 发送)`
            : `输入消息... (Enter 发送, Shift+Enter 换行, @ 提及智能体)`}
          rows={1}
          disabled={disabled}
          className="w-full resize-none border-none bg-transparent focus:ring-0 focus:outline-none p-3 text-sm text-[var(--color-text)] placeholder-[var(--color-text-secondary)]/70 min-h-[56px] max-h-32"
        />

        {/* @-mention 下拉候选列表 */}
        {mentionQuery !== null && filteredItems.length > 0 && (
          <div className="absolute left-3 right-3 bottom-full mb-1 z-50 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-lg border border-gray-200/60 dark:border-white/10 shadow-lg max-h-56 overflow-y-auto">
            <div className="px-2 py-1.5 text-[10px] text-[var(--color-text-secondary)] border-b border-gray-100 dark:border-white/5 sticky top-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md">
              {projectCount > 0
                ? '选择项目或智能体 (↑↓ 切换, Enter 确认, Esc 关闭)'
                : '选择智能体 (↑↓ 切换, Enter 确认, Esc 关闭)'}
            </div>
            {filteredItems.map((item, idx) => (
              <button
                key={`${item.type}-${item.name}`}
                type="button"
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  idx === mentionIndex
                    ? 'bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300'
                    : 'text-[var(--color-text)] hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
                onClick={() => selectMention(item)}
                onMouseEnter={() => setMentionIndex(idx)}
              >
                {item.type === 'project' ? (
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <FolderOpen size={14} className="text-blue-500" />
                  </span>
                ) : (
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <Bot size={14} className="text-purple-500" />
                    {item.isCoordinator && <Crown size={12} className="text-amber-500" />}
                  </span>
                )}
                <span className="font-medium">{item.name}</span>
                {item.type === 'project' && item.coordinator && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex-shrink-0">
                    {item.coordinator}
                  </span>
                )}
                <span className="text-[var(--color-text-secondary)] text-xs truncate flex-1">
                  {item.description}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* /slash 命令下拉候选列表 */}
        {slashQuery !== null && filteredSlashCommands.length > 0 && (
          <div className="absolute left-3 right-3 bottom-full mb-1 z-50 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-lg border border-gray-200/60 dark:border-white/10 shadow-lg max-h-56 overflow-y-auto">
            <div className="px-2 py-1.5 text-[10px] text-[var(--color-text-secondary)] border-b border-gray-100 dark:border-white/5 sticky top-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md">
              选择命令 (↑↓ 切换, Enter 确认, Esc 关闭)
            </div>
            {filteredSlashCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                type="button"
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  idx === slashIndex
                    ? 'bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300'
                    : 'text-[var(--color-text)] hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
                onClick={() => selectSlashCommand(cmd)}
                onMouseEnter={() => setSlashIndex(idx)}
              >
                <span className="flex items-center justify-center w-6 h-6 rounded-md bg-purple-100 dark:bg-purple-500/20 flex-shrink-0">
                  <Terminal size={13} className="text-purple-600 dark:text-purple-400" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">/{cmd.id}</span>
                    {cmd.category && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                        {cmd.category}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--color-text-secondary)] truncate">{cmd.description}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 定时发送选择器 */}
        {showSchedulePicker && (
          <SchedulePicker
            onSelect={(schedule) => {
              setShowSchedulePicker(false)
              if (onScheduleSend && input.trim()) {
                onScheduleSend(input.trim(), schedule)
                setInput('')
                if (textareaRef.current) textareaRef.current.style.height = 'auto'
              }
            }}
            onClose={() => setShowSchedulePicker(false)}
            onOpenSchedules={onOpenSchedules}
          />
        )}

        <div className="flex justify-between items-center px-1 pb-1">
          {/* 左侧功能按钮组 */}
          <div className="flex items-center gap-0.5 flex-nowrap overflow-x-auto">
            <button
              className="flex items-center gap-1 px-2 py-1.5 text-[var(--color-text-secondary)] hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-colors text-xs"
              title="附加文件"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={15} />
              <span className="hidden sm:inline whitespace-nowrap">附件</span>
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
              className="flex items-center gap-1 px-2 py-1.5 text-[var(--color-text-secondary)] hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-colors text-xs"
              title="技能管理"
              type="button"
              onClick={onOpenSkills}
            >
              <Zap size={15} />
              <span className="hidden sm:inline whitespace-nowrap">技能</span>
            </button>
            <button
              className="flex items-center gap-1 px-2 py-1.5 text-[var(--color-text-secondary)] hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-colors text-xs"
              title="智能体管理"
              type="button"
              onClick={onOpenAgents}
            >
              <Bot size={15} />
              <span className="hidden sm:inline whitespace-nowrap">智能体</span>
            </button>
            <div className="h-4 w-px bg-[var(--color-border)] mx-0.5" />
            <button
              className="flex items-center gap-1 px-2 py-1.5 text-[var(--color-text-secondary)] hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-colors text-xs"
              title={input.trim() ? '定时发送' : '定时任务管理'}
              type="button"
              onClick={() => {
                if (input.trim()) {
                  setShowSchedulePicker(!showSchedulePicker)
                } else {
                  onOpenSchedules?.()
                }
              }}
            >
              <Clock size={15} />
              <span className="hidden sm:inline whitespace-nowrap">定时</span>
            </button>
            <div className="h-4 w-px bg-[var(--color-border)] mx-0.5" />
            <button
              className="flex items-center gap-1 px-2 py-1.5 text-[var(--color-text-secondary)] hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-colors text-xs disabled:opacity-50"
              title="AI 优化提示词"
              type="button"
              onClick={handleOptimize}
              disabled={!input.trim() || optimizing}
            >
              <Sparkles size={15} className={optimizing ? 'animate-pulse' : ''} />
              <span className="hidden sm:inline whitespace-nowrap">{optimizing ? '优化中...' : '优化提示词'}</span>
            </button>
            {uploading && (
              <span className="text-xs text-purple-500 animate-pulse ml-1">上传中...</span>
            )}
          </div>

          {/* 模型选择器 + 发送/停止按钮 */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* 上下文圆环 */}
            {contextInputTokens != null && contextInputTokens > 0 && (
              <ContextRing
                inputTokens={contextInputTokens}
                maxContext={contextMaxTokens ?? 200000}
                contextUsage={contextUsage ?? 0}
                onCompact={onCompact}
                onClear={onClearChat}
                disabled={sending}
              />
            )}
            {projectId && (
              <div className="relative">
                <button
                  onClick={() => {
                    if (!currentModel && onOpenSettings) { onOpenSettings(); return }
                    handleToggleModelPicker()
                  }}
                  className={`flex items-center gap-1 px-2 py-1.5 text-[11px] rounded-md transition-colors max-w-[140px] ${
                    currentModel
                      ? 'bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      : 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/25'
                  }`}
                  title={currentModel || '点击设置模型'}
                  type="button"
                >
                  <span className="truncate">{currentModel ? shortModelName(currentModel) : '设置模型'}</span>
                  {currentModel && <ChevronDown size={11} className={`flex-shrink-0 transition-transform ${showModelPicker ? 'rotate-180' : ''}`} />}
                </button>
                {showModelPicker && currentModel && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowModelPicker(false)} />
                    <div className="absolute bottom-full right-0 mb-2 z-50 w-56 max-h-64 overflow-y-auto bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-lg border border-gray-200/60 dark:border-white/10 shadow-lg py-1">
                      {loadingModels ? (
                        <div className="px-3 py-4 text-center text-xs text-slate-400 animate-pulse">加载模型列表...</div>
                      ) : modelList.length === 0 ? (
                        <button
                          onClick={() => { setShowModelPicker(false); onOpenSettings?.() }}
                          className="w-full px-3 py-3 text-center text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors cursor-pointer"
                          type="button"
                        >
                          暂无可用模型，前往设置 &rarr;
                        </button>
                      ) : (
                        modelList.map(m => (
                          <button
                            key={m.id}
                            onClick={() => handleSelectModel(m.id)}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                              m.id === currentModel
                                ? 'bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300'
                                : 'text-[var(--color-text)] hover:bg-gray-50 dark:hover:bg-white/5'
                            }`}
                            type="button"
                          >
                            <Check size={12} className={m.id === currentModel ? 'text-purple-600 dark:text-purple-400 flex-shrink-0' : 'text-transparent flex-shrink-0'} />
                            <span className="truncate">{m.name || m.id}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
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

      {/* Slash 命令参数弹窗 */}
      {slashParamsDialog.open && slashParamsDialog.command && (
        <CommandParamsDialog
          command={slashParamsDialog.command}
          open={slashParamsDialog.open}
          onClose={() => setSlashParamsDialog({ open: false, command: null })}
          defaultCwd={projectSettings?.cwd || effectiveCwd || ''}
          onSubmit={(commandId, params, cwd) => {
            setSlashParamsDialog({ open: false, command: null })
            onSendCommand?.(commandId, params, cwd)
          }}
        />
      )}
    </div>
  )
}
