/**
 * 飞书 WebSocket 长连接服务
 * 使用 @larksuiteoapi/node-sdk WSClient 接收机器人消息，无需公网 IP
 * 全局单例模式（globalThis.__gclaw_feishu_stream__）
 */

import * as Lark from '@larksuiteoapi/node-sdk'
import { handleChannelMessage } from './channel-service'
import { replyFeishu, downloadMessageResource, recognizeAudio, downloadAudioFile } from './feishu'
import type { ChannelConfig } from '@/types/channels'
import type { ChatAttachment } from '@/types/chat'
import { logger } from '@/lib/logger'

export type FeishuStreamStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface FeishuConnection {
  projectId: string
  channel: ChannelConfig
  status: FeishuStreamStatus
  client: Lark.WSClient | null
  /** 已处理消息 ID 去重 */
  processedMessageIds: Set<string>
  error?: string
}

/** 解析后的飞书消息 */
interface ParsedFeishuMessage {
  text: string
  attachments: Array<{
    fileKey: string
    type: 'image' | 'file'
    fileName: string
  }>
  /** 语音消息的 file_key，用于 ASR 转文字 */
  audioFileKey?: string
}

class FeishuStreamService {
  /** key = `${projectId}:${channelId}` */
  private connections = new Map<string, FeishuConnection>()
  private readonly MAX_CACHED_IDS = 500

  /**
   * 建立 Stream 连接
   */
  async connect(projectId: string, channel: ChannelConfig): Promise<void> {
    const key = `${projectId}:${channel.id}`
    const config = channel.feishu

    if (!config?.appId || !config?.appSecret) {
      throw new Error('未配置 appId 或 appSecret')
    }

    // 已有连接先断开
    await this.disconnect(projectId, channel.id)

    const conn: FeishuConnection = {
      projectId,
      channel,
      status: 'connecting',
      client: null,
      processedMessageIds: new Set(),
    }
    this.connections.set(key, conn)

    // 创建事件分发器
    const eventDispatcher = new Lark.EventDispatcher({
      encryptKey: config.encryptKey || undefined,
    }).register({
      'im.message.receive_v1': async (data: Record<string, unknown>) => {
        try {
          await this.handleMessage(key, conn, data)
        } catch (err) {
          logger.error(`[FeishuStream] ${key} 消息处理失败:`, err)
        }
      },
    })

    // 创建 WSClient
    const wsClient = new Lark.WSClient({
      appId: config.appId,
      appSecret: config.appSecret,
      loggerLevel: Lark.LoggerLevel.warn,
    })

    try {
      await wsClient.start({ eventDispatcher })
      conn.client = wsClient
      conn.status = 'connected'
      logger.info(`[FeishuStream] ${key} Stream 连接已建立`)
    } catch (err) {
      conn.status = 'error'
      conn.error = err instanceof Error ? err.message : String(err)
      logger.error(`[FeishuStream] ${key} 连接失败:`, conn.error)
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
        conn.client.close()
      } catch { /* ignore */ }
      conn.client = null
    }
    if (conn) {
      conn.status = 'disconnected'
    }
    logger.info(`[FeishuStream] 已断开: ${key}`)
  }

  /**
   * 获取连接状态
   */
  getStatus(projectId: string, channelId: string): { status: FeishuStreamStatus; error?: string } {
    const key = `${projectId}:${channelId}`
    const conn = this.connections.get(key)
    if (!conn) return { status: 'disconnected' }
    return { status: conn.status, error: conn.error }
  }

  /**
   * 获取所有连接状态
   */
  getAllStatuses(): Array<{ key: string; projectId: string; channelId: string; status: FeishuStreamStatus; error?: string }> {
    const result: Array<{ key: string; projectId: string; channelId: string; status: FeishuStreamStatus; error?: string }> = []
    for (const [key, conn] of this.connections) {
      const [projectId, channelId] = key.split(':')
      result.push({ key, projectId, channelId, status: conn.status, error: conn.error })
    }
    return result
  }

  /**
   * 处理收到的消息事件
   */
  private async handleMessage(key: string, conn: FeishuConnection, data: Record<string, unknown>): Promise<void> {
    const message = data.message as Record<string, unknown> | undefined
    if (!message) return

    const messageId = message.message_id as string
    if (!messageId) return

    // 消息去重
    if (conn.processedMessageIds.has(messageId)) return
    conn.processedMessageIds.add(messageId)
    if (conn.processedMessageIds.size > this.MAX_CACHED_IDS) {
      const first = conn.processedMessageIds.values().next().value
      if (first) conn.processedMessageIds.delete(first)
    }

    // 解析消息内容
    const parsed = this.parseMessage(message)
    if (!parsed) return

    logger.info(`[FeishuStream] ${key} 收到消息: text=${parsed.text.substring(0, 50)}, attachments=${parsed.attachments.length}, audio=${!!parsed.audioFileKey}`)

    // 语音消息：下载音频 → 保存 .opus → ASR 转文字
    let audioBuffer: Buffer | undefined
    let audioLocalUrl: string | undefined
    if (parsed.audioFileKey) {
      // 下载并保存为 .opus 文件（可播放）
      const audioResult = await downloadAudioFile(
        conn.channel.feishu!, conn.projectId, messageId, parsed.audioFileKey,
      )
      if (audioResult) {
        audioBuffer = audioResult.buffer
        audioLocalUrl = audioResult.localUrl
      }

      // ASR 语音识别（传入已下载 buffer，成功则替换默认的 [语音消息]）
      const asrText = await recognizeAudio(
        conn.channel.feishu!, messageId, parsed.audioFileKey, audioBuffer,
      )
      if (asrText) {
        parsed.text = asrText
      }
    }

    // 下载附件 → 保存本地
    let chatAttachments: ChatAttachment[] | undefined

    // 音频附件（已由 downloadAudioFile 保存）
    if (audioLocalUrl && audioBuffer) {
      chatAttachments = [{
        id: `att_${Date.now()}_fs_audio`,
        filename: 'voice.wav',
        mimeType: 'audio/wav',
        size: audioBuffer.length,
        url: audioLocalUrl,
        type: 'audio',
      }]
    }

    // 其他附件（图片、文件等）
    if (parsed.attachments.length > 0) {
      chatAttachments ??= []
      for (let i = 0; i < parsed.attachments.length; i++) {
        const att = parsed.attachments[i]
        logger.info(`[FeishuStream] 下载附件 ${i + 1}/${parsed.attachments.length}: type=${att.type}, key=${att.fileKey}`)
        const result = await downloadMessageResource(
          conn.channel.feishu!, conn.projectId, messageId, att.fileKey, att.type,
        )
        if (result) {
          chatAttachments.push({
            id: `att_${Date.now()}_fs_${i}`,
            filename: att.fileName,
            mimeType: att.type === 'image' ? 'image/jpeg' : 'application/octet-stream',
            size: result.buffer.length,
            url: result.localUrl,
            type: att.type === 'image' ? 'image' : 'file',
          })
        }
      }
    }
    if (chatAttachments?.length === 0) chatAttachments = undefined

    // 补充文本描述
    let text = parsed.text
    if (!text && chatAttachments) {
      const hasAudio = chatAttachments.some(a => a.type === 'audio')
      const hasImage = chatAttachments.some(a => a.type === 'image')
      if (hasAudio) text = '[语音消息]'
      else if (hasImage) text = '[图片消息]'
      else text = `[文件] ${chatAttachments[0]?.filename || 'file'}`
    }

    // 调用 Agent 处理消息
    const reply = await handleChannelMessage(conn.projectId, conn.channel, text, chatAttachments)

    // 回复消息（自动分段）
    if (reply) {
      const config = conn.channel.feishu!
      const ok = await replyFeishu(config, messageId, reply)
      if (ok) {
        logger.info(`[FeishuStream] ${key} 回复成功`)
      } else {
        logger.error(`[FeishuStream] ${key} 回复失败`)
      }
    }
  }

  /**
   * 解析飞书消息内容
   * 支持：text、image、file、post（富文本）、audio
   */
  private parseMessage(message: Record<string, unknown>): ParsedFeishuMessage | null {
    const msgType = message.message_type as string
    let contentStr = message.content as string

    const result: ParsedFeishuMessage = { text: '', attachments: [] }

    try {
      const content = JSON.parse(contentStr)

      switch (msgType) {
        case 'text':
          result.text = content.text || ''
          break

        case 'image':
          if (content.image_key) {
            result.text = '[图片消息]'
            result.attachments.push({
              fileKey: content.image_key,
              type: 'image',
              fileName: 'image.jpg',
            })
          }
          break

        case 'file':
        case 'media': {
          const fileKey = content.file_key || content.image_key
          if (fileKey) {
            const fileName = content.file_name || (msgType === 'media' ? 'media.mp4' : 'file')
            result.text = `[文件] ${fileName}`
            result.attachments.push({
              fileKey,
              type: msgType === 'media' ? 'file' : 'file',
              fileName,
            })
          }
          break
        }

        case 'post': {
          // 富文本：提取文本和图片
          // content 格式: { "zh_cn": { "title": "...", "content": [[{tag:"text",text:"..."},{tag:"img",image_key:"..."}]] } }
          const lang = content.zh_cn || content.en_us || content.ja_jp || content
          const title = lang.title || ''
          const textParts: string[] = []
          if (title) textParts.push(title)

          const paragraphs = lang.content as Array<Array<Record<string, string>>> | undefined
          if (paragraphs && Array.isArray(paragraphs)) {
            for (const para of paragraphs) {
              for (const elem of para) {
                if (elem.tag === 'text' && elem.text) {
                  textParts.push(elem.text)
                } else if (elem.tag === 'a' && elem.text) {
                  textParts.push(elem.href ? `${elem.text}(${elem.href})` : elem.text)
                } else if ((elem.tag === 'img' || elem.tag === 'image') && elem.image_key) {
                  result.attachments.push({
                    fileKey: elem.image_key,
                    type: 'image',
                    fileName: 'image.jpg',
                  })
                }
              }
            }
          }
          result.text = textParts.join('\n')
          break
        }

        case 'audio':
          // 语音消息：提取 file_key，后续由 handleMessage 调用 ASR 转文字
          if (content.file_key) {
            result.text = '[语音消息]'
            result.audioFileKey = content.file_key as string
          }
          break

        default:
          logger.info(`[FeishuStream] 未处理的消息类型: ${msgType}, content=${contentStr.substring(0, 200)}`)
          return null
      }
    } catch {
      // content 不是 JSON，尝试作为纯文本
      result.text = contentStr || ''
    }

    if (!result.text && result.attachments.length === 0) return null
    return result
  }

}

/** 全局单例（挂载到 globalThis 防止 Next.js HMR 重建丢失） */
const GLOBAL_KEY = '__gclaw_feishu_stream__'
export const feishuStream: FeishuStreamService =
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] as FeishuStreamService ??
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] = new FeishuStreamService())
