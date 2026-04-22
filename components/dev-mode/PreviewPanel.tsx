'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, ExternalLink, Maximize2, Minimize2, Loader2 } from 'lucide-react'

interface PreviewPanelProps {
  previewUrl?: string
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

export function PreviewPanel({ previewUrl, isFullscreen, onToggleFullscreen }: PreviewPanelProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (previewUrl) {
      setLoading(true)
      setError(null)
    }
  }, [previewUrl, refreshKey])

  const handleLoad = useCallback(() => {
    setLoading(false)
    setError(null)
  }, [])

  const handleError = useCallback(() => {
    setLoading(false)
    setError('无法连接到预览服务器')
  }, [])

  const handleRefresh = () => {
    setRefreshKey(k => k + 1)
  }

  const handleOpenExternal = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank', 'noopener,noreferrer')
    }
  }

  if (!previewUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
        <RefreshCw size={24} />
        <p className="text-xs">未启用开发模式</p>
        <p className="text-[10px] text-gray-500">请在设置中启用开发模式</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-2 py-1 border-b shrink-0" style={{ borderColor: 'var(--panel-border)' }}>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400 font-mono truncate max-w-[200px]">
            {previewUrl}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleRefresh}
            className="p-1 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            title="刷新"
          >
            <RefreshCw size={12} className="text-gray-400" />
          </button>
          <button
            onClick={handleOpenExternal}
            className="p-1 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            title="在浏览器中打开"
          >
            <ExternalLink size={12} className="text-gray-400" />
          </button>
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-1 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? <Minimize2 size={12} className="text-gray-400" /> : <Maximize2 size={12} className="text-gray-400" />}
            </button>
          )}
        </div>
      </div>

      {/* iframe */}
      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ backgroundColor: 'var(--color-bg)' }}>
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-xs">加载预览...</span>
            </div>
          </div>
        )}
        {error ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-xs text-red-500">{error}</p>
            <button
              onClick={handleRefresh}
              className="text-xs px-3 py-1 rounded-lg bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 cursor-pointer"
            >
              重试
            </button>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            key={refreshKey}
            src={previewUrl}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            onLoad={handleLoad}
            onError={handleError}
            title="开发模式预览"
          />
        )}
      </div>
    </div>
  )
}
