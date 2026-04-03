export interface SkillInfo {
  name: string
  displayName: string
  description: string
  path: string
  enabled: boolean
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
}

export const DEFAULT_GLOBAL: GlobalSettings = {
  apiKey: '',
  apiBaseUrl: '',
  theme: 'system',
  security: {
    sensitiveWords: [],
    retentionDays: 0,
  },
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
}
