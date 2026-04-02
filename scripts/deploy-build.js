#!/usr/bin/env node
/**
 * deploy-build.js
 * 
 * 生成可独立部署的 GClaw 服务端包（tar.gz）。
 * 产物可直接部署到任何有 Node.js 的服务器上。
 * 
 * 用法: node scripts/deploy-build.js
 * 产物: dist/gclaw-server.tar.gz
 * 
 * 部署到服务器后:
 *   tar xzf gclaw-server.tar.gz
 *   cd gclaw-server
 *   PORT=3000 HOSTNAME=0.0.0.0 node server.js
 * 
 * 环境变量:
 *   PORT          - 监听端口 (默认 3000)
 *   HOSTNAME      - 绑定地址 (默认 0.0.0.0)
 *   GCLAW_DATA_DIR - 数据目录 (默认 ./data 相对于 server.js)
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { ROOT, buildAndLocateStandalone, assembleServerBundle, printBundleSize } = require('./standalone-utils')

const DIST_DIR = path.join(ROOT, 'dist')
const DEPLOY_DIR = path.join(DIST_DIR, 'gclaw-server')
const TARBALL = path.join(DIST_DIR, 'gclaw-server.tar.gz')

// 1. 构建 standalone 并定位
const standaloneRoot = buildAndLocateStandalone()

// 2. 组装到 dist/gclaw-server/
assembleServerBundle(standaloneRoot, DEPLOY_DIR)

// 3. 生成启动脚本 start.sh
const startScript = `#!/bin/bash
# GClaw Server 启动脚本
# 环境变量:
#   PORT          - 监听端口 (默认 3000)
#   HOSTNAME      - 绑定地址 (默认 0.0.0.0)
#   GCLAW_DATA_DIR - 数据持久化目录 (默认 当前目录下的 data/)

cd "$(dirname "$0")"

export PORT=\${PORT:-3000}
export HOSTNAME=\${HOSTNAME:-0.0.0.0}
export GCLAW_DATA_DIR=\${GCLAW_DATA_DIR:-$(pwd)/data}

echo "[GClaw] Starting server on \${HOSTNAME}:\${PORT}"
echo "[GClaw] Data directory: \${GCLAW_DATA_DIR}"

exec node server.js
`
fs.writeFileSync(path.join(DEPLOY_DIR, 'start.sh'), startScript, { mode: 0o755 })

printBundleSize(DEPLOY_DIR)

// 4. 打包为 tar.gz
console.log('[deploy] Creating tarball...')
fs.mkdirSync(DIST_DIR, { recursive: true })
execSync(`tar czf "${TARBALL}" -C "${DIST_DIR}" gclaw-server`, { stdio: 'inherit' })

const tarSize = execSync(`du -sh "${TARBALL}" 2>/dev/null || echo "unknown"`)
  .toString().trim()
console.log(`[deploy] Done! Tarball: ${TARBALL}`)
console.log(`[deploy] Tarball size: ${tarSize}`)
console.log('')
console.log('=== 部署说明 ===')
console.log('1. 将 gclaw-server.tar.gz 上传到服务器')
console.log('2. 解压: tar xzf gclaw-server.tar.gz')
console.log('3. 启动: cd gclaw-server && bash start.sh')
console.log('   或: PORT=8080 HOSTNAME=0.0.0.0 node server.js')
console.log('')
console.log('环境变量:')
console.log('  PORT           监听端口 (默认 3000)')
console.log('  HOSTNAME       绑定地址 (默认 0.0.0.0)')
console.log('  GCLAW_DATA_DIR 数据目录 (默认 ./data)')
