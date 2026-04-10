'use client'

import { memo, useCallback, useEffect, useRef, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
// hljs 懒加载缓存
let _hljs: typeof import('highlight.js').default | null = null
let _hljsLoading: Promise<typeof import('highlight.js').default> | null = null
function getHljs(): Promise<typeof import('highlight.js').default> {
  if (_hljs) return Promise.resolve(_hljs)
  if (!_hljsLoading) {
    _hljsLoading = import('highlight.js').then(m => { _hljs = m.default; return _hljs })
  }
  return _hljsLoading
}

// hljs 不支持的语言标记映射到相近语言
const LANG_ALIASES: Record<string, string> = {
  vue: 'html',
  svelte: 'html',
  jsx: 'javascript',
  tsx: 'typescript',
  shell: 'bash',
  zsh: 'bash',
  conda: 'yaml',
  dockerfile: 'dockerfile',
  make: 'makefile',
  ml: 'ocaml',
}
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { MermaidBlock } from './MermaidBlock'

interface MarkdownRendererProps {
  content: string
  isStreaming?: boolean
}

function resolveLanguage(lang: string): string {
  const lower = lang.toLowerCase()
  if (_hljs?.getLanguage(lower)) return lower
  return LANG_ALIASES[lower] || lower
}

function HighlightedCodeBlock({ className, children, isStreaming }: { className?: string; children: string; isStreaming?: boolean }) {
  const [copied, setCopied] = useState(false)
  const codeRef = useRef<HTMLElement>(null)
  const language = className?.replace('language-', '') || ''
  const resolvedLang = resolveLanguage(language)
  const codeText = children
  const highlightedRef = useRef(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codeText.trim())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [codeText])

  // 流式结束后做一次高亮，流式中跳过避免 DOM 抖动
  useEffect(() => {
    if (isStreaming) {
      highlightedRef.current = false
      return
    }
    if (highlightedRef.current) return
    if (!codeRef.current || !resolvedLang) return
    highlightedRef.current = true
    getHljs().then(hljs => {
      if (codeRef.current && hljs.getLanguage(resolvedLang)) {
        try {
          const result = hljs.highlight(codeText, { language: resolvedLang })
          codeRef.current.innerHTML = result.value
        } catch {
          // highlight.js 可能不支持某些语言，忽略
        }
      }
    })
  }, [isStreaming, resolvedLang, codeText])

  return (
    <div className="relative group">
      {language && (
        <div className="flex items-center justify-between px-3 py-2 text-xs rounded-t-lg"
          style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span>{language}</span>
          <button
            onClick={handleCopy}
            className="cursor-pointer flex items-center gap-1 hover:text-[var(--color-text)]"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
        </div>
      )}
      <pre className={language ? '!rounded-t-none !mt-0' : ''}>
        <code ref={codeRef} className={resolvedLang ? `language-${resolvedLang} hljs` : className}>{codeText}</code>
      </pre>
      {!language && (
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded cursor-pointer"
          style={{ backgroundColor: 'var(--color-bg-tertiary)' }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      )}
    </div>
  )
}

// 稳定的 remarkPlugins / rehypePlugins 引用，避免 ReactMarkdown 每次重建 processor
const REMARK_PLUGINS = [remarkGfm]
const REHYPE_PLUGINS = [rehypeSanitize]

export const MarkdownRenderer = memo(function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {
  const components = useMemo(() => ({
    code({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { node?: unknown }) {
      const codeText = String(children).replace(/\n$/, '')
      const isInline = !className && !codeText.includes('\n')
      if (isInline) {
        return <code className={className} {...props}>{children}</code>
      }
      const lang = className?.replace('language-', '') || ''
      if (lang === 'mermaid') {
        return <MermaidBlock chart={codeText} />
      }
      return (
        <HighlightedCodeBlock className={className} isStreaming={isStreaming}>
          {codeText}
        </HighlightedCodeBlock>
      )
    },
    pre({ children }: React.HTMLAttributes<HTMLElement> & { node?: unknown }) {
      return <>{children}</>
    },
    a({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      )
    },
  }), [isStreaming])

  return (
    <div className={`markdown-body prose prose-sm max-w-none ${isStreaming ? 'streaming-cursor' : ''}`}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
