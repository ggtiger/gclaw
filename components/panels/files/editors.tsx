'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, Copy, Check, Save, ChevronUp, ChevronDown, Download } from 'lucide-react'
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer'
import { oneDark } from '@codemirror/theme-one-dark'
import { getCodeMirrorExtensions, getLanguageLabel } from './types'
import { useIsDark } from './useIsDark'
import { exportToWord } from './word-export'
import { exportToPdf } from './pdf-export'
import * as Diff from 'diff'
import type { Extension } from '@codemirror/state'
import { EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { Decoration, ViewPlugin, WidgetType, EditorView, lineNumbers } from '@codemirror/view'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'

const CodeMirror = dynamic(() => import('@uiw/react-codemirror'), { ssr: false })

// ─── HTML 编辑器 ───

interface HtmlEditorProps {
  content: string
  fileName: string
  onSave: (content: string) => void
  saving: boolean
}

export function HtmlEditor({ content, fileName, onSave, saving }: HtmlEditorProps) {
  const [editContent, setEditContent] = useState(content)
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split')
  const extensions = getCodeMirrorExtensions(fileName)
  const isDark = useIsDark()

  useEffect(() => { setEditContent(content) }, [content])

  const handleSave = () => { onSave(editContent) }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>HTML</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setMode('edit')} className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
            style={{ color: mode === 'edit' ? 'var(--color-primary)' : 'var(--color-text-secondary)', backgroundColor: mode === 'edit' ? 'var(--color-primary-subtle)' : 'transparent' }}>
            编辑
          </button>
          <button onClick={() => setMode('split')} className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
            style={{ color: mode === 'split' ? 'var(--color-primary)' : 'var(--color-text-secondary)', backgroundColor: mode === 'split' ? 'var(--color-primary-subtle)' : 'transparent' }}>
            分栏
          </button>
          <button onClick={() => setMode('preview')} className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
            style={{ color: mode === 'preview' ? 'var(--color-primary)' : 'var(--color-text-secondary)', backgroundColor: mode === 'preview' ? 'var(--color-primary-subtle)' : 'transparent' }}>
            预览
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded cursor-pointer ml-1"
            style={{ color: 'var(--color-primary)' }} title="Ctrl+S 保存">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 保存
          </button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        {(mode === 'edit' || mode === 'split') && (
          <div className={`${mode === 'split' ? 'w-1/2 border-r' : 'w-full'} h-full`} style={{ borderColor: 'var(--color-border)' }}>
            <CodeMirror
              value={editContent}
              onChange={setEditContent}
              theme={isDark ? oneDark : 'light'}
              extensions={extensions}
              className="h-full text-sm"
              style={{ height: '100%' }}
              basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, bracketMatching: true, closeBrackets: true, indentOnInput: true }}
            />
          </div>
        )}
        {(mode === 'preview' || mode === 'split') && (
          <iframe
            srcDoc={editContent}
            className={`${mode === 'split' ? 'w-1/2' : 'w-full'} h-full border-0`}
            sandbox="allow-scripts allow-same-origin"
            title="HTML 预览"
          />
        )}
      </div>
    </div>
  )
}

// ─── 代码编辑器 ───

interface CodeEditorProps {
  content: string
  fileName: string
  onSave: (content: string) => void
  saving: boolean
}

export function CodeEditor({ content, fileName, onSave, saving }: CodeEditorProps) {
  const [editContent, setEditContent] = useState(content)
  const [copied, setCopied] = useState(false)
  const langLabel = getLanguageLabel(fileName)
  const extensions = getCodeMirrorExtensions(fileName)
  const isDark = useIsDark()

  useEffect(() => {
    setEditContent(content)
  }, [content])

  const handleCopy = () => {
    navigator.clipboard.writeText(editContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSave = () => {
    onSave(editContent)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-1">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{langLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleCopy} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? '已复制' : '复制'}
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded cursor-pointer"
            style={{ color: 'var(--color-primary)' }} title="Ctrl+S 保存">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 保存
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <CodeMirror
          value={editContent}
          onChange={setEditContent}
          theme={isDark ? oneDark : 'light'}
          extensions={extensions}
          className="h-full text-sm"
          style={{ height: '100%' }}
          basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, bracketMatching: true, closeBrackets: true, indentOnInput: true }}
        />
      </div>
    </div>
  )
}

// ─── Markdown 编辑器 ───

interface MarkdownEditorProps {
  content: string
  fileName: string
  onSave: (content: string) => void
  saving: boolean
  projectId?: string
  filePath?: string // 文件完整路径，用于解析相对路径图片
}

export function MarkdownEditor({ content, fileName, onSave, saving, projectId, filePath }: MarkdownEditorProps) {
  const [editContent, setEditContent] = useState(content)
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split')
  const [exporting, setExporting] = useState<'pdf' | 'word' | null>(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const extensions = getCodeMirrorExtensions(fileName)
  const isDark = useIsDark()
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setEditContent(content)
  }, [content])

  // 点击外部关闭导出菜单
  useEffect(() => {
    if (!exportMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [exportMenuOpen])

  const handleSave = () => {
    onSave(editContent)
  }

  const baseName = fileName.replace(/\.md$/i, '')

  const handleExportPdf = () => {
    if (!previewRef.current && !editContent) return
    setExporting('pdf')
    try {
      exportToPdf(previewRef.current, editContent, baseName, () => setExporting(null))
    } catch (err) {
      console.error('PDF export failed:', err)
      alert(err instanceof Error ? err.message : 'PDF 导出失败')
      setExporting(null)
    }
  }

  const handleExportWord = async () => {
    if (!previewRef.current) return
    setExporting('word')
    try {
      await exportToWord(previewRef.current, `${baseName}.docx`)
    } catch (err) {
      console.error('Word export failed:', err)
      alert(err instanceof Error ? err.message : 'Word 导出失败')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Markdown</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setMode('edit')} className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
            style={{ color: mode === 'edit' ? 'var(--color-primary)' : 'var(--color-text-secondary)', backgroundColor: mode === 'edit' ? 'var(--color-primary-subtle)' : 'transparent' }}>
            编辑
          </button>
          <button onClick={() => setMode('split')} className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
            style={{ color: mode === 'split' ? 'var(--color-primary)' : 'var(--color-text-secondary)', backgroundColor: mode === 'split' ? 'var(--color-primary-subtle)' : 'transparent' }}>
            分栏
          </button>
          <button onClick={() => setMode('preview')} className="text-xs px-1.5 py-0.5 rounded cursor-pointer"
            style={{ color: mode === 'preview' ? 'var(--color-primary)' : 'var(--color-text-secondary)', backgroundColor: mode === 'preview' ? 'var(--color-primary-subtle)' : 'transparent' }}>
            预览
          </button>
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              disabled={!!exporting}
              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded cursor-pointer ml-1"
              style={{ color: 'var(--color-text-secondary)' }}
              title="导出">
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} 导出
              <ChevronDown size={11} />
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 rounded shadow-lg border z-50 py-1 min-w-[100px]"
                style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
                <button
                  onClick={() => { setExportMenuOpen(false); handleExportPdf() }}
                  className="w-full text-left text-xs px-3 py-1.5 cursor-pointer hover:bg-[var(--color-bg-tertiary)]"
                  style={{ color: 'var(--color-text)' }}>
                  导出 PDF
                </button>
                <button
                  onClick={() => { setExportMenuOpen(false); handleExportWord() }}
                  className="w-full text-left text-xs px-3 py-1.5 cursor-pointer hover:bg-[var(--color-bg-tertiary)]"
                  style={{ color: 'var(--color-text)' }}>
                  导出 Word
                </button>
              </div>
            )}
          </div>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded cursor-pointer ml-1"
            style={{ color: 'var(--color-primary)' }} title="Ctrl+S 保存">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 保存
          </button>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        {(mode === 'edit' || mode === 'split') && (
          <div className={`${mode === 'split' ? 'w-1/2 border-r' : 'w-full'} h-full`} style={{ borderColor: 'var(--color-border)' }}>
            <CodeMirror
              value={editContent}
              onChange={setEditContent}
              theme={isDark ? oneDark : 'light'}
              extensions={extensions}
              className="h-full text-sm"
              style={{ height: '100%' }}
              basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, bracketMatching: true, closeBrackets: true }}
            />
          </div>
        )}
        {(mode === 'preview' || mode === 'split') && (
          <div className={`${mode === 'split' ? 'w-1/2' : 'w-full'} h-full overflow-auto p-3`}>
            <div ref={previewRef} className="markdown-body text-sm leading-[1.6]"><MarkdownRenderer content={editContent} projectId={projectId} filePath={filePath} /></div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 纯文本编辑器 ───

interface TextEditorProps {
  content: string
  fileName: string
  onSave: (content: string) => void
  saving: boolean
}

export function TextEditor({ content, fileName, onSave, saving }: TextEditorProps) {
  const [editContent, setEditContent] = useState(content)
  const extensions = getCodeMirrorExtensions(fileName)
  const isDark = useIsDark()

  useEffect(() => {
    setEditContent(content)
  }, [content])

  const handleSave = () => {
    onSave(editContent)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>纯文本</span>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded cursor-pointer"
          style={{ color: 'var(--color-primary)' }} title="Ctrl+S 保存">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 保存
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        <CodeMirror
          value={editContent}
          onChange={setEditContent}
          theme={isDark ? oneDark : 'light'}
          extensions={extensions}
          className="h-full text-sm"
          style={{ height: '100%' }}
          basicSetup={{ lineNumbers: true, highlightActiveLine: true }}
        />
      </div>
    </div>
  )
}

// ─── Diff 编辑器 ───

// 新增行 line decoration
const addLineDeco = Decoration.line({ class: 'cm-diffLineAdd' })

// 计算新增行号集合（lineNum 只计算新文件中的行，跳过 removed）
function computeAddedLines(oldText: string, newText: string): Set<number> {
  const changes = Diff.diffLines(oldText, newText)
  const addedLines = new Set<number>()
  let lineNum = 0
  for (const part of changes) {
    if (part.removed) continue // removed 行不在新文件中，跳过
    const lines = part.value.replace(/\n$/, '').split('\n')
    for (const _ of lines) {
      lineNum++
      if (part.added) addedLines.add(lineNum)
    }
  }
  return addedLines
}

// 计算删除行位置：afterLine 是新文件中的行号，widget 插入到该行之后
function computeRemoveWidgets(oldText: string, newText: string): { afterLine: number; text: string }[] {
  const changes = Diff.diffLines(oldText, newText)
  const result: { afterLine: number; text: string }[] = []
  let lineNum = 0 // 只计算新文件中的行（added + unchanged）
  for (const part of changes) {
    const lines = part.value.replace(/\n$/, '').split('\n')
    if (part.removed) {
      // removed 行不在新文件中，widget 插入到当前新文件行之后
      for (const text of lines) {
        result.push({ afterLine: lineNum, text })
      }
    } else {
      for (const _ of lines) {
        lineNum++
      }
    }
  }
  return result
}

// 计算变更块行号范围（用于上/下导航，lineNum 只计新文件行）
function computeChangeRanges(oldText: string, newText: string): { startLine: number; endLine: number }[] {
  const changes = Diff.diffLines(oldText, newText)
  const ranges: { startLine: number; endLine: number }[] = []
  let lineNum = 0
  let inChange = false
  let startLine = -1
  for (const part of changes) {
    if (part.removed) {
      // removed 行产生变更区域，但不占新文件行号
      if (!inChange && lineNum > 0) { startLine = lineNum + 1; inChange = true }
      continue
    }
    const lines = part.value.replace(/\n$/, '').split('\n')
    for (const _ of lines) {
      lineNum++
      if (part.added) {
        if (!inChange) { startLine = lineNum; inChange = true }
      } else {
        if (inChange) { ranges.push({ startLine, endLine: lineNum - 1 }); inChange = false }
      }
    }
  }
  if (inChange) ranges.push({ startLine, endLine: lineNum })
  return ranges
}

// 删除行的 block widget
class RemovedLineWidget extends WidgetType {
  constructor(readonly text: string) { super() }
  toDOM() {
    const div = document.createElement('div')
    div.className = 'cm-diffRemovedLine'
    const marker = document.createElement('span')
    marker.className = 'cm-diffMinusMarker'
    marker.textContent = '-'
    div.appendChild(marker)
    const content = document.createElement('span')
    content.className = 'cm-diffRemovedText'
    content.textContent = this.text
    div.appendChild(content)
    return div
  }
  ignoreEvent() { return true }
}

// 通过 StateEffect 更新删除行 block widgets
const setRemovedLinesEffect = StateEffect.define<{ afterLine: number; text: string }[]>()

// StateField 提供 block widget decorations（StateField 不受 ViewPlugin 限制）
const removedLinesField = StateField.define<DecorationSet>({
  create() { return Decoration.none },
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setRemovedLinesEffect)) {
        const widgets = e.value
        if (widgets.length === 0) return Decoration.none
        const b = new RangeSetBuilder<Decoration>()
        let idx = 0
        for (const w of widgets) {
          let pos: number
          if (w.afterLine < 1) {
            pos = 0
          } else {
            const line = Math.min(w.afterLine, tr.state.doc.lines)
            pos = tr.state.doc.line(line).to
          }
          b.add(pos, pos, Decoration.widget({
            widget: new RemovedLineWidget(w.text),
            block: true,
            // 同一位置多个 widget 需要不同 side 值保证排序正确
            side: (w.afterLine < 1 ? 0 : 1) + idx * 0.001,
          }))
          idx++
        }
        return b.finish()
      }
    }
    return deco.map(tr.changes)
  },
  provide: f => EditorView.decorations.from(f)
})

interface DiffEditorProps {
  oldContent: string
  newContent: string
  fileName: string
  onSave?: (content: string) => void
  saving?: boolean
  /** 只读模式：隐藏工具栏、不可编辑 */
  readOnly?: boolean
  /** 起始行号偏移（让行号与原文件一致） */
  startLine?: number
}

export function DiffEditor({ oldContent, newContent, fileName, onSave, saving, readOnly, startLine }: DiffEditorProps) {
  const [editContent, setEditContent] = useState(newContent)
  const cmRef = useRef<ReactCodeMirrorRef>(null)
  const [currentChange, setCurrentChange] = useState(-1)
  const isDark = useIsDark()
  const langExtensions = getCodeMirrorExtensions(fileName)

  useEffect(() => { setEditContent(newContent) }, [newContent])

  // 实时对比 oldContent vs 当前 editContent，编辑后 diff 自动更新
  const addedLines = useMemo(() => computeAddedLines(oldContent, editContent), [oldContent, editContent])
  const removeWidgets = useMemo(() => computeRemoveWidgets(oldContent, editContent), [oldContent, editContent])
  const changeRanges = useMemo(() => computeChangeRanges(oldContent, editContent), [oldContent, editContent])

  // 用 ref 桥接，让 ViewPlugin.build() 始终读到最新的 addedLines
  const addedLinesRef = useRef(addedLines)
  addedLinesRef.current = addedLines

  // 用 ref 桥接 removeWidgets，供 onCreateEditor 读取最新值
  const removeWidgetsRef = useRef(removeWidgets)
  removeWidgetsRef.current = removeWidgets

  // Line decoration：新增行绿色背景
  const diffExt = useMemo((): Extension => {
    return ViewPlugin.fromClass(class {
      decorations: DecorationSet
      constructor(view: EditorView) { this.decorations = this.build(view) }
      update(u: ViewUpdate) {
        // 文档变化或 addedLines 变化都需要重建
        this.decorations = this.build(u.view)
      }
      build(view: EditorView): DecorationSet {
        const lines = addedLinesRef.current
        if (!lines || lines.size === 0) return Decoration.none
        const b = new RangeSetBuilder<Decoration>()
        for (let i = 1; i <= view.state.doc.lines; i++) {
          if (lines.has(i)) {
            b.add(view.state.doc.line(i).from, view.state.doc.line(i).from, addLineDeco)
          }
        }
        return b.finish()
      }
    }, { decorations: v => v.decorations })
  }, []) // 只创建一次，通过 ref 读取最新数据

  const extensions = useMemo(() => {
    const exts: Extension[] = [...langExtensions, diffExt, removedLinesField]
    // 行号偏移：让行号与原文件一致
    if (startLine && startLine > 1) {
      exts.push(lineNumbers({ formatNumber: (n: number) => String(n + startLine! - 1) }))
    }
    // 只读模式：用 EditorState.readOnly 保留语法高亮渲染
    if (readOnly) {
      exts.push(EditorState.readOnly.of(true))
    }
    return exts
  }, [langExtensions, diffExt, startLine, readOnly])

  // addedLines 变化时强制刷新 ViewPlugin decorations
  // removeWidgets 变化时通过 StateEffect 更新 StateField block widgets
  useEffect(() => {
    const view = cmRef.current?.view
    if (view) view.dispatch({ effects: [setRemovedLinesEffect.of(removeWidgets)] })
  }, [addedLines, removeWidgets])

  const goToChange = useCallback((index: number) => {
    if (index < 0 || index >= changeRanges.length) return
    setCurrentChange(index)
    const view = cmRef.current?.view
    if (!view) return
    const targetLine = Math.max(1, changeRanges[index].startLine)
    const line = view.state.doc.line(targetLine)
    view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'center' }) })
  }, [changeRanges])

  // 初始化时跳到第一个变更
  useEffect(() => {
    if (changeRanges.length > 0 && currentChange === -1) {
      setCurrentChange(0)
      setTimeout(() => {
        const view = cmRef.current?.view
        if (!view) return
        const line = view.state.doc.line(Math.max(1, changeRanges[0].startLine))
        view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'center' }) })
      }, 150)
    }
  }, [changeRanges.length]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full">
      {!readOnly && (
      <div className="flex items-center justify-between px-3 py-1 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-1">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Diff</span>
          {changeRanges.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>
              {changeRanges.length} 处变更
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {changeRanges.length > 0 && (
            <>
              <button onClick={() => goToChange(currentChange - 1)} disabled={currentChange <= 0}
                className="p-0.5 rounded cursor-pointer disabled:opacity-30 hover:bg-[var(--color-bg-tertiary)]"
                style={{ color: 'var(--color-text-secondary)' }} title="上一处变更">
                <ChevronUp size={14} />
              </button>
              <span className="text-[10px] min-w-[2rem] text-center" style={{ color: 'var(--color-text-muted)' }}>
                {currentChange + 1}/{changeRanges.length}
              </span>
              <button onClick={() => goToChange(currentChange + 1)} disabled={currentChange >= changeRanges.length - 1}
                className="p-0.5 rounded cursor-pointer disabled:opacity-30 hover:bg-[var(--color-bg-tertiary)]"
                style={{ color: 'var(--color-text-secondary)' }} title="下一处变更">
                <ChevronDown size={14} />
              </button>
            </>
          )}
          {onSave && (
          <button onClick={() => onSave(editContent)} disabled={saving}
            className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded cursor-pointer"
            style={{ color: 'var(--color-primary)' }} title="保存修改">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 保存
          </button>
          )}
        </div>
      </div>
      )}
      <div className={readOnly ? 'flex-1 overflow-hidden' : 'flex-1 overflow-hidden'}>
        <CodeMirror
          ref={cmRef}
          value={editContent}
          onChange={setEditContent}
          onCreateEditor={(view) => {
            // view 就绪时立即 dispatch 初始 removeWidgets
            const w = removeWidgetsRef.current
            if (w.length > 0) {
              view.dispatch({ effects: [setRemovedLinesEffect.of(w)] })
            }
          }}
          theme={isDark ? oneDark : 'light'}
          extensions={extensions}
          className="h-full text-sm cm-diffEditor"
          style={{ height: '100%' }}
          basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true, bracketMatching: true }}
        />
      </div>
    </div>
  )
}
