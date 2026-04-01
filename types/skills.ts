export interface SkillInfo {
  name: string
  displayName: string
  description: string
  path: string
  enabled: boolean
}

export interface AppSettings {
  model: string
  effort: 'low' | 'medium' | 'high'
  theme: 'light' | 'dark' | 'system'
  sessionId: string
  cwd: string
  dangerouslySkipPermissions: boolean
  apiKey: string
  apiBaseUrl: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  model: '',
  effort: 'medium',
  theme: 'system',
  sessionId: '',
  cwd: '',
  dangerouslySkipPermissions: true,
  apiKey: '',
  apiBaseUrl: '',
}
