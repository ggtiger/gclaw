//! Server 增量更新（热更新）模块
//!
//! 通过 bsdiff/bspatch 对 server/ 目录进行增量更新，
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

/// 获取当前 server/ 的 old_tar（用于 bsdiff 差分）
///
/// 优先从远程 Release 下载当前版本的 server tar（保证与 CI 端 GNU tar 格式一致），
/// 下载失败时回退到本地打包（使用 Rust tar crate + 确定性参数）。
pub fn get_or_pack_server_tar_raw(
    resource_dir: &Path,
    current_version: &str,
) -> Result<PathBuf, String> {
    let server_dir = resource_dir.join("server");
    if !server_dir.exists() {
        return Err("server/ 目录不存在".into());
    }

    let output_path = resource_dir.join(format!("server-{}.tar", current_version));

    // 如果本地已有缓存的 tar，直接复用
    if output_path.exists() {
        println!("[Delta] 复用本地缓存的 server-{}.tar", current_version);
        return Ok(output_path);
    }

    // 尝试从 GitHub/Gitee Release 下载当前版本的 server tar.gz
    println!("[Delta] 尝试下载当前版本 server tar: server-{}.tar.gz", current_version);
    let tar_gz_path = resource_dir.join("server-current.tar.gz");

    let base_urls = [
        format!("https://github.com/ggtiger/gclaw/releases/download/v{}/server-{}.tar.gz", current_version, current_version),
        format!("https://gitee.com/laohu2022/gclaw/releases/download/v{}/server-{}.tar.gz", current_version, current_version),
    ];

    let mut download_ok = false;
    for url in &base_urls {
        if download_file_internal(url, &tar_gz_path.to_string_lossy()).is_ok() {
            // 下载完成后，解压前验证 gzip 完整性
            println!("[Delta] 验证下载的 tar.gz 完整性...");
            match fs::read(&tar_gz_path) {
                Ok(gz_data) => {
                    let mut decoder = flate2::read::GzDecoder::new(&gz_data[..]);
                    let mut tar_data = Vec::new();
                    match io::Read::read_to_end(&mut decoder, &mut tar_data) {
                        Ok(_) => {
                            // 验证解压后是有效的 tar（至少 512 字节）
                            if tar_data.len() < 512 {
                                println!(
                                    "[Delta] 下载的 tar.gz 解压后过小 ({} bytes)，跳过此源",
                                    tar_data.len()
                                );
                                let _ = fs::remove_file(&tar_gz_path);
                                continue;
                            }
                            // 写入解压后的 tar
                            if let Err(e) = fs::write(&output_path, &tar_data) {
                                println!("[Delta] 写入 tar 失败: {}，跳过此源", e);
                                let _ = fs::remove_file(&tar_gz_path);
                                continue;
                            }
                            let _ = fs::remove_file(&tar_gz_path);
                            println!(
                                "[Delta] 从 Release 下载 server tar 成功 ({} bytes)",
                                tar_data.len()
                            );
                            download_ok = true;
                            break;
                        }
                        Err(e) => {
                            println!(
                                "[Delta] 下载的 tar.gz 解压失败: {}，跳过此源",
                                e
                            );
                            let _ = fs::remove_file(&tar_gz_path);
                            continue;
                        }
                    }
                }
                Err(e) => {
                    println!("[Delta] 读取下载文件失败: {}，跳过此源", e);
                    let _ = fs::remove_file(&tar_gz_path);
                    continue;
                }
            }
        }
    }

    if download_ok {
        return Ok(output_path);
    }

    // 回退：本地打包
    println!("[Delta] 无法下载 server tar，回退到本地打包...");
    let _ = fs::remove_file(&tar_gz_path);

    // 优先使用系统 GNU tar（与 CI 端参数一致，保证 bsdiff 兼容）
    let tar_cmd = if cfg!(target_os = "macos") { "gtar" } else { "tar" };
    let server_dir_str = server_dir.to_string_lossy().to_string();
    let output_str = output_path.to_string_lossy().to_string();

    let tar_result = Command::new(tar_cmd)
        .args(&[
            "cf", &output_str,
            "--sort=name",
            "--mtime=2024-01-01 00:00:00",
            "--owner=0", "--group=0", "--numeric-owner",
            "--exclude=.git",
            "-C", &server_dir_str,
            ".",
        ])
        .output();

    match tar_result {
        Ok(output) if output.status.success() => {
            println!("[Delta] 使用系统 {} 打包成功", tar_cmd);
            return Ok(output_path);
        }
        Ok(output) => {
            println!(
                "[Delta] 系统 {} 执行失败: {}，回退到 Rust tar crate",
                tar_cmd,
                String::from_utf8_lossy(&output.stderr)
            );
        }
        Err(e) => {
            println!(
                "[Delta] 系统 {} 不可用: {}，回退到 Rust tar crate",
                tar_cmd, e
            );
        }
    }

    // 回退：使用 Rust tar crate（可能与 CI 端 GNU tar 不完全一致）
    let file = fs::File::create(&output_path)
        .map_err(|e| format!("创建 tar 失败: {}", e))?;
    let mut builder = tar::Builder::new(file);

    // 收集并排序文件列表，确保可重现
    let mut entries: Vec<(PathBuf, PathBuf)> = Vec::new();
    collect_files(&server_dir, &server_dir, &mut entries)?;
    entries.sort_by(|a, b| a.1.cmp(&b.1));

    for (full_path, rel_path) in &entries {
        if full_path.is_dir() {
            let mut header = tar::Header::new_gnu();
            header.set_entry_type(tar::EntryType::Directory);
            header.set_size(0);
            header.set_mtime(1704067200); // 2024-01-01 00:00:00 UTC
            header.set_uid(0);
            header.set_gid(0);
            header.set_mode(0o755);
            builder.append_data(&mut header, rel_path, io::empty())
                .map_err(|e| format!("写入目录 {} 失败: {}", rel_path.display(), e))?;
        } else {
            let mut f = fs::File::open(full_path)
                .map_err(|e| format!("打开文件 {} 失败: {}", full_path.display(), e))?;
            let metadata = f.metadata()
                .map_err(|e| format!("读取元数据 {} 失败: {}", full_path.display(), e))?;
            let mut header = tar::Header::new_gnu();
            header.set_size(metadata.len());
            header.set_mtime(1704067200);
            header.set_uid(0);
            header.set_gid(0);
            header.set_mode(0o644);
            builder.append_data(&mut header, rel_path, &mut f)
                .map_err(|e| format!("写入文件 {} 失败: {}", rel_path.display(), e))?;
        }
    }

    builder.finish()
        .map_err(|e| format!("写入 tar 失败: {}", e))?;

    Ok(output_path)
}

/// 内部下载函数（不暴露为 Tauri 命令）
fn download_file_internal(url: &str, path: &str) -> Result<(), String> {
    let curl = if cfg!(target_os = "windows") { "curl.exe" } else { "curl" };
    let mut cmd = Command::new(curl);
    cmd.args(&["-sL", "-f", "--connect-timeout", "15", "--max-time", "60"]);
    cmd.args(&["-o", path]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    cmd.arg(url);

    let output = cmd.output()
        .map_err(|e| format!("执行 curl 失败: {}", e))?;

    if !output.status.success() {
        let _ = fs::remove_file(path);
        return Err(format!("下载失败: {}", String::from_utf8_lossy(&output.stderr)));
    }

    // 下载完成后检查文件大小
    let file_meta = fs::metadata(path)
        .map_err(|e| format!("无法读取下载文件元数据: {}", e))?;
    if file_meta.len() < 100 {
        return Err(format!(
            "下载文件过小 ({} 字节)，可能是服务器返回了错误页面",
            file_meta.len()
        ));
    }

    Ok(())
}

/// 递归收集文件列表（排除 .git 目录）
fn collect_files(base: &Path, current: &Path, entries: &mut Vec<(PathBuf, PathBuf)>) -> Result<(), String> {
    let read_dir = fs::read_dir(current)
        .map_err(|e| format!("读取目录 {} 失败: {}", current.display(), e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if name_str == ".git" {
            continue;
        }

        let full_path = entry.path();
        let rel_path = full_path.strip_prefix(base)
            .unwrap_or(&full_path)
            .to_path_buf();

        entries.push((full_path.clone(), rel_path));

        if full_path.is_dir() {
            collect_files(base, &full_path, entries)?;
        }
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

/// 将 old_tar 用 delta patch 生成 new_tar，校验 target_hash，替换 server/
#[tauri::command]
pub async fn apply_server_delta(
    app: tauri::AppHandle,
    delta_path: String,
    target_hash: String,
    from_version: String,
) -> Result<String, String> {
    let resource_dir = app.path().resource_dir()
        .map_err(|e| format!("获取资源目录失败: {}", e))?;

    let server_dir = resource_dir.join("server");
    let backup_dir = resource_dir.join("server.bak");
    let delta = Path::new(&delta_path);

    if !delta.exists() {
        return Err(format!("delta 文件不存在: {}", delta_path));
    }

    // 检查 delta 文件大小合理性
    let delta_meta = fs::metadata(&delta)
        .map_err(|e| format!("无法读取 delta 文件元数据: {}", e))?;
    let delta_size = delta_meta.len();
    if delta_size < 1024 {
        return Err(format!(
            "delta 文件过小 ({} 字节)，可能是下载失败或服务器返回了错误页面",
            delta_size
        ));
    }
    println!("[Delta] delta 文件大小: {} bytes", delta_size);

    println!("[Delta] 开始应用增量更新...");

    // 1. 获取当前 server/ 的 old_tar（优先从 Release 下载以保证格式一致）
    println!("[Delta] 获取当前 server tar (from_version={})...", from_version);
    let old_tar = get_or_pack_server_tar_raw(&resource_dir, &from_version)?;

    // 2. 解压 delta（delta 是 gzip 压缩的）
    println!("[Delta] 解压 delta...");
    let delta_raw_path = resource_dir.join("server-delta.raw");
    {
        let delta_file = fs::File::open(delta)
            .map_err(|e| format!("打开 delta 文件失败: {}", e))?;
        let dec = flate2::read::GzDecoder::new(delta_file);
        let mut raw = fs::File::create(&delta_raw_path)
            .map_err(|e| format!("创建临时文件失败: {}", e))?;
        io::copy(&mut dec.take(500_000_000), &mut raw) // 500MB safety limit
            .map_err(|e| format!("解压 delta 失败: {}", e))?;
    }

    // 3. bspatch: old_tar + delta → new_tar
    println!("[Delta] 应用 bspatch...");
    let new_tar_path = resource_dir.join("server-new.tar");
    {
        let old_data = fs::read(&old_tar)
            .map_err(|e| format!("读取 old tar 失败: {}", e))?;
        let delta_data = fs::read(&delta_raw_path)
            .map_err(|e| format!("读取 delta 失败: {}", e))?;

        let mut new_data = Vec::new();
        let mut delta_slice = delta_data.as_slice();
        bsdiff::patch(&old_data, &mut delta_slice, &mut new_data)
            .map_err(|e| {
                // 输出诊断日志便于远程排查
                let old_hash = sha256_file(&old_tar).unwrap_or_else(|_| "?".into());
                let delta_hash = sha256_file(&delta_raw_path).unwrap_or_else(|_| "?".into());
                println!(
                    "[Delta] bspatch 失败诊断: old_tar size={} hash={:.16}, delta size={} hash={:.16}",
                    old_data.len(), old_hash, delta_data.len(), delta_hash
                );
                // 清理可能格式不匹配的缓存 tar，下次重新下载
                let _ = fs::remove_file(&resource_dir.join(format!("server-{}.tar", from_version)));
                format!("bspatch 失败（已清理缓存）: {}", e)
            })?;

        fs::write(&new_tar_path, &new_data)
            .map_err(|e| format!("写入 new tar 失败: {}", e))?;
    }

    // 清理 raw delta
    let _ = fs::remove_file(&delta_raw_path);

    // 3. SHA-256 校验
    println!("[Delta] 校验哈希...");
    let actual_hash = sha256_file(&new_tar_path)?;
    if actual_hash != target_hash {
        // 清理临时文件
        let _ = fs::remove_file(&old_tar);
        let _ = fs::remove_file(&new_tar_path);
        return Err(format!(
            "哈希校验失败: 期望 {} 实际 {}",
            target_hash, actual_hash
        ));
    }

    // 4. 备份当前 server/
    println!("[Delta] 备份 server/ → server.bak/...");
    if backup_dir.exists() {
        fs::remove_dir_all(&backup_dir)
            .map_err(|e| format!("删除旧备份失败: {}", e))?;
    }
    rename_or_copy_dir(&server_dir, &backup_dir)?;

    // 5. 解压 new_tar 到 server/（new_tar 是未压缩 tar）
    println!("[Delta] 解压新 server/...");
    if let Err(e) = extract_tar(&new_tar_path, &server_dir) {
        // 回滚
        println!("[Delta] 解压失败，回滚: {}", e);
        let _ = fs::remove_dir_all(&server_dir);
        let _ = rename_or_copy_dir(&backup_dir, &server_dir);
        let _ = fs::remove_file(&old_tar);
        let _ = fs::remove_file(&new_tar_path);
        let _ = fs::remove_dir_all(&backup_dir);
        return Err(format!("解压失败（已回滚）: {}", e));
    }

    // 6. 清理临时文件
    let _ = fs::remove_file(&old_tar);
    let _ = fs::remove_file(&new_tar_path);
    let _ = fs::remove_dir_all(&backup_dir);

    // 读取新版本号
    let new_version = read_server_version(&server_dir);
    println!("[Delta] 增量更新完成: server version = {}", new_version);

    // 清理旧版本缓存 tar
    if let Ok(entries) = fs::read_dir(&resource_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("server-") && name.ends_with(".tar") && name != format!("server-{}.tar", new_version) {
                let _ = fs::remove_file(entry.path());
                println!("[Delta] 清理旧版本缓存: {}", name);
            }
        }
    }

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

/// 解压未压缩 tar 到目标目录（使用系统 tar）
fn extract_tar(archive_path: &Path, dest: &Path) -> Result<(), String> {
    // 先解压到临时目录，成功后原子替换
    let tmp_dir = dest.with_extension("tmp");
    if tmp_dir.exists() {
        fs::remove_dir_all(&tmp_dir)
            .map_err(|e| format!("清理临时目录失败: {}", e))?;
    }
    fs::create_dir_all(&tmp_dir)
        .map_err(|e| format!("创建临时目录失败: {}", e))?;

    let tar_cmd = if cfg!(target_os = "windows") { "tar.exe" } else { "tar" };
    let mut cmd = Command::new(tar_cmd);
    let archive_str = archive_path.to_string_lossy();
    let dest_str = tmp_dir.to_string_lossy();
    cmd.args(&["xf", &archive_str, "-C", &dest_str]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output()
        .map_err(|e| format!("执行 tar 解压失败: {}", e))?;

    if !output.status.success() {
        let _ = fs::remove_dir_all(&tmp_dir);
        return Err(format!("tar 解压失败: {}", String::from_utf8_lossy(&output.stderr)));
    }

    // 移动到目标位置
    if dest.exists() {
        fs::remove_dir_all(dest)
            .map_err(|e| format!("删除旧目录失败: {}", e))?;
    }
    rename_or_copy_dir(&tmp_dir, dest)?;

    Ok(())
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
