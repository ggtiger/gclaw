<div align="center">

<img src="docs/icon.png" alt="GClaw" width="120" />

# GClaw

基于 Claude Agent SDK 的企业级 AI 对话应用平台

统一接入钉钉、飞书、微信等企业 IM，支持技能扩展、多项目并行、定时任务调度

**[English](./README.en.md)** | 中文

[![CI](https://github.com/ggtiger/gclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/ggtiger/gclaw/actions/workflows/ci.yml)
[![Release](https://github.com/ggtiger/gclaw/actions/workflows/release.yml/badge.svg)](https://github.com/ggtiger/gclaw/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 功能概览

### 智能对话

- 基于 SSE 的实时流式通信，逐 token 渲染
- 完整展示 Claude 的对话、工具调用、思考过程
- Markdown 渲染 + 代码高亮（CodeMirror，支持 20+ 语言）
- Mermaid 图表、Office/PDF 文件在线预览
- 多模态消息：支持文件和图片上传，Claude 自动分析
- 消息搜索、导出、分支切换
- 命令面板与定时发送

### 多项目管理

- 每个项目独立配置、独立消息历史、独立技能和智能体
- 多项目并发对话，后台流不中断
- 项目级渠道、成员权限管理
- 智能体定义与模板系统

### 渠道集成

- **钉钉** — Stream 模式 WebSocket 长连接，机器人消息实时收发
- **飞书** — 事件订阅消息接入
- **微信** — 客服消息接入（扫码登录）
- 统一消息路由，渠道消息自动同步到 Web UI

### 技能系统

- 声明式技能定义（SKILL.md），Claude 自动加载并执行
- 内置技能市场，一键安装与管理
- 技能 Hook 系统（`gclaw-hooks.json`），支持 notify / script / log 三种 action
- 经验积累机制（`.learnings/` 自动注入 CLAUDE.md）

### 记忆系统

- 四层记忆架构：情节 → 语义 → 程序 → 总纲
- LLM 驱动的自动提取与巩固
- 跨层级统一检索，支持关键词 + 标签 + 时间衰减排序
- 访问频率追踪与验证状态管理

### 定时任务

- 可视化 Cron 表达式构建器
- 支持一次性 / 间隔 / Cron 三种调度模式
- 5 种内置执行器：对话消息、脚本、Webhook、技能调用、自定义
- 技能可通过 `gclaw-hooks.json` 声明定时任务

### 权限审批

- SDK Hook `PreToolUse` 拦截危险工具（Bash / Write / Edit 等）
- 60 秒超时自动拒绝
- Web UI 实时审批对话框，支持 SSE 推送

### 专注模式

- 待办事项（Todo）、笔记（Notes）、日历（Calendar）一体化面板
- 支持文件、Skill、API 三种数据提供者
- 可配置数据源管理

### 桌面应用

- 基于 [Tauri v2](https://v2.tauri.app/) 构建，跨平台 macOS / Windows / Linux
- 自动更新检测（GitHub Releases）
- Next.js standalone 打包为 sidecar 进程

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) + React 19 |
| 语言 | TypeScript (strict) |
| 样式 | Tailwind CSS 3.4 + CSS 变量（亮/暗模式 + 毛玻璃效果） |
| AI SDK | `@anthropic-ai/claude-agent-sdk` |
| 桌面端 | Tauri v2（Rust） |
| 持久化 | 文件系统 JSON（`data/` 目录，零数据库依赖） |
| 认证 | JWT（jose）+ bcryptjs |
| 图标 | Lucide React |

---

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

### 配置 API Key

在 Web UI 设置面板中填入 Anthropic API Key，或通过环境变量设置：

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### 启动开发服务器

```bash
npm run dev          # 启动 Next.js 开发服务器（端口 3100）
```

浏览器访问 `http://localhost:3100`，首次使用需注册账号。

### 桌面端开发

```bash
npm run tauri:dev    # 启动 Tauri 开发模式（需安装 Rust 工具链）
```

### 生产构建

```bash
# Web 应用
npm run build

# 桌面应用（需安装 Rust 工具链）
npm run tauri:build
```

---

## 项目结构

```
gclaw/
├── app/                          # Next.js App Router 页面与 API
│   ├── api/chat/                 # 对话（stream / messages / abort / permission）
│   ├── api/projects/             # 项目 CRUD
│   ├── api/agents/               # 智能体 CRUD
│   ├── api/skills/               # 技能管理 + 市场
│   ├── api/channels/             # 渠道管理 + webhook + SSE
│   ├── api/schedules/            # 定时任务 CRUD + 手动触发
│   ├── api/settings/             # 全局 / 项目设置
│   └── api/auth/                 # 用户认证
├── components/
│   ├── chat/                     # 聊天面板（消息、输入、工具摘要、权限审批）
│   ├── channels/                 # 渠道管理面板
│   ├── projects/                 # 项目侧栏、模式选择、成员管理
│   ├── agents/                   # 智能体管理与模板
│   ├── skills/                   # 技能管理与市场
│   ├── schedules/                # 定时任务（含可视化 Cron 构建器）
│   ├── panels/                   # 专注模式（Todo / Notes / Calendar）
│   │   └── files/                # 文件面板（CodeMirror 编辑器 + 预览）
│   └── settings/                 # 设置面板（账户 / 安全 / 日志 / 技能）
├── hooks/                        # React Hooks
│   ├── useChat.ts                # 聊天核心（SSE 解析、StreamBuffer）
│   └── useAuth.ts                # 认证状态
├── lib/
│   ├── claude/                   # Claude SDK 集成
│   │   ├── process-manager.ts    # 核心调度：query() + AbortController
│   │   ├── stream-parser.ts      # SDKMessage → ParsedEvent 转换
│   │   ├── skills-dir.ts         # 技能目录扫描与 symlink 管理
│   │   ├── skill-hooks.ts        # 技能 Hook 系统（gclaw-hooks.json）
│   │   └── gclaw-events.ts       # 全局事件总线
│   ├── channels/                 # 渠道适配器
│   │   ├── channel-service.ts    # 统一消息路由
│   │   ├── dingtalk-stream.ts    # 钉钉 Stream 长连接
│   │   ├── dingtalk.ts           # 钉钉 API
│   │   ├── feishu.ts             # 飞书
│   │   └── wechat-poller.ts      # 微信长连接
│   ├── memory/                   # 四层记忆系统
│   │   ├── store.ts              # 存储层
│   │   ├── retrieval.ts          # 统一检索编排
│   │   ├── consolidation.ts      # 记忆巩固引擎
│   │   ├── llm-extractor.ts      # LLM 驱动的记忆提取
│   │   ├── semantic-manager.ts   # 语义记忆管理
│   │   └── procedural-manager.ts # 程序记忆管理
│   ├── scheduler/                # 定时任务调度
│   │   ├── scheduler.ts          # 核心调度器（globalThis 单例）
│   │   ├── executors.ts          # 执行器注册表
│   │   └── cron-parser.ts        # Cron 表达式解析
│   └── store/                    # 数据持久化（文件系统 JSON）
├── skills/                       # 内置技能
├── scripts/                      # 构建 / 部署脚本
├── src-tauri/                    # Tauri 桌面端（Rust）
└── data/                         # 运行时数据（gitignore）
```

---

## 核心数据流

```
浏览器 React UI
    │ SSE (POST /api/chat/stream)
    ▼
process-manager.ts → Claude Agent SDK query()
    │ AsyncIterable<SDKMessage>
    ▼
stream-parser.ts → ParsedEvent
    │ SSE 推送到前端
    ▼
useChat hook 解析 → 消息气泡渲染
    │
    ▼
持久化 → data/projects/{id}/messages.json
```

---

## 内置技能

| 技能 | 说明 |
|------|------|
| agent-browser | 浏览器自动化 |
| auto-media | 全自动自媒体运营系统 |
| baidu-search | 百度搜索集成 |
| find-skills | 技能发现与检索 |
| gclaw-api | GClaw 平台 REST API 操作 |
| humanizer | 文本人性化处理 |
| memory-recall | 记忆系统操作（读取 / 写入 / 检索 / 巩固） |
| minimax-pdf | PDF 文档处理 |
| minimax-xlsx | Excel 表格处理 |
| obsidian | Obsidian 笔记集成 |
| ocr | 本地 OCR 图片文字识别（Tesseract） |
| pptx-generator | PPT 演示文稿生成 |
| prompt-engineering-expert | 提示词工程专家 |
| self-improving-agent | 自改进智能体（错误捕获、经验积累） |
| skill-creator | 技能创建向导 |
| summarize | 内容摘要 |
| tauri-cross-platform-build | Tauri 跨平台构建指南 |
| yh-minimax-docx | Word 文档处理 |

---

## 部署

### Web 部署

```bash
npm run deploy:build   # 构建生产版本
npm run start:prod     # 启动生产服务器（standalone 模式）
```

### 桌面端构建

```bash
npm run tauri:build    # 构建当前平台安装包
```

支持构建目标：macOS（DMG / App）、Windows（MSI / NSIS）、Linux（AppImage / DEB / RPM）。

### CI/CD

- **CI** — PR 和 push 到 main 时自动触发三平台编译检查
- **Release** — 推送 `v*` tag 自动触发四平台构建并发布 GitHub Release

---

## 常用命令

```bash
npm run dev           # 启动开发服务器（端口 3100）
npm run build         # 生产构建
npm run lint          # ESLint 检查
npx tsc --noEmit      # TypeScript 类型检查
npm run tauri:dev     # Tauri 开发模式
npm run tauri:build   # Tauri 生产构建
```

---

## 开源协议

[MIT](LICENSE)
