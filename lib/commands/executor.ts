import type {
  CommandDefinition,
  CommandStep,
  PromptStep,
  ScriptStep,
  ConditionStep,
  CommandRefStep,
  ParallelStep,
  DynamicExecStep,
  ExecutionContext,
  StepResult,
  WorkflowStepInfo,
  CommandSSEEvent,
} from '@/types/commands'
import fs from 'fs'
import path from 'path'
// 安全的 ID 生成（避免 crypto.randomUUID 在某些 Next.js 环境不可用）
function generateRequestId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2)
}
import { resolveTemplate, evaluateCondition } from './variables'
import { resolveCommand, getProjectScriptsDir } from './registry'
import { executeChat } from '@/lib/claude/process-manager'
import { getProjectSettings } from '@/lib/store/settings'
import { callLLM, callLLMStream } from '@/lib/llm'
import type { PermissionRequest, AskUserQuestionRequest } from '@/types/chat'
import { logger } from '@/lib/logger'
import { exec } from 'child_process'

// ── Windows 编码兼容 ──
const isWindows = process.platform === 'win32'

/**
 * 跨平台命令适配：
 * - Windows: 添加 chcp 65001 前缀解决 GBK 乱码，将 mkdir 转为 if not exist 形式
 * - Linux/macOS: 将 mkdir 转为 mkdir -p 以避免目录已存在报错
 */
function adaptCommand(command: string): string {
  if (!isWindows) {
    // Linux/macOS: 将 mkdir 转换为 mkdir -p 以兼容目录已存在的情况
    const mkdirMatch = command.match(/^mkdir\s+(?!-)(\S+.*)$/)
    if (mkdirMatch) {
      return `mkdir -p ${mkdirMatch[1]}`
    }
    return command
  }
  // Windows: 将 mkdir 转换为 "if not exist ... mkdir ..." 以避免目录已存在报错
  const mkdirMatchWin = command.match(/^mkdir\s+(?!-)(\S+.*)$/)
  let finalCommand = command
  if (mkdirMatchWin) {
    const dir = mkdirMatchWin[1].trim()
    finalCommand = `if not exist "${dir}" mkdir "${dir}"`
  }
  // 已经包含 chcp 则不再重复
  if (finalCommand.includes('chcp')) return finalCommand
  return `chcp 65001 >nul && ${finalCommand}`
}

/**
 * 为 exec 的 options 注入 Windows 兼容的环境变量，
 * 确保 Python 等子进程也输出 UTF-8。
 */
function getExecEnv(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!isWindows) return baseEnv
  return {
    ...baseEnv,
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  }
}

// 待确认的步骤请求 Map — 使用 globalThis 确保跨 Next.js API routes 共享同一实例
declare global {
  // eslint-disable-next-line no-var
  var _pendingStepConfirmations: Map<string, (response: { action: string; modifiedContent?: string }) => void> | undefined
}

if (!globalThis._pendingStepConfirmations) {
  globalThis._pendingStepConfirmations = new Map()
}
const pendingStepConfirmations = globalThis._pendingStepConfirmations

export function resolveStepConfirmation(requestId: string, response: { action: string; modifiedContent?: string }) {
  console.log(`[StepConfirmation] resolveStepConfirmation called: requestId=${requestId}, mapSize=${pendingStepConfirmations.size}, hasKey=${pendingStepConfirmations.has(requestId)}`)
  const resolve = pendingStepConfirmations.get(requestId)
  if (resolve) {
    resolve(response)
    pendingStepConfirmations.delete(requestId)
    console.log(`[StepConfirmation] Successfully resolved requestId=${requestId}`)
  } else {
    console.warn(`[StepConfirmation] No pending confirmation found for requestId=${requestId}. Available keys:`, Array.from(pendingStepConfirmations.keys()))
  }
}

// ── 安全限制 ──
const MAX_STEPS = 20
const MAX_WORKFLOW_TIMEOUT_MS = 30 * 60 * 1000  // 30 分钟
const SCRIPT_TIMEOUT_MS = 60 * 1000              // 60 秒
const MAX_RECURSION_DEPTH = 3
const DEFAULT_STEP_TIMEOUT_MS = 5 * 60 * 1000    // 单步默认超时 5 分钟
const DEFAULT_MAX_TURNS = 50                      // 默认最大 AI 交互轮次

export type { CommandSSEEvent }

// 内部事件：用于从步骤生成器传回 StepResult
type StepDoneEvent = { type: '__step_done'; result: StepResult; jumpTarget: string | null }
type StepEvent = CommandSSEEvent | StepDoneEvent

export interface CommandExecutorCallbacks {
  onPermissionRequest?: (req: PermissionRequest) => void
  onAskUserQuestion?: (req: AskUserQuestionRequest) => void
}

export class CommandExecutor {
  private context: ExecutionContext
  private depth: number
  private callbacks: CommandExecutorCallbacks
  private totalUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    costUsd: 0,
  }
  private lastModel = ''

  getUsageStats() {
    return { usage: this.totalUsage, model: this.lastModel }
  }

  constructor(projectId: string, userId: string, cwd: string, depth = 0, callbacks: CommandExecutorCallbacks = {}) {
    this.depth = depth
    this.callbacks = callbacks
    this.context = {
      params: {},
      steps: {},
      variables: {},
      projectId,
      userId,
      cwd,
    }
  }

  /**
   * 主执行方法 — AsyncGenerator 返回 SSE 事件流
   */
  async *execute(
    command: CommandDefinition,
    params: Record<string, any>
  ): AsyncGenerator<CommandSSEEvent> {
    const workflowStart = Date.now()

    // 1. 校验步骤数限制
    if (command.steps.length > MAX_STEPS) {
      yield { type: 'workflow_error', data: { error: `步骤数 ${command.steps.length} 超过限制 ${MAX_STEPS}` } }
      return
    }

    // 2. 设置 context.params（合并默认值）
    this.context.params = { ...params }
    if (command.parameters) {
      for (const p of command.parameters) {
        if (this.context.params[p.name] === undefined && p.default !== undefined) {
          this.context.params[p.name] = p.default
        }
      }
    }

    // 3. yield workflow_start
    yield {
      type: 'workflow_start',
      data: {
        commandId: command.id,
        commandName: command.name,
        totalSteps: command.steps.length,
        steps: command.steps.map(s => ({ id: s.id, name: s.name || s.id, type: s.type })),
      },
    }

    // 4. 按顺序执行步骤（支持条件跳转）
    const stepResults: StepResult[] = []
    const stepIndexMap = new Map<string, number>()
    for (let i = 0; i < command.steps.length; i++) {
      stepIndexMap.set(command.steps[i].id, i)
    }

    let currentIndex = 0
    const executedSteps = new Set<string>()

    while (currentIndex < command.steps.length) {
      // 超时检查
      if (Date.now() - workflowStart > MAX_WORKFLOW_TIMEOUT_MS) {
        yield { type: 'workflow_error', data: { error: '工作流超时（超过 30 分钟）' } }
        break
      }

      const step = command.steps[currentIndex]
      executedSteps.add(step.id)

      // yield step_start
      yield {
        type: 'workflow_step_start',
        data: {
          stepId: step.id,
          stepName: step.name,
          index: currentIndex,
          total: command.steps.length,
        },
      }

      const stepStart = Date.now()
      let result: StepResult
      let jumpTarget: string | null = null

      try {
        // 实时消费步骤生成器，每个事件立即 yield 给外层
        for await (const event of this.executeStepWithErrorHandling(step, currentIndex, command.steps.length)) {
          if (event.type === '__step_done') {
            result = (event as StepDoneEvent).result
            jumpTarget = (event as StepDoneEvent).jumpTarget
          } else {
            yield event as CommandSSEEvent
          }
        }
        // result 一定已被赋值（由 __step_done 事件设置）
        result = result!
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        result = {
          stepId: step.id,
          output: '',
          status: 'failed',
          duration: Date.now() - stepStart,
        }
        yield { type: 'workflow_error', data: { error: errMsg, stepId: step.id } }

        const onError = step.onError || 'stop'
        if (onError === 'stop') {
          this.context.steps[step.id] = result
          stepResults.push(result)
          yield { type: 'workflow_step_done', data: { stepId: step.id, stepName: step.name || step.id, status: 'failed', duration: result.duration } }
          break
        }
        // continue: 记录错误但继续
      }

      // 存入 context
      this.context.steps[step.id] = result!
      if (step.type !== 'condition' && 'outputVar' in step && step.outputVar) {
        this.context.variables[step.outputVar] = result!.output
      }
      stepResults.push(result!)

      yield {
        type: 'workflow_step_done',
        data: { stepId: step.id, stepName: step.name || step.id, status: result!.status, duration: result!.duration },
      }

      // 步骤完成后等待用户确认（最后一个步骤不需要确认；autoExecute 模式跳过确认）
      // 用循环处理「修改 → 重新执行 → 再确认」
      let needsConfirmation = true
      while (needsConfirmation) {
        needsConfirmation = false

        if (result! && result!.status === 'completed' && currentIndex < command.steps.length - 1 && !command.autoExecute) {
          const confirmReqId = generateRequestId()

          yield {
            type: 'step_confirmation_request',
            data: {
              requestId: confirmReqId,
              stepId: step.id,
              stepName: step.name || step.id,
              stepIndex: currentIndex,
              totalSteps: command.steps.length,
              output: result!.output || '',
            }
          }

          // 等待用户确认（5 分钟超时，默认继续）
          const confirmation = await new Promise<{ action: string; modifiedContent?: string }>((resolve) => {
            console.log(`[StepConfirmation] Setting pending confirmation: requestId=${confirmReqId}, mapSize=${pendingStepConfirmations.size}`)
            pendingStepConfirmations.set(confirmReqId, resolve)
            setTimeout(() => {
              if (pendingStepConfirmations.has(confirmReqId)) {
                resolve({ action: 'continue' })
                pendingStepConfirmations.delete(confirmReqId)
              }
            }, 300000)
          })

          if (confirmation.action === 'abort') {
            yield {
              type: 'workflow_error',
              data: { error: '用户中止了工作流' }
            } as CommandSSEEvent
            return  // 终止生成器
          }

          if (confirmation.action === 'modify' && confirmation.modifiedContent) {
            // 用户输入了修改指令，重新执行当前步骤
            const modifyInstruction = confirmation.modifiedContent

            // 构造修改后的步骤（仅 prompt 类型追加修改指令）
            let modifiedStep: CommandStep = { ...step }
            if (step.type === 'prompt') {
              modifiedStep = {
                ...step,
                userMessage: `${(step as PromptStep).userMessage || ''}\n\n[用户修改要求] ${modifyInstruction}`,
              } as PromptStep
            }

            // 重新发送 workflow_step_start（前端会将步骤状态更新为 running）
            yield {
              type: 'workflow_step_start',
              data: {
                stepId: step.id,
                stepName: step.name,
                index: currentIndex,
                total: command.steps.length,
              },
            }

            // 重新执行步骤
            const rerunStart = Date.now()
            let rerunResult: StepResult | undefined
            let rerunJumpTarget: string | null = null

            try {
              for await (const event of this.executeStepWithErrorHandling(modifiedStep, currentIndex, command.steps.length)) {
                if (event.type === '__step_done') {
                  rerunResult = (event as StepDoneEvent).result
                  rerunJumpTarget = (event as StepDoneEvent).jumpTarget
                } else {
                  yield event as CommandSSEEvent
                }
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err)
              rerunResult = {
                stepId: step.id,
                output: '',
                status: 'failed',
                duration: Date.now() - rerunStart,
              }
              yield { type: 'workflow_error', data: { error: errMsg, stepId: step.id } }
            }

            if (rerunResult) {
              // 更新 context 和 stepResults
              result = rerunResult
              jumpTarget = rerunJumpTarget
              this.context.steps[step.id] = result
              if (step.type !== 'condition' && 'outputVar' in step && step.outputVar) {
                this.context.variables[step.outputVar] = result.output
              }
              // 同步更新 stepResults（替换或追加）
              const idx = stepResults.findIndex(r => r.stepId === step.id)
              if (idx >= 0) {
                stepResults[idx] = result
              } else {
                stepResults.push(result)
              }
            }

            yield {
              type: 'workflow_step_done',
              data: { stepId: step.id, status: result!.status, duration: result!.duration },
            }

            // 重新执行完成后再次弹出确认（循环）
            needsConfirmation = true
          }
          // action === 'continue' → needsConfirmation 保持 false，退出循环
        }
      }

      // 跳转逻辑
      if (jumpTarget && stepIndexMap.has(jumpTarget)) {
        currentIndex = stepIndexMap.get(jumpTarget)!
      } else {
        currentIndex++
      }
    }

    // 标记被跳过的步骤
    for (let i = 0; i < command.steps.length; i++) {
      const step = command.steps[i]
      if (!executedSteps.has(step.id)) {
        const skipped: StepResult = {
          stepId: step.id,
          output: '',
          status: 'skipped',
          duration: 0,
        }
        this.context.steps[step.id] = skipped
        stepResults.push(skipped)
      }
    }

    // 5. yield workflow_done
    yield {
      type: 'workflow_done',
      data: {
        totalDuration: Date.now() - workflowStart,
        stepResults,
      },
    }
  }

  /**
   * 执行单个步骤，支持 onError retry 策略
   * 改为 AsyncGenerator 实时透传事件
   */
  private async *executeStepWithErrorHandling(
    step: CommandStep,
    _index: number,
    _total: number
  ): AsyncGenerator<StepEvent> {
    const onError = step.onError || 'stop'

    try {
      yield* this.dispatchStep(step)
    } catch (err) {
      if (onError === 'retry') {
        logger.warn(`[CommandExecutor] Step "${step.id}" failed, retrying once...`)
        try {
          yield* this.dispatchStep(step)
        } catch (retryErr) {
          throw retryErr
        }
      } else {
        throw err
      }
    }
  }

  /**
   * 分派步骤到对应的执行器（AsyncGenerator 实时流式）
   */
  private async *dispatchStep(
    step: CommandStep
  ): AsyncGenerator<StepEvent> {
    switch (step.type) {
      case 'prompt':
        yield* this.executePromptStep(step)
        break
      case 'script':
        yield* this.executeScriptStep(step)
        break
      case 'condition':
        yield* this.executeConditionStep(step)
        break
      case 'command-ref':
        yield* this.executeCommandRefStep(step)
        break
      case 'parallel':
        yield* this.executeParallelStep(step)
        break
      case 'dynamic-exec':
        yield* this.executeDynamicExecStep(step)
        break
      default: {
        const _exhaustive: never = step
        throw new Error(`Unknown step type: ${(_exhaustive as CommandStep).type}`)
      }
    }
  }

  // ── PromptStep 执行（实时流式）──

  private async *executePromptStep(
    step: PromptStep
  ): AsyncGenerator<StepEvent> {
    const stepStart = Date.now()
    const resolvedMessage = resolveTemplate(step.userMessage, this.context)
    const resolvedSystemPrompt = step.systemPrompt
      ? resolveTemplate(step.systemPrompt, this.context)
      : undefined

    // 追加 ask_user 工具使用提示，确保 AI 在需要用户输入时主动发起询问
    const askUserHint = '\n\n重要：如果你在执行过程中需要用户提供信息（如密码、凭证、选择、确认等）或者需要用户回复的，必须使用 ask_user_question 工具发起询问并等待用户回复，发起的问题可以没有选项，需要用户填什么就问什么，不要仅在输出文本中描述需求，并直接跳过。'
    const finalSystemPrompt = (resolvedSystemPrompt || '') + askUserHint

    // 将步骤系统提示作为上下文前缀注入用户消息（executeChat 不支持独立 systemPrompt 参数）
    const messageWithContext = finalSystemPrompt
      ? `[系统指令] ${finalSystemPrompt}\n\n[用户请求] ${resolvedMessage}`
      : resolvedMessage

    // 累积文本输出
    let outputBuffer = ''

    // 单步超时控制：通过 AbortController 在超时后终止 executeChat
    const stepAbortController = new AbortController()
    const stepTimeoutMs = DEFAULT_STEP_TIMEOUT_MS
    const stepTimer = setTimeout(() => {
      logger.warn(`[CommandExecutor] Step "${step.id}" timed out after ${stepTimeoutMs / 1000}s, aborting...`)
      stepAbortController.abort()
    }, stepTimeoutMs)

    // 调用 executeChat — 它是 AsyncGenerator<SSEEvent>
    // 使用 abortKey 隔离避免与同项目的其他查询冲突
    const chatGen = executeChat(messageWithContext, {
      projectId: this.context.projectId,
      abortKey: `${this.context.projectId}__cmd_${step.id}`,
      cwd: this.context.cwd || undefined,
      dangerouslySkipPermissions: true, // 工作流内跳过权限确认
      maxTurns: step.maxTurns ?? DEFAULT_MAX_TURNS,
      externalAbortController: stepAbortController,
      onAskUserQuestion: this.callbacks.onAskUserQuestion
        ? (req: AskUserQuestionRequest) => {
            this.callbacks.onAskUserQuestion!(req)
          }
        : undefined,
    }, this.callbacks.onPermissionRequest
      ? (req: PermissionRequest) => {
          this.callbacks.onPermissionRequest!(req)
        }
      : undefined
    )

    let timedOut = false
    try {
      for await (const sseEvent of chatGen) {
        switch (sseEvent.event) {
          case 'delta': {
            const content = (sseEvent.data as { content?: string }).content || ''
            outputBuffer += content
            yield {
              type: 'step_delta',
              data: { stepId: step.id, content },
            }
            break
          }
          case 'tool_use': {
            const data = sseEvent.data as { toolUseId?: string; toolName?: string; input?: any }
            const resolvedToolUseId = data.toolUseId || `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
            // 存储最后使用的 toolUseId，供 tool_result 匹配
            ;(step as any)._lastToolUseId = resolvedToolUseId
            yield {
              type: 'step_tool_use',
              data: {
                stepId: step.id,
                toolUseId: resolvedToolUseId,
                toolName: data.toolName || '',
                input: data.input || {},
              },
            }
            break
          }
          case 'tool_result': {
            const data = sseEvent.data as { toolUseId?: string; content?: string; isError?: boolean }
            yield {
              type: 'step_tool_result',
              data: {
                stepId: step.id,
                toolUseId: data.toolUseId || (step as any)._lastToolUseId || '',
                content: data.content || '',
                isError: data.isError || false,
              },
            }
            break
          }
          case 'tool_progress': {
            const data = sseEvent.data as { toolUseId?: string; toolName?: string; elapsedSeconds?: number }
            yield {
              type: 'step_tool_progress',
              data: {
                stepId: step.id,
                toolUseId: data.toolUseId || '',
                toolName: data.toolName || '',
                elapsedSeconds: data.elapsedSeconds || 0,
              },
            }
            break
          }
          case 'done': {
            const doneData = sseEvent.data as Record<string, any>
            if (doneData.usage) {
              this.totalUsage.inputTokens += (doneData.usage as any).inputTokens || 0
              this.totalUsage.outputTokens += (doneData.usage as any).outputTokens || 0
              this.totalUsage.cachedTokens += (doneData.usage as any).cachedTokens || 0
            }
            if (doneData.costUsd) {
              this.totalUsage.costUsd += doneData.costUsd as number
            }
            if (doneData.model) {
              this.lastModel = doneData.model as string
            }
            break
          }
          case 'error': {
            const errMsg = (sseEvent.data as { message?: string }).message || 'Unknown error'
            throw new Error(`PromptStep "${step.id}" error: ${errMsg}`)
          }
          case 'context_update': {
            const ctxData = sseEvent.data as { inputTokens?: number; model?: string }
            if (ctxData.inputTokens) {
              yield {
                type: 'context_update',
                data: { inputTokens: ctxData.inputTokens, model: ctxData.model || '' },
              }
            }
            break
          }
          // start, init, thinking, tool_result, tool_progress, status, end — 忽略或透传
          default:
            break
        }
      }
    } catch (err) {
      // 判断是否为超时引起的 abort
      if (stepAbortController.signal.aborted) {
        timedOut = true
        logger.warn(`[CommandExecutor] Step "${step.id}" was aborted due to timeout`)
      } else {
        throw err
      }
    } finally {
      clearTimeout(stepTimer)
    }

    // 步骤完成，yield 内部结果事件
    yield {
      type: '__step_done',
      result: {
        stepId: step.id,
        output: outputBuffer,
        status: timedOut ? 'failed' : 'completed',
        duration: Date.now() - stepStart,
      },
      jumpTarget: null,
    }
  }

  // ── ScriptStep 执行 ──

  private async *executeScriptStep(
    step: ScriptStep
  ): AsyncGenerator<StepEvent> {
    const stepStart = Date.now()
    let resolvedCommand = resolveTemplate(step.command, this.context)

    // 如果 command 是相对路径脚本文件引用（如 scripts/build.sh），从 .commands/scripts/ 目录查找
    if (/^scripts\/[\w.\-]+$/.test(resolvedCommand.trim())) {
      const scriptsDir = getProjectScriptsDir(this.context.projectId)
      const scriptFile = path.join(scriptsDir, resolvedCommand.trim().replace(/^scripts\//, ''))
      if (fs.existsSync(scriptFile)) {
        resolvedCommand = `bash "${scriptFile}"`
      }
    }

    const cwd = step.cwd
      ? resolveTemplate(step.cwd, this.context)
      : this.context.cwd

    const maxAttempts = (step.retryCount || 0) + 1
    const retryDelay = step.retryDelay || 3000
    let lastError: Error | null = null
    let output = ''

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          yield { type: 'step_delta', data: { stepId: step.id, content: `\n⏳ 第 ${attempt} 次重试（共 ${maxAttempts} 次）...\n` } }
          await new Promise(resolve => setTimeout(resolve, retryDelay))
        }

        output = await new Promise<string>((resolve, reject) => {
          // 读取项目环境变量并合并
          const projectSettings = getProjectSettings(this.context.projectId)
          const mergedEnv: NodeJS.ProcessEnv = getExecEnv({
            ...process.env,
            ...(projectSettings?.envVariables || {}),
          })

          const finalCommand = adaptCommand(resolvedCommand)
          const child = exec(finalCommand, {
            cwd,
            timeout: step.timeout || SCRIPT_TIMEOUT_MS,
            maxBuffer: 1024 * 1024, // 1MB
            env: mergedEnv,
          }, (error, stdout, stderr) => {
            if (error) {
              const output = stderr || stdout || ''
              reject(new Error(`ScriptStep "${step.id}" failed: ${error.message}\n${output}`))
              return
            }
            resolve(stdout.trim())
          })

          // 安全释放：超时后 kill
          child.on('error', (err) => {
            reject(new Error(`ScriptStep "${step.id}" process error: ${err.message}`))
          })
        })

        // 成功：跳出重试循环
        break
      } catch (err: any) {
        lastError = err
        if (attempt < maxAttempts) {
          yield { type: 'step_delta', data: { stepId: step.id, content: `\n⚠️ 执行失败: ${err.message}\n` } }
        } else {
          // 所有重试都失败
          throw lastError
        }
      }
    }

    yield { type: 'step_delta', data: { stepId: step.id, content: output } }

    yield {
      type: '__step_done',
      result: {
        stepId: step.id,
        output,
        status: 'completed',
        duration: Date.now() - stepStart,
      },
      jumpTarget: null,
    }
  }

  // ── ConditionStep 执行 ──

  private async *executeConditionStep(
    step: ConditionStep
  ): AsyncGenerator<StepEvent> {
    const stepStart = Date.now()
    const conditionResult = evaluateCondition(step.if, this.context)

    const targetSteps = conditionResult
      ? (Array.isArray(step.then) ? step.then : [step.then])
      : (step.else ? (Array.isArray(step.else) ? step.else : [step.else]) : [])

    // 跳转到目标列表的第一个步骤
    const jumpTarget = targetSteps.length > 0 ? targetSteps[0] : null

    yield {
      type: '__step_done',
      result: {
        stepId: step.id,
        output: conditionResult ? 'true' : 'false',
        status: 'completed',
        duration: Date.now() - stepStart,
      },
      jumpTarget,
    }
  }

  // ── CommandRefStep 执行（实时流式）──

  private async *executeCommandRefStep(
    step: CommandRefStep
  ): AsyncGenerator<StepEvent> {
    const stepStart = Date.now()

    if (this.depth >= MAX_RECURSION_DEPTH) {
      throw new Error(`CommandRef 递归深度超过限制 (${MAX_RECURSION_DEPTH})`)
    }

    const refCommand = resolveCommand(step.commandId, this.context.projectId)
    if (!refCommand) {
      throw new Error(`引用的命令 "${step.commandId}" 未找到`)
    }

    // 解析参数模板
    const resolvedParams: Record<string, any> = {}
    if (step.params) {
      for (const [key, value] of Object.entries(step.params)) {
        resolvedParams[key] = resolveTemplate(value, this.context)
      }
    }

    // 创建子执行器递归执行
    const subExecutor = new CommandExecutor(
      this.context.projectId,
      this.context.userId,
      this.context.cwd,
      this.depth + 1,
      this.callbacks
    )

    let outputBuffer = ''

    // 实时透传子工作流事件
    for await (const event of subExecutor.execute(refCommand, resolvedParams)) {
      // 透传子工作流的 step_delta 事件，但用当前步骤 ID 标记
      if (event.type === 'step_delta') {
        outputBuffer += event.data.content
        yield {
          type: 'step_delta',
          data: { stepId: step.id, content: event.data.content },
        }
      } else if (event.type === 'step_tool_use') {
        yield {
          type: 'step_tool_use',
          data: { stepId: step.id, toolUseId: event.data.toolUseId, toolName: event.data.toolName, input: event.data.input },
        }
      } else if (event.type === 'step_tool_result') {
        yield {
          type: 'step_tool_result',
          data: { stepId: step.id, toolUseId: event.data.toolUseId, content: event.data.content, isError: event.data.isError },
        }
      } else if (event.type === 'step_tool_progress') {
        yield {
          type: 'step_tool_progress',
          data: { stepId: step.id, toolUseId: event.data.toolUseId, toolName: event.data.toolName, elapsedSeconds: event.data.elapsedSeconds },
        }
      } else if (event.type === 'workflow_error') {
        throw new Error(`子命令 "${step.commandId}" 执行错误: ${event.data.error}`)
      }
    }

    yield {
      type: '__step_done',
      result: {
        stepId: step.id,
        output: outputBuffer,
        status: 'completed',
        duration: Date.now() - stepStart,
      },
      jumpTarget: null,
    }
  }

  // ── ParallelStep 执行 ──

  private async *executeParallelStep(
    step: ParallelStep
  ): AsyncGenerator<StepEvent> {
    const stepStart = Date.now()

    // 每个 branch 是一组串行步骤，用 Promise.all 并行执行所有分支
    // 注意：并行分支无法做到逐事件实时 yield（因为多个分支同时产出），
    // 这里收集各分支事件后统一 yield（对并行步骤可接受）
    const branchPromises = step.branches.map(async (branchSteps, _branchIdx) => {
      const branchEvents: CommandSSEEvent[] = []
      let branchOutput = ''

      for (const branchStep of branchSteps) {
        const events: CommandSSEEvent[] = []
        let stepResult: StepResult | null = null

        for await (const event of this.dispatchStep(branchStep)) {
          if (event.type === '__step_done') {
            stepResult = (event as StepDoneEvent).result
          } else {
            const cmdEvent = event as CommandSSEEvent
            events.push(cmdEvent)
            if (cmdEvent.type === 'step_delta') {
              branchOutput += cmdEvent.data.content
            }
          }
        }

        branchEvents.push(...events)

        // 存入 context
        if (stepResult) {
          this.context.steps[branchStep.id] = stepResult
          if (branchStep.type !== 'condition' && 'outputVar' in branchStep && branchStep.outputVar) {
            this.context.variables[branchStep.outputVar] = stepResult.output
          }
        }
      }

      return { events: branchEvents, output: branchOutput }
    })

    const branchResults = await Promise.all(branchPromises)

    // 合并所有分支输出并 yield
    const allOutputs: string[] = []
    for (const br of branchResults) {
      for (const evt of br.events) {
        yield evt
      }
      allOutputs.push(br.output)
    }

    yield {
      type: '__step_done',
      result: {
        stepId: step.id,
        output: allOutputs.filter(Boolean).join('\n---\n'),
        status: 'completed',
        duration: Date.now() - stepStart,
      },
      jumpTarget: null,
    }
  }

  // ── DynamicExecStep 执行 ──

  private async *executeDynamicExecStep(
    step: DynamicExecStep
  ): AsyncGenerator<StepEvent> {
    const stepStart = Date.now()
    const resolvedIntent = resolveTemplate(step.intent, this.context)
    const cwd = step.cwd
      ? resolveTemplate(step.cwd, this.context)
      : this.context.cwd

    // 第一阶段：让 AI 生成命令（流式）
    yield { type: 'step_delta', data: { stepId: step.id, content: `正在生成命令...\n` } }

    const systemPrompt = `你是一个命令行专家。根据用户的意图生成一个可直接执行的 shell 命令。
只输出命令本身，不要输出解释、标记或代码块符号。
工作目录: ${cwd}
${step.constraints ? `约束: ${step.constraints}` : ''}`

    let generatedCommand = ''
    try {
      for await (const chunk of callLLMStream({
        system: systemPrompt,
        user: resolvedIntent,
        maxTokens: 256,
        timeoutMs: 120000,
        projectId: this.context.projectId,
      })) {
        generatedCommand += chunk
        // 每个 chunk 实时推送到前端
        yield { type: 'step_delta', data: { stepId: step.id, content: chunk } }
      }
    } catch (err) {
      // 流式调用失败时，回退到非流式 callLLM
      logger.warn(`[DynamicExecStep] stream failed, falling back: ${(err as Error).message}`)
      generatedCommand = await callLLM({
        system: systemPrompt,
        user: resolvedIntent,
        maxTokens: 256,
        timeoutMs: 120000,
        projectId: this.context.projectId,
      }) || ''
    }

    const command = generatedCommand.trim()

    if (!command) {
      throw new Error(`DynamicExecStep "${step.id}" 失败: LLM 未返回有效命令`)
    }

    yield { type: 'step_delta', data: { stepId: step.id, content: `\n执行命令: ${command}\n` } }

    // 第二阶段：执行生成的命令
    yield { type: 'step_delta', data: { stepId: step.id, content: `正在执行...\n` } }

    const projectSettings = getProjectSettings(this.context.projectId)
    const mergedEnv: NodeJS.ProcessEnv = getExecEnv({
      ...process.env,
      ...(projectSettings?.envVariables || {}),
    })

    const finalCommand = adaptCommand(command)
    const output = await new Promise<string>((resolve, reject) => {
      exec(finalCommand, {
        cwd,
        timeout: SCRIPT_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        env: mergedEnv,
      }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`DynamicExecStep "${step.id}" 命令执行失败: ${error.message}\nstderr: ${stderr}`))
          return
        }
        resolve(stdout.trim())
      })
    })

    yield { type: 'step_delta', data: { stepId: step.id, content: `执行结果:\n${output}\n` } }

    yield {
      type: '__step_done',
      result: {
        stepId: step.id,
        output,
        status: 'completed',
        duration: Date.now() - stepStart,
      },
      jumpTarget: null,
    }
  }
}
