# HTML 可视化编辑器实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 HtmlEditor 中集成 GrapeJS 可视化编辑模式，支持所见即所得编辑和选中元素发送到聊天会话。

**Architecture:** 新增 `visual` 模式替换现有 iframe 预览，使用 `@grapesjs/react` v2 自定义 UI 模式。通过 `onSendToChat` prop 将选中元素发送到聊天。GrapeJS 通过 dynamic import 按需加载。

**Tech Stack:** GrapeJS v0.22.16、@grapesjs/react v2.0.0、React 19、Next.js 15

**Design doc:** `docs/superpowers/specs/2026-05-11-visual-html-editor-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `components/panels/files/visual-editor.tsx` | GrapeJS 可视化编辑器组件（属性面板 + 画布 + 发送到 AI） |
| Modify | `components/panels/files/editors.tsx:23-88` | HtmlEditor 添加 `visual` 模式和 `onSendToChat` prop |
| Modify | `components/panels/FilesPanel.tsx:1571-1578` | 传递 `onSendToChat` prop 到 HtmlEditor |
| Modify | `components/chat/ChatLayout.tsx:38,418-493` | 提供 `sendToChat` 并通过 Context 传递 |

---

## Chunk 1: 安装依赖 + 基础 VisualEditor 组件

### Task 1: 安装 GrapeJS 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 grapesjs 和 @grapesjs/react**

```bash
npm install grapesjs@^0.22.16 @grapesjs/react@^2.0.0
```

- [ ] **Step 2: 验证安装成功**

```bash
npx tsc --noEmit
```

Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: 添加 grapesjs 和 @grapesjs/react 依赖"
```

---

### Task 2: 创建 VisualEditor 基础组件

**Files:**
- Create: `components/panels/files/visual-editor.tsx`

这是核心组件，包含 GrapeJS 画布、自定义属性面板和「发送到 AI」功能。

- [ ] **Step 1: 创建 VisualEditor 组件骨架**

创建 `components/panels/files/visual-editor.tsx`：

```tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Send, Undo2, Redo2, ChevronLeft, ChevronRight, X } from 'lucide-react'

// GrapeJS 通过 dynamic import 按需加载
const GjsEditor = dynamic(() => import('@grapesjs/react').then(m => ({ default: m.default })), { ssr: false }) as any
const Canvas = dynamic(() => import('@grapesjs/react').then(m => ({ default: m.Canvas })), { ssr: false }) as any

interface VisualEditorProps {
  content: string
  onChange: (content: string) => void
  onSave: () => void
  onSendToChat?: (text: string) => void
  fileName: string
}

export function VisualEditor({ content, onChange, onSave, onSendToChat, fileName }: VisualEditorProps) {
  const editorRef = useRef<any>(null)
  const [showPanel, setShowPanel] = useState(false)
  const [selectedInfo, setSelectedInfo] = useState<{
    tagName: string
    attributes: Record<string, string>
    style: Record<string, string>
  } | null>(null)

  // GrapeJS 编辑器初始化回调
  const handleEditor = useCallback((editor: any) => {
    editorRef.current = editor

    // 加载 HTML 内容
    editor.setComponents(content)

    // 监听选中变化
    editor.on('component:selected', () => {
      const selected = editor.getSelected()
      if (selected) {
        setSelectedInfo({
          tagName: selected.get('tagName') || 'div',
          attributes: selected.getAttributes() || {},
          style: selected.getStyle() || {},
        })
        setShowPanel(true)
      }
    })

    editor.on('component:deselected', () => {
      setSelectedInfo(null)
    })

    // 监听内容变化，同步到外部
    editor.on('update', () => {
      const html = getFullHtml(editor)
      onChange(html)
    })

    // 注册自定义命令：发送给 AI
    if (onSendToChat) {
      editor.Commands.add('send-to-ai', {
        run: () => {
          const selected = editor.getSelected()
          if (!selected) return
          const selectedHtml = selected.toHTML()
          const style = selected.getStyle()
          const cssText = Object.entries(style)
            .map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}: ${v}`)
            .join(';\n')
          const truncated = selectedHtml.length > 2000
            ? selectedHtml.slice(0, 2000) + '\n...（已截断）'
            : selectedHtml
          const message = `请修改 HTML 文件 ${fileName} 中的以下内容：\n\n选中元素：\n\`\`\`html\n${truncated}\n\`\`\`\n\n${cssText ? `当前样式：\n\`\`\`css\n${cssText}\n\`\`\`\n\n` : ''}请帮我修改这个元素`
          onSendToChat(message)
        },
      })

      // 给选中组件添加自定义工具栏按钮
      editor.on('component:selected', () => {
        const selected = editor.getSelected()
        if (!selected) return
        const toolbar = selected.get('toolbar') || []
        const hasAiButton = toolbar.some((item: any) => item.command === 'send-to-ai')
        if (!hasAiButton) {
          selected.set({
            toolbar: [...toolbar, {
              attributes: { class: 'fa fa-send', title: '发送给 AI' },
              command: 'send-to-ai',
            }],
          })
        }
      })
    }
  }, [content, fileName, onSendToChat])

  // 外部内容更新时同步到编辑器
  const lastContentRef = useRef(content)
  useEffect(() => {
    if (editorRef.current && content !== lastContentRef.current) {
      editorRef.current.setComponents(content)
      lastContentRef.current = content
    }
  }, [content])

  // 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        onSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSave])

  const handleUndo = () => editorRef.current?.UndoManager?.undo()
  const handleRedo = () => editorRef.current?.UndoManager?.redo()

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-3 py-1 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>可视化编辑</span>
        <div className="flex items-center gap-1">
          <button onClick={handleUndo} className="p-1 rounded cursor-pointer hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text-secondary)' }} title="撤销">
            <Undo2 size={14} />
          </button>
          <button onClick={handleRedo} className="p-1 rounded cursor-pointer hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text-secondary)' }} title="重做">
            <Redo2 size={14} />
          </button>
        </div>
      </div>

      {/* 编辑区域 */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 属性面板 */}
        {showPanel && selectedInfo && (
          <div className="w-[240px] border-r overflow-y-auto shrink-0 p-3 text-xs" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium" style={{ color: 'var(--color-text)' }}>元素属性</span>
              <button onClick={() => setShowPanel(false)} className="cursor-pointer p-0.5 rounded hover:bg-[var(--color-bg-tertiary)]">
                <X size={12} style={{ color: 'var(--color-text-muted)' }} />
              </button>
            </div>
            <div className="space-y-2">
              <div>
                <label className="block mb-1" style={{ color: 'var(--color-text-muted)' }}>标签</label>
                <code className="px-1.5 py-0.5 rounded text-[11px]" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-primary)' }}>
                  &lt;{selectedInfo.tagName}&gt;
                </code>
              </div>
              {Object.keys(selectedInfo.style).length > 0 && (
                <div>
                  <label className="block mb-1" style={{ color: 'var(--color-text-muted)' }}>样式</label>
                  <div className="space-y-1">
                    {Object.entries(selectedInfo.style).map(([key, value]) => (
                      <PropertyRow key={key} editor={editorRef.current} propKey={key} value={value} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* GrapeJS 画布 */}
        <div className="flex-1">
          <GjsEditor
            grapesjs={require('grapesjs')}
            options={{
              height: '100%',
              storageManager: false,
              autoAdd: true,
              style: require('grapesjs/dist/css/grapes.min.css'),
            }}
            onEditor={handleEditor}
          >
            <Canvas className="h-full" />
          </GjsEditor>
        </div>
      </div>
    </div>
  )
}

// 属性编辑行
function PropertyRow({ editor, propKey, value }: { editor: any; propKey: string; value: string }) {
  const [editValue, setEditValue] = useState(value)

  const handleChange = (newVal: string) => {
    setEditValue(newVal)
    const selected = editor?.getSelected()
    if (selected) {
      selected.setStyle({ ...selected.getStyle(), [propKey]: newVal })
    }
  }

  const cssKey = propKey.replace(/[A-Z]/g, m => '-' + m.toLowerCase())
  return (
    <div className="flex items-center gap-1">
      <span className="shrink-0 text-[10px] w-16 truncate" style={{ color: 'var(--color-text-muted)' }}>{cssKey}</span>
      <input
        type="text"
        value={editValue}
        onChange={e => handleChange(e.target.value)}
        className="flex-1 min-w-0 px-1 py-0.5 rounded text-[11px] border"
        style={{ backgroundColor: 'var(--color-bg-tertiary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
      />
    </div>
  )
}

// 合成完整 HTML
function getFullHtml(editor: any): string {
  const html = editor.getHtml()
  const css = editor.getCss()
  if (!css) return html

  // 如果 HTML 中已有 <head>，将 CSS 注入到 </head> 前
  if (html.includes('</head>')) {
    return html.replace('</head>', `<style>${css}</style></head>`)
  }
  // 否则在 HTML 开头注入
  return `<style>${css}</style>${html}`
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 可能有 dynamic import 类型相关的小问题，修复后无错误。

- [ ] **Step 3: Commit**

```bash
git add components/panels/files/visual-editor.tsx
git commit -m "feat: 添加 VisualEditor 基础组件（GrapeJS 画布 + 属性面板）"
```

---

## Chunk 2: 集成到 HtmlEditor + 传递 sendToChat

### Task 3: 修改 HtmlEditor 添加 visual 模式

**Files:**
- Modify: `components/panels/files/editors.tsx:23-88`

- [ ] **Step 1: 修改 HtmlEditorProps 接口**

在 `editors.tsx` 第 23-28 行，扩展接口：

```typescript
// 修改前
interface HtmlEditorProps {
  content: string
  fileName: string
  onSave: (content: string) => void
  saving: boolean
}

// 修改后
interface HtmlEditorProps {
  content: string
  fileName: string
  onSave: (content: string) => void
  saving: boolean
  onSendToChat?: (text: string) => void
}
```

- [ ] **Step 2: 修改 HtmlEditor 组件**

在 `editors.tsx` 的 `HtmlEditor` 函数中：

1. 解构新增 prop：`{ ..., onSendToChat }`
2. 将 `mode` 类型扩展为 `'edit' | 'preview' | 'split' | 'visual'`
3. 在模式按钮组中新增「可视化」按钮
4. 在渲染区域新增 visual 模式的条件分支
5. 在 visual 模式下渲染 `<VisualEditor />`

关键修改点：

```typescript
// 第 30 行 - 解构新增 prop
export function HtmlEditor({ content, fileName, onSave, saving, onSendToChat }: HtmlEditorProps) {

// 第 32 行 - 扩展 mode 类型
const [mode, setMode] = useState<'edit' | 'preview' | 'split' | 'visual'>('split')

// 在文件顶部（第 2 行后）添加 dynamic import
const VisualEditor = dynamic(() => import('./visual-editor').then(m => ({ default: m.VisualEditor })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
    </div>
  ),
})
```

在工具栏按钮组（第 44-56 行）中，在「预览」按钮后添加：

```tsx
<button onClick={() => setMode('visual')} className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
  style={{ color: mode === 'visual' ? 'var(--color-primary)' : 'var(--color-text-secondary)', backgroundColor: mode === 'visual' ? 'var(--color-primary-subtle)' : 'transparent' }}>
  可视化
</button>
```

在渲染区域（第 63-85 行的 flex 容器中），在最后一个闭合 `)` 前添加 visual 模式分支：

```tsx
{mode === 'visual' && (
  <div className="w-full h-full">
    <VisualEditor
      content={editContent}
      onChange={setEditContent}
      onSave={handleSave}
      onSendToChat={onSendToChat}
      fileName={fileName}
    />
  </div>
)}
```

- [ ] **Step 3: 验证编译**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add components/panels/files/editors.tsx
git commit -m "feat: HtmlEditor 添加 visual 模式入口和 VisualEditor 集成"
```

---

### Task 4: 传递 sendToChat 从 ChatLayout 到 HtmlEditor

**Files:**
- Modify: `contexts/FilePreviewContext.tsx` — 添加 `sendToChat` 到 context
- Modify: `components/panels/FilesPanel.tsx:1571-1578` — 从 context 读取并传递
- Modify: `components/chat/ChatLayout.tsx:418-493` — 提供 sendToChat 实现

- [ ] **Step 1: 扩展 FilePreviewContext**

修改 `contexts/FilePreviewContext.tsx`，扩展 context 类型：

```typescript
// 修改前
const FilePreviewContext = createContext<{
  previewFile: (filePath: string) => void
} | null>(null)

// 修改后
const FilePreviewContext = createContext<{
  previewFile: (filePath: string) => void
  sendToChat?: (text: string) => void
} | null>(null)
```

- [ ] **Step 2: ChatLayout 提供 sendToChat**

在 `components/chat/ChatLayout.tsx` 中，修改 `FilePreviewProvider` 的 value：

找到约第 420 行的 `<FilePreviewProvider value={{ previewFile }}>`，改为：

```tsx
<FilePreviewProvider value={{ previewFile, sendToChat: handleSendWithRelay }}>
```

- [ ] **Step 3: FilesPanel 读取 sendToChat 并传递给 HtmlEditor**

在 `components/panels/FilesPanel.tsx` 中：

1. 在文件顶部添加 import：
```typescript
import { useFilePreview } from '@/contexts/FilePreviewContext'
```

2. 在组件函数体内（约第 230 行状态声明附近）添加：
```typescript
const filePreviewCtx = useFilePreview()
```

3. 找到 HtmlEditor 渲染位置（约第 1575 行），添加 `onSendToChat` prop：

```tsx
// 修改前
if (cat === 'html') return <HtmlEditor content={previewContent || ''} fileName={selectedFile.name} onSave={saveFile} saving={saving} />

// 修改后
if (cat === 'html') return <HtmlEditor content={previewContent || ''} fileName={selectedFile.name} onSave={saveFile} saving={saving} onSendToChat={filePreviewCtx?.sendToChat} />
```

- [ ] **Step 4: 验证编译**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add contexts/FilePreviewContext.tsx components/chat/ChatLayout.tsx components/panels/FilesPanel.tsx
git commit -m "feat: 连接 sendToChat 从 ChatLayout 到 HtmlEditor"
```

---

## Chunk 3: GrapeJS CSS 样式适配 + 测试验证

### Task 5: 适配 GrapeJS 默认 CSS 样式

**Files:**
- Possibly create/modify: `app/globals.css` or a dedicated GrapeJS override file

GrapeJS 的默认 UI（组件边框、控制点、工具条等）需要确保在项目的亮/暗模式下正确显示。

- [ ] **Step 1: 观察 GrapeJS 在项目中的样式表现**

启动 dev server，打开一个 HTML 文件，切换到「可视化」模式，观察：
- 画布是否正常渲染
- 选中元素的边框/控制点是否可见
- 组件工具条是否正常显示
- 属性面板的交互是否正常

```bash
npm run dev
```

- [ ] **Step 2: 如需样式修复，添加 GrapeJS CSS 覆盖**

在 `app/globals.css`（或 `visual-editor.tsx` 的 style 标签）中添加必要的覆盖。常见的修复点：

```css
/* GrapeJS 画布适配暗色模式 */
.gjs-cv-canvas {
  background: var(--color-bg-primary) !important;
}

/* 组件工具条在暗色模式下可见 */
.gjs-cm-cmd-btn {
  color: var(--color-text) !important;
}
```

- [ ] **Step 3: Commit（如有修改）**

```bash
git add -A
git commit -m "fix: GrapeJS 样式适配亮/暗模式"
```

---

### Task 6: 端到端验证

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 2: 功能验证清单**

验证以下功能：
- [ ] 打开 HTML 文件，默认显示 split 模式（与之前一致）
- [ ] 点击「可视化」按钮，切换到 GrapeJS 可视化模式
- [ ] HTML 内容正确加载到画布中
- [ ] 点击元素可选中，显示蓝色边框和控制点
- [ ] 左侧属性面板显示选中元素信息
- [ ] 修改属性面板中的样式值，画布实时更新
- [ ] 选中元素的浮动工具条包含「发送给 AI」按钮（图标）
- [ ] 点击「发送给 AI」，消息发送到聊天会话
- [ ] 模式切换（visual → edit → visual）内容不丢失
- [ ] 保存功能正常（Ctrl+S 或点击保存）
- [ ] 撤销/重做按钮正常工作

- [ ] **Step 3: 最终 lint 检查**

```bash
npm run lint
```

- [ ] **Step 4: Commit 所有最终修改**

```bash
git add -A
git commit -m "feat: HTML 可视化编辑器功能完成（GrapeJS 集成）"
```
