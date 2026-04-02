'use client'

import { memo, useCallback, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import hljs from 'highlight.js'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

interface MarkdownRendererProps {
  content: string
  isStreaming?: boolean
}

function HighlightedCodeBlock({ className, children }: { className?: string; children: string }) {
  const [copied, setCopied] = useState(false)
  const codeRef = useRef<HTMLElement>(null)
  const language = className?.replace('language-', '') || ''
  const codeText = children

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codeText.trim())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [codeText])

  useEffect(() => {
    if (codeRef.current && language) {
      try {
        hljs.highlightElement(codeRef.current)
      } catch {
        // highlight.js 可能不支持某些语言，忽略
      }
    }
  }, [language, codeText])

  return (
    <div className="relative group">
      {language && (
        <div className="flex items-center justify-between px-4 py-1.5 text-xs rounded-t-lg"
          style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
          <span>{language}</span>
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex items-center gap-1 hover:text-[var(--color-text)]"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
        </div>
      )}
      <pre className={language ? '!rounded-t-none !mt-0' : ''}>
        <code ref={codeRef} className={className}>{codeText}</code>
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

export const MarkdownRenderer = memo(function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {
  return (
    <div className={`markdown-body prose prose-sm max-w-none ${isStreaming ? 'streaming-cursor' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          code({ className, children, ...props }) {
            const isInline = !className
            if (isInline) {
              return <code className={className} {...props}>{children}</code>
            }
            return (
              <HighlightedCodeBlock className={className}>
                {String(children).replace(/\n$/, '')}
              </HighlightedCodeBlock>
            )
          },
          pre({ children }) {
            return <>{children}</>
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
