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
use tauri::Emitter;
use flate2::read::GzDecoder;

/// 写入热更新日志（复用 startup_log，写入 gclaw-startup.log）
fn delta_log(msg: &str) {
    crate::startup_log(msg);
}

/// 发送热更新进度事件到前端
fn emit_patch_progress(app: &tauri::AppHandle, step: u8, total: u8, message: &str) {
    let payload = serde_json::json!({
        "step": step,
        "total": total,
        "message": message,
    });
    let _ = app.emit("patch-progress", payload);
    delta_log(&format!("[Delta] 进度 [{}/{}] {}", step, total, message));
}

/// 重启 server 进程（热更新后调用，使新代码生效）
#[tauri::command]
pub async fn restart_server(app: tauri::AppHandle) -> Result<String, String> {
    // 1. 获取 ServerState，杀掉旧进程
    let state = app.state::<crate::ServerState>();
    let old_port = state.port;
    if let Ok(mut guard) = state.child.lock() {
        if let Some(old) = guard.as_mut() {
            delta_log("[Delta] Stopping old server process...");
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

    delta_log("[Delta] 端口已释放，等待 1s 确保 TIME_WAIT 清理...");
    std::thread::sleep(std::time::Duration::from_secs(1));

    // 3. 启动新 server 进程（调用 lib.rs 的公共函数）
    let (child, port) = crate::start_server_process(&app);

    // 4. 更新 ServerState
    if let Ok(mut guard) = state.child.lock() {
        *guard = Some(child);
    }

    // 5. 等待新 server ready
    crate::wait_for_server(port);

    delta_log(&format!("[Delta] Server restarted at port {}", port));
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

/// 解压 tar.gz 到目标目录（用 Rust 原生实现，避免 Windows tar.exe 兼容性问题）
fn extract_tar_gz(archive_path: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| format!("创建目录失败: {}", e))?;

    let file = fs::File::open(archive_path)
        .map_err(|e| format!("打开补丁文件失败: {}", e))?;
    let gz = GzDecoder::new(file);
    let mut archive = tar::Archive::new(gz);

    let mut count = 0u32;
    for entry_result in archive.entries().map_err(|e| format!("tar 读取失败: {}", e))? {
        let mut entry = entry_result.map_err(|e| format!("tar 条目读取失败: {}", e))?;
        entry.unpack_in(dest).map_err(|e| {
            let path = entry.path().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
            format!("解压文件失败 {}: {}", path, e)
        })?;
        count += 1;
    }
    delta_log(&format!("[Delta] Rust 原生解压完成: {} 个文件", count));
    Ok(())
}

/// 应用文件级补丁更新 server/
#[tauri::command]
pub async fn apply_server_patch(
    app: tauri::AppHandle,
    patch_path: String,
    expected_version: String,
    will_relaunch: Option<bool>,
) -> Result<String, String> {
    let _will_relaunch = will_relaunch.unwrap_or(false);
    let t_start = std::time::Instant::now();
    delta_log("[Delta] ====== 开始热更新 ======");
    emit_patch_progress(&app, 0, 7, "准备开始热更新...");
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
    delta_log(&format!("[Delta] 补丁文件大小: {} bytes", patch_size));
    delta_log(&format!("[Delta] [+{:.1}s] 开始应用文件级补丁...", t_start.elapsed().as_secs_f64()));

    // Windows: 将步骤 0-9 包装为内部函数，统一 error recovery
    // 任何步骤失败都保证 server 进程恢复（避免白屏）
    #[cfg(target_os = "windows")]
    {
        return apply_server_patch_windows(&app, patch, &server_dir, &backup_dir, &resource_dir, &expected_version, _will_relaunch).await;
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

    // 检测是否为全量包（无 __manifest.json）
    let manifest_path = tmp_dir.join("__manifest.json");
    if !manifest_path.exists() {
        delta_log("[Delta] 未发现 __manifest.json，走全量替换流程");
        let result = apply_full_replace(&tmp_dir, server_dir, backup_dir, expected_version);
        if result.is_ok() { let _ = fs::remove_dir_all(backup_dir); }
        return result;
    }

    // 2. 读取 manifest
    let manifest = read_patch_manifest(&tmp_dir)?;
    delta_log(&format!("[Delta] manifest: modified={}, added={}, deleted={}",
        manifest.modified.len(), manifest.added.len(), manifest.deleted.len()));

    // 3. 备份 server/ → server.bak/
    delta_log("[Delta] 备份 server/ → server.bak/...");
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
        delta_log(&format!("[Delta] 版本验证失败: 期望 {} 实际 {}, 回滚...", expected_version, new_version));
        let _ = fs::remove_dir_all(server_dir);
        let _ = rename_or_copy_dir(backup_dir, server_dir);
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(format!("版本验证失败: 期望 {} 实际 {}", expected_version, new_version));
    }

    // 6.5 验证 build-manifest 引用的 static 资源都存在
    if let Err(e) = verify_build_manifest_assets(server_dir) {
        delta_log("[Delta] 静态资源验证失败，回滚...");
        let _ = fs::remove_dir_all(server_dir);
        let _ = rename_or_copy_dir(backup_dir, server_dir);
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(e);
    }

    // 7. 清理
    let _ = fs::remove_dir_all(&tmp_dir);
    let _ = fs::remove_dir_all(backup_dir);

    delta_log(&format!("[Delta] 文件级补丁应用完成: server version = {}", new_version));
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
    will_relaunch: bool,
) -> Result<String, String> {
    // 0. 停掉 server 进程
    let t0 = std::time::Instant::now();
    emit_patch_progress(app, 1, 7, "停止服务器...");
    let state = app.state::<crate::ServerState>();
    if let Ok(mut guard) = state.child.lock() {
        if let Some(old) = guard.as_mut() {
            delta_log("[Delta] [Windows] [T+0ms] Stopping server before patch...");
            let _ = old.kill();
            let _ = old.wait();
        }
        *guard = None;
    }
    delta_log(&format!("[Delta] [Windows] [T+{:.0}ms] Server process killed", t0.elapsed().as_millis()));
    // 等待文件句柄释放（检测式，最多 2 秒）
    let port = state.port;
    for i in 0..20 {
        if std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_err() {
            if i > 0 { delta_log(&format!("[Delta] [Windows] [T+{:.0}ms] 端口 {} 已释放 ({}ms)", t0.elapsed().as_millis(), port, i * 100)); }
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    // 额外等待 300ms 确保文件句柄释放
    std::thread::sleep(std::time::Duration::from_millis(300));
    delta_log(&format!("[Delta] [Windows] [T+{:.0}ms] Server stopped, file handles released", t0.elapsed().as_millis()));

    // 执行补丁（任何失败都走 recovery）
    emit_patch_progress(app, 2, 7, "解压并应用补丁文件...");
    let t_patch = std::time::Instant::now();
    let patch_result = do_windows_patch(app, patch, server_dir, backup_dir, resource_dir, expected_version);
    delta_log(&format!("[Delta] [Windows] [T+{:.0}ms] do_windows_patch 耗时: {:.1}s", t0.elapsed().as_millis(), t_patch.elapsed().as_secs_f64()));

    match patch_result {
        Ok(new_version) => {

            // 如果即将 relaunch 整个应用，跳过 server 重启和健康检查（节省 15-20 秒）
            // relaunch 会重新启动整个 Tauri 进程，server 会在 main() 中重新启动
            if will_relaunch {
                delta_log(&format!("[Delta] [Windows] 补丁成功 (version={}), 即将 relaunch, 跳过 server 重启", new_version));
                // 备份留着，下次启动时清理（以防 relaunch 失败可恢复）
                return Ok(new_version);
            }

            // 非 relaunch 模式：重启 server + 健康检查
            emit_patch_progress(app, 5, 7, "重启服务器...");
            delta_log(&format!("[Delta] [Windows] [T+{:.0}ms] Restarting server after patch...", t0.elapsed().as_millis()));
            let t_restart = std::time::Instant::now();
            let (child, port) = crate::start_server_process(app);
            let state = app.state::<crate::ServerState>();
            if let Ok(mut guard) = state.child.lock() {
                *guard = Some(child);
            }
            delta_log(&format!("[Delta] [Windows] [T+{:.0}ms] start_server_process 完成 (port={}), 耗时: {:.1}s", t0.elapsed().as_millis(), port, t_restart.elapsed().as_secs_f64()));
            let t_wait = std::time::Instant::now();
            crate::wait_for_server(port);
            delta_log(&format!("[Delta] [Windows] [T+{:.0}ms] wait_for_server 完成, 耗时: {:.1}s", t0.elapsed().as_millis(), t_wait.elapsed().as_secs_f64()));

            // HTTP 健康检查
            emit_patch_progress(app, 6, 7, "验证服务器状态...");
            let t_health = std::time::Instant::now();
            let healthy = check_server_health(port);
            delta_log(&format!("[Delta] [Windows] [T+{:.0}ms] 健康检查完成 (healthy={}), 耗时: {:.1}s", t0.elapsed().as_millis(), healthy, t_health.elapsed().as_secs_f64()));
            if !healthy {
                delta_log("[Delta] [Windows] ✗ 服务器健康检查失败，恢复备份...");
                if let Ok(mut guard) = state.child.lock() {
                    if let Some(child) = guard.as_mut() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                    *guard = None;
                }
                std::thread::sleep(std::time::Duration::from_secs(1));
                if backup_dir.exists() {
                    let _ = fs::remove_dir_all(server_dir);
                    let _ = rename_or_copy_dir(backup_dir, server_dir);
                    delta_log("[Delta] [Windows] 已从备份恢复 server 目录");
                }
                let (child2, port2) = crate::start_server_process(app);
                if let Ok(mut guard) = state.child.lock() {
                    *guard = Some(child2);
                }
                crate::wait_for_server(port2);
                let new_url = format!("http://127.0.0.1:{}", port2);
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.navigate(new_url.parse().unwrap());
                }
                return Err("补丁应用后服务器无法正常响应，已回滚".into());
            }

            let _ = fs::remove_dir_all(backup_dir);

            let new_url = format!("http://127.0.0.1:{}", port);
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.navigate(new_url.parse().unwrap());
                delta_log(&format!("[Delta] [Windows] [T+{:.0}ms] Webview navigated to {}", t0.elapsed().as_millis(), new_url));
            }

            emit_patch_progress(app, 7, 7, "热更新完成！");
            delta_log(&format!("[Delta] [Windows] ====== 热更新完成 ======  总耗时: {:.1}s", t0.elapsed().as_secs_f64()));
            Ok(format!("{}|restarted:http://127.0.0.1:{}", new_version, port))
        }
        Err(err) => {
            // 补丁失败 — 从备份恢复 + 重启 server（关键：防止白屏）
            delta_log(&format!("[Delta] [Windows] 补丁应用失败: {}, 正在恢复...", err));
            if backup_dir.exists() {
                let _ = fs::remove_dir_all(server_dir);
                let _ = rename_or_copy_dir(backup_dir, server_dir);
                delta_log("[Delta] [Windows] 已从备份恢复 server 目录");
            }
            // 补丁失败必须重启 server（不管是否 relaunch）
            delta_log("[Delta] [Windows] 恢复 server 进程...");
            let (child, port) = crate::start_server_process(app);
            let state = app.state::<crate::ServerState>();
            if let Ok(mut guard) = state.child.lock() {
                *guard = Some(child);
            }
            crate::wait_for_server(port);
            delta_log(&format!("[Delta] [Windows] Server 恢复完成: port {}", port));

            let new_url = format!("http://127.0.0.1:{}", port);
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.navigate(new_url.parse().unwrap());
                delta_log(&format!("[Delta] [Windows] Webview navigated to {} (recovery)", new_url));
            }

            Err(format!("补丁应用失败（已恢复server）: {}", err))
        }
    }
}

/// Windows: 执行实际补丁操作（纯文件操作，不涉及进程管理）
#[cfg(target_os = "windows")]
fn do_windows_patch(
    app: &tauri::AppHandle,
    patch: &Path,
    server_dir: &Path,
    backup_dir: &Path,
    resource_dir: &Path,
    expected_version: &str,
) -> Result<String, String> {
    // 1. 解压
    let t_extract = std::time::Instant::now();
    let tmp_dir = resource_dir.join("server-patch-tmp");
    if tmp_dir.exists() { let _ = fs::remove_dir_all(&tmp_dir); }
    extract_tar_gz(patch, &tmp_dir)?;
    delta_log(&format!("[Delta] [Windows] 解压耗时: {:.1}s", t_extract.elapsed().as_secs_f64()));

    // 检测是否为全量包（无 __manifest.json）
    let manifest_path = tmp_dir.join("__manifest.json");
    if !manifest_path.exists() {
        delta_log("[Delta] [Windows] 未发现 __manifest.json，走全量替换流程");
        emit_patch_progress(app, 3, 7, "替换服务器文件...");
        return apply_full_replace(&tmp_dir, server_dir, backup_dir, expected_version);
    }

    // 2. 读取 manifest
    let manifest = read_patch_manifest(&tmp_dir)?;
    delta_log(&format!("[Delta] manifest: modified={}, added={}, deleted={}",
        manifest.modified.len(), manifest.added.len(), manifest.deleted.len()));

    // 3. 复制备份（不 rename，避免文件锁）
    emit_patch_progress(app, 3, 7, "备份当前服务器文件...");
    let t_backup = std::time::Instant::now();
    delta_log("[Delta] 备份 server/ → server.bak/...");
    if backup_dir.exists() { let _ = fs::remove_dir_all(backup_dir); }
    copy_dir_recursive(server_dir, backup_dir)
        .map_err(|e| { let _ = fs::remove_dir_all(&tmp_dir); format!("备份失败: {}", e) })?;
    delta_log(&format!("[Delta] [Windows] 备份完成（复制模式）, 耗时: {:.1}s", t_backup.elapsed().as_secs_f64()));

    // 4. 就地应用补丁文件
    let t_apply = std::time::Instant::now();
    if let Err(e) = apply_patch_files(&manifest, &tmp_dir, server_dir) {
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(format!("应用补丁文件失败: {}", e));
    }
    delta_log(&format!("[Delta] [Windows] 补丁文件应用耗时: {:.1}s", t_apply.elapsed().as_secs_f64()));

    // 5. 删除文件
    delete_patch_files(&manifest, server_dir);

    // 6. 验证版本
    let new_version = read_server_version(server_dir);
    if new_version != expected_version {
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(format!("版本验证失败: 期望 {} 实际 {}", expected_version, new_version));
    }

    // 6.5 验证所有 modified+added 文件确实存在于 server 目录
    emit_patch_progress(app, 4, 7, "验证文件完整性...");
    let mut missing_in_server = Vec::new();
    for rel_path in manifest.modified.iter().chain(manifest.added.iter()) {
        let dest = server_dir.join(rel_path);
        if !dest.exists() {
            missing_in_server.push(rel_path.clone());
        }
    }
    if !missing_in_server.is_empty() {
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(format!("补丁应用后 {} 个文件不存在于 server 目录: {:?}", missing_in_server.len(), missing_in_server));
    }
    delta_log("[Delta] 补丁后文件完整性验证通过");

    // 6.6 验证 build-manifest 引用的 static 资源都存在
    verify_build_manifest_assets(server_dir)?;

    // 7. 清理临时目录（备份留给外层健康检查后删除）
    let _ = fs::remove_dir_all(&tmp_dir);
    Ok(new_version)
}

/// 全量替换：解压内容直接替换整个 server 目录
fn apply_full_replace(
    tmp_dir: &Path,
    server_dir: &Path,
    backup_dir: &Path,
    expected_version: &str,
) -> Result<String, String> {
    delta_log("[Delta] 全量替换: 备份 server/ → server.bak/...");
    if backup_dir.exists() { let _ = fs::remove_dir_all(backup_dir); }
    if let Err(e) = rename_or_copy_dir(server_dir, backup_dir) {
        let _ = fs::remove_dir_all(tmp_dir);
        return Err(format!("备份 server 目录失败: {}", e));
    }

    // 将解压的全量包移动为新的 server 目录
    delta_log("[Delta] 全量替换: 应用新版本...");
    if let Err(e) = rename_or_copy_dir(tmp_dir, server_dir) {
        // 失败则回滚
        delta_log(&format!("[Delta] 全量替换失败: {}，回滚...", e));
        let _ = rename_or_copy_dir(backup_dir, server_dir);
        return Err(format!("全量替换 server 目录失败: {}", e));
    }

    // 验证版本
    let new_version = read_server_version(server_dir);
    if new_version != expected_version {
        delta_log(&format!("[Delta] 全量替换版本验证失败: 期望 {} 实际 {}，回滚...", expected_version, new_version));
        let _ = fs::remove_dir_all(server_dir);
        let _ = rename_or_copy_dir(backup_dir, server_dir);
        return Err(format!("版本验证失败: 期望 {} 实际 {}", expected_version, new_version));
    }

    // 验证 build-manifest 引用的 static 资源都存在
    if let Err(e) = verify_build_manifest_assets(server_dir) {
        delta_log("[Delta] 全量替换静态资源验证失败，回滚...");
        let _ = fs::remove_dir_all(server_dir);
        let _ = rename_or_copy_dir(backup_dir, server_dir);
        return Err(e);
    }

    // 清理临时目录（备份留给调用者决定何时清理）
    let _ = fs::remove_dir_all(tmp_dir);
    delta_log(&format!("[Delta] 全量替换完成: server version = {}", new_version));
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

/// 应用补丁中的 modified + added 文件（严格模式：缺失文件直接报错）
fn apply_patch_files(manifest: &PatchManifest, tmp_dir: &Path, server_dir: &Path) -> Result<(), String> {
    let files: Vec<&String> = manifest.modified.iter().chain(manifest.added.iter()).collect();
    let mut applied = 0u32;
    let mut missing = Vec::new();
    for rel_path in &files {
        let src = tmp_dir.join(rel_path);
        let dest = server_dir.join(rel_path);
        if !src.exists() {
            delta_log(&format!("[Delta] ✗ 补丁中缺失文件: {}", rel_path));
            missing.push(rel_path.to_string());
            continue;
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录失败 {}: {}", parent.display(), e))?;
        }
        fs::copy(&src, &dest)
            .map_err(|e| format!("复制文件失败 {}: {}", rel_path, e))?;
        applied += 1;
    }
    delta_log(&format!("[Delta] 文件应用结果: 成功={}, 缺失={}", applied, missing.len()));
    if !missing.is_empty() {
        return Err(format!("补丁中 {} 个文件缺失，拒绝应用: {:?}", missing.len(), missing));
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



/// 验证 build-manifest.json 引用的所有 static 资源在 server 目录中存在
fn verify_build_manifest_assets(server_dir: &Path) -> Result<(), String> {
    let mut missing_assets = Vec::new();

    // 检查 build-manifest.json（pages router）
    let build_manifest = server_dir.join(".next").join("build-manifest.json");
    if build_manifest.exists() {
        if let Ok(content) = fs::read_to_string(&build_manifest) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                collect_manifest_assets(&json, server_dir, ".next/", &mut missing_assets);
            }
        }
    }

    // 检查 app-build-manifest.json（app router）
    let app_manifest = server_dir.join(".next").join("app-build-manifest.json");
    if app_manifest.exists() {
        if let Ok(content) = fs::read_to_string(&app_manifest) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                collect_manifest_assets(&json, server_dir, ".next/", &mut missing_assets);
            }
        }
    }

    if missing_assets.is_empty() {
        delta_log("[Delta] ✓ build-manifest 资源完整性验证通过");
        Ok(())
    } else {
        delta_log(&format!("[Delta] ✗ build-manifest 引用的 {} 个 static 资源缺失: {:?}", missing_assets.len(), missing_assets));
        Err(format!("build-manifest 引用的 {} 个 static 资源缺失（页面将无法加载）: {:?}", missing_assets.len(), missing_assets))
    }
}

/// 递归收集 manifest JSON 中所有 static/ 开头的资源路径，检查是否存在
fn collect_manifest_assets(value: &serde_json::Value, server_dir: &Path, prefix: &str, missing: &mut Vec<String>) {
    match value {
        serde_json::Value::String(s) => {
            // manifest 中的路径形如 "static/chunks/webpack-xxx.js"
            if s.starts_with("static/") {
                let full_path = server_dir.join(".next").join(s);
                if !full_path.exists() {
                    missing.push(format!("{}{}", prefix, s));
                }
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                collect_manifest_assets(item, server_dir, prefix, missing);
            }
        }
        serde_json::Value::Object(map) => {
            for (_key, val) in map {
                collect_manifest_assets(val, server_dir, prefix, missing);
            }
        }
        _ => {}
    }
}

/// HTTP 健康检查：验证 server 能真正返回页面内容
#[cfg(target_os = "windows")]
fn check_server_health(port: u16) -> bool {
    let url = format!("http://127.0.0.1:{}/", port);
    // 重试 2 次，每次间隔 1 秒
    // 读取超时 30 秒（Next.js 清缓存后冷启动首次请求可能很慢）
    for attempt in 1..=2 {
        delta_log(&format!("[Delta] 健康检查尝试 {}/2: {}", attempt, url));
        match std::net::TcpStream::connect_timeout(
            &format!("127.0.0.1:{}", port).parse().unwrap(),
            std::time::Duration::from_secs(5),
        ) {
            Ok(mut stream) => {
                use std::io::{Write, Read};
                let request = format!("GET / HTTP/1.0\r\nHost: 127.0.0.1:{}\r\n\r\n", port);
                if stream.write_all(request.as_bytes()).is_ok() {
                    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(30)));
                    let mut response = Vec::new();
                    let _ = stream.read_to_end(&mut response);
                    let resp_str = String::from_utf8_lossy(&response);
                    let is_ok = resp_str.starts_with("HTTP/1.0 200") ||
                                resp_str.starts_with("HTTP/1.1 200") ||
                                resp_str.starts_with("HTTP/1.0 302") ||
                                resp_str.starts_with("HTTP/1.1 302") ||
                                resp_str.starts_with("HTTP/1.0 304") ||
                                resp_str.starts_with("HTTP/1.1 304");
                    let has_content = resp_str.contains("<html") || resp_str.contains("<!DOCTYPE") || resp_str.len() > 500;
                    delta_log(&format!("[Delta] 健康检查响应: status_ok={}, has_content={}, resp_len={}", is_ok, has_content, resp_str.len()));
                    if is_ok && has_content {
                        delta_log("[Delta] ✓ 服务器健康检查通过");
                        return true;
                    }
                }
            }
            Err(e) => {
                delta_log(&format!("[Delta] 健康检查连接失败: {}", e));
            }
        }
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
    delta_log("[Delta] ✗ 服务器健康检查 2 次均失败");
    false
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
        delta_log("[Delta] 警告: 无法读取 server 版本，server/package.json 可能不存在");
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
