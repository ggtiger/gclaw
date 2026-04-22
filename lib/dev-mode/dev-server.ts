import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { logger } from '@/lib/logger'

const MAIN_PORT = parseInt(process.env.PORT || '3100', 10)

export interface DevServerInfo {
  port: number
  url: string
  process: ChildProcess
}

/**
 * 检查端口是否可用
 */
function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = http.createServer()
    server.on('error', () => resolve(false))
    server.listen(port, () => {
      server.close(() => resolve(true))
    })
  })
}

/**
 * 查找可用端口（从 mainPort+1 开始）
 */
async function findAvailablePort(): Promise<number> {
  for (let port = MAIN_PORT + 1; port < MAIN_PORT + 100; port++) {
    if (await checkPortAvailable(port)) {
      return port
    }
  }
  throw new Error('No available port found')
}

/**
 * 检查 dev server 是否已就绪
 */
function waitForServer(url: string, timeoutMs = 60000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Dev server startup timeout'))
        return
      }
      http.get(url, res => {
        res.resume()
        // 等待 200 响应，500/404 说明 Next.js 还在编译
        if (res.statusCode === 200) {
          resolve()
        } else {
          setTimeout(check, 2000)
        }
      }).on('error', () => {
        setTimeout(check, 1000)
      })
    }
    // 给 dev server 初始启动时间
    setTimeout(check, 5000)
  })
}

/**
 * 启动 dev server（在 worktree 目录中运行 npm run dev）
 */
export async function startDevServer(worktreePath: string): Promise<DevServerInfo> {
  const port = await findAvailablePort()
  const url = `http://localhost:${port}`

  logger.info(`[DevMode] Starting dev server on port ${port} in ${worktreePath}`)

  // 预创建 .next 缓存目录，避免 webpack 缓存 ENOENT 警告
  const cacheDir = path.join(worktreePath, '.next', 'cache', 'webpack')
  fs.mkdirSync(path.join(cacheDir, 'client-development'), { recursive: true })
  fs.mkdirSync(path.join(cacheDir, 'server-development'), { recursive: true })

  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: '0.0.0.0',
    // 共享主服务的数据目录
    GCLAW_DATA_DIR: process.env.GCLAW_DATA_DIR || path.join(process.cwd(), 'data'),
  }

  const child = spawn('npx', ['next', 'dev', '-p', String(port)], {
    cwd: worktreePath,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  })

  // 日志转发
  child.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString().trim()
    if (msg) logger.info(`[DevServer:stdout] ${msg}`)
  })
  child.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim()
    if (msg) logger.info(`[DevServer:stderr] ${msg}`)
  })

  child.on('error', err => {
    logger.error(`[DevServer] Process error:`, err)
  })

  child.on('exit', (code, signal) => {
    logger.info(`[DevServer] Process exited: code=${code}, signal=${signal}`)
  })

  // 等待 dev server 就绪
  await waitForServer(url)

  logger.info(`[DevMode] Dev server ready at ${url}`)
  return { port, url, process: child }
}

/**
 * 停止 dev server 进程
 */
export function stopDevServer(process: ChildProcess | null): void {
  if (!process) return
  try {
    logger.info('[DevMode] Stopping dev server')
    // 在 Windows 上需要 process.kill
    if (process.pid) {
      process.kill('SIGTERM')
      // 强制退出（如果 SIGTERM 无效）
      setTimeout(() => {
        try { process.kill('SIGKILL') } catch { /* already dead */ }
      }, 5000)
    }
  } catch (err) {
    logger.warn('[DevMode] Error stopping dev server:', err)
  }
}
