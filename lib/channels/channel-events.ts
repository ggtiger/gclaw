/**
 * 渠道消息 SSE 事件总线
 * 将渠道收到的消息和 Agent 响应实时推送到 Web UI
 * 全局单例，挂载到 globalThis 防止 HMR 丢失
 */

export type ChannelEventType =
  | 'channel_user_message'   // 渠道收到用户消息
  | 'channel_start'          // Agent 开始处理
  | 'channel_delta'          // Agent 流式输出片段
  | 'channel_tool_use'       // Agent 工具调用
  | 'channel_tool_result'    // 工具执行结果
  | 'channel_done'           // Agent 回复完成
  | 'channel_error'          // 错误

export interface ChannelEvent {
  type: ChannelEventType
  data: Record<string, unknown>
}

type ChannelEventListener = (event: ChannelEvent) => void

class ChannelEventBus {
  /** key = projectId, value = listeners */
  private subscribers = new Map<string, Set<ChannelEventListener>>()

  /**
   * 订阅某个项目的渠道事件
   * 返回取消订阅函数
   */
  subscribe(projectId: string, listener: ChannelEventListener): () => void {
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
   * 向某个项目的所有订阅者推送事件
   */
  emit(projectId: string, event: ChannelEvent): void {
    const listeners = this.subscribers.get(projectId)
    if (!listeners) return
    for (const listener of listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('[ChannelEventBus] listener error:', err)
      }
    }
  }
}

/** 全局单例 */
const GLOBAL_KEY = '__gclaw_channel_event_bus__'
export const channelEventBus: ChannelEventBus =
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] as ChannelEventBus ??
  ((globalThis as Record<string, unknown>)[GLOBAL_KEY] = new ChannelEventBus())
