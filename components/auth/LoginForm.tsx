'use client'

import { useState } from 'react'
import { Eye, EyeOff, Loader, LogIn } from 'lucide-react'

interface LoginFormProps {
  onSuccess: (data?: { token?: string; maxAge?: number }) => void
  onSwitchToRegister: () => void
}

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username.trim()) {
      setError('请输入用户名')
      return
    }
    if (!password) {
      setError('请输入密码')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, rememberMe }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '登录失败')
        return
      }

      onSuccess({ token: data.token, maxAge: data.maxAge })
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          用户名
        </label>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="请输入用户名"
          autoComplete="username"
          autoFocus
          className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg)',
            color: 'var(--color-text)',
          }}
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
          密码
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="请输入密码"
            autoComplete="current-password"
            className="w-full px-3 py-2.5 pr-10 rounded-lg border text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 cursor-pointer"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setRememberMe(!rememberMe)}
          className="w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors"
          style={{
            borderColor: rememberMe ? 'var(--color-primary)' : 'var(--color-border)',
            backgroundColor: rememberMe ? 'var(--color-primary)' : 'transparent',
          }}
        >
          {rememberMe && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>记住我</span>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: 'var(--color-primary)',
          color: 'white',
        }}
      >
        {loading ? <Loader size={16} className="animate-spin" /> : <LogIn size={16} />}
        {loading ? '登录中...' : '登录'}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="text-xs cursor-pointer hover:underline"
          style={{ color: 'var(--color-primary)' }}
        >
          没有账号？注册
        </button>
      </div>
    </form>
  )
}
