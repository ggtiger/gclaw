'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight, RotateCcw, Save, Loader } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface PromptItem {
  key: string
  label: string
  value: string
  isCustomized: boolean
}

interface PromptCategory {
  key: string
  label: string
  description: string
  defaultCollapsed?: boolean
  items: PromptItem[]
}

export function PromptsPanel() {
  const [categories, setCategories] = useState<PromptCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const fetchPrompts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/prompts')
      const data = await res.json()
      if (data.categories) {
        setCategories(data.categories)
        // 初始化折叠状态
        const initCollapsed: Record<string, boolean> = {}
        for (const cat of data.categories) {
          initCollapsed[cat.key] = cat.defaultCollapsed ?? false
        }
        setCollapsed(initCollapsed)
      }
    } catch {
      toast('加载提示词失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchPrompts()
  }, [fetchPrompts])

  const toggleCategory = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleEdit = (key: string, value: string) => {
    setEditedValues(prev => ({ ...prev, [key]: value }))
  }

  const handleReset = async (key: string) => {
    try {
      await fetch(`/api/settings/prompts?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
      // 清除本地编辑
      setEditedValues(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      await fetchPrompts()
      toast('已恢复默认', 'success')
    } catch {
      toast('恢复默认失败', 'error')
    }
  }

  const handleResetAll = async () => {
    try {
      await fetch('/api/settings/prompts', { method: 'DELETE' })
      setEditedValues({})
      await fetchPrompts()
      toast('已恢复全部默认', 'success')
    } catch {
      toast('恢复默认失败', 'error')
    }
  }

  const handleSave = async (categoryKey: string) => {
    const cat = categories.find(c => c.key === categoryKey)
    if (!cat) return

    const updates: Record<string, string> = {}
    for (const item of cat.items) {
      if (item.key in editedValues) {
        updates[item.key] = editedValues[item.key]
      }
    }

    if (Object.keys(updates).length === 0) {
      toast('没有修改需要保存', 'error')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/settings/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: updates }),
      })
      if (!res.ok) {
        toast('保存失败', 'error')
        return
      }
      // 清除已保存的编辑
      setEditedValues(prev => {
        const next = { ...prev }
        for (const key of Object.keys(updates)) {
          delete next[key]
        }
        return next
      })
      await fetchPrompts()
      toast('提示词已保存', 'success')
    } catch {
      toast('保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-lg animate-pulse bg-gray-200 dark:bg-white/10" />
        ))}
      </div>
    )
  }

  const hasAnyEdits = Object.keys(editedValues).length > 0

  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          管理所有系统提示词模板，修改后即时生效
        </p>
        <button
          onClick={handleResetAll}
          disabled={hasAnyEdits}
          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <RotateCcw size={12} />
          全部恢复默认
        </button>
      </div>

      {categories.map(cat => {
        const isCollapsed = collapsed[cat.key] ?? false
        const catHasEdits = cat.items.some(item => item.key in editedValues)

        return (
          <div key={cat.key} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            {/* 分类标题 */}
            <button
              onClick={() => toggleCategory(cat.key)}
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-white/5 cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
                {cat.label}
              </span>
              <span className="text-xs text-gray-400">({cat.items.length})</span>
              {catHasEdits && (
                <span className="ml-auto text-xs text-purple-500">有未保存修改</span>
              )}
            </button>

            {/* 分类内容 */}
            {!isCollapsed && (
              <div className="p-3 flex flex-col gap-3">
                {cat.description && (
                  <p className="text-xs text-gray-400">{cat.description}</p>
                )}
                {cat.items.map(item => {
                  const currentValue = item.key in editedValues
                    ? editedValues[item.key]
                    : item.value

                  return (
                    <div key={item.key} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                          {item.label}
                        </label>
                        {item.isCustomized && !(item.key in editedValues) && (
                          <span className="text-xs text-purple-500">已自定义</span>
                        )}
                        <button
                          onClick={() => handleReset(item.key)}
                          title="恢复默认"
                          className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                        >
                          <RotateCcw size={11} />
                          恢复默认
                        </button>
                      </div>
                      <textarea
                        value={currentValue}
                        onChange={e => handleEdit(item.key, e.target.value)}
                        rows={Math.max(8, Math.min(20, currentValue.split('\n').length + 2))}
                        className="w-full text-xs bg-gray-50 dark:bg-white/5 rounded-lg px-3 py-2 outline-none border border-gray-200 dark:border-gray-700 focus:border-purple-400 dark:focus:border-purple-500 resize-y font-mono leading-relaxed"
                      />
                    </div>
                  )
                })}
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => handleSave(cat.key)}
                    disabled={!catHasEdits || saving}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
                    {saving ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
