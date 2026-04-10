'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'
import { WindowControls } from '@/components/ui/WindowControls'
import appIcon from '@/public/icon.png'

export function AuthPage({ initialMode = 'login' }: { initialMode?: 'login' | 'register' }) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [checking, setChecking] = useState(true)
  const searchParams = useSearchParams()

  useEffect(() => {
    // 检查是否已登录，已登录则跳转主页
    fetch('/api/auth/me')
      .then(async res => {
        if (res.ok) {
          const redirect = searchParams.get('redirect') || '/'
          if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
            try {
              const { invoke } = await import('@tauri-apps/api/core')
              await invoke('navigate_to', { path: redirect })
            } catch {
              window.location.href = redirect
            }
          } else {
            window.location.href = redirect
          }
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [searchParams])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const handleSuccess = async (data?: { token?: string; maxAge?: number }) => {
    const redirect = searchParams.get('redirect') || '/'

    // 写入 cookie（确保客户端立即可用）
    if (data?.token) {
      const maxAge = data.maxAge || 7 * 24 * 60 * 60
      document.cookie = `gclaw_token=${data.token}; path=/; max-age=${maxAge}; SameSite=Lax`
    }

    // Tauri 桌面端：通过 Rust 端导航
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('navigate_to', { path: redirect })
        return
      } catch {
        // fallthrough to window.location
      }
    }

    window.location.href = redirect
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-bg)' }} data-tauri-drag-region>
      <WindowControls />
      <div
        className="w-full max-w-sm rounded-xl border p-6 animate-fade-in-up"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        {/* Logo / 标题 */}
        <div className="text-center mb-6">
          <Image src={appIcon} alt="GClaw" width={48} height={48} className="w-12 h-12 rounded-xl mx-auto mb-3" />
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            GClaw
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            AI Chat powered by Claude
          </p>
        </div>

        {mode === 'login' ? (
          <LoginForm
            onSuccess={handleSuccess}
            onSwitchToRegister={() => setMode('register')}
          />
        ) : (
          <RegisterForm
            onSuccess={handleSuccess}
            onSwitchToLogin={() => setMode('login')}
          />
        )}

      </div>
    </div>
  )
}
