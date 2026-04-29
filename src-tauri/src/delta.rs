//! Server 增量更新（热更新）模块
//!
//! 通过文件级补丁对 server/ 目录进行增量更新，
//! 独立于 Tauri 全量更新通道。

use sha2::{Sha256, Digest};
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

/// 重启 server 进程（热更新后调用，使新代码生效）
#[tauri::command]
pub async fn restart_server(app: tauri::AppHandle) -> Result<String, String> {
    // 1. 获取 ServerState，杀掉旧进程
    let state = app.state::<crate::ServerState>();
    let old_port = state.port;
    if let Ok(mut guard) = state.child.lock() {
        if let Some(old) = guard.as_mut() {
            println!("[Delta] Stopping old server process...");
            let _ = old.kill();
            let _ = old.wait();
        }
        *guard = None;
    }

    // 2. 等待旧端口释放（最多 5 秒）
    for _ in 0..50 {
        if std::net::TcpStream::connect(format!("127.0.0.1:{}", old_port)).is_err() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    println!("[Delta] 端口已释放，等待 1s 确保 TIME_WAIT 清理...");
    std::thread::sleep(std::time::Duration::from_secs(1));

    // 3. 启动新 server 进程（调用 lib.rs 的公共函数）
    let (child, port) = crate::start_server_process(&app);

    // 4. 更新 ServerState
    if let Ok(mut guard) = state.child.lock() {
        *guard = Some(child);
    }

    // 5. 等待新 server ready
    crate::wait_for_server(port);

    println!("[Delta] Server restarted at port {}", port);
    Ok(format!("http://127.0.0.1:{}", port))
}

/// 校验文件 SHA-256 hash
#[tauri::command]
pub async fn verify_file_hash(path: String, expected_hash: String) -> Result<bool, String> {
    let actual = sha256_file(Path::new(&path))?;
    // 支持 "sha256:xxx" 和裸 hash 两种格式
    let expected = expected_hash.strip_prefix("sha256:").unwrap_or(&expected_hash);
    Ok(actual == expected)
}

/// 通过 curl 获取远程 JSON（绕过浏览器 CORS 限制）
#[tauri::command]
pub async fn fetch_url(url: String) -> Result<String, String> {
    let curl = if cfg!(target_os = "windows") { "curl.exe" } else { "curl" };
    let mut cmd = Command::new(curl);
    cmd.args(&["-sL", "--connect-timeout", "15", "--max-time", "30"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd.arg(&url);

    let output = cmd.output()
        .map_err(|e| format!("执行 curl 失败: {}", e))?;

    if !output.status.success() {
        return Err(format!("curl 返回错误: {}", String::from_utf8_lossy(&output.stderr)));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// 通过 curl 下载文件到指定路径（绕过浏览器 CORS 限制）
#[tauri::command]
pub async fn download_file(url: String, path: String) -> Result<(), String> {
    let curl = if cfg!(target_os = "windows") { "curl.exe" } else { "curl" };
    let mut cmd = Command::new(curl);
    cmd.args(&["-sL", "-f", "--connect-timeout", "30", "--max-time", "300"]);
    cmd.args(&["-o", &path]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd.arg(&url);

    let output = cmd.output()
        .map_err(|e| format!("执行 curl 失败: {}", e))?;

    if !output.status.success() {
        // 清理不完整的文件
        let _ = fs::remove_file(&path);
        return Err(format!("下载失败: {}", String::from_utf8_lossy(&output.stderr)));
    }

    Ok(())
}

/// 计算 SHA-256 哈希（返回 hex 字符串）
fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path)
        .map_err(|e| format!("打开文件失败: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 8192];
    loop {
        let n = file.read(&mut buf)
            .map_err(|e| format!("读取文件失败: {}", e))?;
        if n == 0 { break; }
        hasher.write_all(&buf[..n])
            .map_err(|e| format!("哈希计算失败: {}", e))?;
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// 补丁清单结构
#[derive(serde::Deserialize)]
struct PatchManifest {
    #[allow(dead_code)]
    from: String,
    #[allow(dead_code)]
    to: String,
    modified: Vec<String>,
    added: Vec<String>,
    deleted: Vec<String>,
}

/// 解压 tar.gz 到目标目录
fn extract_tar_gz(archive_path: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| format!("创建目录失败: {}", e))?;

    let tar_cmd = if cfg!(target_os = "windows") { "tar.exe" } else { "tar" };
    let mut cmd = Command::new(tar_cmd);
    cmd.args(&["xzf", &archive_path.to_string_lossy(), "-C", &dest.to_string_lossy()]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let output = cmd.output().map_err(|e| format!("执行 tar 解压失败: {}", e))?;
    if !output.status.success() {
        return Err(format!("tar 解压失败: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

/// 应用文件级补丁更新 server/
#[tauri::command]
pub async fn apply_server_patch(
    app: tauri::AppHandle,
    patch_path: String,
    expected_version: String,
) -> Result<String, String> {
    let resource_dir = app.path().resource_dir()
        .map_err(|e| format!("获取资源目录失败: {}", e))?;

    let server_dir = resource_dir.join("server");
    let backup_dir = resource_dir.join("server.bak");
    let patch = Path::new(&patch_path);

    if !patch.exists() {
        return Err(format!("补丁文件不存在: {}", patch_path));
    }

    // 检查补丁文件大小合理性
    let patch_meta = fs::metadata(&patch)
        .map_err(|e| format!("无法读取补丁文件元数据: {}", e))?;
    let patch_size = patch_meta.len();
    if patch_size < 100 {
        return Err(format!(
            "补丁文件过小 ({} 字节)，可能是下载失败或服务器返回了错误页面",
            patch_size
        ));
    }
    println!("[Delta] 补丁文件大小: {} bytes", patch_size);
    println!("[Delta] 开始应用文件级补丁...");

    // Windows: 将步骤 0-9 包装为内部函数，统一 error recovery
    // 任何步骤失败都保证 server 进程恢复（避免白屏）
    #[cfg(target_os = "windows")]
    {
        return apply_server_patch_windows(&app, patch, &server_dir, &backup_dir, &resource_dir, &expected_version).await;
    }

    // macOS/Linux: POSIX 语义允许操作被占用的文件，无需停 server
    #[cfg(not(target_os = "windows"))]
    {
        return apply_server_patch_unix(patch, &server_dir, &backup_dir, &resource_dir, &expected_version);
    }
}

/// macOS/Linux 补丁应用（POSIX 语义，无需停 server）
#[cfg(not(target_os = "windows"))]
fn apply_server_patch_unix(
    patch: &Path,
    server_dir: &Path,
    backup_dir: &Path,
    resource_dir: &Path,
    expected_version: &str,
) -> Result<String, String> {
    // 1. 解压
    let tmp_dir = resource_dir.join("server-patch-tmp");
    if tmp_dir.exists() { let _ = fs::remove_dir_all(&tmp_dir); }
    extract_tar_gz(patch, &tmp_dir)?;

    // 2. 读取 manifest
    let manifest = read_patch_manifest(&tmp_dir)?;
    println!("[Delta] manifest: modified={}, added={}, deleted={}",
        manifest.modified.len(), manifest.added.len(), manifest.deleted.len());

    // 3. 备份 server/ → server.bak/
    println!("[Delta] 备份 server/ → server.bak/...");
    if backup_dir.exists() { let _ = fs::remove_dir_all(backup_dir); }
    if let Err(e) = rename_or_copy_dir(server_dir, backup_dir) {
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(format!("备份 server 目录失败: {}", e));
    }
    if let Err(e) = copy_dir_recursive(backup_dir, server_dir) {
        let _ = rename_or_copy_dir(backup_dir, server_dir);
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(format!("复制备份回 server 失败: {}", e));
    }

    // 4. 应用补丁文件
    apply_patch_files(&manifest, &tmp_dir, server_dir)?;

    // 5. 删除文件
    delete_patch_files(&manifest, server_dir);

    // 6. 验证版本
    let new_version = read_server_version(server_dir);
    if new_version != expected_version {
        println!("[Delta] 版本验证失败: 期望 {} 实际 {}, 回滚...", expected_version, new_version);
        let _ = fs::remove_dir_all(server_dir);
        let _ = rename_or_copy_dir(backup_dir, server_dir);
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(format!("版本验证失败: 期望 {} 实际 {}", expected_version, new_version));
    }

    // 7. 清理
    let _ = fs::remove_dir_all(&tmp_dir);
    let _ = fs::remove_dir_all(backup_dir);
    clean_next_cache(server_dir);

    println!("[Delta] 文件级补丁应用完成: server version = {}", new_version);
    Ok(new_version)
}

/// Windows 补丁应用 — 任何失败都保证 server 恢复（防止白屏）
#[cfg(target_os = "windows")]
async fn apply_server_patch_windows(
    app: &tauri::AppHandle,
    patch: &Path,
    server_dir: &Path,
    backup_dir: &Path,
    resource_dir: &Path,
    expected_version: &str,
) -> Result<String, String> {
    // 0. 停掉 server 进程
    let state = app.state::<crate::ServerState>();
    if let Ok(mut guard) = state.child.lock() {
        if let Some(old) = guard.as_mut() {
            println!("[Delta] [Windows] Stopping server before patch...");
            let _ = old.kill();
            let _ = old.wait();
        }
        *guard = None;
    }
    std::thread::sleep(std::time::Duration::from_secs(2));
    println!("[Delta] [Windows] Server stopped, file handles released");

    // 执行补丁（任何失败都走 recovery）
    let patch_result = do_windows_patch(patch, server_dir, backup_dir, resource_dir, expected_version);

    match patch_result {
        Ok(new_version) => {
            // 补丁成功，清理并重启
            clean_next_cache(server_dir);
            println!("[Delta] [Windows] Restarting server after patch...");
            let (child, port) = crate::start_server_process(app);
            let state = app.state::<crate::ServerState>();
            if let Ok(mut guard) = state.child.lock() {
                *guard = Some(child);
            }
            crate::wait_for_server(port);
            println!("[Delta] [Windows] Server restarted at port {}", port);

            // 从 Rust 端直接导航 webview 到新 server（不依赖 JS 的 window.location.href）
            let new_url = format!("http://127.0.0.1:{}", port);
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.navigate(new_url.parse().unwrap());
                println!("[Delta] [Windows] Webview navigated to {}", new_url);
            }

            println!("[Delta] 文件级补丁应用完成: server version = {}", new_version);
            Ok(format!("{}|restarted:http://127.0.0.1:{}", new_version, port))
        }
        Err(err) => {
            // 补丁失败 — 从备份恢复 + 重启 server（关键：防止白屏）
            println!("[Delta] [Windows] 补丁应用失败: {}, 正在恢复...", err);
            if backup_dir.exists() {
                let _ = fs::remove_dir_all(server_dir);
                let _ = rename_or_copy_dir(backup_dir, server_dir);
                println!("[Delta] [Windows] 已从备份恢复 server 目录");
            }
            println!("[Delta] [Windows] 恢复 server 进程...");
            let (child, port) = crate::start_server_process(app);
            let state = app.state::<crate::ServerState>();
            if let Ok(mut guard) = state.child.lock() {
                *guard = Some(child);
            }
            crate::wait_for_server(port);
            println!("[Delta] [Windows] Server 恢复完成: port {}", port);

            // 失败时也导航 webview 到新 server（防止白屏）
            let new_url = format!("http://127.0.0.1:{}", port);
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.navigate(new_url.parse().unwrap());
                println!("[Delta] [Windows] Webview navigated to {} (recovery)", new_url);
            }

            Err(format!("补丁应用失败（已恢复server）: {}", err))
        }
    }
}

/// Windows: 执行实际补丁操作（纯文件操作，不涉及进程管理）
#[cfg(target_os = "windows")]
fn do_windows_patch(
    patch: &Path,
    server_dir: &Path,
    backup_dir: &Path,
    resource_dir: &Path,
    expected_version: &str,
) -> Result<String, String> {
    // 1. 解压
    let tmp_dir = resource_dir.join("server-patch-tmp");
    if tmp_dir.exists() { let _ = fs::remove_dir_all(&tmp_dir); }
    extract_tar_gz(patch, &tmp_dir)?;

    // 2. 读取 manifest
    let manifest = read_patch_manifest(&tmp_dir)?;
    println!("[Delta] manifest: modified={}, added={}, deleted={}",
        manifest.modified.len(), manifest.added.len(), manifest.deleted.len());

    // 3. 复制备份（不 rename，避免文件锁）
    println!("[Delta] 备份 server/ → server.bak/...");
    if backup_dir.exists() { let _ = fs::remove_dir_all(backup_dir); }
    copy_dir_recursive(server_dir, backup_dir)
        .map_err(|e| { let _ = fs::remove_dir_all(&tmp_dir); format!("备份失败: {}", e) })?;
    println!("[Delta] [Windows] 备份完成（复制模式）");

    // 4. 就地应用补丁文件
    if let Err(e) = apply_patch_files(&manifest, &tmp_dir, server_dir) {
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(format!("应用补丁文件失败: {}", e));
    }

    // 5. 删除文件
    delete_patch_files(&manifest, server_dir);

    // 6. 验证版本
    let new_version = read_server_version(server_dir);
    if new_version != expected_version {
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(format!("版本验证失败: 期望 {} 实际 {}", expected_version, new_version));
    }

    // 7. 清理
    let _ = fs::remove_dir_all(&tmp_dir);
    let _ = fs::remove_dir_all(backup_dir);
    Ok(new_version)
}

/// 读取补丁 manifest
fn read_patch_manifest(tmp_dir: &Path) -> Result<PatchManifest, String> {
    let manifest_path = tmp_dir.join("__manifest.json");
    if !manifest_path.exists() {
        let _ = fs::remove_dir_all(tmp_dir);
        return Err("补丁包中缺少 __manifest.json".into());
    }
    let content = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("读取 manifest 失败: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("解析 manifest 失败: {}", e))
}

/// 应用补丁中的 modified + added 文件
fn apply_patch_files(manifest: &PatchManifest, tmp_dir: &Path, server_dir: &Path) -> Result<(), String> {
    let files: Vec<&String> = manifest.modified.iter().chain(manifest.added.iter()).collect();
    for rel_path in &files {
        let src = tmp_dir.join(rel_path);
        let dest = server_dir.join(rel_path);
        if !src.exists() {
            println!("[Delta] 警告: 补丁中缺少文件 {}, 跳过", rel_path);
            continue;
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录失败 {}: {}", parent.display(), e))?;
        }
        fs::copy(&src, &dest)
            .map_err(|e| format!("复制文件失败 {}: {}", rel_path, e))?;
    }
    Ok(())
}

/// 删除补丁中标记删除的文件
fn delete_patch_files(manifest: &PatchManifest, server_dir: &Path) {
    for rel_path in &manifest.deleted {
        let target = server_dir.join(rel_path);
        if target.exists() {
            let _ = fs::remove_file(&target);
        }
    }
}

/// 清理 .next 编译缓存
fn clean_next_cache(server_dir: &Path) {
    let cache_dir = server_dir.join(".next").join("cache");
    if cache_dir.exists() {
        let _ = fs::remove_dir_all(&cache_dir);
        println!("[Delta] Cleaned .next/cache directory");
    }
}

/// 获取当前 server/ 的版本号（从 package.json 读取）
#[tauri::command]
pub fn get_current_server_version(app: tauri::AppHandle) -> String {
    let resource_dir: PathBuf = match app.path().resource_dir() {
        Ok(d) => d,
        Err(_) => return "unknown".into(),
    };
    let version = read_server_version(&resource_dir.join("server"));
    if version == "unknown" {
        println!("[Delta] 警告: 无法读取 server 版本，server/package.json 可能不存在");
    }
    version
}

/// 从 server/package.json 读取 version 字段
fn read_server_version(server_dir: &Path) -> String {
    let pkg_path = server_dir.join("package.json");
    if let Ok(content) = fs::read_to_string(&pkg_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(v) = json.get("version").and_then(|v| v.as_str()) {
                return v.to_string();
            }
        }
    }
    "unknown".into()
}

/// 重命名目录，如果跨设备则递归复制+删除
fn rename_or_copy_dir(src: &Path, dest: &Path) -> Result<(), String> {
    if src == dest {
        return Ok(());
    }
    if let Err(e) = fs::rename(src, dest) {
        // 跨设备/文件系统，回退到复制
        if e.raw_os_error() == Some(18) /* EXDEV */ || e.kind() == io::ErrorKind::Other {
            copy_dir_recursive(src, dest)?;
            fs::remove_dir_all(src)
                .map_err(|e| format!("删除源目录失败: {}", e))?;
        } else {
            return Err(format!("重命名目录失败: {}", e));
        }
    }
    Ok(())
}

/// 递归复制目录
fn copy_dir_recursive(src: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest)
        .map_err(|e| format!("创建目录失败: {}", e))?;

    for entry in fs::read_dir(src)
        .map_err(|e| format!("读取目录失败: {}", e))?
    {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else {
            fs::copy(&src_path, &dest_path)
                .map_err(|e| format!("复制文件失败: {}", e))?;
        }
    }
    Ok(())
}
