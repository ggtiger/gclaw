# AI 助理图标与名称配置 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在项目设置中支持配置 AI 助理的图标和名称，让不同项目可以有不同的助理身份。

**Architecture:** 在 ProjectSettings 类型新增 assistantName/assistantIcon 字段，新建 useAssistantIdentity hook 统一读取配置并映射到 lucide 组件，替换所有硬编码的 "AI助理" 和 Bot 图标。设置 UI 在 ProjectSettingsPanel 顶部添加助理设置卡片。

**Tech Stack:** React 19, TypeScript, lucide-react, Tailwind CSS

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `types/skills.ts` | ProjectSettings 类型新增 assistantName、assistantIcon 字段 |
| Modify | `types/skills.ts` | DEFAULT_PROJECT 新增默认值 |
| Create | `hooks/useAssistantIdentity.ts` | 统一读取助理身份配置，映射 iconName → LucideIcon |
| Modify | `components/settings/ProjectSettingsPanel.tsx` | 添加助理设置 UI（名称输入框 + 图标选择器） |
| Modify | `components/chat/MessageBubble.tsx` | 使用 hook 替换硬编码 Bot 图标和 "AI助理" |
| Modify | `components/chat/ChatPanel.tsx` | 使用 hook 替换硬编码 Bot 图标和 "AI助理" |

---

## Chunk 1: Data Layer + Hook

### Task 1: 扩展 ProjectSettings 类型

**Files:**
- Modify: `types/skills.ts:70-89`

- [ ] **Step 1: 在 ProjectSettings 接口添加新字段**

在 `types/skills.ts` 第78行（`providerId` 字段后）添加：

```typescript
  /** AI 助理名称 */
  assistantName?: string
  /** AI 助理图标（lucide 图标名） */
  assistantIcon?: string
```

- [ ] **Step 2: 在 DEFAULT_PROJECT 添加默认值**

在 `types/skills.ts` 的 `DEFAULT_PROJECT` 对象中（第88行后）添加：

```typescript
  assistantName: undefined,
  assistantIcon: undefined,
```

- [ ] **Step 3: 验证类型检查通过**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add types/skills.ts
git commit -m "feat: add assistantName/assistantIcon to ProjectSettings type"
```

### Task 2: 创建 useAssistantIdentity hook

**Files:**
- Create: `hooks/useAssistantIdentity.ts`

- [ ] **Step 1: 编写 hook**

```typescript
'use client'

import { useMemo } from 'react'
import { Bot, Sparkles, Brain, Wand2, Cpu, MessageSquare, GraduationCap, Stethoscope, Code, Palette, Music, Heart, type LucideIcon } from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  Bot,
  Sparkles,
  Brain,
  Wand2,
  Cpu,
  MessageSquare,
  GraduationCap,
  Stethoscope,
  Code,
  Palette,
  Music,
  Heart,
}

export const AVAILABLE_ICONS = Object.keys(ICON_MAP)

export const DEFAULT_ASSISTANT_NAME = 'AI助理'
export const DEFAULT_ASSISTANT_ICON = 'Bot'

export function useAssistantIdentity(settings: { assistantName?: string; assistantIcon?: string } | null | undefined) {
  return useMemo(() => {
    const name = settings?.assistantName?.trim() || DEFAULT_ASSISTANT_NAME
    const iconName = settings?.assistantIcon || DEFAULT_ASSISTANT_ICON
    const Icon = ICON_MAP[iconName] || Bot
    return { name, iconName, Icon }
  }, [settings?.assistantName, settings?.assistantIcon])
}
```

- [ ] **Step 2: 验证类型检查通过**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add hooks/useAssistantIdentity.ts
git commit -m "feat: add useAssistantIdentity hook"
```

---

## Chunk 2: Settings UI

### Task 3: 在 ProjectSettingsPanel 添加助理设置 UI

**Files:**
- Modify: `components/settings/ProjectSettingsPanel.tsx`

- [ ] **Step 1: 添加 import**

在文件顶部 import 区域添加：

```typescript
import { useAssistantIdentity, AVAILABLE_ICONS } from '@/hooks/useAssistantIdentity'
import { Bot, Sparkles, Brain, Wand2, Cpu, MessageSquare, GraduationCap, Stethoscope, Code, Palette, Music, Heart } from 'lucide-react'
```

- [ ] **Step 2: 在组件内部添加 hook 调用**

在 `ProjectSettingsPanel` 函数内 `const { toast } = useToast()` 之后添加：

```typescript
  const { name: assistantName, iconName: assistantIcon, Icon: AssistantIcon } = useAssistantIdentity(settings)
```

- [ ] **Step 3: 添加图标映射常量**

在 import 区域后添加：

```typescript
const ICON_COMPONENTS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Bot, Sparkles, Brain, Wand2, Cpu, MessageSquare, GraduationCap, Stethoscope, Code, Palette, Music, Heart,
}
```

- [ ] **Step 4: 在 fetchSettings 中读取新字段**

修改 `fetchSettings` 回调中 `setSettings({...})` 调用，添加两个字段：

```typescript
      setSettings({
        model: data.model || '',
        effort: data.effort || 'medium',
        sessionId: data.sessionId || '',
        cwd: data.cwd || '',
        dangerouslySkipPermissions: data.dangerouslySkipPermissions ?? true,
        systemPrompt: data.systemPrompt || '',
        providerId: data.providerId || '',
        assistantName: data.assistantName || undefined,
        assistantIcon: data.assistantIcon || undefined,
      })
```

- [ ] **Step 5: 添加助理设置 UI 卡片**

在 `return` 语句的 `<div className="p-4 flex flex-col gap-3">` 内，在供应商卡片之前（第120行前），添加助理设置卡片：

```tsx
      {/* 助理设置 */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center bg-purple-500/10 dark:bg-purple-500/20">
            <AssistantIcon size={14} className="text-purple-600 dark:text-purple-400" />
          </div>
          <label className="text-xs text-gray-500 dark:text-gray-400">
            助理设置
          </label>
        </div>
        <div className="space-y-2">
          {/* 名称 */}
          <input
            type="text"
            value={settings.assistantName || ''}
            onChange={e => updateField('assistantName', e.target.value || undefined)}
            placeholder="AI助理"
            className="w-full text-xs bg-gray-100 dark:bg-white/10 rounded-lg px-3 py-1.5 outline-none"
          />
          {/* 图标选择器 */}
          <div className="grid grid-cols-6 gap-1">
            {AVAILABLE_ICONS.map(name => {
              const Comp = ICON_COMPONENTS[name]
              const selected = (settings.assistantIcon || 'Bot') === name
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => updateField('assistantIcon', name)}
                  className={`flex items-center justify-center p-1.5 rounded-lg cursor-pointer transition-colors ${
                    selected
                      ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400'
                      : 'bg-gray-50 dark:bg-white/5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'
                  }`}
                  title={name}
                >
                  <Comp size={16} />
                </button>
              )
            })}
          </div>
        </div>
      </div>
```

- [ ] **Step 6: 验证类型检查通过**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 7: Commit**

```bash
git add components/settings/ProjectSettingsPanel.tsx
git commit -m "feat: add assistant identity settings UI to project settings"
```

---

## Chunk 3: Consumer Replacements

### Task 4: 替换 MessageBubble 中的硬编码

**Files:**
- Modify: `components/chat/MessageBubble.tsx`

- [ ] **Step 1: 添加 import**

在文件顶部 import 区域添加：

```typescript
import { useAssistantIdentity } from '@/hooks/useAssistantIdentity'
```

- [ ] **Step 2: 在组件内调用 hook**

在 `MessageBubble` memo 函数组件内部（第37行附近），在 `const source = ...` 之后添加：

```typescript
  const { name: assistantName, Icon: AssistantIcon } = useAssistantIdentity(null)
```

注意：MessageBubble 没有 settings 对象，需要一个方式获取设置。因为 MessageBubble 已有 `projectId` prop，需要改为传入 assistantName 和 assistantIcon 作为 props。

**修正方案**：通过 props 传入，而非在 MessageBubble 内调用 hook。

- [ ] **Step 2（修正）: 扩展 MessageBubbleProps**

在 `MessageBubbleProps` 接口中添加：

```typescript
  assistantName?: string
  assistantIcon?: string
```

- [ ] **Step 3: 在组件内调用 hook**

```typescript
  const { name: assistantDisplayName, Icon: AssistantIcon } = useAssistantIdentity(
    assistantName || assistantIcon ? { assistantName, assistantIcon } : null
  )
```

- [ ] **Step 4: 替换头像区域的硬编码**

第109-116行，将 assistant 头像替换为：

```tsx
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isUser ? (sourceConfig?.bg || 'bg-purple-500/15') : 'bg-purple-500/10 dark:bg-purple-500/20'}`}>
          {isUser
            ? SourceIcon
              ? <SourceIcon size={15} className={sourceConfig?.color || 'text-purple-600 dark:text-purple-400'} />
              : <User size={15} className="text-purple-600 dark:text-purple-400" />
            : <AssistantIcon size={15} className="text-purple-600 dark:text-purple-400" />
          }
        </div>
```

- [ ] **Step 5: 替换名称的硬编码**

第123行，将 `'AI助理'` 替换为：

```tsx
{isUser ? (message.sourceName || sourceConfig?.label || '你') : assistantDisplayName}
```

- [ ] **Step 6: 验证类型检查通过**

Run: `npx tsc --noEmit`
Expected: 可能有 ChatPanel 调用处需要更新 props

- [ ] **Step 7: Commit**

```bash
git add components/chat/MessageBubble.tsx
git commit -m "feat: use configurable assistant name and icon in MessageBubble"
```

### Task 5: 替换 ChatPanel 中的硬编码

**Files:**
- Modify: `components/chat/ChatPanel.tsx`

- [ ] **Step 1: 添加 import**

在顶部 import 区域添加：

```typescript
import { useAssistantIdentity } from '@/hooks/useAssistantIdentity'
```

- [ ] **Step 2: 在组件内调用 hook**

在 ChatPanel 组件函数内，找到 `projectId` 相关位置，添加：

```typescript
  const { name: assistantName, Icon: AssistantIcon } = useAssistantIdentity(null)
```

同样的问题：ChatPanel 没有直接持有 settings。需要在 ChatPanel 层级获取设置。

**方案**: 在 ChatPanel 中 fetch settings，或在 ChatLayout 层传入 props。考虑到 ChatLayout 已经有项目上下文，从 ChatLayout 传入 props 最简洁。

需要确认 ChatPanel 的 props 接口和 ChatLayout 如何传递数据。

- [ ] **Step 2（修正）: 添加 props**

在 `ChatPanelProps` 接口添加：

```typescript
  assistantName?: string
  assistantIcon?: string
```

在 ChatPanel 函数参数解构中添加这两个 props，并在组件内调用：

```typescript
  const { name: assistantDisplayName, Icon: AssistantIcon } = useAssistantIdentity(
    assistantName || assistantIcon ? { assistantName, assistantIcon } : null
  )
```

- [ ] **Step 3: 替换流式输出头像（第465-466行）**

将 `<Bot size={16} ... />` 替换为 `<AssistantIcon size={16} className="text-purple-600 dark:text-purple-400" />`

- [ ] **Step 4: 替换流式输出名称（第471行）**

将 `AI助理` 替换为 `{assistantDisplayName}`

- [ ] **Step 5: 替换等待响应头像（第487-488行）**

将 `<Bot size={16} ... />` 替换为 `<AssistantIcon size={16} className="text-purple-600 dark:text-purple-400" />`

- [ ] **Step 6: 替换等待响应名称（第493行）**

将 `AI助理` 替换为 `{assistantDisplayName}`

- [ ] **Step 7: 传递 props 到 MessageBubble**

在 ChatPanel 中渲染 `<MessageBubble>` 的地方（搜索 `assistantName` 和 `assistantIcon`），添加 props：

```tsx
<MessageBubble
  ...existing props...
  assistantName={assistantName}
  assistantIcon={assistantIcon}
/>
```

- [ ] **Step 8: 验证类型检查通过**

Run: `npx tsc --noEmit`
Expected: ChatLayout 可能需要更新以传递 props

- [ ] **Step 9: Commit**

```bash
git add components/chat/ChatPanel.tsx
git commit -m "feat: use configurable assistant name and icon in ChatPanel"
```

### Task 6: 从 ChatLayout 传递助理设置到 ChatPanel

**Files:**
- Modify: `components/chat/ChatLayout.tsx`

- [ ] **Step 1: 添加 import**

```typescript
import { useAssistantIdentity } from '@/hooks/useAssistantIdentity'
```

- [ ] **Step 2: 获取项目设置**

在 ChatLayout 组件中找到现有获取设置的逻辑。如果没有，需要添加 fetch 调用获取项目设置中的 assistantName 和 assistantIcon。查看 ChatLayout 是否已有 settings 状态。

- [ ] **Step 3: 调用 hook 并传递给 ChatPanel**

将 assistantName 和 assistantIcon 通过 props 传递给 `<ChatPanel>` 组件：

```tsx
<ChatPanel
  ...existing props...
  assistantName={settings?.assistantName}
  assistantIcon={settings?.assistantIcon}
/>
```

- [ ] **Step 4: 验证类型检查通过**

Run: `npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add components/chat/ChatLayout.tsx
git commit -m "feat: pass assistant identity settings from ChatLayout to ChatPanel"
```

---

## Chunk 4: Verification

### Task 7: 全量验证

- [ ] **Step 1: 运行 TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 2: 运行 ESLint**

Run: `npm run lint`
Expected: 无新 warning

- [ ] **Step 3: 运行开发服务器验证页面加载**

Run: `npm run dev`
Expected: 无编译错误，页面正常加载

- [ ] **Step 4: 手动功能测试清单**

1. 打开项目设置面板，确认"助理设置"卡片出现在顶部
2. 修改名称，保存，返回聊天确认消息气泡显示新名称
3. 选择不同图标，保存，确认消息气泡和流式输出显示新图标
4. 清空名称，保存，确认回退到默认 "AI助理"
5. 切换到不同项目，确认各项目助理身份独立
