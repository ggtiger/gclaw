'use client'

import { create } from 'zustand'
import { applyThemeColor, resetThemeColor } from '@/lib/theme-color'

type Theme = 'light' | 'dark' | 'system'

interface PreferencesStore {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  themeColor: string
  backgroundImage: string

  // Actions
  init: () => void
  setTheme: (t: Theme) => void
  setThemeColor: (hex: string) => void
  resetThemeColor: () => void
  setBackgroundImage: (url: string) => void
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'dark') return 'dark'
  if (theme === 'light') return 'light'
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

function applyThemeToDOM(resolved: 'light' | 'dark') {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
}

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  theme: 'system',
  resolvedTheme: 'light',
  themeColor: '',
  backgroundImage: '',

  init: () => {
    try {
      const saved = localStorage.getItem('gclaw-theme') as Theme | null
      const theme = saved || 'system'
      const resolved = resolveTheme(theme)
      applyThemeToDOM(resolved)

      const themeColor = localStorage.getItem('gclaw-theme-color') || ''
      if (themeColor && /^#[0-9a-fA-F]{6}$/.test(themeColor)) {
        applyThemeColor(themeColor)
      }

      const backgroundImage = localStorage.getItem('gclaw-background-image') || ''

      set({ theme, resolvedTheme: resolved, themeColor, backgroundImage })
    } catch {}

    // 监听系统主题变化
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', () => {
        const { theme } = get()
        if (theme === 'system') {
          const resolved = resolveTheme('system')
          applyThemeToDOM(resolved)
          set({ resolvedTheme: resolved })
        }
      })
    }
  },

  setTheme: (t: Theme) => {
    const resolved = resolveTheme(t)
    applyThemeToDOM(resolved)
    localStorage.setItem('gclaw-theme', t)
    set({ theme: t, resolvedTheme: resolved })
  },

  setThemeColor: (hex: string) => {
    localStorage.setItem('gclaw-theme-color', hex)
    applyThemeColor(hex)
    set({ themeColor: hex })
  },

  resetThemeColor: () => {
    localStorage.removeItem('gclaw-theme-color')
    resetThemeColor()
    set({ themeColor: '' })
  },

  setBackgroundImage: (url: string) => {
    if (url) {
      localStorage.setItem('gclaw-background-image', url)
    } else {
      localStorage.removeItem('gclaw-background-image')
    }
    set({ backgroundImage: url })
  },
}))
