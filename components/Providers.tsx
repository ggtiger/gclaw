'use client'

import { useEffect } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import { applyThemeColor, resetThemeColor } from '@/lib/theme-color'

/**
 * 全局渠道连接：应用启动时自动连接所有项目的已启用渠道
 * 后台定期刷新，确保断线重连
 */
function useGlobalChannelConnect() {
  useEffect(() => {
    let cancelled = false

    const connectAll = async () => {
      try {
        // 1. 获取所有项目
        const pr = await fetch('/api/projects')
        const pd = await pr.json()
        const projects: { id: string }[] = pd.projects || []
        if (cancelled || projects.length === 0) return

        // 2. 遍历每个项目的渠道，连接未连接的
        for (const proj of projects) {
          const cr = await fetch(`/api/channels?projectId=${encodeURIComponent(proj.id)}`)
          const cd = await cr.json()
          if (!cd.success || cancelled) continue
          const channels: { id: string; type: string; enabled: boolean; wechat?: { botToken: string }; dingtalk?: { appKey: string }; feishu?: { appId: string } }[] = (cd.channels || []).filter((c: { enabled: boolean }) => c.enabled)

          for (const ch of channels) {
            let statusUrl = ''
            if (ch.type === 'wechat' && ch.wechat?.botToken) {
              statusUrl = '/api/channels/webhook/wechat/connect'
            } else if (ch.type === 'dingtalk' && ch.dingtalk?.appKey) {
              statusUrl = '/api/channels/webhook/dingtalk/connect'
            } else if (ch.type === 'feishu' && ch.feishu?.appId) {
              statusUrl = '/api/channels/webhook/feishu/connect'
            }
            if (!statusUrl) continue

            try {
              // 查状态
              const sr = await fetch(`${statusUrl}?projectId=${encodeURIComponent(proj.id)}&channelId=${ch.id}`)
              const sd = await sr.json()
              // 未连接则连接
              if (sd.status !== 'connected') {
                fetch(statusUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ projectId: proj.id, channelId: ch.id }),
                }).catch(() => {})
              }
            } catch {}
          }
        }
      } catch {}
    }

    connectAll()
    const interval = setInterval(connectAll, 60000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])
}

export function Providers({ children }: { children: React.ReactNode }) {
  // 全局渠道连接
  useGlobalChannelConnect()

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

  // Tauri 桌面端：标记环境 + 通知 splash 关闭
  useEffect(() => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      // 添加 tauri-app 类，用于 CSS 禁用 WebView2 性能杀手（backdrop-filter 等）
      document.documentElement.classList.add('tauri-app')
      ;(window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string) => Promise<unknown> } })
        .__TAURI_INTERNALS__.invoke('app_ready').catch(() => {})
    }
  }, [])

  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  )
}
