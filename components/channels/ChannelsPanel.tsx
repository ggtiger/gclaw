'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Copy, Check, Link2, RefreshCw, QrCode, Smartphone, Loader2, AlertCircle, Pencil, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import type { ChannelConfig, ChannelType } from '@/types/channels'
import { useToast } from '@/components/ui/Toast'

const CHANNEL_TYPES: { type: ChannelType; label: string; icon: string }[] = [
  { type: 'dingtalk', label: '钉钉', icon: '🔵' },
  { type: 'feishu', label: '飞书', icon: '🟣' },
  { type: 'wechat', label: '微信 ClawBot', icon: '🟢' },
  { type: 'api', label: 'API 接入', icon: '🔌' },
]

export function ChannelsPanel({ projectId }: { projectId: string }) {
  const { toast } = useToast()
  const [channels, setChannels] = useState<ChannelConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editFields, setEditFields] = useState<Record<string, string>>({})
  const [editSaving, setEditSaving] = useState(false)

  // 微信 QR 码扫码登录状态
  const [qrLogin, setQrLogin] = useState<{
    channelId: string | null
    loading: boolean
    qrcodeUrl: string | null
    qrcode: string | null
    status: string
    error: string | null
  }>({ channelId: null, loading: false, qrcodeUrl: null, qrcode: null, status: '', error: null })

  // 微信连接状态 { channelId -> status }
  const [wechatStatus, setWechatStatus] = useState<Record<string, { status: string; error?: string }>>({})

  // 钉钉 Stream 连接状态 { channelId -> status }
  const [dingtalkStatus, setDingtalkStatus] = useState<Record<string, { status: string; error?: string }>>({})

  // 新建表单
  const [newType, setNewType] = useState<ChannelType>('dingtalk')
  const [newName, setNewName] = useState('')
  const [newFields, setNewFields] = useState<Record<string, string>>({})

  const fetchChannels = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/channels?projectId=${encodeURIComponent(projectId)}`)
      const data = await res.json()
      setChannels(data.channels || [])
    } catch (err) {
      console.error('Failed to load channels:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchChannels() }, [fetchChannels])

  // 轮询微信连接状态
  const fetchWechatStatuses = useCallback(async () => {
    const wechatChannels = channels.filter(c => c.type === 'wechat' && c.wechat?.botToken)
    if (wechatChannels.length === 0) return

    const statuses: Record<string, { status: string; error?: string }> = {}
    for (const ch of wechatChannels) {
      try {
        const res = await fetch(`/api/channels/webhook/wechat/connect?projectId=${encodeURIComponent(projectId)}&channelId=${ch.id}`)
        if (res.ok) {
          statuses[ch.id] = await res.json()
        }
      } catch { /* ignore */ }
    }
    setWechatStatus(statuses)
  }, [channels, projectId])

  useEffect(() => {
    fetchWechatStatuses()
    const interval = setInterval(fetchWechatStatuses, 5000)
    return () => clearInterval(interval)
  }, [fetchWechatStatuses])

  const handleWechatReconnect = async (channelId: string) => {
    try {
      await fetch('/api/channels/webhook/wechat/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, channelId }),
      })
      setTimeout(fetchWechatStatuses, 1000)
    } catch (err) {
      console.error('Reconnect failed:', err)
    }
  }

  // 轮询钉钉 Stream 连接状态
  const fetchDingtalkStatuses = useCallback(async () => {
    const dingtalkChannels = channels.filter(c => c.type === 'dingtalk' && c.dingtalk?.appKey)
    if (dingtalkChannels.length === 0) return

    const statuses: Record<string, { status: string; error?: string }> = {}
    for (const ch of dingtalkChannels) {
      try {
        const res = await fetch(`/api/channels/webhook/dingtalk/connect?projectId=${encodeURIComponent(projectId)}&channelId=${ch.id}`)
        if (res.ok) {
          statuses[ch.id] = await res.json()
        }
      } catch { /* ignore */ }
    }
    setDingtalkStatus(statuses)
  }, [channels, projectId])

  useEffect(() => {
    fetchDingtalkStatuses()
    const interval = setInterval(fetchDingtalkStatuses, 5000)
    return () => clearInterval(interval)
  }, [fetchDingtalkStatuses])

  const handleDingtalkReconnect = async (channelId: string) => {
    try {
      await fetch('/api/channels/webhook/dingtalk/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, channelId }),
      })
      setTimeout(fetchDingtalkStatuses, 1000)
    } catch (err) {
      console.error('Dingtalk reconnect failed:', err)
    }
  }

  const handleAdd = async () => {
    if (!newName.trim()) return

    const body: Record<string, unknown> = { type: newType, name: newName, enabled: true }
    switch (newType) {
      case 'dingtalk':
        body.dingtalk = { appKey: newFields.appKey || '', appSecret: newFields.appSecret || '' }
        break
      case 'feishu':
        body.feishu = {
          appId: newFields.appId || '',
          appSecret: newFields.appSecret || '',
          verificationToken: newFields.verificationToken || '',
          encryptKey: newFields.encryptKey || undefined,
        }
        break
      case 'wechat':
        body.wechat = { botToken: '', accountId: '' }
        break
      case 'api':
        body.api = { apiKey: '' }
        break
    }

    try {
      const res = await fetch(`/api/channels?projectId=${encodeURIComponent(projectId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setChannels(prev => [...prev, data.channel])
        setAdding(false)
        setNewName('')
        setNewFields({})
        toast('渠道添加成功', 'success')
      } else {
        toast(data.error || '添加渠道失败', 'error')
      }
    } catch (err) {
      console.error('Failed to add channel:', err)
      toast('添加渠道失败', 'error')
    }
  }

  const handleToggle = async (ch: ChannelConfig) => {
    const updated = { ...ch, enabled: !ch.enabled }
    setChannels(prev => prev.map(c => c.id === ch.id ? updated : c))
    try {
      await fetch(`/api/channels?projectId=${encodeURIComponent(projectId)}&channelId=${ch.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !ch.enabled }),
      })
    } catch {
      setChannels(prev => prev.map(c => c.id === ch.id ? ch : c))
    }
  }

  const handleDelete = async (channelId: string) => {
    setChannels(prev => prev.filter(c => c.id !== channelId))
    try {
      await fetch(`/api/channels?projectId=${encodeURIComponent(projectId)}&channelId=${channelId}`, {
        method: 'DELETE',
      })
    } catch (err) {
      console.error('Failed to delete channel:', err)
      toast('删除渠道失败', 'error')
      fetchChannels()
    }
  }

  const startEdit = (ch: ChannelConfig) => {
    setEditingId(ch.id)
    setEditName(ch.name)
    const fields: Record<string, string> = {}
    if (ch.dingtalk) {
      fields.appKey = ch.dingtalk.appKey || ''
      fields.appSecret = ''
    }
    if (ch.feishu) {
      fields.appId = ch.feishu.appId || ''
      fields.appSecret = ''
      fields.verificationToken = ch.feishu.verificationToken || ''
      fields.encryptKey = ch.feishu.encryptKey || ''
    }
    setEditFields(fields)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return
    setEditSaving(true)
    const ch = channels.find(c => c.id === editingId)
    if (!ch) { setEditSaving(false); return }

    const body: Record<string, unknown> = { name: editName }
    switch (ch.type) {
      case 'dingtalk':
        body.dingtalk = {
          appKey: editFields.appKey || ch.dingtalk?.appKey || '',
          appSecret: editFields.appSecret || ch.dingtalk?.appSecret || '',
        }
        break
      case 'feishu':
        body.feishu = {
          appId: editFields.appId || ch.feishu?.appId || '',
          appSecret: editFields.appSecret || ch.feishu?.appSecret || '',
          verificationToken: editFields.verificationToken || ch.feishu?.verificationToken || '',
          encryptKey: editFields.encryptKey !== undefined ? (editFields.encryptKey || undefined) : ch.feishu?.encryptKey,
        }
        break
    }

    try {
      const res = await fetch(`/api/channels?projectId=${encodeURIComponent(projectId)}&channelId=${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setChannels(prev => prev.map(c => c.id === editingId ? { ...c, ...body } as ChannelConfig : c))
        setEditingId(null)
        toast('渠道已更新', 'success')
      } else {
        toast('更新渠道失败', 'error')
      }
    } catch (err) {
      console.error('Failed to update channel:', err)
      toast('更新渠道失败', 'error')
    } finally {
      setEditSaving(false)
    }
  }

  const getWebhookUrl = (ch: ChannelConfig): string => {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    switch (ch.type) {
      case 'dingtalk': return `${base}/api/channels/webhook/dingtalk?key=${ch.dingtalk?.appKey || ''}`
      case 'feishu': return `${base}/api/channels/webhook/feishu?key=${ch.feishu?.appId || ''}`
      case 'wechat': return ch.wechat?.botToken ? `${base}/api/channels/webhook/wechat?key=${ch.wechat.botToken}` : ''
      case 'api': return `${base}/api/channels/webhook/api/message`
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  /** 微信扫码登录 */
  const handleWechatLogin = async (channelId: string) => {
    setQrLogin({ channelId, loading: true, qrcodeUrl: null, qrcode: null, status: '', error: null })
    try {
      const res = await fetch('/api/channels/webhook/wechat/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      if (!res.ok) throw new Error('获取 QR 码失败')
      const { qrcode, qrcodeUrl } = await res.json()
      setQrLogin(prev => ({ ...prev, loading: false, qrcodeUrl, qrcode, status: 'wait' }))
      pollQRCodeStatus(qrcode, channelId)
    } catch (err) {
      setQrLogin(prev => ({ ...prev, loading: false, error: err instanceof Error ? err.message : '未知错误' }))
    }
  }

  /** 轮询 QR 码状态 */
  const pollQRCodeStatus = async (qrcode: string, channelId: string) => {
    const maxAttempts = 120
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch('/api/channels/webhook/wechat/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'poll', qrcode }),
        })
        if (!res.ok) throw new Error('轮询失败')
        const data = await res.json()
        setQrLogin(prev => ({ ...prev, status: data.status || 'wait' }))

        if (data.status === 'confirmed' && data.botToken) {
          await fetch('/api/channels/webhook/wechat/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'save',
              botToken: data.botToken,
              accountId: data.accountId,
              projectId,
              channelId,
            }),
          })
          setQrLogin(prev => ({ ...prev, status: 'confirmed', qrcodeUrl: null }))
          await fetchChannels()
          return
        }

        if (data.status === 'expired' || data.status === 'cancelled') {
          setQrLogin(prev => ({ ...prev, error: 'QR 码已过期，请重新扫码', qrcodeUrl: null }))
          return
        }
      } catch { /* ignore single poll error */ }
      await new Promise(r => setTimeout(r, 1000))
    }
    setQrLogin(prev => ({ ...prev, error: '扫码超时，请重新扫码', qrcodeUrl: null }))
  }

  const renderFieldInput = (label: string, key: string, placeholder: string, isSecret = false) => (
    <div key={key}>
      <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
      <input
        type={isSecret ? 'password' : 'text'}
        value={newFields[key] || ''}
        onChange={e => setNewFields(prev => ({ ...prev, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 rounded-md border text-xs font-mono outline-none transition-colors focus:border-[var(--color-primary)]"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
      />
    </div>
  )

  const renderNewFields = () => {
    switch (newType) {
      case 'dingtalk':
        return (
          <>
            {renderFieldInput('App Key', 'appKey', '钉钉机器人 AppKey')}
            {renderFieldInput('App Secret', 'appSecret', '钉钉机器人 AppSecret', true)}
          </>
        )
      case 'feishu':
        return (
          <>
            {renderFieldInput('App ID', 'appId', '飞书应用 App ID')}
            {renderFieldInput('App Secret', 'appSecret', '飞书应用 App Secret', true)}
            {renderFieldInput('Verification Token', 'verificationToken', '事件订阅验证令牌')}
            {renderFieldInput('Encrypt Key (可选)', 'encryptKey', '事件加密密钥')}
          </>
        )
      case 'wechat':
        return (
          <div className="text-xs py-2" style={{ color: 'var(--color-text-muted)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Smartphone size={12} />
              <span className="font-medium">微信 ClawBot 插件</span>
            </div>
            <p>添加渠道后，通过扫码登录即可接入个人微信。</p>
            <p className="mt-1 opacity-75">需要 iOS 微信 8.0.70+ 版本</p>
          </div>
        )
      case 'api':
        return (
          <div className="text-xs py-2" style={{ color: 'var(--color-text-muted)' }}>
            <p>API Key 将在创建后自动生成。</p>
            <p className="mt-1 opacity-75">第三方系统通过 HTTP API + SSE 与 Agent 交互。</p>
          </div>
        )
    }
  }

  const renderEditFields = (ch: ChannelConfig) => {
    switch (ch.type) {
      case 'dingtalk':
        return (
          <>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>App Key</label>
              <input
                type="text"
                value={editFields.appKey || ''}
                onChange={e => setEditFields(prev => ({ ...prev, appKey: e.target.value }))}
                placeholder="钉钉机器人 AppKey"
                className="w-full px-2.5 py-1.5 rounded-md border text-xs font-mono outline-none transition-colors focus:border-[var(--color-primary)]"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>App Secret</label>
              <input
                type="password"
                value={editFields.appSecret || ''}
                onChange={e => setEditFields(prev => ({ ...prev, appSecret: e.target.value }))}
                placeholder="留空则不修改"
                className="w-full px-2.5 py-1.5 rounded-md border text-xs font-mono outline-none transition-colors focus:border-[var(--color-primary)]"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
            </div>
          </>
        )
      case 'feishu':
        return (
          <>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>App ID</label>
              <input
                type="text"
                value={editFields.appId || ''}
                onChange={e => setEditFields(prev => ({ ...prev, appId: e.target.value }))}
                placeholder="飞书应用 App ID"
                className="w-full px-2.5 py-1.5 rounded-md border text-xs font-mono outline-none transition-colors focus:border-[var(--color-primary)]"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>App Secret</label>
              <input
                type="password"
                value={editFields.appSecret || ''}
                onChange={e => setEditFields(prev => ({ ...prev, appSecret: e.target.value }))}
                placeholder="留空则不修改"
                className="w-full px-2.5 py-1.5 rounded-md border text-xs font-mono outline-none transition-colors focus:border-[var(--color-primary)]"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Verification Token</label>
              <input
                type="text"
                value={editFields.verificationToken || ''}
                onChange={e => setEditFields(prev => ({ ...prev, verificationToken: e.target.value }))}
                placeholder="事件订阅验证令牌"
                className="w-full px-2.5 py-1.5 rounded-md border text-xs font-mono outline-none transition-colors focus:border-[var(--color-primary)]"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Encrypt Key (可选)</label>
              <input
                type="text"
                value={editFields.encryptKey || ''}
                onChange={e => setEditFields(prev => ({ ...prev, encryptKey: e.target.value }))}
                placeholder="事件加密密钥"
                className="w-full px-2.5 py-1.5 rounded-md border text-xs font-mono outline-none transition-colors focus:border-[var(--color-primary)]"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
            </div>
          </>
        )
      case 'wechat':
        return (
          <div className="text-xs py-1" style={{ color: 'var(--color-text-muted)' }}>
            微信渠道凭据通过扫码获取，请使用下方扫码按钮管理。
          </div>
        )
      case 'api':
        return (
          <div className="text-xs py-1" style={{ color: 'var(--color-text-muted)' }}>
            API Key 创建后不可修改，如需更换请删除后重新创建。
          </div>
        )
    }
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="h-16 rounded-lg animate-pulse" style={{ backgroundColor: 'var(--color-bg-secondary)' }} />
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {/* 说明 */}
      <div className="text-xs flex items-start gap-2" style={{ color: 'var(--color-text-muted)' }}>
        <Link2 size={14} className="mt-0.5 flex-shrink-0" />
        <span>绑定渠道后，可通过钉钉、飞书、微信直接与 Agent 对话。</span>
      </div>

      {/* 渠道列表 */}
      {channels.length === 0 && !adding ? (
        <div className="text-center py-6">
          <Link2 size={28} className="mx-auto mb-2" style={{ color: 'var(--color-text-muted)' }} />
          <div className="text-sm" style={{ color: 'var(--color-text-muted)' }}>暂无绑定渠道</div>
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map(ch => {
            const typeInfo = CHANNEL_TYPES.find(t => t.type === ch.type)
            const webhookUrl = getWebhookUrl(ch)
            return (
              <div
                key={ch.id}
                className="p-3 rounded-lg border transition-colors"
                style={{
                  borderColor: ch.enabled ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: ch.enabled ? 'color-mix(in srgb, var(--color-primary) 5%, transparent)' : 'var(--color-bg)',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{typeInfo?.icon}</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{ch.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                      backgroundColor: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-muted)',
                    }}>{typeInfo?.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => editingId === ch.id ? setEditingId(null) : startEdit(ch)}
                      className="p-1 rounded cursor-pointer transition-colors"
                      style={{ color: editingId === ch.id ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
                      title="编辑"
                    >
                      {editingId === ch.id ? <X size={12} /> : <Pencil size={12} />}
                    </button>
                    <button
                      onClick={() => handleToggle(ch)}
                      className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer"
                      style={{ backgroundColor: ch.enabled ? 'var(--color-primary)' : 'var(--color-bg-tertiary)' }}
                    >
                      <span
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                        style={{ transform: ch.enabled ? 'translateX(2px)' : 'translateX(-18px)' }}
                      />
                    </button>
                    <button
                      onClick={() => handleDelete(ch.id)}
                      className="p-1 rounded cursor-pointer transition-colors"
                      style={{ color: 'var(--color-text-muted)' }}
                      title="删除"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                {/* API 渠道：显示 Key + 端点 */}
                {ch.type === 'api' ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>Key:</span>
                      <input
                        readOnly
                        value={ch.api?.apiKey || ''}
                        className="flex-1 min-w-0 px-2 py-1 rounded text-[10px] font-mono border outline-none"
                        style={{
                          borderColor: 'var(--color-border)',
                          backgroundColor: 'var(--color-bg-secondary)',
                          color: 'var(--color-text-muted)',
                        }}
                      />
                      <button
                        onClick={() => copyToClipboard(ch.api?.apiKey || '', `key_${ch.id}`)}
                        className="p-1 rounded cursor-pointer transition-colors flex-shrink-0"
                        style={{ color: 'var(--color-text-muted)' }}
                        title="复制 API Key"
                      >
                        {copiedId === `key_${ch.id}` ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <Copy size={12} />}
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--color-text-muted)' }}>POST:</span>
                      <input
                        readOnly
                        value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/channels/webhook/api/message`}
                        className="flex-1 min-w-0 px-2 py-1 rounded text-[10px] font-mono border outline-none"
                        style={{
                          borderColor: 'var(--color-border)',
                          backgroundColor: 'var(--color-bg-secondary)',
                          color: 'var(--color-text-muted)',
                        }}
                      />
                      <button
                        onClick={() => copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}/api/channels/webhook/api/message`, `url_${ch.id}`)}
                        className="p-1 rounded cursor-pointer transition-colors flex-shrink-0"
                        style={{ color: 'var(--color-text-muted)' }}
                        title="复制端点 URL"
                      >
                        {copiedId === `url_${ch.id}` ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    readOnly
                    value={webhookUrl}
                    className="flex-1 min-w-0 px-2 py-1 rounded text-[10px] font-mono border outline-none"
                    style={{
                      borderColor: 'var(--color-border)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-muted)',
                    }}
                  />
                  <button
                    onClick={() => copyToClipboard(webhookUrl, ch.id)}
                    className="p-1 rounded cursor-pointer transition-colors flex-shrink-0"
                    style={{ color: 'var(--color-text-muted)' }}
                    title="复制 Webhook URL"
                  >
                    {copiedId === ch.id ? <Check size={12} style={{ color: 'var(--color-success)' }} /> : <Copy size={12} />}
                  </button>
                </div>
                )}

                {/* 编辑表单 */}
                {editingId === ch.id && (
                  <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: 'var(--color-border)' }}>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>渠道名称</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md border text-xs outline-none transition-colors focus:border-[var(--color-primary)]"
                        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                      />
                    </div>
                    {renderEditFields(ch)}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleSaveEdit}
                        disabled={!editName.trim() || editSaving}
                        className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
                      >
                        {editSaving ? '保存中...' : '保存'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 rounded-md text-xs border transition-colors cursor-pointer"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}

                {/* 钉钉 Stream 连接状态 */}
                {ch.type === 'dingtalk' && ch.dingtalk?.appKey && (() => {
                  const ds = dingtalkStatus[ch.id]
                  const statusLabel = ds?.status === 'connected' ? '已连接' : ds?.status === 'connecting' ? '连接中...' : ds?.status === 'error' ? '连接异常' : '未连接'
                  const statusColor = ds?.status === 'connected' ? 'var(--color-success, #22c55e)' : ds?.status === 'error' ? 'var(--color-error, #ef4444)' : 'var(--color-text-muted)'
                  return (
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
                        <span style={{ color: statusColor }}>{statusLabel}</span>
                        {ds?.error && <span className="text-[10px]" style={{ color: 'var(--color-error, #ef4444)' }}>({ds.error})</span>}
                      </div>
                      <button
                        onClick={() => handleDingtalkReconnect(ch.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors cursor-pointer"
                        style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                        title="重新连接"
                      >
                        <RefreshCw size={10} />
                        重连
                      </button>
                    </div>
                  )
                })()}

                {/* 微信 QR 码扫码登录区 */}
                {ch.type === 'wechat' && (
                  <div className="mt-2">
                    {/* 连接状态指示 */}
                    {ch.wechat?.botToken && (() => {
                      const ws = wechatStatus[ch.id]
                      const statusLabel = ws?.status === 'connected' ? '已连接' : ws?.status === 'connecting' ? '连接中...' : ws?.status === 'error' ? '连接异常' : '未连接'
                      const statusColor = ws?.status === 'connected' ? 'var(--color-success, #22c55e)' : ws?.status === 'error' ? 'var(--color-error, #ef4444)' : 'var(--color-text-muted)'
                      return (
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
                            <span style={{ color: statusColor }}>{statusLabel}</span>
                            {ws?.error && <span className="text-[10px]" style={{ color: 'var(--color-error, #ef4444)' }}>({ws.error})</span>}
                          </div>
                          <button
                            onClick={() => handleWechatReconnect(ch.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors cursor-pointer"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                            title="重新连接"
                          >
                            <RefreshCw size={10} />
                            重连
                          </button>
                        </div>
                      )
                    })()}

                    {qrLogin.channelId === ch.id && qrLogin.qrcodeUrl ? (
                      <div className="flex flex-col items-center p-3 rounded-lg border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                        <QRCodeSVG value={qrLogin.qrcodeUrl} size={160} level="M" className="rounded" />
                        <p className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
                          <Smartphone size={12} />
                          {qrLogin.status === 'scaned' ? '已扫码，请在手机上确认' : '请使用微信扫描 QR 码登录'}
                        </p>
                      </div>
                    ) : qrLogin.channelId === ch.id && qrLogin.loading ? (
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        <Loader2 size={12} className="animate-spin" />
                        获取 QR 码中...
                      </div>
                    ) : qrLogin.channelId === ch.id && qrLogin.error ? (
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-error, #ef4444)' }}>
                        <AlertCircle size={12} />
                        {qrLogin.error}
                      </div>
                    ) : ch.wechat?.botToken ? (
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-success, #22c55e)' }}>
                        <Check size={12} />
                        已登录
                      </div>
                    ) : null}
                    <button
                      onClick={() => handleWechatLogin(ch.id)}
                      disabled={qrLogin.channelId === ch.id && qrLogin.loading}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-40"
                      style={{ backgroundColor: '#07c160', color: '#fff' }}
                    >
                      <QrCode size={12} />
                      {ch.wechat?.botToken ? '重新扫码' : '扫码登录'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 添加表单 */}
      {adding ? (
        <div className="p-3 rounded-lg border space-y-2.5" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
          <div className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>添加渠道</div>

          {/* 类型选择 */}
          <div className="flex gap-1.5">
            {CHANNEL_TYPES.map(ct => (
              <button
                key={ct.type}
                onClick={() => { setNewType(ct.type); setNewFields({}) }}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs border transition-colors cursor-pointer"
                style={{
                  borderColor: newType === ct.type ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: newType === ct.type ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
                  color: newType === ct.type ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                }}
              >
                <span>{ct.icon}</span> {ct.label}
              </button>
            ))}
          </div>

          {/* 名称 */}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>渠道名称</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="例如：团队钉钉群"
              className="w-full px-2.5 py-1.5 rounded-md border text-xs outline-none transition-colors focus:border-[var(--color-primary)]"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </div>

          {/* 平台字段 */}
          {renderNewFields()}

          {/* 按钮 */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
            >
              确认添加
            </button>
            <button
              onClick={() => { setAdding(false); setNewName(''); setNewFields({}) }}
              className="px-3 py-1.5 rounded-md text-xs border transition-colors cursor-pointer"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors cursor-pointer"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg)' }}
        >
          <Plus size={14} />
          添加渠道
        </button>
      )}

      {/* 刷新 */}
      <button
        onClick={fetchChannels}
        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <RefreshCw size={12} />
        刷新
      </button>
    </div>
  )
}
