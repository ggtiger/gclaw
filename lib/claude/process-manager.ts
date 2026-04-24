import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk'
import type { HookCallback, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { convertSDKMessage, createConvertContext } from './stream-parser'
import { syncProjectSkillsDir, loadSkillEnvVars } from './skills-dir'
import { syncProjectClaudeMd } from './claude-md'
import { loadSkillHooks, buildSkillHookMatchers } from './skill-hooks'
import { getSettings, updateProjectSettings, getProjectSettings, getGlobalSettings, resolveProviderConfig } from '@/lib/store/settings'
import { getEnabledSkills } from '@/lib/store/skills'
import { getEnabledAgentDefinitions } from '@/lib/store/agents'
import { sanitizeForLog } from '@/lib/crypto'
import { getProjectById } from '@/lib/store/projects'
import { writeEpisodic } from '@/lib/memory/episodic-writer'
import { getPromptTemplate } from '@/lib/store/prompt-templates'
import { extractWithLLM } from '@/lib/memory/llm-extractor'
import { runConsolidation } from '@/lib/memory/consolidation'
import type { SSEEvent, PermissionRequest, AskUserQuestionRequest } from '@/types/chat'
import { logger } from '@/lib/logger'

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
  logger.info(`[GClaw] resolveAskQuestion | requestId=${requestId} | found=${!!resolve} | mapKeys=[${Array.from(pendingAskQuestions.keys()).join(',')}]`)
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
  localPath?: string        // 本地绝对路径，供 Agent 工具访问
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
  const globalSettings = getGlobalSettings()
  const providerConfig = resolveProviderConfig(projectId)

  // 模型优先级：options > 项目设置 > 全局默认模型
  let model = options.model || settings.model || globalSettings.defaultModel || undefined
  // openai-compatible 供应商：SDK 发的模型名会被代理替换为供应商配置的模型名
  // 因此这里不需要覆盖 model，但记录日志方便排查
  if (providerConfig.providerType === 'openai-compatible' && providerConfig.providerId) {
    const provider = (globalSettings.providers || []).find(p => p.id === providerConfig.providerId)
    if (provider?.model) {
      logger.info(`[GClaw] OpenAI-compatible 代理将替换模型: ${model} → ${provider.model}`)
    }
  }
  const sessionId = options.sessionId || settings.sessionId || undefined
  const cwd = options.cwd || settings.cwd || undefined
  const skipPermissions =
    options.dangerouslySkipPermissions ?? settings.dangerouslySkipPermissions

  // 通过环境变量传递 API Key 和 Base URL（SDK 从环境变量读取）
  // 不在日志中输出完整 API Key

  // openai-compatible 供应商：通过内置协议代理转换（SDK 只支持 Anthropic 协议）
  // 将 ANTHROPIC_BASE_URL 指向本地代理路由，SDK 发出的 /v1/messages 请求自动走代理
  if (providerConfig.providerType === 'openai-compatible') {
    const port = process.env.PORT || '3000'
    const providerId = providerConfig.providerId || ''
    process.env.ANTHROPIC_BASE_URL = `http://localhost:${port}/api/proxy/${providerId}`
    // 代理路由从 provider 配置中读取 apiKey 转发，SDK 发送的 x-api-key 不做校验
    process.env.ANTHROPIC_API_KEY = 'proxy-placeholder'
    logger.info(`[GClaw] OpenAI-compatible 供应商走本地代理: ${process.env.ANTHROPIC_BASE_URL}`)
  } else {
    if (providerConfig.apiKey) {
      process.env.ANTHROPIC_API_KEY = providerConfig.apiKey
    }
    if (providerConfig.baseUrl) {
      process.env.ANTHROPIC_BASE_URL = providerConfig.baseUrl
    }
  }
  logger.info(`[GClaw] 执行查询: projectId=${projectId || '(无)'} | model=${model || '(SDK默认)'} | baseUrl=${process.env.ANTHROPIC_BASE_URL || '(Anthropic默认)'} | sessionId=${sessionId || '(新建)'}`)

  // 同步启用技能到项目独立的 .claude/skills/（不碰根目录）
  const enabledSkills = getEnabledSkills(projectId)
  syncProjectSkillsDir(enabledSkills, projectId)

  // SDK cwd：优先用户配置的 cwd，否则用项目数据目录（避免在根目录产生 .claude）
  const { getProjectDir } = await import('@/lib/store/projects')
  const projectDataDir = getProjectDir(projectId)
  let sdkCwd = projectDataDir
  if (cwd) {
    const resolvedCwd = path.resolve(cwd)
    // cwd 是项目在 settings.json 中持久化的配置，只要目录存在就信任使用
    if (fs.existsSync(resolvedCwd)) {
      sdkCwd = resolvedCwd
    } else {
      logger.warn(`[GClaw] Configured cwd "${resolvedCwd}" does not exist, falling back to project dir`)
    }
  }

  // 同步项目 CLAUDE.md（系统提示词 + 用户记忆总纲 + .learnings 摘要 + 主动检索记忆）和初始化 .learnings/ 模板
  const projectInfo = getProjectById(projectId)
  const userId = projectInfo?.ownerId
  syncProjectClaudeMd(sdkCwd, settings.systemPrompt || '', enabledSkills, userId, projectId, message, globalSettings.defaultSystemPrompt || '')

  // 加载技能 .env 环境变量，注入 SDK env
  const skillEnv = loadSkillEnvVars(enabledSkills)
  // 注入 GClaw 平台地址，供技能通过 $GCLAW_API_BASE 调用 API
  const port = process.env.PORT || '3000'
  const gclawEnv: Record<string, string | undefined> = {
    GCLAW_API_BASE: `http://localhost:${port}`,
    GCLAW_PROJECT_ID: projectId,
    GCLAW_USER_ID: userId || '',
    GCLAW_INTERNAL_API_KEY: process.env.INTERNAL_API_KEY || 'gclaw-internal-api-key',
  }
  // Windows 强制 UTF-8 编码，防止 curl 等工具传中文时出现乱码
  if (process.platform === 'win32') {
    gclawEnv.PYTHONIOENCODING = 'utf-8'
    gclawEnv.CHCP = '65001'
    gclawEnv.LANG = 'en_US.UTF-8'
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

    // Bash 命令：提取所有绝对路径，检查是否有写入项目目录外的操作
    if (toolName === 'Bash') {
      const command = String(toolInput.command || '')
      if (!command) return null

      // 允许的系统/临时路径前缀（只读或安全的写入目标）
      const ALLOWED_PREFIXES = ['/tmp', '/dev/null', '/usr', '/bin', '/sbin', '/lib', '/etc', '/var', '/proc', '/sys', '/opt']

      // 提取命令中所有绝对路径
      const absPaths = [...command.matchAll(/(?:^|[\s;|&()'"`])(\/[a-zA-Z0-9_.\/-]+)/g)].map(m => m[1])
      for (const rawPath of absPaths) {
        const resolved = path.resolve(rawPath)
        // 跳过允许的系统路径
        if (ALLOWED_PREFIXES.some(p => resolved.startsWith(p + '/') || resolved === p)) continue
        // 跳过项目目录内的路径
        if (resolved.startsWith(resolvedCwd + path.sep) || resolved === resolvedCwd) continue
        // 路径在项目目录外且不是系统路径 → 阻止
        return `命令引用了项目目录外的路径: ${rawPath}（项目目录: ${resolvedCwd}）`
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
      logger.warn(`[GClaw] Blocked operation outside project dir: ${pathError}`)
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

    logger.info(`[GClaw] PreToolUse permission request: ${tool_name} | reqId=${reqId}`)

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
          logger.info(`[GClaw] Permission timeout, auto-denied: ${reqId}`)
        }
      }, 60000)
    })

    logger.info(`[GClaw] PreToolUse decision: ${decision} | reqId=${reqId}`)

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

    logger.info(`[GClaw] PermissionRequest hook: ${tool_name} | reqId=${reqId}`)

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
        logger.info(`[GClaw] canUseTool: AskUserQuestion | reqId=${reqId} | questions=${questions.length}`)

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
              logger.info(`[GClaw] AskUserQuestion timeout, auto-responded: ${reqId}`)
            }
          }, 300000)
        })

        logger.info(`[GClaw] AskUserQuestion answered | reqId=${reqId}`)

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
    const contentBlocks: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
    > = []

    // 主文本
    if (message) {
      contentBlocks.push({ type: 'text', text: message })
    }

    // 附件内容
    for (const att of options.attachments) {
      const pathInfo = att.localPath ? `\n本地路径: ${att.localPath}` : ''
      if (att.isImage) {
        // 图片：先附带文本描述（兜底不支持图片的模型），再发送 base64 图片数据
        const approxSizeKB = Math.round(att.content.length * 0.75 / 1024)
        const imageTemplate = getPromptTemplate('attachmentImage')
        const imageText = imageTemplate
          .replace('{filename}', att.filename)
          .replace('{mimeType}', att.mimeType)
          .replace('{sizeKB}', String(approxSizeKB))
          .replace('{pathInfo}', pathInfo)
        contentBlocks.push({
          type: 'text',
          text: imageText,
        })
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: att.mimeType,
            data: att.content,
          },
        })
      } else {
        const fileTemplate = getPromptTemplate('attachmentFile')
        const fileText = fileTemplate
          .replace(/\{filename\}/g, att.filename)
          .replace('{pathInfo}', pathInfo)
          .replace('{content}', att.content)
        contentBlocks.push({
          type: 'text',
          text: fileText,
        })
      }
    }

    // 使用 AsyncIterable 模式
    async function* messageStream(): AsyncIterable<SDKUserMessage> {
      yield {
        type: 'user',
        session_id: resumeId || '',
        message: { role: 'user', content: contentBlocks as any },
        parent_tool_use_id: null,
      }
    }
    return messageStream()
  }

  // 启动 SDK 查询，支持 sessionId 失效时自动重试
  let retried = false

  async function* runQuery(resumeId?: string): AsyncGenerator<SSEEvent> {
    const prompt = buildPrompt(resumeId)

    // 记录完整提示词到日志文件
    logAiPrompt({
      projectId,
      sdkCwd,
      message,
      attachments: options.attachments,
      model,
      sessionId: resumeId || lastSessionId,
      sdkOptions: {
        cwd: sdkCwd,
        resume: !!resumeId,
      },
    })

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

          case 'tool_use': {
            // 对于 Edit/MultiEdit/Write 工具，计算 old_string 在原文件中的起始行号
            let startLine: number | undefined
            let writeOverwrite: { fileExists: boolean; oldContent?: string } | undefined
            const toolInput = parsed.input || {}
            const toolNames = ['Edit', 'MultiEdit', 'Write']
            if (toolNames.includes(parsed.toolName)) {
              const filePath = (toolInput.file_path || toolInput.path || '') as string
              if (filePath) {
                const absPath = path.isAbsolute(filePath) ? filePath : path.join(sdkCwd, filePath)
                try {
                  if (parsed.toolName === 'Write') {
                    startLine = 1
                    if (fs.existsSync(absPath)) {
                      writeOverwrite = { fileExists: true, oldContent: fs.readFileSync(absPath, 'utf-8') }
                    }
                  } else {
                    const fileContent = fs.readFileSync(absPath, 'utf-8')
                    const searchStr = parsed.toolName === 'MultiEdit'
                      ? ((toolInput.edits as Array<Record<string, string>>)?.[0]?.old_string || '')
                      : (toolInput.old_string as string || '')
                    if (searchStr) {
                      const idx = fileContent.indexOf(searchStr)
                      if (idx >= 0) {
                        startLine = fileContent.substring(0, idx).split('\n').length
                      }
                    }
                  }
                } catch { /* 文件不存在或不可读，忽略 */ }
              }
            }
            yield {
              event: 'tool_use',
              data: {
                toolUseId: parsed.toolUseId,
                toolName: parsed.toolName,
                input: parsed.input,
                startLine,
                ...(writeOverwrite || {}),
              },
            }
            break
          }

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
            logger.info(`[GClaw] Compact boundary: trigger=${parsed.trigger}, preTokens=${parsed.preTokens}`)
            break

          case 'hook_response':
            // hook 脚本执行结果仅日志记录（stderr 有内容时警告）
            if (parsed.stderr) {
              logger.warn(`[GClaw] Hook "${parsed.hookName}" stderr:`, parsed.stderr)
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
        logger.warn(`[GClaw] Session ${sessionId} not found, retrying without resume...`)
        updateProjectSettings(projectId, { sessionId: '' })
        stderrBuffer = ''
        retried = true
        try {
          yield* runQuery(undefined)
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
          logger.error('[GClaw SDK retry]', sanitizeForLog(retryMsg))
          yield { event: 'error', data: { message: `SDK error: ${retryMsg}` } }
        }
      } else {
        const fullError = detail
          ? sanitizeForLog(`SDK error: ${errMsg}\nstderr: ${detail}`)
          : sanitizeForLog(`SDK error: ${errMsg}`)
        logger.error('[GClaw SDK]', fullError)
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

  // 对话结束后自动从用户消息中提取记忆（不含 AI 回复内容）
  if (gotDone && userId) {
    autoRecordFromUserMessage(userId, projectId, message)
      .catch(err => logger.warn('[GClaw] Auto memory record failed:', err))
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
 * 对话结束后仅从用户消息中提取记忆（不含 AI 回复）
 * 策略：轻量启发式过滤 → LLM 判断是否有记忆价值 → 巩固
 */
async function autoRecordFromUserMessage(
  userId: string,
  projectId: string,
  userMessage: string
): Promise<void> {
  // 轻量过滤：跳过明显无价值的消息
  if (!isWorthExtracting(userMessage)) return

  // LLM 提取（只传用户消息，AI 回复传空）
  // LLM prompt 已包含"只提取有长期价值的信息，跳过日常闲聊，宁缺毋滥"
  const entries = await extractWithLLM(userMessage, '', projectId)

  if (entries && entries.length > 0) {
    for (const entry of entries) {
      writeEpisodic(userId, entry)
      logger.info(`[GClaw] Auto-recorded from user message: type=${entry.type} summary="${entry.summary.slice(0, 60)}"`)
    }
  }
  // LLM 未提取到 → 说明 LLM 判断无记忆价值，不降级到正则

  // 巩固 + 刷新总纲
  const result = runConsolidation(userId, projectId)
  if (result.semanticCreated > 0 || result.proceduralCreated > 0) {
    const { refreshOverviewAsync } = await import('@/lib/memory/injection')
    await refreshOverviewAsync(userId)
  }
}

// 明显无记忆价值的消息模式（只过滤最明显的，其余交给 LLM 判断）
const NOISE_PATTERNS = [
  /^[\s\S]{0,4}$/,                           // 4 字以内
  /^(好的|好|收到|明白|ok|OK|嗯|哦|行|可以|谢谢|感谢|不用|算了|没事|对|是|不|没有)\s*[！!。.？?]*$/i,  // 纯确认/感谢
  /^(继续|再说|下次|先这样|就这样)\s*[吧呢]*\s*[！!。.]*$/i,  // 结束语
]

function isWorthExtracting(message: string): boolean {
  const trimmed = message.trim()
  return !NOISE_PATTERNS.some(p => p.test(trimmed))
}

export function isProcessRunning(): boolean {
  return projectAbortControllers.size > 0
}

// ======================== AI 提示词日志 ========================

const PROMPT_LOG_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')

interface PromptLogEntry {
  timestamp: string
  projectId: string
  model?: string
  sessionId?: string | null
  /** 系统提示词（CLAUDE.md 内容） */
  systemPrompt: string
  /** 用户消息文本 */
  userMessage: string
  /** 附件摘要（不含 base64 数据） */
  attachments: Array<{ filename: string; mimeType: string; isImage: boolean; size?: number }>
  /** SDK 配置 */
  sdkOptions: { cwd: string; resume: boolean }
}

/**
 * 记录发送给 AI 的完整提示词到日志文件
 * 写入 data/ai-prompt-log.jsonl，每行一条 JSON 记录
 */
function logAiPrompt(params: {
  projectId: string
  sdkCwd: string
  message: string
  attachments?: AttachmentData[]
  model?: string
  sessionId?: string | null
  sdkOptions: { cwd: string; resume: boolean }
}): void {
  try {
    // 读取 CLAUDE.md（SDK 会自动注入此文件）
    const claudeMdPath = path.join(params.sdkCwd, 'CLAUDE.md')
    let systemPrompt = ''
    try {
      if (fs.existsSync(claudeMdPath)) {
        systemPrompt = fs.readFileSync(claudeMdPath, 'utf-8')
      }
    } catch { /* ignore */ }

    const entry: PromptLogEntry = {
      timestamp: new Date().toISOString(),
      projectId: params.projectId,
      model: params.model,
      sessionId: params.sessionId,
      systemPrompt,
      userMessage: params.message,
      attachments: (params.attachments || []).map(att => ({
        filename: att.filename,
        mimeType: att.mimeType,
        isImage: att.isImage,
        size: att.content.length,
      })),
      sdkOptions: params.sdkOptions,
    }

    const logDir = PROMPT_LOG_DIR
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    const logFile = path.join(logDir, 'ai-prompt-log.jsonl')
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8')

    logger.info(`[GClaw] 提示词已记录: ${(systemPrompt.length / 1024).toFixed(1)}KB 系统提示 + ${params.message.length}字用户消息 + ${entry.attachments.length}附件 → ai-prompt-log.jsonl`)
  } catch (err) {
    logger.warn('[GClaw] 记录提示词日志失败:', err instanceof Error ? err.message : err)
  }
}
