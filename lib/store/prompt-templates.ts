/**
 * 提示词模板存储层
 * 用户自定义覆盖默认值，存储在 data/prompt-templates.json
 */

import fs from 'fs'
import path from 'path'
import { PROMPT_DEFAULTS } from '@/lib/prompts/defaults'

const DATA_DIR = process.env.GCLAW_DATA_DIR
  ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')
const FILE_PATH = path.join(DATA_DIR, 'prompt-templates.json')

/** 用户自定义覆盖（只存修改过的 key） */
type PromptOverrides = Record<string, string>

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readOverrides(): PromptOverrides {
  try {
    if (!fs.existsSync(FILE_PATH)) return {}
    const raw = fs.readFileSync(FILE_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function writeOverrides(overrides: PromptOverrides) {
  ensureDataDir()
  fs.writeFileSync(FILE_PATH, JSON.stringify(overrides, null, 2), 'utf-8')
}

/** 获取单个提示词（用户自定义优先，否则返回默认值） */
export function getPromptTemplate(key: string): string {
  const overrides = readOverrides()
  return overrides[key] ?? PROMPT_DEFAULTS[key] ?? ''
}

/** 获取全部提示词（合并默认值和用户自定义） */
export function getAllPromptTemplates(): Record<string, string> {
  const overrides = readOverrides()
  return { ...PROMPT_DEFAULTS, ...overrides }
}

/** 批量更新提示词（只保存与默认值不同的） */
export function updatePromptTemplates(updates: Record<string, string>) {
  const overrides = readOverrides()
  for (const [key, value] of Object.entries(updates)) {
    if (value === PROMPT_DEFAULTS[key]) {
      // 值等于默认值时删除覆盖
      delete overrides[key]
    } else {
      overrides[key] = value
    }
  }
  writeOverrides(overrides)
}

/** 重置单个提示词为默认值 */
export function resetPromptTemplate(key: string) {
  const overrides = readOverrides()
  delete overrides[key]
  writeOverrides(overrides)
}

/** 重置全部提示词为默认值 */
export function resetAllPromptTemplates() {
  writeOverrides({})
}

/** 获取用户自定义覆盖（仅修改过的 key） */
export function getPromptOverrides(): PromptOverrides {
  return readOverrides()
}
