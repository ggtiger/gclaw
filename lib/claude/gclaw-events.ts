/**
 * GClaw 生命周期事件总线
 * 将 SDK Hook 事件、技能通知等实时推送到 Web UI 和内部订阅者
 * 全局单例，挂载到 globalThis 防止 HMR 丢失
 */

export type GClawEventType =
  | 'tool:success'        // PostToolUse — 工具执行成功
  | 'tool:failure'        // PostToolUseFailure — 工具执行失败
  | 'session:start'       // SessionStart — 会话开始
  | 'session:end'         // SessionEnd — 会话结束
  | 'skill:notify'        // 技能自定义通知
  | 'hook:error'          // Hook 执行异常（内部诊断）
  | 'memory:write'        // 记忆写入
  | 'memory:consolidate'  // 巩固完成

export interface GClawEvent {
  type: GClawEventType
  source: string            // 触发源（技能名 或 'system'）
  projectId: string
  data: Record<string, unknown>
  timestamp: string
}

type GClawEventListener = (event: GClawEvent) => void

class GClawEventBus {
  /** key = projectId, value = listeners */
  private subscribers = new Map<string, Set<GClawEventListener>>()

  /** 全局订阅者（所有项目的事件） */
  private globalSubscribers = new Set<GClawEventListener>()

  /**
   * 订阅某个项目的事件
   * 返回取消订阅函数
   */
  subscribe(projectId: string, listener: GClawEventListener): () => void {
    let listeners = this.subscribers.get(projectId)
    if (!listeners) {
      listeners = new Set()
      this.subscribers.set(projectId, listeners)
    }
    listeners.add(listener)

    return () => {
      listeners!.delete(listener)
      if (listeners!.size === 0) {
        this.subscribers.delete(projectId)
      }
    }
  }

  /**
   * 订阅所有项目的事件（用于全局日志等）
   */
  subscribeAll(listener: GClawEventListener): () => void {
    this.globalSubscribers.add(listener)
    return () => {
      this.globalSubscribers.delete(listener)
    }
  }

  /**
   * 向某个项目的所有订阅者推送事件
   */
  emit(projectId: string, event: GClawEvent): void {
    // 项目级订阅者
    const listeners = this.subscribers.get(projectId)
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event)
        } catch (err) {
          console.error('[GClawEventBus] listener error:', err)
        }
      }
    }

    // 全局订阅者
    for (const listener of this.globalSubscribers) {
      try {
        listener(event)
      } catch (err) {
        console.error('[GClawEventBus] global listener error:', err)
      }
    }
  }

  /**
   * 便捷方法：创建并发送事件
   */
  notify(
    projectId: string,
    type: GClawEventType,
    source: string,
    data: Record<string, unknown> = {}
  ): void {
    this.emit(projectId, {
      type,
      source,
      projectId,
      data,
      timestamp: new Date().toISOString(),
    })
  }
}

/** 全局单例 */
const GLOBAL_KEY = '__gclaw_event_bus__'
export const gclawEventBus: GClawEventBus =
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] as GClawEventBus ??
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] = new GClawEventBus())
