/**
 * 微信个人号 ilink 协议 API + 消息处理
 * 基于 @tencent-weixin/openclaw-weixin 插件协议
 * 支持文本、语音、图片、文件消息的接收和发送
 */

import crypto from 'crypto'
import type { WechatConfig } from '@/types/channels'

/** ilink API 基础 URL */
export const ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com'
/** CDN 基础 URL（图片/语音/文件下载） */
export const CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c'

/** API 超时 */
const API_TIMEOUT_MS = 15_000
/** 长轮询默认超时 */
export const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000
/** 微信文本消息长度限制 */
const TEXT_CHUNK_LIMIT = 4000

/** channel_version 标识 */
const CHANNEL_VERSION = '1.0.0'

/** 消息类型 */
export const MessageType = { USER: 1, BOT: 2 } as const
/** 消息内容类型 */
export const MessageItemType = { TEXT: 1, IMAGE: 2, VOICE: 3, FILE: 4, VIDEO: 5 } as const
/** 消息状态 */
export const MessageState = { NEW: 0, GENERATING: 1, FINISH: 2 } as const

// ======================== 类型定义 ========================

/** 加密媒体信息 */
interface MediaInfo {
  encrypt_query_param?: string
  aes_key?: string
}

/** 消息内容项 */
interface MessageItem {
  type?: number
  text_item?: { text?: string }
  image_item?: {
    url?: string
    width?: number
    height?: number
    size?: number
    media?: MediaInfo
  }
  voice_item?: {
    url?: string
    length?: number
    format?: string
    size?: number
    media?: MediaInfo
    encode_type?: number
    sample_rate?: number
    playtime?: number
    text?: string
  }
  file_item?: {
    file_url?: string
    file_name?: string
    file_size?: number
    media?: MediaInfo
  }
}

/** 微信消息 */
export interface WeixinMessage {
  seq?: number
  message_id?: number
  from_user_id?: string
  to_user_id?: string
  client_id?: string
  create_time_ms?: number
  session_id?: string
  message_type?: number
  message_state?: number
  item_list?: MessageItem[]
  context_token?: string
  /** 顶层消息类型（新格式单条消息） */
  type?: number
  /** 顶层语音（新格式） */
  voice_item?: {
    url?: string
    length?: number
    format?: string
    size?: number
    media?: MediaInfo
    encode_type?: number
    sample_rate?: number
    playtime?: number
    text?: string
  }
  /** 顶层图片（新格式） */
  image_item?: {
    url?: string
    width?: number
    height?: number
    size?: number
    media?: MediaInfo
  }
  /** 顶层文件（新格式） */
  file_item?: {
    url?: string
    file_url?: string
    file_name?: string
    file_size?: number
    media?: MediaInfo
  }
}

/** getUpdates 响应 */
export interface GetUpdatesResp {
  ret?: number
  errcode?: number
  errmsg?: string
  msgs?: WeixinMessage[]
  get_updates_buf?: string
  longpolling_timeout_ms?: number
}

/** 解析后的标准消息 */
export interface ParsedWeixinMessage {
  text: string
  senderId: string
  sessionId: string
  messageId: string
  messageType: 'text' | 'image' | 'voice' | 'file' | 'unsupported'
  voicePayload?: {
    voiceUrl: string
    format: string
    duration?: number
    size?: number
    aesKey?: string
    sampleRate?: number
  }
  imagePayload?: {
    imageUrl: string
    width?: number
    height?: number
    size?: number
    aesKey?: string
  }
  filePayload?: {
    fileUrl: string
    fileName: string
    size?: number
    fileType: string
    aesKey?: string
  }
}

// ======================== 请求头 ========================

function buildHeaders(opts: { token?: string; body?: string }): Record<string, string> {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0)
  const wechatUin = Buffer.from(String(uint32), 'utf-8').toString('base64')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'AuthorizationType': 'ilink_bot_token',
    'X-WECHAT-UIN': wechatUin,
  }

  if (opts.body) {
    headers['Content-Length'] = String(Buffer.byteLength(opts.body, 'utf-8'))
  }

  if (opts.token?.trim()) {
    headers['Authorization'] = `Bearer ${opts.token.trim()}`
  }

  return headers
}

// ======================== QR 码登录 ========================

export async function getLoginQRCode(): Promise<{ qrcode: string; qrcodeUrl: string }> {
  const url = `${ILINK_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

  try {
    const resp = await fetch(url, { signal: controller.signal })
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`获取 QR 码失败: ${resp.status} ${text}`)
    }
    const data = (await resp.json()) as { qrcode?: string; qrcode_img_content?: string }
    const qrcode = data.qrcode || ''
    const qrcodeUrl = data.qrcode_img_content || ''
    if (!qrcode || !qrcodeUrl) throw new Error('QR 码返回不完整')
    console.log(`[WeChat] QR 码获取成功, qrcode=${qrcode.substring(0, 20)}...`)
    return { qrcode, qrcodeUrl }
  } finally {
    clearTimeout(timeout)
  }
}

export async function pollLoginStatus(qrcode: string): Promise<{
  status: 'wait' | 'scaned' | 'confirmed' | 'expired' | 'cancelled'
  botToken?: string
  accountId?: string
}> {
  const url = `${ILINK_BASE_URL}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_LONG_POLL_TIMEOUT_MS)

  try {
    const resp = await fetch(url, {
      headers: { 'iLink-App-ClientVersion': '1' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`轮询失败: ${resp.status} ${text}`)
    }
    const data = (await resp.json()) as { status?: string; bot_token?: string; ilink_bot_id?: string }
    return {
      status: (data.status as 'wait' | 'scaned' | 'confirmed' | 'expired' | 'cancelled') || 'wait',
      botToken: data.bot_token,
      accountId: data.ilink_bot_id,
    }
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === 'AbortError') return { status: 'wait' }
    throw err
  }
}

// ======================== 消息收发 ========================

export async function getUpdates(params: {
  token: string
  syncBuf?: string
  longpollingTimeoutMs?: number
  signal?: AbortSignal
}): Promise<GetUpdatesResp> {
  const timeoutMs = params.longpollingTimeoutMs || DEFAULT_LONG_POLL_TIMEOUT_MS
  const reqBody = {
    get_updates_buf: params.syncBuf ?? '',
    longpolling_timeout_ms: timeoutMs,
    base_info: { channel_version: CHANNEL_VERSION },
  }
  const bodyStr = JSON.stringify(reqBody)
  const headers = buildHeaders({ token: params.token, body: bodyStr })

  const controller = new AbortController()
  const fetchTimeout = setTimeout(() => controller.abort(), timeoutMs + 10_000)
  const onExternalAbort = () => controller.abort()
  params.signal?.addEventListener('abort', onExternalAbort)

  try {
    const resp = await fetch(`${ILINK_BASE_URL}/ilink/bot/getupdates`, {
      method: 'POST', headers, body: bodyStr, signal: controller.signal,
    })
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`getUpdates 失败: ${resp.status} ${text}`)
    }
    return (await resp.json()) as GetUpdatesResp
  } finally {
    clearTimeout(fetchTimeout)
    params.signal?.removeEventListener('abort', onExternalAbort)
  }
}

/**
 * 发送文本消息（自动分片）
 */
export async function sendWechatMessage(params: {
  token: string
  toUserId: string
  content: string
  contextToken?: string
}): Promise<boolean> {
  // 去除 Markdown 标记
  const plainText = stripMarkdown(params.content)
  // 按长度限制分片
  const chunks = splitMessage(plainText, TEXT_CHUNK_LIMIT)

  let allSuccess = true
  for (const chunk of chunks) {
    const clientId = `gclaw-wx-${crypto.randomBytes(8).toString('hex')}`
    const reqBody = {
      msg: {
        to_user_id: params.toUserId,
        from_user_id: '',
        client_id: clientId,
        message_type: MessageType.BOT,
        message_state: MessageState.FINISH,
        context_token: params.contextToken,
        item_list: [{ type: MessageItemType.TEXT, text_item: { text: chunk } }],
      },
      base_info: { channel_version: CHANNEL_VERSION },
    }

    try {
      const bodyStr = JSON.stringify(reqBody)
      const headers = buildHeaders({ token: params.token, body: bodyStr })
      const res = await fetch(`${ILINK_BASE_URL}/ilink/bot/sendmessage`, {
        method: 'POST', headers, body: bodyStr, signal: AbortSignal.timeout(API_TIMEOUT_MS),
      })
      if (!res.ok) {
        const errText = await res.text()
        console.error(`[WeChat] sendMessage 失败: ${res.status} ${errText}`)
        allSuccess = false
      } else {
        console.log(`[WeChat] 消息发送成功: to=${params.toUserId}, clientId=${clientId}, len=${chunk.length}`)
      }
    } catch (err) {
      console.error('[WeChat] sendMessage 异常:', err)
      allSuccess = false
    }

    // 多片间短暂延迟避免触发频控
    if (chunks.length > 1) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  return allSuccess
}

// ======================== 消息解析（完整多媒体支持） ========================

/**
 * 构建 CDN 下载 URL
 */
function buildMediaUrl(media?: MediaInfo, fallbackUrl?: string): string {
  if (media?.encrypt_query_param) {
    return `${CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(media.encrypt_query_param)}`
  }
  if (fallbackUrl) {
    return fallbackUrl.startsWith('http') ? fallbackUrl : `${CDN_BASE_URL}/${fallbackUrl}`
  }
  return ''
}

/**
 * 从 WeixinMessage 中解析完整消息（文本/语音/图片/文件）
 */
export function parseWeixinMessage(msg: WeixinMessage): ParsedWeixinMessage | null {
  let text = ''
  let messageType: ParsedWeixinMessage['messageType'] = 'unsupported'
  let voicePayload: ParsedWeixinMessage['voicePayload']
  let imagePayload: ParsedWeixinMessage['imagePayload']
  let filePayload: ParsedWeixinMessage['filePayload']

  // ===== 1. 顶层 type + voice_item（新格式语音） =====
  if (msg.type === MessageItemType.VOICE && msg.voice_item) {
    messageType = 'voice'
    const vi = msg.voice_item
    const voiceUrl = buildMediaUrl(vi.media, vi.url)
    voicePayload = {
      voiceUrl,
      format: vi.encode_type === 4 ? 'silk' : (vi.format || 'silk'),
      duration: vi.playtime ? Math.round(vi.playtime / 1000) : (vi.length ? Math.round(vi.length / 1000) : undefined),
      size: vi.size,
      aesKey: vi.media?.aes_key,
      sampleRate: vi.sample_rate,
    }
    text = vi.text || '[语音消息]'
    console.log(`[WeChat] 语音(顶层): transcription="${vi.text || ''}", duration=${voicePayload.duration}s`)
  }
  // ===== 2. 顶层 type + image_item（新格式图片） =====
  else if (msg.type === MessageItemType.IMAGE && msg.image_item) {
    messageType = 'image'
    const ii = msg.image_item
    const imageUrl = buildMediaUrl(ii.media, ii.url)
    imagePayload = {
      imageUrl,
      width: ii.width,
      height: ii.height,
      size: ii.size,
      aesKey: ii.media?.aes_key,
    }
    text = '[图片消息]'
    console.log(`[WeChat] 图片(顶层): ${ii.width}x${ii.height}, hasUrl=${!!imageUrl}`)
  }
  // ===== 3. 顶层 type + file_item（新格式文件） =====
  else if (msg.type === MessageItemType.FILE && msg.file_item) {
    messageType = 'file'
    const fi = msg.file_item
    const fileUrl = buildMediaUrl(fi.media, fi.file_url || fi.url)
    const fileName = fi.file_name || 'unknown'
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    filePayload = {
      fileUrl,
      fileName,
      size: fi.file_size,
      fileType: ext,
      aesKey: fi.media?.aes_key,
    }
    text = `[文件] ${fileName}`
    console.log(`[WeChat] 文件(顶层): name=${fileName}, size=${fi.file_size}`)
  }
  // ===== 4. item_list 格式（旧格式/多内容项） =====
  else if (msg.item_list && msg.item_list.length > 0) {
    for (const item of msg.item_list) {
      if (item.type === MessageItemType.TEXT && item.text_item?.text) {
        text += item.text_item.text
        messageType = 'text'
      } else if (item.type === MessageItemType.VOICE && item.voice_item) {
        messageType = 'voice'
        const vi = item.voice_item
        const voiceUrl = buildMediaUrl(vi.media, vi.url)
        voicePayload = {
          voiceUrl,
          format: vi.encode_type === 4 ? 'silk' : (vi.format || 'silk'),
          duration: vi.playtime ? Math.round(vi.playtime / 1000) : (vi.length ? Math.round(vi.length / 1000) : undefined),
          size: vi.size,
          aesKey: vi.media?.aes_key,
          sampleRate: vi.sample_rate,
        }
        text = vi.text || '[语音消息]'
        console.log(`[WeChat] 语音(item_list): transcription="${vi.text || ''}", duration=${voicePayload.duration}s`)
      } else if (item.type === MessageItemType.IMAGE && item.image_item) {
        messageType = 'image'
        const ii = item.image_item
        const imageUrl = buildMediaUrl(ii.media, ii.url)
        imagePayload = {
          imageUrl,
          width: ii.width,
          height: ii.height,
          size: ii.size,
          aesKey: ii.media?.aes_key,
        }
        text = '[图片消息]'
        console.log(`[WeChat] 图片(item_list): ${ii.width}x${ii.height}`)
      } else if (item.type === MessageItemType.FILE && item.file_item) {
        messageType = 'file'
        const fi = item.file_item
        const fileUrl = buildMediaUrl(fi.media, fi.file_url)
        const fileName = fi.file_name || 'unknown'
        const ext = fileName.split('.').pop()?.toLowerCase() || ''
        filePayload = {
          fileUrl,
          fileName,
          size: fi.file_size,
          fileType: ext,
          aesKey: fi.media?.aes_key,
        }
        text = `[文件] ${fileName}`
        console.log(`[WeChat] 文件(item_list): name=${fileName}`)
      }
    }
  }

  text = text.trim()
  if (!text && messageType === 'unsupported') return null
  // 图片/文件等即使没有文本也要传递
  if (!text) text = `[${messageType}消息]`

  return {
    text,
    senderId: msg.from_user_id || '',
    sessionId: msg.session_id || '',
    messageId: String(msg.message_id || msg.seq || ''),
    messageType,
    voicePayload,
    imagePayload,
    filePayload,
  }
}

// ======================== 文本格式化 ========================

/**
 * 去除 Markdown 标记，返回纯文本（微信不支持 Markdown 渲染）
 */
export function stripMarkdown(text: string): string {
  return text
    // 图片链接 ![alt](url) → alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // 超链接 [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // 标题 ### heading → heading
    .replace(/^#{1,6}\s+/gm, '')
    // 粗体 **text** / __text__
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // 斜体 *text* / _text_
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // 删除线 ~~text~~
    .replace(/~~(.+?)~~/g, '$1')
    // 行内代码 `code`
    .replace(/`([^`]+)`/g, '$1')
    // 代码块 ```...```（保留内容）
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```\w*\n?/g, '').replace(/```/g, ''))
    // 列表标记
    .replace(/^[\s]*[-*+]\s+/gm, '• ')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // 块引用 > text
    .replace(/^>\s+/gm, '')
    // 水平线
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // 清理多余空行
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 按长度限制分片（优先在换行符处分割）
 */
export function splitMessage(text: string, limit: number): string[] {
  if (text.length <= limit) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining)
      break
    }

    // 在 limit 内找最后一个换行符
    let splitAt = remaining.lastIndexOf('\n', limit)
    if (splitAt < limit * 0.3) {
      // 换行符太靠前，回退到硬切
      splitAt = limit
    }

    chunks.push(remaining.substring(0, splitAt))
    remaining = remaining.substring(splitAt).replace(/^\n/, '')
  }

  return chunks
}

// ======================== Webhook 兼容 ========================

export function verifyClawBotRequest(authHeader: string | null, config: WechatConfig): boolean {
  if (!authHeader || !config.botToken) return false
  return authHeader === `Bearer ${config.botToken}`
}

export function parseClawBotMessage(body: Record<string, unknown>): {
  text: string; fromUser: string; conversationId: string; messageId: string
} {
  const msg = (body.msg as Record<string, unknown>) || body
  const itemList = (msg.item_list as Array<Record<string, unknown>>) || []
  let text = ''
  for (const item of itemList) {
    const textItem = item.text_item as Record<string, unknown> | undefined
    if (textItem?.text) text += (textItem.text as string)
  }
  if (!text) text = (body.text as string) || (body.content as string) || ''
  return {
    text,
    fromUser: (msg.from_user_id as string) || (body.fromUser as string) || '',
    conversationId: (msg.session_id as string) || (body.conversationId as string) || '',
    messageId: String(msg.message_id || body.messageId || ''),
  }
}
