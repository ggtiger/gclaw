'use client'

import { useState, useCallback, createContext, useContext, type ReactNode } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const TOAST_ICONS: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
}

const TOAST_COLORS: Record<ToastType, { bg: string; text: string; border: string }> = {
  success: {
    bg: 'color-mix(in srgb, #22c55e 10%, var(--color-surface))',
    text: '#16a34a',
    border: 'color-mix(in srgb, #22c55e 30%, transparent)',
  },
  error: {
    bg: 'color-mix(in srgb, #ef4444 10%, var(--color-surface))',
    text: '#dc2626',
    border: 'color-mix(in srgb, #ef4444 30%, transparent)',
  },
  info: {
    bg: 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))',
    text: 'var(--color-primary)',
    border: 'color-mix(in srgb, var(--color-primary) 30%, transparent)',
  },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  let nextId = 0

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + nextId++
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast 容器 */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
        {toasts.map(t => {
          const Icon = TOAST_ICONS[t.type]
          const colors = TOAST_COLORS[t.type]
          return (
            <div
              key={t.id}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border shadow-lg animate-fade-in text-sm"
              style={{
                backgroundColor: colors.bg,
                borderColor: colors.border,
                color: 'var(--color-text)',
              }}
            >
              <Icon size={16} style={{ color: colors.text, flexShrink: 0 }} />
              <span className="flex-1">{t.message}</span>
              <button
                onClick={() => removeToast(t.id)}
                className="p-0.5 rounded cursor-pointer opacity-60 hover:opacity-100"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
