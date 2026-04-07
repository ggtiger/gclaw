'use client'

import { useEffect } from 'react'
import { ToastProvider } from '@/components/ui/Toast'

export function Providers({ children }: { children: React.ReactNode }) {
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
