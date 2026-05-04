import type { CommandStep, ConditionStep, ParallelStep } from '@/types/commands'

/**
 * 转义 Mermaid 中的特殊字符
 */
function escapeMermaid(text: string): string {
  return text
    .replace(/"/g, '#quot;')
    .replace(/'/g, '#apos;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;')
    .replace(/\(/g, '#40;')
    .replace(/\)/g, '#41;')
    .replace(/\[/g, '#91;')
    .replace(/\]/g, '#93;')
    .replace(/\{/g, '#123;')
    .replace(/\}/g, '#125;')
}

function getStepLabel(step: CommandStep): string {
  return step.name || step.id
}

/**
 * 收集所有步骤 ID（包括 parallel 内的子步骤）
 */
function collectStepIds(steps: CommandStep[]): Set<string> {
  const ids = new Set<string>()
  for (const step of steps) {
    ids.add(step.id)
    if (step.type === 'parallel') {
      for (const branch of step.branches) {
        for (const s of branch) {
          ids.add(s.id)
        }
      }
    }
  }
  return ids
}

/**
 * 将命令步骤数组转换为 Mermaid flowchart 语法
 */
export function generateMermaidCode(steps: CommandStep[]): string {
  if (steps.length === 0) {
    return 'graph TD\n  empty["无步骤"]'
  }

  const lines: string[] = ['graph TD']
  const styles: string[] = []
  const allIds = collectStepIds(steps)
  let parallelCount = 0

  // 生成节点定义
  for (const step of steps) {
    addStepNode(step, lines, styles, allIds, () => ++parallelCount)
  }

  // 生成顺序连接（跳过 condition，它自己处理箭头）
  for (let i = 0; i < steps.length - 1; i++) {
    const current = steps[i]
    const next = steps[i + 1]
    if (current.type === 'condition') continue
    lines.push(`  ${current.id} --> ${next.id}`)
  }

  // 合并输出
  return [...lines, ...styles].join('\n')
}

function addStepNode(
  step: CommandStep,
  lines: string[],
  styles: string[],
  allIds: Set<string>,
  nextParallelId: () => number
): void {
  const label = escapeMermaid(getStepLabel(step))

  switch (step.type) {
    case 'prompt':
      lines.push(`  ${step.id}["${label}"]`)
      styles.push(`  style ${step.id} fill:#dbeafe,stroke:#3b82f6`)
      break

    case 'script': {
      const preview = escapeMermaid(step.command ? step.command.slice(0, 30) : label)
      lines.push(`  ${step.id}{{"\u2002${preview}\u2002"}}`)
      styles.push(`  style ${step.id} fill:#dcfce7,stroke:#22c55e`)
      break
    }

    case 'condition':
      addConditionNode(step, lines, styles, allIds)
      break

    case 'parallel':
      addParallelNode(step, lines, styles, allIds, nextParallelId)
      break

    case 'command-ref':
      lines.push(`  ${step.id}(["${escapeMermaid(step.commandId)}"])`)
      styles.push(`  style ${step.id} fill:#f3f4f6,stroke:#6b7280`)
      break
  }
}

function addConditionNode(
  step: ConditionStep,
  lines: string[],
  styles: string[],
  allIds: Set<string>
): void {
  const label = escapeMermaid(step.if || getStepLabel(step))
  lines.push(`  ${step.id}{"${label}"}`)
  styles.push(`  style ${step.id} fill:#fed7aa,stroke:#f97316`)

  // then 分支
  const thenTargets = Array.isArray(step.then) ? step.then : [step.then]
  for (const target of thenTargets) {
    if (target && allIds.has(target)) {
      lines.push(`  ${step.id} -->|"是"| ${target}`)
    }
  }

  // else 分支
  if (step.else) {
    const elseTargets = Array.isArray(step.else) ? step.else : [step.else]
    for (const target of elseTargets) {
      if (target && allIds.has(target)) {
        lines.push(`  ${step.id} -->|"否"| ${target}`)
      }
    }
  }
}

function addParallelNode(
  step: ParallelStep,
  lines: string[],
  styles: string[],
  allIds: Set<string>,
  nextParallelId: () => number
): void {
  const idx = nextParallelId()
  const sgId = `parallel_${idx}`
  const label = escapeMermaid(getStepLabel(step))

  lines.push(`  subgraph ${sgId}["⚡ ${label}"]`)

  for (let bIdx = 0; bIdx < step.branches.length; bIdx++) {
    const branch = step.branches[bIdx]
    // 连接分支内步骤
    for (const s of branch) {
      addStepNode(s, lines, styles, allIds, nextParallelId)
    }
    for (let j = 0; j < branch.length - 1; j++) {
      lines.push(`    ${branch[j].id} --> ${branch[j + 1].id}`)
    }
  }

  lines.push('  end')
  styles.push(`  style ${sgId} stroke:#a855f7,stroke-width:2px`)
}
