import type { CommandDefinition, CommandStep, ConditionStep } from '@/types/commands'

/** 内置命令名（不可被自定义命令覆盖） */
const BUILTIN_COMMANDS = new Set([
  'clear', 'theme', 'project', 'skills', 'agents', 'settings',
])

/** 危险命令模式 */
const DANGEROUS_PATTERNS = [
  /\brm\s+-rf\b/,
  /\brm\s+-r\b/,
  /\bsudo\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bformat\b/,
  /\bfdisk\b/,
  /\b>\s*\/dev\//,
  /\bchmod\s+777\b/,
  /\bchown\s+-R\b/,
]

interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * 校验命令定义的合法性
 */
export function validateCommand(cmd: CommandDefinition): ValidationResult {
  const errors: string[] = []

  // 1. id 格式：kebab-case
  if (!cmd.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cmd.id)) {
    errors.push(`id "${cmd.id}" 格式不合法，只允许小写字母、数字和连字符（kebab-case）`)
  }

  // 2. id 不与内置命令冲突
  if (BUILTIN_COMMANDS.has(cmd.id)) {
    errors.push(`id "${cmd.id}" 与内置命令冲突`)
  }

  // 3. name 必填
  if (!cmd.name || !cmd.name.trim()) {
    errors.push('name 不能为空')
  }

  // 4. steps 至少 1 个
  if (!cmd.steps || cmd.steps.length === 0) {
    errors.push('至少需要一个步骤')
  }

  // 5. 步骤 id 唯一
  if (cmd.steps && cmd.steps.length > 0) {
    const stepIds = new Set<string>()
    const allSteps = collectAllSteps(cmd.steps)

    for (const step of allSteps) {
      if (!step.id) {
        errors.push('每个步骤必须有 id')
        continue
      }
      if (stepIds.has(step.id)) {
        errors.push(`步骤 id "${step.id}" 重复`)
      }
      stepIds.add(step.id)

      // 校验各类型步骤
      validateStep(step, stepIds, errors)
    }

    // 6. DAG 无环检查（条件跳转）
    const cycleError = checkConditionCycles(allSteps)
    if (cycleError) {
      errors.push(cycleError)
    }
  }

  // 7. 参数名合法
  if (cmd.parameters) {
    for (const param of cmd.parameters) {
      if (!param.name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(param.name)) {
        errors.push(`参数名 "${param.name}" 不合法，只允许字母、数字和下划线，且不能以数字开头`)
      }
      if (param.type === 'enum' && (!param.values || param.values.length === 0)) {
        errors.push(`枚举参数 "${param.name}" 必须提供 values`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/** 递归收集所有步骤（含 parallel 分支内的步骤） */
function collectAllSteps(steps: CommandStep[]): CommandStep[] {
  const result: CommandStep[] = []
  for (const step of steps) {
    result.push(step)
    if (step.type === 'parallel' && step.branches) {
      for (const branch of step.branches) {
        result.push(...collectAllSteps(branch))
      }
    }
  }
  return result
}

/** 校验单个步骤 */
function validateStep(step: CommandStep, _allStepIds: Set<string>, errors: string[]): void {
  const validTypes = ['prompt', 'script', 'condition', 'command-ref', 'parallel']
  if (!validTypes.includes((step as any).type)) {
    errors.push(`步骤 "${step.id}" 的类型 "${(step as any).type}" 不合法，支持的类型：${validTypes.join('、')}`)
    return
  }

  switch (step.type) {
    case 'script': {
      if (!step.command || !step.command.trim()) {
        errors.push(`步骤 "${step.id}" 的 command 不能为空`)
      }
      // 检查危险命令
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(step.command)) {
          errors.push(`步骤 "${step.id}" 包含危险命令: ${step.command}`)
          break
        }
      }
      break
    }
    case 'prompt': {
      if (!step.userMessage || !step.userMessage.trim()) {
        errors.push(`步骤 "${step.id}" 的 userMessage 不能为空`)
      }
      break
    }
    case 'condition': {
      if (!step.if || !step.if.trim()) {
        errors.push(`步骤 "${step.id}" 的 if 条件不能为空`)
      }
      if (!step.then || (Array.isArray(step.then) && step.then.length === 0)) {
        errors.push(`步骤 "${step.id}" 的 then 分支不能为空`)
      }
      break
    }
    case 'command-ref': {
      if (!step.commandId || !step.commandId.trim()) {
        errors.push(`步骤 "${step.id}" 的 commandId 不能为空`)
      }
      break
    }
    case 'parallel': {
      if (!step.branches || step.branches.length === 0) {
        errors.push(`步骤 "${step.id}" 的 branches 不能为空`)
      }
      break
    }
  }
}

/**
 * DAG 无环检查：检测条件步骤的跳转引用是否形成循环
 */
function checkConditionCycles(steps: CommandStep[]): string | null {
  // 构建步骤 id -> 跳转目标的邻接表
  const graph = new Map<string, string[]>()
  const stepIds = new Set(steps.map(s => s.id))

  for (const step of steps) {
    if (step.type === 'condition') {
      const condStep = step as ConditionStep
      const targets: string[] = []
      const thenTargets = Array.isArray(condStep.then) ? condStep.then : [condStep.then]
      const elseTargets = condStep.else
        ? (Array.isArray(condStep.else) ? condStep.else : [condStep.else])
        : []

      for (const t of [...thenTargets, ...elseTargets]) {
        if (stepIds.has(t)) {
          targets.push(t)
        }
      }
      graph.set(step.id, targets)
    }
  }

  // DFS 检测环
  const visited = new Set<string>()
  const inStack = new Set<string>()

  function dfs(nodeId: string): boolean {
    if (inStack.has(nodeId)) return true // 发现环
    if (visited.has(nodeId)) return false

    visited.add(nodeId)
    inStack.add(nodeId)

    const neighbors = graph.get(nodeId) || []
    for (const neighbor of neighbors) {
      if (dfs(neighbor)) return true
    }

    inStack.delete(nodeId)
    return false
  }

  for (const nodeId of graph.keys()) {
    if (dfs(nodeId)) {
      return '条件步骤的跳转引用存在循环依赖'
    }
  }

  return null
}
