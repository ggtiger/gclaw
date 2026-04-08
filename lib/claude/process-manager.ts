import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk'
import type { HookCallback, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'crypto'
import path from 'path'
import { convertSDKMessage, createConvertContext } from './stream-parser'
import { syncProjectSkillsDir, loadSkillEnvVars } from './skills-dir'
import { syncProjectClaudeMd } from './claude-md'
import { loadSkillHooks, buildSkillHookMatchers } from './skill-hooks'
import { getSettings, updateProjectSettings } from '@/lib/store/settings'
import { getEnabledSkills } from '@/lib/store/skills'
import { getEnabledAgentDefinitions } from '@/lib/store/agents'
import { sanitizeForLog } from '@/lib/crypto'
import { getProjectById } from '@/lib/store/projects'
import { runConsolidation } from '@/lib/memory/consolidation'
import { writeEpisodic } from '@/lib/memory/episodic-writer'
import { extractWithLLM } from '@/lib/memory/llm-extractor'
import type { SSEEvent, PermissionRequest, AskUserQuestionRequest } from '@/types/chat'

// 全局单例状态：挂载到 globalThis 防止 Next.js HMR / 模块实例隔离导致 Map 丢失
// 参考 gclaw-events.ts 同一模式
const g = globalThis as Record<string, unknown>

const projectAbortControllers =
  (g.__gclaw_abort_controllers__ as Map<string, AbortController>) ??
  ((g.__gclaw_abort_controllers__ = new Map<string, AbortController>()) as Map<string, AbortController>)

const pendingPermissions =
  (g.__gclaw_pending_permissions__ as Map<string, (decision: 'allow' | 'deny') => void>) ??
  ((g.__gclaw_pending_permissions__ = new Map<string, (decision: 'allow' | 'deny') => void>()) as Map<string, (decision: 'allow' | 'deny') => void>)

const pendingAskQuestions =
  (g.__gclaw_pending_ask_questions__ as Map<string, (answers: Record<string, string>) => void>) ??
  ((g.__gclaw_pending_ask_questions__ = new Map<string, (answers: Record<string, string>) => void>()) as Map<string, (answers: Record<string, string>) => void>)

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

/**
 * 外部调用此函数回传用户对 AskUserQuestion 的回答
 */
export function resolveAskQuestion(requestId: string, answers: Record<string, string>) {
  const resolve = pendingAskQuestions.get(requestId)
  console.log(`[GClaw] resolveAskQuestion | requestId=${requestId} | found=${!!resolve} | mapKeys=[${Array.from(pendingAskQuestions.keys()).join(',')}]`)
  if (resolve) {
    resolve(answers)
    pendingAskQuestions.delete(requestId)
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

// 附件数据（服务端内部使用）
export interface AttachmentData {
  filename: string
  mimeType: string
  content: string           // base64（图片）或 纯文本（文档/代码）
  isImage: boolean
}

export interface ExecuteOptions {
  projectId?: string
  model?: string
  effort?: 'low' | 'medium' | 'high'
  sessionId?: string
  cwd?: string
  dangerouslySkipPermissions?: boolean
  onAskUserQuestion?: (req: AskUserQuestionRequest) => void
  attachments?: AttachmentData[]
}

/**
 * 核心执行函数：调用 SDK query()，迭代 SDKMessage 并 yield SSE 事件
 */
export async function* executeChat(
  message: string,
  options: ExecuteOptions = {},
  onPermissionRequest?: (req: PermissionRequest) => void
): AsyncGenerator<SSEEvent> {
  const onAskUserQuestion = options.onAskUserQuestion

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
  const projectDataDir = getProjectDir(projectId)
  // 安全限制：自定义 cwd 必须在项目数据目录内，防止路径逃逸
  let sdkCwd = projectDataDir
  if (cwd) {
    const resolvedCwd = path.resolve(cwd)
    const resolvedProjectDir = path.resolve(projectDataDir)
    if (resolvedCwd.startsWith(resolvedProjectDir)) {
      sdkCwd = resolvedCwd
    } else {
      console.warn(`[GClaw] Rejected unsafe cwd "${cwd}" for project ${projectId}, falling back to project dir`)
    }
  }

  // 同步项目 CLAUDE.md（系统提示词 + 用户记忆总纲 + .learnings 摘要）和初始化 .learnings/ 模板
  const projectInfo = getProjectById(projectId)
  const userId = projectInfo?.ownerId
  syncProjectClaudeMd(sdkCwd, settings.systemPrompt || '', enabledSkills, userId, projectId)

  // 加载技能 .env 环境变量，注入 SDK env
  const skillEnv = loadSkillEnvVars(enabledSkills)
  // 注入 GClaw 平台地址，供技能通过 $GCLAW_API_BASE 调用 API
  const port = process.env.PORT || '3000'
  const gclawEnv = {
    GCLAW_API_BASE: `http://localhost:${port}`,
    GCLAW_PROJECT_ID: projectId,
    GCLAW_USER_ID: userId || '',
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

  // 文件写操作工具（需要路径边界检查）
  const FILE_WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit'])

  /**
   * 安全校验：确保工具操作的文件路径在项目 cwd 内
   * 防止 Agent 在项目目录外创建/修改/删除文件
   */
  const validateToolPath = (toolName: string, toolInput: Record<string, unknown>): string | null => {
    const resolvedCwd = path.resolve(sdkCwd)

    // 文件写操作：检查 file_path/path 参数
    if (FILE_WRITE_TOOLS.has(toolName)) {
      const filePath = String(toolInput.file_path || toolInput.path || '')
      if (!filePath) return null // 无路径则不检查
      const resolvedPath = path.resolve(resolvedCwd, filePath)
      if (!resolvedPath.startsWith(resolvedCwd + path.sep) && resolvedPath !== resolvedCwd) {
        return `文件操作超出项目目录范围: ${filePath}`
      }
    }

    // Bash 命令：检查是否包含写入项目目录外的重定向/管道
    if (toolName === 'Bash') {
      const command = String(toolInput.command || '')
      if (!command) return null
      // 检测明显的绝对路径写入模式（> /path, >> /path, tee /path 等）
      const absoluteWritePatterns = [
        /\s*>\s*\//,          // > /path
        /\s*>>\s*\//,         // >> /path
        /\btee\s+\//,         // tee /path
        /\bcp\s+.*\s+\//,     // cp src /path
        /\bmv\s+.*\s+\//,     // mv src /path
        /\binstall\s+.*\s+\//, // install ... /path
      ]
      for (const pattern of absoluteWritePatterns) {
        if (pattern.test(command)) {
          // 允许写入 /tmp 和项目目录内的路径
          const tmpDir = path.resolve('/tmp')
          // 提取可能的目标路径做进一步检查
          const pathMatch = command.match(/(?:[>]{1,2}|tee\s+|cp\s+\S+\s+|mv\s+\S+\s+)(\/[^\s;|&]+)/)
          if (pathMatch) {
            const targetPath = path.resolve(pathMatch[1])
            if (targetPath.startsWith(tmpDir + path.sep) || targetPath === tmpDir) {
              continue // /tmp 是允许的
            }
            if (targetPath.startsWith(resolvedCwd + path.sep) || targetPath === resolvedCwd) {
              continue // 项目目录内是允许的
            }
            return `命令尝试写入项目目录外的路径: ${pathMatch[1]}`
          }
        }
      }
    }

    return null
  }

  // PreToolUse hook：路径边界检查 + 权限审批
  // 路径检查始终启用（独立于 skipPermissions 设置）
  const preToolUseHook: HookCallback = async (input) => {
    if (input.hook_event_name !== 'PreToolUse') return {}
    const { tool_name, tool_input } = input as { tool_name: string; tool_input: unknown; hook_event_name: string }

    const toolInput = (tool_input ?? {}) as Record<string, unknown>

    // 路径边界检查：所有写/删除操作必须在项目 cwd 内（始终启用）
    const pathError = validateToolPath(tool_name, toolInput)
    if (pathError) {
      console.warn(`[GClaw] Blocked operation outside project dir: ${pathError}`)
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse' as const,
          permissionDecision: 'deny' as const,
          permissionDecisionReason: pathError,
        },
      }
    }

    // 非危险工具或跳过权限模式时直接放行
    if (!DANGEROUS_TOOLS.has(tool_name) || skipPermissions) {
      return {}
    }

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

      // 路径安全 + 权限 Hook（始终注册，路径检查独立于权限设置）
      hooks.PreToolUse = [{ hooks: [preToolUseHook] }]

      // PermissionRequest hook：兜底拦截（仅非跳过权限模式）
      if (!skipPermissions) {
        hooks.PermissionRequest = [{ hooks: [permissionRequestHook] }]
      }

      // 技能 Hook（从 gclaw-hooks.json 加载）
      for (const [event, matchers] of Object.entries(skillHookMatchers)) {
        if (hooks[event]) {
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
    // AskUserQuestion 处理：SDK 原生回调，在 canUseTool 中拦截
    // 参考：https://platform.claude.com/docs/en/agent-sdk/user-input
    canUseTool: async (toolName: string, input: Record<string, unknown>): Promise<{ behavior: 'allow'; updatedInput: Record<string, unknown> } | { behavior: 'deny'; message: string }> => {
      if (toolName === 'AskUserQuestion') {
        const questions = Array.isArray(input.questions) ? input.questions : []
        const reqId = randomUUID()
        console.log(`[GClaw] canUseTool: AskUserQuestion | reqId=${reqId} | questions=${questions.length}`)

        // 通知前端展示问题对话框
        if (onAskUserQuestion) {
          onAskUserQuestion({ requestId: reqId, questions: questions as AskUserQuestionRequest['questions'] })
        }

        // 等待用户回答（5 分钟超时）
        const answers = await new Promise<Record<string, string>>((resolve) => {
          pendingAskQuestions.set(reqId, resolve)
          setTimeout(() => {
            if (pendingAskQuestions.has(reqId)) {
              // 超时：默认选第一个选项
              const defaultAnswers: Record<string, string> = {}
              for (const q of questions as Array<{ question: string; options: Array<{ label: string }> }>) {
                defaultAnswers[q.question] = q.options[0]?.label || ''
              }
              resolve(defaultAnswers)
              pendingAskQuestions.delete(reqId)
              console.log(`[GClaw] AskUserQuestion timeout, auto-responded: ${reqId}`)
            }
          }, 300000)
        })

        console.log(`[GClaw] AskUserQuestion answered | reqId=${reqId}`)

        // SDK 要求：返回 allow + updatedInput（带 questions 和 answers）
        return {
          behavior: 'allow' as const,
          updatedInput: {
            questions,
            answers,
          },
        }
      }

      // 其他工具放行（权限控制由 hooks.PreToolUse 处理）
      return {
        behavior: 'allow' as const,
        updatedInput: input,
      }
    },
  })

  // 构建 prompt：有附件时使用 AsyncIterable<SDKUserMessage>，否则保持 string
  const buildPrompt = (resumeId?: string): string | AsyncIterable<SDKUserMessage> => {
    if (!options.attachments || options.attachments.length === 0) {
      return message
    }

    // 构建多模态 content blocks
    const contentBlocks: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = []

    // 主文本
    if (message) {
      contentBlocks.push({ type: 'text', text: message })
    }

    // 附件内容
    for (const att of options.attachments) {
      if (att.isImage) {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: att.mimeType,
            data: att.content,
          },
        })
      } else {
        contentBlocks.push({
          type: 'text',
          text: `--- File: ${att.filename} ---\n${att.content}\n--- End of ${att.filename} ---`,
        })
      }
    }

    // 使用 AsyncIterable 模式
    async function* messageStream(): AsyncIterable<SDKUserMessage> {
      yield {
        type: 'user',
        session_id: resumeId || '',
        message: { role: 'user', content: contentBlocks },
        parent_tool_use_id: null,
      }
    }
    return messageStream()
  }

  // 启动 SDK 查询，支持 sessionId 失效时自动重试
  let retried = false

  async function* runQuery(resumeId?: string): AsyncGenerator<SSEEvent> {
    const prompt = buildPrompt(resumeId)
    const qi = sdkQuery({ prompt, options: buildSdkOptions(resumeId) })
    let msgIdx = 0

    for await (const msg of qi) {
      if (abortController.signal.aborted) break
      msgIdx++

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

  // 对话结束后自动记忆 + 巩固（async 不阻塞响应返回）
  if (gotDone && userId) {
    autoRecordAndConsolidate(userId, projectId, message, fullContent)
      .catch(err => console.warn('[GClaw] Auto memory record failed:', err))
  }

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
 * 对话结束后自动记忆 + 巩固
 * 1. 从用户消息中提取关键信息，写入情节记忆
 * 2. 触发巩固引擎，将情节记忆提炼为语义/程序记忆
 * 3. 刷新总纲
 */
async function autoRecordAndConsolidate(
  userId: string,
  projectId: string,
  userMessage: string,
  assistantReply: string
): Promise<void> {
  // ── 1. 自动提取情节记忆：LLM 提取 → 正则降级 ──
  let episodicEntries = await extractWithLLM(userMessage, assistantReply, projectId)

  if (episodicEntries) {
    console.log(`[GClaw] LLM extracted ${episodicEntries.length} episodic entries`)
  } else {
    // LLM 失败或无 API Key，降级到正则匹配
    episodicEntries = extractEpisodicFromConversation(userMessage, assistantReply, projectId)
    console.log(`[GClaw] Regex extracted ${episodicEntries.length} episodic entries (fallback)`)
  }

  for (const entry of episodicEntries) {
    // 只写用户级，不写项目级（避免重复巩固）
    writeEpisodic(userId, entry)
    console.log(`[GClaw] Auto-recorded episodic: type=${entry.type} summary="${entry.summary.slice(0, 60)}"`)
  }

  // ── 2. 巩固（情节 → 语义/程序）──
  const result = runConsolidation(userId, projectId)
  if (result.semanticCreated > 0 || result.proceduralCreated > 0) {
    console.log(`[GClaw] Memory consolidated: ${result.semanticCreated} semantic, ${result.proceduralCreated} procedural, ${result.episodicPromoted} episodic entries`)
  }

  // ── 3. 刷新总纲（LLM 提练 → 降级模板）──
  if (result.semanticCreated > 0 || result.proceduralCreated > 0) {
    const { refreshOverviewAsync } = await import('@/lib/memory/injection')
    await refreshOverviewAsync(userId)
  }
}

/**
 * 从对话内容中提取情节记忆条目
 * 使用关键词匹配 + 模式识别，不依赖 LLM
 */
function extractEpisodicFromConversation(
  userMessage: string,
  assistantReply: string,
  _projectId: string
): Array<Omit<import('@/types/memory').EpisodicEntry, 'id' | 'timestamp'>> {
  const msg = userMessage.toLowerCase()
  const reply = assistantReply.slice(0, 500)

  // 提取消息中有意义的关键词（用于标签）
  const contextTags = extractContextTags(userMessage)

  // ── 优先级互斥：preference > decision > error > action ──
  // 每条消息最多提取一个类型

  // ── 1. 偏好检测：用户表达喜欢/不喜欢/要求用/不要用 ──
  const preferencePatterns: Array<{ pattern: RegExp; extractTitle: (m: RegExpMatchArray) => string }> = [
    {
      // "不要使用websearch" / "别用xxx"
      pattern: /(?:不要|别|禁止|avoid)\s*(?:使用|用)?\s*(.+?)(?:，|,|$)/i,
      extractTitle: (m) => `不使用${m[1].trim()}`,
    },
    {
      // "使用百度skill" / "喜欢Java" / "用React"
      pattern: /(?:使用|prefer|喜欢|偏好)\s*(.+?)(?:来|进行|做|查询|搜索|$)/i,
      extractTitle: (m) => `偏好${m[1].trim()}`,
    },
    {
      // "我是Java开发者" / "我用Java" / "我是老师"
      pattern: /(?:我是|我用|我是做)\s*(.+?)(?:的|$)/i,
      extractTitle: (m) => {
        const raw = m[1].trim()
        const hasRoleSuffix = /(?:开发|工程师|者|师|员|家|生)$/.test(raw)
        return hasRoleSuffix ? `用户是${raw}` : `用户使用${raw}`
      },
    },
  ]

  for (const { pattern, extractTitle } of preferencePatterns) {
    const match = userMessage.match(pattern)
    if (match) {
      return [{
        projectId: _projectId,
        type: 'preference',
        summary: extractTitle(match),
        detail: userMessage.slice(0, 200),
        tags: ['auto-extracted', 'preference', ...contextTags],
        source: 'hook',
      }]
    }
  }

  // ── 2. 决策检测：决定/选择/采用（需要更强上下文） ──
  const decisionPatterns = [
    /(?:决定|采用|切换到|迁移到|升级到)\s*(.{2,30})/i,
    /(?:选择)\s*(?:使用|了|用)\s*(.{2,30})/i,  // "选择使用X" 而非单纯 "选择"
  ]
  for (const pattern of decisionPatterns) {
    const match = userMessage.match(pattern)
    if (match) {
      return [{
        projectId: _projectId,
        type: 'decision',
        summary: userMessage.slice(0, 200),
        detail: reply.slice(0, 200),
        tags: ['auto-extracted', 'decision', ...contextTags],
        source: 'hook',
      }]
    }
  }

  // ── 3. 错误检测：需要自然语言上下文，排除代码片段中的 error ──
  const errorPatterns = [
    /(?:报错|出错了|失败了|崩溃|crash)/i,                          // 明确的错误报告
    /(?:遇到|出现|碰到|发现)\s*(?:了)?\s*(?:错误|bug|问题|异常)/i, // "遇到了错误"
    /(?:error|exception|bug).*(?:怎么|如何|为什么|帮|解决|修)/i,    // "error怎么解决"
  ]
  for (const pattern of errorPatterns) {
    if (pattern.test(msg)) {
      return [{
        projectId: _projectId,
        type: 'error',
        summary: userMessage.slice(0, 200),
        detail: reply.slice(0, 300),
        tags: ['auto-extracted', 'error', ...contextTags],
        source: 'hook',
      }]
    }
  }

  // ── 4. 兜底：通用 action ──
  if (userMessage.trim().length > 5) {
    return [{
      projectId: _projectId,
      type: 'action',
      summary: userMessage.slice(0, 200),
      detail: reply.slice(0, 300),
      tags: ['auto-extracted', 'conversation', ...contextTags],
      source: 'hook',
    }]
  }

  return []
}

/**
 * 从用户消息中提取有意义的上下文标签
 * 用于巩固时的 groupByTags 分组，避免所有条目标签相同
 */
function extractContextTags(text: string): string[] {
  const tags: string[] = []
  // 提取技术词汇（常见技术栈关键词）
  const techPatterns = /\b(?:React|Vue|Next\.?js|Node|Java|Python|Go|Rust|TypeScript|TS|Docker|K8s|Redis|MySQL|PostgreSQL|MongoDB|Tailwind|CSS|HTML|API|SDK|Git|CI|CD|Webpack|Vite|Tauri|Electron)\b/gi
  const matches = text.match(techPatterns)
  if (matches) {
    const unique = [...new Set(matches.map(m => m.toLowerCase()))]
    tags.push(...unique.slice(0, 3))
  }
  // 提取中文关键名词（2-4字，去掉常见停用词）
  const cnWords = text.match(/[\u4e00-\u9fa5]{2,4}/g) || []
  const stopWords = new Set(['不要', '使用', '可以', '需要', '应该', '已经', '这个', '那个', '什么', '怎么', '如何', '为什么', '帮我', '请问', '一下', '一些', '我们', '你们', '他们', '现在', '之前', '之后', '时候'])
  const meaningful = cnWords.filter(w => !stopWords.has(w))
  if (meaningful.length > 0) {
    tags.push(...meaningful.slice(0, 2))
  }
  return tags
}

export function isProcessRunning(): boolean {
  return projectAbortControllers.size > 0
}
