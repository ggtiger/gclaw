#!/usr/bin/env node
/**
 * standalone-utils.js
 * 
 * Next.js standalone 产物打包的共享工具函数。
 * 被 bundle-sidecar.js 和 deploy-build.js 共同使用。
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const STANDALONE = path.join(ROOT, '.next', 'standalone')
const STATIC_SRC = path.join(ROOT, '.next', 'static')
const PUBLIC_SRC = path.join(ROOT, 'public')

// 不需要复制到产物的目录
const SKIP_DIRS = new Set(['data', '.claude', 'node_modules/.cache', '@img'])

/**
 * 递归复制目录，处理 symlink 和特殊文件
 */
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isSymbolicLink()) {
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

/**
 * 递归搜索文件（跨平台，替代 Unix find 命令）
 * @param {string} dir - 搜索根目录
 * @param {string} filename - 目标文件名
 * @param {number} maxDepth - 最大搜索深度
 * @returns {string|null} 找到的文件绝对路径，未找到返回 null
 */
function findFileSync(dir, filename, maxDepth = 10) {
  if (maxDepth <= 0 || !fs.existsSync(dir)) return null
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue
        const result = findFileSync(path.join(dir, entry.name), filename, maxDepth - 1)
        if (result) return result
      } else if (entry.name === filename) {
        return path.join(dir, entry.name)
      }
    }
  } catch { /* ignore permission errors */ }
  return null
}

/**
 * 执行 next build 并定位 standalone root
 * @returns {string} standalone root 路径（包含 server.js 的目录）
 */
function buildAndLocateStandalone() {
  console.log('[standalone] Building Next.js (standalone)...')
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })

  if (!fs.existsSync(STANDALONE)) {
    console.error('[standalone] ERROR: .next/standalone not found. Ensure next.config.ts has output: "standalone"')
    process.exit(1)
  }

  console.log('[standalone] Locating standalone server.js...')
  const serverJsPath = findFileSync(STANDALONE, 'server.js')

  if (!serverJsPath) {
    console.error('[standalone] ERROR: server.js not found in standalone output')
    process.exit(1)
  }

  const standaloneRoot = path.dirname(serverJsPath)
  console.log('[standalone] Found standalone root:', standaloneRoot)
  return standaloneRoot
}

/**
 * 将 standalone 产物组装到目标目录
 * @param {string} standaloneRoot - standalone root 路径
 * @param {string} destDir - 目标输出目录
 */
function assembleServerBundle(standaloneRoot, destDir) {
  console.log('[standalone] Copying standalone to', destDir)
  rmSync(destDir)
  copyDirSync(standaloneRoot, destDir)

  // 修复 package.json: server.js 是 CommonJS，移除 "type": "module"
  const pkgPath = path.join(destDir, 'package.json')
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    if (pkg.type === 'module') {
      delete pkg.type
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
      console.log('[standalone]   Fixed package.json: removed "type": "module"')
    }
  }

  // 复制 .next/static
  console.log('[standalone] Copying .next/static...')
  copyDirSync(STATIC_SRC, path.join(destDir, '.next', 'static'))

  // 复制 public
  if (fs.existsSync(PUBLIC_SRC)) {
    console.log('[standalone] Copying public/...')
    copyDirSync(PUBLIC_SRC, path.join(destDir, 'public'))
  }

  // 复制 skills
  const skillsSrc = path.join(ROOT, 'skills')
  if (fs.existsSync(skillsSrc)) {
    console.log('[standalone] Copying skills/...')
    copyDirSync(skillsSrc, path.join(destDir, 'skills'))
  }

  // 补充 Claude Agent SDK 遗漏的文件
  patchSdkFiles(destDir)

  // 移除不需要的原生二进制（macOS 公证要求所有二进制签名，排除可避免问题）
  removeNativeBinaries(destDir)
}

/**
 * 补充 Next.js standalone file tracing 遗漏的 SDK 文件
 */
function patchSdkFiles(destDir) {
  const sdkSrc = path.join(ROOT, 'node_modules', '@anthropic-ai', 'claude-agent-sdk')
  const sdkDest = path.join(destDir, 'node_modules', '@anthropic-ai', 'claude-agent-sdk')
  if (fs.existsSync(sdkSrc) && fs.existsSync(sdkDest)) {
    for (const f of fs.readdirSync(sdkSrc)) {
      const srcFile = path.join(sdkSrc, f)
      const destFile = path.join(sdkDest, f)
      if (fs.statSync(srcFile).isFile() && !fs.existsSync(destFile)) {
        fs.copyFileSync(srcFile, destFile)
        console.log(`[standalone]   Patched SDK: copied ${f}`)
      }
    }
  }
}

function printBundleSize(dir) {
  const size = execSync(`du -sh "${dir}" 2>/dev/null || echo "unknown"`)
    .toString().trim()
  console.log(`[standalone] Bundle size: ${size}`)
}

/**
 * 移除不需要的原生二进制文件（macOS 公证要求所有二进制都签名，排除可避免问题）
 */
function removeNativeBinaries(dir) {
  const patterns = [
    // sharp 的原生库（桌面端不需要服务端图片处理）
    path.join(dir, 'node_modules', '@img'),
    // 其他平台的原生模块
    path.join(dir, 'node_modules', 'sharp-*'),
  ]
  for (const pattern of patterns) {
    if (fs.existsSync(pattern)) {
      console.log('[standalone] Removing native binary:', pattern)
      rmSync(pattern)
    }
  }
}

module.exports = {
  ROOT,
  STANDALONE,
  copyDirSync,
  rmSync,
  buildAndLocateStandalone,
  assembleServerBundle,
  patchSdkFiles,
  printBundleSize,
}
