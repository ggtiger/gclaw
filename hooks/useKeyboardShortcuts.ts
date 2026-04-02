'use client'

import { useEffect, useCallback, useRef } from 'react'

// ============================================================
// 全局键盘快捷键 Hook
// Enter = 发送（在 ChatInput 中已有本地处理）
// Shift+Enter = 换行（在 ChatInput 中已有本地处理）
// Esc = 关闭弹窗 / 侧面板 / 命令面板
// Ctrl+K / Cmd+K = 打开命令面板
// / = 聚焦输入框后输入 / 触发命令模式
// ============================================================

export interface KeyboardShortcutsConfig {
  /** 按下 Esc 时的回调 */
  onEscape?: () => void
  /** Ctrl+K / Cmd+K 打开命令面板 */
  onOpenCommandPalette?: () => void
  /** 关闭命令面板 */
  onCloseCommandPalette?: () => void
  /** 清空对话 */
  onClearChat?: () => void
  /** 切换主题 */
  onCycleTheme?: () => void
  /** 切换侧面板 */
  onToggleSidePanel?: (panel: string) => void
  /** 聚焦输入框 */
  onFocusInput?: () => void
}

export function useKeyboardShortcuts(config: KeyboardShortcutsConfig) {
  const configRef = useRef(config)
  configRef.current = config

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    const isInputElement =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable

    const isMeta = e.metaKey || e.ctrlKey

    // ---- Ctrl+K / Cmd+K：打开命令面板 ----
    if (e.key === 'k' && isMeta) {
      e.preventDefault()
      configRef.current.onOpenCommandPalette?.()
      return
    }

    // ---- Esc：关闭弹窗 / 命令面板 / 侧面板 ----
    if (e.key === 'Escape') {
      e.preventDefault()
      configRef.current.onEscape?.()
      return
    }

    // ---- 仅在非输入框中生效的快捷键 ----
    if (isInputElement) return

    // ---- / 命令前缀：聚焦输入框并输入 / ----
    if (e.key === '/') {
      e.preventDefault()
      configRef.current.onFocusInput?.()
      return
    }
  }, [])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
