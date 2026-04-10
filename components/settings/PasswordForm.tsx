'use client'

import { useState } from 'react'
import { Eye, EyeOff, Loader, KeyRound } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

export function PasswordForm() {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (!oldPassword) {
      setError('请输入旧密码')
      return
    }
    if (!newPassword) {
      setError('请输入新密码')
      return
    }
    if (newPassword.length < 8) {
      setError('新密码至少 8 位')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    if (oldPassword === newPassword) {
      setError('新密码不能与旧密码相同')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '修改失败')
        return
      }

      setSuccess(true)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast('密码修改成功', 'success')
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
        <div className="flex items-center gap-1.5">
          <KeyRound size={14} />
          修改密码
        </div>
      </div>

      {/* 旧密码 */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          旧密码
        </label>
        <div className="relative">
          <input
            type={showOld ? 'text' : 'password'}
            value={oldPassword}
            onChange={e => setOldPassword(e.target.value)}
            placeholder="请输入旧密码"
            autoComplete="current-password"
            className="w-full px-3 py-2 pr-9 rounded-lg border text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={() => setShowOld(!showOld)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 cursor-pointer"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {showOld ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {/* 新密码 */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          新密码
        </label>
        <div className="relative">
          <input
            type={showNew ? 'text' : 'password'}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="至少 8 位"
            autoComplete="new-password"
            className="w-full px-3 py-2 pr-9 rounded-lg border text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={() => setShowNew(!showNew)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 cursor-pointer"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {/* 确认密码 */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
          确认新密码
        </label>
        <div className="relative">
          <input
            type={showConfirm ? 'text' : 'password'}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="再次输入新密码"
            autoComplete="new-password"
            className="w-full px-3 py-2 pr-9 rounded-lg border text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
            style={inputStyle}
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 cursor-pointer"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'var(--color-error-10)', color: 'var(--color-error)' }}>
          {error}
        </div>
      )}

      {success && (
        <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'var(--color-success-10)', color: 'var(--color-success)' }}>
          密码修改成功
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
      >
        {loading ? <Loader size={14} className="animate-spin" /> : <KeyRound size={14} />}
        {loading ? '修改中...' : '修改密码'}
      </button>
    </form>
  )
}
