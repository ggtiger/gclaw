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

    // 0. Windows 上必须先停掉 server 进程，否则目录/文件被锁无法重命名
    //    macOS/Linux 的 POSIX 语义允许重命名被占用的文件，无需此步骤
    #[cfg(target_os = "windows")]
    {
        let state = app.state::<crate::ServerState>();
        if let Ok(mut guard) = state.child.lock() {
            if let Some(old) = guard.as_mut() {
                println!("[Delta] [Windows] Stopping server before patch...");
                let _ = old.kill();
                let _ = old.wait();
            }
            *guard = None;
        }
        // 等待文件句柄完全释放
        std::thread::sleep(std::time::Duration::from_secs(2));
        println!("[Delta] [Windows] Server stopped, file handles released");
    }

    // 1. 解压 patch tar.gz 到临时目录
    let tmp_dir = resource_dir.join("server-patch-tmp");
    if tmp_dir.exists() {
        fs::remove_dir_all(&tmp_dir)
            .map_err(|e| format!("清理旧临时目录失败: {}", e))?;
    }
    extract_tar_gz(patch, &tmp_dir)?;

    // 2. 读取 __manifest.json
    let manifest_path = tmp_dir.join("__manifest.json");
    if !manifest_path.exists() {
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err("补丁包中缺少 __manifest.json".into());
    }
    let manifest_content = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("读取 manifest 失败: {}", e))?;
    let manifest: PatchManifest = serde_json::from_str(&manifest_content)
        .map_err(|e| format!("解析 manifest 失败: {}", e))?;

    println!("[Delta] manifest: modified={}, added={}, deleted={}",
        manifest.modified.len(), manifest.added.len(), manifest.deleted.len());

    // 3. 备份 server/ → server.bak/
    println!("[Delta] 备份 server/ → server.bak/...");
    if backup_dir.exists() {
        if let Err(e) = fs::remove_dir_all(&backup_dir) {
            println!("[Delta] 警告: 删除旧备份失败: {}, 尝试继续...", e);
        }
    }
    if let Err(e) = rename_or_copy_dir(&server_dir, &backup_dir) {
        println!("[Delta] 备份 server 目录失败: {}", e);
        let _ = fs::remove_dir_all(&tmp_dir);
        // Windows: 备份失败，需要恢复 server 进程
        #[cfg(target_os = "windows")]
        {
            println!("[Delta] [Windows] 备份失败，恢复 server 进程...");
            let (child, port) = crate::start_server_process(&app);
            let state = app.state::<crate::ServerState>();
            if let Ok(mut guard) = state.child.lock() {
                *guard = Some(child);
            }
            crate::wait_for_server(port);
            println!("[Delta] [Windows] Server 恢复完成: port {}", port);
        }
        return Err(format!("备份 server 目录失败: {}", e));
    }
    // 复制备份回 server/（在备份基础上做增量修改）
    if let Err(e) = copy_dir_recursive(&backup_dir, &server_dir) {
        println!("[Delta] 复制备份回 server 失败: {}", e);
        // 尝试回滚
        let _ = rename_or_copy_dir(&backup_dir, &server_dir);
        let _ = fs::remove_dir_all(&tmp_dir);
        #[cfg(target_os = "windows")]
        {
            println!("[Delta] [Windows] 应用失败，恢复 server 进程...");
            let (child, port) = crate::start_server_process(&app);
            let state = app.state::<crate::ServerState>();
            if let Ok(mut guard) = state.child.lock() {
                *guard = Some(child);
            }
            crate::wait_for_server(port);
        }
        return Err(format!("复制备份回 server 失败: {}", e));
    }

    // 4. 遍历 modified + added：从临时目录复制到 server/
    let files_to_copy: Vec<&String> = manifest.modified.iter().chain(manifest.added.iter()).collect();
    for rel_path in &files_to_copy {
        let src = tmp_dir.join(rel_path);
        let dest = server_dir.join(rel_path);
        if !src.exists() {
            println!("[Delta] 警告: 补丁中缺少文件 {}, 跳过", rel_path);
            continue;
        }
        // 创建父目录
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录失败 {}: {}", parent.display(), e))?;
        }
        fs::copy(&src, &dest)
            .map_err(|e| format!("复制文件失败 {}: {}", rel_path, e))?;
    }

    // 5. 遍历 deleted：从 server/ 删除
    for rel_path in &manifest.deleted {
        let target = server_dir.join(rel_path);
        if target.exists() {
            let _ = fs::remove_file(&target);
        }
    }

    // 6. 验证 server/package.json 的 version == expected_version
    let new_version = read_server_version(&server_dir);
    if new_version != expected_version {
        println!("[Delta] 版本验证失败: 期望 {} 实际 {}, 回滚...", expected_version, new_version);
        let _ = fs::remove_dir_all(&server_dir);
        let _ = rename_or_copy_dir(&backup_dir, &server_dir);
        let _ = fs::remove_dir_all(&tmp_dir);
        // Windows: 回滚后恢复 server 进程
        #[cfg(target_os = "windows")]
        {
            println!("[Delta] [Windows] 版本验证失败，恢复 server 进程...");
            let (child, port) = crate::start_server_process(&app);
            let state = app.state::<crate::ServerState>();
            if let Ok(mut guard) = state.child.lock() {
                *guard = Some(child);
            }
            crate::wait_for_server(port);
        }
        return Err(format!(
            "版本验证失败: 期望 {} 实际 {}",
            expected_version, new_version
        ));
    }

    // 7. 清理临时目录和备份
    let _ = fs::remove_dir_all(&tmp_dir);
    let _ = fs::remove_dir_all(&backup_dir);

    // 8. 清理 .next 编译缓存，强制 server 重启时重新加载
    let cache_dir = server_dir.join(".next").join("cache");
    if cache_dir.exists() {
        let _ = fs::remove_dir_all(&cache_dir);
        println!("[Delta] Cleaned .next/cache directory");
    }

    // 9. Windows 上补丁完成后自动重启 server（步骤 0 已停掉）
    #[cfg(target_os = "windows")]
    {
        println!("[Delta] [Windows] Restarting server after patch...");
        let (child, port) = crate::start_server_process(&app);
        let state = app.state::<crate::ServerState>();
        if let Ok(mut guard) = state.child.lock() {
            *guard = Some(child);
        }
        crate::wait_for_server(port);
        println!("[Delta] [Windows] Server restarted at port {}", port);
        // 返回版本号 + 重启标记，告知前端无需再调 restart_server
        println!("[Delta] 文件级补丁应用完成: server version = {}", new_version);
        return Ok(format!("{}|restarted:http://127.0.0.1:{}", new_version, port));
    }

    println!("[Delta] 文件级补丁应用完成: server version = {}", new_version);
    Ok(new_version)
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
