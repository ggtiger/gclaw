import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { executeChat, type AttachmentData } from '@/lib/claude/process-manager'
import { gclawEventBus } from '@/lib/claude/gclaw-events'
import { addMessage } from '@/lib/store/messages'
import { getSettings } from '@/lib/store/settings'
import { assertValidProjectId } from '@/lib/store/projects'
import { resolveCommand } from '@/lib/commands/registry'
import { CommandExecutor } from '@/lib/commands/executor'
import type { ChatMessage, ChatAttachment, PermissionRequest, AskUserQuestionRequest } from '@/types/chat'

export const dynamic = 'force-dynamic'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')

const IMAGE_MIME_PREFIX = 'image/'

const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.swift', '.m', '.sh', '.bash',
  '.zsh', '.sql', '.html', '.css', '.scss', '.less', '.json', '.xml', '.yaml',
  '.yml', '.toml', '.ini', '.cfg', '.conf', '.md', '.txt', '.csv', '.log',
  '.r', '.lua', '.pl', '.ex', '.exs', '.erl', '.hs', '.ml', '.scala',
  '.clj', '.vue', '.svelte',
])

const TEXT_MIME_TYPES = new Set([
  'text/plain', 'text/html', 'text/css', 'text/javascript', 'text/xml',
  'application/json', 'application/xml', 'application/javascript',
  'application/x-yaml', 'application/yaml',
  'text/markdown', 'text/csv', 'text/x-python', 'text/x-shellscript',
])

/**
 * 根据附件元数据从磁盘读取文件内容，构造 AttachmentData
 */
function loadAttachmentData(att: ChatAttachment, projectId: string): AttachmentData | null {
  // 从 url 提取文件路径: /api/chat/attachments/{projectId}/{filename}
  const urlParts = att.url.split('/')
  const filename = urlParts.slice(5).join('/')
  if (!filename || filename.includes('..')) return null

  const filePath = path.join(DATA_DIR, 'projects', projectId, 'attachments', filename)
  const resolvedPath = path.resolve(filePath)
  const attachDir = path.resolve(path.join(DATA_DIR, 'projects', projectId, 'attachments'))
  if (!resolvedPath.startsWith(attachDir)) return null

  if (!fs.existsSync(resolvedPath)) return null

  const isImage = att.mimeType.startsWith(IMAGE_MIME_PREFIX)

  if (isImage) {
    const buffer = fs.readFileSync(resolvedPath)
    return {
      filename: att.filename,
      mimeType: att.mimeType,
      content: buffer.toString('base64'),
      isImage: true,
      localPath: resolvedPath,
    }
  }

  // 文本/代码文件：读取为 UTF-8 文本
  const ext = path.extname(att.filename).toLowerCase()
  const isText = TEXT_MIME_TYPES.has(att.mimeType) || CODE_EXTENSIONS.has(ext)
  if (isText) {
    const content = fs.readFileSync(resolvedPath, 'utf-8')
    return {
      filename: att.filename,
      mimeType: att.mimeType,
      content,
      isImage: false,
      localPath: resolvedPath,
    }
  }

  // 其他二进制文件：标注为不可读
  return {
    filename: att.filename,
    mimeType: att.mimeType,
    content: `[Binary file: ${att.filename}, size: ${att.size} bytes, type: ${att.mimeType}]`,
    isImage: false,
    localPath: resolvedPath,
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { message, projectId = '', attachments, commandId, commandParams, cwd: requestCwd }: {
    message: string
    projectId: string
    attachments?: ChatAttachment[]
    commandId?: string
    commandParams?: Record<string, any>
    cwd?: string
  } = body

  // commandId 模式下 message 可选，普通聊天模式下 message 必填
  if (!commandId && (!message || typeof message !== 'string')) {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 安全校验：验证 projectId 格式
  try {
    assertValidProjectId(projectId)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid projectId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── 命令执行分支 ──
  if (commandId) {
    const command = resolveCommand(commandId, projectId)
    if (!command) {
      return new Response(JSON.stringify({ error: `Command "${commandId}" not found` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!command.enabled) {
      return new Response(JSON.stringify({ error: `Command "${commandId}" is disabled` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const settings = getSettings(projectId)
    const apiKey = settings.apiKey || process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: '未配置 API Key，请先在设置中配置 Anthropic API Key',
        code: 'NO_API_KEY',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        // 权限请求回调：直接通过 SSE 推送到前端
        const onPermissionRequest = (req: PermissionRequest) => {
          const sseData = `event: permission_request\ndata: ${JSON.stringify(req)}\n\n`
          controller.enqueue(encoder.encode(sseData))
        }
        // AskUserQuestion 回调：通过 SSE 推送问题到前端
        const onAskUserQuestion = (req: AskUserQuestionRequest) => {
          const sseData = `event: ask_user_question\ndata: ${JSON.stringify(req)}\n\n`
          controller.enqueue(encoder.encode(sseData))
        }

        const executor = new CommandExecutor(
          projectId,
          'user',
          requestCwd || settings.cwd || '',
          0,
          { onPermissionRequest, onAskUserQuestion }
        )
        let fullContent = ''
        try {
          for await (const event of executor.execute(command, commandParams || {})) {
            // 累积 step_delta 内容，用于最终生成消息
            if (event.type === 'step_delta' && event.data.content) {
              fullContent += event.data.content
            }
            const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
            controller.enqueue(encoder.encode(sseData))
          }

          // 获取累积的 token 统计
          const usageStats = executor.getUsageStats()

          // 持久化 AI 回复消息（与普通聊天一致）
          if (fullContent.trim()) {
            const assistantMsg: ChatMessage = {
              id: `msg_${Date.now()}_assistant`,
              role: 'assistant',
              content: fullContent,
              messageType: 'text',
              createdAt: new Date().toISOString(),
              stats: usageStats.usage.inputTokens > 0 ? {
                costUsd: usageStats.usage.costUsd,
                inputTokens: usageStats.usage.inputTokens,
                outputTokens: usageStats.usage.outputTokens,
                cachedTokens: usageStats.usage.cachedTokens,
                model: usageStats.model,
              } : undefined,
            }
            addMessage(projectId, assistantMsg)
          }

          // 发送 done 事件，前端 handleDoneEvent 会据此创建聊天消息
          const doneData = `event: done\ndata: ${JSON.stringify({
            fullContent,
            usage: usageStats.usage.inputTokens > 0 ? {
              inputTokens: usageStats.usage.inputTokens,
              outputTokens: usageStats.usage.outputTokens,
              cachedTokens: usageStats.usage.cachedTokens,
            } : undefined,
            costUsd: usageStats.usage.costUsd || undefined,
            model: usageStats.model || undefined,
          })}\n\n`
          controller.enqueue(encoder.encode(doneData))
          // 发送 end 事件
          const endData = `event: end\ndata: {}\n\n`
          controller.enqueue(encoder.encode(endData))
        } catch (err) {
          const errorData = `event: workflow_error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`
          controller.enqueue(encoder.encode(errorData))
          const endData = `event: end\ndata: {}\n\n`
          controller.enqueue(encoder.encode(endData))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  // ── 普通聊天流程 ──

  // 前置检查：API Key 是否已配置
  const settings = getSettings(projectId)
  const apiKey = settings.apiKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({
      error: '未配置 API Key，请先在设置中配置 Anthropic API Key',
      code: 'NO_API_KEY',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 加载附件数据
  let attachmentData: AttachmentData[] | undefined
  if (attachments && attachments.length > 0) {
    attachmentData = attachments
      .map(att => loadAttachmentData(att, projectId))
      .filter((d): d is AttachmentData => d !== null)
  }

  // 持久化用户消息
  const userMsg: ChatMessage = {
    id: `msg_${Date.now()}_user`,
    role: 'user',
    content: message,
    messageType: 'text',
    createdAt: new Date().toISOString(),
    source: 'web',
    attachments: attachments || undefined,
  }
  addMessage(projectId, userMsg)

  // 创建 SSE 流
  const encoder = new TextEncoder()
  let fullContent = ''

  const stream = new ReadableStream({
    async start(controller) {
      // 权限请求回调：直接通过 SSE 推送到前端
      const onPermissionRequest = (req: PermissionRequest) => {
        const sseData = `event: permission_request\ndata: ${JSON.stringify(req)}\n\n`
        controller.enqueue(encoder.encode(sseData))
      }

      // AskUserQuestion 回调：通过 SSE 推送问题到前端
      const onAskUserQuestion = (req: AskUserQuestionRequest) => {
        const sseData = `event: ask_user_question\ndata: ${JSON.stringify(req)}\n\n`
        controller.enqueue(encoder.encode(sseData))
      }

      // 订阅 GClaw 事件总线：将技能通知转发为 SSE
      const unsubscribe = gclawEventBus.subscribe(projectId, (event) => {
        try {
          const sseData = `event: skill_notify\ndata: ${JSON.stringify({
            type: event.type,
            source: event.source,
            message: event.data.message || '',
            data: event.data,
            timestamp: event.timestamp,
          })}\n\n`
          controller.enqueue(encoder.encode(sseData))
        } catch {
          // controller 可能已关闭
        }
      })

      try {
        console.log(`[ChatStream] 发送给 AI: text="${message.substring(0, 200)}${message.length > 200 ? '...' : ''}", attachments=${attachmentData?.length ?? 0}`)
        for await (const event of executeChat(message, { projectId, onAskUserQuestion, attachments: attachmentData }, onPermissionRequest)) {
          // 累积完整内容
          if (event.event === 'delta' && typeof event.data.content === 'string') {
            fullContent += event.data.content
          }

          // done 时持久化 AI 回复（仅当有文本内容时）
          if (event.event === 'done' && fullContent.trim()) {
            const assistantMsg: ChatMessage = {
              id: `msg_${Date.now()}_assistant`,
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
          }

          const sseData = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`
          controller.enqueue(encoder.encode(sseData))
        }
      } catch (err) {
        const errorData = `event: error\ndata: ${JSON.stringify({ message: String(err) })}\n\n`
        controller.enqueue(encoder.encode(errorData))
        const endData = `event: end\ndata: {}\n\n`
        controller.enqueue(encoder.encode(endData))
      } finally {
        unsubscribe()
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
