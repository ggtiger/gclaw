/**
 * API 渠道专属事件总线
 * 按 channelId 精确推送到对应第三方 SSE 连接
 * 全局单例，挂载到 globalThis 防止 HMR 丢失
 */

export type ApiEventType = 'api_done' | 'api_error'

export interface ApiEvent {
  type: ApiEventType
  data: {
    requestId: string
    content?: string
    message?: string
    usage?: {
      inputTokens: number
      outputTokens: number
      cachedTokens: number
      model: string
      costUsd: number
    }
  }
}

type ApiEventListener = (event: ApiEvent) => void

class ApiEventBus {
  /** key = channelId, value = listeners */
  private subscribers = new Map<string, Set<ApiEventListener>>()

  subscribe(channelId: string, listener: ApiEventListener): () => void {
    let listeners = this.subscribers.get(channelId)
    if (!listeners) {
      listeners = new Set()
      this.subscribers.set(channelId, listeners)
    }
    listeners.add(listener)

    return () => {
      listeners!.delete(listener)
      if (listeners!.size === 0) {
        this.subscribers.delete(channelId)
      }
    }
  }

  emit(channelId: string, event: ApiEvent): void {
    const listeners = this.subscribers.get(channelId)
    if (!listeners) return
    for (const listener of listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('[ApiEventBus] listener error:', err)
      }
    }
  }
}

/** 全局单例 */
const GLOBAL_KEY = '__gclaw_api_event_bus__'
export const apiEventBus: ApiEventBus =
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] as ApiEventBus ??
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] = new ApiEventBus())
