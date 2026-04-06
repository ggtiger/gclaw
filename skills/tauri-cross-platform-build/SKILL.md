---
name: tauri-cross-platform-build
description: Tauri v2 桌面应用跨平台构建、macOS 代码签名公证、GitHub Actions CI/CD 发布的完整指南
---

# Tauri v2 跨平台构建与发布

为 Tauri v2 桌面应用添加跨平台支持（macOS/Windows/Linux）和 GitHub Actions 自动化发布。

## 适用场景

- Tauri v2 应用需要从仅支持一个平台扩展到多平台
- 配置 GitHub Actions CI/CD 自动构建发布
- 配置 macOS 代码签名和公证（Notarization）
- 排查 Tauri 构建中的跨平台问题

## 一、lib.rs 跨平台适配

### 1. 添加平台辅助函数

```rust
fn platform_name() -> &'static str {
    if cfg!(target_os = "windows") { "windows" }
    else if cfg!(target_os = "macos") { "macos" }
    else { "linux" }
}

fn path_separator() -> &'static str {
    if cfg!(target_os = "windows") { ";" } else { ":" }
}

fn curl_cmd() -> &'static str {
    if cfg!(target_os = "windows") { "curl.exe" } else { "curl" }
}
```

### 2. 下载 URL 按平台生成

```rust
fn node_download_url() -> String {
    let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
    if cfg!(target_os = "windows") {
        format!("{}/v{}/node-v{}-win-{}.zip", MIRROR, VER, VER, arch)
    } else if cfg!(target_os = "macos") {
        format!("{}/v{}/node-v{}-darwin-{}.tar.gz", MIRROR, VER, VER, arch)
    } else {
        format!("{}/v{}/node-v{}-linux-{}.tar.xz", MIRROR, VER, VER, arch)
    }
}
```

### 3. which 命令差异

```rust
fn which_node() -> Option<String> {
    let cmd = if cfg!(target_os = "windows") { "where" } else { "which" };
    // Windows where 可能返回多行，取第一行
    let path = String::from_utf8_lossy(&output.stdout)
        .lines().next().unwrap_or("").trim().to_string();
    ...
}
```

### 4. 二进制路径差异

| 平台 | Node 路径 | Python 路径 |
|------|-----------|-------------|
| macOS/Linux | `node/bin/node` | `python/bin/python3` |
| Windows | `node/node.exe`（根目录） | `python/bin/python.exe` |

### 5. 解压逻辑差异

```rust
let extract_status = if url.ends_with(".tar.xz") {
    Command::new("tar").args(&["-xJf", ...]).status()  // Linux Node
} else if url.ends_with(".zip") {
    Command::new("tar").args(&["-xf", ...]).status()    // Windows Node
} else {
    Command::new("tar").args(&["-xzf", ...]).status()   // macOS/Python
};
```

## 二、tauri.conf.json 配置

```json
{
  "build": {
    "beforeBuildCommand": "node scripts/bundle-sidecar.js",
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:3100",
    "frontendDist": "./frontend"
  },
  "bundle": {
    "targets": "all",
    "resources": [
      "server/server.js",
      "server/package.json",
      "server/.next/**/*",
      "server/node_modules/**/*",
      "server/skills/**/*"
    ],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

**关键点：**
- `beforeBuildCommand` 改为 `bundle-sidecar.js`（内含 `next build`），确保 `src-tauri/server/` 在构建前生成
- 资源占位文件需提交到仓库（CI `cargo check` 需要）
- 图标源文件 `icon-source.png`（1024x1024）提交到仓库，CI 中 `npx tauri icon` 生成各平台图标

## 三、资源占位文件

Tauri build script 编译时检查资源是否存在，CI 中 `cargo check` 需要这些文件：

```
src-tauri/server/
├── server.js          # 占位: // placeholder
├── package.json       # 占位: {}
├── .next/.gitkeep
├── node_modules/.gitkeep
└── skills/.gitkeep
```

`.gitignore` 配置：
```gitignore
/src-tauri/server/*
!/src-tauri/server/package.json
!/src-tauri/server/server.js
!/src-tauri/server/.next/
/src-tauri/server/.next/*
!/src-tauri/server/.next/.gitkeep
!/src-tauri/server/node_modules/
/src-tauri/server/node_modules/*
!/src-tauri/server/node_modules/.gitkeep
!/src-tauri/server/skills/
/src-tauri/server/skills/*
!/src-tauri/server/skills/.gitkeep
```

## 四、standalone-utils.js 跨平台

替换 Unix `find` 命令为 Node.js 递归搜索：

```js
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
```

## 五、GitHub Actions 配置

### CI 工作流（.github/workflows/ci.yml）

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  check:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos
            runner: macos-latest
          - platform: windows
            runner: windows-latest
          - platform: linux
            runner: ubuntu-22.04
    runs-on: ${{ matrix.runner }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with: { workspaces: "src-tauri -> target" }
      # Linux 额外依赖
      - if: matrix.platform == 'linux'
        run: sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
      - run: npx tauri icon src-tauri/icons/icon-source.png
      - run: cargo check --manifest-path src-tauri/Cargo.toml
```

### Release 工作流（.github/workflows/release.yml）

```yaml
name: Release
on:
  push:
    tags: ['v*']
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-arm64
            runner: macos-latest
            target: aarch64-apple-darwin
          - platform: macos-x64
            runner: macos-latest
            target: x86_64-apple-darwin
          - platform: windows-x64
            runner: windows-latest
            target: ''
          - platform: linux-x64
            runner: ubuntu-22.04
            target: ''
            bundles: deb,rpm  # 跳过 AppImage（linuxdeploy 不稳定）
    runs-on: ${{ matrix.runner }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with: { workspaces: "src-tauri -> target" }
      - if: matrix.platform == 'linux-x64'
        run: sudo apt-get install -y libwebkit2gtk-4.1-dev ...
      - if: matrix.target != ''
        run: rustup target add ${{ matrix.target }}
      - run: npx tauri icon src-tauri/icons/icon-source.png
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # macOS 签名 + 公证（非 macOS 平台会忽略）
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'GClaw ${{ github.ref_name }}'
          releaseDraft: true
          tauriScript: npx tauri
          args: ...

  release:
    needs: build
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - env: { GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
        run: gh release edit "${GITHUB_REF_NAME}" --draft=false
```

## 六、macOS 代码签名与公证

### 证书创建

**关键：必须用 `-legacy` 参数，macOS `security import` 不支持 OpenSSL 3.x 默认的 AES-256-CBC 格式。**

```bash
# 1. 生成 CSR → 上传 Apple Developer → 下载 .cer
# 2. 转换并打包
openssl x509 -inform DER -in developerID_application.cer -out dev-id.pem
openssl pkcs12 -export -legacy \
  -inkey dev-id.key -in dev-id.pem \
  -out dev-id.p12 -passout pass:YOUR_PASSWORD

# 3. 设置 GitHub Secrets（用 gh CLI 最可靠）
base64 -i dev-id.p12 | tr -d '\n' | gh secret set APPLE_CERTIFICATE -R owner/repo
echo -n "YOUR_PASSWORD" | gh secret set APPLE_CERTIFICATE_PASSWORD -R owner/repo
```

### 必需的 Secrets

| Secret | 说明 |
|--------|------|
| `APPLE_CERTIFICATE` | .p12 base64（legacy 格式） |
| `APPLE_CERTIFICATE_PASSWORD` | .p12 密码 |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Name (TEAMID)` |
| `APPLE_ID` | Apple ID 邮箱 |
| `APPLE_PASSWORD` | App 专用密码（appleid.apple.com） |
| `APPLE_TEAM_ID` | 10 位 Team ID |

## 七、常见问题排查

| 错误 | 原因 | 解决 |
|------|------|------|
| `resource path doesn't exist` | Tauri 编译时检查资源文件 | 添加占位文件 + 修改 beforeBuildCommand |
| `icon ... No such file` | 图标未生成 | CI 中添加 `npx tauri icon` 步骤 |
| `MAC verification failed` | PKCS12 格式不兼容 | 用 `openssl pkcs12 -export -legacy` |
| `binary is not signed` | 原生库未签名 | 排除不需要的原生库或逐一签名 |
| `failed to run linuxdeploy` | AppImage 在 CI 不稳定 | Linux 指定 `bundles: deb,rpm` |
| `next lint` 交互式创建 | 无 ESLint 配置 | 移除 CI lint 步骤或添加配置 |
