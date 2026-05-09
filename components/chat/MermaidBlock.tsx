'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Code } from 'lucide-react'

/**
 * 按逗号分割字符串，但忽略方括号内的逗号。
 */
function splitByComma(s: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  for (const ch of s) {
    if (ch === '[') depth++
    else if (ch === ']') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current)
  return parts
}

/**
 * 预处理 Mermaid 代码，修复非 ASCII 标识符问题。
 *
 * 处理规则：
 * 1. xychart: x-axis [中文1, 中文2] → x-axis ["中文1", "中文2"]
 * 2. radar axis: 中文["中文"] → r0["中文"]，裸中文 → r1["中文"]
 * 3. radar curve: "标签" : 值 → c0["标签"]{值}
 */
function preprocessChart(code: string): string {
  let result = code

  // xychart: x-axis [item1, item2, ...] — 给非 ASCII 项加引号
  result = result.replace(
    /^(\s*x-axis(?:\s+"[^"]*")?\s*\[)([^\]]*?)(\])/gm,
    (_: string, prefix: string, content: string, suffix: string) => {
      const items = content.split(',').map((s: string) => {
        const t = s.trim()
        if (!t || /^["']/.test(t) || /^[\x20-\x7F]+$/.test(t)) return s
        return ` "${t}"`
      })
      return prefix + items.join(',') + suffix
    }
  )

  // radar-beta axis: 偿债能力["偿债能力"] → r0["偿债能力"]
  let axisIdx = 0
  result = result.replace(
    /^(\s*axis\s+)(.+)$/gm,
    (match: string, prefix: string, content: string) => {
      // 跳过 x-axis（xychart 的轴，已由上面的正则处理）
      if (/x-axis/.test(prefix)) return match
      const entries = splitByComma(content)
      const fixed = entries.map(entry => {
        const t = entry.trim()
        if (!t) return entry
        // id["label"] 格式 — 检查 ID 是否为合法 ASCII
        const m = t.match(/^(\S+)\s*\["(.*)"\]$/)
        if (m) {
          if (/^[a-zA-Z_]\w*$/.test(m[1])) return entry
          return `r${axisIdx++}["${m[2]}"]`
        }
        // 裸 ASCII 标识符 — 保持不变
        if (/^[a-zA-Z_]\w*$/.test(t)) return entry
        // 非 ASCII 文本 → rN["文本"]
        return `r${axisIdx++}["${t.replace(/^["']|["']$/g, '')}"]`
      })
      return prefix + fixed.join(', ')
    }
  )

  // radar-beta curve: "标签" : v1, v2, v3 → c0["标签"]{v1,v2,v3}
  let curveIdx = 0
  result = result.replace(
    /^(\s*curve\s+)(.+)$/gm,
    (match: string, prefix: string, content: string) => {
      // 已经有 {values} 格式 — 无需修改
      if (/\{[^}]+\}/.test(content)) return match
      return prefix + content.replace(
        /"([^"]+)"\s*:\s*([\d,.\s-]+)/g,
        (_: string, label: string, values: string) => {
          return `c${curveIdx++}["${label}"]{${values.replace(/\s/g, '')}}`
        }
      )
    }
  )

  return result
}

export function MermaidBlock({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCode, setShowCode] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
        })
        const processedChart = preprocessChart(chart.trim())
        const { svg } = await mermaid.render(
          `mermaid-${Math.random().toString(36).slice(2, 10)}`,
          processedChart
        )
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Mermaid 渲染失败')
        }
      }
    }

    render()
    return () => { cancelled = true }
  }, [chart])

  if (error) {
    return (
      <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
        <div className="flex items-center gap-2 px-3 py-2 text-xs" style={{ color: 'var(--color-error)' }}>
          <AlertCircle size={14} />
          <span>Mermaid 渲染失败: {error}</span>
          <button
            onClick={() => setShowCode(!showCode)}
            className="ml-auto flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: 'var(--color-error)' }}
          >
            <Code size={12} />
            {showCode ? '隐藏' : '查看代码'}
          </button>
        </div>
        {showCode && (
          <pre className="px-3 pb-2 text-xs overflow-x-auto font-mono" style={{ color: 'var(--color-text-secondary)', borderTop: '1px solid rgba(239, 68, 68, 0.1)' }}>
            <code>{chart}</code>
          </pre>
        )}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex justify-center overflow-x-auto py-2"
    />
  )
}
