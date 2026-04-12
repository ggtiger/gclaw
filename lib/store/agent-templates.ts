import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { AgentTemplate } from '@/types/skills'
import { BUILT_IN_TEMPLATES } from '@/lib/modes/mode-definitions'
import { DATA_DIR } from './projects'

const TEMPLATES_FILE = path.join(DATA_DIR, 'agent-templates.json')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function getAgentTemplates(): AgentTemplate[] {
  ensureDataDir()
  let customTemplates: AgentTemplate[] = []
  try {
    if (fs.existsSync(TEMPLATES_FILE)) {
      const raw = fs.readFileSync(TEMPLATES_FILE, 'utf-8')
      const data = JSON.parse(raw)
      customTemplates = Array.isArray(data.templates) ? data.templates : []
    }
  } catch {
    // ignore
  }

  // 内置模板 + 自定义模板，内置在前
  return [...BUILT_IN_TEMPLATES, ...customTemplates]
}

export function getCustomTemplates(): AgentTemplate[] {
  ensureDataDir()
  try {
    if (fs.existsSync(TEMPLATES_FILE)) {
      const raw = fs.readFileSync(TEMPLATES_FILE, 'utf-8')
      const data = JSON.parse(raw)
      return Array.isArray(data.templates) ? data.templates : []
    }
  } catch {
    // ignore
  }
  return []
}

function saveCustomTemplates(templates: AgentTemplate[]) {
  ensureDataDir()
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify({ templates }, null, 2), 'utf-8')
}

export function createAgentTemplate(template: Omit<AgentTemplate, 'id' | 'isBuiltIn' | 'createdAt'>): AgentTemplate {
  const newTemplate: AgentTemplate = {
    ...template,
    id: `custom-${randomUUID().slice(0, 8)}`,
    isBuiltIn: false,
    createdAt: new Date().toISOString(),
  }
  const custom = getCustomTemplates()
  custom.push(newTemplate)
  saveCustomTemplates(custom)
  return newTemplate
}

export function updateAgentTemplate(id: string, updates: Partial<Omit<AgentTemplate, 'id' | 'isBuiltIn' | 'createdAt'>>): AgentTemplate | null {
  const custom = getCustomTemplates()
  const idx = custom.findIndex(t => t.id === id)
  if (idx === -1) return null
  custom[idx] = { ...custom[idx], ...updates }
  saveCustomTemplates(custom)
  return custom[idx]
}

export function deleteAgentTemplate(id: string): boolean {
  const custom = getCustomTemplates()
  const idx = custom.findIndex(t => t.id === id)
  if (idx === -1) return false
  custom.splice(idx, 1)
  saveCustomTemplates(custom)
  return true
}

export function getAgentTemplateById(id: string): AgentTemplate | undefined {
  return getAgentTemplates().find(t => t.id === id)
}
