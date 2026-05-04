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
- 消息搜索、导出、分支切换与反馈
- **命令系统**：自定义命令管理、参数化执行、AI 辅助生成、流程图可视化
- **工作流步骤确认**：SDK 级别 pause/resume，前端实时确认对话框与进度显示
- 命令面板与定时发送
- API 代理：支持第三方 API 转发（OpenAI/Anthropic 等）

### 多项目管理

- 每个项目独立配置、独立消息历史、独立技能和智能体
- 多项目并发对话，后台流不中断
- **文件夹分组**：自定义文件夹组织项目，支持创建/重命名/删除，拖拽移入移出
- **多用户分组**：管理员视角按项目所有者分组，带头像和角色标识
- 项目图标与助理身份联动（自定义头像/图标）
- 项目级渠道、成员权限管理
- 智能体定义与模板系统
- 项目级文件管理与 Git 集成

### 用户认证

- JWT（jose）+ bcryptjs 认证体系
- 注册 / 登录 / 密码修改
- OAuth 第三方登录（支持扩展）
- 用户管理与头像设置
- 审计日志与安全设置

### 渠道集成

- **钉钉** — Stream 模式 WebSocket 长连接，机器人消息实时收发
- **飞书** — Stream 模式 WebSocket 长连接，无需公网 IP，支持文本/图片/文件/语音
- **微信** — 客服消息接入（扫码登录）
- **API** — HTTP webhook 接入，支持流式和非流式两种模式
- 统一消息路由，渠道消息自动同步到 Web UI
- 消息来源追踪：每条消息标注来源渠道与名称，区分 Web / 飞书 / 钉钉 / 微信 / API / 定时任务

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
- 总纲自动生成并注入项目 CLAUDE.md

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

### 开发模式

- 自修改开发循环：代码变更 → 自动构建 → 部署 → 测试验证
- Git Worktree 隔离开发，独立分支不影响主项目
- Dev Server 实时预览
- OTA 更新检测与部署管理

### 提示词模板

- 32 个系统提示词集中管理（设置面板统一配置）
- 6 大分类：AI 系统提示词 / 协调人提示词 / 子角色提示词 / 会话模板 / 注入模板 / 附件模板
- 独立编辑、即时生效，支持恢复默认值

### 桌面应用

- 基于 [Tauri v2](https://v2.tauri.app/) 构建，跨平台 macOS / Windows / Linux
- 首次启动自动下载 Node.js / Python / Git 运行时，零配置开箱即用
- 智能查找系统已安装的运行时（支持 nvm-windows / fnm / Homebrew 等）
- 系统托盘：关闭窗口最小化到托盘，新消息时图标闪烁提醒
- 桌面通知：窗口隐藏时自动推送系统通知（渠道消息 / AI 回复完成）
- **双轨更新机制**：
  - **Server 热更新** — bsdiff 增量差分，仅下载变更部分（~几 MB），无需重启应用，自动重启 Node 进程生效
  - **Tauri 全量更新** — `tauri-plugin-updater` 检测 Rust 客户端壳版本，需用户确认重启
  - 双端点容错：优先 CDN 加速，回退 GitHub 直连
  - 自动后台检查：启动 30s 后首次检查，之后每 2 小时自动检测
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

### 下载安装

从 [GitHub Releases](https://github.com/ggtiger/gclaw/releases/latest) 下载对应平台安装包：

| 平台 | 格式 |
|------|------|
| macOS (Apple Silicon) | `.dmg` |
| macOS (Intel) | `.dmg` |
| Windows | `.msi` / `.exe` (NSIS) |
| Linux | `.AppImage` / `.deb` |

桌面端首次启动会自动下载所需运行时（Node.js / Python / Git），无需手动安装。

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
│   ├── api/chat/                 # 对话（stream / messages / abort / permission / branches / search / export / step-confirmation）
│   ├── api/projects/             # 项目 CRUD + 文件管理 + Git + 成员
│   ├── api/folders/              # 文件夹 CRUD + 项目移入文件夹
│   ├── api/agents/               # 智能体 CRUD
│   ├── api/agent-templates/      # 智能体模板
│   ├── api/templates/            # 消息模板
│   ├── api/skills/               # 技能管理 + 市场
│   ├── api/channels/             # 渠道管理 + webhook + SSE + API渠道
│   ├── api/schedules/            # 定时任务 CRUD + 手动触发
│   ├── api/settings/             # 全局 / 项目 / 模型 / 提示词 / 头像设置
│   ├── api/commands/             # 命令 CRUD + AI 生成
│   ├── api/auth/                 # 用户认证（login / register / oauth / password）
│   ├── api/users/                # 用户管理与头像
│   ├── api/uploads/              # 文件上传与访问
│   ├── api/memory/               # 记忆系统（remember / recall / consolidate / overview）
│   ├── api/focus/                # 专注模式数据与设置
│   ├── api/dev-mode/             # 开发模式管理
│   ├── api/proxy/                # API 代理转发
│   ├── api/logs/                 # 系统日志
│   ├── api/audit-log/            # 审计日志
│   ├── api/security/             # 安全设置
│   ├── api/convert/              # 文档转换（Word → Markdown）
│   ├── api/llm/                  # LLM 配置
│   └── api/auth/                 # 用户认证
├── components/
│   ├── chat/                     # 聊天面板（消息、输入、工具摘要、权限审批、步骤确认、命令参数、搜索、导出）
│   ├── channels/                 # 渠道管理面板
│   ├── projects/                 # 项目侧栏、模式选择、成员管理
│   ├── agents/                   # 智能体管理与模板
│   ├── skills/                   # 技能管理与市场
│   ├── schedules/                # 定时任务（含可视化 Cron 构建器）
│   ├── commands/                 # 命令管理面板（编辑器 + 工作流可视化）
│   ├── panels/                   # 专注模式（Todo / Notes / Calendar）+ 文件 + Git + 记忆
│   │   ├── files/                # 文件面板（CodeMirror 编辑器 + 预览）
│   │   ├── focus/                # 专注模式子面板
│   │   └── memory/               # 记忆系统面板
│   ├── auth/                     # 登录 / 注册 / 认证页面
│   ├── dev-mode/                 # 开发模式面板
│   ├── ui/                       # UI 基础组件（Toast / Modal / WindowControls）
│   ├── settings/                 # 设置面板（账户 / 安全 / 日志 / 技能）
│   └── Providers.tsx             # 全局 Provider 组合
├── hooks/                        # React Hooks
│   ├── useChat.ts                # 聊天核心（SSE 解析、StreamBuffer）
│   ├── useAuth.ts                # 认证状态
│   ├── useProject.ts             # 项目状态
│   ├── useKeyboardShortcuts.ts   # 键盘快捷键
│   ├── useFocusData.ts           # 专注模式数据
│   ├── useMemoryData.ts          # 记忆系统数据
│   └── useAssistantIdentity.ts   # 智能体身份
├── types/                        # TypeScript 类型定义
│   ├── chat.ts                   # 聊天相关类型
│   ├── memory.ts                 # 记忆系统类型
│   ├── focus.ts                  # 专注模式类型
│   ├── git.ts                    # Git 操作类型
│   ├── channels.ts               # 渠道类型
│   └── commands.ts               # 命令系统类型
├── lib/
│   ├── claude/                   # Claude SDK 集成
│   │   ├── process-manager.ts    # 核心调度：query() + AbortController
│   │   ├── stream-parser.ts      # SDKMessage → ParsedEvent 转换
│   │   ├── skills-dir.ts         # 技能目录扫描与 symlink 管理
│   │   ├── skill-hooks.ts        # 技能 Hook 系统（gclaw-hooks.json）
│   │   ├── claude-md.ts          # 项目 CLAUDE.md 生成与注入
│   │   └── gclaw-events.ts       # 全局事件总线
│   ├── channels/                 # 渠道适配器
│   │   ├── channel-service.ts    # 统一消息路由
│   │   ├── dingtalk-stream.ts    # 钉钉 Stream 长连接
│   │   ├── dingtalk.ts           # 钉钉 API
│   │   ├── feishu.ts             # 飞书 API
│   │   ├── feishu-stream.ts      # 飞书 Stream WebSocket 长连接
│   │   ├── wechat-poller.ts      # 微信长连接
│   │   ├── wechat.ts             # 微信 API
│   │   ├── api-service.ts        # API 渠道服务
│   │   └── api-events.ts         # API 渠道事件
│   ├── memory/                   # 四层记忆系统
│   │   ├── store.ts              # 存储层
│   │   ├── retrieval.ts          # 统一检索编排
│   │   ├── consolidation.ts      # 记忆巩固引擎
│   │   ├── llm-extractor.ts      # LLM 驱动的记忆提取
│   │   ├── semantic-manager.ts   # 语义记忆管理
│   │   ├── procedural-manager.ts # 程序记忆管理
│   │   ├── overview-generator.ts # 总纲生成器
│   │   ├── injection.ts          # 总纲缓存与刷新
│   │   └── episodic-writer.ts    # 情节记忆写入
│   ├── scheduler/                # 定时任务调度
│   │   ├── scheduler.ts          # 核心调度器（globalThis 单例）
│   │   ├── executors.ts          # 执行器注册表
│   │   └── cron-parser.ts        # Cron 表达式解析
│   ├── commands/                 # 命令系统
│   │   ├── registry.ts           # 命令定义存储与检索
│   │   ├── executor.ts           # 命令参数渲染与执行
│   │   ├── variables.ts          # 变量解析（{{var}} 模板替换）
│   │   ├── validator.ts          # 命令定义校验
│   │   ├── ai-generator.ts       # LLM 辅助命令生成
│   │   └── mermaid-generator.ts  # 流程图生成
│   ├── auth/                     # 认证辅助
│   │   ├── helpers.ts            # 认证辅助函数
│   │   └── jwt.ts                # JWT 工具
│   ├── dev-mode/                 # 开发模式
│   │   ├── manager.ts            # DevMode 状态机
│   │   ├── worktree.ts           # Git Worktree 操作
│   │   ├── dev-server.ts         # 开发服务器管理
│   │   ├── deploy.ts             # 构建与部署
│   │   └── ota.ts                # OTA 更新检测
│   ├── focus/                    # 专注模式
│   │   ├── store.ts              # 数据存储
│   │   └── providers/            # 数据提供者（Skill）
│   ├── prompts/                  # 提示词模板管理
│   ├── modes/                    # 模式定义
│   ├── services/                 # 服务层（技能市场等）
│   ├── store/                    # 数据持久化（文件系统 JSON）
│   │   └── folders.ts            # 文件夹 CRUD + 项目映射
│   ├── crypto.ts                 # 加密工具
│   ├── logger.ts                 # 日志工具
│   ├── llm.ts                    # LLM 配置管理
│   ├── tauri.ts                  # Tauri API 适配
│   ├── updater.ts                # 热更新管理
│   ├── validators.ts             # 输入校验
│   └── theme-color.ts            # 主题色彩工具
├── skills/                       # 内置技能
├── scripts/                      # 构建 / 部署脚本
├── src-tauri/                    # Tauri 桌面端（Rust）
├── middleware.ts                  # Next.js 中间件
├── instrumentation.ts            # Next.js instrumentation
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

| 工作流 | 触发 Tag | 构建内容 |
|--------|----------|----------|
| `release.yml` | `v*` | 完整 Tauri 应用 + server tar + delta |
| `server-release.yml` | `server-v*` | 仅 Next.js server bundle + delta |

**双轨版本体系**：

| 版本 | 文件 | 含义 | 更新时机 |
|------|------|------|----------|
| Server 版本 | `package.json` → `version` | Web/Node.js 侧代码版本 | 任何 Web 代码变更 |
| Tauri 壳版本 | `tauri.conf.json` + `Cargo.toml` → `version` | Rust 客户端壳版本 | Rust/Tauri 代码变更 |

- **Delta 生成** — 自动对最近 3 个旧版本生成 bsdiff 增量包，注入 `latest.json`
- **CDN 加速** — 七牛云 CDN 分发 Release 产物，自动缓存刷新

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
