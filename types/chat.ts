export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  messageType: 'text' | 'tool_summary'
  createdAt: string
  isStreaming?: boolean
  toolSummary?: ToolSummary
  stats?: ConversationStats
}

export interface ToolCallItem {
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  status: 'pending' | 'completed' | 'error'
  output?: string
  isError?: boolean
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

export type SSEEventType =
  | 'start'
  | 'init'
  | 'delta'
  | 'tool_use'
  | 'tool_result'
  | 'done'
  | 'error'
  | 'end'

export interface SSEEvent {
  event: SSEEventType
  data: Record<string, unknown>
}
