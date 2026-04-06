'use client'

import { useEffect, useState } from 'react'

/**
 * 仿 macOS 红绿灯窗口控制按钮（仅 Windows 显示）
 * 红：关闭  黄：最小化  绿：最大化/还原
 */
export function TrafficLight() {
  const [isWindows, setIsWindows] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    setIsWindows(navigator.userAgent.includes('Windows'))
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

  const btnBase = "w-3 h-3 rounded-full transition-all duration-150 flex items-center justify-center"
  const symbol = "text-[8px] font-bold leading-none opacity-0 group-hover:opacity-100 transition-opacity"

  return (
    <div
      className="flex items-center gap-2 select-none"
    >
      {/* 关闭 */}
      <button
        onClick={handleClose}
        className={`${btnBase} bg-[#ff5f57] hover:brightness-90`}
        title="关闭"
      >
        <span className={symbol} style={{ color: '#4a0002' }}>
          &#10005;
        </span>
      </button>

      {/* 最小化 */}
      <button
        onClick={handleMinimize}
        className={`${btnBase} bg-[#febc2e] hover:brightness-90`}
        title="最小化"
      >
        <span className={symbol} style={{ color: '#985600' }}>
          &#8722;
        </span>
      </button>

      {/* 最大化 */}
      <button
        onClick={handleMaximize}
        className={`${btnBase} bg-[#28c840] hover:brightness-90`}
        title={isMaximized ? '还原' : '最大化'}
      >
        <span className={symbol} style={{ color: '#006500' }}>
          {isMaximized ? '\u2215' : '\uFF0B'}
        </span>
      </button>
    </div>
  )
}
