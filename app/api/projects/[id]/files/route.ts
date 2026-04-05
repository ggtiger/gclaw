import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { getProjectDir } from '@/lib/store/projects'
import { getAuthUser } from '@/lib/auth/helpers'

export const dynamic = 'force-dynamic'

interface FileInfo {
  name: string
  type: 'file' | 'directory'
  size?: string
  modifiedAt?: string
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function isPathSafe(subPath: string): boolean {
  if (subPath.includes('..')) return false
  if (subPath.includes('\0')) return false
  if (subPath.startsWith('/')) return false
  return true
}

function resolveAndValidate(id: string, subPath: string) {
  const projectDir = getProjectDir(id)
  if (!fs.existsSync(projectDir)) return null
  const targetPath = subPath ? path.join(projectDir, subPath) : projectDir
  const resolvedTarget = path.resolve(targetPath)
  const resolvedProject = path.resolve(projectDir)
  if (!resolvedTarget.startsWith(resolvedProject)) return null
  return resolvedTarget
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'js', 'ts', 'tsx', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp',
  'cs', 'php', 'sh', 'bash', 'zsh', 'fish',
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  'xml', 'sql', 'graphql', 'vue', 'svelte',
  'gitignore', 'dockerignore', 'editorconfig', 'prettierrc', 'eslintrc',
  'lock', 'log',
])

const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico',
])

function isTextFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  if (TEXT_EXTENSIONS.has(ext)) return true
  // 无扩展名的文件尝试当作文本
  if (!ext && fs.statSync(filePath).size < 1024 * 100) return true
  return false
}

function isImageFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return IMAGE_EXTENSIONS.has(ext)
}

interface TreeEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: TreeEntry[]
}

function buildTree(dir: string, projectDir: string, depth: number): TreeEntry[] {
  if (depth > 10) return [] // 防止过深递归
  const entries: TreeEntry[] = []
  let items: string[]
  try {
    items = fs.readdirSync(dir)
  } catch {
    return []
  }

  for (const name of items) {
    if (name.startsWith('.')) continue
    if (name === 'node_modules' || name === '.git') continue
    const fullPath = path.join(dir, name)
    try {
      const stat = fs.statSync(fullPath)
      const relativePath = path.relative(projectDir, fullPath)
      if (stat.isDirectory()) {
        const children = buildTree(fullPath, projectDir, depth + 1)
        entries.push({ name, path: relativePath, type: 'directory', children })
      } else {
        entries.push({ name, path: relativePath, type: 'file' })
      }
    } catch {
      continue
    }
  }

  // 目录在前，文件在后
  entries.sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1
    if (a.type !== 'directory' && b.type === 'directory') return 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })

  return entries
}

// GET — 目录列表 或 文件内容读取
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = new URL(request.url)
  const subPath = url.searchParams.get('path') || ''
  const action = url.searchParams.get('action')

  if (!isPathSafe(subPath)) {
    return Response.json({ error: '非法路径' }, { status: 400 })
  }

  const user = getAuthUser(request)
  if (!user) {
    return Response.json({ error: '未授权' }, { status: 401 })
  }

  const resolvedTarget = resolveAndValidate(id, subPath)
  if (!resolvedTarget) {
    return Response.json({ error: '项目不存在或非法路径' }, { status: 404 })
  }

  // action=tree: 返回完整文件树
  if (action === 'tree') {
    try {
      const projectDir = getProjectDir(id)
      const tree = buildTree(projectDir, projectDir, 0)
      return Response.json({ tree })
    } catch (err) {
      console.error('构建文件树失败:', err)
      return Response.json({ error: '构建文件树失败' }, { status: 500 })
    }
  }

  if (!fs.existsSync(resolvedTarget)) {
    return Response.json({ error: '路径不存在' }, { status: 404 })
  }

  // action=read: 读取文件内容
  if (action === 'read') {
    try {
      const stats = fs.statSync(resolvedTarget)
      if (!stats.isFile()) {
        return Response.json({ error: '不是文件' }, { status: 400 })
      }

      const name = path.basename(resolvedTarget)
      const ext = name.split('.').pop()?.toLowerCase() || ''

      if (isImageFile(resolvedTarget)) {
        return Response.json({
          blob: true,
          url: `/api/projects/${encodeURIComponent(id)}/files?action=download&path=${encodeURIComponent(subPath)}`,
          name,
          size: stats.size,
          extension: ext,
        })
      }

      if (!isTextFile(resolvedTarget)) {
        return Response.json({
          blob: true,
          url: `/api/projects/${encodeURIComponent(id)}/files?action=download&path=${encodeURIComponent(subPath)}`,
          name,
          size: stats.size,
          extension: ext,
        })
      }

      // 限制读取大小 5MB
      if (stats.size > 5 * 1024 * 1024) {
        return Response.json({ error: '文件过大（超过 5MB）' }, { status: 400 })
      }

      const content = fs.readFileSync(resolvedTarget, 'utf-8')
      return Response.json({ content, name, size: stats.size, extension: ext })
    } catch (err) {
      console.error('读取文件失败:', err)
      return Response.json({ error: '读取文件失败' }, { status: 500 })
    }
  }

  // action=download: 下载文件（返回二进制流）
  if (action === 'download') {
    try {
      const stats = fs.statSync(resolvedTarget)
      if (!stats.isFile()) {
        return Response.json({ error: '不是文件' }, { status: 400 })
      }

      const buffer = fs.readFileSync(resolvedTarget)
      const name = path.basename(resolvedTarget)
      const ext = name.split('.').pop()?.toLowerCase() || ''
      const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
        doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
        zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar',
        json: 'application/json', xml: 'application/xml', html: 'text/html', htm: 'text/html',
        txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
        js: 'text/javascript', ts: 'text/typescript', css: 'text/css',
      }
      const contentType = mimeMap[ext] || 'application/octet-stream'
      return new Response(buffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
          'Content-Length': String(stats.size),
        },
      })
    } catch (err) {
      console.error('下载文件失败:', err)
      return Response.json({ error: '下载文件失败' }, { status: 500 })
    }
  }

  // 默认：目录列表
  try {
    const stats = fs.statSync(resolvedTarget)
    if (!stats.isDirectory()) {
      return Response.json({ error: '不是目录' }, { status: 400 })
    }

    const entries = fs.readdirSync(resolvedTarget)
    const files: FileInfo[] = []

    for (const name of entries) {
      if (name.startsWith('.')) continue
      const fullPath = path.join(resolvedTarget, name)
      try {
        const stat = fs.statSync(fullPath)
        files.push({
          name,
          type: stat.isDirectory() ? 'directory' : 'file',
          size: stat.isFile() ? formatSize(stat.size) : undefined,
          modifiedAt: stat.mtime.toISOString(),
        })
      } catch {
        continue
      }
    }

    files.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1
      if (a.type !== 'directory' && b.type === 'directory') return 1
      return a.name.localeCompare(b.name, 'zh-CN')
    })

    return Response.json({ files, currentPath: subPath })
  } catch (err) {
    console.error('读取目录失败:', err)
    return Response.json({ error: '读取目录失败' }, { status: 500 })
  }
}

// POST — 文件操作（mkdir/create/rename/delete）
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = getAuthUser(request)
  if (!user) {
    return Response.json({ error: '未授权' }, { status: 401 })
  }

  let body: { action: string; path?: string; newPath?: string; name?: string; content?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: '请求体无效' }, { status: 400 })
  }

  const { action, path: targetPath = '', newPath, name, content } = body

  if (!isPathSafe(targetPath) || (newPath && !isPathSafe(newPath))) {
    return Response.json({ error: '非法路径' }, { status: 400 })
  }

  const projectDir = getProjectDir(id)
  if (!fs.existsSync(projectDir)) {
    return Response.json({ error: '项目不存在' }, { status: 404 })
  }

  try {
    switch (action) {
      case 'mkdir': {
        if (!name) return Response.json({ error: '缺少名称' }, { status: 400 })
        const dirPath = path.join(projectDir, targetPath, name)
        const resolved = path.resolve(dirPath)
        if (!resolved.startsWith(path.resolve(projectDir))) {
          return Response.json({ error: '非法路径' }, { status: 400 })
        }
        if (fs.existsSync(dirPath)) {
          return Response.json({ error: '已存在' }, { status: 409 })
        }
        fs.mkdirSync(dirPath, { recursive: true })
        return Response.json({ success: true })
      }

      case 'create': {
        if (!name) return Response.json({ error: '缺少名称' }, { status: 400 })
        const filePath = path.join(projectDir, targetPath, name)
        const resolved = path.resolve(filePath)
        if (!resolved.startsWith(path.resolve(projectDir))) {
          return Response.json({ error: '非法路径' }, { status: 400 })
        }
        if (fs.existsSync(filePath)) {
          return Response.json({ error: '已存在' }, { status: 409 })
        }
        fs.writeFileSync(filePath, '', 'utf-8')
        return Response.json({ success: true })
      }

      case 'rename': {
        if (!targetPath || !newPath) {
          return Response.json({ error: '缺少路径参数' }, { status: 400 })
        }
        const oldFullPath = path.join(projectDir, targetPath)
        const newFullPath = path.join(projectDir, newPath)
        const resolvedOld = path.resolve(oldFullPath)
        const resolvedNew = path.resolve(newFullPath)
        if (!resolvedOld.startsWith(path.resolve(projectDir)) ||
            !resolvedNew.startsWith(path.resolve(projectDir))) {
          return Response.json({ error: '非法路径' }, { status: 400 })
        }
        if (!fs.existsSync(oldFullPath)) {
          return Response.json({ error: '源文件不存在' }, { status: 404 })
        }
        if (fs.existsSync(newFullPath)) {
          return Response.json({ error: '目标已存在' }, { status: 409 })
        }
        fs.renameSync(oldFullPath, newFullPath)
        return Response.json({ success: true })
      }

      case 'delete': {
        if (!targetPath) return Response.json({ error: '缺少路径' }, { status: 400 })
        const delPath = path.join(projectDir, targetPath)
        const resolvedDel = path.resolve(delPath)
        if (!resolvedDel.startsWith(path.resolve(projectDir))) {
          return Response.json({ error: '非法路径' }, { status: 400 })
        }
        if (!fs.existsSync(delPath)) {
          return Response.json({ error: '文件不存在' }, { status: 404 })
        }
        const delStat = fs.statSync(delPath)
        if (delStat.isDirectory()) {
          fs.rmSync(delPath, { recursive: true })
        } else {
          fs.unlinkSync(delPath)
        }
        return Response.json({ success: true })
      }

      case 'save': {
        if (!targetPath) return Response.json({ error: '缺少路径' }, { status: 400 })
        const savePath = path.join(projectDir, targetPath)
        const resolvedSave = path.resolve(savePath)
        if (!resolvedSave.startsWith(path.resolve(projectDir))) {
          return Response.json({ error: '非法路径' }, { status: 400 })
        }
        if (!fs.existsSync(savePath)) {
          return Response.json({ error: '文件不存在' }, { status: 404 })
        }
        const saveStat = fs.statSync(savePath)
        if (!saveStat.isFile()) {
          return Response.json({ error: '不是文件' }, { status: 400 })
        }
        if (content === undefined) {
          return Response.json({ error: '缺少内容' }, { status: 400 })
        }
        fs.writeFileSync(savePath, content, 'utf-8')
        return Response.json({ success: true })
      }

      default:
        return Response.json({ error: '未知操作' }, { status: 400 })
    }
  } catch (err) {
    console.error('文件操作失败:', err)
    return Response.json({ error: '操作失败' }, { status: 500 })
  }
}

// PUT — 文件上传（FormData）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = getAuthUser(request)
  if (!user) {
    return Response.json({ error: '未授权' }, { status: 401 })
  }

  const projectDir = getProjectDir(id)
  if (!fs.existsSync(projectDir)) {
    return Response.json({ error: '项目不存在' }, { status: 404 })
  }

  try {
    const formData = await request.formData()
    const dir = (formData.get('dir') as string) || ''
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return Response.json({ error: '没有文件' }, { status: 400 })
    }

    if (dir && !isPathSafe(dir)) {
      return Response.json({ error: '非法路径' }, { status: 400 })
    }

    const targetDir = dir ? path.join(projectDir, dir) : projectDir
    const resolvedTarget = path.resolve(targetDir)
    if (!resolvedTarget.startsWith(path.resolve(projectDir))) {
      return Response.json({ error: '非法路径' }, { status: 400 })
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const uploaded: string[] = []
    for (const file of files) {
      const filePath = path.join(targetDir, file.name)
      const resolved = path.resolve(filePath)
      if (!resolved.startsWith(path.resolve(projectDir))) continue

      const buffer = Buffer.from(await file.arrayBuffer())
      fs.writeFileSync(filePath, buffer)
      uploaded.push(file.name)
    }

    return Response.json({ success: true, uploaded })
  } catch (err) {
    console.error('文件上传失败:', err)
    return Response.json({ error: '上传失败' }, { status: 500 })
  }
}
