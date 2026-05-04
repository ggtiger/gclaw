import type { Node, Edge } from '@xyflow/react'
import type { CommandStep, ConditionStep } from '@/types/commands'
import type { StepNodeData } from './nodes/StepNode'

// ── 常量 ──

const NODE_X = 300
const NODE_SPACING_Y = 180

// ── stepsToFlow ──

export function stepsToFlow(steps: CommandStep[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // 构建 id → index 映射，用于 condition 跳转查找
  const idToIndex = new Map<string, number>()
  steps.forEach((step, i) => idToIndex.set(step.id, i))

  steps.forEach((step, index) => {
    // 创建节点
    const node: Node = {
      id: step.id,
      type: 'stepNode',
      position: { x: NODE_X, y: index * NODE_SPACING_Y },
      data: {
        ...step,
        stepType: step.type,
        label: step.name || step.id,
      },
    }
    nodes.push(node)

    // 创建边
    if (step.type === 'condition') {
      const cond = step as ConditionStep
      // then 分支
      const thenTarget = Array.isArray(cond.then) ? cond.then[0] : cond.then
      if (thenTarget && idToIndex.has(thenTarget)) {
        edges.push({
          id: `e-${step.id}-then-${thenTarget}`,
          source: step.id,
          target: thenTarget,
          sourceHandle: 'then',
          label: '是',
          type: 'smoothstep',
          animated: true,
        })
      }
      // else 分支
      if (cond.else) {
        const elseTarget = Array.isArray(cond.else) ? cond.else[0] : cond.else
        if (elseTarget && idToIndex.has(elseTarget)) {
          edges.push({
            id: `e-${step.id}-else-${elseTarget}`,
            source: step.id,
            target: elseTarget,
            sourceHandle: 'else',
            label: '否',
            type: 'smoothstep',
            animated: true,
          })
        }
      }
      // condition 不创建默认到下一步的 edge
    } else {
      // 非 condition：连接到下一步
      const nextStep = steps[index + 1]
      if (nextStep) {
        edges.push({
          id: `e-${step.id}-${nextStep.id}`,
          source: step.id,
          target: nextStep.id,
          type: 'smoothstep',
          animated: true,
        })
      }
    }
  })

  return { nodes, edges }
}

// ── flowToSteps ──

export function flowToSteps(nodes: Node[], edges: Edge[]): CommandStep[] {
  if (nodes.length === 0) return []

  // 只考虑主流程边（非 condition 的 then/else handle）
  // 主流程边：sourceHandle 为空 或不存在
  const mainEdges = edges.filter(
    (e) => !e.sourceHandle || e.sourceHandle === 'source'
  )

  // 构建邻接表：source → target（每个 source 只取一条主边）
  const adjacency = new Map<string, string>()
  for (const edge of mainEdges) {
    adjacency.set(edge.source, edge.target)
  }

  // 找入度为 0 的节点（没有主流程边指向它的）
  const hasIncoming = new Set(mainEdges.map((e) => e.target))
  const startNodes = nodes.filter((n) => !hasIncoming.has(n.id))
  // 多个起始节点时按 Y 坐标排序
  startNodes.sort((a, b) => a.position.y - b.position.y)

  // 沿着 edges 遍历确定顺序
  const ordered: Node[] = []
  const visited = new Set<string>()
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  function traverse(nodeId: string) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    const node = nodeMap.get(nodeId)
    if (node) ordered.push(node)
    const next = adjacency.get(nodeId)
    if (next) traverse(next)
  }

  for (const start of startNodes) {
    traverse(start.id)
  }

  // 未被遍历到的孤立节点按 Y 坐标排序追加
  const remaining = nodes.filter((n) => !visited.has(n.id))
  remaining.sort((a, b) => a.position.y - b.position.y)
  ordered.push(...remaining)

  // 从 node data 提取 CommandStep，condition 节点从 edges 恢复 then/else
  return ordered.map((node) => {
    const data = node.data as unknown as StepNodeData
    const step = extractStep(data)

    if (step.type === 'condition') {
      const condStep = step as ConditionStep
      const thenEdge = edges.find(
        (e) => e.source === node.id && e.sourceHandle === 'then'
      )
      const elseEdge = edges.find(
        (e) => e.source === node.id && e.sourceHandle === 'else'
      )
      if (thenEdge) {
        condStep.then = thenEdge.target
      }
      if (elseEdge) {
        condStep.else = elseEdge.target
      }
      return condStep
    }

    return step
  })
}

/** 从节点 data 提取原始 CommandStep */
function extractStep(data: StepNodeData): CommandStep {
  const d = data as Record<string, unknown>

  const base = {
    id: d.id as string,
    name: d.name as string | undefined,
    onError: d.onError as 'stop' | 'continue' | 'retry' | undefined,
  }

  switch (data.stepType) {
    case 'prompt':
      return {
        ...base,
        type: 'prompt',
        systemPrompt: d.systemPrompt as string | undefined,
        userMessage: d.userMessage as string,
        agent: d.agent as string | undefined,
        skills: d.skills as string[] | undefined,
        tools: d.tools as string[] | undefined,
        disallowedTools: d.disallowedTools as string[] | undefined,
        maxTurns: d.maxTurns as number | undefined,
        outputVar: d.outputVar as string | undefined,
      }
    case 'script':
      return {
        ...base,
        type: 'script',
        command: d.command as string,
        cwd: d.cwd as string | undefined,
        outputVar: d.outputVar as string | undefined,
      }
    case 'condition':
      return {
        ...base,
        type: 'condition',
        if: d.if as string,
        then: d.then as string | string[],
        else: d.else as string | string[] | undefined,
      }
    case 'parallel':
      return {
        ...base,
        type: 'parallel',
        branches: d.branches as CommandStep[][],
        outputVar: d.outputVar as string | undefined,
      }
    case 'command-ref':
      return {
        ...base,
        type: 'command-ref',
        commandId: d.commandId as string,
        params: d.params as Record<string, string> | undefined,
        outputVar: d.outputVar as string | undefined,
      }
    default:
      return d as unknown as CommandStep
  }
}

// ── autoLayout ──

export function autoLayout(nodes: Node[]): Node[] {
  // 按现有 Y 坐标排序后重新分配位置
  const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y)

  return sorted.map((node, index) => ({
    ...node,
    position: {
      x: NODE_X,
      y: index * NODE_SPACING_Y,
    },
  }))
}
