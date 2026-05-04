// ── 命令参数 ──

export interface CommandParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'enum' | 'file'
  required: boolean
  default?: any
  description: string
  values?: string[]             // enum 类型的可选值
  placeholder?: string
}

// ── 步骤类型 ──

export interface StepBase {
  id: string
  name?: string
  onError?: 'stop' | 'continue' | 'retry'
}

export interface PromptStep extends StepBase {
  type: 'prompt'
  systemPrompt?: string
  userMessage: string
  agent?: string
  skills?: string[]
  tools?: string[]
  disallowedTools?: string[]
  maxTurns?: number
  outputVar?: string
}

export interface ScriptStep extends StepBase {
  type: 'script'
  command: string
  cwd?: string
  outputVar?: string
}

export interface ConditionStep extends StepBase {
  type: 'condition'
  if: string
  then: string | string[]
  else?: string | string[]
}

export interface CommandRefStep extends StepBase {
  type: 'command-ref'
  commandId: string
  params?: Record<string, string>
  outputVar?: string
}

export interface ParallelStep extends StepBase {
  type: 'parallel'
  branches: CommandStep[][]
  outputVar?: string
}

export type CommandStep = PromptStep | ScriptStep | ConditionStep | CommandRefStep | ParallelStep

// ── 命令定义 ──

export interface CommandDefinition {
  id: string                    // 唯一标识 (kebab-case)
  name: string                  // 显示名称
  description: string           // 命令描述
  category?: string             // 分类 (development, writing, analysis...)
  scope: 'global' | 'project'  // 作用域
  enabled: boolean
  parameters?: CommandParameter[]
  steps: CommandStep[]
  output?: {
    format?: 'markdown' | 'json' | 'text'
    saveTo?: string             // 文件保存路径模板
  }
  createdAt: string
  updatedAt: string
  createdBy?: string
}

// ── 执行上下文 ──

export interface ExecutionContext {
  params: Record<string, any>
  steps: Record<string, StepResult>
  variables: Record<string, any>
  projectId: string
  userId: string
  cwd: string
}

export interface StepResult {
  stepId: string
  output: string
  status: 'completed' | 'failed' | 'skipped'
  duration: number
}

// ── 工作流 SSE 事件数据 ──

export interface WorkflowStepInfo {
  stepId: string
  stepName?: string
  index: number
  total: number
}

export interface WorkflowDoneInfo {
  totalDuration: number
  stepResults: StepResult[]
}

// ── 工作流 SSE 事件 ──

export type CommandSSEEvent =
  | { type: 'workflow_start'; data: { commandId: string; commandName: string; totalSteps: number } }
  | { type: 'workflow_step_start'; data: WorkflowStepInfo }
  | { type: 'workflow_step_done'; data: { stepId: string; status: string; duration: number } }
  | { type: 'workflow_done'; data: WorkflowDoneInfo }
  | { type: 'workflow_error'; data: { error: string; stepId?: string } }
  | { type: 'step_delta'; data: { stepId: string; content: string } }
  | { type: 'step_tool_use'; data: { stepId: string; toolUseId: string; toolName: string; input: any } }
    | { type: 'step_tool_result'; data: { stepId: string; toolUseId: string; content: string; isError: boolean } }
    | { type: 'step_tool_progress'; data: { stepId: string; toolUseId: string; toolName: string; elapsedSeconds: number } }
  | { type: 'permission_request'; data: { requestId: string; toolName: string; toolInput: Record<string, unknown>; description: string } }
  | { type: 'ask_user_question'; data: { requestId: string; questions: any[] } }
  | { type: 'step_confirmation_request'; data: { requestId: string; stepId: string; stepName: string; stepIndex: number; totalSteps: number; output: string } }
