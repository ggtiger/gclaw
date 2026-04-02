---
name: gclaw-api
description: "GClaw 平台 API 操作技能。提供对项目、会话、设置、技能、智能体、渠道等所有 GClaw REST API 的结构化调用能力。严格要求：每次 API 调用前必须向用户确认操作内容和参数。"
metadata:
---

# GClaw API 操作技能

通过 HTTP API 管理 GClaw 平台的所有资源：项目、会话、设置、技能、智能体和渠道。

## 严格规则

> **每次执行 API 调用前，必须先向用户展示即将执行的操作（方法、URL、参数），获得用户明确确认后才能执行。**
>
> 禁止静默调用、批量免确认、自动重试。每一次 HTTP 请求都需要独立确认。

### 确认格式

每次调用前，按以下格式向用户确认：

```
即将执行 API 调用：
  方法: POST
  地址: $GCLAW_API_BASE/api/projects
  参数: {"name": "新项目"}
  
是否确认执行？
```

用户明确同意后（如"好的"、"确认"、"执行"），再使用 Bash 工具执行 `curl` 命令。

### 调用方式

所有 API 通过 `curl` 调用。平台地址和当前项目 ID 通过环境变量自动注入：

- `$GCLAW_API_BASE` — 平台基础地址（如 `http://localhost:3000`）
- `$GCLAW_PROJECT_ID` — 当前项目 ID

```bash
# GET 请求
curl -s "$GCLAW_API_BASE/api/projects" | jq .

# POST/PUT 请求
curl -s -X POST "$GCLAW_API_BASE/api/chat/stream" \
  -H "Content-Type: application/json" \
  -d '{"message": "hello", "projectId": "'$GCLAW_PROJECT_ID'"}' 

# DELETE 请求
curl -s -X DELETE "$GCLAW_API_BASE/api/projects?id=xxx" | jq .
```

---

## API 参考

### 1. 项目管理

#### 获取所有项目

```
GET /api/projects
```

**返回**: `{ projects: [{ id, name, createdAt, updatedAt }] }`

#### 创建项目

```
POST /api/projects
Content-Type: application/json

{ "name": "项目名称" }
```

**返回**: `{ project: { id, name, createdAt, updatedAt } }`

#### 重命名项目

```
PUT /api/projects
Content-Type: application/json

{ "id": "项目ID", "name": "新名称" }
```

#### 删除项目

```
DELETE /api/projects?id={项目ID}
```

---

### 2. 聊天

#### 发送消息（SSE 流）

```
POST /api/chat/stream
Content-Type: application/json

{ "message": "用户消息", "projectId": "项目ID" }
```

**返回**: SSE 流，事件类型：
- `delta` — 增量文本 `{ content: "..." }`
- `done` — 完成 `{ usage, costUsd, model }`
- `permission_request` — 权限请求 `{ requestId, toolName, description }`
- `skill_notify` — 技能通知
- `error` — 错误
- `end` — 流结束

> **注意**: 这是 SSE 流式端点，用 `curl -N` 获取流式输出。

#### 获取消息历史

```
GET /api/chat/messages?projectId={ID}&limit={50}&before={消息ID}
```

**参数**:
- `projectId`（必需）
- `limit`（可选，默认 50）
- `before`（可选，分页游标）

#### 清空消息

```
DELETE /api/chat/messages?projectId={ID}
```

同时清空项目的 sessionId。

#### 中止执行

```
POST /api/chat/abort?projectId={ID}
```

**返回**: `{ success: boolean, message: string }`

#### 权限审批

```
POST /api/chat/permission
Content-Type: application/json

{ "requestId": "请求ID", "decision": "allow" | "deny" }
```

---

### 3. 设置

#### 获取设置

```
GET /api/settings?projectId={ID}
```

**返回**: 完整设置对象（AppSettings = GlobalSettings & ProjectSettings）

```typescript
interface AppSettings {
  // 全局
  apiKey: string
  apiBaseUrl: string
  theme: 'light' | 'dark' | 'system'
  // 项目级
  model: string
  effort: 'low' | 'medium' | 'high'
  sessionId: string
  cwd: string
  dangerouslySkipPermissions: boolean
  systemPrompt: string
}
```

#### 更新设置

```
PUT /api/settings?projectId={ID}
Content-Type: application/json

{ "model": "claude-sonnet-4-20250514", "effort": "high" }
```

支持部分更新（Partial）。

---

### 4. 技能管理

#### 获取技能列表

```
GET /api/skills?projectId={ID}
```

**返回**: `{ skills: [{ name, displayName, description, path, enabled }], enabled: string[] }`

#### 更新启用技能

```
PUT /api/skills?projectId={ID}
Content-Type: application/json

{ "enabled": ["self-improving-agent", "gclaw-api"] }
```

#### 搜索技能市场

```
GET /api/skills/market?q={关键词}&page={1}&limit={20}
```

#### 安装技能

```
POST /api/skills/market/install
Content-Type: application/json

{ "skillName": "技能名称" }
```

---

### 5. 智能体管理

#### 获取智能体列表

```
GET /api/agents?projectId={ID}
```

**返回**: `{ agents: [AgentInfo] }`

```typescript
interface AgentInfo {
  name: string
  description: string
  prompt: string
  model: 'sonnet' | 'opus' | 'haiku' | 'inherit'
  tools: string[]
  disallowedTools: string[]
  enabled: boolean
}
```

#### 创建智能体

```
POST /api/agents?projectId={ID}
Content-Type: application/json

{
  "name": "agent-name",
  "prompt": "你是一个专门处理XX的助手",
  "description": "可选描述",
  "model": "inherit",
  "tools": [],
  "disallowedTools": []
}
```

**必需字段**: `name`, `prompt`。名称重复返回 409。

#### 更新智能体

```
PUT /api/agents?projectId={ID}
Content-Type: application/json

{ "name": "agent-name", "description": "更新描述", "prompt": "新指令" }
```

**必需字段**: `name`（用于定位）。

#### 删除智能体

```
DELETE /api/agents?projectId={ID}&name={agent-name}
```

---

### 6. 渠道管理

#### 获取渠道列表

```
GET /api/channels?projectId={ID}
```

**返回**: `{ success: true, channels: [Channel] }`

#### 添加渠道

```
POST /api/channels?projectId={ID}
Content-Type: application/json

{
  "type": "dingtalk" | "feishu" | "wechat",
  "name": "渠道名称",
  "enabled": true,
  "dingtalk": { "appKey": "...", "appSecret": "..." },
  "feishu": { "appId": "...", "appSecret": "..." },
  "wechat": { "botToken": "..." }
}
```

**必需字段**: `type`, `name`。渠道特定配置按类型提供。

#### 更新渠道

```
PUT /api/channels?projectId={ID}&channelId={渠道ID}
Content-Type: application/json

{ "name": "新名称", "enabled": false }
```

#### 删除渠道

```
DELETE /api/channels?projectId={ID}&channelId={渠道ID}
```

#### 订阅渠道事件（SSE）

```
GET /api/channels/events?projectId={ID}
```

SSE 流端点，事件类型：`connected`, `channel_message`, `agent_reply`。每 30 秒心跳保活。

---

### 7. 渠道 Webhook

> 以下端点由外部平台回调，通常不需要手动调用。

#### 钉钉 Webhook

```
POST /api/channels/webhook/dingtalk?key={appKey}
Headers: timestamp, sign (HMAC-SHA256)
```

#### 飞书 Webhook

```
POST /api/channels/webhook/feishu?key={appId}
```

支持 URL 验证 challenge。

#### 微信 ClawBot Webhook

```
POST /api/channels/webhook/wechat?key={botToken}
Headers: Authorization: Bearer {botToken}
```

---

### 8. 微信连接管理

#### 查询连接状态

```
GET /api/channels/webhook/wechat/connect?projectId={ID}&channelId={ID}
```

不带参数返回所有连接状态。

#### 启动/重连

```
POST /api/channels/webhook/wechat/connect
Content-Type: application/json

{ "projectId": "...", "channelId": "..." }
```

#### 断开连接

```
DELETE /api/channels/webhook/wechat/connect?projectId={ID}&channelId={ID}
```

#### 扫码登录

```
POST /api/channels/webhook/wechat/login
Content-Type: application/json

// 获取 QR 码
{ "action": "start" }

// 轮询登录状态
{ "action": "poll", "qrcode": "qr-data" }

// 保存 Token
{ "action": "save", "botToken": "...", "projectId": "...", "channelId": "..." }
```

---

## 错误处理

所有 API 使用统一的 HTTP 状态码：

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 400 | 参数缺失或无效 |
| 403 | 认证失败 |
| 404 | 资源不存在 |
| 409 | 资源冲突（如名称重复）|
| 500 | 服务器内部错误 |

错误响应格式：`{ error: "错误描述" }` 或 `{ success: false, error: "..." }`

## 常见操作示例

### 创建项目并配置

```bash
# 1. 创建项目
curl -s -X POST "$GCLAW_API_BASE/api/projects" \
  -H "Content-Type: application/json" \
  -d '{"name": "我的项目"}' | jq .

# 2. 配置设置（使用返回的 project.id）
curl -s -X PUT "$GCLAW_API_BASE/api/settings?projectId=PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-sonnet-4-20250514", "effort": "high"}' | jq .

# 3. 启用技能
curl -s -X PUT "$GCLAW_API_BASE/api/skills?projectId=PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"enabled": ["self-improving-agent"]}' | jq .
```

### 发送消息并获取回复

```bash
curl -N -X POST "$GCLAW_API_BASE/api/chat/stream" \
  -H "Content-Type: application/json" \
  -d '{"message": "你好", "projectId": "'$GCLAW_PROJECT_ID'"}'
```

### 管理智能体

```bash
# 创建
curl -s -X POST "$GCLAW_API_BASE/api/agents?projectId=$GCLAW_PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{"name": "code-reviewer", "prompt": "你是代码审查专家"}' | jq .

# 列表
curl -s "$GCLAW_API_BASE/api/agents?projectId=$GCLAW_PROJECT_ID" | jq .

# 删除
curl -s -X DELETE "$GCLAW_API_BASE/api/agents?projectId=$GCLAW_PROJECT_ID&name=code-reviewer" | jq .
```
