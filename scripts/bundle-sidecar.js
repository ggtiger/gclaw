#!/usr/bin/env node
/**
 * bundle-sidecar.js
 * 
 * 将 Next.js standalone 产物打包到 src-tauri/server/ 目录，
 * 供 Tauri 生产模式作为 sidecar 运行。
 * 
 * 步骤：
 * 1. 执行 next build（生成 .next/standalone/）
 * 2. 将 standalone 产物复制到 src-tauri/server/
 * 3. 复制 .next/static 和 public 到对应位置
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const STANDALONE = path.join(ROOT, '.next', 'standalone')
const SERVER_DIR = path.join(ROOT, 'src-tauri', 'server')
const STATIC_SRC = path.join(ROOT, '.next', 'static')
const PUBLIC_SRC = path.join(ROOT, 'public')

// 不需要复制到 sidecar 的目录
const SKIP_DIRS = new Set(['data', '.claude', 'node_modules/.cache'])

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isSymbolicLink()) {
      // 复制 symlink 本身
      try {
        const target = fs.readlinkSync(srcPath)
        fs.symlinkSync(target, destPath)
      } catch (e) {
        // 忽略无法复制的 symlink
      }
    } else if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      copyDirSync(srcPath, destPath)
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath)
    }
    // 跳过 socket、fifo 等特殊文件
  }
}

function rmSync(p) {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true })
  }
}

console.log('[bundle-sidecar] Step 1: Building Next.js (standalone)...')
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })

if (!fs.existsSync(STANDALONE)) {
  console.error('[bundle-sidecar] ERROR: .next/standalone not found. Ensure next.config.ts has output: "standalone"')
  process.exit(1)
}

console.log('[bundle-sidecar] Step 2: Locating standalone server.js...')
// Next.js standalone 保留了完整的绝对路径结构
// server.js 位于 .next/standalone/<absolute-project-path>/server.js
const { execSync: exec2 } = require('child_process')
const serverJsPath = exec2(`find "${STANDALONE}" -maxdepth 10 -name "server.js" -not -path "*/node_modules/*" -type f`, { encoding: 'utf-8' }).trim().split('\n')[0]
if (!serverJsPath) {
  console.error('[bundle-sidecar] ERROR: server.js not found in standalone output')
  process.exit(1)
}
const standaloneRoot = path.dirname(serverJsPath)
console.log('[bundle-sidecar] Found standalone root:', standaloneRoot)

console.log('[bundle-sidecar] Step 3: Copying standalone to src-tauri/server/...')
rmSync(SERVER_DIR)
copyDirSync(standaloneRoot, SERVER_DIR)

// 修复 package.json: Next.js standalone server.js 是 CommonJS，
// 但项目 package.json 可能包含 "type": "module"，需要移除
const serverPkgPath = path.join(SERVER_DIR, 'package.json')
if (fs.existsSync(serverPkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(serverPkgPath, 'utf-8'))
  if (pkg.type === 'module') {
    delete pkg.type
    fs.writeFileSync(serverPkgPath, JSON.stringify(pkg, null, 2) + '\n')
    console.log('[bundle-sidecar]   Fixed package.json: removed "type": "module"')
  }
}

console.log('[bundle-sidecar] Step 4: Copying .next/static...')
const staticDest = path.join(SERVER_DIR, '.next', 'static')
copyDirSync(STATIC_SRC, staticDest)

console.log('[bundle-sidecar] Step 5: Copying public/...')
if (fs.existsSync(PUBLIC_SRC)) {
  const publicDest = path.join(SERVER_DIR, 'public')
  copyDirSync(PUBLIC_SRC, publicDest)
}

// 复制 skills 目录（如果存在）
const skillsSrc = path.join(ROOT, 'skills')
if (fs.existsSync(skillsSrc)) {
  console.log('[bundle-sidecar] Step 6: Copying skills/...')
  const skillsDest = path.join(SERVER_DIR, 'skills')
  copyDirSync(skillsSrc, skillsDest)
}

console.log('[bundle-sidecar] Done! Server bundle at:', SERVER_DIR)

// 补充 Next.js standalone file tracing 可能遗漏的文件
// Claude Agent SDK 的 cli.js 是动态引用，standalone 不会自动包含
const sdkSrc = path.join(ROOT, 'node_modules', '@anthropic-ai', 'claude-agent-sdk')
const sdkDest = path.join(SERVER_DIR, 'node_modules', '@anthropic-ai', 'claude-agent-sdk')
if (fs.existsSync(sdkSrc) && fs.existsSync(sdkDest)) {
  // 复制 standalone 遗漏的文件（如 cli.js）
  for (const f of fs.readdirSync(sdkSrc)) {
    const srcFile = path.join(sdkSrc, f)
    const destFile = path.join(sdkDest, f)
    if (fs.statSync(srcFile).isFile() && !fs.existsSync(destFile)) {
      fs.copyFileSync(srcFile, destFile)
      console.log(`[bundle-sidecar]   Patched SDK: copied ${f}`)
    }
  }
}

const size = execSync(`du -sh "${SERVER_DIR}" 2>/dev/null || echo "unknown"`)
  .toString().trim()
console.log(`[bundle-sidecar] Bundle size: ${size}`)
