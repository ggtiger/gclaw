'use client'

import { useEffect, useState } from 'react'

/**
 * Windows 原生风格窗口控制按钮（仅 Windows 显示）
 * 放在窗口右上角：最小化 ─  最大化 □  关闭 ✕
 */
export function WindowControls() {
  const [isWindows, setIsWindows] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // 检查是否为 Windows，或开发模式强制显示
    const isWin = navigator.userAgent.includes('Windows')
    const isDev = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('show-windows-controls')
    setIsWindows(isWin || isDev)
  }, [])

  if (!isWindows) return null

  const invoke = async (cmd: string, args?: Record<string, unknown>) => {
    const ti = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ as
      | { invoke?: (c: string, a?: unknown) => Promise<unknown> }
      | undefined
    if (!ti?.invoke) return
    await ti.invoke(cmd, args)
  }

  const handleClose = () => invoke('plugin:window|close', { label: 'main' })
  const handleMinimize = () => invoke('plugin:window|minimize', { label: 'main' })
  const handleMaximize = async () => {
    await invoke(
      isMaximized ? 'plugin:window|unmaximize' : 'plugin:window|maximize',
      { label: 'main' }
    )
    setIsMaximized(!isMaximized)
  }

  return (
    <div
      className="fixed top-0 right-0 z-[9999] flex items-stretch h-[32px] select-none"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      data-tauri-no-drag
    >
      {/* 最小化 */}
      <button
        onClick={handleMinimize}
        className="w-[46px] h-full flex items-center justify-center transition-colors
          text-gray-500 dark:text-gray-400
          hover:bg-black/[0.05] dark:hover:bg-white/[0.08]
          active:bg-black/[0.08] dark:active:bg-white/[0.12]"
        title="最小化"
      >
        <svg width="10" height="1" viewBox="0 0 10 1">
          <rect width="10" height="1" fill="currentColor" />
        </svg>
      </button>

      {/* 最大化/还原 */}
      <button
        onClick={handleMaximize}
        className="w-[46px] h-full flex items-center justify-center transition-colors
          text-gray-500 dark:text-gray-400
          hover:bg-black/[0.05] dark:hover:bg-white/[0.08]
          active:bg-black/[0.08] dark:active:bg-white/[0.12]"
        title={isMaximized ? '还原' : '最大化'}
      >
        {isMaximized ? (
          // 还原图标：两个重叠方框
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="2" y="0" width="8" height="8" rx="0.5" />
            <rect x="0" y="2" width="8" height="8" rx="0.5" fill="var(--color-bg, #fff)" />
            <rect x="0" y="2" width="8" height="8" rx="0.5" />
          </svg>
        ) : (
          // 最大化图标：方框
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />
          </svg>
        )}
      </button>

      {/* 关闭 */}
      <button
        onClick={handleClose}
        className="w-[46px] h-full flex items-center justify-center transition-colors rounded-bl-lg
          text-gray-500 dark:text-gray-400
          hover:bg-[#e81123] hover:text-white
          active:bg-[#bf0f1d] active:text-white"
        title="关闭"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
          <line x1="0" y1="0" x2="10" y2="10" />
          <line x1="10" y1="0" x2="0" y2="10" />
        </svg>
      </button>
    </div>
  )
}
