'use client'

import { useState, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { PasswordForm } from './PasswordForm'
import { LogOut, Loader, Calendar, Shield, Camera, Trash2 } from 'lucide-react'

export function AccountPanel() {
  const { user, loading, logout, refresh } = useAuth()
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (loading || !user) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--color-bg-secondary)' }} />
        ))}
      </div>
    )
  }

  const initial = user.username.charAt(0).toUpperCase()
  const roleLabel = user.role === 'admin' ? '管理员' : '普通用户'
  const createdDate = new Date(user.createdAt).toLocaleDateString('zh-CN')

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      alert('不支持的文件类型，仅支持 JPEG、PNG、WebP、GIF')
      return
    }

    // 验证文件大小 (2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('文件大小超过限制（最大 2MB）')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/users/${user.id}/avatar`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.success) {
        // 刷新用户数据以获取新的 avatarUrl
        await refresh()
      } else {
        alert(data.error || '上传失败')
      }
    } catch (err) {
      console.error('上传头像失败:', err)
      alert('上传失败')
    } finally {
      setUploading(false)
      // 清空 input 以便可以重复选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleAvatarDelete = async () => {
    if (!user) return
    if (!confirm('确定要删除头像吗？')) return

    setUploading(true)
    try {
      const res = await fetch(`/api/users/${user.id}/avatar`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        await refresh()
      } else {
        alert(data.error || '删除失败')
      }
    } catch (err) {
      console.error('删除头像失败:', err)
      alert('删除失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-4 space-y-5">
      {/* 用户信息卡片 */}
      <div className="flex items-center gap-4 p-4 rounded-lg bg-white/10 dark:bg-slate-800/20 backdrop-blur-md border border-white/20">
        {/* 头像上传区域 */}
        <div className="relative flex-shrink-0">
          <div
            className="w-16 h-16 rounded-full border-2 border-white/20 shadow-lg overflow-hidden cursor-pointer transition-all duration-200 hover:border-purple-400/50"
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-lg font-bold"
                style={{ backgroundColor: 'var(--color-primary-15)', color: 'var(--color-primary)' }}
              >
                {initial}
              </div>
            )}
            {/* Hover 遮罩 */}
            <div className="absolute inset-0 bg-black/50 rounded-full flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200">
              <Camera size={18} className="text-white mb-0.5" />
              <span className="text-[10px] text-white">更换</span>
            </div>
            {/* 上传中遮罩 */}
            {uploading && (
              <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center">
                <Loader size={20} className="text-white animate-spin" />
              </div>
            )}
          </div>
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
            disabled={uploading}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
            {user.username}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg" style={{
              backgroundColor: user.role === 'admin' ? 'var(--color-primary-15)' : 'var(--color-bg-tertiary)',
              color: user.role === 'admin' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            }}>
              <Shield size={10} />
              {roleLabel}
            </span>
          </div>
          {/* 删除头像按钮 */}
          {user.avatarUrl && (
            <button
              onClick={handleAvatarDelete}
              disabled={uploading}
              className="mt-2 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-error-10)',
                color: 'var(--color-error)',
              }}
            >
              <Trash2 size={10} />
              删除头像
            </button>
          )}
        </div>
      </div>

      {/* 注册时间 */}
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <Calendar size={12} />
        注册于 {createdDate}
      </div>

      {/* 分隔线 */}
      <div style={{ borderTop: '1px solid var(--color-border)' }} />

      {/* 修改密码 */}
      <PasswordForm />

      {/* 分隔线 */}
      <div style={{ borderTop: '1px solid var(--color-border)' }} />

      {/* 退出登录 */}
      <button
        onClick={logout}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        style={{
          backgroundColor: 'var(--color-error-10)',
          color: 'var(--color-error)',
        }}
      >
        <LogOut size={15} />
        退出登录
      </button>
    </div>
  )
}
