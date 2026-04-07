import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown, ChevronRight } from 'lucide-react'
import type { FocusSettings, FocusDataSourceType } from '@/types/focus'

// scanAvailableSkills 是服务端模块，不能在客户端直接 import
// 通过 API 获取 skills 列表

interface Props {
  projectId: string
  settings: FocusSettings
  onSave: (settings: FocusSettings) => void
  onClose: () => void
}

const typeLabels: Record<FocusDataSourceType, string> = {
  file: '文件',
  skill: 'Skill',
  api: 'API 接口',
}

const typeOptions: FocusDataSourceType[] = ['file', 'skill', 'api']

const sectionConfig = [
  { key: 'todos' as const, label: '📋 待办数据源' },
  { key: 'notes' as const, label: '📝 笔记数据源' },
  { key: 'events' as const, label: '📅 日程数据源' },
]

export function FocusSettingsModal({ projectId, settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<FocusSettings>({ ...settings })
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ todos: true })
  const [mounted, setMounted] = useState(false)
  const [availableSkills, setAvailableSkills] = useState<{ name: string; displayName: string }[]>([])

  useEffect(() => {
    setMounted(true)
    // 通过 API 获取 skills 列表（避免客户端引用 fs 模块）
    fetch(`/api/skills?projectId=${projectId}`)
      .then(res => res.json())
      .then(data => {
        if (data.skills) {
          setAvailableSkills(data.skills.map((s: { name: string; displayName: string }) => ({
            name: s.name,
            displayName: s.displayName,
          })))
        }
      })
      .catch((err) => {
        console.error('Failed to fetch skills:', err)
      })
  }, [])

  const toggleExpand = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const updateSource = (key: keyof FocusSettings, field: string, value: unknown) => {
    setDraft(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }))
  }

  const handleSave = () => {
    onSave(draft)
    onClose()
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-[400px] max-w-[90vw] max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">专注模式设置</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3">
          {sectionConfig.map(({ key, label }) => {
            const source = draft[key]
            const isOpen = expanded[key]
            return (
              <div key={key} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleExpand(key)}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
                  {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 flex flex-col gap-2">
                    {/* Enabled toggle */}
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={source.enabled}
                        onChange={e => updateSource(key, 'enabled', e.target.checked)}
                        className="rounded"
                      />
                      已启用
                    </label>

                    {/* Type selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-10 shrink-0">类型</span>
                      <select
                        value={source.type}
                        onChange={e => updateSource(key, 'type', e.target.value)}
                        className="flex-1 text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1.5 outline-none"
                      >
                        {typeOptions.map(t => (
                          <option key={t} value={t}>{typeLabels[t]}</option>
                        ))}
                      </select>
                    </div>

                    {/* File config */}
                    {source.type === 'file' && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-10 shrink-0">路径</span>
                          <input
                            value={source.filePath || ''}
                            onChange={e => updateSource(key, 'filePath', e.target.value)}
                            placeholder=".data/focus/todos.json"
                            className="flex-1 text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1.5 outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-10 shrink-0">格式</span>
                          <select
                            value={source.format || 'json'}
                            onChange={e => updateSource(key, 'format', e.target.value)}
                            className="flex-1 text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1.5 outline-none"
                          >
                            <option value="json">JSON</option>
                            <option value="markdown">Markdown</option>
                            <option value="ics">iCalendar (ICS)</option>
                          </select>
                        </div>
                      </>
                    )}

                    {/* Skill config */}
                    {source.type === 'skill' && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-10 shrink-0">技能</span>
                          <select
                            value={source.skillName || ''}
                            onChange={e => updateSource(key, 'skillName', e.target.value)}
                            className="flex-1 text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1.5 outline-none"
                          >
                            <option value="">-- 选择技能 --</option>
                            {availableSkills.map(s => (
                              <option key={s.name} value={s.name}>{s.displayName}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-10 shrink-0">参数</span>
                          <input
                            value={source.skillParams ? Object.entries(source.skillParams).map(([k, v]) => `${k}=${v}`).join(',') : ''}
                            onChange={e => {
                              const val = e.target.value.trim()
                              const params: Record<string, string> = {}
                              if (val) {
                                for (const pair of val.split(',')) {
                                  const [k, v] = pair.split('=')
                                  if (k && v) params[k.trim()] = v.trim()
                                }
                              }
                              updateSource(key, 'skillParams', params)
                            }}
                            placeholder="key1=val1,key2=val2"
                            className="flex-1 text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1.5 outline-none"
                          />
                        </div>
                      </>
                    )}

                    {/* API config */}
                    {source.type === 'api' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-10 shrink-0">URL</span>
                        <input
                          value={source.apiUrl || ''}
                          onChange={e => updateSource(key, 'apiUrl', e.target.value)}
                          placeholder="https://api.example.com/todos"
                          className="flex-1 text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-2 py-1.5 outline-none"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
