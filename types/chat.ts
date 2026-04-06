export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  messageType: 'text' | 'tool_summary'
  createdAt: string
  isStreaming?: boolean
  toolSummary?: ToolSummary
  stats?: ConversationStats
  tags?: string[]       // 消息标签
  isStarred?: boolean   // 是否收藏
}

export interface ToolCallItem {
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  status: 'pending' | 'completed' | 'error'
  output?: string
  isError?: boolean
  elapsedSeconds?: number
}

export interface ToolSummary {
  pendingTools: ToolCallItem[]
  completedTools: ToolCallItem[]
}

export interface ConversationStats {
  costUsd: number
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  model: string
}

export interface SessionInfo {
  sessionId: string
  model: string
  cwd?: string
}

export interface PermissionRequest {
  requestId: string
  toolName: string
  toolInput: Record<string, unknown>
  description: string
}

export interface AskUserQuestionOption {
  label: string
  description: string
  preview?: string
}

export interface AskUserQuestionItem {
  question: string
  header: string
  options: AskUserQuestionOption[]
  multiSelect: boolean
}

export interface AskUserQuestionRequest {
  requestId: string
  questions: AskUserQuestionItem[]
}

export type SSEEventType =
  | 'start'
  | 'init'
  | 'delta'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'tool_progress'
  | 'status'
  | 'permission_request'
  | 'ask_user_question'
  | 'skill_notify'
  | 'done'
  | 'error'
  | 'end'

export interface SSEEvent {
  event: SSEEventType
  data: Record<string, unknown>
}

// ── 对话分支 ──

export interface BranchInfo {
  id: string
  name: string
  forkFromMessageId: string   // 从哪条消息分叉
  forkAtIndex: number          // 分叉点在原始消息列表中的索引
  messages?: ChatMessage[]      // 分支消息列表
  createdAt: string
}

export const MAX_BRANCHES = 5
