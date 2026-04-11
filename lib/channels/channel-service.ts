/**
 * 渠道消息处理核心服务
 * 接收渠道消息 -> 调用 Agent -> 回复渠道
 * 同时通过 SSE 事件总线将消息和 Agent 响应实时推送到 Web UI
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import https from 'https'
import http from 'http'
import { executeChat, type AttachmentData } from '@/lib/claude/process-manager'
import { addMessage } from '@/lib/store/messages'
import { channelEventBus } from './channel-events'
import type { ChatMessage, ChatAttachment } from '@/types/chat'
import type { ChannelConfig } from '@/types/channels'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')

/**
 * 解密微信 AES-128-ECB 加密的媒体数据
 * aes_key 是 base64 编码，有两种格式：
 *   - 图片: base64(raw 16 bytes)
 *   - 文件/语音: base64(hex string of 16 bytes)
 */
function decryptWechatMedia(encrypted: Buffer, aesKeyBase64: string): Buffer {
  const decoded = Buffer.from(aesKeyBase64, 'base64')
  let key: Buffer
  if (decoded.length === 16) {
    key = decoded
  } else if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString('ascii'))) {
    key = Buffer.from(decoded.toString('ascii'), 'hex')
  } else {
    throw new Error(`Invalid aes_key: expected 16 raw bytes or 32 hex chars, got ${decoded.length} bytes`)
  }

  const decipher = crypto.createDecipheriv('aes-128-ecb', key, null)
  decipher.setAutoPadding(true)
  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

/** 用 https/http 下载文件（支持重定向，带浏览器 UA） */
function downloadFile(url: string, timeoutMs = 15_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('download timeout')), timeoutMs)
    const protocol = url.startsWith('https') ? https : http
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
      },
    }
    protocol.get(url, options, (res) => {
      // 跟随重定向
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        clearTimeout(timer)
        downloadFile(res.headers.location, timeoutMs).then(resolve).catch(reject)
        return
      }
      if (res.statusCode && res.statusCode >= 400) {
        clearTimeout(timer)
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        clearTimeout(timer)
        resolve(Buffer.concat(chunks))
      })
      res.on('error', (err) => { clearTimeout(timer); reject(err) })
    }).on('error', (err) => { clearTimeout(timer); reject(err) })
  })
}

interface DownloadResult {
  attachmentData: AttachmentData | null   // null 表示非图片文件（不传给 Agent）
  localUrl: string
  actualSize: number
}

/** 下载渠道附件 → 解密（如需） → 保存本地 → 返回结果 */
async function downloadChannelAttachment(
  att: ChatAttachment, projectId: string
): Promise<DownloadResult | null> {
  try {
    let buffer = await downloadFile(att.url)

    if (buffer.length > 10 * 1024 * 1024) {
      console.warn(`[ChannelService] 附件太大 (${buffer.length} bytes)，跳过`)
      return null
    }

    // 微信加密媒体需 AES 解密
    if (att.aesKey) {
      buffer = decryptWechatMedia(buffer, att.aesKey)
    }

    // 确定文件扩展名：图片用文件头检测真实格式，文件用原始文件名
    let ext: string
    let mimeType = att.mimeType
    if (att.type === 'image') {
      const header = buffer.toString('hex', 0, 4)
      if (header.startsWith('8950')) { ext = 'png'; mimeType = 'image/png' }
      else if (header.startsWith('4749')) { ext = 'gif'; mimeType = 'image/gif' }
      else if (header.startsWith('5249')) { ext = 'webp'; mimeType = 'image/webp' }
      else { ext = 'jpg'; mimeType = 'image/jpeg' }
    } else {
      ext = att.filename.split('.').pop()?.toLowerCase() || 'bin'
    }

    // 保存到本地附件目录
    const savedName = `${Date.now()}_channel_${att.id.split('_').pop()}.${ext}`
    const attachDir = path.join(DATA_DIR, 'projects', projectId, 'attachments')
    fs.mkdirSync(attachDir, { recursive: true })
    fs.writeFileSync(path.join(attachDir, savedName), buffer)

    const localUrl = `/api/chat/attachments/${projectId}/${savedName}`
    console.log(`[ChannelService] 附件下载成功: ${att.type} ${(buffer.length / 1024).toFixed(1)}KB${att.aesKey ? ' (已解密)' : ''} → ${localUrl}`)

    // 图片：传给 Agent（base64）；其他文件：只保存本地供 UI 下载
    let attachmentData: AttachmentData | null = null
    if (att.type === 'image') {
      attachmentData = {
        filename: `image.${ext}`,
        mimeType,
        content: buffer.toString('base64'),
        isImage: true,
      }
    }

    return { attachmentData, localUrl, actualSize: buffer.length }
  } catch (err) {
    console.warn(`[ChannelService] 下载附件失败: ${att.url?.substring(0, 60)}`, err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * 处理来自渠道的消息，调用 Agent 获取回复
 * 同时通过 channelEventBus 实时推送事件到 Web UI
 */
export async function handleChannelMessage(
  projectId: string,
  _channel: ChannelConfig,
  incomingText: string,
  attachments?: ChatAttachment[],
): Promise<string> {
  // 下载所有附件 → 保存本地 → URL 替换为本地路径
  let attachmentData: AttachmentData[] | undefined
  if (attachments && attachments.length > 0) {
    console.log(`[ChannelService] 收到 ${attachments.length} 个附件:`, attachments.map(a => ({ type: a.type, url: a.url?.substring(0, 60) })))

    const results = await Promise.all(
      attachments.map(att => att.url ? downloadChannelAttachment(att, projectId) : Promise.resolve(null))
    )

    // 用本地 URL 替换原始 URL + 更新实际文件大小
    for (let i = 0; i < attachments.length; i++) {
      const r = results[i]
      if (r && attachments[i].url) {
        attachments[i].url = r.localUrl
        attachments[i].size = r.actualSize
      }
    }

    // 收集图片 AttachmentData 传给 Agent
    attachmentData = results
      .filter((r): r is DownloadResult => r !== null && r.attachmentData !== null)
      .map(r => r.attachmentData!)
    if (attachmentData.length === 0) attachmentData = undefined
    console.log(`[ChannelService] 附件处理结果: 成功=${results.filter(r => r !== null).length}, 传Agent=${attachmentData?.length ?? 0}`)
  }

  // 持久化用户消息（附件 URL 已替换为本地路径）
  const userMsg: ChatMessage = {
    id: `msg_${Date.now()}_channel_user`,
    role: 'user',
    content: incomingText,
    messageType: 'text',
    createdAt: new Date().toISOString(),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  }
  addMessage(projectId, userMsg)

  // 通过 SSE 推送用户消息到 Web UI
  channelEventBus.emit(projectId, {
    type: 'channel_user_message',
    data: { message: userMsg },
  })

  // 调用 Agent，收集完整回复，同时流式推送到前端
  let fullContent = ''

  // 通知前端 Agent 开始处理
  channelEventBus.emit(projectId, {
    type: 'channel_start',
    data: {},
  })

  // 构建传给 Agent 的文本：非图片附件附加本地文件信息
  let agentText = incomingText
  if (attachments) {
    for (const att of attachments) {
      if (att.type !== 'image' && att.url) {
        agentText += `\n文件已保存: ${att.filename} (${(att.size / 1024).toFixed(1)}KB)`
      }
    }
  }

  try {
    console.log(`[ChannelService] 发送给 AI: text="${agentText.substring(0, 200)}${agentText.length > 200 ? '...' : ''}", attachments=${attachmentData?.length ?? 0}`)
    for await (const event of executeChat(agentText, { projectId, attachments: attachmentData })) {
      if (event.event === 'delta' && typeof event.data.content === 'string') {
        fullContent += event.data.content
        // 流式推送 delta 到前端
        channelEventBus.emit(projectId, {
          type: 'channel_delta',
          data: { content: event.data.content },
        })
      }

      if (event.event === 'tool_use') {
        channelEventBus.emit(projectId, {
          type: 'channel_tool_use',
          data: event.data,
        })
      }

      if (event.event === 'tool_result') {
        channelEventBus.emit(projectId, {
          type: 'channel_tool_result',
          data: event.data,
        })
      }

      if (event.event === 'done') {
        if (fullContent.trim()) {
          const assistantMsg: ChatMessage = {
            id: `msg_${Date.now()}_channel_assistant`,
            role: 'assistant',
            content: fullContent,
            messageType: 'text',
            createdAt: new Date().toISOString(),
            stats: event.data.usage
              ? {
                  costUsd: (event.data.costUsd as number) || 0,
                  inputTokens: (event.data.usage as Record<string, number>).inputTokens || 0,
                  outputTokens: (event.data.usage as Record<string, number>).outputTokens || 0,
                  cachedTokens: (event.data.usage as Record<string, number>).cachedTokens || 0,
                  model: (event.data.model as string) || '',
                }
              : undefined,
          }
          addMessage(projectId, assistantMsg)

          // 推送完成事件（含完整消息）到前端
          channelEventBus.emit(projectId, {
            type: 'channel_done',
            data: { message: assistantMsg },
          })
        } else {
          channelEventBus.emit(projectId, {
            type: 'channel_done',
            data: {},
          })
        }
      }

      if (event.event === 'error') {
        const errMsg = event.data.message as string || '处理失败'
        if (!fullContent) fullContent = `[错误] ${errMsg}`
        channelEventBus.emit(projectId, {
          type: 'channel_error',
          data: { message: errMsg },
        })
      }
    }
  } catch (err) {
    console.error('[ChannelService] executeChat error:', err)
    if (!fullContent) fullContent = '[错误] Agent 执行异常'
    channelEventBus.emit(projectId, {
      type: 'channel_error',
      data: { message: 'Agent 执行异常' },
    })
  }

  return fullContent || '[无回复]'
}
