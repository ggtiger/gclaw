import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk'
import { convertSDKMessage, createConvertContext } from './stream-parser'
import { syncClaudeSkillsDir } from './skills-dir'
import { getSettings, updateSettings } from '@/lib/store/settings'
import { getEnabledSkills } from '@/lib/store/skills'
import type { SSEEvent } from '@/types/chat'

// 模块级状态：同一时间只允许一个查询
let currentAbortController: AbortController | null = null

export interface ExecuteOptions {
  model?: string
  effort?: 'low' | 'medium' | 'high'
  sessionId?: string
  cwd?: string
  dangerouslySkipPermissions?: boolean
}

/**
 * 核心执行函数：调用 SDK query()，迭代 SDKMessage 并 yield SSE 事件
 */
export async function* executeChat(
  message: string,
  options: ExecuteOptions = {}
): AsyncGenerator<SSEEvent> {
  // 终止已有查询
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }

  const abortController = new AbortController()
  currentAbortController = abortController

  // 读取配置
  const settings = getSettings()
  const model = options.model || settings.model || undefined
  const sessionId = options.sessionId || settings.sessionId || undefined
  const cwd = options.cwd || settings.cwd || process.cwd()
  const skipPermissions =
    options.dangerouslySkipPermissions ?? settings.dangerouslySkipPermissions

  // 通过环境变量传递 API Key 和 Base URL（SDK 从环境变量读取）
  if (settings.apiKey) {
    process.env.ANTHROPIC_API_KEY = settings.apiKey
  }
  if (settings.apiBaseUrl) {
    process.env.ANTHROPIC_BASE_URL = settings.apiBaseUrl
  }

  // 同步启用技能到 .claude/skills/
  const enabledSkills = getEnabledSkills()
  syncClaudeSkillsDir(enabledSkills)

  yield { event: 'start', data: { requestId: Date.now().toString() } }

  // 注意：SDK 内部 bundle 的 Claude Code 不支持 --effort 参数，
  // 目前无法通过 extraArgs 传递 effort，待 SDK 原生支持后再添加

  let fullContent = ''
  let lastSessionId: string | null = sessionId || null
  let lastUsage: {
    inputTokens: number
    outputTokens: number
    cachedTokens: number
  } | null = null
  let lastCost: number | null = null
  let lastModel = ''
  let gotDone = false

  // 收集 stderr 用于错误诊断
  let stderrBuffer = ''

  const ctx = createConvertContext()

  try {
    const queryIterator = sdkQuery({
      prompt: message,
      options: {
        abortController,
        cwd,
        model: model || undefined,
        resume: sessionId || undefined,
        includePartialMessages: true,
        permissionMode: skipPermissions ? 'bypassPermissions' : 'acceptEdits',
        allowDangerouslySkipPermissions: skipPermissions || undefined,
        settingSources: ["project"],
        stderr: (data: string) => {
          stderrBuffer += data
        },
      },
    })

    for await (const msg of queryIterator) {
      if (abortController.signal.aborted) break

      const events = convertSDKMessage(msg, ctx)
      for (const parsed of events) {
        switch (parsed.kind) {
          case 'init':
            lastSessionId = parsed.sessionId
            lastModel = parsed.model
            updateSettings({ sessionId: parsed.sessionId })
            yield {
              event: 'init',
              data: { sessionId: parsed.sessionId, model: parsed.model },
            }
            break

          case 'delta':
            fullContent += parsed.content
            yield { event: 'delta', data: { content: parsed.content } }
            break

          case 'thinking':
            // 跳过 thinking 块
            break

          case 'tool_use':
            yield {
              event: 'tool_use',
              data: {
                toolUseId: parsed.toolUseId,
                toolName: parsed.toolName,
                input: parsed.input,
              },
            }
            break

          case 'tool_result':
            yield {
              event: 'tool_result',
              data: {
                toolUseId: parsed.toolUseId,
                content: parsed.content,
                isError: parsed.isError,
              },
            }
            break

          case 'done':
            gotDone = true
            lastSessionId = parsed.sessionId || lastSessionId
            lastUsage = parsed.usage
            lastCost = parsed.costUsd
            if (parsed.sessionId) {
              updateSettings({ sessionId: parsed.sessionId })
            }
            yield {
              event: 'done',
              data: {
                sessionId: lastSessionId,
                usage: lastUsage,
                costUsd: lastCost,
                model: lastModel,
                fullContent,
              },
            }
            break

          case 'error':
            yield { event: 'error', data: { message: parsed.message } }
            break
        }
      }
    }
  } catch (err) {
    if (!abortController.signal.aborted) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const detail = stderrBuffer.trim()
      const fullError = detail
        ? `SDK error: ${errMsg}\nstderr: ${detail}`
        : `SDK error: ${errMsg}`
      console.error('[GClaw SDK]', fullError)
      yield { event: 'error', data: { message: fullError } }
    }
  }

  // 如果没有正常完成且没有被中止，发送错误
  if (!gotDone && !abortController.signal.aborted) {
    yield {
      event: 'error',
      data: { message: 'Claude 查询异常结束，未收到 result 消息' },
    }
  }

  yield { event: 'end', data: {} }

  // 清理
  currentAbortController = null
}

/**
 * 中止当前运行的查询
 */
export function abortCurrentProcess(): boolean {
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
    return true
  }
  return false
}

/**
 * 获取当前查询状态
 */
export function isProcessRunning(): boolean {
  return currentAbortController !== null
}
