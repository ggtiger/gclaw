'use client'

import { useState, useEffect, useCallback } from 'react'

type Theme = 'light' | 'dark' | 'system'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    // 从 localStorage 读取
    const saved = localStorage.getItem('gclaw-theme') as Theme | null
    if (saved) {
      setThemeState(saved)
    }
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      let isDark = false
      if (theme === 'dark') {
        isDark = true
      } else if (theme === 'system') {
        isDark = mediaQuery.matches
      }

      if (isDark) {
        document.documentElement.classList.add('dark')
        setResolvedTheme('dark')
      } else {
        document.documentElement.classList.remove('dark')
        setResolvedTheme('light')
      }
    }

    applyTheme()

    const handler = () => {
      if (theme === 'system') applyTheme()
    }
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    localStorage.setItem('gclaw-theme', t)
  }, [])

  return { theme, resolvedTheme, setTheme }
}
