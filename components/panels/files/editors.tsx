'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, Copy, Check, Save, ChevronUp, ChevronDown, Download } from 'lucide-react'
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer'
import { oneDark } from '@codemirror/theme-one-dark'
import { getCodeMirrorExtensions, getLanguageLabel } from './types'
import { useIsDark } from './useIsDark'
import { isTauri } from '@/lib/tauri'
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

// 导出辅助：将原始 SVG 的计算样式内联到克隆节点（解决 mermaid 外部 CSS 丢失问题）
function inlineSvgStyles(original: Element, clone: Element) {
  const origEls = Array.from(original.querySelectorAll('*'))
  const cloneEls = Array.from(clone.querySelectorAll('*'))
  const props = ['fill', 'stroke', 'stroke-width', 'font-family', 'font-size', 'font-weight',
    'color', 'background', 'opacity', 'text-anchor', 'dominant-baseline']
  for (let i = 0; i < origEls.length && i < cloneEls.length; i++) {
    const computed = window.getComputedStyle(origEls[i])
    for (const p of props) {
      const v = computed.getPropertyValue(p)
      if (v && v !== 'none' && v !== 'normal' && v !== '0px') {
        ;(cloneEls[i] as SVGElement).style.setProperty(p, v)
      }
    }
  }
}

// 导出辅助：检测 emoji 字符（U+1Fxxx 等范围）
function isEmojiChar(cp: number): boolean {
  return (cp >= 0x1F000 && cp <= 0x1FFFF) ||
    (cp >= 0x2600 && cp <= 0x27BF) ||
    (cp >= 0x2702 && cp <= 0x27B0) ||
    (cp >= 0xFE00 && cp <= 0xFE0F) ||
    cp === 0x200D
}

// 导出辅助：将文本按 emoji/非 emoji 分段
function splitTextByEmoji(text: string): { text: string; isEmoji: boolean }[] {
  const segments: { text: string; isEmoji: boolean }[] = []
  let current = ''
  let currentIsEmoji = false
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    const isEm = isEmojiChar(cp)
    if (isEm !== currentIsEmoji && current) {
      segments.push({ text: current, isEmoji: currentIsEmoji })
      current = ''
    }
    currentIsEmoji = isEm
    current += ch
  }
  if (current) segments.push({ text: current, isEmoji: currentIsEmoji })
  return segments
}

// 导出辅助：从 DOM 元素递归提取带格式的 TextRun[]，emoji 字符使用专用字体
function extractTextRuns(el: HTMLElement, docx: any, fmt: Record<string, any> = {}): any[] {
  const runs: any[] = []
  // 统一字体设置，确保行高一致
  const baseFont = fmt.font || 'Microsoft YaHei'

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) {
      const text = node.textContent || ''
      if (text) {
        const segments = splitTextByEmoji(text)
        for (const seg of segments) {
          if (seg.isEmoji) {
            // emoji 使用 Segoe UI Emoji，但保持相同 size
            runs.push(new docx.TextRun({ text: seg.text, font: 'Segoe UI Emoji', size: fmt.size || 21, color: fmt.color || '24292f' }))
          } else if (seg.text) {
            runs.push(new docx.TextRun({ text: seg.text, font: baseFont, size: fmt.size || 21, color: fmt.color || '24292f', ...fmt }))
          }
        }
      }
    } else if (node.nodeType === 1) {
      const child = node as HTMLElement
      const tag = child.tagName.toLowerCase()
      if (tag === 'br') { runs.push(new docx.TextRun({ break: 1 })); continue }
      const childFmt = { ...fmt, font: baseFont }
      if (tag === 'strong' || tag === 'b') childFmt.bold = true
      else if (tag === 'em' || tag === 'i') childFmt.italics = true
      else if (tag === 'del' || tag === 's') childFmt.strike = true
      else if (tag === 'code') { childFmt.font = 'Consolas'; childFmt.size = fmt.size ? fmt.size - 2 : 19 }
      runs.push(...extractTextRuns(child, docx, childFmt))
    }
  }
  return runs
}

// 导出辅助：SVG 转 PNG Uint8Array（内联样式 + viewBox 感知 + foreignObject 替换）
async function svgToImageData(svg: SVGSVGElement): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  // 克隆 SVG，内联样式避免外部 CSS 丢失
  const clone = svg.cloneNode(true) as SVGSVGElement
  inlineSvgStyles(svg, clone)

  // 替换 foreignObject 为 text 元素（浏览器禁止将含 foreignObject 的 SVG 作为 Image 加载）
  const svgNS = 'http://www.w3.org/2000/svg'
  const foreignObjects = Array.from(clone.querySelectorAll('foreignObject'))
  for (const fo of foreignObjects) {
    const textContent = fo.textContent?.trim() || ''
    const x = fo.getAttribute('x') || '0'
    const y = fo.getAttribute('y') || '0'
    const w = fo.getAttribute('width') || 'auto'
    const h = fo.getAttribute('height') || 'auto'
    // 创建 text 元素替代，x 定位到节点中心
    const textEl = document.createElementNS(svgNS, 'text')
    const xNum = parseFloat(x)
    const wNum = parseFloat(w)
    textEl.setAttribute('x', wNum > 0 ? String(xNum + wNum / 2) : x)
    // 文字垂直居中：y + height/2
    const hNum = parseFloat(h)
    textEl.setAttribute('y', hNum > 0 ? String(parseFloat(y) + hNum / 2) : y)
    textEl.setAttribute('text-anchor', 'middle')
    textEl.setAttribute('dominant-baseline', 'central')
    textEl.setAttribute('font-size', '12')
    textEl.setAttribute('fill', (fo as any).style?.color || (fo as any).style?.fill || '#333')
    textEl.textContent = textContent
    fo.parentNode?.replaceChild(textEl, fo)
  }

  // 优先用 viewBox 获取原始宽高比，再结合实际渲染尺寸
  const viewBox = clone.getAttribute('viewBox')
  let vbW = 0, vbH = 0
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number)
    if (parts.length === 4) { vbW = parts[2]; vbH = parts[3] }
  }
  const rect = svg.getBoundingClientRect()
  const cssW = rect.width || parseFloat(svg.getAttribute('width') || '0')
  const cssH = rect.height || parseFloat(svg.getAttribute('height') || '0')

  // 用 viewBox 的宽高比 + CSS 渲染宽度来保持正确比例
  let w: number, h: number
  if (vbW > 0 && vbH > 0) {
    const ratio = vbH / vbW
    w = cssW || vbW
    h = w * ratio
  } else {
    w = cssW || 400
    h = cssH || 300
  }

  // 确保 clone 有正确的 width/height/viewBox
  if (!clone.getAttribute('viewBox') && w > 0 && h > 0) {
    clone.setAttribute('viewBox', `0 0 ${w} ${h}`)
  }
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))

  const svgStr = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const canvas = await new Promise<HTMLCanvasElement | null>((resolve) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        // 高分辨率渲染（6x）确保 Word 导出清晰
        const scale = 6
        c.width = w * scale
        c.height = h * scale
        const ctx = c.getContext('2d')
        if (ctx) { ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, w, h) }
        resolve(ctx ? c : null)
      }
      img.onerror = () => resolve(null)
      img.src = url
    })
    if (!canvas) return null
    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!pngBlob) return null
    // 返回 canvas 实际尺寸（4x 分辨率）
    return { data: new Uint8Array(await pngBlob.arrayBuffer()), width: w * 6, height: h * 6 }
  } finally {
    URL.revokeObjectURL(url)
  }
}

// 导出辅助：从 hljs 高亮代码中提取带颜色的代码行（保留语法高亮 + 换行）
function extractCodeLines(el: HTMLElement, docx: any): { runs: any[] }[] {
  const lines: { runs: any[] }[] = [{ runs: [] }]
  let currentColor = '24292f'

  function pushRun(text: string, color: string) {
    if (!text) return
    // 按 \n 分段，每段单独一行
    const parts = text.split('\n')
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push({ runs: [] })
      if (parts[i]) {
        // 用 Courier New 确保空格与字符等宽，\u00A0 防止 Word 压缩连续空格
        const preserved = parts[i].replace(/ /g, '\u00A0')
        lines[lines.length - 1].runs.push(new docx.TextRun({
          text: preserved,
          font: { name: 'Courier New', eastAsia: 'NSimSun' },
          size: 18,
          color,
        }))
      }
    }
  }

  function walk(node: Node, inheritedColor: string) {
    if (node.nodeType === 3) {
      pushRun(node.textContent || '', inheritedColor)
    } else if (node.nodeType === 1) {
      const span = node as HTMLElement
      // 从 getComputedStyle 获取 hljs 颜色（CSS class → 计算样式）
      const computed = window.getComputedStyle(span)
      const colorStr = computed.color
      let color = inheritedColor
      if (colorStr) {
        const m = colorStr.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/)
        if (m) color = [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('')
      }
      for (const child of Array.from(span.childNodes)) walk(child, color)
    }
  }

  for (const child of Array.from(el.childNodes)) walk(child, currentColor)
  return lines
}
async function domToDocxParagraphs(container: HTMLElement, docx: any): Promise<any[]> {
  const result: any[] = []

  // 标题样式配置：字号、颜色
  const HEADING_CONFIG: Record<number, { size: number; color: string }> = {
    1: { size: 32, color: '1a1a2e' },
    2: { size: 28, color: '16213e' },
    3: { size: 24, color: '1a1a2e' },
    4: { size: 22, color: '533483' },
    5: { size: 21, color: '533483' },
    6: { size: 20, color: '666666' },
  }

  async function processElement(el: HTMLElement) {
    const tag = el.tagName?.toLowerCase()
    if (!tag) return
    const hm = tag.match(/^h([1-6])$/)
    if (hm) {
      const level = +hm[1]
      const cfg = HEADING_CONFIG[level]
      result.push(new docx.Paragraph({
        children: extractTextRuns(el, docx, { bold: true, size: cfg.size, color: cfg.color }),
        heading: [docx.HeadingLevel.HEADING_1, docx.HeadingLevel.HEADING_2, docx.HeadingLevel.HEADING_3,
          docx.HeadingLevel.HEADING_4, docx.HeadingLevel.HEADING_5, docx.HeadingLevel.HEADING_6][level - 1],
        spacing: { before: 280, after: 160, line: 240 },
        border: level <= 2 ? { bottom: { style: docx.BorderStyle.SINGLE, size: 1, color: 'd0d7de', space: 4 } } : undefined,
      }))
      return
    }
    if (tag === 'svg') {
      try {
        const imgData = await svgToImageData(el as unknown as SVGSVGElement)
        if (imgData) {
          // SVG 图片：目标宽度 550（接近 Word 页面宽度），按比例缩放
          const targetW = 550
          const scale = targetW / imgData.width
          const imgW = Math.round(imgData.width * scale)
          const imgH = Math.round(imgData.height * scale)
          result.push(new docx.Paragraph({
            children: [new docx.ImageRun({ data: imgData.data, transformation: { width: imgW, height: imgH }, type: 'png' })],
            alignment: docx.AlignmentType.CENTER,
            spacing: { before: 240, after: 240, line: 360 },
          }))
        }
      } catch (e) {
        console.warn('SVG export skipped:', e)
      }
      return
    }
    // 代码块：<pre> 或 <div> 直接子元素为 <pre>
    const directPre = tag === 'pre' ? el : (tag === 'div' ? Array.from(el.children).find(c => c.tagName.toLowerCase() === 'pre') : null) as HTMLElement | null | undefined
    if (directPre) {
      const codeEl = directPre.querySelector('code')
      const langSpan = tag === 'div' ? el.querySelector(':scope > .flex > span') : null
      const lang = langSpan?.textContent?.trim() || ''
      // 语言标题行
      if (lang) {
        result.push(new docx.Paragraph({
          children: [new docx.TextRun({ text: lang, font: 'Consolas', size: 16, color: '8b949e', bold: true })],
          shading: { fill: 'f6f8fa' },
          spacing: { before: 120, after: 0, line: 240 },
        }))
      }
      // 从 hljs 提取带颜色的代码行
      const codeLines = extractCodeLines(codeEl || directPre, docx)
      for (const line of codeLines) {
        result.push(new docx.Paragraph({
          children: line.runs.length > 0 ? line.runs : [new docx.TextRun({ text: '\u00A0', font: { name: 'Courier New', eastAsia: 'NSimSun' }, size: 18, color: '24292f' })],
          shading: { fill: 'f6f8fa' },
          alignment: docx.AlignmentType.LEFT,
          wordWrap: false,
          autoSpaceEastAsianText: false,
          spacing: { before: 0, after: 0, line: 200, lineRule: docx.LineRuleType.EXACT },
        }))
      }
      return
    }
    if (tag === 'ul' || tag === 'ol') {
      const isOrdered = tag === 'ol'
      let idx = 1
      for (const li of Array.from(el.children)) {
        result.push(new docx.Paragraph({
          children: [new docx.TextRun({ text: isOrdered ? `${idx}. ` : '• ', size: 21 }), ...extractTextRuns(li as HTMLElement, docx)],
          indent: { left: 420, hanging: 280 },
          spacing: { before: 40, after: 40, line: 240 },
        }))
        if (isOrdered) idx++
      }
      return
    }
    if (tag === 'blockquote') {
      // blockquote 前面添加间距
      result.push(new docx.Paragraph({ children: [], spacing: { before: 160, after: 0, line: 150  } }))
      // 用单列表格模拟 blockquote：左侧边框 + 底色连续覆盖，避免段落间距导致错位
      const children = Array.from(el.children)
      const cellParagraphs = children.map(child =>
        new docx.Paragraph({
          children: extractTextRuns(child as HTMLElement, docx, { color: '57606a', italics: true }),
          spacing: { before: 40, after: 40, line: 300 },
        })
      )
      result.push(new docx.Table({
        rows: [new docx.TableRow({
          children: [new docx.TableCell({
            children: cellParagraphs,
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            shading: { fill: 'f6f8fa' },
            borders: {
              top: { style: docx.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              bottom: { style: docx.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              left: { style: docx.BorderStyle.SINGLE, size: 6, color: 'd0d7de', space: 8 },
              right: { style: docx.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            },
          })],
        })],
        width: { size: 100, type: docx.WidthType.PERCENTAGE },
      }))
      // blockquote 后面添加间距
      result.push(new docx.Paragraph({ children: [], spacing: { before: 0, after: 160, line: 150 } }))
      return
    }
    if (tag === 'hr') {
      result.push(new docx.Paragraph({
        children: [],
        border: { bottom: { style: docx.BorderStyle.SINGLE, size: 6, color: '#D4D4D4' } },
        spacing: { before: 200, after: 200, line: 240 },
      }))
      return
    }
    // mermaid 容器：当前 div 直接包含 svg（非递归查找）
    // 图片容器：当前 div 直接包含 img（居中显示的图片）
    if (tag === 'div') {
      const directSvgs = Array.from(el.children).filter(c => c.tagName.toLowerCase() === 'svg')
      if (directSvgs.length > 0) { for (const svg of directSvgs) { await processElement(svg as HTMLElement) }; return }
      // 检查是否是图片容器 div（flex justify-center 包裹的图片）
      const directImg = Array.from(el.children).find(c => c.tagName.toLowerCase() === 'img')
      if (directImg) { await processElement(directImg as HTMLElement); return }
    }
    if (tag === 'img') {
      // 图片：支持 data URL 和 HTTP/API URL
      const src = (el as HTMLImageElement).src
      try {
        let imageData: Uint8Array | null = null
        let imgType: string = 'png'

        if (src.startsWith('data:')) {
          // base64 data URL
          const match = src.match(/^data:image\/(\w+);base64,(.+)$/)
          if (match) {
            imgType = match[1] === 'jpeg' ? 'jpg' : match[1]
            const binary = atob(match[2])
            imageData = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) imageData[i] = binary.charCodeAt(i)
          }
        } else if (src.startsWith('/') || src.startsWith('http')) {
          // API URL 或 HTTP URL，fetch 图片
          const res = await fetch(src)
          if (res.ok) {
            const blob = await res.blob()
            imageData = new Uint8Array(await blob.arrayBuffer())
            // 从 MIME 类型推断图片类型
            const mime = blob.type || 'image/png'
            imgType = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
          }
        }

        if (imageData) {
          const imgEl = el as HTMLImageElement
          // 使用图片原始尺寸（naturalWidth/naturalHeight），最大 600（接近 Word 页面宽度）
          const naturalW = imgEl.naturalWidth || imgEl.width || 400
          const naturalH = imgEl.naturalHeight || imgEl.height || 300
          const imgW = Math.min(600, naturalW)
          const imgH = Math.round(imgW * naturalH / naturalW)
          result.push(new docx.Paragraph({
            children: [new docx.ImageRun({ data: imageData, transformation: { width: imgW, height: imgH }, type: imgType as any })],
            alignment: docx.AlignmentType.CENTER,
            spacing: { before: 160, after: 160, line: 300 },
          }))
        }
      } catch (e) {
        console.warn('Word export: failed to fetch image', src, e)
      }
      return
    }
    if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr'))
      if (rows.length > 0) {
        result.push(new docx.Table({
          borders: {
            top: { style: docx.BorderStyle.SINGLE, size: 1, color: 'D4D4D4' },
            bottom: { style: docx.BorderStyle.SINGLE, size: 1, color: 'D4D4D4' },
            left: { style: docx.BorderStyle.SINGLE, size: 1, color: 'D4D4D4' },
            right: { style: docx.BorderStyle.SINGLE, size: 1, color: 'D4D4D4' },
            insideHorizontal: { style: docx.BorderStyle.SINGLE, size: 1, color: 'D4D4D4' },
            insideVertical: { style: docx.BorderStyle.SINGLE, size: 1, color: 'D4D4D4' },
          },
          rows: rows.map((row) => {
            const cells = Array.from(row.querySelectorAll('td, th'))
            return new docx.TableRow({
              children: cells.map(cell => {
                const isHeader = cell.tagName.toLowerCase() === 'th'
                return new docx.TableCell({
                  children: [new docx.Paragraph({
                    children: extractTextRuns(cell as HTMLElement, docx, isHeader ? { bold: true, color: '1a1a2e' } : {}),
                    spacing: { before: 60, after: 60, line: 240 },
                  })],
                  margins: { top: 40, bottom: 40, left: 80, right: 80 },
                  shading: isHeader ? { fill: 'E8E8E8' } : undefined,
                  verticalAlign: docx.VerticalAlign.CENTER,
                })
              }),
            })
          }),
          width: { size: 100, type: docx.WidthType.PERCENTAGE },
        }))
      }
      return
    }
    // 检查是否有子元素需要递归处理（即使没有文本内容）
    const hasChildren = el.children.length > 0
    if (hasChildren) {
      const hasBlocks = Array.from(el.children).some(c => ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'pre', 'blockquote', 'table', 'div', 'img', 'svg'].includes(c.tagName.toLowerCase()))
      if (hasBlocks) { for (const child of Array.from(el.children)) { await processElement(child as HTMLElement) } }
      else if (el.textContent?.trim()) { result.push(new docx.Paragraph({ children: extractTextRuns(el, docx), spacing: { after: 160, line: 300 } })) }
    } else if (el.textContent?.trim()) {
      result.push(new docx.Paragraph({ children: extractTextRuns(el, docx), spacing: { after: 160, line: 300 } }))
    }
  }
  for (const child of Array.from(container.children)) { await processElement(child as HTMLElement) }
  return result
}

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

  const handleExportPdf = async () => {
    setExporting('pdf')
    try {
      if (!previewRef.current && !editContent) return

      // 创建打印内容
      const printContainer = document.createElement('div')
      printContainer.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.6;color:#24292f;padding:20px;overflow:visible;height:auto;-webkit-print-color-adjust:exact;print-color-adjust:exact;'
      if (previewRef.current) {
        printContainer.innerHTML = previewRef.current.innerHTML
      } else {
        printContainer.innerHTML = `<pre style="white-space:pre-wrap;">${editContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
      }

      // 移除代码块中的复制按钮
      printContainer.querySelectorAll('button, [data-copy], .copy-button').forEach(el => el.remove())

      // 强制亮色打印主题：只重置暗色背景，保留语法高亮颜色
      printContainer.style.color = '#24292f'
      printContainer.style.background = '#fff'

      // 代码块头部（语言标签区域）- 通过 pre 的前一个兄弟元素定位
      printContainer.querySelectorAll('pre').forEach(pre => {
        const header = pre.previousElementSibling as HTMLElement | null
        if (header && header.tagName === 'DIV' && header.querySelector('span')) {
          header.style.cssText = 'background:#f0f2f4;color:#57606a;padding:6px 16px;border-radius:6px 6px 0 0;font-size:12px;border:1px solid #e1e4e8;border-bottom:none;display:flex;align-items:center;justify-content:space-between;-webkit-print-color-adjust:exact;print-color-adjust:exact;'
          // 头部内所有子元素也强制深灰色
          header.querySelectorAll('*').forEach(child => {
            (child as HTMLElement).style.color = '#57606a'
          })
        }
      })

      // 代码块 pre
      printContainer.querySelectorAll('pre').forEach(pre => {
        const el = pre as HTMLElement
        el.style.cssText = 'background:#f6f8fa;color:#24292f;padding:12px 16px;border-radius:6px;overflow-x:auto;font-size:13px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact;border:1px solid #e1e4e8;'
        // 如果前面有 header div，去掉上圆角并连接边框
        const prev = el.previousElementSibling as HTMLElement | null
        if (prev && prev.tagName === 'DIV' && prev.querySelector('span')) {
          el.style.borderRadius = '0 0 6px 6px'
          el.style.borderTop = 'none'
        }
      })
      // 代码块内的 span（语法高亮）- 保留原色，只处理暗色主题下太浅的颜色
      printContainer.querySelectorAll('pre span').forEach(node => {
        const el = node as HTMLElement
        const computed = getComputedStyle(el)
        const color = computed.color
        const match = color?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
        if (match) {
          const [, r, g, b] = match.map(Number)
          // 太浅的颜色（暗色主题浅色字）加深
          if (r > 200 && g > 200 && b > 200) {
            el.style.color = '#24292f'
          }
        }
      })
      // 行内 code
      printContainer.querySelectorAll('code').forEach(code => {
        const el = code as HTMLElement
        if (!el.closest('pre')) {
          el.style.cssText = 'background:#f0f2f4;color:#24292f;padding:2px 6px;border-radius:3px;font-size:0.9em;font-family:"SF Mono","Fira Code",Menlo,monospace;-webkit-print-color-adjust:exact;print-color-adjust:exact;'
        }
      })
      // blockquote - 浅灰背景
      printContainer.querySelectorAll('blockquote').forEach(bq => {
        const el = bq as HTMLElement
        el.style.cssText = 'border-left:4px solid #dfe2e5;padding:12px 16px;color:#57606a;background:#f8f9fa;margin-left:0;margin-right:0;border-radius:0 4px 4px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact;'
      })
      printContainer.querySelectorAll('blockquote *').forEach(node => {
        const el = node as HTMLElement
        if (el.style) el.style.color = '#57606a'
      })
      // 表格样式
      printContainer.querySelectorAll('th').forEach(th => {
        const el = th as HTMLElement
        el.style.cssText = 'background:#f6f8fa;color:#24292f;border:1px solid #d0d7de;padding:8px 12px;-webkit-print-color-adjust:exact;print-color-adjust:exact;'
      })
      printContainer.querySelectorAll('td').forEach(td => {
        const el = td as HTMLElement
        el.style.cssText = 'border:1px solid #d0d7de;padding:8px 12px;color:#24292f;'
      })

      // 物理移动所有 body 子节点到隐藏容器
      const hiddenWrapper = document.createElement('div')
      hiddenWrapper.id = 'gclaw-hidden-wrapper'
      hiddenWrapper.setAttribute('style', 'display:none !important')

      // 保存并重置 body/html 的样式，确保不会截断打印内容
      const originalBodyStyle = document.body.getAttribute('style') || ''
      const originalHtmlStyle = document.documentElement.getAttribute('style') || ''
      const originalTitle = document.title
      document.body.setAttribute('style', 'margin:0;padding:0;height:auto;overflow:visible;')
      document.documentElement.setAttribute('style', 'height:auto;overflow:visible;')
      document.title = baseName
      while (document.body.firstChild) {
        hiddenWrapper.appendChild(document.body.firstChild)
      }
      document.body.appendChild(hiddenWrapper)
      document.body.appendChild(printContainer)

      // 等待 DOM 更新
      await new Promise(resolve => setTimeout(resolve, 100))

      // 恢复 DOM 的函数
      const restoreDOM = () => {
        printContainer.remove()
        const wrapper = document.getElementById('gclaw-hidden-wrapper')
        if (wrapper) {
          while (wrapper.firstChild) {
            document.body.appendChild(wrapper.firstChild)
          }
          wrapper.remove()
        }
        // 恢复 body/html 原始样式
        document.body.setAttribute('style', originalBodyStyle)
        document.documentElement.setAttribute('style', originalHtmlStyle)
        document.title = originalTitle
        setExporting(null)
      }

      // 监听 afterprint 事件（打印对话框关闭后触发）
      const onAfterPrint = () => {
        window.removeEventListener('afterprint', onAfterPrint)
        restoreDOM()
      }
      window.addEventListener('afterprint', onAfterPrint)

      window.print()

      // 兜底：如果 30秒后 afterprint 仍未触发，强制恢复
      setTimeout(() => {
        if (document.getElementById('gclaw-hidden-wrapper')) {
          window.removeEventListener('afterprint', onAfterPrint)
          restoreDOM()
        }
      }, 30000)

      // 不在这里恢复 DOM，等 afterprint 事件
      return
    } catch (err) {
      console.error('PDF export failed:', err)
      alert(err instanceof Error ? err.message : 'PDF 导出失败')
      // 尝试恢复
      const wrapper = document.getElementById('gclaw-hidden-wrapper')
      if (wrapper) {
        while (wrapper.firstChild) {
          document.body.appendChild(wrapper.firstChild)
        }
        wrapper.remove()
      }
      setExporting(null)
    }
  }

  const handleExportWord = async () => {
    console.log('[Word Export] Starting...')
    setExporting('word')
    try {
      if (!previewRef.current) return
      const wordFilename = `${baseName}.docx`
      const docx = await import('docx')
      const paragraphs = await domToDocxParagraphs(previewRef.current, docx)
      const doc = new docx.Document({
        styles: {
          default: {
            document: {
              run: { font: { eastAsia: 'Microsoft YaHei' }, size: 21, color: '24292f' },
              paragraph: {
                spacing: { line: 300, lineRule: docx.LineRuleType.AUTO },
              },
            },
          },
        },
        sections: [{
          properties: {
            page: {
              margin: { top: 720, bottom: 720, left: 900, right: 900 },
            },
          },
          children: paragraphs,
        }],
      })
      const blob = await docx.Packer.toBlob(doc)

      if (isTauri()) {
        const arrayBuffer = await blob.arrayBuffer()
        const content = Array.from(new Uint8Array(arrayBuffer))
        const { save } = await import('@tauri-apps/plugin-dialog')
        const path = await save({
          defaultPath: wordFilename,
          filters: [{ name: 'Word', extensions: ['docx'] }],
        })
        if (path) {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('save_file_content', { path, content })
        }
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = wordFilename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
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
