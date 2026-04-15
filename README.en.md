<div align="center">

<img src="docs/icon.png" alt="GClaw" width="120" />

# GClaw

An Enterprise AI Conversation Platform Built on Claude Agent SDK

Unified integration for DingTalk, Feishu (Lark), and WeChat with skill extensions, multi-project management, and scheduled task dispatching

English | **[中文](./README.md)**

[![CI](https://github.com/ggtiger/gclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/ggtiger/gclaw/actions/workflows/ci.yml)
[![Release](https://github.com/ggtiger/gclaw/actions/workflows/release.yml/badge.svg)](https://github.com/ggtiger/gclaw/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## Features

### Smart Conversation

- Real-time streaming via SSE, token-by-token rendering
- Full visualization of Claude's conversation, tool use, and thinking process
- Markdown rendering + syntax highlighting (CodeMirror, 20+ languages)
- Mermaid diagrams, Office/PDF file preview
- Multimodal messages: upload files and images for Claude to analyze
- Message search, export, and branch switching
- Command palette and scheduled sending

### Multi-Project Management

- Independent configuration, message history, skills, and agents per project
- Concurrent conversations across projects — background streams never interrupt
- Per-project channel and member permission management
- Agent definitions and template system

### Channel Integration

- **DingTalk** — Stream mode WebSocket long connection, real-time bot messaging
- **Feishu (Lark)** — Event subscription message integration
- **WeChat** — Customer service message integration (QR code login)
- Unified message routing with automatic sync to Web UI

### Skill System

- Declarative skill definitions (SKILL.md), auto-loaded and executed by Claude
- Built-in skill marketplace with one-click install and management
- Skill Hook system (`gclaw-hooks.json`) with notify / script / log actions
- Learning accumulation mechanism (auto-injected into CLAUDE.md via `.learnings/`)

### Memory System

- Four-layer memory architecture: Episodic → Semantic → Procedural → Overview
- LLM-driven automatic extraction and consolidation
- Cross-layer unified retrieval with keyword + tag + time-decay scoring
- Access frequency tracking and verification status management

### Scheduled Tasks

- Visual Cron expression builder
- Three scheduling modes: one-time / interval / Cron
- Five built-in executors: chat message, script, webhook, skill invocation, custom
- Skills can declare scheduled tasks via `gclaw-hooks.json`

### Permission Approval

- SDK Hook `PreToolUse` intercepts dangerous tools (Bash / Write / Edit, etc.)
- 60-second auto-deny timeout
- Real-time approval dialog in Web UI with SSE push

### Focus Mode

- Integrated panel for Todos, Notes, and Calendar
- Three data providers: File, Skill, and API
- Configurable data source management

### Desktop App

- Built with [Tauri v2](https://v2.tauri.app/), cross-platform support for macOS / Windows / Linux
- Auto-update detection via GitHub Releases
- Next.js standalone bundled as a sidecar process

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 3.4 + CSS variables (light/dark mode + glassmorphism) |
| AI SDK | `@anthropic-ai/claude-agent-sdk` |
| Desktop | Tauri v2 (Rust) |
| Storage | File-system JSON (`data/` directory, zero database dependency) |
| Auth | JWT (jose) + bcryptjs |
| Icons | Lucide React |

---

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9
- Anthropic API Key

### Installation

```bash
git clone https://github.com/ggtiger/gclaw.git
cd gclaw
npm install
```

### Configure API Key

Enter your Anthropic API Key in the Web UI settings panel, or set it via environment variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Start Dev Server

```bash
npm run dev          # Start Next.js dev server (port 3100)
```

Open `http://localhost:3100` in your browser. Register an account on first use.

### Desktop Development

```bash
npm run tauri:dev    # Start Tauri dev mode (requires Rust toolchain)
```

### Production Build

```bash
# Web app
npm run build

# Desktop app (requires Rust toolchain)
npm run tauri:build
```

---

## Project Structure

```
gclaw/
├── app/                          # Next.js App Router pages and API
│   ├── api/chat/                 # Chat (stream / messages / abort / permission)
│   ├── api/projects/             # Project CRUD
│   ├── api/agents/               # Agent CRUD
│   ├── api/skills/               # Skill management + marketplace
│   ├── api/channels/             # Channel management + webhook + SSE
│   ├── api/schedules/            # Scheduled tasks CRUD + manual trigger
│   ├── api/settings/             # Global / project settings
│   └── api/auth/                 # Authentication
├── components/
│   ├── chat/                     # Chat panel (messages, input, tool summary, approval)
│   ├── channels/                 # Channel management panel
│   ├── projects/                 # Project sidebar, mode selector, members
│   ├── agents/                   # Agent management and templates
│   ├── skills/                   # Skill management and marketplace
│   ├── schedules/                # Scheduled tasks (with visual Cron builder)
│   ├── panels/                   # Focus mode (Todo / Notes / Calendar)
│   │   └── files/                # File panel (CodeMirror editor + preview)
│   └── settings/                 # Settings (account / security / logs / skills)
├── hooks/                        # React Hooks
│   ├── useChat.ts                # Chat core (SSE parsing, StreamBuffer)
│   └── useAuth.ts                # Auth state
├── lib/
│   ├── claude/                   # Claude SDK integration
│   │   ├── process-manager.ts    # Core orchestration: query() + AbortController
│   │   ├── stream-parser.ts      # SDKMessage → ParsedEvent conversion
│   │   ├── skills-dir.ts         # Skill directory scanning and symlink management
│   │   ├── skill-hooks.ts        # Skill Hook system (gclaw-hooks.json)
│   │   └── gclaw-events.ts       # Global event bus
│   ├── channels/                 # Channel adapters
│   │   ├── channel-service.ts    # Unified message routing
│   │   ├── dingtalk-stream.ts    # DingTalk Stream long connection
│   │   ├── dingtalk.ts           # DingTalk API
│   │   ├── feishu.ts             # Feishu (Lark)
│   │   └── wechat-poller.ts      # WeChat long connection
│   ├── memory/                   # Four-layer memory system
│   │   ├── store.ts              # Storage layer
│   │   ├── retrieval.ts          # Unified retrieval orchestration
│   │   ├── consolidation.ts      # Memory consolidation engine
│   │   ├── llm-extractor.ts      # LLM-driven memory extraction
│   │   ├── semantic-manager.ts   # Semantic memory management
│   │   └── procedural-manager.ts # Procedural memory management
│   ├── scheduler/                # Scheduled task dispatching
│   │   ├── scheduler.ts          # Core scheduler (globalThis singleton)
│   │   ├── executors.ts          # Executor registry
│   │   └── cron-parser.ts        # Cron expression parser
│   └── store/                    # Data persistence (file-system JSON)
├── skills/                       # Built-in skills
├── scripts/                      # Build / deploy scripts
├── src-tauri/                    # Tauri desktop app (Rust)
└── data/                         # Runtime data (gitignored)
```

---

## Core Data Flow

```
Browser React UI
    │ SSE (POST /api/chat/stream)
    ▼
process-manager.ts → Claude Agent SDK query()
    │ AsyncIterable<SDKMessage>
    ▼
stream-parser.ts → ParsedEvent
    │ SSE push to frontend
    ▼
useChat hook parses → Message bubble rendering
    │
    ▼
Persist → data/projects/{id}/messages.json
```

---

## Built-in Skills

| Skill | Description |
|-------|-------------|
| agent-browser | Browser automation |
| auto-media | Automated social media operations |
| baidu-search | Baidu search integration |
| find-skills | Skill discovery and search |
| gclaw-api | GClaw platform REST API operations |
| humanizer | Text humanization |
| memory-recall | Memory system operations (read / write / search / consolidate) |
| minimax-pdf | PDF document processing |
| minimax-xlsx | Excel spreadsheet processing |
| obsidian | Obsidian notes integration |
| ocr | Local OCR image text recognition (Tesseract) |
| pptx-generator | PowerPoint presentation generation |
| prompt-engineering-expert | Prompt engineering expert |
| self-improving-agent | Self-improving agent (error capture, experience accumulation) |
| skill-creator | Skill creation wizard |
| summarize | Content summarization |
| tauri-cross-platform-build | Tauri cross-platform build guide |
| yh-minimax-docx | Word document processing |

---

## Deployment

### Web Deployment

```bash
npm run deploy:build   # Build production version
npm run start:prod     # Start production server (standalone mode)
```

### Desktop Build

```bash
npm run tauri:build    # Build installer for current platform
```

Supported build targets: macOS (DMG / App), Windows (MSI / NSIS), Linux (AppImage / DEB / RPM).

### CI/CD

- **CI** — Automatic triple-platform build check on PRs and pushes to main
- **Release** — Automatic quad-platform build and GitHub Release on `v*` tag push

---

## Common Commands

```bash
npm run dev           # Start dev server (port 3100)
npm run build         # Production build
npm run lint          # ESLint check
npx tsc --noEmit      # TypeScript type check
npm run tauri:dev     # Tauri dev mode
npm run tauri:build   # Tauri production build
```

---

## License

[MIT](LICENSE)
