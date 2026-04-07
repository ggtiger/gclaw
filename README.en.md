# GClaw

English | **[中文](./README.md)**

An enterprise-grade AI conversation platform built on [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk). Visualizes Claude's full capabilities (conversation, tool use, thinking process) through a Web UI, with unified integration for DingTalk, Feishu (Lark), and WeChat enterprise IM channels. Supports a skill extension system, multi-project parallel management, and agent definitions.

## Features

### Streaming Conversation

- Real-time streaming via SSE, token-by-token rendering
- Full visualization of Claude's conversation, tool use, and thinking process
- Markdown rendering + syntax highlighting (CodeMirror, 20+ languages)
- Mermaid diagrams, file preview (Office, PDF, etc.)
- Multimodal messages: upload files and images for Claude to analyze

### Multi-Project Management

- Independent configuration and message history per project
- Concurrent conversations across projects — background streams never interrupt
- Per-project skills, agents, and channel configuration

### Skill System

- Declarative skill definitions (SKILL.md), auto-loaded by Claude
- Built-in skill marketplace with one-click install
- Skill Hook system (`gclaw-hooks.json`) with notify/script/log actions
- Learning accumulation mechanism (auto-injected via `.learnings/`)

### Channel Integration

- **DingTalk** — Bot message integration
- **Feishu (Lark)** — Event subscription integration
- **WeChat** — Customer service message integration
- Unified message routing via `channel-service.ts`

### Permission Approval

- SDK Hook `PreToolUse` intercepts dangerous tools (Bash/Write/Edit, etc.)
- 60-second auto-deny timeout
- Real-time approval dialog in the Web UI

### Focus Mode

- Integrated panel for Todos, Notes, and Calendar
- Three data providers: File, Skill, and API
- Configurable data source management

### Desktop App

- Built with [Tauri v2](https://v2.tauri.app/), cross-platform support for macOS / Windows / Linux
- Next.js standalone bundled as a sidecar process

## Tech Stack

| Category | Technology |
|-----------|------------|
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 3.4 + CSS variables (light/dark mode + glassmorphism) |
| AI SDK | `@anthropic-ai/claude-agent-sdk` v0.1.76 |
| Desktop | Tauri v2 |
| Storage | File-system JSON (`data/` directory, no database) |
| Auth | JWT (jose) + bcryptjs |
| Icons | Lucide React |

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

### Configuration

Enter your Anthropic API Key in the Web UI settings panel, or set it via environment variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Development

```bash
npm run dev          # Start dev server (port 3100)
```

Open `http://localhost:3100` in your browser. Register an account on first use.

### Desktop Development

```bash
npm run tauri:dev    # Start Tauri dev mode
```

### Production Build

```bash
# Web app
npm run build

# Desktop app (requires Rust toolchain)
npm run tauri:build
```

## Project Structure

```
gclaw/
├── app/                    # Next.js App Router
│   ├── api/                # API routes
│   │   ├── chat/           # Chat (stream/messages/abort/permission)
│   │   ├── projects/       # Project CRUD
│   │   ├── agents/         # Agent CRUD
│   │   ├── skills/         # Skill management + marketplace
│   │   ├── channels/       # Channel management + webhook
│   │   ├── focus/          # Focus mode data
│   │   ├── auth/           # Authentication
│   │   └── settings/       # Global/project settings
│   ├── login/              # Login page
│   └── register/           # Registration page
├── components/             # React components
│   └── panels/             # Panel components
│       ├── focus/          # Focus mode (Calendar/Notes/Todo/Settings)
│       └── files/          # File panel
├── hooks/                  # React Hooks
│   ├── useChat.ts          # Chat core (SSE parsing, StreamBuffer)
│   ├── useFocusData.ts     # Focus mode data
│   └── useAuth.ts          # Auth state
├── lib/
│   ├── claude/             # Claude SDK integration
│   │   ├── process-manager.ts   # Core orchestration
│   │   ├── stream-parser.ts     # Message stream parser
│   │   ├── skills-dir.ts        # Skill directory management
│   │   ├── skill-hooks.ts       # Skill Hook system
│   │   └── gclaw-events.ts      # Global event bus
│   ├── channels/           # Channel adapters
│   │   ├── dingtalk.ts     # DingTalk
│   │   ├── feishu.ts       # Feishu (Lark)
│   │   └── wechat.ts       # WeChat
│   └── store/              # Data persistence
├── skills/                 # Built-in skills
├── scripts/                # Build/deploy scripts
├── src-tauri/              # Tauri desktop app
└── data/                   # Runtime data (gitignored)
```

## Core Data Flow

```
Browser React UI
    │ SSE
    ▼
/api/chat/stream
    │
    ▼
Claude Agent SDK query()
    │ AsyncIterable<SDKMessage>
    ▼
stream-parser.ts → ParsedEvent
    │ SSE push
    ▼
Frontend useChat hook parses & updates
    │
    ▼
Messages persisted to data/projects/{id}/messages.json
```

## Built-in Skills

| Skill | Description |
|-------|-------------|
| auto-memory-manager | Automatic memory management |
| baidu-search | Baidu search integration |
| find-skills | Skill discovery and search |
| gclaw-api | GClaw API invocation tool |
| obsidian | Obsidian notes integration |
| prompt-engineering-expert | Prompt engineering expert |
| skill-creator | Skill creation wizard |
| summarize | Content summarization |
| tauri-cross-platform-build | Tauri cross-platform build |
| tencent-docs | Tencent Docs integration |
| tencent-meeting-skill | Tencent Meeting integration |
| wechat-toolkit | WeChat toolkit |
| xiaohongshu-mcp | Xiaohongshu MCP |
| agent-browser | Browser automation |
| self-improving-agent | Self-improving agent |
| skill-vetter | Skill review and vetting |

## Deployment

### Web Deployment

```bash
npm run deploy:build   # Build production version
npm run start:prod     # Start production server
```

### Desktop Build

```bash
npm run tauri:build    # Build installer for current platform
```

Supported build targets: macOS (DMG/App), Windows (MSI/EXE), Linux (AppImage/DEB).

## License

MIT
