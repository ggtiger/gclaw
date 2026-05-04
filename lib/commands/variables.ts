import type { ExecutionContext } from '@/types/commands'

/**
 * 模板变量解析：替换 {{xxx}} 占位符
 *
 * 支持的变量：
 * - {{paramName}}           → context.params[paramName]
 * - {{params.paramName}}    → context.params[paramName]（params. 前缀显式引用参数）
 * - {{steps.stepId.output}} → context.steps[stepId].output
 * - {{date}}                → 当前日期 YYYY-MM-DD
 * - {{projectId}}           → context.projectId
 * - {{env.VAR}}             → process.env[VAR]
 *
 * 未匹配的变量保留原样
 */
export function resolveTemplate(template: string, context: ExecutionContext): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_match, expr: string) => {
    const key = expr.trim()

    // {{date}}
    if (key === 'date') {
      return new Date().toISOString().slice(0, 10)
    }

    // {{projectId}}
    if (key === 'projectId') {
      return context.projectId
    }

    // {{env.VAR}}
    if (key.startsWith('env.')) {
      const varName = key.slice(4)
      return process.env[varName] ?? `{{${key}}}`
    }

    // {{steps.stepId.output}}
    if (key.startsWith('steps.')) {
      const parts = key.split('.')
      if (parts.length >= 3 && parts[2] === 'output') {
        const stepId = parts[1]
        const stepResult = context.steps[stepId]
        if (stepResult) return stepResult.output
        return `{{${key}}}`
      }
    }

    // {{params.paramName}} → context.params[paramName]
    if (key.startsWith('params.')) {
      const paramName = key.slice(7)
      if (context.params[paramName] !== undefined) {
        return String(context.params[paramName])
      }
      return `{{${key}}}`
    }

    // {{paramName}} → context.params 或 context.variables
    if (context.params[key] !== undefined) {
      return String(context.params[key])
    }
    if (context.variables[key] !== undefined) {
      return String(context.variables[key])
    }

    // 未匹配，保留原样
    return `{{${key}}}`
  })
}

/**
 * 条件表达式求值
 *
 * 先对表达式中的 {{}} 做变量替换，然后解析操作符：
 * - contains 'text'  → 字符串包含
 * - == 'value'       → 等值比较
 * - != 'value'       → 不等比较
 * - isEmpty          → 空值判断
 */
export function evaluateCondition(expression: string, context: ExecutionContext): boolean {
  // 先做变量替换
  const resolved = resolveTemplate(expression, context)

  // 函数式语法: isEmpty(expr)
  const isEmptyFnMatch = resolved.match(/^isEmpty\((.+)\)$/)
  if (isEmptyFnMatch) {
    const value = isEmptyFnMatch[1].trim()
    return !value || value.trim() === ''
  }

  // 函数式语法: contains(expr, 'text')
  const containsFnMatch = resolved.match(/^contains\((.+?),\s*'([^']*)'\)$/)
  if (containsFnMatch) {
    const [, left, right] = containsFnMatch
    return left.trim().includes(right)
  }

  // isEmpty: "someValue isEmpty"
  if (resolved.trim().endsWith('isEmpty')) {
    const value = resolved.trim().replace(/\s+isEmpty$/, '')
    return !value || value.trim() === ''
  }

  // contains 'text'
  const containsMatch = resolved.match(/^(.+?)\s+contains\s+'([^']*)'$/)
  if (containsMatch) {
    const [, left, right] = containsMatch
    return left.trim().includes(right)
  }

  // == 'value'
  const eqMatch = resolved.match(/^(.+?)\s*==\s*'([^']*)'$/)
  if (eqMatch) {
    const [, left, right] = eqMatch
    return left.trim() === right
  }

  // != 'value'
  const neqMatch = resolved.match(/^(.+?)\s*!=\s*'([^']*)'$/)
  if (neqMatch) {
    const [, left, right] = neqMatch
    return left.trim() !== right
  }

  // 兜底：非空字符串视为 true
  const trimmed = resolved.trim()
  return trimmed !== '' && trimmed !== 'false' && trimmed !== '0'
}
