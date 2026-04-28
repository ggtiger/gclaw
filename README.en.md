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
- Message search, export, branch switching, and feedback
- Command palette and scheduled sending
- API proxy: support third-party API forwarding (OpenAI/Anthropic, etc.)

### Multi-Project Management

- Independent configuration, message history, skills, and agents per project
- Concurrent conversations across projects — background streams never interrupt
- Per-project channel and member permission management
- Agent definitions and template system
- Project-level file management and Git integration

### User Authentication

- JWT (jose) + bcryptjs authentication system
- Register / Login / Password change
- OAuth third-party login (extensible)
- User management and avatar settings
- Audit logs and security settings

### Channel Integration

- **DingTalk** — Stream mode WebSocket long connection, real-time bot messaging
- **Feishu (Lark)** — Stream mode WebSocket long connection, no public IP required, supports text/image/file/audio
- **WeChat** — Customer service message integration (QR code login)
- **API** — HTTP webhook integration, supports both streaming and non-streaming modes
- Unified message routing with automatic sync to Web UI
- Message source tracking: each message labeled with its channel and name, distinguishing Web / Feishu / DingTalk / WeChat / API / Scheduled task

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
- Overview auto-generation and injection into project CLAUDE.md

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

### Dev Mode

- Self-modifying dev loop: code changes → auto build → deploy → test verification
- Git Worktree isolation — independent branches without affecting main project
- Dev Server live preview
- OTA update detection and deployment management

### Prompt Templates

- 32 system prompts centrally managed in the settings panel
- 6 categories: AI system prompts / coordinator prompts / sub-role prompts / conversation templates / injection templates / attachment templates
- Individual editing with instant effect, supports restoring defaults

### Desktop App

- Built with [Tauri v2](https://v2.tauri.app/), cross-platform support for macOS / Windows / Linux
- Auto-downloads Node.js / Python / Git runtimes on first launch — zero configuration
- Smart detection of system-installed runtimes (nvm-windows / fnm / Homebrew, etc.)
- System tray: minimize to tray on window close, tray icon flashes on new messages
- Desktop notifications: auto-push system notifications when window is hidden (channel messages / AI reply completed)
- **Dual-track update mechanism**:
  - **Server hot update** — bsdiff binary diff, downloads only changed parts (~few MB), no app restart required, Node process auto-restarts to apply
  - **Tauri full update** — `tauri-plugin-updater` detects Rust client shell version, requires user confirmation to restart
  - CDN fallback: CDN acceleration first, fallback to GitHub direct
  - Auto background check: first check 30s after launch, then every 2 hours
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

### Download

Grab the installer for your platform from [GitHub Releases](https://github.com/ggtiger/gclaw/releases/latest):

| Platform | Format |
|----------|--------|
| macOS (Apple Silicon) | `.dmg` |
| macOS (Intel) | `.dmg` |
| Windows | `.msi` / `.exe` (NSIS) |
| Linux | `.AppImage` / `.deb` |

The desktop app auto-downloads required runtimes (Node.js / Python / Git) on first launch — no manual setup needed.

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
│   ├── api/chat/                 # Chat (stream / messages / abort / permission / branches / search / export / attachments)
│   ├── api/projects/             # Project CRUD + file management + Git + members
│   ├── api/agents/               # Agent CRUD
│   ├── api/agent-templates/      # Agent templates
│   ├── api/templates/            # Message templates
│   ├── api/skills/               # Skill management + marketplace
│   ├── api/channels/             # Channel management + webhook + SSE + API channel
│   ├── api/schedules/            # Scheduled tasks CRUD + manual trigger
│   ├── api/settings/             # Global / project / model / prompt settings
│   ├── api/auth/                 # Authentication (login / register / oauth / password)
│   ├── api/users/                # User management and avatar
│   ├── api/uploads/              # File upload and access
│   ├── api/memory/               # Memory system (remember / recall / consolidate / overview)
│   ├── api/focus/                # Focus mode data and settings
│   ├── api/dev-mode/             # Dev mode management
│   ├── api/proxy/                # API proxy forwarding
│   ├── api/logs/                 # System logs
│   ├── api/audit-log/            # Audit logs
│   ├── api/security/             # Security settings
│   ├── api/convert/              # Document conversion (Word → Markdown)
│   ├── api/llm/                  # LLM configuration
├── components/
│   ├── chat/                     # Chat panel (messages, input, tool summary, approval, search, export, branches)
│   ├── channels/                 # Channel management panel
│   ├── projects/                 # Project sidebar, mode selector, members
│   ├── agents/                   # Agent management and templates
│   ├── skills/                   # Skill management and marketplace
│   ├── schedules/                # Scheduled tasks (with visual Cron builder)
│   ├── panels/                   # Focus mode (Todo / Notes / Calendar) + Files + Git + Memory
│   │   ├── files/                # File panel (CodeMirror editor + preview)
│   │   ├── focus/                # Focus mode sub-panels
│   │   └── memory/               # Memory system panel
│   ├── auth/                     # Login / Register / Auth page
│   ├── dev-mode/                 # Dev mode panel
│   ├── ui/                       # UI basics (Toast / Modal / WindowControls)
│   ├── settings/                 # Settings (account / security / logs / skills)
│   └── Providers.tsx             # Global Provider composition
├── hooks/                        # React Hooks
│   ├── useChat.ts                # Chat core (SSE parsing, StreamBuffer)
│   ├── useAuth.ts                # Auth state
│   ├── useProject.ts             # Project state
│   ├── useKeyboardShortcuts.ts   # Keyboard shortcuts
│   ├── useFocusData.ts           # Focus mode data
│   ├── useMemoryData.ts          # Memory system data
│   └── useAssistantIdentity.ts   # Agent identity
├── types/                        # TypeScript type definitions
│   ├── chat.ts                   # Chat-related types
│   ├── memory.ts                 # Memory system types
│   ├── focus.ts                  # Focus mode types
│   ├── git.ts                    # Git operation types
│   └── channels.ts               # Channel types
├── lib/
│   ├── claude/                   # Claude SDK integration
│   │   ├── process-manager.ts    # Core orchestration: query() + AbortController
│   │   ├── stream-parser.ts      # SDKMessage → ParsedEvent conversion
│   │   ├── skills-dir.ts         # Skill directory scanning and symlink management
│   │   ├── skill-hooks.ts        # Skill Hook system (gclaw-hooks.json)
│   │   ├── claude-md.ts          # Project CLAUDE.md generation and injection
│   │   └── gclaw-events.ts       # Global event bus
│   ├── channels/                 # Channel adapters
│   │   ├── channel-service.ts    # Unified message routing
│   │   ├── dingtalk-stream.ts    # DingTalk Stream long connection
│   │   ├── dingtalk.ts           # DingTalk API
│   │   ├── feishu.ts             # Feishu (Lark) API
│   │   ├── feishu-stream.ts      # Feishu Stream WebSocket long connection
│   │   ├── wechat-poller.ts      # WeChat long connection
│   │   ├── wechat.ts             # WeChat API
│   │   ├── api-service.ts        # API channel service
│   │   └── api-events.ts         # API channel events
│   ├── memory/                   # Four-layer memory system
│   │   ├── store.ts              # Storage layer
│   │   ├── retrieval.ts          # Unified retrieval orchestration
│   │   ├── consolidation.ts      # Memory consolidation engine
│   │   ├── llm-extractor.ts      # LLM-driven memory extraction
│   │   ├── semantic-manager.ts   # Semantic memory management
│   │   ├── procedural-manager.ts # Procedural memory management
│   │   ├── overview-generator.ts # Overview generator
│   │   ├── injection.ts          # Overview caching and refresh injection
│   │   └── episodic-writer.ts    # Episodic memory writer
│   ├── scheduler/                # Scheduled task dispatching
│   │   ├── scheduler.ts          # Core scheduler (globalThis singleton)
│   │   ├── executors.ts          # Executor registry
│   │   └── cron-parser.ts        # Cron expression parser
│   ├── auth/                     # Auth helpers
│   │   ├── helpers.ts            # Auth helper functions
│   │   └── jwt.ts                # JWT utilities
│   ├── dev-mode/                 # Dev mode
│   │   ├── manager.ts            # DevMode state machine
│   │   ├── worktree.ts           # Git Worktree operations
│   │   ├── dev-server.ts         # Dev server management
│   │   ├── deploy.ts             # Build + deploy
│   │   └── ota.ts                # OTA update detection
│   ├── focus/                    # Focus mode
│   │   ├── store.ts              # Data storage
│   │   └── providers/            # Data providers (Skill)
│   ├── prompts/                  # Prompt template management
│   ├── modes/                    # Mode definitions
│   ├── services/                 # Service layer (skill marketplace, etc.)
│   ├── store/                    # Data persistence (file-system JSON)
│   ├── crypto.ts                 # Encryption utilities
│   ├── logger.ts                 # Logger
│   ├── llm.ts                    # LLM config management
│   ├── tauri.ts                  # Tauri API adapter
│   ├── updater.ts                # Hot update management
│   ├── validators.ts             # Input validation
│   ├── theme-color.ts            # Theme color utilities
├── skills/                       # Built-in skills
├── scripts/                      # Build / deploy scripts
├── src-tauri/                    # Tauri desktop app (Rust)
├── middleware.ts                  # Next.js middleware
├── instrumentation.ts            # Next.js instrumentation
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

| Workflow | Trigger Tag | Build Content |
|----------|-------------|---------------|
| `release.yml` | `v*` | Full Tauri app + server tar + delta |
| `server-release.yml` | `server-v*` | Next.js server bundle only + delta |

**Dual-track version system**:

| Version | File | Meaning | Update Timing |
|---------|------|---------|---------------|
| Server version | `package.json` → `version` | Web/Node.js code version | Any Web code change |
| Tauri shell version | `tauri.conf.json` + `Cargo.toml` → `version` | Rust client shell version | Rust/Tauri code change |

- **Delta generation** — Auto-generate bsdiff incremental patches for the last 3 old versions, injected into `latest.json`
- **CDN acceleration** — Qiniu Cloud CDN distributes Release artifacts with auto cache purge

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
