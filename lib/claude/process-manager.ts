import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk'
import type { HookCallback } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'crypto'
import { convertSDKMessage, createConvertContext } from './stream-parser'
import { syncProjectSkillsDir, loadSkillEnvVars } from './skills-dir'
import { syncProjectClaudeMd } from './claude-md'
import { loadSkillHooks, buildSkillHookMatchers } from './skill-hooks'
import { getSettings, updateProjectSettings } from '@/lib/store/settings'
import { getEnabledSkills } from '@/lib/store/skills'
import { getEnabledAgentDefinitions } from '@/lib/store/agents'
import { sanitizeForLog } from '@/lib/crypto'
import type { SSEEvent, PermissionRequest } from '@/types/chat'

// 模块级状态：per-project AbortController，支持多项目并发执行
const projectAbortControllers = new Map<string, AbortController>()

// 权限等待机制：requestId -> resolve 函数
const pendingPermissions = new Map<string, (decision: 'allow' | 'deny') => void>()

/**
 * 外部调用此函数回传用户的权限决策
 */
export function resolvePermission(requestId: string, decision: 'allow' | 'deny') {
  const resolve = pendingPermissions.get(requestId)
  if (resolve) {
    resolve(decision)
    pendingPermissions.delete(requestId)
  }
}

// 生成人类可读的操作描述
function describeToolAction(toolName: string, toolInput: Record<string, unknown>): string {
  switch (toolName) {
    case 'Bash':
      return `执行命令: ${String(toolInput.command || '').slice(0, 200)}`
    case 'Write':
      return `写入文件: ${toolInput.file_path || toolInput.path || '未知路径'}`
    case 'Edit':
      return `编辑文件: ${toolInput.file_path || toolInput.path || '未知路径'}`
    case 'MultiEdit':
      return `批量编辑文件: ${toolInput.file_path || toolInput.path || '未知路径'}`
    default:
      return `${toolName}: ${JSON.stringify(toolInput).slice(0, 150)}`
  }
}

export interface ExecuteOptions {
  projectId?: string
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
  options: ExecuteOptions = {},
  onPermissionRequest?: (req: PermissionRequest) => void
): AsyncGenerator<SSEEvent> {
  // 终止同一项目的已有查询（不影响其他项目）
  const projectId = options.projectId || ''
  const existingController = projectAbortControllers.get(projectId)
  if (existingController) {
    existingController.abort()
    projectAbortControllers.delete(projectId)
  }

  const abortController = new AbortController()
  projectAbortControllers.set(projectId, abortController)

  // 读取配置
  const settings = getSettings(projectId)
  const model = options.model || settings.model || undefined
  const sessionId = options.sessionId || settings.sessionId || undefined
  const cwd = options.cwd || settings.cwd || undefined
  const skipPermissions =
    options.dangerouslySkipPermissions ?? settings.dangerouslySkipPermissions

  // 通过环境变量传递 API Key 和 Base URL（SDK 从环境变量读取）
  // 不在日志中输出完整 API Key
  if (settings.apiKey) {
    process.env.ANTHROPIC_API_KEY = settings.apiKey
  }
  if (settings.apiBaseUrl) {
    process.env.ANTHROPIC_BASE_URL = settings.apiBaseUrl
  }

  // 同步启用技能到项目独立的 .claude/skills/（不碰根目录）
  const enabledSkills = getEnabledSkills(projectId)
  syncProjectSkillsDir(enabledSkills, projectId)

  // SDK cwd：优先用户配置的 cwd，否则用项目数据目录（避免在根目录产生 .claude）
  const { getProjectDir } = await import('@/lib/store/projects')
  const sdkCwd = cwd || getProjectDir(projectId)

  // 同步项目 CLAUDE.md（系统提示词 + .learnings 摘要）和初始化 .learnings/ 模板
  syncProjectClaudeMd(sdkCwd, settings.systemPrompt || '', enabledSkills)

  // 加载技能 .env 环境变量，注入 SDK env
  const skillEnv = loadSkillEnvVars(enabledSkills)
  // 注入 GClaw 平台地址，供技能通过 $GCLAW_API_BASE 调用 API
  const port = process.env.PORT || '3000'
  const gclawEnv = {
    GCLAW_API_BASE: `http://localhost:${port}`,
    GCLAW_PROJECT_ID: projectId,
  }
  const sdkEnv: Record<string, string | undefined> = { ...process.env, ...skillEnv, ...gclawEnv }

  // 加载启用的子 Agent 定义
  const agentDefs = getEnabledAgentDefinitions(projectId)

  // 加载技能 Hook 声明，构建 SDK HookCallbackMatcher
  const skillHookEntries = loadSkillHooks(enabledSkills)
  const skillHookMatchers = buildSkillHookMatchers(skillHookEntries, projectId)

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

  // 需要权限确认的工具列表
  const DANGEROUS_TOOLS = new Set(['Bash', 'Write', 'Edit', 'MultiEdit', 'Skill'])

  // PreToolUse hook：在工具执行前拦截危险操作，等待用户审批
  const preToolUseHook: HookCallback = async (input) => {
    if (input.hook_event_name !== 'PreToolUse') return {}
    const { tool_name, tool_input } = input as { tool_name: string; tool_input: unknown; hook_event_name: string }

    // 非危险工具直接放行
    if (!DANGEROUS_TOOLS.has(tool_name)) {
      return {}
    }

    const toolInput = (tool_input ?? {}) as Record<string, unknown>
    const reqId = randomUUID()

    console.log(`[GClaw] PreToolUse permission request: ${tool_name} | reqId=${reqId}`)

    // 通过回调通知前端
    if (onPermissionRequest) {
      onPermissionRequest({
        requestId: reqId,
        toolName: tool_name,
        toolInput,
        description: describeToolAction(tool_name, toolInput),
      })
    }

    // 等待用户决策（60 秒超时自动拒绝）
    const decision = await new Promise<'allow' | 'deny'>((resolve) => {
      pendingPermissions.set(reqId, resolve)
      setTimeout(() => {
        if (pendingPermissions.has(reqId)) {
          resolve('deny')
          pendingPermissions.delete(reqId)
          console.log(`[GClaw] Permission timeout, auto-denied: ${reqId}`)
        }
      }, 60000)
    })

    console.log(`[GClaw] PreToolUse decision: ${decision} | reqId=${reqId}`)

    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse' as const,
        permissionDecision: decision,
        permissionDecisionReason: decision === 'deny' ? '用户拒绝了此操作' : undefined,
      },
    }
  }

  // PermissionRequest hook：作为兜底，拦截 SDK 内置权限请求
  const permissionRequestHook: HookCallback = async (input) => {
    if (input.hook_event_name !== 'PermissionRequest') return {}
    const { tool_name, tool_input } = input as { tool_name: string; tool_input: unknown; hook_event_name: string }
    const toolInput = (tool_input ?? {}) as Record<string, unknown>
    const reqId = randomUUID()

    console.log(`[GClaw] PermissionRequest hook: ${tool_name} | reqId=${reqId}`)

    if (onPermissionRequest) {
      onPermissionRequest({
        requestId: reqId,
        toolName: tool_name,
        toolInput,
        description: describeToolAction(tool_name, toolInput),
      })
    }

    const decision = await new Promise<'allow' | 'deny'>((resolve) => {
      pendingPermissions.set(reqId, resolve)
      setTimeout(() => {
        if (pendingPermissions.has(reqId)) {
          resolve('deny')
          pendingPermissions.delete(reqId)
        }
      }, 60000)
    })

    return {
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest' as const,
        decision: decision === 'allow'
          ? { behavior: 'allow' as const }
          : { behavior: 'deny' as const, message: '用户拒绝了此操作' },
      },
    }
  }

  // 构建 SDK 查询选项
  const buildSdkOptions = (resumeSessionId?: string) => ({
    abortController,
    cwd: sdkCwd,
    model: model || undefined,
    resume: resumeSessionId || undefined,
    includePartialMessages: true,
    // 始终用 bypassPermissions 绕过 SDK 内置权限系统
    // 当 skipPermissions=false 时，通过 PreToolUse hook 实现自定义权限审批
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    settingSources: ["project" as const],
    env: sdkEnv,
    agents: Object.keys(agentDefs).length > 0 ? agentDefs : undefined,
    hooks: (() => {
      const hooks: Record<string, Array<{ hooks: HookCallback[] }>> = {}

      // 权限 Hook（已有逻辑不变）
      if (!skipPermissions) {
        hooks.PreToolUse = [{ hooks: [preToolUseHook] }]
      }

      // 技能 Hook（从 gclaw-hooks.json 加载）
      for (const [event, matchers] of Object.entries(skillHookMatchers)) {
        if (hooks[event]) {
          // 合并到已有的 matcher 列表
          hooks[event].push(...matchers)
        } else {
          hooks[event] = matchers
        }
      }

      return Object.keys(hooks).length > 0 ? hooks : undefined
    })(),
    stderr: (data: string) => {
      stderrBuffer += sanitizeForLog(data)
    },
  })

  // 启动 SDK 查询，支持 sessionId 失效时自动重试
  let retried = false

  async function* runQuery(resumeId?: string): AsyncGenerator<SSEEvent> {
    const qi = sdkQuery({ prompt: message, options: buildSdkOptions(resumeId) })

    for await (const msg of qi) {
      if (abortController.signal.aborted) break

      const events = convertSDKMessage(msg, ctx)
      for (const parsed of events) {
        switch (parsed.kind) {
          case 'init':
            lastSessionId = parsed.sessionId
            lastModel = parsed.model
            updateProjectSettings(projectId, { sessionId: parsed.sessionId })
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
            yield { event: 'thinking', data: { content: parsed.content } }
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

          case 'tool_progress':
            yield {
              event: 'tool_progress',
              data: {
                toolUseId: parsed.toolUseId,
                toolName: parsed.toolName,
                elapsedSeconds: parsed.elapsedSeconds,
              },
            }
            break

          case 'status':
            yield {
              event: 'status',
              data: { status: parsed.status },
            }
            break

          case 'compact_boundary':
            // 压缩边界信息仅日志记录
            console.log(`[GClaw] Compact boundary: trigger=${parsed.trigger}, preTokens=${parsed.preTokens}`)
            break

          case 'hook_response':
            // hook 脚本执行结果仅日志记录（stderr 有内容时警告）
            if (parsed.stderr) {
              console.warn(`[GClaw] Hook "${parsed.hookName}" stderr:`, parsed.stderr)
            }
            break

          case 'done':
            gotDone = true
            lastSessionId = parsed.sessionId || lastSessionId
            lastUsage = parsed.usage
            lastCost = parsed.costUsd
            if (parsed.sessionId) {
              updateProjectSettings(projectId, { sessionId: parsed.sessionId })
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
  }

  try {
    yield* runQuery(sessionId || undefined)
  } catch (err) {
    if (!abortController.signal.aborted) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const detail = stderrBuffer.trim()
      const isSessionNotFound = errMsg.includes('No conversation found') ||
        detail.includes('No conversation found')

      if (isSessionNotFound && sessionId && !retried) {
        // sessionId 失效，清除后重试
        console.warn(`[GClaw] Session ${sessionId} not found, retrying without resume...`)
        updateProjectSettings(projectId, { sessionId: '' })
        stderrBuffer = ''
        retried = true
        try {
          yield* runQuery(undefined)
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
          console.error('[GClaw SDK retry]', sanitizeForLog(retryMsg))
          yield { event: 'error', data: { message: `SDK error: ${retryMsg}` } }
        }
      } else {
        const fullError = detail
          ? sanitizeForLog(`SDK error: ${errMsg}\nstderr: ${detail}`)
          : sanitizeForLog(`SDK error: ${errMsg}`)
        console.error('[GClaw SDK]', fullError)
        yield { event: 'error', data: { message: fullError } }
      }
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
  projectAbortControllers.delete(projectId)
}

/**
 * 中止指定项目的查询
 */
export function abortProcess(projectId: string): boolean {
  const controller = projectAbortControllers.get(projectId)
  if (controller) {
    controller.abort()
    projectAbortControllers.delete(projectId)
    return true
  }
  return false
}

/**
 * 中止所有项目的查询（向后兼容）
 */
export function abortCurrentProcess(): boolean {
  if (projectAbortControllers.size === 0) return false
  for (const [id, controller] of projectAbortControllers) {
    controller.abort()
    projectAbortControllers.delete(id)
  }
  return true
}

/**
 * 获取指定项目的查询状态
 */
export function isProjectRunning(projectId: string): boolean {
  return projectAbortControllers.has(projectId)
}

/**
 * 获取所有运行中的项目 ID
 */
export function getRunningProjects(): string[] {
  return Array.from(projectAbortControllers.keys())
}

/**
 * 获取是否有任何查询在运行
 */
export function isProcessRunning(): boolean {
  return projectAbortControllers.size > 0
}
