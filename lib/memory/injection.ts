/**
 * CLAUDE.md 记忆注入辅助
 * 生成用户记忆总纲，供 claude-md.ts 注入到 CLAUDE.md
 */

import { store } from './store'
import { generateAndSaveOverview } from './overview-generator'

/**
 * 获取总纲内容（供 claude-md.ts 注入）
 * 优先读取缓存文件，无缓存时动态生成并写入缓存
 */
export function getOverviewForInjection(userId: string): string {
  const cached = store.readOverview(userId)
  if (cached) return cached
  const content = generateAndSaveOverview(userId)
  if (content) {
    store.writeOverview(userId, content)
  }
  return content
}

/**
 * 刷新总纲（语义/程序记忆变更后调用）
 */
export function refreshOverview(userId: string): void {
  const content = generateAndSaveOverview(userId)
  if (content) {
    store.writeOverview(userId, content)
  }
}
