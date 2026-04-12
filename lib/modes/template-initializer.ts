import type { AgentInfo, ProjectMode } from '@/types/skills'
import { getModeDefinition, getBuiltInTemplate } from './mode-definitions'
import { saveAgents, getAgents } from '@/lib/store/agents'

/**
 * 根据项目模式，初始化协调人 + 子 Agent
 * 协调人（isCoordinator=true）使用 modeDef.coordinatorPrompt（已硬编码团队成员列表）
 */
export function initializeProjectAgents(
  projectId: string,
  projectName: string,
  mode: ProjectMode,
): AgentInfo[] {
  const modeDef = getModeDefinition(mode)
  if (!modeDef) return []

  const existing = getAgents(projectId)
  if (existing.length > 0) return existing // 已有 Agent 不覆盖

  const agents: AgentInfo[] = []

  // 解析角色模板 → 创建子 Agent
  for (const templateId of modeDef.roleTemplates) {
    const template = getBuiltInTemplate(templateId)
    if (!template) continue

    agents.push({
      name: template.name,
      description: template.description,
      prompt: template.prompt,
      model: template.model,
      tools: [...template.tools],
      disallowedTools: [...template.disallowedTools],
      enabled: true,
      templateId: template.id,
    })
  }

  // 协调人 Agent 插入最前面（prompt 已硬编码团队成员列表）
  agents.unshift({
    name: modeDef.coordinatorName,
    description: `${modeDef.name}的协调人，负责统筹协调所有子角色`,
    prompt: modeDef.coordinatorPrompt,
    model: 'sonnet',
    tools: [],
    disallowedTools: [],
    enabled: true,
    isCoordinator: true,
    templateId: `${mode}-coordinator`,
  })

  saveAgents(projectId, agents)
  return agents
}
