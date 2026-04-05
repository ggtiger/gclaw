import mammoth from 'mammoth'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

export async function POST(request: Request) {
  try {
    const { content } = await request.json() as { content: string }
    if (!content) {
      return Response.json({ success: false, error: '缺少文件内容' }, { status: 400 })
    }

    // base64 → Buffer
    const buffer = Buffer.from(content, 'base64')

    // mammoth 转 HTML
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Heading 5'] => h5:fresh",
          "p[style-name='Heading 6'] => h6:fresh",
        ],
        convertImage: mammoth.images.imgElement(function(image) {
          return image.read('base64').then(function(imageBuffer) {
            return { src: 'data:' + image.contentType + ';base64,' + imageBuffer }
          })
        }),
      }
    )

    // HTML → Markdown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    })
    turndownService.use(gfm)
    const markdown = turndownService.turndown(result.value)

    return Response.json({ success: true, markdown })
  } catch (err) {
    console.error('Word 转 Markdown 失败:', err)
    return Response.json({ success: false, error: err instanceof Error ? err.message : '转换失败' }, { status: 500 })
  }
}
