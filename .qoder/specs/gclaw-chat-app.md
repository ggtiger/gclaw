# GClaw - AI Chat Application 实现方案

## Context

GClaw 是一个基于 Claude Code SDK 的 AI 对话应用。用户希望构建一个类似 genvis SecretaryPanel 的聊天界面，通过 spawn Claude CLI 进程实现流式对话，并支持可视化的 Skills 管理。项目从零开始，当前目录为空。

参考项目：
- **genvis SecretaryPanel** (`/Users/wanghu/work/study/niubi/genvis/components/secretary/SecretaryPanel.tsx`) — UI 交互模式参考
- **paperclip claude-local** (`/Users/wanghu/work/study/paperclip/packages/adapters/claude-local/`) — Claude CLI 集成模式参考

## 架构总览

```
浏览器 (React)
  ├── ChatPanel (消息列表 + 输入框 + 流式渲染)
  ├── SkillsPanel (技能可视化管理)
  └── SettingsPanel (模型/effort/cwd 设置)
       │
       │  fetch + ReadableStream (SSE)
       ▼
Next.js API Routes
  ├── /api/chat/stream   POST → spawn claude CLI → SSE 流
  ├── /api/chat/messages  GET/DELETE
  ├── /api/chat/abort     POST → SIGTERM 进程
  ├── /api/skills         GET/PUT
  └── /api/settings       GET/PUT
       │
       ▼
Claude CLI Process Manager
  ├── spawn: claude --print - --output-format stream-json --verbose
  ├── parse: 逐行 JSON → 结构化事件
  ├── skills: 临时目录 symlink + --add-dir
  └── session: --resume <id> / 失败重试
       │
       ▼
File-based Persistence (data/*.json)
```

## 项目结构

```
GClaw/
├── app/
│   ├── layout.tsx                  # 根布局 (ThemeProvider)
│   ├── page.tsx                    # 主页面 → ChatLayout
│   ├── globals.css                 # Tailwind + dark mode CSS 变量
│   └── api/
│       ├── chat/
│       │   ├── stream/route.ts     # POST: 发消息 → SSE 流
│       │   ├── messages/route.ts   # GET: 历史 / DELETE: 清空
│       │   └── abort/route.ts      # POST: 终止进程
│       ├── skills/route.ts         # GET: 列出 / PUT: 更新启用
│       └── settings/route.ts       # GET/PUT: 应用设置
├── components/
│   ├── chat/
│   │   ├── ChatLayout.tsx          # 主布局 (侧栏 + 聊天区)
│   │   ├── ChatPanel.tsx           # 核心聊天组件
│   │   ├── MessageBubble.tsx       # 单条消息渲染
│   │   ├── ToolCallSummary.tsx     # 工具调用摘要 (可展开)
│   │   ├── MarkdownRenderer.tsx    # Markdown 渲染 (代码高亮+复制)
│   │   └── ChatInput.tsx           # 输入区域 (上传+发送+停止)
│   ├── skills/
│   │   └── SkillsPanel.tsx         # 技能管理面板
│   └── settings/
│       └── SettingsPanel.tsx       # 设置面板
├── lib/
│   ├── claude/
│   │   ├── process-manager.ts      # Claude CLI 进程管理 (核心)
│   │   ├── stream-parser.ts        # stdout JSON 流逐行解析
│   │   └── skills-dir.ts           # 技能目录 (扫描/symlink/清理)
│   └── store/
│       ├── messages.ts             # 消息持久化
│       ├── settings.ts             # 设置持久化
│       └── skills.ts               # 技能启用状态
├── types/
│   ├── chat.ts                     # ChatMessage, ToolCallItem 等
│   ├── claude.ts                   # Claude CLI 事件类型
│   └── skills.ts                   # SkillInfo 等
├── hooks/
│   ├── useChat.ts                  # 聊天状态管理
│   └── useTheme.ts                 # 主题切换
├── data/                           # 运行时数据 (.gitignore)
├── skills/                         # 用户技能目录 (.md 文件)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── .gitignore
```

## 实施步骤

### 步骤 1: 项目初始化

**创建 Next.js 项目 + 安装依赖：**

```bash
cd /Users/wanghu/work/study/GClaw
npx create-next-app@latest . --typescript --tailwind --app --src-dir=false --import-alias="@/*"
npm install react-markdown remark-gfm lucide-react
```

**创建目录结构:**
- `lib/claude/`, `lib/store/`, `types/`, `hooks/`, `data/`, `skills/`, `components/chat/`, `components/skills/`, `components/settings/`

**配置 dark mode:**
- `tailwind.config.ts`: `darkMode: 'class'`
- `globals.css`: CSS 变量定义 light/dark 两套色系
- 色彩方案参考 SaaS 类型: Primary `#2563EB`, Secondary `#3B82F6`, CTA `#F97316`, Background `#F8FAFC`, Text `#1E293B`

**配置 `.gitignore`:** 加入 `data/`

---

### 步骤 2: 类型定义

**`types/chat.ts`:**
- `ChatMessage`: `{ id, role: 'user'|'assistant'|'system', content, messageType: 'text'|'tool_summary', createdAt, isStreaming?, toolSummary?, stats? }`
- `ToolCallItem`: `{ toolUseId, toolName, input, status: 'pending'|'completed'|'error', output?, isError? }`
- `ToolSummary`: `{ pendingTools: ToolCallItem[], completedTools: ToolCallItem[] }`
- `ConversationStats`: `{ costUsd, inputTokens, outputTokens, cachedTokens, model }`
- `SSEEvent`: `{ event: 'start'|'init'|'delta'|'tool_use'|'tool_result'|'done'|'error'|'end', data: Record<string,unknown> }`

**`types/claude.ts`:**
- Claude CLI stdout 的 JSON 行事件类型:
  - `ClaudeSystemEvent`: `{ type:'system', subtype:'init', session_id, model }`
  - `ClaudeAssistantEvent`: `{ type:'assistant', message:{ content: ClaudeContentBlock[] } }`
  - `ClaudeUserEvent`: `{ type:'user', message:{ content: ClaudeContentBlock[] } }`
  - `ClaudeResultEvent`: `{ type:'result', session_id, result, usage, total_cost_usd, model }`
  - `ClaudeContentBlock`: text块 | tool_use块 | tool_result块 | thinking块

**`types/skills.ts`:**
- `SkillInfo`: `{ name, displayName, description, path, enabled }`
- `AppSettings`: `{ model, effort, theme, sessionId, cwd, dangerouslySkipPermissions }`

---

### 步骤 3: 后端核心 — Claude 进程管理

**`lib/claude/stream-parser.ts`:**

核心函数 `parseStreamLine(line: string): ParsedEvent | null`:
- JSON.parse 每行，失败返回 null
- 按 `type` 字段路由:
  - `system` + `init` → `{ kind:'init', sessionId, model }`
  - `assistant` → 遍历 content 数组，text → `{ kind:'delta', content }`, tool_use → `{ kind:'tool_use', toolUseId, toolName, input }`
  - `user` → 找 tool_result → `{ kind:'tool_result', toolUseId, content, isError }`
  - `result` → `{ kind:'done', sessionId, usage, costUsd, summary }`

参考: `paperclip/packages/adapters/claude-local/src/server/parse.ts` 和 `src/ui/parse-stdout.ts`

**`lib/claude/process-manager.ts`:**

模块级状态:
- `currentProcess: ChildProcess | null`
- `currentSessionId: string | null`

核心函数 `executeChat(message, options)` → `AsyncGenerator<SSEEvent>`:
1. 检查并终止已有进程
2. 构建 CLI 参数: `claude --print - --output-format stream-json --verbose [--resume id] [--model x] [--effort x] [--add-dir skillsDir] [--dangerously-skip-permissions]`
3. `child_process.spawn(command, args, { cwd, env })`
4. stdin 写入 message，然后关闭
5. readline 读 stdout 每行 → `parseStreamLine` → yield SSEEvent
6. 进程退出后 yield done/error 事件
7. 保存 sessionId

辅助函数:
- `abortCurrentProcess()`: SIGTERM → 5s grace → SIGKILL
- `getCurrentStatus()`: 返回当前进程状态

参考: `paperclip/packages/adapters/claude-local/src/server/execute.ts` 的 `runAttempt` 和 `buildClaudeArgs`

**`lib/claude/skills-dir.ts`:**

- `scanAvailableSkills()`: 读 `skills/` 目录，解析 `.md` 文件提取标题和描述
- `buildEphemeralSkillsDir(enabledNames)`: mkdtemp → 创建 `.claude/skills/` → symlink 启用的技能文件 → 返回 tmpdir 路径
- `cleanupSkillsDir(dir)`: `fs.rm(dir, { recursive: true })`

参考: `paperclip/packages/adapters/claude-local/src/server/skills.ts` 和 `execute.ts` 中 `buildSkillsDir`

---

### 步骤 4: 数据持久化

**`lib/store/messages.ts`:**
- `getMessages(limit?)`: 读 `data/messages.json`，返回最近 N 条
- `addMessage(msg)`: 追加到文件，超 500 条时截断
- `clearMessages()`: 清空文件

**`lib/store/settings.ts`:**
- `getSettings()`: 读 `data/settings.json`，返回带默认值的合并对象
- `updateSettings(partial)`: 合并并写入

**`lib/store/skills.ts`:**
- `getEnabledSkills()`: 读 `data/enabled-skills.json`
- `setEnabledSkills(names)`: 写入

所有文件操作使用 `fs.readFileSync/writeFileSync`，文件不存在时返回默认值并自动创建 `data/` 目录。

---

### 步骤 5: API 路由

**`app/api/chat/stream/route.ts` (POST):**

最核心的路由。接收 `{ message }` → 返回 SSE 流。

1. 读取 settings (model, effort, sessionId, cwd)
2. 读取 enabled skills → `buildEphemeralSkillsDir()`
3. 持久化用户消息
4. 创建 `TransformStream`，在 writer 中:
   - yield `event: start`
   - 调用 `executeChat()` 的 AsyncGenerator
   - 每个事件写入 `event: <type>\ndata: <json>\n\n`
   - init 事件时保存 sessionId
   - 累积 assistant text 内容
   - done 时持久化完整 AI 回复
5. 返回 `new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } })`
6. finally 中清理技能临时目录

**`app/api/chat/messages/route.ts`:**
- GET: `{ messages, hasMore }`
- DELETE: 清空消息 + 清空 sessionId

**`app/api/chat/abort/route.ts` (POST):**
- 调用 `abortCurrentProcess()` → `{ success, message }`

**`app/api/skills/route.ts`:**
- GET: 扫描 skills/ + 读 enabled → `{ available, enabled }`
- PUT: `{ enabled: string[] }` → 保存

**`app/api/settings/route.ts`:**
- GET: 读设置
- PUT: 更新设置

---

### 步骤 6: 前端 — Hooks

**`hooks/useChat.ts`:**

管理聊天核心状态和 SSE 消费:
- 状态: `messages`, `streamingContent`, `toolSummary`, `sending`, `sessionInfo`, `stats`
- `sendMessage(text)`: fetch POST `/api/chat/stream` → 消费 ReadableStream
  - buffer 按 `\n\n` 分割 → 解析 `event:` 和 `data:` 行
  - delta → 追加 streamingContent
  - tool_use → 加入 toolSummary.pending
  - tool_result → pending 移到 completed
  - done → 完整消息加入 messages，清空 streaming 状态
- `abortChat()`: AbortController.abort() + fetch POST `/api/chat/abort`
- `clearChat()`: fetch DELETE `/api/chat/messages`
- `loadHistory()`: fetch GET `/api/chat/messages`

**`hooks/useTheme.ts`:**
- 读取/切换 light/dark/system 主题
- 操作 `document.documentElement.classList` 添加/移除 `dark`

---

### 步骤 7: 前端 — 核心组件

**`components/chat/ChatLayout.tsx`:**
- 结构: 左侧 sidebar (w-80, 可收起) + 右侧 ChatPanel (flex-1)
- Sidebar 内容: Logo/标题 + SkillsPanel + 底部按钮 (设置/新对话/主题切换)
- 移动端: hamburger 按钮触发 overlay sidebar

**`components/chat/ChatPanel.tsx`:**
- 调用 `useChat()` hook
- 渲染消息列表: `messages.map(msg => <MessageBubble>)`
- streaming 时渲染临时消息 (streamingContent)
- 工具调用时渲染 `<ToolCallSummary>`
- 底部 `<ChatInput>` 传入 onSend/onAbort/sending

**`components/chat/MessageBubble.tsx`:**
- 用户消息: 右对齐，主题色背景 (`bg-blue-600 text-white`)
- AI 消息: 左对齐，浅色背景，内容用 `<MarkdownRenderer>` 渲染
- 系统消息: 居中小字灰色
- 头像: AI 用 `<Bot>` 图标，用户用 `<User>` 图标
- 底部可选显示 stats (tokens + 费用)

**`components/chat/MarkdownRenderer.tsx`:**
- `react-markdown` + `remark-gfm`
- 自定义 code 组件: 语言标签 + 复制按钮 + 暗色代码块背景
- 行内代码: 灰色背景圆角
- 链接: 新窗口打开 + ExternalLink 图标

**`components/chat/ToolCallSummary.tsx`:**
- 可展开/折叠的工具调用卡片
- 折叠态: 状态图标 + "N 个工具调用" + 展开箭头
- 展开态: 每个工具显示名称 + 类型图标 + 输入摘要 + 状态 + 可展开的输出
- 工具类型颜色: Read=蓝, Write=绿, Edit=琥珀, Bash=紫, Grep/Glob=青

**`components/chat/ChatInput.tsx`:**
- 底部悬浮，backdrop-blur 毛玻璃背景
- textarea 自动增高 (1~4 行)
- 左侧: 文件上传按钮 (Paperclip 图标)
- 右侧: 发送 (ArrowUp) / 停止 (Square) 切换
- Enter 发送, Shift+Enter 换行
- 附件预览条 (在输入框上方)

---

### 步骤 8: 技能与设置面板

**`components/skills/SkillsPanel.tsx`:**
- 技能列表: 名称 + 描述 + Toggle 开关
- 刷新按钮 (RefreshCw)
- 空状态: "将 .md 文件放入 skills/ 目录"
- 底部统计: "已启用 N/M 个技能"
- 加载 fetch GET `/api/skills`，更新 fetch PUT `/api/skills`

**`components/settings/SettingsPanel.tsx`:**
- Model: 文本输入 (placeholder: 使用默认模型)
- Effort: 三选一按钮组 (low/medium/high)
- 工作目录 (cwd): 文本输入
- 跳过权限: Toggle
- 当前会话: 只读显示 sessionId
- 清空对话按钮 (红色, 带确认)

---

### 步骤 9: 暗色模式 + 主题

- Tailwind `darkMode: 'class'`
- `globals.css` 定义 CSS 变量:
  - `:root` → 浅色方案 (bg `#F8FAFC`, text `#1E293B`, border `#E2E8F0`)
  - `.dark` → 深色方案 (bg `#0F172A`, text `#F8FAFC`, border `#334155`)
- 主题切换按钮在 sidebar 底部
- 默认跟随系统 (`prefers-color-scheme`)

---

### 步骤 10: 打磨与完善

- 文件上传: input[type=file] → base64 嵌入消息内容
- 错误处理: session unknown → 自动清空重试 (参考 paperclip `isClaudeUnknownSessionError`)
- 进程清理: `process.on('exit')` 中 kill 子进程
- 消息分页: 滚动到顶部触发加载更多
- 响应式: 移动端 sidebar 用 overlay/抽屉模式
- Toast 通知: 简单的 toast 组件，用于显示成功/错误消息

## 验证方案

1. **后端验证**: 启动 `npm run dev` 后，用 curl 测试:
   ```bash
   # 测试 SSE 流
   curl -X POST http://localhost:3000/api/chat/stream \
     -H "Content-Type: application/json" \
     -d '{"message":"Hello"}' -N

   # 测试消息历史
   curl http://localhost:3000/api/chat/messages

   # 测试技能列表
   curl http://localhost:3000/api/skills
   ```

2. **前端验证**: 浏览器打开 `http://localhost:3000`，测试:
   - 输入消息 → 流式显示 AI 回复
   - 工具调用时显示摘要卡片
   - 点击停止按钮中断生成
   - 切换暗色模式
   - 在 skills/ 目录放入 .md 文件 → 刷新技能列表 → 启用/禁用
   - 修改设置 (model/effort) → 下次对话生效
   - 清空对话 → 消息列表清空，新会话

3. **关键校验点**:
   - 确认 `claude` 命令可用 (`which claude`)
   - 确认流式输出完整 (不丢失尾部内容)
   - 确认 session resume 正常工作
   - 确认 abort 后进程被正确 kill
   - 确认技能 symlink 创建和清理正常

## 关键依赖

| 包名 | 用途 |
|------|------|
| next (create-next-app 自带) | 框架 |
| react / react-dom (自带) | UI |
| tailwindcss (自带) | 样式 |
| typescript (自带) | 类型 |
| react-markdown | Markdown 渲染 |
| remark-gfm | GFM 表格/任务列表 |
| lucide-react | 图标库 |
