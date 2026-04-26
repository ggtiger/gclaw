//! Server 增量更新（热更新）模块
//!
//! 通过 bsdiff/bspatch 对 server/ 目录进行增量更新，
//! 独立于 Tauri 全量更新通道。

use sha2::{Sha256, Digest};
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use tauri::Manager;

/// 将 server/ 目录打包为未压缩 tar（用于 bsdiff 差分）
pub fn pack_server_tar_raw(resource_dir: &Path) -> Result<PathBuf, String> {
    let server_dir = resource_dir.join("server");
    if !server_dir.exists() {
        return Err("server/ 目录不存在".into());
    }

    let output_path = resource_dir.join("server-current.tar");
    let file = fs::File::create(&output_path)
        .map_err(|e| format!("创建 tar 失败: {}", e))?;
    let mut tar = tar::Builder::new(file);

    tar.append_dir_all(".", &server_dir)
        .map_err(|e| format!("打包 server/ 失败: {}", e))?;

    tar.finish()
        .map_err(|e| format!("写入 tar 失败: {}", e))?;

    Ok(output_path)
}

/// 将 server/ 目录打包为 server-current.tar.gz
pub fn pack_server_tar(resource_dir: &Path) -> Result<PathBuf, String> {
    let server_dir = resource_dir.join("server");
    if !server_dir.exists() {
        return Err("server/ 目录不存在".into());
    }

    let output_path = resource_dir.join("server-current.tar.gz");

    let file = fs::File::create(&output_path)
        .map_err(|e| format!("创建 tar.gz 失败: {}", e))?;
    let enc = flate2::write::GzEncoder::new(file, flate2::Compression::default());
    let mut tar = tar::Builder::new(enc);

    // 打包 server/ 目录内容（不含 server/ 前缀）
    tar.append_dir_all(".", &server_dir)
        .map_err(|e| format!("打包 server/ 失败: {}", e))?;

    tar.finish()
        .map_err(|e| format!("写入 tar.gz 失败: {}", e))?;

    Ok(output_path)
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
pub fn apply_server_delta(
    app: tauri::AppHandle,
    delta_path: String,
    target_hash: String,
) -> Result<String, String> {
    let resource_dir = app.path().resource_dir()
        .map_err(|e| format!("获取资源目录失败: {}", e))?;

    let server_dir = resource_dir.join("server");
    let backup_dir = resource_dir.join("server.bak");
    let delta = Path::new(&delta_path);

    if !delta.exists() {
        return Err(format!("delta 文件不存在: {}", delta_path));
    }

    println!("[Delta] 开始应用增量更新...");

    // 1. 打包当前 server/ 为 old_tar（未压缩，bsdiff 在未压缩数据上差分）
    println!("[Delta] 打包当前 server/...");
    let old_tar = pack_server_tar_raw(&resource_dir)?;

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
            .map_err(|e| format!("bspatch 失败: {}", e))?;

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

    Ok(new_version)
}

/// 获取当前 server/ 的版本号（从 package.json 读取）
#[tauri::command]
pub fn get_current_server_version(app: tauri::AppHandle) -> String {
    let resource_dir: PathBuf = match app.path().resource_dir() {
        Ok(d) => d,
        Err(_) => return "unknown".into(),
    };
    read_server_version(&resource_dir.join("server"))
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

/// 解压未压缩 tar 到目标目录
fn extract_tar(archive_path: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(archive_path)
        .map_err(|e| format!("打开归档失败: {}", e))?;
    let mut tar = tar::Archive::new(file);

    // 先解压到临时目录，成功后原子替换
    let tmp_dir = dest.with_extension("tmp");
    if tmp_dir.exists() {
        fs::remove_dir_all(&tmp_dir)
            .map_err(|e| format!("清理临时目录失败: {}", e))?;
    }

    tar.unpack(&tmp_dir)
        .map_err(|e| format!("解压失败: {}", e))?;

    // 移动到目标位置
    if dest.exists() {
        fs::remove_dir_all(dest)
            .map_err(|e| format!("删除旧目录失败: {}", e))?;
    }
    rename_or_copy_dir(&tmp_dir, dest)?;

    Ok(())
}

/// 解压 tar.gz 到目标目录
fn extract_tar_gz(archive_path: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(archive_path)
        .map_err(|e| format!("打开归档失败: {}", e))?;
    let dec = flate2::read::GzDecoder::new(file);
    let mut tar = tar::Archive::new(dec);

    // 先解压到临时目录，成功后原子替换
    let tmp_dir = dest.with_extension("tmp");
    if tmp_dir.exists() {
        fs::remove_dir_all(&tmp_dir)
            .map_err(|e| format!("清理临时目录失败: {}", e))?;
    }

    tar.unpack(&tmp_dir)
        .map_err(|e| format!("解压失败: {}", e))?;

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
