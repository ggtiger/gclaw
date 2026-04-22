import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { getProjectDir } from '@/lib/store/projects'
import { getProjectSettings } from '@/lib/store/settings'
import { getAuthUser } from '@/lib/auth/helpers'
import type { GitStatusCode, GitFileStatus, GitStatusResponse, GitScanResponse } from '@/types/git'

export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)

/**
 * 获取项目文件根目录：有 cwd 配置时用 cwd，否则用项目数据目录
 */
function getFileRoot(id: string): string {
  const projectDir = getProjectDir(id)
  try {
    const settings = getProjectSettings(id)
    if (settings.cwd) {
      const resolvedCwd = path.resolve(settings.cwd)
      if (fs.existsSync(resolvedCwd)) {
        return resolvedCwd
      }
    }
  } catch { /* ignore */ }
  return projectDir
}

function git(workingDir: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, { cwd: workingDir, maxBuffer: 10 * 1024 * 1024 })
}

/** 扫描项目目录下所有有 .git 的子目录，返回相对路径和分支 */
async function scanGitDirs(projectDir: string): Promise<{ path: string; branch: string }[]> {
  const result: { path: string; branch: string }[] = []

  try {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue
      if (fs.existsSync(path.join(projectDir, entry.name, '.git'))) {
        const branch = await getBranch(path.join(projectDir, entry.name))
        result.push({ path: entry.name, branch })
      }
    }
  } catch { /* ignore */ }

  return result
}

async function getBranch(dir: string): Promise<string> {
  try {
    const { stdout } = await git(dir, ['branch', '--show-current'])
    return stdout.trim() || 'main'
  } catch {
    return 'main'
  }
}

/** 根据 dir 参数解析 git 工作目录的绝对路径 */
function resolveGitDir(fileRoot: string, dir?: string | null): string | null {
  // 项目根目录本身就是 git repo（如 dev mode 项目 cwd 指向 clone 目录）
  if (!dir) {
    if (fs.existsSync(path.join(fileRoot, '.git'))) return fileRoot
    return null
  }
  const target = path.join(fileRoot, dir)
  // 安全检查：不能逃逸出项目目录
  if (!path.resolve(target).startsWith(path.resolve(fileRoot))) return null
  if (fs.existsSync(path.join(target, '.git'))) return target
  return null
}

/** 清理 git porcelain 输出中的路径：去引号、处理转义 */
function cleanPath(p: string): string {
  // 去掉首尾双引号
  if (p.startsWith('"') && p.endsWith('"')) {
    p = p.slice(1, -1)
    // 处理八进制转义 \344\270\255 → UTF-8 bytes → string
    if (/\\[0-7]{3}/.test(p)) {
      const bytes: number[] = []
      const re = /\\([0-7]{3})/g
      let last = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(p)) !== null) {
        // 添加引号前的普通字符
        for (let i = last; i < m.index; i++) bytes.push(p.charCodeAt(i))
        bytes.push(parseInt(m[1], 8))
        last = re.lastIndex
      }
      for (let i = last; i < p.length; i++) bytes.push(p.charCodeAt(i))
      return new TextDecoder().decode(new Uint8Array(bytes))
    }
    // 处理 \t \n 等常见转义
    p = p.replace(/\\t/g, '\t').replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return p
}

function parsePorcelain(output: string, gitDir: string): { staged: GitFileStatus[]; unstaged: GitFileStatus[]; untracked: GitFileStatus[] } {
  const staged: GitFileStatus[] = []
  const unstaged: GitFileStatus[] = []
  const untracked: GitFileStatus[] = []

  for (const line of output.split('\n')) {
    if (!line) continue
    const x = line[0]
    const y = line[1]
    let filePath = line.substring(3)
    if (!filePath) continue

    // renamed 文件格式: "XY old_path -> new_path"，取新路径
    if ((x === 'R' || x === 'C') && filePath.includes(' -> ')) {
      filePath = filePath.split(' -> ')[1]
    }

    filePath = cleanPath(filePath)

    // 过滤隐藏文件/目录（以 . 开头）和 node_modules
    const topLevel = filePath.split('/')[0]
    if (topLevel.startsWith('.') || topLevel === 'node_modules') continue

    // 过滤目录条目（如 symlink 目录、子目录），只保留文件
    if (!filePath.endsWith('/')) {
      try {
        const fullPath = path.join(gitDir, filePath)
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) continue
      } catch {
        // 文件不存在（可能已删除），保留条目
      }
    } else {
      // 路径以 / 结尾，明确是目录
      continue
    }

    if (x === '?' && y === '?') {
      untracked.push({ path: filePath, statusCode: '?' })
      continue
    }
    if (x === '!' && y === '!') continue

    if (x !== ' ' && x !== '?') {
      const code: GitStatusCode = x === 'D' ? 'D' : x === 'R' ? 'R' : x === 'C' ? 'C' : x === 'A' ? 'A' : 'M'
      staged.push({ path: filePath, statusCode: code })
    }
    if (y !== ' ' && y !== '?') {
      const code: GitStatusCode = y === 'D' ? 'D' : y === 'R' ? 'R' : y === 'C' ? 'C' : y === 'A' ? 'A' : 'M'
      unstaged.push({ path: filePath, statusCode: code })
    }
  }

  return { staged, unstaged, untracked }
}

// GET — 扫描 git 目录 或 获取指定目录的 git status
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

  const { id } = await params
  const fileRoot = getFileRoot(id)
  const url = new URL(request.url)
  const dirParam = url.searchParams.get('dir') // 相对路径，如 'my-project'

  // scan 模式：返回所有 git 目录 + 分支
  if (url.searchParams.has('scan')) {
    const gitDirs: { path: string; branch: string }[] = []
    // 根目录本身是 git repo
    if (fs.existsSync(path.join(fileRoot, '.git'))) {
      const branch = await getBranch(fileRoot)
      gitDirs.push({ path: '', branch })
    }
    // 子目录中的 git repo
    const subDirs = await scanGitDirs(fileRoot)
    gitDirs.push(...subDirs)
    return NextResponse.json<GitScanResponse>({ gitDirs })
  }

  // diff 模式：获取指定文件的旧/新内容用于全文件 diff
  if (url.searchParams.has('diff')) {
    const filePath = url.searchParams.get('diff') // 相对于 git 目录的路径
    const staged = url.searchParams.get('staged') === '1'
    if (!filePath) {
      return NextResponse.json({ error: '缺少文件路径' }, { status: 400 })
    }
    try {
      const gitDir = resolveGitDir(fileRoot, dirParam)
      if (!gitDir) {
        return NextResponse.json({ error: '不是 Git 仓库' }, { status: 400 })
      }
      // 新文件内容：磁盘上的当前版本
      let newContent = ''
      try {
        newContent = fs.readFileSync(path.join(gitDir, filePath), 'utf-8')
      } catch { /* ignore */ }

      // 旧文件内容：从 git 获取
      let oldContent = ''
      if (staged) {
        // 已暂存：对比 HEAD vs index
        try {
          const { stdout } = await git(gitDir, ['-c', 'core.quotepath=false', 'show', `HEAD:${filePath}`])
          oldContent = stdout
        } catch { /* 文件在 HEAD 中不存在，说明是新增 */ }
      } else {
        // 未暂存：对比 index vs 工作区
        try {
          const { stdout } = await git(gitDir, ['-c', 'core.quotepath=false', 'show', `:${filePath}`])
          oldContent = stdout
        } catch { /* 文件不在 index 中，说明是 untracked */ }
      }

      return NextResponse.json({ oldContent, newContent })
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : '获取 diff 失败' }, { status: 500 })
    }
  }

  // status 模式：获取指定目录的 git 状态
  try {
    const gitDir = resolveGitDir(fileRoot, dirParam)
    if (!gitDir) {
      return NextResponse.json<GitStatusResponse>({ isGitRepo: false, branches: [], staged: [], unstaged: [], untracked: [] })
    }

    const [statusResult, branchResult, branchesResult, remoteResult] = await Promise.all([
      git(gitDir, ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-u']),
      git(gitDir, ['branch', '--show-current']).catch(() => ({ stdout: '', stderr: '' })),
      git(gitDir, ['branch']).catch(() => ({ stdout: '', stderr: '' })),
      git(gitDir, ['remote']).catch(() => ({ stdout: '', stderr: '' })),
    ])

    const { staged, unstaged, untracked } = parsePorcelain(statusResult.stdout, gitDir)
    const currentBranch = branchResult.stdout.trim()
    const branches = branchesResult.stdout
      .split('\n')
      .map(b => b.trim())
      .filter(Boolean)
      .map(b => ({ name: b.replace(/^\* /, ''), isCurrent: b.startsWith('* ') }))

    return NextResponse.json<GitStatusResponse>({
      isGitRepo: true,
      branch: currentBranch || undefined,
      branches,
      hasRemote: remoteResult.stdout.trim().length > 0,
      staged,
      unstaged,
      untracked,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Git 操作失败' }, { status: 500 })
  }
}

// POST — Git 操作（dir 字段指定 git 子目录）
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: '未授权' }, { status: 401 })

  const { id } = await params
  const fileRoot = getFileRoot(id)
  const body = await request.json()
  const { action, path: filePath, message, dir } = body as { action: string; path?: string; message?: string; dir?: string }

  try {
    const gitDir = resolveGitDir(fileRoot, dir || null)
    if (!gitDir) {
      return NextResponse.json({ success: false, error: '不是 Git 仓库' }, { status: 400 })
    }
    switch (action) {
      case 'stage':
        if (!filePath) return NextResponse.json({ success: false, error: '缺少文件路径' }, { status: 400 })
        await git(gitDir, ['add', filePath])
        return NextResponse.json({ success: true })

      case 'unstage':
        if (!filePath) return NextResponse.json({ success: false, error: '缺少文件路径' }, { status: 400 })
        await git(gitDir, ['reset', 'HEAD', filePath])
        return NextResponse.json({ success: true })

      case 'stage-all':
        await git(gitDir, ['add', '-A'])
        return NextResponse.json({ success: true })

      case 'unstage-all':
        await git(gitDir, ['reset', 'HEAD'])
        return NextResponse.json({ success: true })

      case 'discard':
        if (!filePath) return NextResponse.json({ success: false, error: '缺少文件路径' }, { status: 400 })
        await git(gitDir, ['checkout', '--', filePath])
        return NextResponse.json({ success: true })

      case 'discard-all':
        await git(gitDir, ['checkout', '--', '.'])
        return NextResponse.json({ success: true })

      case 'commit':
        if (!message?.trim()) return NextResponse.json({ success: false, error: '提交信息不能为空' }, { status: 400 })
        await git(gitDir, ['commit', '-m', message])
        return NextResponse.json({ success: true })

      case 'undo-commit':
        await git(gitDir, ['reset', '--soft', 'HEAD~1'])
        return NextResponse.json({ success: true })

      case 'push':
        await git(gitDir, ['push'])
        return NextResponse.json({ success: true })

      case 'checkout':
        if (!filePath) return NextResponse.json({ success: false, error: '缺少分支名' }, { status: 400 })
        await git(gitDir, ['checkout', filePath])
        return NextResponse.json({ success: true })

      default:
        return NextResponse.json({ success: false, error: `未知操作: ${action}` }, { status: 400 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Git 操作失败'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
