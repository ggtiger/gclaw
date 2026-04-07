# GClaw

**[English](./README.en.md)** | 中文

基于 [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) 的企业级 AI 对话应用平台。通过 Web UI 可视化 Claude 的完整能力（对话、工具调用、思考过程），并统一接入钉钉、飞书、微信等企业 IM 渠道。支持技能扩展系统、多项目并行管理、智能体定义。

## 功能特性

### 流式对话

- 基于 SSE 的实时流式通信，逐 token 渲染
- 完整展示 Claude 的对话、工具调用、思考过程
- Markdown 渲染 + 代码高亮（CodeMirror，支持 20+ 编程语言）
- Mermaid 图表、文件预览（Office、PDF 等）
- 多模态消息：支持文件和图片上传发送给 Claude 分析

### 多项目管理

- 每个项目独立配置、独立消息历史
- 多项目并发对话，后台流不中断
- 项目级技能、智能体、渠道配置

### 技能系统

- 声明式技能定义（SKILL.md），Claude 自动加载
- 内置技能市场，一键安装
- 技能 Hook 系统（`gclaw-hooks.json`），支持 notify/script/log 三种 action
- 经验积累机制（`.learnings/` 自动注入）

### 渠道集成

- **钉钉** — 机器人消息接入
- **飞书** — 事件订阅消息接入
- **微信** — 客服消息接入
- 统一的 `channel-service.ts` 处理消息路由

### 权限审批

- SDK Hook `PreToolUse` 拦截危险工具（Bash/Write/Edit 等）
- 60 秒超时自动拒绝
- Web UI 实时审批对话框

### 专注模式

- 待办事项（Todo）、笔记（Notes）、日历（Calendar）一体化面板
- 支持文件、Skill、API 三种数据提供者
- 可配置的数据源管理

### 桌面应用

- 基于 [Tauri v2](https://v2.tauri.app/) 构建，跨平台支持 macOS / Windows / Linux
- Next.js standalone 打包为 sidecar 运行

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) + React 19 |
| 语言 | TypeScript (strict) |
| 样式 | Tailwind CSS 3.4 + CSS 变量（亮/暗模式 + 毛玻璃效果） |
| AI SDK | `@anthropic-ai/claude-agent-sdk` v0.1.76 |
| 桌面端 | Tauri v2 |
| 持久化 | 文件系统 JSON（`data/` 目录，无数据库） |
| 认证 | JWT（jose） + bcryptjs |
| 图标 | Lucide React |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9
- Anthropic API Key

### 安装

```bash
git clone https://github.com/ggtiger/gclaw.git
cd gclaw
npm install
```

### 配置

在 Web UI 设置面板中填入你的 Anthropic API Key，或通过环境变量设置：

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### 开发

```bash
npm run dev          # 启动开发服务器（端口 3100）
```

浏览器访问 `http://localhost:3100`，首次使用需注册账号。

### 桌面端开发

```bash
npm run tauri:dev    # 启动 Tauri 开发模式
```

### 生产构建

```bash
# Web 应用
npm run build

# 桌面应用（需安装 Rust 工具链）
npm run tauri:build
```

## 项目结构

```
gclaw/
├── app/                    # Next.js App Router
│   ├── api/                # API 路由
│   │   ├── chat/           # 对话（stream/messages/abort/permission）
│   │   ├── projects/       # 项目 CRUD
│   │   ├── agents/         # 智能体 CRUD
│   │   ├── skills/         # 技能管理 + 市场
│   │   ├── channels/       # 渠道管理 + webhook
│   │   ├── focus/          # 专注模式数据
│   │   ├── auth/           # 用户认证
│   │   └── settings/       # 全局/项目设置
│   ├── login/              # 登录页
│   └── register/           # 注册页
├── components/             # React 组件
│   └── panels/             # 面板组件
│       ├── focus/          # 专注模式（Calendar/Notes/Todo/Settings）
│       └── files/          # 文件面板
├── hooks/                  # React Hooks
│   ├── useChat.ts          # 聊天核心（SSE 解析、StreamBuffer）
│   ├── useFocusData.ts     # 专注模式数据
│   └── useAuth.ts          # 认证状态
├── lib/
│   ├── claude/             # Claude SDK 集成
│   │   ├── process-manager.ts   # 核心调度
│   │   ├── stream-parser.ts     # 消息流解析
│   │   ├── skills-dir.ts        # 技能目录管理
│   │   ├── skill-hooks.ts       # 技能 Hook 系统
│   │   └── gclaw-events.ts      # 全局事件总线
│   ├── channels/           # 渠道适配器
│   │   ├── dingtalk.ts     # 钉钉
│   │   ├── feishu.ts       # 飞书
│   │   └── wechat.ts       # 微信
│   └── store/              # 数据持久化
├── skills/                 # 内置技能
├── scripts/                # 构建/部署脚本
├── src-tauri/              # Tauri 桌面端
└── data/                   # 运行时数据（gitignore）
```

## 核心数据流

```
浏览器 React UI
    │ SSE
    ▼
/api/chat/stream
    │
    ▼
Claude Agent SDK query()
    │ AsyncIterable<SDKMessage>
    ▼
stream-parser.ts → ParsedEvent
    │ SSE 推送
    ▼
前端 useChat hook 解析更新
    │
    ▼
消息持久化到 data/projects/{id}/messages.json
```

## 内置技能

| 技能 | 说明 |
|------|------|
| auto-memory-manager | 自动记忆管理 |
| baidu-search | 百度搜索集成 |
| find-skills | 技能发现与检索 |
| gclaw-api | GClaw API 调用工具 |
| obsidian | Obsidian 笔记集成 |
| prompt-engineering-expert | 提示词工程专家 |
| skill-creator | 技能创建向导 |
| summarize | 内容摘要 |
| tauri-cross-platform-build | Tauri 跨平台构建 |
| tencent-docs | 腾讯文档集成 |
| tencent-meeting-skill | 腾讯会议集成 |
| wechat-toolkit | 微信工具包 |
| xiaohongshu-mcp | 小红书 MCP |
| agent-browser | 浏览器自动化 |
| self-improving-agent | 自改进智能体 |
| skill-vetter | 技能审核 |

## 部署

### Web 部署

```bash
npm run deploy:build   # 构建生产版本
npm run start:prod     # 启动生产服务器
```

### 桌面端构建

```bash
npm run tauri:build    # 构建当前平台安装包
```

支持构建目标：macOS（DMG/App）、Windows（MSI/EXE）、Linux（AppImage/DEB）。

## 开源协议

MIT
