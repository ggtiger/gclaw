'use client'

import { memo, useMemo } from 'react'
import { MarkdownRenderer } from './MarkdownRenderer'
import { StreamingToolCard } from './StreamingToolCard'
import type { StreamingBlock, StreamingToolBlock, ContentBlock, AskUserQuestionRequest } from '@/types/chat'

// ── 将 ContentBlock[]（持久化格式）适配为 StreamingBlock[]（渲染格式） ──

export function adaptContentBlocks(blocks: ContentBlock[]): StreamingBlock[] {
  return blocks.map((b, i) =>
    b.type === 'text'
      ? { type: 'text' as const, id: `cb_${i}`, content: b.content }
      : { type: 'tool' as const, id: b.toolUseId, toolUseId: b.toolUseId, toolName: b.toolName, input: b.input, status: b.status, output: b.output, isError: b.isError, elapsedSeconds: undefined }
  )
}

// ── 判断是否为 TodoWrite ──

function isTodoWrite(name: string) {
  return name === 'TodoWrite' || name === 'todo_write'
}

// ── Props ──

interface StreamingBlocksRendererProps {
  blocks: StreamingBlock[]
  isStreaming?: boolean
  askQuestion?: AskUserQuestionRequest | null
  onRespondAskQuestion?: (requestId: string, answers: Record<string, string>) => void
  projectId?: string
  projectCwd?: string
}

// ── 渲染器 ──

export const StreamingBlocksRenderer = memo(function StreamingBlocksRenderer({
  blocks,
  isStreaming,
  askQuestion,
  onRespondAskQuestion,
  projectId,
  projectCwd,
}: StreamingBlocksRendererProps) {
  // 分析块序列：收集 TodoWrite 块、计算工具→任务映射、标记需隐藏的工具
  const { lastTodoBlockId, allTodoBlocks, nestedToolIds, taskToolsMap } = useMemo(() => {
    const allTodoBlocks: StreamingToolBlock[] = []
    const nestedToolIds = new Set<string>()
    const taskToolsMap = new Map<string, StreamingToolBlock[]>()
    let lastTodoBlockId: string | null = null
    let currentTaskId: string | null = null

    for (const block of blocks) {
      if (block.type === 'tool' && isTodoWrite(block.toolName)) {
        lastTodoBlockId = block.id
        allTodoBlocks.push(block)
        // 找出当前 IN_PROGRESS 的任务
        const todos = (block.input?.todos as Array<{ id?: string; content: string; status: string }>) || []
        const inProgress = todos.find(t => {
          const s = (t.status || '').toUpperCase()
          return s === 'IN_PROGRESS'
        })
        if (inProgress) {
          currentTaskId = inProgress.id || `_auto_${inProgress.content?.slice(0, 30)}`
          if (!taskToolsMap.has(currentTaskId)) {
            taskToolsMap.set(currentTaskId, [])
          }
        } else {
          currentTaskId = null
        }
      } else if (block.type === 'tool' && currentTaskId) {
        // 该工具属于当前 IN_PROGRESS 任务
        nestedToolIds.add(block.id)
        taskToolsMap.get(currentTaskId)!.push(block)
      }
      // text 块不属于任何任务，保持顶层层级
    }

    return { lastTodoBlockId, allTodoBlocks, nestedToolIds, taskToolsMap }
  }, [blocks])

  return (
    <div className="space-y-2">
      {blocks.map(block => {
        // 隐藏非最后一个 TodoWrite 块
        if (block.type === 'tool' && isTodoWrite(block.toolName) && block.id !== lastTodoBlockId) {
          return null
        }
        // 隐藏已归入任务的工具卡片
        if (nestedToolIds.has(block.id)) {
          return null
        }
        // 隐藏 TaskOutput（内部协调工具，结果已通过原始任务卡片展示）
        if (block.type === 'tool' && block.toolName === 'TaskOutput') {
          return null
        }

        return block.type === 'text' ? (
          <MarkdownRenderer
            key={block.id}
            content={block.content}
            isStreaming={isStreaming}
            projectId={projectId}
            projectCwd={projectCwd}
          />
        ) : (
          <StreamingToolCard
            key={block.id}
            tool={block}
            askQuestion={block.status === 'pending' ? askQuestion : null}
            onRespondAskQuestion={onRespondAskQuestion}
            allTodoBlocks={allTodoBlocks.length > 0 ? allTodoBlocks : undefined}
            taskToolsMap={taskToolsMap.size > 0 ? taskToolsMap : undefined}
            projectId={projectId}
            projectCwd={projectCwd}
          />
        )
      })}
    </div>
  )
})
