# GClaw 系统架构设计

**Date:** 2026-04-02
**Version:** 0.1.0
**Status:** MVP Completed

---

## 1. 系统总览

GClaw 采用**模块化单体架构**（Modular Monolith），基于 Next.js 15 App Router 统一承载前端 UI 和后端 API。整体分为四个垂直层次：

```mermaid
graph TB
    subgraph "客户端层 (Browser)"
        UI["Web UI<br/>React 19 + Tailwind"]
        IM["IM 渠道<br/>钉钉 / 飞书 / 微信"]
    end

    subgraph "API 网关层 (Next.js API Routes)"
        ChatAPI["/api/chat/*<br/>SSE 流式对话"]
        ChannelAPI["/api/channels/*<br/>Webhook + SSE"]
        ProjectAPI["/api/projects<br/>项目管理"]
        SkillAPI["/api/skills/*<br/>技能管理"]
        SettingsAPI["/api/settings<br/>设置管理"]
        AgentAPI["/api/agents<br/>智能体管理"]
    end

    subgraph "核心服务层 (lib/claude)"
        PM["ProcessManager<br/>SDK 调度 + 进程管理"]
        SP["StreamParser<br/>SDKMessage → ParsedEvent"]
        SH["SkillHooks<br/>声明式 Hook 系统"]
        SD["SkillsDir<br/>技能目录管理"]
        CM["ClaudeMd<br/>项目 CLAUDE.md 生成"]
        EB["EventBus<br/>全局事件总线"]
    end

    subgraph "持久化层 (data/)"
        FS["文件系统 JSON<br/>projects.json<br/>messages.json<br/>settings.json"]
        Skills["技能库<br/>skills/*"]
    end

    subgraph "外部服务"
        Claude["Claude API<br/>(Agent SDK)"]
        DT["钉钉开放平台"]
        FS_L["飞书开放平台"]
        WX["微信 ClawBot"]
    end

    UI -->|SSE| ChatAPI
    UI -->|REST| ProjectAPI
    UI -->|REST| SkillAPI
    UI -->|REST| SettingsAPI
    UI -->|REST| AgentAPI
    UI -->|SSE| ChannelAPI

    IM -->|Webhook| ChannelAPI

    ChatAPI --> PM
    ChannelAPI --> CS["ChannelService"] --> PM

    PM -->|query()| Claude
    PM --> SP
    PM --> SH
    PM --> SD
    PM --> CM
    SH --> EB

    PM --> FS
    ChannelAPI --> FS

    ChannelAPI -.->|认证| DT
    ChannelAPI -.->|认证| FS_L
    ChannelAPI -.->|认证| WX
```

---

## 2. 核心数据流

### 2.1 Web UI 对话流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant UC as useChat Hook
    participant API as /api/chat/stream
    participant PM as ProcessManager
    participant SDK as Claude Agent SDK
    participant SP as StreamParser
    participant FS as data/messages.json

    U->>UC: 输入消息
    UC->>API: POST {message, projectId}
    API->>PM: executeChat(message, options)

    PM->>PM: 读取配置 / 同步技能 / 加载 Hook
    PM->>SDK: sdkQuery({prompt, options})

    loop AsyncIterable<SDKMessage>
        SDK-->>PM: SDKMessage
        PM->>SP: convertSDKMessage(msg, ctx)
        SP-->>PM: ParsedEvent[]
        PM-->>API: yield SSEEvent
        API-->>UC: SSE: event: delta / tool_use / ...
        UC->>UC: 更新 React state + StreamBuffer
    end

    SDK-->>PM: ResultMessage (done)
    PM-->>API: yield {event: 'done', data}
    API-->>UC: SSE: event: done

    UC->>UC: 追加 assistant 消息
    API->>FS: 持久化消息
```

### 2.2 渠道消息处理流程

```mermaid
sequenceDiagram
    participant IM as IM 渠道<br/>(钉钉/飞书/微信)
    participant WH as Webhook API
    participant CS as ChannelService
    participant PM as ProcessManager
    participant SDK as Claude Agent SDK
    participant EB as ChannelEventBus
    participant UI as Web UI (SSE)

    IM->>WH: 消息回调
    WH->>CS: handleChannelMessage(projectId, text)

    CS->>PM: executeChat(text, {projectId})
    PM->>SDK: sdkQuery({prompt, options})

    loop 流式响应
        SDK-->>PM: SDKMessage
        PM-->>CS: SSEEvent (delta/tool_use/done)
        CS->>EB: emit('channel_delta' / 'channel_tool_use')
        EB-->>UI: SSE 推送
    end

    CS-->>WH: 返回完整文本
    WH-->>IM: 回复消息
```

### 2.3 权限审批流程

```mermaid
sequenceDiagram
    participant SDK as Claude Agent SDK
    participant PM as ProcessManager
    participant API as /api/chat/stream
    participant UC as useChat Hook
    participant U as 用户
    participant PA as /api/chat/permission

    SDK->>PM: PreToolUse Hook (Bash/Write/Edit)
    PM->>PM: 生成 requestId
    PM->>API: yield {event: 'permission_request'}
    API-->>UC: SSE 推送
    UC->>U: 显示审批对话框

    alt 用户 60s 内审批
        U->>UC: 允许/拒绝
        UC->>PA: POST {requestId, decision}
        PA->>PM: resolvePermission(requestId, decision)
        PM-->>SDK: {permissionDecision: decision}
    else 超时 60s
        PM->>PM: 自动拒绝
        PM-->>SDK: {permissionDecision: 'deny'}
    end
```

---

## 3. 组件架构

### 3.1 前端组件树

```mermaid
graph TD
    subgraph "App Layout"
        Root["app/layout.tsx<br/>lang=zh-CN"]
        Page["app/page.tsx"]
    end

    subgraph "ChatLayout (主布局)"
        CL["ChatLayout.tsx"]
        PS["ProjectSidebar<br/>项目列表 + 切换"]
        CP["ChatPanel<br/>消息列表 + 流式渲染"]
        CI["ChatInput<br/>输入区域"]
        PD["PermissionDialog<br/>权限审批"]
    end

    subgraph "侧面板"
        SP["SkillsPanel<br/>技能管理"]
        SM["SkillMarketPanel<br/>技能市场"]
        AP["AgentsPanel<br/>智能体定义"]
        CH["ChannelsPanel<br/>渠道配置"]
        SS["SettingsPanel<br/>全局/项目设置"]
    end

    Root --> Page --> CL
    CL --> PS
    CL --> CP
    CP --> CI
    CP --> PD
    CL --> SP
    CL --> SM
    CL --> AP
    CL --> CH
    CL --> SS
```

### 3.2 前端状态管理

```mermaid
graph LR
    subgraph "模块级状态 (跨组件共享)"
        SB["StreamBuffer<br/>Map&lt;projectId, Buffer&gt;"]
        AP["activeProjectIds<br/>Set&lt;projectId&gt;"]
    end

    subgraph "useChat Hook (per projectId)"
        MS["messages[]<br/>消息列表"]
        SC["streamingContent<br/>当前流内容"]
        TC["thinkingContent<br/>思考过程"]
        TS["toolSummary<br/>工具调用摘要"]
        SN["sending<br/>发送状态"]
        PR["permissionRequest<br/>权限请求"]
    end

    subgraph "useProject Hook"
        PL["projects[]<br/>项目列表"]
        CUR["currentProjectId<br/>当前项目"]
    end

    SB -.->|切换项目时恢复| MS
    SB -.->|切换项目时恢复| SC
    SB -.->|切换项目时恢复| TS
    AP -.->|通知外部组件| PS2["ProjectSidebar"]
```

**关键设计：StreamBuffer 机制**
- 模块级 `Map<projectId, StreamBuffer>` 存储每个项目的流状态
- 切换项目时从 buffer 恢复 React state，后台流不中断
- `pendingMessages[]` 收集离线期间产生的消息，切回时合并

---

## 4. 后端模块架构

### 4.1 Claude SDK 集成层

```mermaid
graph TB
    subgraph "ProcessManager (核心调度)"
        EQ["executeChat()<br/>AsyncGenerator&lt;SSEEvent&gt;"]
        AC["projectAbortControllers<br/>Map&lt;projectId, AbortController&gt;"]
        PP["pendingPermissions<br/>Map&lt;requestId, resolve&gt;"]
    end

    subgraph "SDK 配置构建"
        BS["buildSdkOptions()<br/>组装 SDK 查询参数"]
        HOOK["Hooks 构建<br/>PreToolUse + 技能 Hook"]
        ENV["环境变量注入<br/>API Key + 技能 .env + GCLAW_*"]
    end

    subgraph "支撑模块"
        SP["StreamParser<br/>SDKMessage → ParsedEvent"]
        SD["SkillsDir<br/>symlink 管理"]
        CM["ClaudeMd<br/>CLAUDE.md + .learnings"]
        SH["SkillHooks<br/>Hook 加载 + 执行"]
        EB["EventBus<br/>全局事件总线"]
    end

    EQ --> BS
    BS --> HOOK
    BS --> ENV

    EQ --> SP
    BS --> SD
    BS --> CM
    HOOK --> SH
    SH --> EB
    EQ --> AC
    EQ --> PP
```

**ProcessManager 核心职责：**
1. 管理 `AbortController` 生命周期（per-project 隔离）
2. 构建 SDK `query()` 参数（model、hooks、env、agents）
3. 迭代 `AsyncIterable<SDKMessage>`，通过 StreamParser 转换
4. 将 `ParsedEvent` 映射为 `SSEEvent` yield 给 API 层
5. Session 失效时自动重试（清除 sessionId 后重新查询）

### 4.2 事件总线

```mermaid
graph LR
    subgraph "事件源"
        SDK_H["SDK Hooks<br/>PostToolUse / SessionStart"]
        SKILL["技能 Hook<br/>notify action"]
        ERR["内部错误<br/>hook:error"]
    end

    subgraph "GClawEventBus (globalThis 单例)"
        PS2["per-project subscribers<br/>Map&lt;projectId, Set&gt;"]
        GS["globalSubscribers<br/>Set&lt;listener&gt;"]
    end

    subgraph "消费端"
        LOG["日志 / 监控"]
        SSE["SSE 推送到前端"]
    end

    SDK_H --> PS2
    SKILL --> PS2
    ERR --> GS
    PS2 --> SSE
    GS --> LOG
```

**事件类型：**

| 类型 | 触发场景 | 数据 |
|------|---------|------|
| `tool:success` | PostToolUse | toolName, toolInput, toolResponse |
| `tool:failure` | PostToolUseFailure | toolName, error |
| `session:start` | SessionStart | sessionId |
| `session:end` | SessionEnd | — |
| `skill:notify` | 技能自定义 | message, hookEvent |
| `hook:error` | Hook 执行异常 | error, hookEvent |

### 4.3 技能 Hook 系统

```mermaid
graph TB
    subgraph "声明层 (gclaw-hooks.json)"
        HC["Hook 配置文件<br/>version + hooks{}"]
        F["Filter 过滤器<br/>tools[] / responsePattern"]
        A["Action 动作"]
    end

    subgraph "执行层"
        LOAD["loadSkillHooks()<br/>扫描启用技能的 hooks 文件"]
        BUILD["buildSkillHookMatchers()<br/>转化为 SDK HookCallback"]
        FILTER["运行时过滤<br/>tool_name / responsePattern"]
    end

    subgraph "Action 处理器"
        N["notify<br/>推送事件到 EventBus"]
        S["script<br/>spawn bash 脚本 (stdin JSON)"]
        L["log<br/>追加到日志文件"]
    end

    HC --> LOAD --> BUILD
    BUILD --> FILTER
    FILTER --> N
    FILTER --> S
    FILTER --> L
    N --> EB["EventBus"]
    S --> SCRIPT["scripts/xxx.sh"]
    L --> LOGF[".learnings/hook-events.log"]
```

**Hook 生命周期：**
1. `loadSkillHooks()` — 扫描启用技能的 `gclaw-hooks.json`
2. `buildSkillHookMatchers()` — 转为 SDK `HookCallback` 格式
3. 注入 `buildSdkOptions().hooks`
4. SDK 触发事件 → Filter 过滤 → 执行 Action
5. `notify` / `script` 可返回 `systemMessage` 注入 Agent 上下文

### 4.4 渠道集成

```mermaid
graph TB
    subgraph "渠道适配器"
        DT["DingTalk<br/>appKey + appSecret<br/>回调签名验证"]
        FL["Feishu<br/>appId + appSecret<br/>事件订阅"]
        WX["WeChat ClawBot<br/>botToken + accountId<br/>消息轮询 + 二维码"]
    end

    subgraph "ChannelService (统一处理)"
        CS["handleChannelMessage()"]
    end

    subgraph "ChannelEventBus"
        CE["per-project SSE"]
    end

    DT -->|消息回调| CS
    FL -->|事件订阅| CS
    WX -->|消息轮询| CS

    CS -->|executeChat| PM["ProcessManager"]
    CS --> CE

    CE -->|SSE| UI["Web UI"]
    CS -->|回复文本| DT
    CS -->|回复文本| FL
    CS -->|回复文本| WX
```

---

## 5. 数据模型

### 5.1 持久化结构

```mermaid
graph TB
    subgraph "全局数据"
        G["global.json<br/>apiKey, apiBaseUrl, theme"]
        P["projects.json<br/>项目列表"]
    end

    subgraph "项目数据 (data/projects/{id}/)"
        S["settings.json<br/>model, systemPrompt, sessionId, cwd"]
        M["messages.json<br/>消息数组 (上限500)"]
        ES["enabled-skills.json<br/>启用技能列表"]
        AG["agents.json<br/>智能体定义"]
        CH["channels.json<br/>渠道配置"]
        CL[".claude/skills/<br/>技能 symlink"]
        LR[".learnings/<br/>经验积累文件"]
    end

    G --> P
    P --> S
    P --> M
    P --> ES
    P --> AG
    P --> CH
```

### 5.2 核心类型

```mermaid
classDiagram
    class ChatMessage {
        +string id
        +string role  // user | assistant | system
        +string content
        +string messageType  // text | tool_summary
        +string createdAt
        +ToolSummary toolSummary
        +ConversationStats stats
    }

    class ToolCallItem {
        +string toolUseId
        +string toolName
        +object input
        +string status  // pending | completed | error
        +string output
        +boolean isError
        +number elapsedSeconds
    }

    class SSEEvent {
        +string event  // start | init | delta | thinking | tool_use | ...
        +object data
    }

    class PermissionRequest {
        +string requestId
        +string toolName
        +object toolInput
        +string description
    }

    ChatMessage --> ToolCallItem : toolSummary
    SSEEvent --> PermissionRequest : permission_request
```

---

## 6. API 路由架构

```mermaid
graph TB
    subgraph "对话 API"
        CS2["POST /api/chat/stream<br/>SSE 流式对话"]
        CM2["GET/DELETE /api/chat/messages<br/>历史消息 CRUD"]
        CA["POST /api/chat/abort<br/>终止查询"]
        CP2["POST /api/chat/permission<br/>权限审批"]
    end

    subgraph "渠道 API"
        CHR["GET/POST /api/channels<br/>渠道配置 CRUD"]
        CWE["GET /api/channels/events<br/>渠道 SSE 事件流"]
        CWH["POST /api/channels/webhook/dingtalk<br/>钉钉回调"]
        CWF["POST /api/channels/webhook/feishu<br/>飞书回调"]
        CWW["POST /api/channels/webhook/wechat<br/>微信回调"]
    end

    subgraph "管理 API"
        PR["GET/POST /PUT/DELETE /api/projects"]
        SR["GET/PUT /api/settings"]
        SKR["GET/POST /api/skills<br/>技能管理"]
        SKM["GET /api/skills/market<br/>技能市场"]
        AR["GET/POST /api/agents<br/>智能体管理"]
    end

    CS2 -->|AsyncGenerator| PM2["executeChat()"]
    CM2 -->|CRUD| MSG["messages.json"]
    CA -->|abort| PM2
    CP2 -->|resolvePermission| PM2

    CWE -->|SSE| CEB["ChannelEventBus"]
    CWH --> CSVC["ChannelService"]
    CWF --> CSVC
    CWW --> CSVC
    CSVC --> PM2
```

---

## 7. 多项目并发模型

```mermaid
graph TB
    subgraph "前端 StreamBuffer (模块级 Map)"
        B1["Buffer: Project-A<br/>content / toolSummary / pendingMsgs"]
        B2["Buffer: Project-B<br/>content / toolSummary / pendingMsgs"]
        B3["Buffer: Project-C<br/>content / toolSummary / pendingMsgs"]
    end

    subgraph "后端 AbortController (模块级 Map)"
        A1["AbortController: Project-A"]
        A2["AbortController: Project-B"]
        A3["AbortController: Project-C"]
    end

    subgraph "SDK Query 实例"
        Q1["sdkQuery() — Project-A"]
        Q2["sdkQuery() — Project-B"]
    end

    B1 --> A1 --> Q1
    B2 --> A2 --> Q2
    B3 --> A3

    style Q1 fill:#4CAF50,color:#fff
    style Q2 fill:#4CAF50,color:#fff
    style A3 fill:#FF9800,color:#fff
```

**并发规则：**
- 每个项目独立的 `AbortController`，同一项目新查询会 abort 旧查询
- 前端 `StreamBuffer` 缓存每个项目的流状态，切换项目时恢复
- 后台项目的流继续运行，`pendingMessages` 收集离线消息
- `activeProjectIds` Set 追踪所有活跃项目，供 Sidebar 显示状态

---

## 8. 技术栈总览

| 层次 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **前端框架** | Next.js (App Router) | 15 | SSR/SSG + API Routes |
| **UI 库** | React + Tailwind CSS | 19 + 3.4 | 组件化 + CSS 变量主题 |
| **AI SDK** | claude-agent-sdk | 0.1.76 | 原生 Agent 调用 |
| **实时通信** | SSE (Server-Sent Events) | — | 双路 SSE（对话 + 渠道） |
| **持久化** | 文件系统 JSON | — | data/ 目录，零配置 |
| **语言** | TypeScript (strict) | 5.x | 全栈类型安全 |
| **图标** | lucide-react | — | 轻量图标库 |
| **Markdown** | react-markdown + remark-gfm | — | 消息渲染 |

---

## 9. 关键设计决策

| 决策 | 选择 | 原因 | 权衡 |
|------|------|------|------|
| 架构模式 | 模块化单体 | Level 2 项目复杂度，单团队开发 | 未来可拆分为微服务 |
| 实时通信 | SSE 而非 WebSocket | 单向推送为主，实现简单，HTTP 兼容好 | 不支持双向通信 |
| 持久化 | 文件系统 JSON | 零配置部署，快速上线 | 不适合高并发/大数据量 |
| SDK 调用 | AsyncGenerator | 天然支持流式迭代，内存友好 | 错误处理稍复杂 |
| 事件总线 | globalThis 单例 | 防止 HMR 热替换丢失状态 | 不支持多进程 |
| 权限机制 | bypassPermissions + PreToolUse Hook | 自定义审批 UI，绕过 SDK 内置权限 | 需自行维护安全逻辑 |
| 技能管理 | symlink 到项目 .claude/skills/ | SDK 自动扫描 .claude/skills/ 目录 | 需定期清理失效链接 |

---

**Document Status:** Complete
**Last Updated:** 2026-04-02
