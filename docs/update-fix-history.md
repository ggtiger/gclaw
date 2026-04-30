# GClaw 更新系统修复全记录

> 本文档记录了 GClaw 桌面应用更新机制从发现问题到最终修复的完整过程，涵盖 Windows 白屏、跨平台 chunk 不一致、性能优化及单实例等核心问题。

---

## 一、问题背景

GClaw 采用 **双轨发布机制**：

- `v*` tag → 全量构建（Rust + Next.js，~10 分钟），生成安装包
- `server-v*` tag → 仅构建 Next.js server bundle（~2 分钟），生成增量 delta 补丁

增量更新流程：CI 对比新旧 server 目录的文件 SHA-256 哈希，生成 modified/added/deleted 清单 + 补丁包，客户端下载后就地应用。

**核心故障**：Mac 热更新正常，Windows 热更新后白屏（404）。

---

## 二、问题一：Windows 热更新白屏死循环

### 2.1 现象

Windows 用户执行热更新后：
- 页面白屏，webpack chunk 返回 404
- 退出重进仍然白屏，形成**死循环**

### 2.2 根因

`apply_server_patch` 函数在 Windows 上杀掉 server 进程后，若补丁任一环节失败（解压/manifest/复制），使用 `?` 操作符直接返回 `Err`，**跳过 server 重启逻辑**，导致 server 永久停止。

```
kill server → 解压失败 → return Err (server 未重启) → 白屏
                                                      ↓
                                        下次启动仍是损坏状态 → 白屏循环
```

### 2.3 修复方案（v0.2.11）

重构 `delta.rs` 为**平台专用两层架构**：

| 函数 | 职责 |
|---|---|
| `apply_server_patch_windows`（外层） | 统一 error recovery，无论成功/失败都保证 server 重启 |
| `do_windows_patch`（内层） | 纯文件操作，不涉及进程管理 |

**关键保证**：Windows 下无论补丁成功或失败，server 进程**必定重启**，彻底打破白屏死循环。

### 2.4 涉及文件

- `src-tauri/src/delta.rs` — 平台分支重构
- `lib/updater.ts` — 解析 `版本号|restarted:url` 返回值，避免重复重启

---

## 三、问题二：Windows tar.exe 静默丢文件

### 3.1 现象

更新后 `webpack-4a8614be5f27d34b.js` 等 static chunk 文件 404。

### 3.2 根因

原代码使用系统 `tar.exe` 解压补丁：
- Mac 的 `tar` 命令可靠
- Windows 的 `tar.exe` **静默丢失部分文件**，不报错
- `apply_patch_files` 遇到缺失文件只打日志并 `continue`，不报错

结果：delta 包里有 `webpack-LINUX_NEW.js`，但 tar.exe 解压时丢了 → manifest 引用该文件 → 404。

### 3.3 修复方案（v0.2.14）

**5 层防护体系**：

| 层级 | 机制 | 作用 |
|---|---|---|
| L1 | Rust 原生 `flate2` + `tar` crate 解压 | 替代不可靠的 tar.exe |
| L2 | `apply_patch_files` 严格模式 | 缺失文件直接报错，拒绝应用 |
| L3 | 补丁后文件存在性验证 | 检查所有 modified+added 文件确实在 server 目录 |
| L4 | `verify_build_manifest_assets` | 解析 build-manifest.json，验证引用的 static 资源存在 |
| L5 | HTTP 健康检查 + 自动回滚 | 启动后验证页面可访问，失败则恢复备份 |

**Rust 原生解压核心代码**：

```rust
fn extract_tar_gz(archive_path: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(archive_path)?;
    let gz = GzDecoder::new(file);
    let mut archive = tar::Archive::new(gz);
    for entry_result in archive.entries()? {
        let mut entry = entry_result?;
        entry.unpack_in(dest)?;
    }
    Ok(())
}
```

**build-manifest 验证核心逻辑**：

```rust
fn verify_build_manifest_assets(server_dir: &Path) -> Result<(), String> {
    // 递归解析 build-manifest.json / app-build-manifest.json
    // 提取所有 "static/" 开头的路径
    // 检查 server_dir/.next/{path} 是否存在
    // 任何缺失 → 返回 Err → 触发回滚
}
```

### 3.4 涉及文件

- `src-tauri/Cargo.toml` — 新增 `flate2`、`tar` 依赖
- `src-tauri/src/delta.rs` — Rust 原生解压 + 严格验证 + build-manifest 检查 + 健康检查

---

## 四、问题三：跨平台构建 chunk hash 不一致

### 4.1 现象

即使 tar 解压正确，Windows 用户仍可能出现 static chunk 404。

### 4.2 根因

这是更深层的架构问题：

| 工作流 | 构建平台 | 产物 |
|---|---|---|
| `release.yml`（v* tag） | Mac/Windows/Linux **各自** `npm run build` | 平台专属安装包 |
| `server-release.yml`（server-v* tag） | **仅 Linux** CI 构建 | delta 增量包 |

Next.js 构建**非确定性**：相同源码在不同平台产出的 chunk hash 不同。

```
Linux 旧版 manifest: webpack-AAA.js
Linux 新版 manifest: webpack-AAA.js（没变）
Windows 用户机器:    webpack-WIN.js（不同 hash）

Delta（旧Linux → 新Linux）: webpack-AAA.js 未变 → 不在 delta 中
Windows 用户应用 delta 后:
  - build-manifest.json → 引用 webpack-AAA.js ✅（已更新）
  - webpack-AAA.js → 不存在！（不在 delta，Windows 上也没有）
  → 404！
```

**为什么 Mac 不白屏？** Linux 和 macOS 都是 Unix 环境，Next.js 构建的 chunk hash **大概率一致**，所以 Mac 用 Linux delta 是兼容的。

### 4.3 修复方案

**CI 层精准包含**（server-release.yml + release.yml）：

用 `jq` 解析 `build-manifest.json` / `app-build-manifest.json`，提取所有 `static/` 路径，**强制包含到 delta 包**：

```bash
for manifest_file in .next/build-manifest.json .next/app-build-manifest.json; do
  [ -f "$NEW_SERVER_DIR/$manifest_file" ] || continue
  while IFS= read -r sf; do
    full=".next/$sf"
    [ -f "$NEW_SERVER_DIR/$full" ] || continue
    # 加入 delta 的 modified 列表 + 复制到补丁目录
    mkdir -p "$PATCH_DIR/$(dirname "$full")"
    cp "$NEW_SERVER_DIR/$full" "$PATCH_DIR/$full"
  done < <(jq -r '.. | strings | select(startswith("static/"))' \
    "$NEW_SERVER_DIR/$manifest_file" | sort -u)
done
```

**方案迭代**：最初尝试全量包含 `.next/static/` 全部文件（太大），后改为仅包含 manifest 实际引用的文件，精准控制增量包体积。

### 4.4 涉及文件

- `.github/workflows/server-release.yml` — delta 生成逻辑
- `.github/workflows/release.yml` — 同步修改

---

## 五、问题四：Windows 更新重启耗时过长

### 5.1 现象

用户点击"确认更新并重启"后等待 20-50 秒。

### 5.2 根因分析

| 步骤 | 耗时 | 说明 |
|---|---|---|
| kill server + sleep(2s) | ~2s | 固定等待 |
| copy_dir_recursive 备份 | ~5-10s | 复制整个 server 目录 |
| 解压+应用+验证 | ~2-5s | 补丁操作 |
| **start server + wait** | **~5-15s** | Next.js 冷启动 |
| **健康检查** | **~0-6s** | 3次×2s |
| **删除备份** | **~2-5s** | 大目录删除 |
| **relaunch** | **~5-15s** | 又一次冷启动 |

**核心问题**：Rust 端补丁后启动了一次 server + 健康检查，然后 JS 端又调用 `relaunch()` 重启整个应用 — **server 被启动了两次**。

### 5.3 修复方案（v0.2.16）

新增 `will_relaunch` 参数，当即将 relaunch 时跳过冗余操作：

```rust
// delta.rs - apply_server_patch_windows
if will_relaunch {
    println!("[Delta] 补丁成功, 即将 relaunch, 跳过 server 重启");
    return Ok(new_version); // 不启动 server，不做健康检查
}
```

其他优化：
- kill server 后改为**检测式等待**端口释放（原固定 2s → 通常 300ms）
- 备份不在 apply 时删除，**下次启动时清理**

**优化效果**：

| | 优化前 | 优化后 |
|---|---|---|
| 总耗时 | 20-50s | 12-27s |
| 节省 | - | **15-20s** |

### 5.4 涉及文件

- `src-tauri/src/delta.rs` — `will_relaunch` 参数 + 检测式等待
- `src-tauri/src/lib.rs` — 启动时清理 `server.bak` 和 `server-patch-tmp`
- `lib/updater.ts` — 透传 `willRelaunch` 参数
- `components/settings/AboutPanel.tsx` — 调用时传 `willRelaunch: true`

---

## 六、问题五：Windows 多实例启动

### 6.1 现象

Windows 上可以打开多个应用实例，每个实例启动独立的 Node.js server，占用不同端口，浪费资源。

### 6.2 修复方案（v0.2.16）

添加 `tauri-plugin-single-instance`：

```rust
// lib.rs
tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }))
```

第二个实例启动时自动聚焦已有窗口，不会创建新进程。

### 6.3 涉及文件

- `src-tauri/Cargo.toml` — 新增 `tauri-plugin-single-instance` 依赖
- `src-tauri/src/lib.rs` — 注册插件

---

## 七、修复时间线

| 版本 | 修复内容 |
|---|---|
| v0.2.11 | Windows 白屏死循环：两层架构 + 强制 server 恢复 |
| v0.2.12 | Windows 文件锁：停 server → 等待 → 补丁 → 重启 |
| v0.2.14 | Rust 原生 tar + 5 层验证防护 + 健康检查回滚 |
| server-v0.2.38 | CI delta 精准包含 manifest 引用的 static 资源 |
| v0.2.16 | 更新耗时优化（-15s）+ 单实例 |

---

## 八、架构总结

### 最终防护体系

```
                          ┌─────────────────────────────┐
                          │  CI 层（server-release.yml） │
                          │  强制包含 manifest 引用的    │
                          │  static 资源到 delta         │
                          └──────────┬──────────────────┘
                                     │ delta.tar.gz
                                     ▼
┌────────────────────────────────────────────────────────────┐
│                    客户端 Rust 层（delta.rs）                │
│                                                            │
│  L1: Rust 原生 flate2+tar 解压（替代 tar.exe）              │
│  L2: apply_patch_files 严格模式（缺失文件 → 报错）          │
│  L3: 补丁后文件存在性验证                                   │
│  L4: verify_build_manifest_assets（引用资源完整性）          │
│  L5: HTTP 健康检查（页面可访问性）                          │
│                                                            │
│  任何层失败 → 自动回滚备份 → 强制重启 server → 不白屏       │
└────────────────────────────────────────────────────────────┘
```

### 为什么 Mac 不白屏而 Windows 白屏

1. **tar 解压**：Mac 系统 tar 可靠，Windows tar.exe 静默丢文件
2. **chunk hash**：Linux CI 和 macOS 产出 hash 大概率一致，Windows 不同
3. **文件锁**：Mac 允许操作被占用文件（POSIX 语义），Windows 强制独占
4. **进程管理**：Mac 补丁时 server 可以继续运行，Windows 必须先停

这四个因素叠加，导致 Windows 是唯一白屏的平台。修复后从 CI 到客户端全链路加固，彻底解决。
