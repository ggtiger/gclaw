# API 渠道设计：第三方系统接入

## 概述

新增 `api` 渠道类型，允许第三方系统通过 HTTP API 与 GClaw 项目交互。第三方系统发送消息后，Agent 异步执行，结果通过 SSE 长连接推送。

## 需求

- **认证方式**：API Key（Bearer Token），创建渠道时自动生成
- **交互模式**：持久 SSE 会话，支持多次发送消息
- **推送内容**：仅 done 事件（完成通知 + 完整回复文本 + requestId + usage）
- **并发**：同一项目的新查询会终止已有查询（沿用现有 AbortController 机制）

## 数据模型

### 类型定义（`types/channels.ts`）

```typescript
export type ChannelType = 'dingtalk' | 'feishu' | 'wechat' | 'api'

export interface ApiChannelConfig {
  apiKey: string  // 32 位随机 hex，创建时自动生成
}

export interface ChannelConfig {
  // ...existing fields...
  api?: ApiChannelConfig
}

export const CHANNEL_LABELS: Record<ChannelType, string> = {
  dingtalk: '钉钉',
  feishu: '飞书',
  wechat: '微信 ClawBot',
  api: 'API 接入',
}
```

### 持久化

沿用 `data/projects/{id}/channels.json`，无需新增文件。

## API 端点

### 发送消息

```
POST /api/channels/webhook/api/message
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "message": "帮我分析一下这个项目的架构",
  "attachments": []
}
```

- 认证失败 → `401 Unauthorized`
- 成功 → `202 Accepted` + `{ "requestId": "req_xxx" }`
- 请求立即返回，Agent 后台异步执行

### SSE 流

```
GET /api/channels/webhook/api/stream
Authorization: Bearer {apiKey}
Accept: text/event-stream
```

认证通过后建立 SSE 长连接，推送事件：

```
event: done
data: {"content": "完整回复文本", "requestId": "req_xxx", "usage": {...}}

event: error
data: {"message": "错误描述", "requestId": "req_xxx"}

: heartbeat  // 每 30 秒
```

### 持久会话流程

1. 第三方先建立 SSE 连接（`GET stream`），保持连接
2. 多次 `POST message` 发送消息
3. 每次 Agent 完成，结果通过同一 SSE 连接推送
4. `requestId` 关联消息与回复
5. SSE 连接断开后自动清理

## 核心架构

### 不复用 handleChannelMessage

新建 `handleApiMessage()` 函数，原因：

- 现有 `handleChannelMessage` 通过 `channelEventBus` 推送全部事件（delta/tool_use/tool_result）给 Web UI，API 渠道不需要这些
- API 渠道只关心 done 事件 + requestId 关联
- 避免在现有函数中加条件分支

### API 专属事件总线（`lib/channels/api-events.ts`）

```typescript
// globalThis 单例：__gclaw_api_event_bus__
type ApiEventType = 'api_done' | 'api_error'

interface ApiEvent {
  type: ApiEventType
  channelId: string  // 按 channelId 精确推送到对应 SSE 连接
  data: {
    requestId: string
    content?: string
    message?: string
    usage?: { inputTokens, outputTokens, cachedTokens, model, costUsd }
  }
}
```

与 `channelEventBus` 的区别：
- `channelEventBus` 按 `projectId` 分组 → 推送给 Web UI
- `apiEventBus` 按 `channelId` 分组 → 精确推送给第三方 SSE

两者独立，互不干扰。

### handleApiMessage 流程

```
POST message → 生成 requestId → 202 返回
                           ↓
              异步执行（不阻塞）:
              1. 持久化用户消息到 messages.json
              2. executeChat() 迭代 AsyncGenerator
              3. 收集完整回复文本
              4. 持久化助手消息
              5. apiEventBus.emit('api_done')    → 推送到第三方 SSE
              6. channelEventBus.emit('channel_done') → 推送到 Web UI
```

### 认证逻辑

`authenticateApiChannel()` 辅助函数，两个端点共用：

```
Authorization: Bearer <apiKey>
  → findChannelByWebhookKey('api', apiKey)
  → 找到 projectId + channel → 放行
  → 找不到 → 401
```

## 文件变更清单

### 新增

| 文件 | 职责 |
|------|------|
| `lib/channels/api-events.ts` | API 渠道专属事件总线 |
| `lib/channels/api-service.ts` | handleApiMessage + authenticateApiChannel |
| `app/api/channels/webhook/api/message/route.ts` | POST 发送消息端点 |
| `app/api/channels/webhook/api/stream/route.ts` | GET SSE 流端点 |

### 修改

| 文件 | 改动 |
|------|------|
| `types/channels.ts` | 增加 `'api'` ChannelType + ApiChannelConfig + CHANNEL_LABELS |
| `lib/store/channels.ts` | findChannelByWebhookKey 增加 api 分支 |
| `components/channels/ChannelsPanel.tsx` | 渠道类型下拉增加「API 接入」，配置表单展示 apiKey |

### 不改动

- `channel-service.ts` — 现有渠道逻辑不受影响
- `channel-events.ts` — 前端 SSE 不受影响
- 钉钉/飞书/微信适配器 — 完全不受影响

## 前端配置界面

渠道类型下拉增加「API 接入」，创建后配置区域展示：
- **API Key**：只读 + 复制按钮（自动生成，不可修改）
- **API 端点**：展示 message 和 stream 完整 URL
- 无需手动填密钥，开箱即用

## 整体架构图

```
第三方系统
  │
  ├── POST /api/channels/webhook/api/message  (Bearer apiKey)
  │   → 认证 → handleApiMessage() 异步执行
  │   → 202 { requestId }
  │
  └── GET /api/channels/webhook/api/stream     (Bearer apiKey)
      → 认证 → SSE 长连接
      → api_done / api_error 事件推送

内部流转:
  handleApiMessage()
    → executeChat() (AsyncGenerator)
    → 持久化 messages.json
    → apiEventBus.emit('api_done')        → 第三方 SSE
    → channelEventBus.emit('channel_done') → Web UI（同步可见）
```
