/**
 * 简易 5 位 cron 表达式解析器
 * 格式: 分 时 日 月 周
 * 支持: * / ,- 数字
 */

interface CronField {
  type: 'wildcard' | 'step' | 'list' | 'range'
  values: number[]
  step: number
}

const FIELD_RANGES = [
  { min: 0, max: 59 },  // 分
  { min: 0, max: 23 },  // 时
  { min: 1, max: 31 },  // 日
  { min: 1, max: 12 },  // 月
  { min: 0, max: 6 },   // 周 (0=周日)
]

function parseField(field: string, range: { min: number; max: number }): number[] {
  if (field === '*') {
    return Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i)
  }

  // */step
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10)
    if (isNaN(step) || step <= 0) return []
    const values: number[] = []
    for (let v = range.min; v <= range.max; v += step) {
      values.push(v)
    }
    return values
  }

  // start-end/step
  const rangeStepMatch = field.match(/^(\d+)-(\d+)\/(\d+)$/)
  if (rangeStepMatch) {
    const start = parseInt(rangeStepMatch[1], 10)
    const end = parseInt(rangeStepMatch[2], 10)
    const step = parseInt(rangeStepMatch[3], 10)
    if (isNaN(start) || isNaN(end) || isNaN(step) || step <= 0) return []
    const values: number[] = []
    for (let v = start; v <= end; v += step) {
      values.push(v)
    }
    return values
  }

  // start-end
  const rangeMatch = field.match(/^(\d+)-(\d+)$/)
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10)
    const end = parseInt(rangeMatch[2], 10)
    if (isNaN(start) || isNaN(end)) return []
    const values: number[] = []
    for (let v = start; v <= end; v++) {
      values.push(v)
    }
    return values
  }

  // comma-separated list: 1,3,5
  if (field.includes(',')) {
    return field.split(',').map(v => parseInt(v, 10)).filter(v => !isNaN(v))
  }

  // single value
  const v = parseInt(field, 10)
  return isNaN(v) ? [] : [v]
}

export function parseCron(expression: string): CronField[] | null {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return null

  return parts.map((part, i) => {
    const range = FIELD_RANGES[i]
    const values = parseField(part, range)
    return { values, step: 1 }
  }) as CronField[]
}

/**
 * 计算下一次执行时间
 * 从 after 时间开始查找下一个匹配的时间点
 */
export function getNextRun(expression: string, after: Date = new Date()): Date | null {
  const fields = parseCron(expression)
  if (!fields) return null

  // 至少每个 field 都有可用值
  if (fields.some(f => f.values.length === 0)) return null

  const [minuteField, hourField, dayField, monthField, weekdayField] = fields

  // 从 after + 1 分钟开始搜索，最多搜索 4 年（覆盖闰年）
  const start = new Date(after.getTime() + 60_000)
  start.setSeconds(0, 0)

  const maxIterations = 4 * 366 * 24 * 60
  const candidate = new Date(start)

  for (let i = 0; i < maxIterations; i++) {
    if (
      monthField.values.includes(candidate.getMonth() + 1) &&
      dayField.values.includes(candidate.getDate()) &&
      weekdayField.values.includes(candidate.getDay()) &&
      hourField.values.includes(candidate.getHours()) &&
      minuteField.values.includes(candidate.getMinutes())
    ) {
      return candidate
    }

    // 逐分钟递增
    candidate.setMinutes(candidate.getMinutes() + 1)
  }

  return null
}
