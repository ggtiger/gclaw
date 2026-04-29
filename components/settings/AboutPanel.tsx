'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Download, RotateCw, Info, Zap, ExternalLink } from 'lucide-react'
import { isTauri } from '@/lib/tauri'
import {
  checkForUpdate, downloadUpdate, installAndRelaunch,
  checkServerDelta, downloadServerUpdate, applyServerUpdate, getCurrentServerVersion,
  type UpdateInfo, type UpdateProgress, type UpdateStatus, type ServerUpdateInfo,
} from '@/lib/updater'
import { useUpdateStore } from '@/lib/store/update-store'
import appIcon from '@/public/icon.png'

export function AboutPanel() {
  const [version, setVersion] = useState<string>('')
  const [serverVersion, setServerVersion] = useState<string>('')
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [serverUpdate, setServerUpdate] = useState<ServerUpdateInfo | null>(null)
  const [progress, setProgress] = useState<UpdateProgress>({ downloaded: 0, total: 0, percent: 0 })
  const [errorMsg, setErrorMsg] = useState('')
  const [serverNeedsRestart, setServerNeedsRestart] = useState(false)
  const [serverDownloaded, setServerDownloaded] = useState<{ localPath: string; version: string } | null>(null)
  const [tauriDownloaded, setTauriDownloaded] = useState(false)
  const [isTauriEnv, setIsTauriEnv] = useState(false)
  const autoDownloadTriggered = useRef(false)

  // 从 update store 读取 Tauri 全量更新状态
  const tauriUpdateAvailable = useUpdateStore(s => s.tauriUpdateAvailable)
  const tauriUpdateVersion = useUpdateStore(s => s.tauriUpdateVersion)
  const tauriCanAutoInstall = useUpdateStore(s => s.tauriCanAutoInstall)

  // 获取版本号
  useEffect(() => {
    setIsTauriEnv(isTauri())
    if (!isTauri()) return
    import('@tauri-apps/api/app').then(({ getVersion }) => {
      getVersion().then(setVersion)
    })
    getCurrentServerVersion().then(setServerVersion)
  }, [])

  // 自动触发 Tauri 全量更新下载（从侧边栏跳转过来时）
  useEffect(() => {
    if (autoDownloadTriggered.current) return
    if (!isTauri() || !tauriUpdateAvailable || !tauriCanAutoInstall || !tauriUpdateVersion) return

    autoDownloadTriggered.current = true
    setUpdateInfo({ version: tauriUpdateVersion, canAutoInstall: true })
    setStatus('available')

    // 自动开始下载
    setStatus('downloading')
    setErrorMsg('')
    downloadUpdate((p) => setProgress(p))
      .then(() => {
        setTauriDownloaded(true)
        setStatus('downloaded')
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : String(err))
        setErrorMsg(msg || '下载失败')
        setStatus('error')
      })
  }, [tauriUpdateAvailable, tauriCanAutoInstall, tauriUpdateVersion])

  const handleCheck = useCallback(async () => {
    console.log('[AboutPanel] 👉 handleCheck 被调用, isTauri()=', isTauri(), 'window.__TAURI_INTERNALS__=', typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window)
    if (!isTauri()) {
      console.warn('[AboutPanel] ⚠️ isTauri() 返回 false，跳过检查')
      return
    }
    setStatus('checking')
    setErrorMsg('')
    setUpdateInfo(null)
    setServerUpdate(null)

    try {
      // 1. 优先检查 Tauri 全量更新
      let tauriInfo: UpdateInfo | null = null
      try {
        console.log('[AboutPanel] 🔍 Step1: 检查 Tauri 壳全量更新...')
        tauriInfo = await checkForUpdate()
        console.log('[AboutPanel] Step1 结果:', tauriInfo ? `发现 v${tauriInfo.version}` : 'null (无壳更新)')
      } catch (tauriErr) {
        console.warn('[AboutPanel] ❌ Step1 Tauri 更新检查异常:', tauriErr)
      }

      if (tauriInfo) {
        // 发现全量更新，不再检查 server 热更新
        console.log('[AboutPanel] ✅ 显示壳全量更新按钮')
        setUpdateInfo(tauriInfo)
        setStatus('available')
        return
      }

      // 2. 无全量更新，再检查 server 热更新
      let serverInfo: ServerUpdateInfo | null = null
      try {
        console.log('[AboutPanel] 🔍 Step2: 检查 server 热更新...')
        serverInfo = await checkServerDelta()
        console.log('[AboutPanel] Step2 结果:', serverInfo ? `${serverInfo.label} (v${serverInfo.version}, delta=${!!serverInfo.delta})` : 'null (无server更新)')
      } catch (serverErr) {
        console.warn('[AboutPanel] ❌ Step2 Server 更新检查异常:', serverErr)
      }

      if (serverInfo) {
        setServerUpdate(serverInfo)
        setStatus('available')
      } else {
        setStatus('idle')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[AboutPanel] 检查更新失败:', err)
      setErrorMsg(msg)
      setStatus('error')
    }
  }, [])

  // 全量更新：第一步 - 只下载
  const handleDownload = useCallback(async () => {
    setStatus('downloading')
    setErrorMsg('')
    try {
      await downloadUpdate((p) => {
        setProgress(p)
      })
      setTauriDownloaded(true)
      setStatus('downloaded')
    } catch (err) {
      const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : String(err))
      setErrorMsg(msg || '下载失败')
      setStatus('error')
    }
  }, [])

  // 全量更新：第二步 - 用户确认后安装并重启
  const handleInstallAndRelaunch = useCallback(async () => {
    setStatus('downloading')
    setErrorMsg('')
    try {
      await installAndRelaunch()
    } catch (err) {
      const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : String(err))
      setErrorMsg(msg || '安装失败')
      setStatus('error')
    }
  }, [])

  // 第一步：只下载增量包
  const handleServerDownload = useCallback(async () => {
    if (!serverUpdate?.delta) return
    setStatus('downloading')
    setErrorMsg('')
    try {
      const info: ServerUpdateInfo = {
        version: serverUpdate.version,
        delta: serverUpdate.delta,
        serverFull: null,
        label: '热更新',
      }
      const result = await downloadServerUpdate(info, (percent) => {
        setProgress({
          downloaded: Math.floor((serverUpdate.delta!.size || 0) * percent / 100),
          total: serverUpdate.delta!.size || 0,
          percent,
        })
      })
      setServerDownloaded(result)
      setStatus('downloaded')
    } catch (err) {
      const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : String(err))
      setErrorMsg(msg || '下载失败')
      setStatus('error')
    }
  }, [serverUpdate])

  // 第二步：用户确认后，应用补丁并重启
  const handleApplyAndRestart = useCallback(async () => {
    if (!serverDownloaded) return
    setStatus('downloading')
    setErrorMsg('')
    try {
      await applyServerUpdate(serverDownloaded.localPath, serverDownloaded.version, false, true)
      setServerVersion(serverDownloaded.version)
      setServerUpdate(null)
      setServerDownloaded(null)
      setStatus('downloaded')
      try {
        const { relaunch } = await import('@tauri-apps/plugin-process')
        await relaunch()
      } catch {
        setServerNeedsRestart(true)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : String(err))
      setErrorMsg(msg || '热更新失败')
      setStatus('error')
    }
  }, [serverDownloaded])

  const handleRestartServer = useCallback(async () => {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch (err: any) {
      setErrorMsg('重启失败，请手动重启应用')
      setStatus('error')
    }
  }, [])

  const handleManualDownload = useCallback(async () => {
    if (!updateInfo?.downloadUrl) return
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(updateInfo.downloadUrl)
    } catch {
      window.open(updateInfo.downloadUrl, '_blank')
    }
  }, [updateInfo])

  if (!isTauriEnv) return null

  const hasServerDelta = serverUpdate?.delta != null
  const hasTauriUpdate = updateInfo != null
  const canAutoInstall = updateInfo?.canAutoInstall !== false

  return (
    <div className="p-4 space-y-4">
      {/* 版本信息 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <img src={typeof appIcon === 'string' ? appIcon : appIcon.src} alt="GClaw" className="w-10 h-10 rounded-xl" />
          <div>
            <div className="text-sm font-semibold">GClaw</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              版本 {version || '-'}
              {serverVersion && serverVersion !== 'unknown' && (
                <span className="ml-2 text-gray-400">
                  · Server {serverVersion}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-xs text-gray-400 mt-2">
          基于 Claude Agent SDK 的 AI 对话应用平台
        </div>
      </div>

      {/* 更新状态 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">应用更新</span>
          <div className="flex items-center gap-2">
            {status === 'checking' && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <RefreshCw size={12} className="animate-spin" />
                检查中...
              </span>
            )}
            {status === 'downloading' && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Download size={12} className="animate-bounce" />
                下载中 {progress.percent}%
              </span>
            )}
            {status === 'downloaded' && (
              <span className="text-xs text-green-500">更新完成</span>
            )}
            {status === 'idle' && !errorMsg && (
              <span className="text-xs text-gray-400">已是最新版本</span>
            )}
            {status === 'available' && (
              <>
                {/* Server 热更新按钮 */}
                {hasServerDelta && (
                  <button
                    onClick={handleServerDownload}
                    className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer"
                  >
                    <Zap size={12} />
                    {serverUpdate!.label}
                  </button>
                )}
                {/* Tauri 全量更新按钮 */}
                {hasTauriUpdate && canAutoInstall && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors cursor-pointer"
                  >
                    <Download size={12} />
                    下载更新 v{updateInfo!.version}
                  </button>
                )}
                {/* 手动下载按钮（Tauri updater 不可用时） */}
                {hasTauriUpdate && !canAutoInstall && updateInfo?.downloadUrl && (
                  <button
                    onClick={handleManualDownload}
                    className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition-colors cursor-pointer"
                  >
                    <ExternalLink size={12} />
                    下载 v{updateInfo!.version}
                  </button>
                )}
              </>
            )}
            {(status === 'idle' || status === 'error' || status === 'downloaded') && (
              <button
                onClick={handleCheck}
                className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors cursor-pointer"
              >
                <RefreshCw size={12} />
                检查更新
              </button>
            )}
          </div>
        </div>

        {/* 下载进度条 */}
        {status === 'downloading' && progress.total > 0 && (
          <div className="mt-2">
            <div className="w-full h-1.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-600 rounded-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-gray-400">
                {(progress.downloaded / 1024 / 1024).toFixed(1)} MB
              </span>
              <span className="text-[10px] text-gray-400">
                {(progress.total / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
          </div>
        )}

        {/* 错误信息 */}
        {errorMsg && (
          <div className="mt-2 text-xs text-red-500">{errorMsg}</div>
        )}

        {/* 更新说明 */}
        {updateInfo?.body && (
          <div className="mt-2 p-2 bg-gray-50 dark:bg-white/5 rounded-lg">
            <div className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
              {updateInfo.body}
            </div>
          </div>
        )}

        {/* 全量更新下载完成，等待用户确认安装 */}
        {status === 'downloaded' && tauriDownloaded && (
          <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg flex items-center justify-between">
            <span className="text-sm text-purple-700 dark:text-purple-300">
              下载完成 v{updateInfo?.version}
            </span>
            <button
              onClick={handleInstallAndRelaunch}
              className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors cursor-pointer font-medium"
            >
              确认安装并重启
            </button>
          </div>
        )}

        {/* 热更新下载完成，等待用户确认应用更新 */}
        {status === 'downloaded' && serverDownloaded && (
          <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center justify-between">
            <span className="text-sm text-emerald-700 dark:text-emerald-300">
              下载完成 v{serverDownloaded.version}
            </span>
            <button
              onClick={handleApplyAndRestart}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer font-medium"
            >
              确认更新并重启
            </button>
          </div>
        )}

        {/* 热更新已应用，等待重启 */}
        {status === 'downloaded' && !serverDownloaded && serverNeedsRestart && (
          <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center justify-between">
            <span className="text-sm text-emerald-700 dark:text-emerald-300">
              ✅ 热更新完成，重启后生效
            </span>
            <button
              onClick={handleRestartServer}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer font-medium"
            >
              立即重启
            </button>
          </div>
        )}

        {/* Server 热更新提示 */}
        {status === 'available' && serverUpdate && !hasServerDelta && (
          <div className="mt-2 p-2 bg-gray-50 dark:bg-white/5 rounded-lg">
            <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Info size={12} />
              Server 有新版本（{serverUpdate.version}），但无可用增量包，请通过全量更新获取。
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
