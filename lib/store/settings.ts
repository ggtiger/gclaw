import fs from 'fs'
import path from 'path'
import {
  type AppSettings,
  type GlobalSettings,
  type ProjectSettings,
  type ModelProvider,
  DEFAULT_GLOBAL,
  DEFAULT_PROJECT,
  DEFAULT_SETTINGS,
} from '@/types/skills'
import { getProjectDataDir } from './projects'
import { encrypt, decrypt, isEncrypted } from '@/lib/crypto'
import { logger } from '@/lib/logger'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')
const GLOBAL_FILE = path.join(DATA_DIR, 'global.json')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

// ── 全局设置 ──

export function getGlobalSettings(): GlobalSettings {
  ensureDataDir()
  try {
    if (!fs.existsSync(GLOBAL_FILE)) return { ...DEFAULT_GLOBAL }
    const raw = fs.readFileSync(GLOBAL_FILE, 'utf-8')
    const data = JSON.parse(raw)
    const settings = { ...DEFAULT_GLOBAL, ...data }
    // 解密 apiKey
    if (settings.apiKey) {
      settings.apiKey = decrypt(settings.apiKey)
    }
    // 解密 providers 中的 apiKey
    if (settings.providers && Array.isArray(settings.providers)) {
      settings.providers = settings.providers.map((p: ModelProvider) => ({
        ...p,
        apiKey: p.apiKey ? decrypt(p.apiKey) : '',
      }))
    }
    return settings
  } catch {
    return { ...DEFAULT_GLOBAL }
  }
}

export function updateGlobalSettings(partial: Partial<GlobalSettings>): GlobalSettings {
  const current = getGlobalSettings()
  const updated = { ...current, ...partial }
  // 加密 apiKey 后存储
  const toStore = { ...updated } as Record<string, unknown>
  if (toStore.apiKey) {
    // 仅在非加密状态时加密（避免重复加密）
    if (!isEncrypted(toStore.apiKey as string)) {
      toStore.apiKey = encrypt(toStore.apiKey as string)
    }
  }
  // 加密 providers 中的 apiKey
  if (toStore.providers && Array.isArray(toStore.providers)) {
    toStore.providers = (toStore.providers as ModelProvider[]).map(p => ({
      ...p,
      apiKey: p.apiKey && !isEncrypted(p.apiKey) ? encrypt(p.apiKey) : p.apiKey,
    }))
  }
  ensureDataDir()
  fs.writeFileSync(GLOBAL_FILE, JSON.stringify(toStore, null, 2), 'utf-8')
  return updated
}

// ── 项目设置 ──

export function getProjectSettings(projectId: string): ProjectSettings {
  const dir = getProjectDataDir(projectId)
  const file = path.join(dir, 'settings.json')
  try {
    if (!fs.existsSync(file)) return { ...DEFAULT_PROJECT }
    const raw = fs.readFileSync(file, 'utf-8')
    const data = JSON.parse(raw)
    return { ...DEFAULT_PROJECT, ...data }
  } catch {
    return { ...DEFAULT_PROJECT }
  }
}

export function updateProjectSettings(projectId: string, partial: Partial<ProjectSettings>): ProjectSettings {
  const dir = getProjectDataDir(projectId)
  const current = getProjectSettings(projectId)
  const updated = { ...current, ...partial }
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(updated, null, 2), 'utf-8')
  return updated
}

// ── 合并接口（向后兼容）──

const GLOBAL_KEYS = new Set<string>(['apiKey', 'apiBaseUrl', 'theme', 'assistantModel', 'defaultModel', 'devRepoUrl', 'providers', 'activeProviderId'])

export function getSettings(projectId: string): AppSettings {
  const global = getGlobalSettings()
  if (!projectId) return { ...DEFAULT_PROJECT, ...global } as AppSettings
  const project = getProjectSettings(projectId)
  return { ...global, ...project }
}

export function updateSettings(projectId: string, partial: Partial<AppSettings>): AppSettings {
  const globalPart: Partial<GlobalSettings> = {}
  const projectPart: Partial<ProjectSettings> = {}

  for (const [key, value] of Object.entries(partial)) {
    if (GLOBAL_KEYS.has(key)) {
      ;(globalPart as Record<string, unknown>)[key] = value
    } else {
      ;(projectPart as Record<string, unknown>)[key] = value
    }
  }

  if (Object.keys(globalPart).length > 0) updateGlobalSettings(globalPart)
  if (Object.keys(projectPart).length > 0) updateProjectSettings(projectId, projectPart)

  return getSettings(projectId)
}

// ── 供应商配置解析 ──

export interface ProviderConfig {
  apiKey: string
  baseUrl: string
  /** 供应商类型，用于判断协议格式 */
  providerType?: 'anthropic' | 'openai-compatible'
  /** 供应商显示名称 */
  providerName?: string
  /** 供应商 ID */
  providerId?: string
}

/**
 * 解析最终生效的 API Key 和 Base URL
 * 优先级：项目级 providerId → 全局 activeProviderId → 旧版 apiKey/apiBaseUrl
 */
export function resolveProviderConfig(projectId?: string): ProviderConfig {
  const global = getGlobalSettings()
  const providers = global.providers || []
  let providerId = ''

  // 项目级覆盖
  if (projectId) {
    const project = getProjectSettings(projectId)
    if (project.providerId) {
      providerId = project.providerId
    }
  }

  // 全局活跃供应商
  if (!providerId) {
    providerId = global.activeProviderId
  }

  // 从 provider 列表查找
  if (providerId) {
    const provider = providers.find(p => p.id === providerId)
    if (provider) {
      logger.info(`[Provider] 解析结果: projectId=${projectId || '(无)'} | source=provider | name="${provider.name}" | type=${provider.type} | baseUrl=${provider.baseUrl}`)
      return { apiKey: provider.apiKey, baseUrl: provider.baseUrl, providerType: provider.type, providerName: provider.name, providerId: provider.id }
    }
  }

  // 回退旧版配置
  const source = providerId ? 'provider-not-found,fallback' : 'legacy'
  logger.info(`[Provider] 解析结果: projectId=${projectId || '(无)'} | source=${source} | baseUrl=${global.apiBaseUrl || '(默认)'}`)
  return {
    apiKey: global.apiKey || process.env.ANTHROPIC_API_KEY || '',
    baseUrl: global.apiBaseUrl || process.env.ANTHROPIC_BASE_URL || '',
  }
}
