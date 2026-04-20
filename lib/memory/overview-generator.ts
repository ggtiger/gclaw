/**
 * 总纲自动生成器
 * 从语义/程序记忆数据生成 Markdown 总纲，写入 overview.md
 *
 * 双层架构：
 * - LLM 提练（优先）：用 Haiku 模型将原始记忆条目压缩为精简的用户画像卡片
 * - 模板拼接（降级）：API Key 缺失或 LLM 失败时，用原始条目直接拼接
 */

import { store } from './store'
import type { SemanticEntry, ProceduralEntry } from '@/types/memory'
import { callLLM, getAssistantModel } from '@/lib/llm'
import { logger } from '@/lib/logger'
import { getPromptTemplate } from '@/lib/store/prompt-templates'

/** LLM 超时时间（毫秒） */
const OVERVIEW_TIMEOUT = 10000

const DEFAULT_OVERVIEW_PROMPT = `你是一个用户画像总结助手。根据下方提供的用户记忆条目，生成一份精简的用户画像总纲。

## 格式规则（必须严格遵守）

1. 每条用一行，格式为：**标签**: 精简值
2. 标签为 2-6 个字的简短名词，如"职业"、"开发语言"、"兴趣爱好"
3. 精简值尽可能短，只保留核心信息，去掉"用户"、"偏好使用"、"表达了对"等冗余词
4. 同类信息合并为一行（如多个兴趣用顿号分隔）
5. 去重：相同含义的条目只保留一条
6. 临时性/一次性信息可以省略（如具体某天的天气）
7. 不要添加标题、分类头、列表符号或任何额外装饰
8. 只返回总纲内容，不要其他文字
9. 带 [新] 标记的条目必须体现在总纲中（合并到已有标签或新增标签）
10. 兴趣爱好、偏好类条目不要省略，这是用户画像的重要组成部分

## 示例输出

**职业**: 兼职老师
**开发语言**: Java（不用 .NET）
**开发环境**: TypeScript strict + Tailwind CSS
**搜索偏好**: 使用百度技能，不用 websearch
**回复风格**: 简洁无 emoji
**兴趣爱好**: 科幻类 AI 短剧、AI助理AI
**日程**: 周二周四去亳州技术学院上课`

export interface OverviewOptions {
  /** 最大语义记忆条目数 */
  maxSemantic?: number
  /** 最大程序记忆条目数 */
  maxProcedural?: number
  /** 单条内容最大字符数 */
  maxContentLen?: number
}

const DEFAULT_OPTIONS: OverviewOptions = {
  maxSemantic: 20,
  maxProcedural: 15,
  maxContentLen: 120,
}

/**
 * 从记忆数据生成总纲 Markdown
 */
export function generateOverview(
  userId: string,
  options: OverviewOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const userDir = store.userMemoryDir(userId)
  const semantic = store.readSemantic(userDir)
  const procedural = store.readProcedural(userDir)

  const activeSemantic = semantic.entries.filter(e => e.status === 'active')
  const activeProcedural = procedural.entries.filter(e => e.status === 'active' && e.verification !== 'outdated')

  if (activeSemantic.length === 0 && activeProcedural.length === 0) {
    return ''
  }

  const lines: string[] = ['## 用户记忆总纲', '']

  // 按类型分组输出语义记忆（全局限制条目数）
  const semanticByType = groupBy(activeSemantic, e => e.type)
  const typeLabels: Record<string, string> = {
    user_profile: '用户画像',
    preference: '偏好与习惯',
    project_knowledge: '项目知识',
    environment: '环境信息',
    entity_relation: '实体关系',
  }

  let semanticUsed = 0
  for (const [type, entries] of semanticByType) {
    if (semanticUsed >= opts.maxSemantic!) break
    const label = typeLabels[type] || type
    lines.push(`### ${label}`)
    for (const entry of entries) {
      if (semanticUsed >= opts.maxSemantic!) break
      lines.push(`- **${entry.title}**: ${truncate(entry.content, opts.maxContentLen!)}`)
      semanticUsed++
    }
    lines.push('')
  }

  // 按类型分组输出程序记忆
  if (activeProcedural.length > 0) {
    const procByType = groupBy(activeProcedural, e => e.type)
    const procTypeLabels: Record<string, string> = {
      runbook: '操作手册',
      lesson: '经验教训',
      error_resolution: '错误解决',
      best_practice: '最佳实践',
    }

    let proceduralUsed = 0
    for (const [type, entries] of procByType) {
      if (proceduralUsed >= opts.maxProcedural!) break
      const label = procTypeLabels[type] || type
      lines.push(`### ${label}`)
      for (const entry of entries) {
        if (proceduralUsed >= opts.maxProcedural!) break
        const suffix = entry.verification === 'verified' ? ' (已验证)' : ''
        lines.push(`- **${entry.title}**${suffix}: ${truncate(entry.content, opts.maxContentLen!)}`)
        proceduralUsed++
      }
      lines.push('')
    }
  }

  lines.push('> 详细记忆可通过 API 检索：POST $GCLAW_API_BASE/api/memory/recall')

  return lines.join('\n')
}

/**
 * 生成并写入总纲（同步版 — 模板拼接，作为降级）
 */
export function generateAndSaveOverview(userId: string): string {
  const content = generateOverview(userId)
  if (content) {
    store.writeOverview(userId, content)
  }
  return content
}

/**
 * 生成并写入总纲（异步版 — 优先 LLM 提练，失败降级到模板）
 */
export async function generateAndSaveOverviewAsync(userId: string): Promise<string> {
  // 尝试 LLM 提练
  const llmContent = await generateOverviewWithLLM(userId)
  if (llmContent) {
    store.writeOverview(userId, llmContent)
    return llmContent
  }

  // 降级到模板拼接
  logger.info('[GClaw] LLM overview generation failed, falling back to template')
  return generateAndSaveOverview(userId)
}

// ── LLM 提练 ──

/**
 * 用 LLM 从记忆条目生成精简总纲
 */
async function generateOverviewWithLLM(userId: string): Promise<string | null> {
  const userDir = store.userMemoryDir(userId)
  const semantic = store.readSemantic(userDir)
  const procedural = store.readProcedural(userDir)

  const activeSemantic = semantic.entries.filter(e => e.status === 'active')
  const activeProcedural = procedural.entries.filter(e => e.status === 'active' && e.verification !== 'outdated')

  if (activeSemantic.length === 0 && activeProcedural.length === 0) return null

  // 标记最近 3 天的条目
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000

  // 按时间倒序排列，最近的条目在前
  const sortedSemantic = [...activeSemantic].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  )
  const sortedProcedural = [...activeProcedural].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  )

  // 构建输入：最近的条目标记 [新]
  const inputLines: string[] = []
  for (const e of sortedSemantic) {
    const isNew = new Date(e.updatedAt).getTime() > threeDaysAgo
    const prefix = isNew ? '[新] ' : ''
    inputLines.push(`${prefix}[语义/${e.type}] ${e.title}: ${e.content}`)
  }
  for (const e of sortedProcedural) {
    const isNew = new Date(e.updatedAt).getTime() > threeDaysAgo
    const prefix = isNew ? '[新] ' : ''
    inputLines.push(`${prefix}[程序/${e.type}] ${e.title}: ${e.content}`)
  }

  const userPrompt = inputLines.join('\n')

  try {
    const text = await callLLM({
      system: getPromptTemplate('overviewGeneration') || DEFAULT_OVERVIEW_PROMPT,
      user: userPrompt,
      maxTokens: 1024,
      timeoutMs: OVERVIEW_TIMEOUT,
    })

    if (!text) return null

    // 组装最终总纲
    const overview = `## 用户记忆总纲\n\n${text}\n\n> 详细记忆可通过 API 检索：POST $GCLAW_API_BASE/api/memory/recall`
    logger.info(`[GClaw] LLM overview generated (${overview.length} chars)`)
    return overview
  } catch (err) {
    logger.warn('[GClaw] LLM overview generation failed:', (err as Error).message)
    return null
  }
}

// ── 工具 ──

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of arr) {
    const key = keyFn(item)
    const group = map.get(key) || []
    group.push(item)
    map.set(key, group)
  }
  return map
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}
