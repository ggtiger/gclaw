'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import {
  MessageSquare,
  Terminal,
  GitBranch,
  GitMerge,
  Link,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { CommandStep } from '@/types/commands'

// ── 节点 data 类型 ──

export type StepNodeData = {
  [key: string]: unknown
  stepType: CommandStep['type']
  label: string
  id: string
  name?: string
  type: CommandStep['type']
  onError?: 'stop' | 'continue' | 'retry'
}

export type StepNodeType = Node<StepNodeData, 'stepNode'>

// ── 样式配置 ──

interface StepStyle {
  border: string
  bg: string
  darkBg: string
  icon: LucideIcon
  iconColor: string
  defaultTitle: string
}

const STEP_STYLES: Record<CommandStep['type'], StepStyle> = {
  prompt: {
    border: 'border-blue-400',
    bg: 'bg-blue-50',
    darkBg: 'dark:bg-blue-950/40',
    icon: MessageSquare,
    iconColor: 'text-blue-500',
    defaultTitle: 'AI 对话',
  },
  script: {
    border: 'border-green-400',
    bg: 'bg-green-50',
    darkBg: 'dark:bg-green-950/40',
    icon: Terminal,
    iconColor: 'text-green-500',
    defaultTitle: '脚本执行',
  },
  condition: {
    border: 'border-orange-400',
    bg: 'bg-orange-50',
    darkBg: 'dark:bg-orange-950/40',
    icon: GitBranch,
    iconColor: 'text-orange-500',
    defaultTitle: '条件判断',
  },
  parallel: {
    border: 'border-purple-400',
    bg: 'bg-purple-50',
    darkBg: 'dark:bg-purple-950/40',
    icon: GitMerge,
    iconColor: 'text-purple-500',
    defaultTitle: '并行执行',
  },
  'command-ref': {
    border: 'border-gray-400',
    bg: 'bg-gray-50',
    darkBg: 'dark:bg-gray-950/40',
    icon: Link,
    iconColor: 'text-gray-500',
    defaultTitle: '引用命令',
  },
  'dynamic-exec': {
    border: 'border-rose-400',
    bg: 'bg-rose-50',
    darkBg: 'dark:bg-rose-950/40',
    icon: Zap,
    iconColor: 'text-rose-500',
    defaultTitle: 'AI 动态执行',
  },
}

// ── 预览文本 ──

function getPreview(data: StepNodeData): string {
  switch (data.stepType) {
    case 'prompt': {
      const msg = (data.userMessage as string) ?? ''
      return msg.length > 60 ? msg.slice(0, 60) + '…' : msg
    }
    case 'script': {
      const cmd = (data.command as string) ?? ''
      return cmd.length > 40 ? cmd.slice(0, 40) + '…' : cmd
    }
    case 'condition': {
      const expr = (data.if as string) ?? ''
      return expr.length > 50 ? expr.slice(0, 50) + '…' : expr
    }
    case 'parallel': {
      const branches = data.branches as unknown[][] | undefined
      return `${branches?.length ?? 0} 个分支`
    }
    case 'command-ref': {
      return (data.commandId as string) ?? ''
    }
    case 'dynamic-exec': {
      const intent = (data.intent as string) ?? ''
      return intent.length > 50 ? intent.slice(0, 50) + '…' : intent
    }
    default:
      return ''
  }
}

// ── 节点组件 ──

function StepNodeComponent({ data, selected }: NodeProps<StepNodeType>) {
  const stepType = data.stepType ?? 'prompt'
  const style = STEP_STYLES[stepType] ?? STEP_STYLES.prompt
  const Icon = style.icon
  const title = data.label || (data.name as string) || style.defaultTitle
  const preview = getPreview(data)

  const isCondition = stepType === 'condition'

  return (
    <div
      className={[
        'relative w-[220px] rounded-lg border-2 px-3 py-2 shadow-sm transition-shadow',
        style.border,
        style.bg,
        style.darkBg,
        'dark:border-opacity-60',
        selected ? 'ring-2 ring-blue-500 shadow-lg' : '',
      ].join(' ')}
    >
      {/* 顶部输入端口 */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-gray-400 hover:!bg-blue-500 dark:!bg-gray-500 !border-2 !border-white dark:!border-gray-800 !cursor-crosshair"
        style={{ zIndex: 10 }}
      />

      {/* 节点主体 */}
      <div className="flex items-start gap-2">
        <Icon size={18} className={`${style.iconColor} mt-0.5 shrink-0`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
            {title}
          </div>
          {preview && (
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 break-words line-clamp-2">
              {preview}
            </div>
          )}
        </div>
      </div>

      {/* 底部输出端口 */}
      {isCondition ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="else"
            className="!w-3 !h-3 !bg-orange-400 hover:!bg-orange-600 !border-2 !border-white dark:!border-gray-800 !cursor-crosshair"
            style={{ left: '30%', zIndex: 10 }}
          />
          <span
            className="absolute text-[10px] text-gray-500 dark:text-gray-400 pointer-events-none"
            style={{ bottom: -16, left: '25%' }}
          >
            否
          </span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="then"
            className="!w-3 !h-3 !bg-green-400 hover:!bg-green-600 !border-2 !border-white dark:!border-gray-800 !cursor-crosshair"
            style={{ left: '70%', zIndex: 10 }}
          />
          <span
            className="absolute text-[10px] text-gray-500 dark:text-gray-400 pointer-events-none"
            style={{ bottom: -16, left: '65%' }}
          >
            是
          </span>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-gray-400 hover:!bg-blue-500 dark:!bg-gray-500 !border-2 !border-white dark:!border-gray-800 !cursor-crosshair"
          style={{ zIndex: 10 }}
        />
      )}
    </div>
  )
}

export default memo(StepNodeComponent)
