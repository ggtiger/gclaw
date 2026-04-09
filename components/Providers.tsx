'use client'

import { useEffect } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import { applyThemeColor, resetThemeColor } from '@/lib/theme-color'

export function Providers({ children }: { children: React.ReactNode }) {
  // 全局主题初始化：从 localStorage 读取并应用 dark 类
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gclaw-theme') as 'light' | 'dark' | 'system' | null
      const theme = saved || 'system'
      const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      if (isDark) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    } catch {}

    // 应用自定义主题颜色
    try {
      const customColor = localStorage.getItem('gclaw-theme-color')
      if (customColor && /^#[0-9a-fA-F]{6}$/.test(customColor)) {
        applyThemeColor(customColor)
      }
    } catch {}

    // 监听系统主题变化（system 模式下自动切换）
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      try {
        const saved = localStorage.getItem('gclaw-theme') as 'light' | 'dark' | 'system' | null
        if (saved === 'system' || !saved) {
          if (mq.matches) {
            document.documentElement.classList.add('dark')
          } else {
            document.documentElement.classList.remove('dark')
          }
        }
      } catch {}
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // 页面渲染完成后通知 Tauri 关闭 splash 并显示主窗口
  useEffect(() => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string) => Promise<unknown> } })
        .__TAURI_INTERNALS__.invoke('app_ready').catch(() => {})
    }
  }, [])

  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  )
}
