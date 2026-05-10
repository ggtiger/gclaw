'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Send, Undo2, Redo2, X, ChevronLeft, ChevronRight } from 'lucide-react'

// --- Types ---

interface VisualEditorProps {
  content: string
  fileName: string
  onChange?: (html: string) => void
  onSave: (html: string) => void
  saving?: boolean
  onSendToChat?: (data: { html: string; css: string; element: string }) => void
}

interface SelectedInfo {
  tagName: string
  classes: string
  id: string
  style: Record<string, string>
}

// --- Dynamic imports (SSR disabled) ---

const GjsEditor = dynamic(
  () => import('@grapesjs/react').then((mod) => mod.default),
  { ssr: false }
)

const GjsCanvas = dynamic(
  () => import('@grapesjs/react').then((mod) => mod.Canvas),
  { ssr: false }
)

// --- Load grapesjs core lazily ---

function useGrapesJS() {
  const [gjs, setGjs] = useState<typeof import('grapesjs').default | null>(null)
  useEffect(() => {
    import('grapesjs').then((mod) => setGjs(() => mod.default))
  }, [])
  return gjs
}

// --- Property Panel ---

function PropertyPanel({
  selected,
  onClose,
  onStyleChange,
}: {
  selected: SelectedInfo
  onClose: () => void
  onStyleChange: (prop: string, value: string) => void
}) {
  const editableProps = [
    'color',
    'background-color',
    'font-size',
    'font-weight',
    'text-align',
    'width',
    'height',
    'margin',
    'padding',
    'border',
    'border-radius',
    'display',
  ]

  return (
    <div
      className="flex flex-col h-full shrink-0"
      style={{
        width: 240,
        borderLeft: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b shrink-0"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
          属性
        </span>
        <button
          onClick={onClose}
          className="p-0.5 rounded cursor-pointer hover:bg-[var(--color-bg-tertiary)]"
          style={{ color: 'var(--color-text-muted)' }}
          title="关闭"
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-3 py-2 space-y-1.5 text-xs overflow-auto flex-1">
        <div>
          <label className="block mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
            标签
          </label>
          <code
            className="block px-2 py-1 rounded text-xs"
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              color: 'var(--color-text)',
            }}
          >
            {selected.tagName}
          </code>
        </div>

        {selected.id && (
          <div>
            <label className="block mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
              ID
            </label>
            <code
              className="block px-2 py-1 rounded text-xs"
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text)',
              }}
            >
              #{selected.id}
            </code>
          </div>
        )}

        {selected.classes && (
          <div>
            <label className="block mb-0.5" style={{ color: 'var(--color-text-muted)' }}>
              类名
            </label>
            <code
              className="block px-2 py-1 rounded text-xs break-all"
              style={{
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text)',
              }}
            >
              .{selected.classes.split(' ').join(' .')}
            </code>
          </div>
        )}

        <div
          className="pt-2 mt-2 border-t"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <label className="block mb-1.5 font-medium" style={{ color: 'var(--color-text)' }}>
            样式
          </label>
          {editableProps.map((prop) => (
            <div key={prop} className="mb-1.5">
              <label
                className="block mb-0.5"
                style={{ color: 'var(--color-text-muted)', fontSize: 10 }}
              >
                {prop}
              </label>
              <input
                type="text"
                value={selected.style[prop] || ''}
                onChange={(e) => onStyleChange(prop, e.target.value)}
                placeholder="--"
                className="w-full px-2 py-1 rounded text-xs border outline-none min-w-0"
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Main VisualEditor ---

export function VisualEditor({
  content,
  fileName,
  onChange,
  onSave,
  saving,
  onSendToChat,
}: VisualEditorProps) {
  const grapesjsLib = useGrapesJS()
  const editorRef = useRef<ReturnType<typeof import('grapesjs').default.init> | null>(null)
  const contentRef = useRef(content)
  const onSendToChatRef = useRef(onSendToChat)
  onSendToChatRef.current = onSendToChat
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const [showPropertyPanel, setShowPropertyPanel] = useState(false)
  const [selectedInfo, setSelectedInfo] = useState<SelectedInfo | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // Keep contentRef in sync
  contentRef.current = content

  const synthesizeHtml = useCallback((html: string, css: string): string => {
    if (!css) return html
    return `<style>\n${css}\n</style>\n${html}`
  }, [])

  const getFullHtml = useCallback((): string => {
    const editor = editorRef.current
    if (!editor) return contentRef.current
    const html = editor.getHtml() || ''
    const css = editor.getCss() || ''
    return synthesizeHtml(html, css)
  }, [synthesizeHtml])

  const handleSave = useCallback(() => {
    onSave(getFullHtml())
  }, [onSave, getFullHtml])

  // Sync external content changes into editor
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const currentHtml = editor.getHtml() || ''
    const currentCss = editor.getCss() || ''
    const currentFull = synthesizeHtml(currentHtml, currentCss)
    if (currentFull !== content) {
      editor.setComponents(content)
    }
  }, [content, synthesizeHtml])

  // Ctrl+S handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  const updateUndoRedoState = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    setCanUndo(editor.UndoManager.hasUndo())
    setCanRedo(editor.UndoManager.hasRedo())
  }, [])

  const handleUndo = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.UndoManager.undo()
    updateUndoRedoState()
  }, [updateUndoRedoState])

  const handleRedo = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.UndoManager.redo()
    updateUndoRedoState()
  }, [updateUndoRedoState])

  const handleStyleChange = useCallback(
    (prop: string, value: string) => {
      const editor = editorRef.current
      if (!editor) return
      const selected = editor.getSelected()
      if (!selected) return
      const rawStyle = selected.getStyle()
      const currentStyle: Record<string, string> = {}
      for (const [k, v] of Object.entries(rawStyle)) {
        if (typeof v === 'string') currentStyle[k] = v
      }
      if (value) {
        currentStyle[prop] = value
      } else {
        delete currentStyle[prop]
      }
      selected.setStyle(currentStyle)
      setSelectedInfo((prev) =>
        prev ? { ...prev, style: { ...currentStyle } } : null
      )
    },
    []
  )

  const handleEditorInit = useCallback(
    (editor: ReturnType<typeof import('grapesjs').default.init>) => {
      editorRef.current = editor

      // Load initial content
      if (contentRef.current) {
        editor.setComponents(contentRef.current)
      }

      // Register 'send-to-ai' command
      editor.Commands.add('send-to-ai', {
        run(ed: typeof editor) {
          const sel = ed.getSelected()
          if (!sel) return
          const sendFn = onSendToChatRef.current
          if (!sendFn) return
          const html = sel.toHTML()
          const css = ed.getCss() || ''
          const elStyle = sel.getStyle()
          const inlineCss = elStyle && Object.keys(elStyle).length > 0
            ? Object.entries(elStyle)
                .map(([k, v]) => `${k}: ${v}`)
                .join('; ')
            : ''
          sendFn({
            html: ed.getHtml() || '',
            css,
            element: inlineCss
              ? `<style>${sel.get('tagName')}{${inlineCss}}</style>\n${html}`
              : html,
          })
        },
      })

      // On component selected: update toolbar + property panel
      editor.on('component:selected', (component: any) => {
        if (!component) return

        // Add 'send-to-ai' toolbar button if not present
        if (onSendToChatRef.current) {
          const toolbar: any[] = component.get('toolbar') || []
          const hasSendBtn = toolbar.some((btn: any) => btn.command === 'send-to-ai')
          if (!hasSendBtn) {
            component.set({
              toolbar: [
                ...toolbar,
                {
                  attributes: {
                    class: 'fa fa-paper-plane',
                    title: '发送到 AI',
                  },
                  command: 'send-to-ai',
                },
              ],
            })
          }
        }

        // Gather selected component info
        const attrs = component.getAttributes()
        const classesArr = component.getClasses?.() || []
        const classes = classesArr
          .map((c: any) => (typeof c === 'string' ? c : c.get?.('name') || ''))
          .join(' ')

        const rawStyle = component.getStyle() || {}
        const style: Record<string, string> = {}
        for (const [k, v] of Object.entries(rawStyle)) {
          if (typeof v === 'string') style[k] = v
        }

        setSelectedInfo({
          tagName: component.get('tagName') || 'div',
          classes,
          id: attrs?.id || '',
          style,
        })
        setShowPropertyPanel(true)
      })

      // Track undo/redo availability
      editor.on('undo', updateUndoRedoState)
      editor.on('redo', updateUndoRedoState)
      editor.on('component:update', updateUndoRedoState)

      // Notify parent on content change
      if (onChangeRef.current) {
        editor.on('component:update', () => {
          const fn = onChangeRef.current
          if (!fn) return
          const html = editor.getHtml() || ''
          const css = editor.getCss() || ''
          fn(synthesizeHtml(html, css))
        })
      }
    },
    [synthesizeHtml, updateUndoRedoState]
  )

  if (!grapesjsLib) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <span className="text-sm">加载编辑器...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-1 border-b shrink-0"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-1">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            可视化
          </span>
          <span
            className="text-[10px] px-1 rounded"
            style={{
              backgroundColor: 'var(--color-primary-subtle)',
              color: 'var(--color-primary)',
            }}
          >
            {fileName}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className="p-1 rounded cursor-pointer disabled:opacity-30 hover:bg-[var(--color-bg-tertiary)]"
            style={{ color: 'var(--color-text-secondary)' }}
            title="撤销"
          >
            <Undo2 size={14} />
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className="p-1 rounded cursor-pointer disabled:opacity-30 hover:bg-[var(--color-bg-tertiary)]"
            style={{ color: 'var(--color-text-secondary)' }}
            title="重做"
          >
            <Redo2 size={14} />
          </button>
          {onSendToChat && (
            <button
              onClick={() => editorRef.current?.runCommand('send-to-ai')}
              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded cursor-pointer ml-1"
              style={{ color: 'var(--color-primary)' }}
              title="发送当前选中元素到 AI 对话"
            >
              <Send size={13} /> 发送到 AI
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded cursor-pointer ml-1"
            style={{ color: 'var(--color-primary)' }}
            title="Ctrl+S 保存"
          >
            {saving ? '...' : '保存'}
          </button>
          <button
            onClick={() => setShowPropertyPanel((v) => !v)}
            className="p-1 rounded cursor-pointer hover:bg-[var(--color-bg-tertiary)] ml-1"
            style={{
              color: showPropertyPanel
                ? 'var(--color-primary)'
                : 'var(--color-text-secondary)',
            }}
            title={showPropertyPanel ? '关闭属性面板' : '打开属性面板'}
          >
            {showPropertyPanel ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </div>

      {/* Editor + Property Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* GrapeJS Canvas */}
        <div className="flex-1 overflow-hidden">
          <GjsEditor
            grapesjs={grapesjsLib}
            grapesjsCss="https://unpkg.com/grapesjs/dist/css/grapes.min.css"
            options={{
              fromElement: false,
              autorender: true,
              avoidInlineStyle: true,
              showToolbar: true,
              noticeOnUnload: false,
              canvasCss: '* { box-sizing: border-box; } body { margin: 0; min-height: 100vh; }',
            }}
            onEditor={handleEditorInit}
            style={{ height: '100%' }}
          >
            <GjsCanvas />
          </GjsEditor>
        </div>

        {/* Property Panel */}
        {showPropertyPanel && selectedInfo && (
          <PropertyPanel
            selected={selectedInfo}
            onClose={() => setShowPropertyPanel(false)}
            onStyleChange={handleStyleChange}
          />
        )}
      </div>
    </div>
  )
}
