'use client'

import { memo, useCallback, useEffect, useRef, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
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
import { Copy, Check, X } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { MermaidBlock } from './MermaidBlock'
import { FilePathAction, IMAGE_EXTENSIONS } from './FilePathAction'

interface MarkdownRendererProps {
  content: string
  isStreaming?: boolean
  projectId?: string
  projectCwd?: string
}

// ── 文件路径检测与预处理 ──

// 保护占位符，避免正则匹配到内部内容（含 www. 开头的网址）
const PROTECT_RE = /```[\s\S]*?```|`[^`\n]+`|\[[^\]]*\]\([^)]+\)|https?:\/\/[^\s)\]"'`|]+|www\.[\w.@+-/?:&=%#]+/g
// 检测含目录分隔符且带扩展名的路径（绝对或相对）
const FILE_PATH_RE = /(^|[\s([|"'`])(\/?(?:[\w.@+-]+\/)+[\w.@+-]+\.[a-zA-Z]{1,10})(?=[\s)\]"'`|]|$)/gm

// 判断内联代码内容是否为文件路径（参考 genvis isLocalPath）
function isInlineFilePath(s: string): boolean {
  if (s.startsWith('http') || s.startsWith('www.')) return false
  return s.includes('/') && /\.[a-zA-Z]{1,10}$/.test(s) && !s.includes(' ')
}

function preprocessFilePaths(content: string): string {
  if (!content) return content

  const protected_: string[] = []
  let idx = 0

  // 保护代码块、内联代码、markdown 链接、URL 不被修改
  let result = content.replace(PROTECT_RE, (m) => {
    protected_.push(m)
    return `\x00P${idx++}\x00`
  })

  // 将检测到的文件路径包装为 gclaw-file: 链接（保持原始路径不变）
  result = result.replace(FILE_PATH_RE, (_match, prefix: string, path: string) => {
    return `${prefix}[${path}](gclaw-file:${path})`
  })

  // 恢复被保护的内容
  return result.replace(/\x00P(\d+)\x00/g, (_, i) => protected_[parseInt(i)])
}

// 扩展 sanitize schema 允许 gclaw-file: 协议
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href || []), 'gclaw-file'],
  },
}

// ── 内联图片卡片（参考 genvis InlineImage）──

function InlineImageCard({ filePath, projectId, projectCwd }: {
  filePath: string
  projectId: string
  projectCwd?: string
}) {
  const [imgError, setImgError] = useState(false)
  const [lightbox, setLightbox] = useState(false)

  // 绝对路径用 /api/local-file，相对路径用项目文件 API
  const imageUrl = filePath.startsWith('/')
    ? `/api/local-file?path=${encodeURIComponent(filePath)}`
    : `/api/projects/${projectId}/files?action=download&path=${encodeURIComponent(filePath)}`

  // 图片加载失败 → 显示路径操作组件
  if (imgError) {
    return <FilePathAction filePath={filePath} projectId={projectId} projectCwd={projectCwd} compact />
  }

  return (
    <>
      <img
        src={imageUrl}
        alt={filePath}
        className="max-w-full max-h-[300px] rounded-lg cursor-pointer object-contain my-1"
        style={{ border: '1px solid var(--color-border)' }}
        onClick={() => setLightbox(true)}
        onError={() => setImgError(true)}
      />
      {lightbox && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setLightbox(false)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img src={imageUrl} alt={filePath} className="max-w-full max-h-[90vh] object-contain rounded-lg" />
            <button
              onClick={() => setLightbox(false)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-lg"
            >
              <X size={16} />
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
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
// 元组类型推断兼容 react-markdown 的 PluggableList
const REHYPE_PLUGINS: Array<[typeof rehypeSanitize, typeof SANITIZE_SCHEMA]> = [[rehypeSanitize, SANITIZE_SCHEMA]]

export const MarkdownRenderer = memo(function MarkdownRenderer({ content, isStreaming, projectId, projectCwd }: MarkdownRendererProps) {
  const processedContent = projectId ? preprocessFilePaths(content) : content

  const components = useMemo(() => ({
    code({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { node?: unknown }) {
      const codeText = String(children).replace(/\n$/, '')
      const isInline = !className && !codeText.includes('\n')
      if (isInline) {
        // 内联代码中的文件路径 → 渲染为可交互组件（参考 genvis code 覆盖）
        if (projectId && isInlineFilePath(codeText)) {
          const filePath = codeText
          const ext = filePath.split('.').pop()?.toLowerCase() || ''
          if (IMAGE_EXTENSIONS.has(ext)) {
            return <InlineImageCard filePath={filePath} projectId={projectId} projectCwd={projectCwd} />
          }
          return <FilePathAction filePath={filePath} projectId={projectId} projectCwd={projectCwd} compact />
        }
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
      if (href?.startsWith('gclaw-file:') && projectId) {
        const filePath = decodeURIComponent(href.slice('gclaw-file:'.length))
        const ext = filePath.split('.').pop()?.toLowerCase() || ''
        // 图片路径：内联预览 + lightbox + 操作按钮
        if (IMAGE_EXTENSIONS.has(ext)) {
          return <InlineImageCard filePath={filePath} projectId={projectId} projectCwd={projectCwd} />
        }
        // 非图片路径：紧凑型操作按钮
        return <FilePathAction filePath={filePath} projectId={projectId} projectCwd={projectCwd} compact />
      }
      // 无协议的 www. 链接自动补 http://
      const resolvedHref = href && /^www\./i.test(href) && !href.includes('://')
        ? 'http://' + href
        : href
      return (
        <a href={resolvedHref} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      )
    },
  }), [isStreaming, projectId, projectCwd])

  return (
    <div className={`markdown-body prose prose-sm max-w-none ${isStreaming ? 'streaming-cursor' : ''}`}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
})
