import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getProjectDataDir } from '@/lib/store/projects'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId')
  const file = req.nextUrl.searchParams.get('file')
  if (!projectId || !file) {
    return NextResponse.json({ error: '缺少参数' }, { status: 400 })
  }

  // 防止路径遍历
  const basename = path.basename(file)
  const dir = getProjectDataDir(projectId)
  const filePath = path.join(dir, basename)

  if (!filePath.startsWith(dir)) {
    return NextResponse.json({ error: '非法路径' }, { status: 400 })
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: '文件不存在' }, { status: 404 })
  }

  const ext = path.extname(basename).toLowerCase()
  const mimeMap: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  }

  const buffer = fs.readFileSync(filePath)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mimeMap[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

export async function POST(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: '缺少 projectId' }, { status: 400 })
  }

  const formData = await req.formData()
  const file = formData.get('avatar') as File | null
  if (!file) {
    return NextResponse.json({ error: '未选择文件' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: '不支持的图片格式' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '图片不能超过 2MB' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'png'
  const filename = `assistant-avatar.${ext}`
  const dir = getProjectDataDir(projectId)
  const filePath = path.join(dir, filename)

  // 删除旧头像（不同扩展名）
  for (const old of fs.readdirSync(dir).filter(f => f.startsWith('assistant-avatar.'))) {
    fs.unlinkSync(path.join(dir, old))
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  fs.writeFileSync(filePath, buffer)

  return NextResponse.json({ filename })
}

export async function DELETE(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: '缺少 projectId' }, { status: 400 })
  }

  const dir = getProjectDataDir(projectId)
  for (const old of fs.readdirSync(dir).filter(f => f.startsWith('assistant-avatar.'))) {
    fs.unlinkSync(path.join(dir, old))
  }

  return NextResponse.json({ ok: true })
}
