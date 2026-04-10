'use client'

import { useState, useRef } from 'react'
import { Sun, Moon, Monitor, Image as ImageIcon, X as XIcon, Upload, Loader, Palette } from 'lucide-react'
import { applyThemeColor as applyThemeColorGlobal, resetThemeColor as resetThemeColorGlobal } from '@/lib/theme-color'
import { useToast } from '@/components/ui/Toast'

interface PreferencesPanelProps {
  backgroundImage?: string
  onBackgroundChange?: (url: string) => void
}

export function PreferencesPanel({ backgroundImage, onBackgroundChange }: PreferencesPanelProps) {
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>(() => {
    if (typeof window === 'undefined') return 'system'
    try {
      return (localStorage.getItem('gclaw-theme') as 'light' | 'dark' | 'system') || 'system'
    } catch {
      return 'system'
    }
  })
  const [uploadingBg, setUploadingBg] = useState(false)
  const bgFileInputRef = useRef<HTMLInputElement>(null)
  const [themeColor, setThemeColor] = useState<string>(() => {
    try {
      return localStorage.getItem('gclaw-theme-color') || ''
    } catch {
      return ''
    }
  })

  const { toast } = useToast()

  const setTheme = (newTheme: 'light' | 'dark' | 'system') => {
    setThemeState(newTheme)
    localStorage.setItem('gclaw-theme', newTheme)
    // 应用主题
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    if (newTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.add(prefersDark ? 'dark' : 'light')
    } else {
      root.classList.add(newTheme)
    }
  }

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast('不支持的文件类型，仅支持 JPG、PNG、WebP', 'error')
      return
    }

    // 验证文件大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast('文件大小超过限制（最大 10MB）', 'error')
      return
    }

    setUploadingBg(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/uploads/background', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.success && data.url) {
        onBackgroundChange?.(data.url)
        toast('背景图上传成功', 'success')
      } else {
        toast(data.error || '上传失败', 'error')
      }
    } catch (err) {
      console.error('上传背景图失败:', err)
      toast('上传失败', 'error')
    } finally {
      setUploadingBg(false)
      // 清空 input 以便可以重复选择同一文件
      if (bgFileInputRef.current) {
        bgFileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* 主题切换 */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          主题
        </label>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors cursor-pointer"
              style={{
                borderColor: theme === t ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: theme === t ? 'var(--color-primary-10)' : 'var(--color-bg)',
                color: theme === t ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              }}
            >
              {t === 'light' && <Sun size={14} />}
              {t === 'dark' && <Moon size={14} />}
              {t === 'system' && <Monitor size={14} />}
              {{ light: '浅色', dark: '深色', system: '跟随系统' }[t]}
            </button>
          ))}
        </div>
      </div>

      {/* 背景图片 */}
      <div className="p-4 rounded-lg bg-white/10 dark:bg-slate-800/20 backdrop-blur-md border border-white/20 space-y-3">
        <label className="block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          <div className="flex items-center gap-1.5">
            <ImageIcon size={13} />
            自定义背景
          </div>
        </label>

        {/* 预览区域 */}
        {backgroundImage ? (
          <div className="relative rounded-xl overflow-hidden h-24 border border-white/20">
            <img
              src={backgroundImage}
              alt="背景预览"
              className="w-full h-full object-cover"
            />
            <button
              onClick={() => onBackgroundChange?.('')}
              className="absolute top-2 right-2 p-1.5 rounded-full cursor-pointer transition-all duration-200 hover:bg-black/70"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'white' }}
              title="移除背景"
            >
              <XIcon size={14} />
            </button>
          </div>
        ) : (
          <div className="h-24 rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>暂无背景</span>
          </div>
        )}

        {/* 上传按钮 */}
        <button
          onClick={() => !uploadingBg && bgFileInputRef.current?.click()}
          disabled={uploadingBg}
          className="w-full rounded-xl border-2 border-dashed border-white/20 hover:border-purple-400/50 p-4 text-center cursor-pointer transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        >
          {uploadingBg ? (
            <div className="flex flex-col items-center gap-2">
              <Loader size={20} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>上传中...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Upload size={20} style={{ color: 'var(--color-primary)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>点击上传背景图</span>
              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>JPG / PNG / WebP，最大 10MB</span>
            </div>
          )}
        </button>

        {/* 隐藏的文件输入 */}
        <input
          ref={bgFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleBackgroundUpload}
          disabled={uploadingBg}
        />

        {/* 分隔线 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>或输入 URL</span>
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }} />
        </div>

        {/* URL 输入 */}
        <input
          type="text"
          value={backgroundImage || ''}
          onChange={e => onBackgroundChange?.(e.target.value)}
          placeholder="输入图片 URL"
          className="w-full px-3 py-2 rounded-xl border text-sm outline-none transition-all duration-200 focus:border-purple-400/50"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />

        <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          支持 JPG、PNG、WebP 格式图片
        </div>
      </div>

      {/* 主题颜色 */}
      <div className="p-4 rounded-lg border space-y-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
        <div className="flex items-center gap-1.5">
          <Palette size={13} style={{ color: 'var(--color-text-secondary)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>主题颜色</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* 预设颜色 */}
          {[
            { label: '紫罗兰', hex: '#8b5cf6' },
            { label: '蓝色', hex: '#3b82f6' },
            { label: '青色', hex: '#14b8a6' },
            { label: '玫红', hex: '#ec4899' },
            { label: '红色', hex: '#ef4444' },
            { label: '橙色', hex: '#f97316' },
            { label: '绿色', hex: '#22c55e' },
          ].map(c => (
            <button
              key={c.hex}
              onClick={() => {
                setThemeColor(c.hex)
                localStorage.setItem('gclaw-theme-color', c.hex)
                applyThemeColorGlobal(c.hex)
              }}
              className="w-7 h-7 rounded-full border-2 transition-all cursor-pointer hover:scale-110"
              style={{
                backgroundColor: c.hex,
                borderColor: themeColor === c.hex ? 'var(--color-text)' : 'transparent',
                boxShadow: themeColor === c.hex ? `0 0 0 2px ${c.hex}40` : 'none',
              }}
              title={c.label}
            />
          ))}
          {/* 自定义颜色 */}
          <div className="relative">
            <input
              type="color"
              value={themeColor || '#8b5cf6'}
              onChange={e => {
                const hex = e.target.value
                setThemeColor(hex)
                localStorage.setItem('gclaw-theme-color', hex)
                applyThemeColorGlobal(hex)
              }}
              className="absolute inset-0 w-7 h-7 opacity-0 cursor-pointer"
            />
            <div
              className="w-7 h-7 rounded-full border-2 border-dashed flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
              style={{ borderColor: 'var(--color-border)' }}
              title="自定义颜色"
            >
              <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>+</span>
            </div>
          </div>
        </div>
        {/* 重置按钮 */}
        {themeColor && themeColor !== '#8b5cf6' && (
          <button
            onClick={() => {
              setThemeColor('')
              localStorage.removeItem('gclaw-theme-color')
              resetThemeColorGlobal()
            }}
            className="text-[11px] cursor-pointer hover:underline"
            style={{ color: 'var(--color-text-muted)' }}
          >
            恢复默认
          </button>
        )}
      </div>
    </div>
  )
}