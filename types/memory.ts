/**
 * GClaw 记忆系统类型定义
 * 4 层架构：L1 情节 / L2 语义 / L3 程序 / 总纲摘要
 */

// ── L1 情节记忆 ──

export interface EpisodicEntry {
  id: string                    // "EP-20260407-001"
  timestamp: string             // ISO-8601
  projectId: string             // 来源项目
  type: 'decision' | 'action' | 'error' | 'discovery' | 'preference' | 'milestone'
  summary: string               // <=200字
  detail?: string
  tags: string[]
  source: 'hook' | 'agent' | 'user'
  promotedTo?: string           // 提升到的语义/程序记忆 ID
}

export interface EpisodicDay {
  date: string                  // "2026-04-07"
  entries: EpisodicEntry[]
}

// ── L2 语义记忆 ──

export interface SemanticEntry {
  id: string                    // "SEM-20260407-001"
  type: 'user_profile' | 'preference' | 'project_knowledge' | 'environment' | 'entity_relation'
  title: string
  content: string
  scope: 'user' | 'project'
  projectId?: string            // scope=project 时
  confidence: number            // 0-1
  sources: Array<{ episodicId: string; date: string }>
  tags: string[]
  status: 'active' | 'superseded' | 'archived'
  createdAt: string
  updatedAt: string
  lastVerifiedAt?: string
  accessCount: number
}

export interface SemanticMemory {
  entries: SemanticEntry[]
  lastConsolidatedAt: string
}

// ── L3 程序记忆 ──

export interface ProceduralEntry {
  id: string                    // "PROC-20260407-001"
  type: 'runbook' | 'lesson' | 'error_resolution' | 'best_practice'
  title: string
  content: string
  scope: 'user' | 'project'
  projectId?: string
  triggers: string[]            // 触发条件
  steps?: string[]
  tags: string[]
  status: 'active' | 'review_needed' | 'superseded' | 'archived'
  verification: 'unverified' | 'verified' | 'outdated'
  confidence: number
  sources: Array<{ episodicId: string; date: string }>
  createdAt: string
  updatedAt: string
  accessCount: number
}

export interface ProceduralMemory {
  entries: ProceduralEntry[]
  lastConsolidatedAt: string
}

// ── API 请求/响应 ──

export interface RememberRequest {
  /** 记忆层级 */
  level: 'episodic' | 'semantic' | 'procedural'
  /** 用户 ID（必须） */
  userId: string
  /** 项目 ID（可选，用于项目级记忆） */
  projectId?: string

  // episodic 字段
  type?: EpisodicEntry['type']
  summary?: string
  detail?: string
  tags?: string[]
  source?: EpisodicEntry['source']

  // semantic 字段
  semanticType?: SemanticEntry['type']
  title?: string
  content?: string
  scope?: 'user' | 'project'
  confidence?: number

  // procedural 字段
  proceduralType?: ProceduralEntry['type']
  triggers?: string[]
  steps?: string[]
}

export interface RecallRequest {
  userId: string
  projectId?: string
  query?: string
  level?: 'episodic' | 'semantic' | 'procedural' | 'all'
  tags?: string[]
  type?: string
  scope?: 'user' | 'project' | 'all'
  limit?: number
}

export interface RecallResult {
  episodic: EpisodicEntry[]
  semantic: SemanticEntry[]
  procedural: ProceduralEntry[]
}
