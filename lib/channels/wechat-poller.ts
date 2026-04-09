/**
 * 微信个人号长轮询服务
 * 通过 ilink getUpdates 长轮询接收消息，全局单例
 * 登录成功后启动，收到消息后调用 Agent 处理并回复
 */

import fs from 'fs/promises'
import path from 'path'
import {
  getUpdates,
  sendWechatMessage,
  parseWeixinMessage,
  MessageType,
  type WeixinMessage,
  type GetUpdatesResp,
  type ParsedWeixinMessage,
} from './wechat'
import { handleChannelMessage } from './channel-service'
import type { ChannelConfig } from '@/types/channels'

/** syncBuf 持久化目录 */
const DATA_ROOT = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')
const DATA_DIR = path.join(DATA_ROOT, 'wechat')
const SYNC_BUF_FILE = path.join(DATA_DIR, '_sync_buf.json')

/** 连续失败 backoff */
const MAX_CONSECUTIVE_FAILURES = 3
const BACKOFF_DELAY_MS = 30_000

export type WechatConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface WechatConnection {
  projectId: string
  channel: ChannelConfig
  status: WechatConnectionStatus
  abortController: AbortController | null
  syncBuf: string | undefined
  pollTimeoutMs: number | undefined
  /** 缓存 context_token（回复时需要） */
  contextTokenCache: Map<string, string>
  /** 已处理消息 ID 去重 */
  processedMessageIds: Set<string>
  error?: string
}

class WechatPollerService {
  /** key = `${projectId}:${channelId}` */
  private connections = new Map<string, WechatConnection>()
  private readonly MAX_CACHED_IDS = 500

  /**
   * 启动长轮询连接
   */
  async connect(projectId: string, channel: ChannelConfig): Promise<void> {
    const key = `${projectId}:${channel.id}`
    const botToken = channel.wechat?.botToken

    if (!botToken) {
      throw new Error('未配置 botToken，请先扫码登录')
    }

    // 已有连接先断开
    const existing = this.connections.get(key)
    if (existing?.abortController) {
      existing.abortController.abort()
    }

    const syncBuf = await this.loadSyncBuf(key)

    const conn: WechatConnection = {
      projectId,
      channel,
      status: 'connecting',
      abortController: new AbortController(),
      syncBuf,
      pollTimeoutMs: undefined,
      contextTokenCache: new Map(),
      processedMessageIds: new Set(),
    }

    this.connections.set(key, conn)

    console.log(`[WechatPoller] 启动长轮询: ${key}, hasSyncBuf=${!!syncBuf}`)

    // 启动轮询循环（不阻塞返回）
    this.pollLoop(key, conn, botToken).catch((err) => {
      if (!conn.abortController?.signal.aborted) {
        console.error(`[WechatPoller] ${key} 轮询异常退出:`, err)
      }
      conn.status = 'error'
      conn.error = err instanceof Error ? err.message : String(err)
    })
  }

  /**
   * 断开连接
   */
  disconnect(projectId: string, channelId: string): void {
    const key = `${projectId}:${channelId}`
    const conn = this.connections.get(key)
    if (conn) {
      conn.abortController?.abort()
      conn.abortController = null
      conn.status = 'disconnected'
      console.log(`[WechatPoller] 已断开: ${key}`)
    }
  }

  /**
   * 获取连接状态
   */
  getStatus(projectId: string, channelId: string): { status: WechatConnectionStatus; error?: string } {
    const key = `${projectId}:${channelId}`
    const conn = this.connections.get(key)
    if (!conn) return { status: 'disconnected' }
    return { status: conn.status, error: conn.error }
  }

  /**
   * 获取所有连接状态
   */
  getAllStatuses(): Array<{ key: string; projectId: string; channelId: string; status: WechatConnectionStatus; error?: string }> {
    const result: Array<{ key: string; projectId: string; channelId: string; status: WechatConnectionStatus; error?: string }> = []
    for (const [key, conn] of this.connections) {
      const [projectId, channelId] = key.split(':')
      result.push({ key, projectId, channelId, status: conn.status, error: conn.error })
    }
    return result
  }

  /**
   * 长轮询主循环
   */
  private async pollLoop(key: string, conn: WechatConnection, token: string): Promise<void> {
    let consecutiveFailures = 0
    let pollCount = 0

    conn.status = 'connected'

    while (!conn.abortController?.signal.aborted) {
      pollCount++
      try {
        const resp = await getUpdates({
          token,
          syncBuf: conn.syncBuf,
          longpollingTimeoutMs: conn.pollTimeoutMs,
          signal: conn.abortController?.signal,
        })

        consecutiveFailures = 0

        // 检查会话过期
        if (resp.errcode === -14) {
          console.error(`[WechatPoller] ${key} 会话过期 (errcode=-14)，需重新扫码`)
          conn.status = 'error'
          conn.error = '会话已过期，请重新扫码登录'
          return
        }

        if ((resp.ret && resp.ret !== 0) || (resp.errcode && resp.errcode !== 0)) {
          console.warn(`[WechatPoller] ${key} 轮询 #${pollCount} 异常: ret=${resp.ret}, errcode=${resp.errcode}`)
        }

        // 更新 syncBuf
        if (resp.get_updates_buf) {
          conn.syncBuf = resp.get_updates_buf
          await this.saveSyncBuf(key, resp.get_updates_buf)
        }

        // 动态调整超时
        if (resp.longpolling_timeout_ms) {
          conn.pollTimeoutMs = resp.longpolling_timeout_ms
        }

        // 处理消息
        if (resp.msgs && resp.msgs.length > 0) {
          for (const msg of resp.msgs) {
            // 只处理用户消息
            if (msg.message_type !== MessageType.USER) continue

            // 去重
            const msgKey = String(msg.message_id || msg.seq || `${msg.from_user_id}_${msg.create_time_ms}`)
            if (conn.processedMessageIds.has(msgKey)) continue
            conn.processedMessageIds.add(msgKey)
            if (conn.processedMessageIds.size > this.MAX_CACHED_IDS) {
              const first = conn.processedMessageIds.values().next().value
              if (first) conn.processedMessageIds.delete(first)
            }

            // 缓存 context_token
            const senderId = msg.from_user_id || ''
            if (msg.context_token && senderId) {
              conn.contextTokenCache.set(senderId, msg.context_token)
            }

            // 解析消息
            const parsed = parseWeixinMessage(msg)
            if (!parsed) continue

            console.log(`[WechatPoller] ${key} 收到消息: from=${parsed.senderId}, type=${parsed.messageType}, text=${parsed.text.substring(0, 50)}`)

            // 异步处理（不阻塞轮询循环）
            this.handleMessage(key, conn, token, parsed).catch(err => {
              console.error(`[WechatPoller] ${key} 消息处理失败:`, err)
            })
          }
        }
      } catch (err) {
        if (conn.abortController?.signal.aborted) break

        consecutiveFailures++
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[WechatPoller] ${key} 轮询 #${pollCount} 失败 (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, errMsg)

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.warn(`[WechatPoller] ${key} 连续失败 ${MAX_CONSECUTIVE_FAILURES} 次，等待 ${BACKOFF_DELAY_MS / 1000}s`)
          await this.sleep(BACKOFF_DELAY_MS, conn)
          consecutiveFailures = 0
        } else {
          await this.sleep(2000, conn)
        }
      }
    }

    console.log(`[WechatPoller] ${key} 轮询结束, 共 ${pollCount} 次`)
    if (conn.status === 'connected') conn.status = 'disconnected'
  }

  /**
   * 处理单条消息：调用 Agent + 回复
   */
  private async handleMessage(
    key: string,
    conn: WechatConnection,
    token: string,
    parsed: ParsedWeixinMessage,
  ): Promise<void> {
    // 构建传给 Agent 的文本（多媒体消息附加额外上下文）
    let agentInput = parsed.text
    if (parsed.messageType === 'voice' && parsed.voicePayload) {
      agentInput = `[语音消息] ${parsed.text}`
      if (parsed.voicePayload.duration) {
        agentInput += ` (时长: ${parsed.voicePayload.duration}秒)`
      }
    } else if (parsed.messageType === 'image' && parsed.imagePayload) {
      agentInput = `[图片消息]`
      if (parsed.imagePayload.imageUrl) {
        agentInput += ` 图片URL: ${parsed.imagePayload.imageUrl}`
      }
      if (parsed.imagePayload.width && parsed.imagePayload.height) {
        agentInput += ` (${parsed.imagePayload.width}x${parsed.imagePayload.height})`
      }
    } else if (parsed.messageType === 'file' && parsed.filePayload) {
      agentInput = `[文件消息] ${parsed.filePayload.fileName}`
      if (parsed.filePayload.fileUrl) {
        agentInput += ` 文件URL: ${parsed.filePayload.fileUrl}`
      }
    }

    // 构建附件列表（用于前端 UI 展示）
    const attachments: import('@/types/chat').ChatAttachment[] = []
    if (parsed.messageType === 'image' && parsed.imagePayload?.imageUrl) {
      attachments.push({
        id: `att_${Date.now()}_img`,
        filename: 'image.jpg',
        mimeType: 'image/jpeg',
        size: parsed.imagePayload.size || 0,
        url: parsed.imagePayload.imageUrl,
        type: 'image',
      })
    } else if (parsed.messageType === 'file' && parsed.filePayload?.fileUrl) {
      attachments.push({
        id: `att_${Date.now()}_file`,
        filename: parsed.filePayload.fileName || 'file',
        mimeType: parsed.filePayload.fileType || 'application/octet-stream',
        size: parsed.filePayload.size || 0,
        url: parsed.filePayload.fileUrl,
        type: 'file',
      })
    }

    // 调用 Agent 获取回复
    const reply = await handleChannelMessage(conn.projectId, conn.channel, agentInput, attachments.length > 0 ? attachments : undefined)

    // 通过 ilink API 回复
    const contextToken = conn.contextTokenCache.get(parsed.senderId)
    const success = await sendWechatMessage({
      token,
      toUserId: parsed.senderId,
      content: reply,
      contextToken,
    })

    if (success) {
      console.log(`[WechatPoller] ${key} 回复成功: to=${parsed.senderId}`)
    } else {
      console.error(`[WechatPoller] ${key} 回复失败: to=${parsed.senderId}`)
    }
  }

  // ======================== syncBuf 持久化 ========================

  private async loadSyncBuf(key: string): Promise<string | undefined> {
    try {
      const file = path.join(DATA_DIR, `syncbuf_${key.replace(':', '_')}.json`)
      const data = await fs.readFile(file, 'utf8')
      const parsed = JSON.parse(data)
      return parsed.syncBuf
    } catch {
      return undefined
    }
  }

  private async saveSyncBuf(key: string, buf: string): Promise<void> {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true })
      const file = path.join(DATA_DIR, `syncbuf_${key.replace(':', '_')}.json`)
      await fs.writeFile(file, JSON.stringify({ syncBuf: buf, updatedAt: new Date().toISOString() }), 'utf8')
    } catch (err) {
      console.warn(`[WechatPoller] 保存 syncBuf 失败:`, err)
    }
  }

  private sleep(ms: number, conn: WechatConnection): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms)
      const onAbort = () => { clearTimeout(timer); resolve() }
      conn.abortController?.signal.addEventListener('abort', onAbort, { once: true })
    })
  }
}

/** 全局单例（挂载到 globalThis 防止 Next.js HMR 重建丢失） */
const GLOBAL_KEY = '__gclaw_wechat_poller__'
export const wechatPoller: WechatPollerService =
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] as WechatPollerService ??
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] = new WechatPollerService())
