'use client'

import { useState, useEffect, memo } from 'react'
import { Play, X, Terminal, FolderOpen } from 'lucide-react'
import type { CommandDefinition, CommandParameter } from '@/types/commands'
import { isTauri, selectDirectory } from '@/lib/tauri'

interface CommandParamsDialogProps {
  command: CommandDefinition
  open: boolean
  onClose: () => void
  onSubmit: (commandId: string, params: Record<string, unknown>, cwd?: string) => void
  defaultCwd?: string
  prefillParams?: Record<string, unknown>
}

function renderField(
  param: CommandParameter,
  value: unknown,
  onChange: (val: unknown) => void,
) {
  const baseInputClass =
    'w-full text-sm px-3 py-2 rounded-md border outline-none transition-colors focus:ring-1'
  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text)',
    '--tw-ring-color': 'var(--color-primary, #7c3aed)',
  } as React.CSSProperties

  switch (param.type) {
    case 'boolean':
      return (
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!value}
            onChange={e => onChange(e.target.checked)}
            className="w-4 h-4 rounded accent-[var(--color-primary)]"
          />
          <span className="text-sm" style={{ color: 'var(--color-text)' }}>
            {param.description || param.name}
          </span>
        </label>
      )

    case 'enum':
      return (
        <select
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          className={baseInputClass}
          style={inputStyle}
        >
          <option value="" disabled>
            {param.placeholder || '请选择...'}
          </option>
          {(param.values || []).map(v => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      )

    case 'number':
      return (
        <input
          type="number"
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={e =>
            onChange(e.target.value === '' ? undefined : Number(e.target.value))
          }
          placeholder={param.placeholder || param.description}
          className={baseInputClass}
          style={inputStyle}
        />
      )

    case 'file':
    case 'string':
    default:
      return (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={param.placeholder || param.description}
          className={baseInputClass}
          style={inputStyle}
        />
      )
  }
}

export const CommandParamsDialog = memo(function CommandParamsDialog({
  command,
  open,
  onClose,
  onSubmit,
  defaultCwd = '',
  prefillParams,
}: CommandParamsDialogProps) {
  const [params, setParams] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [cwd, setCwd] = useState(defaultCwd)
  const [showBrowse, setShowBrowse] = useState(false)

  useEffect(() => {
    setShowBrowse(isTauri())
  }, [])

  // 初始化默认值
  useEffect(() => {
    if (!open || !command.parameters) return
    const defaults: Record<string, unknown> = {}
    for (const p of command.parameters) {
      if (p.default !== undefined) {
        defaults[p.name] = p.default
      }
    }
    // 合并预填参数（优先级高于 default）
    setParams({ ...defaults, ...(prefillParams || {}) })
    setErrors({})
    setCwd(defaultCwd)
  }, [open, command.id, command.parameters, defaultCwd, prefillParams])

  if (!open || !command.parameters || command.parameters.length === 0) return null

  const handleChange = (name: string, value: unknown) => {
    setParams(prev => ({ ...prev, [name]: value }))
    // 清除该字段的错误
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    for (const p of command.parameters!) {
      if (p.required) {
        const v = params[p.name]
        if (v === undefined || v === null || v === '') {
          newErrors[p.name] = '此字段为必填项'
        }
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    onSubmit(command.id, params, cwd || undefined)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] animate-fade-in"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border shadow-2xl overflow-hidden animate-fade-in-up"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-3 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <Terminal size={16} style={{ color: 'var(--color-primary, #7c3aed)' }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
              {command.name}
            </div>
            <div className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
              {command.description}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-bg-secondary)] transition-colors cursor-pointer"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* 工作目录 */}
        <div
          className="px-4 py-2.5 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <label
            className="flex items-center gap-1.5 text-xs font-medium mb-1.5"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <FolderOpen size={13} />
            工作目录
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={cwd}
              onChange={e => setCwd(e.target.value)}
              placeholder="输入工作目录路径..."
              className="flex-1 text-sm px-3 py-2 rounded-md border outline-none transition-colors focus:ring-1 font-mono"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
                '--tw-ring-color': 'var(--color-primary, #7c3aed)',
              } as React.CSSProperties}
            />
            {showBrowse && (
              <button
                type="button"
                onClick={async () => {
                  const dir = await selectDirectory(cwd || defaultCwd || undefined)
                  if (dir) setCwd(dir)
                }}
                title="选择文件夹"
                className="shrink-0 p-2 rounded-md border transition-colors hover:bg-[var(--color-bg-secondary)] cursor-pointer"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-muted)',
                }}
              >
                <FolderOpen size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="px-4 py-3 space-y-3 max-h-[50vh] overflow-y-auto">
          {command.parameters.map(param => (
            <div key={param.name}>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--color-text)' }}
              >
                {param.name}
                {param.required && (
                  <span className="ml-0.5 text-red-500">*</span>
                )}
              </label>
              {param.type !== 'boolean' && param.description && (
                <div
                  className="text-[11px] mb-1.5"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {param.description}
                </div>
              )}
              {renderField(param, params[param.name], v =>
                handleChange(param.name, v),
              )}
              {errors[param.name] && (
                <div className="text-[11px] mt-0.5 text-red-500">
                  {errors[param.name]}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3 border-t"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer"
            style={{ color: 'var(--color-text-muted)' }}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer"
            style={{
              backgroundColor: 'var(--color-primary, #7c3aed)',
              color: '#fff',
            }}
          >
            <Play size={12} />
            执行
          </button>
        </div>
      </div>
    </div>
  )
})
