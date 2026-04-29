'use client'

import { create } from 'zustand'

interface UpdateState {
  // State
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'applying' | 'error'
  updateVersion: string | null
  downloadedPath: string | null
  progress: number // 0-100
  errorMsg: string | null
  /** Tauri 壳全量更新可用 */
  tauriUpdateAvailable: boolean
  /** Tauri 壳全量更新版本号 */
  tauriUpdateVersion: string | null
  /** 是否可自动安装（Tauri updater 正常工作） */
  tauriCanAutoInstall: boolean
  /** 手动下载 URL（当 canAutoInstall=false 时） */
  tauriDownloadUrl: string | null

  // Actions
  setChecking: () => void
  setDownloading: (progress: number) => void
  setReady: (version: string, path: string) => void
  setApplying: () => void
  setError: (msg: string) => void
  setTauriUpdate: (version: string, canAutoInstall?: boolean, downloadUrl?: string) => void
  clearTauriUpdate: () => void
  reset: () => void
  applyAndRelaunch: () => Promise<void>
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: 'idle',
  updateVersion: null,
  downloadedPath: null,
  progress: 0,
  errorMsg: null,
  tauriUpdateAvailable: false,
  tauriUpdateVersion: null,
  tauriCanAutoInstall: false,
  tauriDownloadUrl: null,

  setChecking: () => set({ status: 'checking', progress: 0, errorMsg: null }),
  setDownloading: (progress) => set({ status: 'downloading', progress }),
  setReady: (version, path) =>
    set({ status: 'ready', updateVersion: version, downloadedPath: path, progress: 100 }),
  setApplying: () => set({ status: 'applying' }),
  setError: (msg) => set({ status: 'error', errorMsg: msg }),
  setTauriUpdate: (version, canAutoInstall = true, downloadUrl) => set({
    tauriUpdateAvailable: true,
    tauriUpdateVersion: version,
    tauriCanAutoInstall: canAutoInstall,
    tauriDownloadUrl: downloadUrl ?? null,
  }),
  clearTauriUpdate: () => set({ tauriUpdateAvailable: false, tauriUpdateVersion: null, tauriCanAutoInstall: false, tauriDownloadUrl: null }),
  reset: () =>
    set({ status: 'idle', updateVersion: null, downloadedPath: null, progress: 0, errorMsg: null, tauriUpdateAvailable: false, tauriUpdateVersion: null, tauriCanAutoInstall: false, tauriDownloadUrl: null }),

  applyAndRelaunch: async () => {
    const { downloadedPath, updateVersion } = get()
    console.log('[UpdateStore] applyAndRelaunch triggered', { downloadedPath, updateVersion })
    if (!downloadedPath || !updateVersion) {
      console.warn('[UpdateStore] missing downloadedPath or updateVersion, abort')
      return
    }

    set({ status: 'applying' })
    try {
      // 动态导入 updater 的 applyServerUpdate，避免循环依赖
      const { applyServerUpdate } = await import('@/lib/updater')
      console.log('[UpdateStore] applying server update...')
      await applyServerUpdate(downloadedPath, updateVersion, false) // 不 restart_server，直接 relaunch
      console.log('[UpdateStore] server update applied, relaunching...')

      // relaunch 整个 Tauri 应用
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (err: any) {
      console.error('[UpdateStore] applyAndRelaunch failed:', err)
      set({ status: 'error', errorMsg: err?.message || '更新应用失败' })
    }
  },
}))
