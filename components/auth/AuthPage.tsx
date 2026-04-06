'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'

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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div
        className="w-full max-w-sm rounded-xl border p-6 animate-fade-in-up"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        {/* Logo / 标题 */}
        <div className="text-center mb-6">
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

        {/* OAuth 登录（仅登录模式显示） */}
        {mode === 'login' && (
          <>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="px-3 text-xs" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
                  或
                </span>
              </div>
              <div className="border-t" style={{ borderColor: 'var(--color-border)' }} />
            </div>
            <div className="flex gap-2">
              <a
                href={`/api/auth/oauth/dingtalk?redirect=${encodeURIComponent(searchParams.get('redirect') || '/')}`}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors hover:border-[var(--color-primary)]"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                <span className="text-[#0089FF] font-bold">D</span>
                钉钉登录
              </a>
              <a
                href={`/api/auth/oauth/feishu?redirect=${encodeURIComponent(searchParams.get('redirect') || '/')}`}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors hover:border-[var(--color-primary)]"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                <span className="text-[#3370CC] font-bold">F</span>
                飞书登录
              </a>
            </div>
          </>
        )}

        {/* OAuth 错误提示 */}
        {searchParams.get('error') === 'oauth_failed' && (
          <div className="mt-3 text-xs text-center" style={{ color: 'var(--color-error)' }}>
            OAuth 登录失败，请重试或使用账号密码登录
          </div>
        )}
      </div>
    </div>
  )
}
