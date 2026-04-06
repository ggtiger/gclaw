# GClaw 跨平台构建与发布指南

## 概述

GClaw Tauri 桌面应用支持 macOS（ARM64/x64）、Windows x64、Linux x64 三平台，通过 GitHub Actions 自动打包发布。

## 架构

```
┌─────────────────────────────────────────────┐
│ GitHub Actions (tag v* 触发)                  │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────┐ ┌──────┐│
│  │macOS ARM │ │macOS x64 │ │ Win  │ │Linux ││
│  │  .dmg    │ │  .dmg    │ │.msi  │ │.deb  ││
│  │  .app    │ │  .app    │ │.exe  │ │.rpm  ││
│  └──────────┘ └──────────┘ └──────┘ └──────┘│
│         ↓ 全部完成后 ↓                       │
│  ┌──────────────────────────────────┐        │
│  │ GitHub Release (draft → publish) │        │
│  └──────────────────────────────────┘        │
└─────────────────────────────────────────────┘
```

## 文件清单

| 文件 | 职责 |
|------|------|
| `src-tauri/src/lib.rs` | 跨平台运行时管理（下载 URL、二进制路径、解压逻辑） |
| `src-tauri/tauri.conf.json` | 构建配置（beforeBuildCommand、图标、资源） |
| `scripts/standalone-utils.js` | Next.js standalone 产物打包（跨平台） |
| `scripts/bundle-sidecar.js` | 打包 server bundle 到 `src-tauri/server/` |
| `.github/workflows/release.yml` | 发布工作流（四平台 matrix + 签名 + 公证） |
| `.github/workflows/ci.yml` | PR/push 构建检查 |
| `src-tauri/icons/icon-source.png` | 1024x1024 源图标（CI 自动生成各平台图标） |

## 跨平台适配要点

### lib.rs 中的平台判断

使用 `cfg!(target_os = "...")` 编译期条件：

```rust
// 平台辅助函数
fn platform_name() -> &'static str { ... }  // "windows" / "macos" / "linux"
fn path_separator() -> &'static str { ... }  // ";" / ":"
fn curl_cmd() -> &'static str { ... }        // "curl.exe" / "curl"
```

### 运行时下载 URL

| 运行时 | macOS | Linux | Windows |
|--------|-------|-------|---------|
| Node.js | `darwin-{arch}.tar.gz` | `linux-{arch}.tar.xz` | `win-{arch}.zip` |
| Python | `{arch}-apple-darwin` | `{arch}-unknown-linux-gnu` | `{arch}-pc-windows-msvc-shared` |

### 关键差异

| 项目 | macOS/Linux | Windows |
|------|-------------|---------|
| 查找命令 | `which` | `where` |
| Python 命令 | `python3` | `python` |
| Node 二进制位置 | `bin/node` | `node.exe`（根目录） |
| PATH 分隔符 | `:` | `;` |
| 解压 .tar.gz | `tar -xzf` | `tar -xzf` |
| 解压 .tar.xz | `tar -xJf` | `tar -xJf` |
| 解压 .zip | N/A | `tar -xf` |

## 构建流程

### 1. CI 检查（push/PR 到 main）

```yaml
# .github/workflows/ci.yml
三平台 cargo check + npm ci
```

### 2. Release 构建（push tag v*）

```
1. npm ci                    → 安装前端依赖
2. rustup target add         → 添加交叉编译目标（macOS）
3. npx tauri icon            → 从 icon-source.png 生成图标
4. bundle-sidecar.js         → next build + 打包 server 到 src-tauri/server/
5. tauri build               → 编译 Rust + 打包安装包
6. macOS: 签名 + 公证        → APPLE_CERTIFICATE 环境变量触发
7. 上传到 GitHub Release     → tauri-action 自动处理
8. publish release           → draft → publish
```

### 3. 本地构建

```bash
npm run tauri:build
# 等价于: tauri build
# beforeBuildCommand 自动运行 bundle-sidecar.js
```

## macOS 代码签名与公证

### 前提条件

- Apple Developer 账号（$99/年）
- Developer ID Application 证书

### Secrets 配置

| Secret | 说明 | 示例 |
|--------|------|------|
| `APPLE_CERTIFICATE` | .p12 证书 base64（legacy 格式） | `base64 -i cert.p12 \| tr -d '\n'` |
| `APPLE_CERTIFICATE_PASSWORD` | .p12 密码 | `gclaw2026` |
| `APPLE_SIGNING_IDENTITY` | 签名身份 | `Developer ID Application: hu wang (G4Q74DQW93)` |
| `APPLE_ID` | Apple ID 邮箱 | `user@example.com` |
| `APPLE_PASSWORD` | App 专用密码 | `xxxx-xxxx-xxxx-xxxx` |
| `APPLE_TEAM_ID` | Team ID | `G4Q74DQW93` |

### 证书创建要点

**关键：必须用 `-legacy` 参数创建 PKCS12，否则 macOS `security import` 不兼容 OpenSSL 3.x 默认格式。**

```bash
# 1. 生成 CSR
openssl req -new -newkey rsa:2048 -nodes \
  -keyout dev-id.key -out dev-id.csr \
  -subj "/emailAddress=dev@example.com/CN=Developer ID Application: Your Name/C=CN"

# 2. 上传 CSR 到 Apple Developer → 下载 .cer

# 3. 转换 .cer 为 .pem
openssl x509 -inform DER -in developerID_application.cer -out dev-id.pem

# 4. 用 -legacy 格式打包 .p12（macOS security import 需要）
openssl pkcs12 -export -legacy \
  -inkey dev-id.key -in dev-id.pem \
  -out dev-id.p12 -passout pass:YOUR_PASSWORD

# 5. Base64 编码（用 gh CLI 设置 Secret 最可靠）
base64 -i dev-id.p12 | tr -d '\n' | gh secret set APPLE_CERTIFICATE -R owner/repo
echo -n "YOUR_PASSWORD" | gh secret set APPLE_CERTIFICATE_PASSWORD -R owner/repo
```

### 原生二进制注意事项

macOS 公证要求 **所有** 二进制文件（.dylib、.node）都必须签名。如果 bundle 中包含第三方原生库（如 sharp），需要：
- 用 `codesign` 逐一签名
- 或从 bundle 中排除（推荐，如果不需要）

## 打 tag 发布

```bash
# 打 tag 触发 Release
git tag v0.1.0
git push origin v0.1.0

# 重新发布（修复后）
git tag -d v0.1.0
git push origin :refs/tags/v0.1.0
git tag v0.1.0
git push origin v0.1.0
```

## 产物

| 平台 | 文件 |
|------|------|
| macOS ARM64 | `GClaw_0.1.0_aarch64.dmg` |
| macOS x64 | `GClaw_0.1.0_x64.dmg` |
| Windows x64 | `GClaw_0.1.0_x64-setup.exe`、`GClaw_0.1.0_x64_en-US.msi` |
| Linux x64 | `GClaw_0.1.0_amd64.deb`、`GClaw-0.1.0-1.x86_64.rpm` |

## 常见问题

### `resource path server/server.js doesn't exist`

Tauri build script 检查 `tauri.conf.json` 中声明的资源是否存在。需要：
- 确保 `beforeBuildCommand` 运行了 `bundle-sidecar.js`
- CI 中需要占位文件（`src-tauri/server/server.js` 等）

### `MAC verification failed during PKCS12 import`

证书格式问题。OpenSSL 3.x 默认使用 AES-256-CBC 加密 PKCS12，macOS `security import` 不支持。必须用 `openssl pkcs12 -export -legacy` 创建。

### 原生二进制未签名

Apple 公证要求所有 Mach-O 二进制都签名。排除不需要的原生库（如 sharp）是最简单的解决方案。

### AppImage 构建失败

Linux AppImage 的 `linuxdeploy` 在 CI 中不稳定。可在 matrix 中指定 `bundles: deb,rpm` 跳过 AppImage。
