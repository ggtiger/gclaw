#!/usr/bin/env node
/**
 * bundle-sidecar.js
 * 
 * 将 Next.js standalone 产物打包到 src-tauri/server/ 目录，
 * 供 Tauri 生产模式作为 sidecar 运行。
 */

const path = require('path')
const { ROOT, buildAndLocateStandalone, assembleServerBundle, printBundleSize } = require('./standalone-utils')

const SERVER_DIR = path.join(ROOT, 'src-tauri', 'server')

const standaloneRoot = buildAndLocateStandalone()
assembleServerBundle(standaloneRoot, SERVER_DIR)

console.log('[bundle-sidecar] Done! Server bundle at:', SERVER_DIR)
printBundleSize(SERVER_DIR)
