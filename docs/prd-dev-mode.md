# 产品需求文档：GClaw 自升级/开发模式

## 1. 产品概述

### 1.1 愿景
让 GClaw 具备"自我进化"能力——通过 AI 对话修改自身代码，实时预览，一键部署。同时支持从远程仓库拉取更新，实现 OTA 升级。

### 1.2 核心用户场景
1. **AI 自修改**：用户通过聊天让 Claude 修改 GClaw 源码，修改效果实时可见
2. **OTA 升级**：检测 GitHub 新版本，拉取代码，自动构建部署
3. **安全隔离**：所有修改在独立工作区进行，不影响当前运行版本

### 1.3 项目级别
Level 3（Complex Integration），涉及 5 个子系统，预估 12-20 个 Story。

## 2. 功能需求

### 2.1 开发模式开关
- **触发方式**：设置面板 UI 开关
- **状态流转**：OFF → INITIALIZING → ACTIVE → SHUTTING_DOWN → OFF
- **持久化**：`devModeEnabled` 存入 `GlobalSettings`

### 2.2 Git Worktree 工作区管理
- **创建**：启用开发模式时，`git worktree add .gclaw-dev-{branch}` 创建隔离工作区
- **基于分支**：默认基于当前 HEAD 创建新分支 `dev/{timestamp}`
- **文件隔离**：所有修改在 worktree 中进行，不影响主工作区
- **清理**：退出开发模式时，可选择保留或删除 worktree

### 2.3 AI 代码修改
- **工作目录**：开发模式下，自动创建指向 worktree 路径的开发项目
- **Claude SDK 集成**：利用现有项目 `cwd` 机制，SDK 的 Edit/Write/Bash 工具自然作用于 worktree
- **文件监控**：worktree 中的文件变更通过 dev server 热重载

### 2.4 应用内预览
- **iframe 嵌入**：在聊天界面右侧或独立面板嵌入 iframe
- **dev server**：在 worktree 中启动 `npm run dev`（不同端口）
- **实时刷新**：代码修改后 HMR 自动生效，iframe 实时反映
- **视图切换**：支持在"正常聊天"和"预览"之间切换，或分屏

### 2.5 OTA 远程更新
- **版本检测**：定期或手动检查 GitHub 最新 Release
- **代码拉取**：`git fetch` + `git pull` 或 `git rebase`
- **依赖更新**：`package.json` 变更时自动 `npm install`
- **构建部署**：拉取后自动构建并部署

### 2.6 构建与部署
- **构建流程**：在 worktree 中执行 `npm run build`
- **部署策略**：
  - Web 模式：停止当前 dev server，用新构建替换，重启
  - Tauri 模式：替换 standalone 产物，通过 Tauri 命令重启 server 进程
- **回滚支持**：部署前备份当前版本，失败时自动回滚

## 3. 非功能需求

### 3.1 安全性
- 开发模式仅管理员可用
- worktree 中的代码执行需要权限确认
- 部署操作需要用户二次确认

### 3.2 可靠性
- 任何操作失败不影响主应用运行
- worktree 创建/清理的原子性保证
- 进程管理的异常处理（dev server 崩溃自动重启）

### 3.3 性能
- worktree 创建 < 10 秒
- dev server 启动 < 30 秒
- 预览加载延迟 < 2 秒

## 4. 系统架构

### 4.1 新增模块

```
lib/dev-mode/
├── manager.ts          # DevModeManager 单例，状态机管理
├── worktree.ts         # Git worktree CRUD 操作
├── dev-server.ts       # Dev server 生命周期管理
├── deploy.ts           # 构建 + 部署 + 回滚
└── ota.ts              # 远程更新检查和拉取

app/api/dev-mode/
├── route.ts            # GET status / POST enable / DELETE disable
├── preview/route.ts    # GET 预览代理（解决 iframe 跨域）
├── deploy/route.ts     # POST 构建+部署
└── update/route.ts     # POST OTA 更新

components/dev-mode/
├── DevModePanel.tsx    # 开发模式设置面板（开关+配置）
└── PreviewPanel.tsx    # iframe 预览面板
```

### 4.2 核心数据流

```
┌──────────────────────────────────────────────────┐
│                  用户操作                          │
│  [开关] [聊天修改] [预览] [部署] [OTA更新]          │
└───────────┬──────────────────────────────────────┘
            │
            ▼
┌───────────────────────┐
│   API Layer            │
│   /api/dev-mode/*      │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐     ┌──────────────────┐
│   DevModeManager      │────▶│  WorktreeManager  │
│   (globalThis 单例)    │     │  git worktree 操作 │
│                        │     └──────────────────┘
│                        │     ┌──────────────────┐
│                        │────▶│  DevServerManager │
│                        │     │  npm run dev 管理  │
│                        │     └──────────────────┘
│                        │     ┌──────────────────┐
│                        │────▶│  DeployManager    │
│                        │     │  build + replace  │
│                        │     └──────────────────┘
│                        │     ┌──────────────────┐
│                        │────▶│  OTAUpdater       │
│                        │     │  git pull + build │
│                        │     └──────────────────┘
└───────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────┐
│              前端展示                              │
│  [PreviewPanel/iframe]  [DevModePanel/设置]       │
└──────────────────────────────────────────────────┘
```

### 4.3 AI 修改代码流

```
用户对话 → executeChat() → Claude SDK query()
  → SDK 工具调用（Edit/Write/Bash）
  → 工具操作在 worktree 目录执行（通过 cwd 参数）
  → Dev Server HMR 检测变更
  → PreviewPanel iframe 自动刷新
```

### 4.4 Tauri 集成

```rust
// 新增 Tauri 命令
#[tauri::command]
async fn restart_server(state: State<'_, ServerState>) -> Result<(), String> {
    // 杀死当前 server 进程
    // 重新 start_server()
    // 返回新端口
}

#[tauri::command]
async fn exec_command(cmd: String, cwd: String) -> Result<String, String> {
    // 执行 shell 命令并返回输出
}
```

### 4.5 数据模型扩展

```typescript
// GlobalSettings 新增字段
interface DevModeConfig {
  enabled: boolean
  worktreePath?: string
  devBranch?: string
  devServerPort?: number
  previewUrl?: string
}

// DevModeManager 状态
type DevModeState = 'off' | 'initializing' | 'active' | 'shutting_down'
```

## 5. 实施阶段（Sprint 规划）

### Sprint 1：基础设施（4-5 stories）
- S1.1 Git Worktree 管理器实现
- S1.2 Dev Mode Manager 核心状态机
- S1.3 API 路由：status / enable / disable
- S1.4 设置面板 UI 开关 + 状态展示
- S1.5 globalThis 单例 + 进程管理

### Sprint 2：开发服务器 + 预览（3-4 stories）
- S2.1 Dev Server Manager（启动/停止/健康检查）
- S2.2 预览面板 iframe 组件
- S2.3 预览代理路由（解决跨域）
- S2.4 聊天 + 预览分屏布局

### Sprint 3：AI 代码修改集成（3-4 stories）
- S3.1 开发模式项目自动创建（worktree cwd）
- S3.2 文件变更通知（worktree → 前端）
- S3.3 修改操作确认流程
- S3.4 变更摘要和 diff 展示

### Sprint 4：构建与部署（3-4 stories）
- S4.1 构建流程管理器
- S4.2 Tauri restart_server 命令
- S4.3 Web 模式部署（停止→替换→重启）
- S4.4 回滚机制

### Sprint 5：OTA 更新（2-3 stories）
- S5.1 远程版本检测
- S5.2 代码拉取 + 依赖更新
- S5.3 OTA 更新 UI + 进度展示

## 6. 技术风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| worktree 操作失败 | 开发模式无法启用 | 预检查 git 状态，清理残留 worktree |
| dev server 端口冲突 | 预览不可用 | 动态分配端口，重试机制 |
| 构建失败 | 部署中断 | 构建前校验，失败回滚 |
| Tauri 重启 server | 服务中断 | 优雅关闭 + 状态恢复 |
| npm install 失败 | 依赖缺失 | 使用国内镜像，重试机制 |

## 7. 与现有系统的兼容性

- **不影响现有功能**：开发模式是独立子系统，关闭时零侵入
- **复用现有基础设施**：项目系统、Git API、Tauri 更新机制
- **渐进式实施**：每个 Sprint 独立可用，可随时暂停
