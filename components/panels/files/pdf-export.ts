/**
 * PDF 导出工具
 * 使用 window.print() 将 Markdown 预览内容导出为 PDF
 */

export type ExportDoneCallback = () => void

/**
 * 创建亮色打印样式的 DOM 内容
 */
function createPrintContent(previewElement: HTMLElement | null, fallbackText: string): HTMLDivElement {
  const printContainer = document.createElement('div')
  printContainer.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.6;color:#24292f;padding:20px;overflow:visible;height:auto;-webkit-print-color-adjust:exact;print-color-adjust:exact;'

  if (previewElement) {
    printContainer.innerHTML = previewElement.innerHTML
  } else {
    printContainer.innerHTML = `<pre style="white-space:pre-wrap;">${fallbackText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
  }

  // 移除代码块中的复制按钮
  printContainer.querySelectorAll('button, [data-copy], .copy-button').forEach(el => el.remove())

  // 强制亮色打印主题
  printContainer.style.color = '#24292f'
  printContainer.style.background = '#fff'

  // 代码块头部（语言标签区域）
  printContainer.querySelectorAll('pre').forEach(pre => {
    const header = pre.previousElementSibling as HTMLElement | null
    if (header && header.tagName === 'DIV' && header.querySelector('span')) {
      header.style.cssText = 'background:#f0f2f4;color:#57606a;padding:6px 16px;border-radius:6px 6px 0 0;font-size:12px;border:1px solid #e1e4e8;border-bottom:none;display:flex;align-items:center;justify-content:space-between;-webkit-print-color-adjust:exact;print-color-adjust:exact;'
      header.querySelectorAll('*').forEach(child => {
        (child as HTMLElement).style.color = '#57606a'
      })
    }
  })

  // 代码块 pre
  printContainer.querySelectorAll('pre').forEach(pre => {
    const el = pre as HTMLElement
    el.style.cssText = 'background:#f6f8fa;color:#24292f;padding:12px 16px;border-radius:6px;overflow-x:auto;font-size:13px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact;border:1px solid #e1e4e8;'
    const prev = el.previousElementSibling as HTMLElement | null
    if (prev && prev.tagName === 'DIV' && prev.querySelector('span')) {
      el.style.borderRadius = '0 0 6px 6px'
      el.style.borderTop = 'none'
    }
  })

  // 代码块内语法高亮 - 暗色主题浅色字加深
  printContainer.querySelectorAll('pre span').forEach(node => {
    const el = node as HTMLElement
    const computed = getComputedStyle(el)
    const color = computed.color
    const match = color?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (match) {
      const [, r, g, b] = match.map(Number)
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

  // blockquote
  printContainer.querySelectorAll('blockquote').forEach(bq => {
    const el = bq as HTMLElement
    el.style.cssText = 'border-left:4px solid #dfe2e5;padding:12px 16px;color:#57606a;background:#f8f9fa;margin-left:0;margin-right:0;border-radius:0 4px 4px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact;'
  })
  printContainer.querySelectorAll('blockquote *').forEach(node => {
    const el = node as HTMLElement
    if (el.style) el.style.color = '#57606a'
  })

  // 表格
  printContainer.querySelectorAll('th').forEach(th => {
    (th as HTMLElement).style.cssText = 'background:#f6f8fa;color:#24292f;border:1px solid #d0d7de;padding:8px 12px;-webkit-print-color-adjust:exact;print-color-adjust:exact;'
  })
  printContainer.querySelectorAll('td').forEach(td => {
    (td as HTMLElement).style.cssText = 'border:1px solid #d0d7de;padding:8px 12px;color:#24292f;'
  })

  return printContainer
}

/**
 * 导出为 PDF（通过 window.print()）
 * @param previewElement 预览区 DOM 元素
 * @param fallbackText 无预览时的纯文本回退
 * @param documentTitle 打印时使用的文档标题
 * @param onDone 完成回调（无论成功或失败）
 */
export function exportToPdf(
  previewElement: HTMLElement | null,
  fallbackText: string,
  documentTitle: string,
  onDone: ExportDoneCallback,
): void {
  const printContainer = createPrintContent(previewElement, fallbackText)

  // 保存并重置 body/html 的样式
  const originalBodyStyle = document.body.getAttribute('style') || ''
  const originalHtmlStyle = document.documentElement.getAttribute('style') || ''
  const originalTitle = document.title

  // 物理移动所有 body 子节点到隐藏容器
  const hiddenWrapper = document.createElement('div')
  hiddenWrapper.id = 'gclaw-hidden-wrapper'
  hiddenWrapper.setAttribute('style', 'display:none !important')

  document.body.setAttribute('style', 'margin:0;padding:0;height:auto;overflow:visible;')
  document.documentElement.setAttribute('style', 'height:auto;overflow:visible;')
  document.title = documentTitle

  while (document.body.firstChild) {
    hiddenWrapper.appendChild(document.body.firstChild)
  }
  document.body.appendChild(hiddenWrapper)
  document.body.appendChild(printContainer)

  // 等待 DOM 更新后打印
  setTimeout(() => {
    const restoreDOM = () => {
      printContainer.remove()
      const wrapper = document.getElementById('gclaw-hidden-wrapper')
      if (wrapper) {
        while (wrapper.firstChild) {
          document.body.appendChild(wrapper.firstChild)
        }
        wrapper.remove()
      }
      document.body.setAttribute('style', originalBodyStyle)
      document.documentElement.setAttribute('style', originalHtmlStyle)
      document.title = originalTitle
      onDone()
    }

    const onAfterPrint = () => {
      window.removeEventListener('afterprint', onAfterPrint)
      restoreDOM()
    }
    window.addEventListener('afterprint', onAfterPrint)

    window.print()

    // 兜底：30秒后强制恢复
    setTimeout(() => {
      if (document.getElementById('gclaw-hidden-wrapper')) {
        window.removeEventListener('afterprint', onAfterPrint)
        restoreDOM()
      }
    }, 30000)
  }, 100)
}
