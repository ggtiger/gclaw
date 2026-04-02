# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

GClaw 是基于 Claude Agent SDK 的 AI 对话应用平台。Web UI 聊天界面通过 `@anthropic-ai/claude-agent-sdk` 实现流式对话，支持 Skills（技能）系统、多项目管理、智能体定义、多渠道（钉钉/飞书/微信）消息接入。中文界面。

## 常用命令

```bash
npm run dev      # 启动 Next.js 开发服务器
npm run build    # 生产构建
npm run lint     # ESLint 检查（使用 next lint 默认配置，无独立 eslint 配置文件）
```

无测试框架配置。

## 技术栈

- Next.js 15 (App Router) + React 19 + TypeScript (strict)
- Tailwind CSS 3.4 + CSS 变量（亮/暗模式 + 毛玻璃效果）
- `@anthropic-ai/claude-agent-sdk` v0.1.76
- 文件系统 JSON 持久化（`data/` 目录，无数据库）
- 路径别名：`@/*` 映射到项目根目录
- tsconfig 已排除 `skills/` 目录

## 架构

### 核心数据流

```
浏览器 React UI → SSE → /api/chat/stream → Claude Agent SDK query()
  → AsyncIterable<SDKMessage> → stream-parser.ts 转为 ParsedEvent
  → SSE 推送到前端 → useChat hook 解析更新状态
  → 消息持久化到 data/projects/{id}/messages.json
```

### 关键模块

| 模块 | 路径 | 职责 |
|------|------|------|
| Claude SDK 集成 | `lib/claude/process-manager.ts` | 核心调度：调用 SDK query()、管理 AbortController、生成 SSE 事件 |
| 流解析器 | `lib/claude/stream-parser.ts` | SDKMessage → ParsedEvent 转换 |
| 技能目录管理 | `lib/claude/skills-dir.ts` | 扫描技能、创建 symlink 到项目 `.claude/skills/` |
| 技能 Hook 系统 | `lib/claude/skill-hooks.ts` | 声明式 Hook（gclaw-hooks.json），支持 notify/script/log 三种 action |
| 事件总线 | `lib/claude/gclaw-events.ts` | 全局单例 GClawEventBus，连接 SDK Hook、技能通知和 Web UI |
| 聊天状态 | `hooks/useChat.ts` | 前端核心 hook：SSE 解析、多项目 StreamBuffer、消息管理 |
| 渠道服务 | `lib/channels/channel-service.ts` | 统一处理钉钉/飞书/微信消息，调用 executeChat 后回复渠道 |

### 多项目并发

每个项目独立 AbortController，前端使用模块级 `StreamBuffer`（Map）缓存各项目流状态。切换项目时从 buffer 恢复，后台流不中断。

### 权限系统

SDK Hook `PreToolUse` 拦截危险工具（Bash/Write/Edit/MultiEdit/Skill），60 秒超时自动拒绝，通过 SSE `permission_request` 事件推送到前端审批对话框。

### 技能系统

技能存放在 `skills/` 目录，每个技能包含：
- `SKILL.md` — 技能定义（Claude 自动加载）
- `_meta.json` — 元数据（名称、版本、描述）
- `gclaw-hooks.json` — Hook 声明（可选）
- `.learnings/` — 经验积累（自动注入到项目 CLAUDE.md）

### 渠道集成

三种渠道适配器：`lib/channels/dingtalk.ts`、`lib/channels/feishu.ts`、`lib/channels/wechat.ts`。渠道消息经 `channel-service.ts` 统一处理后调用 `executeChat()`，回复推送到渠道同时通过 SSE 推送到前端。

### API 路由

```
/api/chat/stream     — SSE 流式对话（POST）
/api/chat/messages   — 历史消息 CRUD
/api/chat/abort      — 终止查询
/api/chat/permission — 权限审批
/api/projects        — 项目 CRUD
/api/agents          — 智能体 CRUD
/api/channels/*      — 渠道管理 + webhook + SSE 事件
/api/skills/*        — 技能管理 + 市场
/api/settings        — 全局/项目设置
```

### 数据持久化

所有数据存储在 `data/` 目录（已 gitignore），无数据库：
- `data/global.json` — 全局设置
- `data/projects.json` — 项目列表
- `data/projects/{id}/` — 每个项目的设置、消息、技能、智能体、渠道配置

## 开发注意事项

- 修改 `lib/claude/` 下的文件时注意 HMR 热替换问题：事件总线使用 `globalThis` 单例防止 HMR 丢失状态
- 消息持久化上限 500 条（`lib/store/messages.ts`）
- API Key 通过 `process.env.ANTHROPIC_API_KEY` 传递给 SDK（设置面板写入环境变量）
- `data/` 目录中存在旧的根级文件用于向后兼容，项目系统会自动迁移
