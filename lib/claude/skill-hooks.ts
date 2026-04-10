/**
 * 技能 Hook 加载器
 * 扫描启用技能的 gclaw-hooks.json，将声明式配置转化为 SDK HookCallback
 * 支持 notify / script / log 三种 action 类型
 */

import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import type { HookCallback } from '@anthropic-ai/claude-agent-sdk'
import { gclawEventBus } from './gclaw-events'
import type { GClawEventType } from './gclaw-events'

// ── 类型定义 ─────────────────────────────────────────────

/** 技能 Hook 声明文件格式 */
export interface SkillHooksConfig {
  version: number
  hooks: Partial<Record<string, SkillHookEntry[]>>
}

/** 单条 Hook 声明 */
export interface SkillHookEntry {
  description?: string
  filter?: {
    tools?: string[]          // 仅对指定工具触发（PostToolUse/PostToolUseFailure）
    responsePattern?: string  // 正则匹配 tool_response（仅 PostToolUse 有效）
  }
  action: 'notify' | 'script' | 'log'
  message?: string            // notify / log 时使用（推送到前端 UI）
  agentMessage?: string       // 注入到 Agent 上下文的指令（Agent 实际能看到的内容）
  script?: string             // script 时的脚本相对路径（相对技能目录）
  logFile?: string            // log 时的文件相对路径（相对技能目录）
}

/** 已解析的 Hook 配置，附带技能元信息 */
export interface ResolvedHookEntry extends SkillHookEntry {
  skillName: string
  skillDir: string
}

/** SDK Hook 事件名 → GClaw 事件类型 映射 */
const HOOK_TO_EVENT_TYPE: Record<string, GClawEventType> = {
  PostToolUse: 'tool:success',
  PostToolUseFailure: 'tool:failure',
  SessionStart: 'session:start',
  SessionEnd: 'session:end',
}

// ── 有效的 Hook 事件名（排除 GClaw 已内置处理的 PreToolUse） ─

const VALID_HOOK_EVENTS = new Set([
  'PostToolUse',
  'PostToolUseFailure',
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'Notification',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'Stop',
])

const VALID_ACTIONS = new Set(['notify', 'script', 'log'])

// ── 技能目录 ─────────────────────────────────────────────

const SKILLS_DIR = process.env.GCLAW_SKILLS_DIR || path.join(process.cwd(), 'skills')

/**
 * 验证解析后的路径是否在指定基目录内（防止路径遍历）
 */
function isPathWithin(resolvedPath: string, baseDir: string): boolean {
  return resolvedPath.startsWith(path.resolve(baseDir) + path.sep) ||
         resolvedPath === path.resolve(baseDir)
}

// ── 核心加载函数 ─────────────────────────────────────────

/**
 * 扫描启用技能的 gclaw-hooks.json，解析为按事件分组的 Hook 配置
 */
export function loadSkillHooks(
  enabledSkillNames: string[]
): Map<string, ResolvedHookEntry[]> {
  const grouped = new Map<string, ResolvedHookEntry[]>()

  for (const skillName of enabledSkillNames) {
    const skillDir = path.join(SKILLS_DIR, skillName)
    const hooksFile = path.join(skillDir, 'gclaw-hooks.json')

    if (!fs.existsSync(hooksFile)) continue

    try {
      const raw = fs.readFileSync(hooksFile, 'utf-8')
      const config: SkillHooksConfig = JSON.parse(raw)

      if (!config.hooks || typeof config.hooks !== 'object') continue

      for (const [eventName, entries] of Object.entries(config.hooks)) {
        if (!VALID_HOOK_EVENTS.has(eventName)) {
          console.warn(`[SkillHooks] Skill "${skillName}": unknown hook event "${eventName}", skipping`)
          continue
        }

        if (!Array.isArray(entries)) continue

        for (const entry of entries) {
          if (!VALID_ACTIONS.has(entry.action)) {
            console.warn(`[SkillHooks] Skill "${skillName}": unknown action "${entry.action}", skipping`)
            continue
          }

          const resolved: ResolvedHookEntry = { ...entry, skillName, skillDir }

          const list = grouped.get(eventName) || []
          list.push(resolved)
          grouped.set(eventName, list)
        }
      }

      console.log(`[SkillHooks] Loaded hooks from skill "${skillName}":`, Array.from(grouped.keys()))
    } catch (err) {
      console.error(`[SkillHooks] Failed to load gclaw-hooks.json for skill "${skillName}":`, err)
    }
  }

  return grouped
}

// ── HookCallback 工厂 ───────────────────────────────────

/**
 * 将技能 Hook 声明转化为 SDK HookCallbackMatcher 格式
 * 返回可直接合并到 buildSdkOptions.hooks 的对象
 */
export function buildSkillHookMatchers(
  hookEntries: Map<string, ResolvedHookEntry[]>,
  projectId: string
): Record<string, Array<{ hooks: HookCallback[] }>> {
  const result: Record<string, Array<{ hooks: HookCallback[] }>> = {}

  for (const [eventName, entries] of hookEntries) {
    const callbacks: HookCallback[] = []

    for (const entry of entries) {
      callbacks.push(createHookCallback(entry, eventName, projectId))
    }

    if (callbacks.length > 0) {
      result[eventName] = [{ hooks: callbacks }]
    }
  }

  return result
}

/**
 * 为单条 Hook 声明创建 SDK HookCallback
 */
function createHookCallback(
  entry: ResolvedHookEntry,
  eventName: string,
  projectId: string
): HookCallback {
  return async (input) => {
    // 确认事件类型匹配
    if (input.hook_event_name !== eventName) return {}

    // 工具过滤：仅对指定工具触发
    if (entry.filter?.tools && entry.filter.tools.length > 0) {
      const toolName = (input as { tool_name?: string }).tool_name
      if (toolName && !entry.filter.tools.includes(toolName)) {
        return {}
      }
    }

    // tool_response 内容过滤：正则匹配（仅 PostToolUse 有效）
    if (entry.filter?.responsePattern) {
      const toolResponse = (input as { tool_response?: unknown }).tool_response
      const responseStr = typeof toolResponse === 'string'
        ? toolResponse
        : JSON.stringify(toolResponse ?? '')
      console.log(`[SkillHooks] responsePattern check: pattern="${entry.filter.responsePattern}" | responseType=${typeof toolResponse} | responseStr(first200)="${responseStr.slice(0, 200)}"`)
      try {
        const re = new RegExp(entry.filter.responsePattern, 'i')
        const matched = re.test(responseStr)
        console.log(`[SkillHooks] responsePattern match result: ${matched}`)
        if (!matched) {
          return {}
        }
      } catch (e) {
        console.error(`[SkillHooks] responsePattern regex error:`, e)
      }
    }

    // 用于向 Agent 注入系统消息的返回值
    let systemMessage: string | undefined

    try {
      switch (entry.action) {
        case 'notify':
          handleNotify(entry, eventName, projectId, input)
          // 如果配置了 agentMessage，通过 SDK hook 返回值注入到 Agent 上下文
          systemMessage = entry.agentMessage || entry.message
          break
        case 'script':
          await handleScript(entry, projectId, input)
          systemMessage = entry.agentMessage
          break
        case 'log':
          handleLog(entry, input)
          break
      }
    } catch (err) {
      console.error(`[SkillHooks] Error in hook "${entry.skillName}/${eventName}":`, err)
      gclawEventBus.notify(projectId, 'hook:error', entry.skillName, {
        hookEvent: eventName,
        error: String(err),
      })
    }

    // 返回 systemMessage 让 SDK 将其注入到 Agent 的对话上下文中
    return systemMessage ? { systemMessage } : {}
  }
}

// ── Action 处理器 ────────────────────────────────────────

/**
 * notify action：发送事件到 GClaw 事件总线
 */
function handleNotify(
  entry: ResolvedHookEntry,
  eventName: string,
  projectId: string,
  input: Record<string, unknown>
): void {
  const eventType = HOOK_TO_EVENT_TYPE[eventName] || 'skill:notify'

  gclawEventBus.notify(projectId, eventType, entry.skillName, {
    message: entry.message || `[${entry.skillName}] ${eventName} triggered`,
    hookEvent: eventName,
    toolName: (input as { tool_name?: string }).tool_name,
    toolInput: (input as { tool_input?: unknown }).tool_input,
    toolResponse: (input as { tool_response?: unknown }).tool_response,
    error: (input as { error?: string }).error,
  })
}

/**
 * script action：执行技能目录下的脚本
 * 将事件上下文作为 JSON 通过 stdin 传入
 */
function handleScript(
  entry: ResolvedHookEntry,
  projectId: string,
  input: Record<string, unknown>
): Promise<void> {
  return new Promise((resolve) => {
    if (!entry.script) {
      resolve()
      return
    }

    const scriptPath = path.resolve(entry.skillDir, entry.script)
    // 安全校验：脚本路径必须在技能目录内
    if (!isPathWithin(scriptPath, entry.skillDir)) {
      console.warn(`[SkillHooks] Script path escapes skill directory: ${scriptPath}`)
      resolve()
      return
    }
    if (!fs.existsSync(scriptPath)) {
      console.warn(`[SkillHooks] Script not found: ${scriptPath}`)
      resolve()
      return
    }

    const context = JSON.stringify({
      projectId,
      hookEvent: input.hook_event_name,
      toolName: (input as { tool_name?: string }).tool_name,
      toolInput: (input as { tool_input?: unknown }).tool_input,
      toolResponse: (input as { tool_response?: unknown }).tool_response,
      error: (input as { error?: string }).error,
      timestamp: new Date().toISOString(),
    })

    const child = spawn('bash', [scriptPath], {
      cwd: entry.skillDir,
      env: { ...process.env, GCLAW_PROJECT_ID: projectId },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000, // 10 秒超时
    })

    child.stdin.write(context)
    child.stdin.end()

    let stderr = ''
    child.stderr.on('data', (data) => { stderr += data.toString() })

    child.on('close', (code) => {
      if (code !== 0 && stderr) {
        console.warn(`[SkillHooks] Script "${entry.script}" exited with code ${code}: ${stderr}`)
      }
      resolve()
    })

    child.on('error', (err) => {
      console.error(`[SkillHooks] Script spawn error:`, err)
      resolve()
    })
  })
}

/**
 * log action：追加到技能目录下的日志文件
 */
function handleLog(
  entry: ResolvedHookEntry,
  input: Record<string, unknown>
): void {
  const logFile = entry.logFile
    ? path.resolve(entry.skillDir, entry.logFile)
    : path.resolve(entry.skillDir, '.learnings', 'hook-events.log')

  // 安全校验：日志文件路径必须在技能目录内
  if (!isPathWithin(logFile, entry.skillDir)) {
    console.warn(`[SkillHooks] Log file path escapes skill directory: ${logFile}`)
    return
  }

  const logDir = path.dirname(logFile)
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }

  const logEntry = [
    `[${new Date().toISOString()}] ${input.hook_event_name}`,
    entry.message || '',
    (input as { tool_name?: string }).tool_name
      ? `  tool: ${(input as { tool_name?: string }).tool_name}`
      : '',
    (input as { tool_response?: unknown }).tool_response != null
      ? `  response(500): ${String((input as { tool_response?: unknown }).tool_response).slice(0, 500)}`
      : '',
    (input as { error?: string }).error
      ? `  error: ${(input as { error?: string }).error}`
      : '',
    '---',
    '',
  ].filter(Boolean).join('\n')

  try {
    fs.appendFileSync(logFile, logEntry, 'utf-8')
  } catch (err) {
    console.error(`[SkillHooks] Failed to write log:`, err)
  }
}

// ── 单技能 Hooks 读取（供 Focus Skill Provider 等外部模块使用）─────────

/**
 * 读取指定技能的 gclaw-hooks.json，返回按事件分组的 Hook 配置
 * 与 loadSkillHooks 不同，此函数只读取单个技能，用于 Focus 等按需加载场景
 */
export function loadSingleSkillHooks(skillName: string): Map<string, ResolvedHookEntry[]> {
  const grouped = new Map<string, ResolvedHookEntry[]>()
  const skillDir = path.join(SKILLS_DIR, skillName)
  const hooksFile = path.join(skillDir, 'gclaw-hooks.json')

  if (!fs.existsSync(hooksFile)) return grouped

  try {
    const raw = fs.readFileSync(hooksFile, 'utf-8')
    const config: SkillHooksConfig = JSON.parse(raw)

    if (!config.hooks || typeof config.hooks !== 'object') return grouped

    for (const [eventName, entries] of Object.entries(config.hooks)) {
      if (!Array.isArray(entries)) continue

      const resolved: ResolvedHookEntry[] = entries
        .filter(entry => VALID_ACTIONS.has(entry.action))
        .map(entry => ({ ...entry, skillName, skillDir }))

      if (resolved.length > 0) {
        grouped.set(eventName, resolved)
      }
    }
  } catch (err) {
    console.error(`[SkillHooks] Failed to load gclaw-hooks.json for skill "${skillName}":`, err)
  }

  return grouped
}

/**
 * 获取指定技能的 gclaw-hooks.json 原始配置（不转化为 ResolvedHookEntry）
 * 用于前端展示 Skill 的 Hook 声明信息
 */
export function readSkillHooksConfig(skillName: string): SkillHooksConfig | null {
  const skillDir = path.join(SKILLS_DIR, skillName)
  const hooksFile = path.join(skillDir, 'gclaw-hooks.json')

  if (!fs.existsSync(hooksFile)) return null

  try {
    const raw = fs.readFileSync(hooksFile, 'utf-8')
    return JSON.parse(raw) as SkillHooksConfig
  } catch (err) {
    console.error(`[SkillHooks] Failed to read gclaw-hooks.json for skill "${skillName}":`, err)
    return null
  }
}
