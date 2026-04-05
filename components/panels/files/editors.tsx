'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, Copy, Check, Save } from 'lucide-react'
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer'
import { oneDark } from '@codemirror/theme-one-dark'
import { getCodeMirrorExtensions, getLanguageLabel } from './types'
import { useIsDark } from './useIsDark'

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
              theme={isDark ? oneDark : undefined}
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
          theme={isDark ? oneDark : undefined}
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
}

export function MarkdownEditor({ content, fileName, onSave, saving }: MarkdownEditorProps) {
  const [editContent, setEditContent] = useState(content)
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split')
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
              theme={isDark ? oneDark : undefined}
              extensions={extensions}
              className="h-full text-sm"
              style={{ height: '100%' }}
              basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, bracketMatching: true, closeBrackets: true }}
            />
          </div>
        )}
        {(mode === 'preview' || mode === 'split') && (
          <div className={`${mode === 'split' ? 'w-1/2' : 'w-full'} h-full overflow-auto p-3`}>
            <div className="markdown-body text-sm leading-[1.6]"><MarkdownRenderer content={editContent} /></div>
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
          theme={isDark ? oneDark : undefined}
          extensions={extensions}
          className="h-full text-sm"
          style={{ height: '100%' }}
          basicSetup={{ lineNumbers: true, highlightActiveLine: true }}
        />
      </div>
    </div>
  )
}
