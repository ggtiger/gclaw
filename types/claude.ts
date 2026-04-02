// SDK 消息到内部事件的转换上下文
export interface ConvertContext {
  streamedTextLength: number    // 已通过 stream_event 发送的文本长度
  lastModel: string             // 跟踪模型名称
  sentToolUseIds: Set<string>   // 已通过 stream_event 发送的 tool_use id
}

// 内部统一事件类型 — stream-parser 到 process-manager 之间的契约
export type ParsedEvent =
  | { kind: 'init'; sessionId: string; model: string }
  | { kind: 'delta'; content: string }
  | { kind: 'thinking'; content: string }
  | { kind: 'tool_use'; toolUseId: string; toolName: string; input: Record<string, unknown> }
  | { kind: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { kind: 'tool_progress'; toolUseId: string; toolName: string; elapsedSeconds: number }
  | { kind: 'status'; status: 'compacting' | null }
  | { kind: 'compact_boundary'; trigger: 'manual' | 'auto'; preTokens: number }
  | { kind: 'hook_response'; hookName: string; hookEvent: string; stdout: string; stderr: string; exitCode?: number }
  | { kind: 'done'; sessionId: string | null; usage: { inputTokens: number; outputTokens: number; cachedTokens: number } | null; costUsd: number | null; summary: string }
  | { kind: 'error'; message: string }
