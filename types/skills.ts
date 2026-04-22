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
  /** 代码仓库镜像地址（开发模式 clone 和 OTA 更新用） */
  devRepoUrl: string
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
  devRepoUrl: '',
}

// ── 项目级设置（每个项目独立）──
export interface ProjectSettings {
  model: string
  effort: 'low' | 'medium' | 'high'
  sessionId: string
  cwd: string
  dangerouslySkipPermissions: boolean
  systemPrompt: string                // 项目级系统提示词（Soul），写入 CLAUDE.md
}

export const DEFAULT_PROJECT: ProjectSettings = {
  model: '',
  effort: 'medium',
  sessionId: '',
  cwd: '',
  dangerouslySkipPermissions: true,
  systemPrompt: '',
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
