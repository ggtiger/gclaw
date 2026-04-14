/**
 * 钉钉 Stream 长连接服务
 * 使用 dingtalk-stream-sdk-nodejs 通过 WebSocket 接收机器人消息
 * 全局单例模式（globalThis.__gclaw_dingtalk_stream__）
 */

import {
  DWClient,
  DWClientDownStream,
  EventAck,
  TOPIC_ROBOT,
} from 'dingtalk-stream-sdk-nodejs'
import { handleChannelMessage } from './channel-service'
import { replyDingtalk, getAccessToken } from './dingtalk'
import type { ChannelConfig } from '@/types/channels'
import type { ChatAttachment } from '@/types/chat'
import { logger } from '@/lib/logger'

export type DingtalkStreamStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface DingtalkConnection {
  projectId: string
  channel: ChannelConfig
  status: DingtalkStreamStatus
  client: DWClient | null
  /** 已处理消息 ID 去重 */
  processedMessageIds: Set<string>
  error?: string
}

interface RobotMessage {
  msgtype: string
  text?: { content: string }
  /** Stream 模式下的 content 字段 */
  content?: {
    downloadCode?: string
    pictureDownloadCode?: string
    fileName?: string
    fileSize?: number
    fileType?: string
    /** 富文本内容数组，每个元素是 text 或 picture */
    richText?: Array<{
      type?: string
      text?: string
      downloadCode?: string
      pictureDownloadCode?: string
    }>
  }
  msgId: string
  senderId: string
  senderStaffId?: string
  senderNick: string
  conversationId: string
  conversationType: string
  sessionWebhook?: string
  sessionWebhookExpiredTime?: number
  createAt: number
}

class DingtalkStreamService {
  /** key = `${projectId}:${channelId}` */
  private connections = new Map<string, DingtalkConnection>()
  private readonly MAX_CACHED_IDS = 500

  /**
   * 建立 Stream 连接
   */
  async connect(projectId: string, channel: ChannelConfig): Promise<void> {
    const key = `${projectId}:${channel.id}`
    const appKey = channel.dingtalk?.appKey
    const appSecret = channel.dingtalk?.appSecret

    if (!appKey || !appSecret) {
      throw new Error('未配置 appKey 或 appSecret')
    }

    // 已有连接先断开
    await this.disconnect(projectId, channel.id)

    const conn: DingtalkConnection = {
      projectId,
      channel,
      status: 'connecting',
      client: null,
      processedMessageIds: new Set(),
    }
    this.connections.set(key, conn)

    const client = new DWClient({
      clientId: appKey,
      clientSecret: appSecret,
      keepAlive: true,
    })
    ;(client as unknown as Record<string, unknown>).debug = false

    // 注册机器人消息回调
    client.registerCallbackListener(TOPIC_ROBOT, (downstream: DWClientDownStream) => {
      const messageId = downstream.headers?.messageId || ''

      // 先发 ACK
      try {
        client.send(messageId, { status: EventAck.SUCCESS })
      } catch (err) {
        logger.warn(`[DingtalkStream] ACK 失败:`, err instanceof Error ? err.message : err)
      }

      // 消息去重 — 优先用 body 中的 msgId
      let bodyMsgId = messageId
      let data: RobotMessage | null = null
      try {
        data = JSON.parse(downstream.data) as RobotMessage
        if (data.msgId) bodyMsgId = data.msgId
      } catch { /* ignore */ }

      if (conn.processedMessageIds.has(bodyMsgId)) return
      conn.processedMessageIds.add(bodyMsgId)
      if (conn.processedMessageIds.size > this.MAX_CACHED_IDS) {
        const first = conn.processedMessageIds.values().next().value
        if (first) conn.processedMessageIds.delete(first)
      }

      // 解析消息
      const parsed = this.parseMessage(data)
      if (!parsed) {
        // 记录未识别的消息类型，方便排查
        if (data?.msgtype) {
          logger.info(`[DingtalkStream] ${key} 未处理消息类型: msgtype=${data.msgtype}, raw=${JSON.stringify(data)}`)
        }
        return
      }

      const sessionWebhook = data?.sessionWebhook || null
      const senderStaffId = data?.senderStaffId || data?.senderId || ''

      logger.info(`[DingtalkStream] ${key} 收到消息: from=${data?.senderNick || 'unknown'}, type=${parsed.type}, text=${parsed.text.substring(0, 50)}, attachments=${parsed.attachments.length}`)

      // 异步处理（含图片下载）
      this.processMessage(key, conn, parsed, sessionWebhook, senderStaffId).catch(err => {
        logger.error(`[DingtalkStream] ${key} 消息处理失败:`, err)
      })
    })

    try {
      await client.connect()
      conn.client = client
      conn.status = 'connected'
      logger.info(`[DingtalkStream] ${key} Stream 连接已建立`)
    } catch (err) {
      conn.status = 'error'
      conn.error = err instanceof Error ? err.message : String(err)
      logger.error(`[DingtalkStream] ${key} 连接失败:`, conn.error)
      throw err
    }
  }

  /**
   * 断开连接
   */
  async disconnect(projectId: string, channelId: string): Promise<void> {
    const key = `${projectId}:${channelId}`
    const conn = this.connections.get(key)
    if (conn?.client) {
      try {
        conn.client.disconnect()
      } catch { /* ignore */ }
      conn.client = null
    }
    if (conn) {
      conn.status = 'disconnected'
    }
    logger.info(`[DingtalkStream] 已断开: ${key}`)
  }

  /**
   * 获取连接状态
   */
  getStatus(projectId: string, channelId: string): { status: DingtalkStreamStatus; error?: string } {
    const key = `${projectId}:${channelId}`
    const conn = this.connections.get(key)
    if (!conn) return { status: 'disconnected' }
    return { status: conn.status, error: conn.error }
  }

  /**
   * 获取所有连接状态
   */
  getAllStatuses(): Array<{ key: string; projectId: string; channelId: string; status: DingtalkStreamStatus; error?: string }> {
    const result: Array<{ key: string; projectId: string; channelId: string; status: DingtalkStreamStatus; error?: string }> = []
    for (const [key, conn] of this.connections) {
      const [projectId, channelId] = key.split(':')
      result.push({ key, projectId, channelId, status: conn.status, error: conn.error })
    }
    return result
  }

  /**
   * 解析钉钉 Stream 消息
   * Stream 模式实际格式：
   *   - text:     { msgtype:"text", text:{content:"xxx"} }
   *   - picture:  { msgtype:"picture", content:{downloadCode:"xxx"} }
   *   - richText: { msgtype:"richText", content:{richText:[{type:"picture",downloadCode:"xxx"},{text:"xxx"}]} }
   *   - file:     { msgtype:"file", content:{downloadCode:"xxx",fileName:"xxx"} }
   */
  private parseMessage(data: RobotMessage | null): {
    type: string
    text: string
    attachments: Array<{ downloadCode: string; attachmentType: 'image' | 'file'; fileName: string }>
  } | null {
    if (!data) return null

    // 纯文本
    if (data.msgtype === 'text') {
      const text = data.text?.content?.trim() || ''
      if (text) return { type: 'text', text, attachments: [] }
      return null
    }

    // 纯图片
    if (data.msgtype === 'picture' && data.content?.downloadCode) {
      return {
        type: 'picture',
        text: '',
        attachments: [{ downloadCode: data.content.downloadCode, attachmentType: 'image', fileName: 'image.jpg' }],
      }
    }

    // 文件
    if (data.msgtype === 'file' && data.content?.downloadCode) {
      return {
        type: 'file',
        text: '',
        attachments: [{
          downloadCode: data.content.downloadCode,
          attachmentType: 'file',
          fileName: data.content.fileName || 'file',
        }],
      }
    }

    // 富文本（可能含文字+图片混合）
    if (data.msgtype === 'richText' && data.content?.richText && Array.isArray(data.content.richText)) {
      const textParts: string[] = []
      const attachments: Array<{ downloadCode: string; attachmentType: 'image' | 'file'; fileName: string }> = []

      for (const item of data.content.richText) {
        if (item.text) {
          textParts.push(item.text)
        }
        if (item.downloadCode) {
          const attType = item.type === 'picture' ? 'image' as const : 'file' as const
          attachments.push({
            downloadCode: item.downloadCode,
            attachmentType: attType,
            fileName: attType === 'image' ? 'image.jpg' : 'file',
          })
        }
      }

      const text = textParts.join(' ').trim()
      if (text || attachments.length > 0) {
        return { type: 'richText', text, attachments }
      }
    }

    return null
  }

  /**
   * 处理消息：下载附件 → 调用 Agent → 回复
   */
  private async processMessage(
    key: string,
    conn: DingtalkConnection,
    parsed: {
      type: string
      text: string
      attachments: Array<{ downloadCode: string; attachmentType: 'image' | 'file'; fileName: string }>
    },
    sessionWebhook: string | null,
    senderStaffId: string,
  ): Promise<void> {
    let chatAttachments: ChatAttachment[] | undefined
    let text = parsed.text

    // 下载所有附件
    if (parsed.attachments.length > 0) {
      chatAttachments = []
      for (let i = 0; i < parsed.attachments.length; i++) {
        const att = parsed.attachments[i]
        logger.info(`[DingtalkStream] 附件 ${i + 1}/${parsed.attachments.length}: type=${att.attachmentType}, downloadCode=${att.downloadCode.substring(0, 20)}...`)
        const downloadUrl = await this.getDownloadUrl(conn.channel, att.downloadCode)
        logger.info(`[DingtalkStream] getDownloadUrl 结果: ${downloadUrl ? downloadUrl.substring(0, 80) + '...' : 'null'}`)
        if (downloadUrl) {
          chatAttachments.push({
            id: `att_${Date.now()}_dt_${i}`,
            filename: att.fileName,
            mimeType: att.attachmentType === 'image' ? 'image/jpeg' : 'application/octet-stream',
            size: 0,
            url: downloadUrl,
            type: att.attachmentType,
          })
        }
      }
      if (chatAttachments.length === 0) chatAttachments = undefined
    }

    if (!text) {
      const hasImage = parsed.attachments.some(a => a.attachmentType === 'image')
      text = hasImage ? '[图片消息]' : `[文件] ${parsed.attachments[0]?.fileName || 'file'}`
    }

    const reply = await handleChannelMessage(conn.projectId, conn.channel, text, chatAttachments)

    // 优先用 sessionWebhook 回复
    if (sessionWebhook) {
      const ok = await replyDingtalk(sessionWebhook, reply)
      if (ok) {
        logger.info(`[DingtalkStream] ${key} 回复成功 (sessionWebhook)`)
        return
      }
      logger.warn(`[DingtalkStream] ${key} sessionWebhook 回复失败，尝试 OpenAPI`)
    }

    // 降级用 OpenAPI 回复
    if (conn.channel.dingtalk && senderStaffId) {
      await this.replyViaOpenAPI(conn.channel, senderStaffId, reply)
    }
  }

  /**
   * 通过 DingTalk OpenAPI 获取图片下载 URL
   */
  private async getDownloadUrl(channel: ChannelConfig, downloadCode: string): Promise<string | null> {
    const config = channel.dingtalk!
    const token = await getAccessToken(config)
    if (!token) {
      logger.warn('[DingtalkStream] 获取 access_token 失败，无法下载附件')
      return null
    }

    try {
      const res = await fetch(
        'https://api.dingtalk.com/v1.0/robot/messageFiles/download',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-acs-dingtalk-access-token': token,
          },
          body: JSON.stringify({
            robotCode: config.appKey,
            downloadCode: downloadCode,
          }),
          signal: AbortSignal.timeout(10000),
        },
      )
      if (!res.ok) {
        const errText = await res.text()
        logger.warn(`[DingtalkStream] downloadFile 失败: ${res.status} ${errText}`)
        return null
      }
      const data = await res.json()
      logger.info(`[DingtalkStream] getDownloadInfo 响应: ${JSON.stringify(data).substring(0, 300)}`)
      return data.downloadUrl || data.downloadInfo?.downloadUrl || null
    } catch (err) {
      logger.warn('[DingtalkStream] 获取下载URL异常:', err)
      return null
    }
  }

  /**
   * 通过 OpenAPI 回复消息
   */
  private async replyViaOpenAPI(
    channel: ChannelConfig,
    userId: string,
    content: string,
  ): Promise<void> {
    const config = channel.dingtalk!
    const token = await getAccessToken(config)
    if (!token) {
      logger.error('[DingtalkStream] 获取 access_token 失败，无法回复')
      return
    }

    const robotCode = config.appKey
    const body = {
      robotCode,
      userIds: [userId],
      msgKey: 'sampleText',
      msgParam: JSON.stringify({ content }),
    }

    try {
      const res = await fetch(
        'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-acs-dingtalk-access-token': token,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        },
      )
      if (res.ok) {
        logger.info(`[DingtalkStream] OpenAPI 回复成功: to=${userId}`)
      } else {
        const errText = await res.text()
        logger.error(`[DingtalkStream] OpenAPI 回复失败: ${res.status} ${errText}`)
      }
    } catch (err) {
      logger.error('[DingtalkStream] OpenAPI 回复异常:', err)
    }
  }
}

/** 全局单例（挂载到 globalThis 防止 Next.js HMR 重建丢失） */
const GLOBAL_KEY = '__gclaw_dingtalk_stream__'
export const dingtalkStream: DingtalkStreamService =
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] as DingtalkStreamService ??
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] = new DingtalkStreamService())
