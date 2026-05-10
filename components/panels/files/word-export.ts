/**
 * Word (.docx) 导出工具
 * 将 Markdown 预览 DOM 转换为 Word 文档
 */

import { isTauri } from '@/lib/tauri'

// ── SVG 样式内联 ──

// 将原始 SVG 的计算样式内联到克隆节点（解决 mermaid 外部 CSS 丢失问题）
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

// ── Emoji 处理 ──

function isEmojiChar(cp: number): boolean {
  return (cp >= 0x1F000 && cp <= 0x1FFFF) ||
    (cp >= 0x2600 && cp <= 0x27BF) ||
    (cp >= 0x2702 && cp <= 0x27B0)
}

function splitTextByEmoji(text: string): { text: string; isEmoji: boolean }[] {
  const segments: { text: string; isEmoji: boolean }[] = []
  let current = ''
  let currentIsEmoji = false
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    // 跳过变体选择符和零宽连接符，避免 Word 中出现空格/方框
    if (cp >= 0xFE00 && cp <= 0xFE0F || cp === 0x200D) continue
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

// ── DOM → docx 文本 ──

// 从 DOM 元素递归提取带格式的 TextRun[]，emoji 字符使用专用字体
function extractTextRuns(el: HTMLElement, docx: any, fmt: Record<string, any> = {}): any[] {
  const runs: any[] = []
  const baseFont = fmt.font || 'Microsoft YaHei'

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) {
      const text = node.textContent || ''
      if (text) {
        const segments = splitTextByEmoji(text)
        for (const seg of segments) {
          if (seg.isEmoji) {
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
      const childFmt: Record<string, any> = { ...fmt, font: baseFont }
      if (tag === 'strong' || tag === 'b') childFmt.bold = true
      else if (tag === 'em' || tag === 'i') childFmt.italics = true
      else if (tag === 'del' || tag === 's') childFmt.strike = true
      else if (tag === 'code') { childFmt.font = 'Consolas'; childFmt.size = fmt.size ? fmt.size - 2 : 19 }
      runs.push(...extractTextRuns(child, docx, childFmt))
    }
  }
  return runs
}

// ── SVG → PNG ──

// SVG 转 PNG Uint8Array（内联样式 + viewBox 感知 + foreignObject 替换）
async function svgToImageData(svg: SVGSVGElement): Promise<{ data: Uint8Array; width: number; height: number } | null> {
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
    const textEl = document.createElementNS(svgNS, 'text')
    const xNum = parseFloat(x)
    const wNum = parseFloat(w)
    textEl.setAttribute('x', wNum > 0 ? String(xNum + wNum / 2) : x)
    const hNum = parseFloat(h)
    textEl.setAttribute('y', hNum > 0 ? String(parseFloat(y) + hNum / 2) : y)
    textEl.setAttribute('text-anchor', 'middle')
    textEl.setAttribute('dominant-baseline', 'central')
    textEl.setAttribute('font-size', '12')
    textEl.setAttribute('fill', (fo as any).style?.color || (fo as any).style?.fill || '#333')
    textEl.textContent = textContent
    fo.parentNode?.replaceChild(textEl, fo)
  }

  const viewBox = clone.getAttribute('viewBox')
  let vbW = 0, vbH = 0
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number)
    if (parts.length === 4) { vbW = parts[2]; vbH = parts[3] }
  }
  const rect = svg.getBoundingClientRect()
  const cssW = rect.width || parseFloat(svg.getAttribute('width') || '0')
  const cssH = rect.height || parseFloat(svg.getAttribute('height') || '0')

  let w: number, h: number
  if (vbW > 0 && vbH > 0) {
    const ratio = vbH / vbW
    w = cssW || vbW
    h = w * ratio
  } else {
    w = cssW || 400
    h = cssH || 300
  }

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
    return { data: new Uint8Array(await pngBlob.arrayBuffer()), width: w * 6, height: h * 6 }
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ── 代码高亮提取 ──

// 从 hljs 高亮代码中提取带颜色的代码行（保留语法高亮 + 换行）
function extractCodeLines(el: HTMLElement, docx: any): { runs: any[] }[] {
  const lines: { runs: any[] }[] = [{ runs: [] }]
  let currentColor = '24292f'

  function pushRun(text: string, color: string) {
    if (!text) return
    const parts = text.split('\n')
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push({ runs: [] })
      if (parts[i]) {
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

// ── DOM → docx 段落 ──

async function domToDocxParagraphs(container: HTMLElement, docx: any): Promise<any[]> {
  const result: any[] = []

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

    // 标题
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

    // SVG（mermaid 等）
    if (tag === 'svg') {
      try {
        const imgData = await svgToImageData(el as unknown as SVGSVGElement)
        if (imgData) {
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

    // 代码块
    const directPre = tag === 'pre' ? el : (tag === 'div' ? Array.from(el.children).find(c => c.tagName.toLowerCase() === 'pre') : null) as HTMLElement | null | undefined
    if (directPre) {
      const codeEl = directPre.querySelector('code')
      const langSpan = tag === 'div' ? el.querySelector(':scope > .flex > span') : null
      const lang = langSpan?.textContent?.trim() || ''
      if (lang) {
        result.push(new docx.Paragraph({
          children: [new docx.TextRun({ text: lang, font: 'Consolas', size: 16, color: '8b949e', bold: true })],
          shading: { fill: 'f6f8fa' },
          spacing: { before: 120, after: 0, line: 240 },
        }))
      }
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

    // 列表
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

    // 引用
    if (tag === 'blockquote') {
      result.push(new docx.Paragraph({ children: [], spacing: { before: 160, after: 0, line: 150 } }))
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
      result.push(new docx.Paragraph({ children: [], spacing: { before: 0, after: 160, line: 150 } }))
      return
    }

    // 水平线
    if (tag === 'hr') {
      result.push(new docx.Paragraph({
        children: [],
        border: { bottom: { style: docx.BorderStyle.SINGLE, size: 6, color: '#D4D4D4' } },
        spacing: { before: 200, after: 200, line: 240 },
      }))
      return
    }

    // div 容器：检查直接子元素 svg/img
    if (tag === 'div') {
      const directSvgs = Array.from(el.children).filter(c => c.tagName.toLowerCase() === 'svg')
      if (directSvgs.length > 0) { for (const svg of directSvgs) { await processElement(svg as HTMLElement) }; return }
      const directImg = Array.from(el.children).find(c => c.tagName.toLowerCase() === 'img')
      if (directImg) { await processElement(directImg as HTMLElement); return }
    }

    // 图片
    if (tag === 'img') {
      const src = (el as HTMLImageElement).src
      try {
        let imageData: Uint8Array | null = null
        let imgType: string = 'png'

        if (src.startsWith('data:')) {
          const match = src.match(/^data:image\/(\w+);base64,(.+)$/)
          if (match) {
            imgType = match[1] === 'jpeg' ? 'jpg' : match[1]
            const binary = atob(match[2])
            imageData = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) imageData[i] = binary.charCodeAt(i)
          }
        } else if (src.startsWith('/') || src.startsWith('http')) {
          const res = await fetch(src)
          if (res.ok) {
            const blob = await res.blob()
            imageData = new Uint8Array(await blob.arrayBuffer())
            const mime = blob.type || 'image/png'
            imgType = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
          }
        }

        if (imageData) {
          const imgEl = el as HTMLImageElement
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

    // 表格
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

    // 递归处理子元素
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

// ── 公开接口 ──

export async function exportToWord(
  previewElement: HTMLElement,
  filename: string,
): Promise<void> {
  const docx = await import('docx')
  const paragraphs = await domToDocxParagraphs(previewElement, docx)

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
  const wordFilename = filename.endsWith('.docx') ? filename : `${filename}.docx`

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
}
