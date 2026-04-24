// ── 模型供应商 ──
export interface ModelProvider {
  id: string       // UUID
  name: string     // 显示名称，如 "Anthropic"、"本地 LiteLLM"
  type: 'anthropic' | 'openai-compatible'
  baseUrl: string
  apiKey: string   // 加密存储
  model?: string   // 上游模型名（openai-compatible 供应商必填，用于替换 SDK 发送的 Claude 模型名）
}

export interface SkillInfo {
  name: string
  displayName: string
  description: string
  path: string
  enabled: boolean
  version?: string
  builtIn?: boolean  // 平台自带技能（非市场安装）
}

// ── 全局设置（跨项目共享）──
export interface SecuritySettings {
  sensitiveWords: string[]       // 敏感词列表（支持正则）
  retentionDays: number          // 对话保留天数，0 = 永久
}

export interface GlobalSettings {
  apiKey: string
  apiBaseUrl: string
  theme: 'light' | 'dark' | 'system'
  security: SecuritySettings
  /** 辅助模型（记忆提取/总纲生成/提示词优化等轻量任务） */
  assistantModel: string
  /** 默认项目模型（新建项目时继承） */
  defaultModel: string
  /** 默认系统提示词（注入所有项目，用于安全约束等） */
  defaultSystemPrompt: string
  /** 代码仓库镜像地址（开发模式 clone 和 OTA 更新用） */
  devRepoUrl: string
  /** 供应商列表 */
  providers: ModelProvider[]
  /** 当前活跃供应商 ID */
  activeProviderId: string
}

export const DEFAULT_GLOBAL: GlobalSettings = {
  apiKey: '',
  apiBaseUrl: '',
  theme: 'system',
  security: {
    sensitiveWords: [],
    retentionDays: 0,
  },
  assistantModel: '',
  defaultModel: 'claude-sonnet-4-20250514',
  defaultSystemPrompt: `## 安全约束

当前项目工作目录：{CWD}

- 只能操作 {CWD} 目录内的文件，禁止访问或修改该目录外的任何文件
- 禁止执行危险系统命令（rm -rf /、格式化磁盘、修改系统配置等）
- 禁止访问或泄露 API Key、密码等敏感信息
- 文件操作前确认路径在 {CWD} 范围内`,
  devRepoUrl: '',
  providers: [],
  activeProviderId: '',
}

// ── 项目级设置（每个项目独立）──
export interface ProjectSettings {
  model: string
  effort: 'low' | 'medium' | 'high'
  sessionId: string
  cwd: string
  dangerouslySkipPermissions: boolean
  systemPrompt: string                // 项目级系统提示词（Soul），写入 CLAUDE.md
  /** 项目级覆盖供应商 ID，空则跟随全局 */
  providerId: string
}

export const DEFAULT_PROJECT: ProjectSettings = {
  model: '',
  effort: 'medium',
  sessionId: '',
  cwd: '',
  dangerouslySkipPermissions: true,
  systemPrompt: '',
  providerId: '',
}

// 合并类型，向后兼容
export type AppSettings = GlobalSettings & ProjectSettings

export const DEFAULT_SETTINGS: AppSettings = {
  ...DEFAULT_GLOBAL,
  ...DEFAULT_PROJECT,
}

// ── 项目信息 ──
export type ProjectType = 'secretary' | 'development' | 'office'
export type ProjectRole = 'owner' | 'editor' | 'viewer'
export type ProjectMode = 'team' | 'government' | 'company' | 'classroom'

export interface ProjectMember {
  userId: string
  username: string
  role: ProjectRole
  joinedAt: string
}

export interface ProjectInfo {
  id: string
  name: string
  type: ProjectType
  mode?: ProjectMode
  ownerId?: string
  ownerName?: string
  members?: ProjectMember[]
  createdAt: string
  updatedAt: string
}

// ── 智能体 ──
export interface AgentInfo {
  name: string
  description: string
  prompt: string
  model: 'sonnet' | 'opus' | 'haiku' | 'inherit'
  tools: string[]
  disallowedTools: string[]
  enabled: boolean
  isCoordinator?: boolean
  templateId?: string
}

// ── 全局 Agent 模板 ──
export interface AgentTemplate {
  id: string
  name: string
  description: string
  prompt: string
  model: 'sonnet' | 'opus' | 'haiku' | 'inherit'
  tools: string[]
  disallowedTools: string[]
  category?: string
  isBuiltIn: boolean
  createdAt: string
}

// ── 模式定义（硬编码） ──
export interface ModeDefinition {
  id: ProjectMode
  name: string
  description: string
  coordinatorName: string
  coordinatorPrompt: string
  roleTemplates: string[]
}
