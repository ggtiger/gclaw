'use client'

import { useEffect } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import { usePreferencesStore } from '@/lib/store/usePreferencesStore'
// AutoUpdater & startupUpdateCheck 通过动态 import 加载，避免 SSR 问题

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

/**
 * 自动更新：桌面端启动后延迟检查更新，非 Tauri 环境自动跳过
 */
function useAutoUpdater() {
  useEffect(() => {
    // 检查是否在 Tauri 环境
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return

    const initUpdater = async () => {
      const { AutoUpdater } = await import('@/lib/updater')
      const { useUpdateStore } = await import('@/lib/store/update-store')

      const updater = new AutoUpdater()
      updater.start({
        onUpdateReady: (version, localPath) => {
          // 更新下载完成，通知 UI 显示重启按钮
          useUpdateStore.getState().setReady(version, localPath)
        },
        onServerUpdated: (newVersion) => {
          console.log(`Server 已热更新到 ${newVersion}`)
        },
        onTauriUpdate: (info) => {
          console.log(`发现全量更新: ${info.version}，需要重新安装`)
          useUpdateStore.getState().setTauriUpdate(info.version, info.canAutoInstall !== false, info.downloadUrl)
        },
        onError: (err) => {
          console.warn(`更新检查失败: ${err}`)
        },
      })

      return () => updater.stop()
    }

    let cleanup: (() => void) | undefined
    initUpdater().then(c => { cleanup = c })

    return () => { cleanup?.() }
  }, [])
}

export function Providers({ children }: { children: React.ReactNode }) {
  // 全局渠道连接
  useGlobalChannelConnect()

  // 自动更新检查
  useAutoUpdater()

  // 全局主题初始化：通过 Zustand store 统一管理
  useEffect(() => {
    usePreferencesStore.getState().init()
  }, [])

  // Tauri 桌面端：标记环境 + 启动更新检查 + 通知 splash 关闭
  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return

    document.documentElement.classList.add('tauri-app')

    const doStartup = async () => {
      try {
        const { startupUpdateCheck } = await import('@/lib/updater')
        const { invoke } = await import('@tauri-apps/api/core')

        // Windows 上 apply 需要停 server + 等待句柄释放 + 重启，时间更长
        const isWindows = navigator.userAgent.includes('Windows')
        const timeoutMs = isWindows ? 45000 : 20000
        const timeoutPromise = new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeoutMs)
        )

        await Promise.race([
          startupUpdateCheck(async (status, progress, detail) => {
            // 将进度转发到 splash 窗口
            try {
              await invoke('update_splash', { status, progress, detail })
            } catch {}
          }),
          timeoutPromise
        ])
      } catch (err) {
        // 超时或失败，不阻塞启动
        console.warn('Startup update check skipped:', err)
      }

      // 无论成功失败都调用 app_ready
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('app_ready')
      } catch {}
    }

    doStartup()
  }, [])

  return (
    <ToastProvider>
      {children}
    </ToastProvider>
  )
}
