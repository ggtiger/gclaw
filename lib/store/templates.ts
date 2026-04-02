import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const DATA_DIR = process.env.GCLAW_DATA_DIR
 ? path.join(process.env.GCLAW_DATA_DIR, 'data')
  : path.join(process.cwd(), 'data')
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json')

export interface ConversationTemplate {
  id: string
  name: string
  description: string
  systemPrompt: string
  firstMessage: string
  isBuiltIn: boolean
  createdAt: string
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

const DEFAULT_TEMPLATES: ConversationTemplate[] = [
  {
    id: 'builtin-code-review',
    name: '代码审查',
    description: '审查代码质量、风格和安全性',
    systemPrompt: '你是一名资深代码审查专家。请仔细审查用户提交的代码，关注：代码质量、安全性、性能、可维护性和最佳实践。用清晰简洁的语言给出审查意见。',
    firstMessage: '请帮我审查以下代码，指出潜在问题并给出改进建议：```\n```\n',
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'builtin-doc-translate',
    name: '文档翻译',
    description: '翻译技术文档为中文',
    systemPrompt: '你是一名专业的技术文档翻译专家。请将技术文档准确翻译为中文，保持技术术语的准确性，并确保译文流畅自然。',
    firstMessage: '请将以下文档翻译为中文:```\n```\n',
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'builtin-data-analysis',
    name: '数据分析',
    description: '分析数据并生成报告',
    systemPrompt: '你是一名数据分析专家。请分析用户提供的数据、找出关键趋势和模式、并给出可执行的洞察和建议。',
    firstMessage: '请帮我分析以下数据:```\n```\n',
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'builtin-bug-analysis',
    name: 'Bug 分析',
    description: '分析并定位 Bug',
    systemPrompt: '你是一名经验丰富的调试专家。请帮助用户分析 Bug 的根因、提供清晰的调试步骤和修复方案。',
    firstMessage: '我遇到了一个 Bug，请帮我分析:```\n```\n',
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'builtin-weekly-report',
    name: '周报生成',
    description: '生成本周工作总结',
    systemPrompt: '你是一名工作总结助手。请根据用户提供的本周工作内容、生成一份结构清晰、重点突出的周报。',
    firstMessage: '请根据以下内容帮我生成本周工作周报:```\n```\n',
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
  },
]

function readTemplates(): ConversationTemplate[] {
  ensureDataDir()
  try {
    if (!fs.existsSync(TEMPLATES_FILE)) {
      // 首次初始化默认模板
      fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(DEFAULT_TEMPLATES, null, 2), 'utf-8')
      return [...DEFAULT_TEMPLATES]
    }
    const raw = fs.readFileSync(TEMPLATES_FILE, 'utf-8')
    const data = JSON.parse(raw)
    const templates: ConversationTemplate[] = Array.isArray(data) ? data : []
    // 合并内置模板（以 id 为准，确保更新）
    const builtInMap = new Map(DEFAULT_TEMPLATES.map(t => [t.id, t]))
    const result: ConversationTemplate[] = []
    const seenIds = new Set<string>()
    for (const t of templates) {
      if (builtInMap.has(t.id)) {
        result.push({ ...builtInMap.get(t.id)!, ...t, isBuiltIn: true })
      } else {
        result.push(t)
      }
      seenIds.add(t.id)
    }
    // 添加缺失的内置模板
    for (const t of DEFAULT_TEMPLATES) {
      if (!seenIds.has(t.id)) {
        result.push(t)
      }
    }
    return result
  } catch {
    return [...DEFAULT_TEMPLATES]
  }
}

function writeTemplates(templates: ConversationTemplate[]) {
  ensureDataDir()
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2), 'utf-8')
}

export function getAllTemplates(): ConversationTemplate[] {
  return readTemplates()
}

export function getTemplate(id: string): ConversationTemplate | null {
  return readTemplates().find(t => t.id === id) || null
}

export function createTemplate(template: Omit<ConversationTemplate, 'id' | 'createdAt'>): ConversationTemplate {
  const newTemplate: ConversationTemplate = {
    ...template,
    id: `tpl_${Date.now()}_${randomUUID().slice(0, 6)}`,
    isBuiltIn: false,
    createdAt: new Date().toISOString(),
  }
  const templates = readTemplates()
  templates.push(newTemplate)
  writeTemplates(templates)
  return newTemplate
}

export function updateTemplate(id: string, partial: Partial<ConversationTemplate>): ConversationTemplate | null {
  const templates = readTemplates()
  const idx = templates.findIndex(t => t.id === id)
  if (idx === -1) return null
  templates[idx] = { ...templates[idx], ...partial, isBuiltIn: templates[idx].isBuiltIn }
  writeTemplates(templates)
  return templates[idx]
}

export function deleteTemplate(id: string): boolean {
  const templates = readTemplates()
  const idx = templates.findIndex(t => t.id === id)
  if (idx === -1) return false
  if (templates[idx].isBuiltIn) return false // 不能删除内置模板
  templates.splice(idx, 1)
  writeTemplates(templates)
  return true
}
