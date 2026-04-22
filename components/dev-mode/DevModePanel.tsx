'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Code2, Play, Square, RefreshCw, Upload, Download, GitBranch,
  CheckCircle2, AlertCircle, Loader2, ExternalLink, Trash2, ArrowRightLeft
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import type { DevModeState } from '@/lib/dev-mode/manager'

interface DevModeStatus {
  state: DevModeState
  worktreePath?: string
  devBranch?: string
  devServerPort?: number
  previewUrl?: string
  mainBranch?: string
  projectId?: string
  error?: string
}

interface OTACheckResult {
  hasUpdate: boolean
  currentVersion: string
  latestVersion?: string
  error?: string
}

export function DevModePanel() {
  const [status, setStatus] = useState<DevModeStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [otaStatus, setOtaStatus] = useState<OTACheckResult | null>(null)
  const { toast } = useToast()

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/dev-mode')
      const data = await res.json()
      setStatus(data)
    } catch (err) {
      console.error('Failed to fetch dev mode status:', err)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    // 轮询状态（dev server 可能意外退出）
    const interval = setInterval(fetchStatus, 10000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const handleEnable = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dev-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enable' }),
      })
      const data = await res.json()
      setStatus(data)
      if (data.state === 'active') {
        toast('开发模式已启用', 'success')
      } else if (data.error) {
        toast(data.error, 'error')
      }
    } catch (err) {
      toast('启用开发模式失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDisable = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dev-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable' }),
      })
      const data = await res.json()
      setStatus(data)
      if (data.state === 'off') {
        toast('开发模式已关闭', 'success')
        setOtaStatus(null)
      }
    } catch (err) {
      toast('关闭开发模式失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDeploy = async (mode: 'build' | 'sync') => {
    setDeploying(true)
    try {
      const res = await fetch('/api/dev-mode/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const data = await res.json()
      if (data.success) {
        toast(mode === 'build' ? '构建并部署成功' : '变更已同步', 'success')
      } else {
        toast(data.error || '部署失败', 'error')
      }
    } catch (err) {
      toast('部署失败', 'error')
    } finally {
      setDeploying(false)
    }
  }

  const handleCheckUpdate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dev-mode/update')
      const data = await res.json()
      setOtaStatus(data)
      if (data.hasUpdate) {
        toast(`发现新版本: ${data.latestVersion}`, 'success')
      } else if (!data.error) {
        toast('当前已是最新版本', 'success')
      } else {
        toast(data.error, 'error')
      }
    } catch (err) {
      toast('检查更新失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handlePullUpdate = async () => {
    setUpdating(true)
    try {
      const res = await fetch('/api/dev-mode/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ build: true }),
      })
      const data = await res.json()
      if (data.success) {
        toast('更新成功，请重启应用', 'success')
      } else {
        toast(data.error || '更新失败', 'error')
      }
    } catch (err) {
      toast('更新失败', 'error')
    } finally {
      setUpdating(false)
    }
  }

  const isActive = status?.state === 'active'
  const isInitializing = status?.state === 'initializing'
  const isShuttingDown = status?.state === 'shutting_down'

  return (
    <div className="p-4 space-y-4">
      {/* 标题 + 状态指示 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code2 size={16} className="text-purple-600 dark:text-purple-400" />
          <span className="text-sm font-medium">开发模式</span>
        </div>
        {isActive ? (
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <CheckCircle2 size={12} />
            运行中
          </span>
        ) : status?.state === 'off' ? (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Square size={12} />
            已关闭
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-yellow-500">
            <Loader2 size={12} className="animate-spin" />
            {isInitializing ? '启动中...' : '关闭中...'}
          </span>
        )}
      </div>

      {/* 开/关切换 */}
      <div className="flex gap-2">
        {!isActive ? (
          <button
            onClick={handleEnable}
            disabled={loading || isInitializing}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-40 cursor-pointer"
          >
            {isInitializing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            启用开发模式
          </button>
        ) : (
          <button
            onClick={handleDisable}
            disabled={loading || isShuttingDown}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40 cursor-pointer"
          >
            {isShuttingDown ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
            关闭开发模式
          </button>
        )}
      </div>

      {/* 错误提示 */}
      {status?.error && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-xs text-red-600 dark:text-red-400">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span>{status.error}</span>
        </div>
      )}

      {/* 开发模式信息 */}
      {isActive && status && (
        <div className="space-y-3">
          {/* 工作区信息 */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <GitBranch size={12} />
              工作区信息
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-400">分支</span>
                <div className="font-mono text-purple-600 dark:text-purple-400 truncate">{status.devBranch}</div>
              </div>
              <div>
                <span className="text-gray-400">端口</span>
                <div className="font-mono">{status.devServerPort}</div>
              </div>
            </div>
            {status.projectId && (
              <div className="flex items-center gap-2">
                <div className="text-xs">
                  <span className="text-gray-400">开发项目</span>
                  <div className="font-mono text-purple-600 dark:text-purple-400">{status.projectId}</div>
                </div>
                <button
                  onClick={() => {
                    // 通过自定义事件通知 ChatLayout 切换项目
                    window.dispatchEvent(new CustomEvent('gclaw:switch-project', { detail: { projectId: status.projectId } }))
                    toast('已切换到开发项目', 'success')
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition-colors cursor-pointer"
                >
                  <ArrowRightLeft size={10} />
                  切换到开发项目
                </button>
              </div>
            )}
            {status.previewUrl && (
              <a
                href={status.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:underline"
              >
                <ExternalLink size={12} />
                在浏览器中打开预览
              </a>
            )}
          </div>

          {/* 部署操作 */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Upload size={12} />
              部署操作
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleDeploy('build')}
                disabled={deploying}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-40 cursor-pointer"
              >
                {deploying ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                构建部署
              </button>
              <button
                onClick={() => handleDeploy('sync')}
                disabled={deploying}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <RefreshCw size={12} />
                同步变更
              </button>
            </div>
            <p className="text-[10px] text-gray-400">
              构建部署：完整构建并替换 | 同步变更：直接同步修改文件
            </p>
          </div>
        </div>
      )}

      {/* OTA 更新 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <Download size={12} />
          远程更新
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCheckUpdate}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            检查更新
          </button>
          {otaStatus?.hasUpdate && (
            <button
              onClick={handlePullUpdate}
              disabled={updating}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {updating ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              拉取并更新
            </button>
          )}
        </div>
        {otaStatus && (
          <div className="text-xs text-gray-400">
            {otaStatus.error ? (
              <span className="text-red-500">{otaStatus.error}</span>
            ) : otaStatus.hasUpdate ? (
              <span>
                当前: <code className="text-purple-600 dark:text-purple-400">{otaStatus.currentVersion}</code>
                {' → '}
                最新: <code className="text-green-600 dark:text-green-400">{otaStatus.latestVersion}</code>
              </span>
            ) : (
              <span>当前版本 ({otaStatus.currentVersion}) 已是最新</span>
            )}
          </div>
        )}
      </div>

      {/* 说明 */}
      <div className="text-[10px] text-gray-400 leading-relaxed">
        <p>开发模式会创建独立的 Git 工作区，在其中启动 Dev Server。</p>
        <p>你可以通过对话让 AI 修改代码，在预览面板中实时查看效果。</p>
      </div>
    </div>
  )
}
