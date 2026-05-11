'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Undo2, Redo2, X, ChevronLeft, ChevronRight, Loader2, RefreshCw, Minimize2 } from 'lucide-react'
import 'grapesjs/dist/css/grapes.min.css'

// 隐藏 GrapeJS 默认面板占位，画布占满
const HIDE_PANELS_CSS = `
.gjs-pn-panels { display: none !important; }
.gjs-cv-canvas { top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; width: auto !important; height: auto !important; }
.gjs-editor { height: 100% !important; position: relative !important; overflow: hidden !important; }
`

// --- Types ---

interface VisualEditorProps {
  content: string
  fileName: string
  onChange?: (html: string) => void
  onSave: (html: string) => void
  saving?: boolean
  onSendToChat?: (data: { html: string; css: string; element: string; instruction: string; fileName: string }) => void
  onExitFullscreen?: () => void
}

interface SelectedInfo {
  tagName: string
  classes: string
  id: string
  style: Record<string, string>
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
    'color', 'background-color', 'font-size', 'font-weight', 'text-align',
    'width', 'height', 'margin', 'padding', 'border', 'border-radius', 'display',
  ]

  return (
    <div
      className="flex flex-col h-full shrink-0"
      style={{ width: 240, borderLeft: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>属性</span>
        <button onClick={onClose} className="p-0.5 rounded cursor-pointer hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text-muted)' }} title="关闭">
          <X size={14} />
        </button>
      </div>
      <div className="px-3 py-2 space-y-1.5 text-xs overflow-auto flex-1">
        <div>
          <label className="block mb-0.5" style={{ color: 'var(--color-text-muted)' }}>标签</label>
          <code className="block px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text)' }}>{selected.tagName}</code>
        </div>
        {selected.id && (
          <div>
            <label className="block mb-0.5" style={{ color: 'var(--color-text-muted)' }}>ID</label>
            <code className="block px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text)' }}>#{selected.id}</code>
          </div>
        )}
        {selected.classes && (
          <div>
            <label className="block mb-0.5" style={{ color: 'var(--color-text-muted)' }}>类名</label>
            <code className="block px-2 py-1 rounded text-xs break-all" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text)' }}>.{selected.classes.split(' ').join(' .')}</code>
          </div>
        )}
        <div className="pt-2 mt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <label className="block mb-1.5 font-medium" style={{ color: 'var(--color-text)' }}>样式</label>
          {editableProps.map((prop) => (
            <div key={prop} className="mb-1.5">
              <label className="block mb-0.5" style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>{prop}</label>
              <input
                type="text"
                value={selected.style[prop] || ''}
                onChange={(e) => onStyleChange(prop, e.target.value)}
                placeholder="--"
                className="w-full px-2 py-1 rounded text-xs border outline-none min-w-0"
                style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
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
  onExitFullscreen,
}: VisualEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<any>(null)
  const grapesjsModuleRef = useRef<any>(null)
  const onSendToChatRef = useRef(onSendToChat)
  onSendToChatRef.current = onSendToChat
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [gjsReady, setGjsReady] = useState(false)
  const [showPropertyPanel, setShowPropertyPanel] = useState(false)
  const [selectedInfo, setSelectedInfo] = useState<SelectedInfo | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  // 发送到 AI 的指令输入框
  const [aiPromptOpen, setAiPromptOpen] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiContext, setAiContext] = useState<{ html: string; css: string; element: string } | null>(null)
  const aiInputRef = useRef<HTMLInputElement>(null)
  const [editorKey, setEditorKey] = useState(0)

  const synthesizeHtml = useCallback((html: string, css: string): string => {
    if (!css) return html
    return `<style>\n${css}\n</style>\n${html}`
  }, [])

  // 从完整 HTML 中提取 <style> 内容，返回 { html, css, links, scripts }
  const parseHtml = useCallback((fullHtml: string) => {
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi
    const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/gi
    const scriptSrcRegex = /<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi

    const cssParts: string[] = []
    const links: string[] = []
    const scripts: string[] = []

    let match
    while ((match = styleRegex.exec(fullHtml)) !== null) {
      cssParts.push(match[1].trim())
    }
    while ((match = linkRegex.exec(fullHtml)) !== null) {
      links.push(match[1])
    }
    while ((match = scriptSrcRegex.exec(fullHtml)) !== null) {
      scripts.push(match[1])
    }

    // 移除 head 中的 style/link/script，保留 body
    let html = fullHtml
    html = html.replace(styleRegex, '')
    html = html.replace(linkRegex, '')
    html = html.replace(scriptSrcRegex, '')

    return { html: html.trim(), css: cssParts.join('\n'), links, scripts }
  }, [])

  const getFullHtml = useCallback((): string => {
    const editor = editorRef.current
    if (!editor) return content
    return synthesizeHtml(editor.getHtml() || '', editor.getCss() || '')
  }, [synthesizeHtml, content])

  const handleSave = useCallback(() => {
    onSave(getFullHtml())
  }, [onSave, getFullHtml])

  // 加载 grapesjs 模块
  useEffect(() => {
    import('grapesjs').then((mod) => {
      grapesjsModuleRef.current = mod.default
      setGjsReady(true)
    })
  }, [])

  // 初始化 / 销毁编辑器
  useEffect(() => {
    if (!gjsReady || !containerRef.current || !grapesjsModuleRef.current) return

    const grapesjs = grapesjsModuleRef.current

    const editor = grapesjs.init({
      container: containerRef.current,
      fromElement: false,
      height: '100%',
      autorender: true,
      avoidInlineStyle: false,
      noticeOnUnload: false,
      storageManager: false,
      canvasCss: '* { box-sizing: border-box; }',
      panels: { defaults: [] },
      deviceManager: {},
      selectorManager: {},
      styleManager: {},
      layerManager: {},
      showToolbar: true,
    })

    editorRef.current = editor

    // 注入外部资源到画布 iframe
    const injectResources = (htmlContent: string) => {
      const { html, css, links, scripts } = parseHtml(htmlContent)
      editor.setComponents(html)
      if (css) editor.setStyle(css)

      // 注入外部 CSS 和 JS
      const canvasDoc = editor.Canvas.getDocument()
      if (canvasDoc && canvasDoc.head) {
        for (const href of links) {
          // 避免重复注入
          if (canvasDoc.querySelector(`link[href="${href}"]`)) continue
          const link = canvasDoc.createElement('link')
          link.rel = 'stylesheet'
          link.href = href
          canvasDoc.head.appendChild(link)
        }
        for (const src of scripts) {
          if (canvasDoc.querySelector(`script[src="${src}"]`)) continue
          const script = canvasDoc.createElement('script')
          script.src = src
          canvasDoc.head.appendChild(script)
        }
      }
    }

    // 调整画布填满容器
    const resizeCanvas = () => {
      const container = containerRef.current
      if (!container) return
      const w = container.offsetWidth
      const h = container.offsetHeight
      if (w && h) {
        editor.Canvas.setCoords({ x: 0, y: 0, w, h })
      }
    }

    // 编辑器加载完成后注入内容和调整尺寸
    editor.on('load', () => {
      if (content) {
        injectResources(content)
      }
      resizeCanvas()
      // 延迟再调一次，确保 DOM 稳定
      setTimeout(resizeCanvas, 100)
    })

    // 注册 send-to-ai 命令：收集选中元素信息，弹出指令输入框
    editor.Commands.add('send-to-ai', {
      run(ed: any) {
        const sel = ed.getSelected()
        if (!sel) return
        const html = sel.toHTML()
        const css = ed.getCss() || ''
        const elStyle = sel.getStyle()
        const inlineCss = elStyle && Object.keys(elStyle).length > 0
          ? Object.entries(elStyle).map(([k, v]) => `${k}: ${v}`).join('; ')
          : ''
        setAiContext({
          html: ed.getHtml() || '',
          css,
          element: inlineCss
            ? `<style>${sel.get('tagName')}{${inlineCss}}</style>\n${html}`
            : html,
        })
        setAiInstruction('')
        setAiPromptOpen(true)
        setTimeout(() => aiInputRef.current?.focus(), 50)
      },
    })

    // 选中组件事件
    editor.on('component:selected', (component: any) => {
      if (!component) return
      if (onSendToChatRef.current) {
        const toolbar: any[] = component.get('toolbar') || []
        const hasSendBtn = toolbar.some((btn: any) => btn.command === 'send-to-ai')
        if (!hasSendBtn) {
          component.set({
            toolbar: [...toolbar, {
              attributes: { title: '发送到 AI' },
              command: 'send-to-ai',
              label: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
            }],
          })
        }
      }
      const attrs = component.getAttributes()
      const classesArr = component.getClasses?.() || []
      const classes = classesArr.map((c: any) => (typeof c === 'string' ? c : c.get?.('name') || '')).join(' ')
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

    // 撤销/重做状态
    const updateUndoRedo = () => {
      setCanUndo(editor.UndoManager.hasUndo())
      setCanRedo(editor.UndoManager.hasRedo())
    }
    editor.on('undo', updateUndoRedo)
    editor.on('redo', updateUndoRedo)
    editor.on('component:update', updateUndoRedo)

    // 内容变更通知父组件（防抖 300ms，避免高频触发卡死）
    let changeTimer: ReturnType<typeof setTimeout> | null = null
    editor.on('component:update', () => {
      if (changeTimer) clearTimeout(changeTimer)
      changeTimer = setTimeout(() => {
        const fn = onChangeRef.current
        if (!fn) return
        const full = synthesizeHtml(editor.getHtml() || '', editor.getCss() || '')
        fn(full)
      }, 300)
    })

    // Ctrl+S
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        const html = editor.getHtml() || ''
        const css = editor.getCss() || ''
        onSave(synthesizeHtml(html, css))
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      if (changeTimer) clearTimeout(changeTimer)
      window.removeEventListener('keydown', handleKeyDown)
      try { editor.destroy() } catch {}
      editorRef.current = null
    }
  }, [gjsReady, editorKey]) // editorKey 变化时重建编辑器（刷新）

  const handleUndo = useCallback(() => {
    editorRef.current?.UndoManager.undo()
  }, [])

  const handleRedo = useCallback(() => {
    editorRef.current?.UndoManager.redo()
  }, [])

  const handleRefresh = useCallback(() => {
    setEditorKey((k) => k + 1)
  }, [])

  const handleSendToAI = useCallback(() => {
    if (!aiContext || !aiInstruction.trim() || !onSendToChat) return
    onSendToChat({
      html: aiContext.html,
      css: aiContext.css,
      element: aiContext.element,
      instruction: aiInstruction.trim(),
      fileName,
    })
    setAiPromptOpen(false)
    setAiContext(null)
    setAiInstruction('')
  }, [aiContext, aiInstruction, onSendToChat, fileName])

  const handleStyleChange = useCallback((prop: string, value: string) => {
    const editor = editorRef.current
    if (!editor) return
    const selected = editor.getSelected()
    if (!selected) return
    const rawStyle = selected.getStyle()
    const currentStyle: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawStyle)) {
      if (typeof v === 'string') currentStyle[k] = v
    }
    if (value) { currentStyle[prop] = value } else { delete currentStyle[prop] }
    selected.setStyle(currentStyle)
    setSelectedInfo((prev) => prev ? { ...prev, style: { ...currentStyle } } : null)
  }, [])

  return (
    <div className={`flex flex-col ${onExitFullscreen ? 'fixed inset-0 z-[9999]' : 'h-full'}`} style={onExitFullscreen ? { backgroundColor: 'var(--color-bg-primary)' } : undefined}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-1">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>可视化</span>
          <span className="text-[10px] px-1 rounded" style={{ backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>{fileName}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleUndo} disabled={!canUndo} className="p-1 rounded cursor-pointer disabled:opacity-30 hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text-secondary)' }} title="撤销"><Undo2 size={14} /></button>
          <button onClick={handleRedo} disabled={!canRedo} className="p-1 rounded cursor-pointer disabled:opacity-30 hover:bg-[var(--color-bg-tertiary)]" style={{ color: 'var(--color-text-secondary)' }} title="重做"><Redo2 size={14} /></button>
          {onSendToChat && (
            <button onClick={() => editorRef.current?.runCommand('send-to-ai')} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded cursor-pointer ml-1" style={{ color: 'var(--color-primary)' }} title="发送当前选中元素到 AI 对话">
              <Send size={13} /> 发送到 AI
            </button>
          )}
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded cursor-pointer ml-1" style={{ color: 'var(--color-primary)' }} title="Ctrl+S 保存">
            {saving ? '...' : '保存'}
          </button>
          <button onClick={handleRefresh} className="p-1 rounded cursor-pointer hover:bg-[var(--color-bg-tertiary)] ml-1" style={{ color: 'var(--color-text-secondary)' }} title="刷新编辑器">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowPropertyPanel((v) => !v)} className="p-1 rounded cursor-pointer hover:bg-[var(--color-bg-tertiary)] ml-1" style={{ color: showPropertyPanel ? 'var(--color-primary)' : 'var(--color-text-secondary)' }} title={showPropertyPanel ? '关闭属性面板' : '打开属性面板'}>
            {showPropertyPanel ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
          {onExitFullscreen && (
            <button onClick={onExitFullscreen} className="p-1 rounded cursor-pointer hover:bg-[var(--color-bg-tertiary)] ml-1" style={{ color: 'var(--color-text-secondary)' }} title="退出全屏">
              <Minimize2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Editor + Property Panel */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden relative">
          <style>{HIDE_PANELS_CSS}</style>
          <div ref={containerRef} className="w-full h-full" />
        </div>
        {showPropertyPanel && selectedInfo && (
          <PropertyPanel selected={selectedInfo} onClose={() => setShowPropertyPanel(false)} onStyleChange={handleStyleChange} />
        )}
      </div>

      {/* AI 指令输入弹窗 */}
      {aiPromptOpen && (
        <div className="absolute inset-0 flex items-center justify-center z-20" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
          <div className="rounded-lg shadow-xl p-4 w-80 border" style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
            <div className="text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>发送到 AI</div>
            <div className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
              描述你想要的修改，选中元素的代码会一起发送
            </div>
            <input
              ref={aiInputRef}
              type="text"
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && aiInstruction.trim()) handleSendToAI(); if (e.key === 'Escape') { setAiPromptOpen(false); setAiContext(null) } }}
              placeholder="例如：把按钮改成蓝色、增加一个图标..."
              className="w-full px-3 py-2 rounded text-sm border outline-none mb-3 min-w-0"
              style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setAiPromptOpen(false); setAiContext(null) }}
                className="px-3 py-1.5 rounded text-xs cursor-pointer"
                style={{ color: 'var(--color-text-secondary)' }}
              >取消</button>
              <button
                onClick={handleSendToAI}
                disabled={!aiInstruction.trim()}
                className="px-3 py-1.5 rounded text-xs cursor-pointer disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
              >发送</button>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {!gjsReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg-primary)]/80" style={{ zIndex: 10 }}>
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
          <span className="ml-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>加载编辑器...</span>
        </div>
      )}
    </div>
  )
}
