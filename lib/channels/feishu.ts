/**
 * 飞书机器人消息处理
 * 文档: https://open.feishu.cn/document/server-docs/im-v1/message/create
 */

import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import * as Lark from '@larksuiteoapi/node-sdk'
import type { FeishuConfig } from '@/types/channels'
import { logger } from '@/lib/logger'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')

/**
 * 将 Ogg/Opus 音频转为 WAV 格式（通过独立 Node 脚本，避免模块加载污染主进程）
 */
function opusToWav(opusPath: string, wavPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const script = `
const OpusScript = require('opusscript');
const fs = require('fs');
const buf = fs.readFileSync(process.argv[1]);
const packets = [];
let i = 0;
while (i < buf.length - 27) {
  if (buf.toString('ascii', i, i + 4) !== 'OggS') break;
  const seg = buf.readUInt8(i + 26);
  const sizes = []; let sz = 0;
  for (let s = 0; s < seg; s++) { const v = buf.readUInt8(i + 27 + s); sz += v; if (v < 255) { sizes.push(sz); sz = 0; } }
  if (sz > 0) sizes.push(sz);
  let off = i + 27 + seg;
  for (const size of sizes) { packets.push(buf.slice(off, off + size)); off += size; }
  i = off;
}
const dec = new OpusScript(16000, 1, OpusScript.Application.VOIP);
const chunks = [];
for (const p of packets.slice(2)) { try { chunks.push(Buffer.from(dec.decode(p))); } catch {} }
dec.delete();
const pcm = Buffer.concat(chunks);
const wav = Buffer.alloc(44 + pcm.length);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
fs.writeFileSync(process.argv[2], wav);
`
    execFile('node', ['-e', script, opusPath, wavPath], {
      timeout: 10000,
      cwd: process.cwd(),  // 确保 require 能找到 node_modules
    }, (err) => {
      if (err) {
        logger.warn('[Feishu] Opus→WAV 转换失败:', err.message?.substring(0, 200))
        resolve(false)
      } else {
        resolve(true)
      }
    })
  })
}

/**
 * 验证飞书事件回调签名
 */
export function verifyFeishuSignature(
  timestamp: string,
  nonce: string,
  body: string,
  encryptKey: string,
): string {
  const content = timestamp + nonce + encryptKey + body
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * 解析飞书事件体
 * 返回 challenge（验证请求）或消息文本
 */
export function parseFeishuEvent(body: Record<string, unknown>): {
  type: 'challenge' | 'message' | 'unknown'
  challenge?: string
  text?: string
  imageUrl?: string
  messageId?: string
  chatId?: string
  chatType?: string
  senderId?: string
} {
  // URL 验证 challenge
  if (body.challenge && body.type === 'url_verification') {
    return { type: 'challenge', challenge: body.challenge as string }
  }

  // v2 事件格式
  const header = body.header as Record<string, unknown> | undefined
  const event = body.event as Record<string, unknown> | undefined

  if (header?.event_type === 'im.message.receive_v1' && event) {
    const message = event.message as Record<string, unknown> | undefined
    const sender = event.sender as Record<string, unknown> | undefined

    if (message) {
      const msgType = message.message_type as string
      let text = ''
      let imageUrl: string | undefined

      if (msgType === 'text') {
        try {
          const content = JSON.parse(message.content as string)
          text = content.text || ''
        } catch {
          text = (message.content as string) || ''
        }
      } else if (msgType === 'image') {
        text = '[图片消息]'
        try {
          const content = JSON.parse(message.content as string)
          imageUrl = content.image_key as string
        } catch {}
      }

      return {
        type: 'message',
        text,
        imageUrl,
        messageId: message.message_id as string,
        chatId: message.chat_id as string,
        chatType: message.chat_type as string,
        senderId: (sender?.sender_id as Record<string, string>)?.open_id,
      }
    }
  }

  return { type: 'unknown' }
}

/**
 * 获取飞书 tenant_access_token
 */
export async function getTenantAccessToken(config: FeishuConfig): Promise<string | null> {
  try {
    const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: config.appId,
        app_secret: config.appSecret,
      }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return data.tenant_access_token || null
  } catch {
    return null
  }
}

/** SDK Client 全局缓存，避免重复创建 */
const clientCache = new Map<string, Lark.Client>()
function getLarkClient(config: FeishuConfig): Lark.Client {
  const key = config.appId
  let client = clientCache.get(key)
  if (!client) {
    client = new Lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
    })
    clientCache.set(key, client)
  }
  return client
}

/**
 * 下载飞书消息资源文件
 * 使用 SDK Client 的 im.messageResource.get()，自动处理 token 和二进制流
 *
 * @returns { localUrl, buffer, absPath } 或 null
 */
export async function downloadMessageResource(
  config: FeishuConfig,
  projectId: string,
  messageId: string,
  fileKey: string,
  type: 'image' | 'file',
): Promise<{ localUrl: string; buffer: Buffer; absPath: string } | null> {
  try {
    const client = getLarkClient(config)

    // 保存到本地临时文件
    const savedName = `${Date.now()}_feishu_${fileKey.substring(0, 12).replace(/[^a-zA-Z0-9]/g, '_')}`
    const attachDir = path.join(DATA_DIR, 'projects', projectId, 'attachments')
    fs.mkdirSync(attachDir, { recursive: true })
    const tmpPath = path.join(attachDir, `${savedName}.tmp`)

    // 使用 SDK 下载资源并写入临时文件
    const result = await client.im.messageResource.get({
      params: { type },
      path: { message_id: messageId, file_key: fileKey },
    })

    if (!result) {
      logger.warn('[Feishu] SDK messageResource.get 返回空')
      return null
    }

    // 写入临时文件
    await result.writeFile(tmpPath)

    // 读取并检测真实格式
    const buffer = fs.readFileSync(tmpPath)
    if (buffer.length === 0) {
      fs.unlinkSync(tmpPath)
      logger.warn('[Feishu] 下载资源为空')
      return null
    }

    // 检测文件扩展名
    let ext: string
    if (type === 'image') {
      const header = buffer.toString('hex', 0, 4)
      if (header.startsWith('8950')) ext = 'png'
      else if (header.startsWith('4749')) ext = 'gif'
      else if (header.startsWith('5249')) ext = 'webp'
      else ext = 'jpg'
    } else {
      ext = 'bin'
    }

    // 重命名为最终文件名
    const finalName = `${savedName}.${ext}`
    const finalPath = path.join(attachDir, finalName)
    fs.renameSync(tmpPath, finalPath)

    const localUrl = `/api/chat/attachments/${projectId}/${finalName}`
    const absPath = path.resolve(finalPath)
    logger.info(`[Feishu] 资源下载成功: ${type} ${(buffer.length / 1024).toFixed(1)}KB → ${localUrl}`)

    return { localUrl, buffer, absPath }
  } catch (err) {
    logger.warn('[Feishu] 下载资源异常:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * 下载语音消息并转为 WAV 格式（浏览器通用播放）
 * 流程：下载 Opus/Ogg → 子进程解码为 WAV → 保存本地
 * @returns { localUrl, buffer } 或 null（buffer 为原始 opus，用于 ASR）
 */
export async function downloadAudioFile(
  config: FeishuConfig,
  projectId: string,
  messageId: string,
  fileKey: string,
): Promise<{ localUrl: string; buffer: Buffer } | null> {
  try {
    const result = await downloadMessageResource(config, projectId, messageId, fileKey, 'file')
    if (!result) return null

    const opusBuffer = result.buffer
    const opusPath = result.absPath

    // 尝试转换为 WAV（通过子进程，避免污染主进程）
    const wavName = `${Date.now()}_feishu_${fileKey.substring(0, 12).replace(/[^a-zA-Z0-9]/g, '_')}.wav`
    const wavPath = path.join(path.dirname(opusPath), wavName)
    const converted = await opusToWav(opusPath, wavPath)

    let localUrl: string
    if (converted && fs.existsSync(wavPath)) {
      // 转换成功，用 WAV 文件
      fs.unlinkSync(opusPath) // 清理原始 .bin
      localUrl = `/api/chat/attachments/${projectId}/${wavName}`
      const wavSize = fs.statSync(wavPath).size
      logger.info(`[Feishu] 语音 Opus→WAV 成功: ${(opusBuffer.length / 1024).toFixed(1)}KB → ${(wavSize / 1024).toFixed(1)}KB → ${localUrl}`)
    } else {
      // 转换失败，直接用原始 opus
      localUrl = `/api/chat/attachments/${projectId}/${path.basename(opusPath)}`
      logger.info(`[Feishu] 语音保持 Opus 格式: ${(opusBuffer.length / 1024).toFixed(1)}KB → ${localUrl}`)
    }

    return { localUrl, buffer: opusBuffer }
  } catch (err) {
    logger.warn('[Feishu] 下载语音文件异常:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * 语音转文字
 * 流程：上传音频到飞书 → 调用 ASR → 返回识别文本
 *
 * @param existingBuffer 已下载的音频 buffer（避免重复下载），不传则自行下载
 */
export async function recognizeAudio(
  config: FeishuConfig,
  messageId: string,
  fileKey: string,
  existingBuffer?: Buffer,
): Promise<string | null> {
  try {
    const client = getLarkClient(config)

    // 1. 获取音频 buffer
    let buffer: Buffer
    if (existingBuffer && existingBuffer.length > 0) {
      buffer = existingBuffer
    } else {
      const result = await client.im.messageResource.get({
        params: { type: 'file' },
        path: { message_id: messageId, file_key: fileKey },
      })
      if (!result) {
        logger.warn('[Feishu] 下载语音文件失败')
        return null
      }
      const tmpDir = path.join(DATA_DIR, '_tmp')
      fs.mkdirSync(tmpDir, { recursive: true })
      const tmpPath = path.join(tmpDir, `${Date.now()}_audio.opus`)
      await result.writeFile(tmpPath)
      buffer = fs.readFileSync(tmpPath)
      fs.unlinkSync(tmpPath)
    }

    if (buffer.length === 0) {
      logger.warn('[Feishu] 语音文件为空')
      return null
    }
    logger.info(`[Feishu] 语音文件: ${(buffer.length / 1024).toFixed(1)}KB`)

    // 2. 上传文件获取 file_id
    const uploadResult = await client.im.file.create({
      data: {
        file_type: 'opus',
        file_name: 'audio.opus',
        file: buffer,
      },
    })

    const fileId = uploadResult?.file_key
    if (!fileId) {
      logger.warn('[Feishu] 上传语音文件失败，未获得 file_key')
      return null
    }
    logger.info(`[Feishu] 语音文件上传成功: file_key=${fileId}`)

    // 3. 调用 ASR 识别（限频时重试一次）
    let asrResult = await client.speech_to_text.speech.fileRecognize({
      data: {
        speech: { speech_key: messageId },
        config: {
          file_id: fileId,
          format: 'opus',
          engine_type: '16k_auto',
        },
      },
    })

    // 限频重试
    if (!asrResult?.data?.recognition_text && asrResult?.code === 99991400) {
      logger.info('[Feishu] ASR 限频，等待 1 秒后重试')
      await new Promise(r => setTimeout(r, 1000))
      asrResult = await client.speech_to_text.speech.fileRecognize({
        data: {
          speech: { speech_key: messageId },
          config: {
            file_id: fileId,
            format: 'opus',
            engine_type: '16k_auto',
          },
        },
      })
    }

    const text = asrResult?.data?.recognition_text
    if (text) {
      logger.info(`[Feishu] 语音识别成功: ${text.substring(0, 100)}`)
      return text
    }

    logger.warn(`[Feishu] 语音识别无结果: code=${asrResult?.code}, msg=${asrResult?.msg}`)
    return null
  } catch (err) {
    logger.warn('[Feishu] 语音识别异常:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * 通过飞书 OpenAPI 回复消息
 * 超过 4000 字符时自动分段发送（飞书限制约 4096 字符）
 */
export async function replyFeishu(
  config: FeishuConfig,
  messageId: string,
  content: string,
): Promise<boolean> {
  try {
    const token = await getTenantAccessToken(config)
    if (!token) {
      logger.error('[Feishu] Failed to get access token')
      return false
    }

    const MAX_LEN = 4000

    // 短文本直接回复
    if (content.length <= MAX_LEN) {
      return await sendReply(token, messageId, content)
    }

    // 长文本分段发送
    const chunks = splitTextChunks(content, MAX_LEN)
    let chatId: string | undefined
    let allOk = true

    for (let i = 0; i < chunks.length; i++) {
      if (i === 0) {
        // 第一段用 reply
        const ok = await sendReply(token, messageId, chunks[i])
        if (!ok) allOk = false
      } else {
        // 后续段需要 chat_id，从第一次 reply 的响应中获取
        if (!chatId) {
          chatId = await getChatIdFromMessage(token, messageId)
        }
        if (chatId) {
          const ok = await sendMessage(token, chatId, chunks[i])
          if (!ok) allOk = false
        } else {
          logger.warn('[Feishu] 无法获取 chat_id，跳过后续分段')
          break
        }
      }
    }

    return allOk
  } catch (err) {
    logger.error('[Feishu] Reply failed:', err)
    return false
  }
}

/** 回复消息 */
async function sendReply(token: string, messageId: string, text: string): Promise<boolean> {
  const res = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      msg_type: 'text',
      content: JSON.stringify({ text }),
    }),
    signal: AbortSignal.timeout(10000),
  })
  return res.ok
}

/** 发送消息到群聊/私聊 */
async function sendMessage(token: string, chatId: string, text: string): Promise<boolean> {
  const res = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    }),
    signal: AbortSignal.timeout(10000),
  })
  return res.ok
}

/** 通过消息 ID 获取 chat_id */
async function getChatIdFromMessage(token: string, messageId: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      return data?.data?.items?.[0]?.chat_id || data?.data?.chat_id
    }
  } catch { /* ignore */ }
  return undefined
}

/** 将长文本按段落边界分段 */
function splitTextChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }

    // 优先在换行符处分割
    let splitAt = remaining.lastIndexOf('\n', maxLen)
    if (splitAt <= maxLen * 0.3) {
      // 换行符太靠前，尝试在句号处分割
      splitAt = remaining.lastIndexOf('。', maxLen)
      if (splitAt <= maxLen * 0.3) {
        splitAt = remaining.lastIndexOf(' ', maxLen)
        if (splitAt <= maxLen * 0.3) {
          splitAt = maxLen
        }
      }
    }

    chunks.push(remaining.substring(0, splitAt))
    remaining = remaining.substring(splitAt)
    // 跳过开头的换行符
    while (remaining.startsWith('\n')) remaining = remaining.substring(1)
  }

  return chunks
}
