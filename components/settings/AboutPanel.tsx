'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Download, RotateCw, Info } from 'lucide-react'
import { isTauri } from '@/lib/tauri'
import { checkForUpdate, downloadAndInstall, type UpdateInfo, type UpdateProgress, type UpdateStatus } from '@/lib/updater'
import appIcon from '@/public/icon.png'

export function AboutPanel() {
  const [version, setVersion] = useState<string>('')
  const [status, setStatus] = useState<UpdateStatus>('idle')
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [progress, setProgress] = useState<UpdateProgress>({ downloaded: 0, total: 0, percent: 0 })
  const [errorMsg, setErrorMsg] = useState('')

  // 获取版本号
  useEffect(() => {
    if (!isTauri()) return
    import('@tauri-apps/api/app').then(({ getVersion }) => {
      getVersion().then(setVersion)
    })
  }, [])

  const handleCheck = useCallback(async () => {
    if (!isTauri()) return
    setStatus('checking')
    setErrorMsg('')
    setUpdateInfo(null)
    try {
      const info = await checkForUpdate()
      if (info) {
        setUpdateInfo(info)
        setStatus('available')
      } else {
        setStatus('idle')
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '检查更新失败')
      setStatus('error')
    }
  }, [])

  const handleInstall = useCallback(async () => {
    setStatus('downloading')
    setErrorMsg('')
    try {
      await downloadAndInstall((p) => {
        setProgress(p)
      })
      setStatus('downloaded')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '更新失败')
      setStatus('error')
    }
  }, [])

  if (!isTauri()) return null

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
            {status === 'available' && updateInfo && (
              <button
                onClick={handleInstall}
                className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors cursor-pointer"
              >
                <Download size={12} />
                安装更新 v{updateInfo.version}
              </button>
            )}
            {(status === 'idle' || status === 'error' || status === 'downloaded') && (
              <button
                onClick={handleCheck}
                disabled={false}
                className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors disabled:opacity-40 cursor-pointer"
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
      </div>
    </div>
  )
}
