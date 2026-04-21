// ── 附件 ──

export interface ChatAttachment {
  id: string                // 唯一ID
  filename: string          // 原始文件名
  mimeType: string          // MIME 类型
  size: number              // 文件大小（bytes）
  url: string               // 下载/预览 URL
  type: 'image' | 'audio' | 'document' | 'code' | 'file'  // 分类
  aesKey?: string           // 微信媒体解密密钥（可选）
}

// ── 流式块（流式阶段使用） ──

export interface StreamingTextBlock {
  type: 'text'
  id: string              // "text_0", "text_1" ... 递增
  content: string
}
export interface StreamingToolBlock {
  type: 'tool'
  id: string              // 直接用 toolUseId
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  status: 'pending' | 'completed' | 'error'
  output?: string
  isError?: boolean
  elapsedSeconds?: number
}
export type StreamingBlock = StreamingTextBlock | StreamingToolBlock

// ── 持久化块（存储到 ChatMessage，done 时从 streamingBlocks 构造） ──

export interface ContentTextBlock {
  type: 'text'
  content: string
}
export interface ContentToolBlock {
  type: 'tool'
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  status: 'completed' | 'error'
  output?: string
  isError?: boolean
}
export type ContentBlock = ContentTextBlock | ContentToolBlock

// ── 消息 ──

// 消息来源类型
export type MessageSource = 'web' | 'feishu' | 'dingtalk' | 'wechat' | 'api' | 'schedule'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  messageType: 'text' | 'tool_summary'
  createdAt: string
  source?: MessageSource          // 消息来源渠道
  sourceName?: string             // 来源渠道名称（如"我的飞书机器人"）
  isStreaming?: boolean
  toolSummary?: ToolSummary
  contentBlocks?: ContentBlock[]   // 新字段：交错文本/工具块
  stats?: ConversationStats
  attachments?: ChatAttachment[]  // 附件列表
  feedback?: 'like' | 'dislike'   // 用户反馈：点赞/踩
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

// ── 预览面板 ──

export interface FileChangeEntry {
  filePath: string
  type: 'write' | 'edit' | 'multiedit'
  content?: string
  oldString?: string
  newString?: string
  startLine?: number
  timestamp: string
  toolUseId: string
  status: 'pending' | 'completed' | 'error'
}

export interface ActivityTodoItem {
  id?: string
  content: string
  status: string
}

export interface ActivityData {
  planContent: string | null
  fileChanges: FileChangeEntry[]
  todos: ActivityTodoItem[]
}
