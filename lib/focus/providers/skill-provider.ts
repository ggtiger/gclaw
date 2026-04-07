/**
 * Focus Skill Provider
 * 当 FocusSettings 中数据源类型为 'skill' 时，从指定 Skill 的 gclaw-hooks.json 读取 hooks 配置，
 * 通过脚本执行或数据文件读取获取 Focus 数据。
 *
 * 数据流：
 * 1. 从 FocusSettings 读取 skillName
 * 2. 加载该 Skill 的 gclaw-hooks.json（ResolvedHookEntry）
 * 3. 执行 Skill 脚本获取数据（如有配置 script action）
 * 4. 或读取 Skill 目录下的数据文件（如有配置 logFile）
 * 5. 将原始数据转为 FocusTodo / FocusNote / FocusEvent
 */

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { loadSingleSkillHooks, readSkillHooksConfig } from '@/lib/claude/skill-hooks'
import type { ResolvedHookEntry } from '@/lib/claude/skill-hooks'
import type { FocusTodo, FocusNote, FocusEvent, FocusDataType } from '@/types/focus'

const SKILLS_DIR = path.join(process.cwd(), 'skills')

// ── Skill Hooks 数据文件路径约定 ──

/**
 * 获取技能目录下用于存储指定数据类型的 JSON 文件路径
 * 约定：skills/{skillName}/data/{dataType}.json
 */
function getSkillDataPath(skillName: string, dataType: FocusDataType): string {
  return path.join(SKILLS_DIR, skillName, 'data', `${dataType}.json`)
}

/**
 * 获取技能目录下用于获取指定数据类型的脚本路径
 * 约定：skills/{skillName}/scripts/focus-{dataType}.sh
 */
function getSkillScriptPath(skillName: string, dataType: FocusDataType): string {
  return path.join(SKILLS_DIR, skillName, 'scripts', `focus-${dataType}.sh`)
}

// ── 数据读取 ──

/**
 * 从技能数据文件读取并解析 JSON
 */
function readSkillDataFile<T>(filePath: string): T[] {
  try {
    if (!fs.existsSync(filePath)) return []
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

/**
 * 执行技能脚本获取数据
 * 脚本通过 stdout 输出 JSON 数组
 */
function executeSkillScript(
  skillName: string,
  dataType: FocusDataType,
  params?: Record<string, string>
): Promise<string> {
  return new Promise((resolve) => {
    const scriptPath = getSkillScriptPath(skillName, dataType)

    if (!fs.existsSync(scriptPath)) {
      resolve('[]')
      return
    }

    const envExtra: Record<string, string> = {
      GCLAW_DATA_TYPE: dataType,
    }
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        envExtra[`GCLAW_PARAM_${key.toUpperCase()}`] = value
      }
    }

    let stdout = ''
    let stderr = ''

    const child = spawn('bash', [scriptPath], {
      cwd: path.join(SKILLS_DIR, skillName),
      env: { ...process.env, ...envExtra },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
    })

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        console.warn(`[FocusSkillProvider] Script exited with code ${code}: ${stderr}`)
        resolve('[]')
        return
      }
      resolve(stdout.trim() || '[]')
    })

    child.on('error', (err: Error) => {
      console.error(`[FocusSkillProvider] Script spawn error:`, err)
      resolve('[]')
    })
  })
}

// ── 数据转换 ──

/**
 * 将原始数据转为 FocusTodo（补充缺失字段）
 */
function normalizeTodos(rawItems: unknown[]): FocusTodo[] {
  const now = new Date().toISOString()
  return rawItems.map((item) => {
    const obj = item as Record<string, unknown>
    return {
      id: String(obj.id ?? randomUUID().slice(0, 8)),
      title: String(obj.title ?? obj.name ?? ''),
      status: (['pending', 'in_progress', 'completed'].includes(obj.status as string)
        ? obj.status : 'pending') as FocusTodo['status'],
      priority: obj.priority as FocusTodo['priority'] ?? undefined,
      dueDate: obj.dueDate ? String(obj.dueDate) : undefined,
      createdAt: String(obj.createdAt ?? now),
      updatedAt: String(obj.updatedAt ?? now),
    }
  })
}

/**
 * 将原始数据转为 FocusNote（补充缺失字段）
 */
function normalizeNotes(rawItems: unknown[]): FocusNote[] {
  const now = new Date().toISOString()
  return rawItems.map((item) => {
    const obj = item as Record<string, unknown>
    return {
      id: String(obj.id ?? randomUUID().slice(0, 8)),
      title: String(obj.title ?? obj.name ?? ''),
      content: String(obj.content ?? obj.body ?? ''),
      tags: Array.isArray(obj.tags) ? obj.tags.map(String) : undefined,
      createdAt: String(obj.createdAt ?? now),
      updatedAt: String(obj.updatedAt ?? now),
    }
  })
}

/**
 * 将原始数据转为 FocusEvent（补充缺失字段）
 */
function normalizeEvents(rawItems: unknown[]): FocusEvent[] {
  return rawItems.map((item) => {
    const obj = item as Record<string, unknown>
    return {
      id: String(obj.id ?? randomUUID().slice(0, 8)),
      title: String(obj.title ?? obj.name ?? obj.summary ?? ''),
      description: obj.description ? String(obj.description) : undefined,
      startTime: String(obj.startTime ?? obj.start ?? obj.date ?? ''),
      endTime: obj.endTime ? String(obj.endTime) : (obj.end ? String(obj.end) : undefined),
      location: obj.location ? String(obj.location) : undefined,
      color: obj.color ? String(obj.color) : undefined,
    }
  })
}

// ── 公共接口 ──

export interface FocusSkillProviderResult {
  /** 数据列表 */
  data: FocusTodo[] | FocusNote[] | FocusEvent[]
  /** 该 Skill 的 hooks 配置摘要（事件 -> 条目数量） */
  hooksSummary: Record<string, number>
  /** 该 Skill 的 hooks 详细配置 */
  hooks: Map<string, ResolvedHookEntry[]>
}

/**
 * 从指定技能获取 Focus 数据
 *
 * @param skillName 技能名称
 * @param dataType 数据类型（todos / notes / events）
 * @param params 技能参数（来自 FocusDataSourceConfig.skillParams）
 */
export async function getFocusDataFromSkill(
  skillName: string,
  dataType: FocusDataType,
  params?: Record<string, string>
): Promise<FocusSkillProviderResult> {
  // 1. 加载该 Skill 的 gclaw-hooks.json 配置
  const hooks = loadSingleSkillHooks(skillName)

  // 构建 hooks 摘要
  const hooksSummary: Record<string, number> = {}
  for (const [eventName, entries] of hooks) {
    hooksSummary[eventName] = entries.length
  }

  // 2. 尝试执行脚本获取数据
  const scriptOutput = await executeSkillScript(skillName, dataType, params)

  let rawItems: unknown[]
  try {
    rawItems = JSON.parse(scriptOutput)
    if (!Array.isArray(rawItems)) rawItems = []
  } catch {
    // 脚本输出非 JSON，尝试从数据文件读取
    rawItems = []
  }

  // 3. 如果脚本没有返回数据，尝试从技能数据文件读取
  if (rawItems.length === 0) {
    const dataPath = getSkillDataPath(skillName, dataType)
    rawItems = readSkillDataFile(dataPath)
  }

  // 4. 转换数据
  let data: FocusTodo[] | FocusNote[] | FocusEvent[]
  switch (dataType) {
    case 'todos':
      data = normalizeTodos(rawItems)
      break
    case 'notes':
      data = normalizeNotes(rawItems)
      break
    case 'events':
      data = normalizeEvents(rawItems)
      break
  }

  return { data, hooksSummary, hooks }
}

/**
 * 获取指定技能的 hooks 配置信息（供前端展示）
 * 返回原始配置（不包含 skillDir 等内部信息）
 */
export function getSkillHooksInfo(skillName: string): {
  hooks: Record<string, unknown[]>
} | null {
  const config = readSkillHooksConfig(skillName)
  if (!config) return null

  // 脱敏：移除内部路径信息
  const safeHooks: Record<string, unknown[]> = {}
  for (const [eventName, entries] of Object.entries(config.hooks)) {
    if (Array.isArray(entries)) {
      safeHooks[eventName] = entries.map(({ action, description, filter, message }) => ({
        action,
        description,
        filter,
        message,
      }))
    }
  }

  return { hooks: safeHooks }
}
