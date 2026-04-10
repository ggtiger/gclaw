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

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast('不支持的文件类型，仅支持 JPG、PNG、WebP', 'error')
      return
    }

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
      if (bgFileInputRef.current) {
        bgFileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* 主题切换 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          主题
        </label>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                theme === t
                  ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400'
                  : 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400'
              }`}
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
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1.5">
          <ImageIcon size={13} />
          自定义背景
        </label>

        {/* 预览区域 */}
        {backgroundImage ? (
          <div className="relative rounded-lg overflow-hidden h-20 border border-gray-200 dark:border-gray-600">
            <img src={backgroundImage} alt="背景预览" className="w-full h-full object-cover" />
            <button
              onClick={() => onBackgroundChange?.('')}
              className="absolute top-1.5 right-1.5 p-1 rounded-full cursor-pointer transition-all bg-black/50 hover:bg-black/70 text-white"
              title="移除背景"
            >
              <XIcon size={12} />
            </button>
          </div>
        ) : (
          <div className="h-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-white/5 flex items-center justify-center">
            <span className="text-xs text-gray-400">暂无背景</span>
          </div>
        )}

        {/* 上传按钮 */}
        <button
          onClick={() => !uploadingBg && bgFileInputRef.current?.click()}
          disabled={uploadingBg}
          className="w-full mt-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 p-3 text-center cursor-pointer transition-colors disabled:opacity-50"
        >
          {uploadingBg ? (
            <div className="flex items-center justify-center gap-2">
              <Loader size={16} className="animate-spin text-purple-600" />
              <span className="text-xs text-gray-400">上传中...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <Upload size={16} className="text-purple-600" />
              <span className="text-xs text-gray-600 dark:text-gray-300">上传背景图</span>
            </div>
          )}
        </button>

        <input
          ref={bgFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleBackgroundUpload}
          disabled={uploadingBg}
        />

        {/* URL 输入 */}
        <div className="mt-2">
          <input
            type="text"
            value={backgroundImage || ''}
            onChange={e => onBackgroundChange?.(e.target.value)}
            placeholder="或输入图片 URL"
            className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
          />
        </div>
      </div>

      {/* 主题颜色 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1.5">
          <Palette size={13} />
          主题颜色
        </label>
        <div className="flex items-center gap-2 flex-wrap">
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
                borderColor: themeColor === c.hex ? 'white' : 'transparent',
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
              className="w-7 h-7 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
              title="自定义颜色"
            >
              <span className="text-xs text-gray-400">+</span>
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
            className="text-xs mt-2 cursor-pointer hover:underline text-gray-400"
          >
            恢复默认
          </button>
        )}
      </div>
    </div>
  )
}