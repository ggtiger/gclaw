/**
 * 任务执行器注册表
 * 内置 5 种执行器: chat-message / script / webhook / execute-skill / custom
 */

import { spawn } from 'child_process'
import type { ScheduledTask } from '@/types/schedules'
import { executeChat } from '@/lib/claude/process-manager'
import { addMessage } from '@/lib/store/messages'
import { gclawEventBus } from '@/lib/claude/gclaw-events'
import { channelEventBus } from '@/lib/channels/channel-events'
import type { ChatMessage } from '@/types/chat'
import path from 'path'
import fs from 'fs'

export interface TaskExecutorResult {
  success: boolean
  error?: string
  data?: Record<string, unknown>
}

type ExecutorFn = (task: ScheduledTask) => Promise<TaskExecutorResult>

const executors = new Map<string, ExecutorFn>()

/** 注册自定义执行器 */
export function registerExecutor(type: string, fn: ExecutorFn) {
  executors.set(type, fn)
}

/** 执行任务 */
export async function executeTask(task: ScheduledTask): Promise<TaskExecutorResult> {
  const executor = executors.get(task.type)
  if (!executor) {
    return { success: false, error: `Unknown task type: ${task.type}` }
  }
  return executor(task)
}

// ── chat-message 执行器 ──────────────────────────────────

executors.set('chat-message', async (task) => {
  const { message, agentName } = task.config as { message: string; agentName?: string }
  const projectId = task.projectId
  if (!projectId || !message) {
    return { success: false, error: 'Missing projectId or message' }
  }

  // 持久化用户消息
  const userMsg: ChatMessage = {
    id: `msg_${Date.now()}_scheduled_user`,
    role: 'user',
    content: message,
    messageType: 'text',
    createdAt: new Date().toISOString(),
    source: 'schedule',
    sourceName: task.name,
  }
  addMessage(projectId, userMsg)

  // 通过 channelEventBus 推送用户消息到前端
  channelEventBus.emit(projectId, {
    type: 'channel_user_message',
    data: { message: userMsg },
  })

  // 通知前端 Agent 开始处理
  channelEventBus.emit(projectId, { type: 'channel_start', data: {} })

  let fullContent = ''
  try {
    for await (const event of executeChat(message, { projectId })) {
      if (event.event === 'delta' && typeof event.data.content === 'string') {
        fullContent += event.data.content
        channelEventBus.emit(projectId, {
          type: 'channel_delta',
          data: { content: event.data.content },
        })
      }
      if (event.event === 'tool_use') {
        channelEventBus.emit(projectId, { type: 'channel_tool_use', data: event.data })
      }
      if (event.event === 'tool_result') {
        channelEventBus.emit(projectId, { type: 'channel_tool_result', data: event.data })
      }
      if (event.event === 'done') {
        if (fullContent.trim()) {
          const assistantMsg: ChatMessage = {
            id: `msg_${Date.now()}_scheduled_assistant`,
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
          channelEventBus.emit(projectId, { type: 'channel_done', data: { message: assistantMsg } })
        } else {
          channelEventBus.emit(projectId, { type: 'channel_done', data: {} })
        }
      }
      if (event.event === 'error') {
        channelEventBus.emit(projectId, {
          type: 'channel_error',
          data: { message: event.data.message || 'Scheduled task execution failed' },
        })
        return { success: false, error: event.data.message as string }
      }
    }
    return { success: true, data: { contentLength: fullContent.length } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── script 执行器 ──────────────────────────────────────────

executors.set('script', async (task) => {
  const { command, cwd, timeout } = task.config as {
    command: string
    cwd?: string
    timeout?: number
  }
  if (!command) return { success: false, error: 'Missing command' }

  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', command], {
      cwd: cwd || process.cwd(),
      env: { ...process.env, GCLAW_PROJECT_ID: task.projectId || '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ success: false, error: 'Script timeout' })
    }, timeout || 30_000)

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ success: true, data: { stdout: stdout.slice(0, 4096) } })
      } else {
        resolve({ success: false, error: `Exit code ${code}: ${stderr.slice(0, 512)}` })
      }
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ success: false, error: err.message })
    })
  })
})

// ── webhook 执行器 ──────────────────────────────────────────

executors.set('webhook', async (task) => {
  const { url, method, headers, body } = task.config as {
    url: string
    method?: string
    headers?: Record<string, string>
    body?: unknown
  }
  if (!url) return { success: false, error: 'Missing URL' }

  try {
    const res = await fetch(url, {
      method: method || 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    return {
      success: res.ok,
      data: { status: res.status, response: text.slice(0, 2048) },
      error: res.ok ? undefined : `HTTP ${res.status}`,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── execute-skill 执行器 ────────────────────────────────────

executors.set('execute-skill', async (task) => {
  const { scriptPath, args, cwd: configCwd } = task.config as {
    scriptPath: string
    args?: string[]
    cwd?: string
  }
  if (!scriptPath) return { success: false, error: 'Missing scriptPath' }

  const skillsDir = process.env.GCLAW_SKILLS_DIR || path.join(process.cwd(), 'skills')
  const resolved = path.resolve(skillsDir, scriptPath)

  // 安全检查
  if (!resolved.startsWith(path.resolve(skillsDir) + path.sep)) {
    return { success: false, error: 'Script path escapes skills directory' }
  }
  if (!fs.existsSync(resolved)) {
    return { success: false, error: `Script not found: ${scriptPath}` }
  }

  return new Promise((resolve) => {
    const child = spawn('bash', [resolved, ...(args || [])], {
      cwd: configCwd || path.dirname(resolved),
      env: { ...process.env, GCLAW_PROJECT_ID: task.projectId || '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ success: false, error: 'Script timeout' })
    }, 30_000)

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        success: code === 0,
        data: { stdout: stdout.slice(0, 4096) },
        error: code !== 0 ? `Exit code ${code}: ${stderr.slice(0, 512)}` : undefined,
      })
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ success: false, error: err.message })
    })
  })
})

// ── custom 执行器（占位，通过 registerExecutor 扩展） ──────

executors.set('custom', async (_task) => {
  return { success: false, error: 'No custom executor registered' }
})
