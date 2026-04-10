use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use std::sync::Mutex;
use std::process::{Child, Command};
use std::net::TcpListener;

/// 服务器状态
pub struct ServerState {
    pub child: Mutex<Option<Child>>,
    pub port: u16,
}

// ============ 常量 ============

const NODE_VERSION: &str = "22.18.0";
const PYTHON_VERSION: &str = "3.12.13";
const GIT_VERSION: &str = "2.47.1";
const GIT_WINDOWS_TAG: &str = "v2.47.1.windows.1";
const PYTHON_RELEASE_TAG: &str = "20260325";

// 国内镜像（首次下载快）
const NODE_MIRROR: &str = "https://cdn.npmmirror.com/binaries/node";
const PYTHON_MIRROR: &str = "https://registry.npmmirror.com/-/binary/python-build-standalone";
// Windows PortableGit 便携版（npmmirror 国内镜像，含 bash.exe）
const GIT_MIRROR: &str = "https://registry.npmmirror.com/-/binary/git-for-windows";

// ============ 启动页（独立 splash 窗口） ============

// 编译时嵌入 splash.html 内容
const SPLASH_HTML: &str = include_str!("../splash.html");
// 编译时嵌入应用图标
const APP_ICON_PNG: &[u8] = include_bytes!("../icons/icon.png");

/// 创建 splash 窗口，通过自定义协议 splashpage:// 加载内嵌的 HTML
fn create_splash_window(handle: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    // 構建平台特定的自定义协议 URL
    // macOS/Linux: splashpage://localhost
    // Windows: http://splashpage.localhost
    #[cfg(target_os = "windows")]
    let splash_url_str = "http://splashpage.localhost";
    #[cfg(not(target_os = "windows"))]
    let splash_url_str = "splashpage://localhost";

    let url: tauri::Url = match splash_url_str.parse() {
        Ok(u) => u,
        Err(e) => {
            eprintln!("[GClaw] Failed to parse splash URL: {}", e);
            return None;
        }
    };

    match WebviewWindowBuilder::new(
        handle,
        "splash",
        WebviewUrl::External(url),
    )
    .title("")
    .inner_size(480.0, 320.0)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .center()
    .visible(false)  // 先隐藏，等页面加载完再显示，避免黑屏闪烁
    .build() {
        Ok(w) => {
            println!("[GClaw] Splash window created (hidden until page loaded)");
            Some(w)
        }
        Err(e) => {
            eprintln!("[GClaw] Failed to create splash window: {}", e);
            None
        }
    }
}

/// 读取应用主题设置（从 global.json）
fn read_app_theme(app: &tauri::AppHandle) -> String {
    let data_dir = app.path().app_data_dir().ok();
    let paths: Vec<std::path::PathBuf> = [
        data_dir.as_ref().map(|d| d.join("data").join("global.json")),
        // dev fallback
        Some(std::path::PathBuf::from("data/global.json")),
    ].into_iter().flatten().collect();

    for p in paths {
        if p.exists() {
            if let Ok(content) = std::fs::read_to_string(&p) {
                // 简单解析 "theme":"xxx"
                if let Some(pos) = content.find("\"theme\"") {
                    let rest = &content[pos..];
                    if let Some(start) = rest.find(':') {
                        let val = rest[start+1..].trim().trim_start_matches('"');
                        if let Some(end) = val.find('"') {
                            return val[..end].to_string();
                        }
                    }
                }
            }
        }
    }
    "system".to_string()
}

/// 将主题设置应用到 splash 窗口
fn apply_splash_theme(app: &tauri::AppHandle) {
    let theme = read_app_theme(app);
    // "system" 时不设置 data-theme，让 splash 用 prefers-color-scheme
    if theme == "light" || theme == "dark" {
        if let Some(w) = app.get_webview_window("splash") {
            let js = format!("document.documentElement.setAttribute('data-theme','{}')", theme);
            let _ = w.eval(&js);
        }
    }
}

// ============ 平台辅助 ============

#[allow(dead_code)]
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

/// 创建隐藏窗口的子进程（Windows 不弹出控制台窗口）
#[cfg(target_os = "windows")]
fn hidden_command(program: &str) -> Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let mut cmd = Command::new(program);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[cfg(not(target_os = "windows"))]
fn hidden_command(program: &str) -> Command {
    Command::new(program)
}

// ============ 工具函数 ============

fn find_available_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("Failed to bind to find available port")
        .local_addr()
        .expect("Failed to get local addr")
        .port()
}

fn wait_for_server(port: u16) {
    for _ in 0..300 {
        if std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok() {
            println!("[GClaw] Server ready at http://127.0.0.1:{}", port);
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    eprintln!("[GClaw] Warning: Server did not start within 30s");
}

/// 更新启动页状态
fn splash_update(app: &tauri::AppHandle, status: &str, progress: i32, detail: &str) {
    if let Some(window) = app.get_webview_window("splash") {
        let js = format!(
            "window.__splashUpdate && window.__splashUpdate({{status:'{}',progress:{},detail:'{}'}})",
            status.replace('\'', "\\'"),
            progress,
            detail.replace('\'', "\\'")
        );
        let _ = window.eval(&js);
    }
}

/// 更新启动页检查项状态
fn splash_check(app: &tauri::AppHandle, item: &str, state: &str) {
    if let Some(window) = app.get_webview_window("splash") {
        let js = format!(
            "window.__splashUpdate && window.__splashUpdate({{check{}:'{}'}})",
            item, state // item: "Node"/"Python", state: "ok"/"downloading"/"pending"
        );
        let _ = window.eval(&js);
    }
}

/// 显示启动页错误
fn splash_error(app: &tauri::AppHandle, msg: &str) {
    if let Some(window) = app.get_webview_window("splash") {
        let js = format!(
            "window.__splashUpdate && window.__splashUpdate({{status:'❌ {}',error:true}})",
            msg.replace('\'', "\\'")
        );
        let _ = window.eval(&js);
    }
}

// ============ 运行时管理 ============

/// 获取运行时存储目录 ({app_data_dir}/runtimes/)
fn runtimes_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    let data_dir = app.path().app_data_dir()
        .expect("Failed to get app data dir");
    let dir = data_dir.join("runtimes");
    std::fs::create_dir_all(&dir).ok();
    dir
}

/// 查找 Node 二进制路径
fn find_node(app: &tauri::AppHandle) -> Option<String> {
    let rd = runtimes_dir(app);
    let bundled = if cfg!(target_os = "windows") {
        rd.join("node").join("node.exe")
    } else {
        rd.join("node").join("bin").join("node")
    };
    if bundled.exists() {
        println!("[GClaw] Found runtime Node: {}", bundled.display());
        return Some(bundled.to_string_lossy().to_string());
    }
    // 系统 fallback
    which_node()
}

/// 查找 Python3 二进制路径
fn find_python3(app: &tauri::AppHandle) -> Option<String> {
    let rd = runtimes_dir(app);
    let bundled = if cfg!(target_os = "windows") {
        rd.join("python").join("python.exe")
    } else {
        rd.join("python").join("bin").join("python3")
    };
    if bundled.exists() {
        println!("[GClaw] Found runtime Python: {}", bundled.display());
        return Some(bundled.to_string_lossy().to_string());
    }
    which_python3()
}

/// 查找 Git 二进制路径
fn find_git(_app: &tauri::AppHandle) -> Option<String> {
    // Windows: 检查内置 PortableGit（runtimes/git/cmd/git.exe）
    #[cfg(target_os = "windows")]
    {
        let rd = runtimes_dir(_app);
        let bundled = rd.join("git").join("cmd").join("git.exe");
        if bundled.exists() {
            println!("[GClaw] Found runtime PortableGit: {}", bundled.display());
            return Some(bundled.to_string_lossy().to_string());
        }
    }
    which_git()
}

/// 查找 Git Bash 路径（Windows Claude Code 必需）
fn find_git_bash(app: &tauri::AppHandle) -> Option<String> {
    // 运行时 PortableGit 的 bash.exe
    let rd = runtimes_dir(app);
    let bundled_bash = rd.join("git").join("bin").join("bash.exe");
    if bundled_bash.exists() {
        return Some(bundled_bash.to_string_lossy().to_string());
    }
    // 系统安装的 Git 的 bash.exe
    for path in &[
        "C:\\Program Files\\Git\\bin\\bash.exe",
        "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ] {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    None
}

fn which_node() -> Option<String> {
    let cmd = if cfg!(target_os = "windows") { "where" } else { "which" };
    if let Ok(output) = hidden_command(cmd).arg("node").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).lines().next().unwrap_or("").trim().to_string();
            if !path.is_empty() { return Some(path); }
        }
    }
    if !cfg!(target_os = "windows") {
        for path in &["/usr/local/bin/node", "/opt/homebrew/bin/node", "/usr/bin/node"] {
            if std::path::Path::new(path).exists() { return Some(path.to_string()); }
        }
    }
    None
}

fn which_python3() -> Option<String> {
    let cmd = if cfg!(target_os = "windows") { "where" } else { "which" };
    let bin_name = if cfg!(target_os = "windows") { "python" } else { "python3" };
    if let Ok(output) = hidden_command(cmd).arg(bin_name).output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).lines().next().unwrap_or("").trim().to_string();
            if !path.is_empty() {
                // Windows: 排除 Microsoft Store 跳板（WindowsApps 目录下的不是真正的 Python）
                if cfg!(target_os = "windows") && path.contains("WindowsApps") {
                    println!("[GClaw] Ignoring Windows Store python stub: {}", path);
                } else if verify_python(&path) {
                    return Some(path);
                }
            }
        }
    }
    if cfg!(target_os = "windows") {
        for path in &["C:\\Python312\\python.exe", "C:\\Python311\\python.exe"] {
            if std::path::Path::new(path).exists() && verify_python(path) { return Some(path.to_string()); }
        }
    } else {
        for path in &["/usr/local/bin/python3", "/opt/homebrew/bin/python3", "/opt/homebrew/bin/python3.12", "/usr/bin/python3"] {
            if std::path::Path::new(path).exists() { return Some(path.to_string()); }
        }
    }
    None
}

/// 验证 python 是否真的可用（排除 Windows Store 跳板等假 python）
fn verify_python(python_path: &str) -> bool {
    match hidden_command(python_path).arg("--version").output() {
        Ok(output) => {
            let out = String::from_utf8_lossy(&output.stdout);
            let ok = output.status.success() && out.contains("Python");
            if !ok {
                println!("[GClaw] Python verification failed for {}: {}", python_path, out.trim());
            }
            ok
        }
        Err(_) => false,
    }
}

/// 查找 git 二进制路径（macOS GUI 应用需要显式注入）
fn which_git() -> Option<String> {
    let cmd = if cfg!(target_os = "windows") { "where" } else { "which" };
    if let Ok(output) = hidden_command(cmd).arg("git").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).lines().next().unwrap_or("").trim().to_string();
            if !path.is_empty() { return Some(path); }
        }
    }
    if !cfg!(target_os = "windows") {
        // macOS 常见 git 安装路径
        for path in &["/usr/local/bin/git", "/opt/homebrew/bin/git", "/usr/bin/git"] {
            if std::path::Path::new(path).exists() { return Some(path.to_string()); }
        }
    } else {
        // Windows: 常见 git 安装路径
        for path in &["C:\\Program Files\\Git\\bin\\git.exe", "C:\\Program Files (x86)\\Git\\bin\\git.exe", "C:\\Program Files\\Git\\cmd\\git.exe"] {
            if std::path::Path::new(path).exists() { return Some(path.to_string()); }
        }
    }
    None
}

/// 构建下载 URL
fn node_download_url() -> String {
    let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
    if cfg!(target_os = "windows") {
        format!("{}/v{}/node-v{}-win-{}.zip", NODE_MIRROR, NODE_VERSION, NODE_VERSION, arch)
    } else if cfg!(target_os = "macos") {
        format!("{}/v{}/node-v{}-darwin-{}.tar.gz", NODE_MIRROR, NODE_VERSION, NODE_VERSION, arch)
    } else {
        format!("{}/v{}/node-v{}-linux-{}.tar.xz", NODE_MIRROR, NODE_VERSION, NODE_VERSION, arch)
    }
}

fn python_download_url() -> String {
    let arch = if cfg!(target_arch = "aarch64") { "aarch64" } else { "x86_64" };
    let platform_suffix = if cfg!(target_os = "windows") {
        format!("{}-pc-windows-msvc", arch)
    } else if cfg!(target_os = "macos") {
        format!("{}-apple-darwin", arch)
    } else {
        format!("{}-unknown-linux-gnu", arch)
    };
    format!(
        "{}/{}/cpython-{}+{}-{}-install_only.tar.gz",
        PYTHON_MIRROR, PYTHON_RELEASE_TAG, PYTHON_VERSION, PYTHON_RELEASE_TAG, platform_suffix
    )
}

/// 构建 Git 下载 URL（Windows 下载 PortableGit 含 bash.exe）
fn git_download_url() -> Option<String> {
    if cfg!(target_os = "windows") {
        // PortableGit: 完整便携版，含 git.exe + bash.exe，Claude Code 必需
        Some(format!("{}/{}/PortableGit-{}-64-bit.7z.exe",
            GIT_MIRROR, GIT_WINDOWS_TAG, GIT_VERSION))
    } else {
        // macOS: /usr/bin/git (Xcode CLT) 或 /opt/homebrew/bin/git (Homebrew)
        // Linux: 系统包管理器安装 (apt/yum install git)
        None
    }
}

/// 获取文件大小（Content-Length）
fn get_remote_size(url: &str) -> u64 {
    let output = hidden_command(curl_cmd())
        .args(&["-sI", "-L", url])
        .output();
    match output {
        Ok(out) if out.status.success() => {
            let headers = String::from_utf8_lossy(&out.stdout);
            for line in headers.lines() {
                if line.to_lowercase().starts_with("content-length:") {
                    if let Ok(size) = line.split(':').nth(1).unwrap_or("0").trim().parse::<u64>() {
                        return size;
                    }
                }
            }
        }
        _ => {}
    }
    0
}

/// 下载并解压运行时
fn download_runtime(
    app: &tauri::AppHandle,
    name: &str,       // "node", "python" or "git"
    label: &str,      // 显示名 "Node.js", "Python" or "Git"
    url: &str,
) -> Result<(), String> {
    let rd = runtimes_dir(app);
    let target_dir = rd.join(name);

    // 已存在则跳过
    let check_bin = if name == "node" {
        if cfg!(target_os = "windows") { target_dir.join("node.exe") }
        else { target_dir.join("bin").join("node") }
    } else if name == "git" {
        // Windows PortableGit: cmd/git.exe + bin/bash.exe 都必须存在
        target_dir.join("cmd").join("git.exe")
    } else {
        if cfg!(target_os = "windows") { target_dir.join("python.exe") }
        else { target_dir.join("bin").join("python3") }
    };

    // Windows git: 如果有 git.exe 但没有 bash.exe（旧的 MinGit），删除重下 PortableGit
    if name == "git" && check_bin.exists() {
        let bash_exe = target_dir.join("bin").join("bash.exe");
        if !bash_exe.exists() {
            println!("[GClaw] Git found but bash.exe missing (old MinGit?), re-downloading PortableGit...");
            std::fs::remove_dir_all(&target_dir).ok();
        }
    }

    // Windows python: 如果旧路径 bin/python.exe 存在但新路径 python.exe 不存在，删除重下
    if name == "python" && !check_bin.exists() && cfg!(target_os = "windows") {
        let old_bin = target_dir.join("bin").join("python.exe");
        if old_bin.exists() {
            println!("[GClaw] Python old layout detected (bin/python.exe), re-downloading...");
            std::fs::remove_dir_all(&target_dir).ok();
        }
    }

    if check_bin.exists() {
        println!("[GClaw] {} already exists, skip download", label);
        return Ok(());
    }

    let temp_dir = std::env::temp_dir().join(format!("gclaw-dl-{}", name));
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let archive_ext = if url.ends_with(".7z.exe") { ".7z.exe" }
                      else if url.ends_with(".zip") { ".zip" }
                      else if url.ends_with(".tar.xz") { ".tar.xz" }
                      else { ".tar.gz" };
    let archive = temp_dir.join(format!("download{}", archive_ext));

    // 获取总大小
    let total = get_remote_size(url);
    let total_mb = total as f64 / 1024.0 / 1024.0;
    println!("[GClaw] Downloading {} from {} ({:.1} MB)", label, url, total_mb);

    splash_update(app, &format!("正在下载 {}...", label), 0,
        &format!("{:.1} MB", total_mb));
    splash_check(app, name, "downloading");

    // 启动 curl 下载
    let mut child = hidden_command(curl_cmd())
        .args(&["-L", "-f", "--progress-bar", "-o"])
        .arg(&archive)
        .arg(url)
        .stderr(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("curl 启动失败: {}", e))?;

    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    // 清理不完整文件
                    std::fs::remove_file(&archive).ok();
                    return Err(format!("{} 下载失败 (退出码: {:?})", label, status.code()));
                }
                break;
            }
            Ok(None) => {
                // 更新进度
                let downloaded = std::fs::metadata(&archive).map(|m| m.len()).unwrap_or(0);
                let progress = if total > 0 {
                    (downloaded as f64 / total as f64 * 100.0) as i32
                } else {
                    0
                };
                let elapsed = start.elapsed().as_secs_f64();
                let speed_mb = if elapsed > 0.0 { downloaded as f64 / elapsed / 1024.0 / 1024.0 } else { 0.0 };
                let dl_mb = downloaded as f64 / 1024.0 / 1024.0;
                splash_update(app, &format!("正在下载 {}...", label), progress,
                    &format!("{:.1} / {:.1} MB  ({:.1} MB/s)", dl_mb, total_mb, speed_mb));
            }
            Err(e) => return Err(format!("下载进程异常: {}", e)),
        }
        std::thread::sleep(std::time::Duration::from_millis(300));
    }

    // 解压
    splash_update(app, &format!("正在解压 {}...", label), 100, "请稍候...");
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    // PortableGit zip 无顶层目录，直接包含 cmd/、bin/、mingw64/ 等，不需 strip
    let strip = if name == "git" { 0 } else { 1 };

    let extract_status = if url.ends_with(".7z.exe") {
        // PortableGit 是 7z 自解压格式，运行自身即可解压
        hidden_command(archive.to_str().unwrap_or(""))
            .arg(format!("-o{}", target_dir.display()))
            .arg("-y")
            .status()
            .map_err(|e| format!("解压失败: {}", e))?
    } else if url.ends_with(".tar.xz") {
        let mut cmd = hidden_command("tar");
        cmd.args(&["-xJf", archive.to_str().unwrap_or("")]);
        if strip > 0 { cmd.arg(format!("--strip-components={}", strip)); }
        cmd.arg("-C").arg(&target_dir)
            .status()
            .map_err(|e| format!("解压失败: {}", e))?
    } else if url.ends_with(".zip") {
        let mut cmd = hidden_command("tar");
        cmd.args(&["-xf", archive.to_str().unwrap_or("")]);
        if strip > 0 { cmd.arg(format!("--strip-components={}", strip)); }
        cmd.arg("-C").arg(&target_dir)
            .status()
            .map_err(|e| format!("解压失败: {}", e))?
    } else {
        let mut cmd = hidden_command("tar");
        cmd.args(&["-xzf", archive.to_str().unwrap_or("")]);
        if strip > 0 { cmd.arg(format!("--strip-components={}", strip)); }
        cmd.arg("-C").arg(&target_dir)
            .status()
            .map_err(|e| format!("解压失败: {}", e))?
    };

    if !extract_status.success() {
        std::fs::remove_dir_all(&target_dir).ok();
        return Err(format!("{} 解压失败", label));
    }

    // 设置权限（仅 Unix）
    if name == "node" {
        #[cfg(unix)]
        {
            let bin = target_dir.join("bin").join("node");
            std::process::Command::new("chmod").args(&["+x", bin.to_str().unwrap_or("")]).status().ok();
        }
    }

    // 清理临时文件
    std::fs::remove_dir_all(&temp_dir).ok();

    splash_check(app, name, "ok");
    println!("[GClaw] {} installed successfully", label);
    Ok(())
}

/// 下载 Python 后安装 pip 包
fn install_python_pip(app: &tauri::AppHandle) -> Result<(), String> {
    let rd = runtimes_dir(app);
    let python_bin = if cfg!(target_os = "windows") {
        rd.join("python").join("python.exe")
    } else {
        rd.join("python").join("bin").join("python3")
    };
    if !python_bin.exists() { return Ok(()); }

    // 检查 requests 是否已安装
    let check = hidden_command(python_bin.to_str().unwrap_or(""))
        .args(&["-c", "import requests, yaml"])
        .status();
    if check.map(|s| s.success()).unwrap_or(false) {
        return Ok(()); // 已安装
    }

    splash_update(app, "正在安装 Python 依赖包...", 100, "requests, pyyaml");

    // 安装 pip（如果缺失）
    hidden_command(python_bin.to_str().unwrap_or(""))
        .args(&["-m", "ensurepip", "--default-pip"])
        .status().ok();

    // 用清华镜像安装
    let status = hidden_command(python_bin.to_str().unwrap_or(""))
        .args(&["-m", "pip", "install", "--no-cache-dir", "--no-compile",
                "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
                "requests", "pyyaml"])
        .status()
        .map_err(|e| format!("pip 安装失败: {}", e))?;

    if !status.success() {
        return Err("pip 包安装失败".into());
    }
    Ok(())
}

/// 将打包的 skills 同步到 data_dir/skills（仅复制不存在的技能，不覆盖用户修改）
fn sync_bundled_skills(bundled: &std::path::Path, target: &std::path::Path) {
    if !bundled.exists() { return; }
    std::fs::create_dir_all(target).ok();
    if let Ok(entries) = std::fs::read_dir(bundled) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let dest = target.join(&name);
            if dest.exists() { continue; } // 不覆盖已有的
            let src = entry.path();
            if src.is_dir() {
                copy_dir_recursive(&src, &dest);
            } else {
                std::fs::copy(&src, &dest).ok();
            }
            println!("[GClaw] Synced bundled skill: {}", name.to_string_lossy());
        }
    }
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) {
    std::fs::create_dir_all(dst).ok();
    if let Ok(entries) = std::fs::read_dir(src) {
        for entry in entries.flatten() {
            let p = entry.path();
            let dest = dst.join(entry.file_name());
            if p.is_dir() {
                copy_dir_recursive(&p, &dest);
            } else {
                std::fs::copy(&p, &dest).ok();
            }
        }
    }
}

// ============ 启动服务器 ============

fn start_server(app: &tauri::AppHandle) -> (Child, u16) {
    let port = find_available_port();
    let resource_dir = app.path().resource_dir()
        .expect("Failed to get resource dir");
    let server_js = resource_dir.join("server").join("server.js");
    let data_dir = app.path().app_data_dir()
        .expect("Failed to get app data dir");
    std::fs::create_dir_all(&data_dir).ok();

    // 将 bundled skills 同步到 data_dir/skills（首次或有新技能时）
    let skills_dir = data_dir.join("skills");
    let bundled_skills = resource_dir.join("server").join("skills");
    sync_bundled_skills(&bundled_skills, &skills_dir);

    let node_bin = find_node(app).unwrap_or_else(|| "node".into());
    let node_dir = std::path::Path::new(&node_bin)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let current_path = std::env::var("PATH").unwrap_or_default();

    let mut path_parts = vec![];

    // 1. Node 目录
    if !node_dir.is_empty() && !current_path.contains(&node_dir) {
        path_parts.push(node_dir.clone());
    }

    // 2. 运行时 Python（优先）
    let rd = runtimes_dir(app);
    let runtime_python = if cfg!(target_os = "windows") {
        rd.join("python").join("python.exe")
    } else {
        rd.join("python").join("bin").join("python3")
    };
    if runtime_python.exists() {
        // Windows: 技能调用 python3 但 Windows 只有 python.exe，创建 python3.exe 副本
        #[cfg(target_os = "windows")]
        {
            let python3_exe = runtime_python.parent().unwrap().join("python3.exe");
            if !python3_exe.exists() {
                println!("[GClaw] Creating python3.exe alias for Windows compatibility");
                let _ = std::fs::copy(&runtime_python, &python3_exe);
            }
        }
        if let Some(py_dir) = runtime_python.parent() {
            let s = py_dir.to_string_lossy().to_string();
            if !current_path.contains(&s) && !path_parts.contains(&s) {
                path_parts.push(s);
            }
        }
    } else if let Some(sys_python) = which_python3() {
        // 3. 系统 Python
        if let Some(py_dir) = std::path::Path::new(&sys_python).parent() {
            let s = py_dir.to_string_lossy().to_string();
            if !current_path.contains(&s) && s != node_dir {
                path_parts.push(s);
            }
        }
    }

    // 4. Git（PATH 注入 + CLAUDE_CODE_GIT_BASH_PATH）
    if let Some(git_bin) = find_git(app) {
        if let Some(git_dir) = std::path::Path::new(&git_bin).parent() {
            let s = git_dir.to_string_lossy().to_string();
            if !current_path.contains(&s) && !path_parts.contains(&s) {
                path_parts.push(s);
            }
        }
        // PortableGit 的 bin/ 目录也需要加入 PATH（含 bash.exe 等工具）
        if let Some(git_root) = std::path::Path::new(&git_bin).parent().and_then(|p| p.parent()) {
            let bin_dir = git_root.join("bin");
            if bin_dir.exists() {
                let s = bin_dir.to_string_lossy().to_string();
                if !current_path.contains(&s) && !path_parts.contains(&s) {
                    path_parts.push(s);
                }
            }
            let usr_bin = git_root.join("usr").join("bin");
            if usr_bin.exists() {
                let s = usr_bin.to_string_lossy().to_string();
                if !current_path.contains(&s) && !path_parts.contains(&s) {
                    path_parts.push(s);
                }
            }
        }
    }

    let sep = path_separator();
    let enhanced_path = if path_parts.is_empty() {
        current_path.clone()
    } else {
        format!("{}{}{}", path_parts.join(sep), sep, current_path)
    };

    println!("[GClaw] Starting server: node {} (port={})", server_js.display(), port);

    let mut cmd = hidden_command(&node_bin);
    cmd.arg(&server_js)
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("GCLAW_DATA_DIR", data_dir.to_string_lossy().as_ref())
        .env("GCLAW_SKILLS_DIR", skills_dir.to_string_lossy().as_ref())
        .env("PATH", &enhanced_path);
    println!("[GClaw] GCLAW_SKILLS_DIR={}", skills_dir.display());

    // 内嵌 Python 的 PYTHONHOME
    if runtime_python.exists() {
        let python_home = rd.join("python");
        cmd.env("PYTHONHOME", python_home.to_string_lossy().as_ref());
        println!("[GClaw] PYTHONHOME={}", python_home.display());
    }

    // Windows: 强制 Python 使用 UTF-8 编码（避免中文乱码）
    #[cfg(target_os = "windows")]
    {
        cmd.env("PYTHONUTF8", "1");
        cmd.env("PYTHONIOENCODING", "utf-8");
    }

    // Windows: 设置 CLAUDE_CODE_GIT_BASH_PATH（Claude Code on Windows 必需）
    if let Some(bash_path) = find_git_bash(app) {
        cmd.env("CLAUDE_CODE_GIT_BASH_PATH", &bash_path);
        println!("[GClaw] CLAUDE_CODE_GIT_BASH_PATH={}", bash_path);
    }

    let child = cmd
        .current_dir(resource_dir.join("server"))
        .spawn()
        .expect("Failed to start Next.js server");

    (child, port)
}

// ============ Tauri Commands ============

/// 前端调用：将二进制数据写入指定路径（配合 dialog 插件使用）
#[tauri::command]
fn save_file_content(path: String, content: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// splash 重试按钮调用：重新执行启动流程
#[tauri::command]
fn retry_startup(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        run_production_startup(&app);
    });
}

#[tauri::command]
fn get_server_url(state: tauri::State<ServerState>) -> String {
    format!("http://127.0.0.1:{}", state.port)
}

#[tauri::command]
fn navigate_to(path: String, state: tauri::State<ServerState>, app: tauri::AppHandle) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}{}", state.port, path);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.navigate(url.parse().map_err(|e| format!("Invalid URL: {}", e))?);
        Ok(())
    } else {
        Err("Window not found".into())
    }
}

/// 前端页面渲染完成后调用，关闭 splash 并显示主窗口
#[tauri::command]
fn app_ready(app: tauri::AppHandle) {
    println!("[GClaw] Frontend signaled ready");
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

/// 生产模式启动流程：检查/下载运行时 → 启动服务 → 导航主窗口
fn run_production_startup(handle: &tauri::AppHandle) {
    // 重置 splash 状态（重试时需要）
    splash_update(handle, "正在检查环境...", 20, "");

    let node_present = find_node(handle).is_some();
    if !node_present {
        splash_update(handle, "正在准备运行环境...", 30, "首次启动需要下载，请稍候");
        match download_runtime(handle, "node", "Node.js", &node_download_url()) {
            Ok(_) => {}
            Err(e) => {
                eprintln!("[GClaw] Node.js download failed: {}", e);
                splash_error(handle, "环境准备失败，请检查网络后重试");
                return;
            }
        }
    }

    let python_present = find_python3(handle).is_some();
    if !python_present {
        splash_update(handle, "正在准备运行环境...", 50, "即将完成");
        match download_runtime(handle, "python", "Python", &python_download_url()) {
            Ok(_) => {
                if let Err(e) = install_python_pip(handle) {
                    eprintln!("[GClaw] pip install failed: {}", e);
                }
            }
            Err(e) => {
                eprintln!("[GClaw] Python download failed: {}", e);
                splash_error(handle, "环境准备失败，请检查网络后重试");
                return;
            }
        }
    }

    // Git 运行时
    let git_present = find_git(handle).is_some();
    if !git_present {
        if let Some(git_url) = git_download_url() {
            splash_update(handle, "正在准备运行环境...", 60, "首次启动需要下载，请稍候");
            match download_runtime(handle, "git", "Git", &git_url) {
                Ok(_) => {}
                Err(e) => {
                    eprintln!("[GClaw] Git download failed: {}", e);
                    splash_error(handle, "环境准备失败，请检查网络后重试");
                    return;
                }
            }
        } else {
            let msg = if cfg!(target_os = "macos") {
                "未检测到 Git，请先执行: xcode-select --install"
            } else {
                "未检测到 Git，请先安装: sudo apt install git"
            };
            eprintln!("[GClaw] Git not found");
            splash_error(handle, msg);
            return;
        }
    }

    splash_update(handle, "环境就绪", 70, "");
    splash_update(handle, "正在启动服务...", 85, "");

    let (child, port) = start_server(handle);

    // 如果是重试，ServerState 可能已经 manage 过
    if let Some(state) = handle.try_state::<ServerState>() {
        if let Ok(mut guard) = state.child.lock() {
            // 杀掉旧进程（如果有的话）
            if let Some(old) = guard.as_mut() {
                let _ = old.kill();
                let _ = old.wait();
            }
            *guard = Some(child);
        }
    } else {
        handle.manage(ServerState {
            child: Mutex::new(Some(child)),
            port,
        });
    }

    wait_for_server(port);

    splash_update(handle, "即将就绪...", 100, "");
    if let Some(main) = handle.get_webview_window("main") {
        let url = format!("http://127.0.0.1:{}", port);
        let _ = main.navigate(url.parse().unwrap());
    }
    finalize_launch(handle, 15);
}

/// 等待前端 app_ready 信号或超时后强制切换
fn finalize_launch(handle: &tauri::AppHandle, timeout_secs: u64) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
    while std::time::Instant::now() < deadline {
        // splash 已被 app_ready 关闭，说明前端已就绪
        if handle.get_webview_window("splash").is_none() {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    // 超时兜底：强制关闭 splash 并显示主窗口
    println!("[GClaw] finalize_launch timeout, forcing transition");
    if let Some(splash) = handle.get_webview_window("splash") {
        let _ = splash.close();
    }
    if let Some(main) = handle.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

// ============ 主入口 ============

pub fn run() {
    // Windows WebView2: 启用 GPU 硬件加速，解决渲染卡顿
    #[cfg(target_os = "windows")]
    {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--enable-gpu-rasterization --enable-zero-copy --enable-features=CanvasOopRasterization,Vulkan",
        );
    }

    let is_dev = cfg!(debug_assertions);
    let remote_url = std::env::var("GCLAW_REMOTE_URL").ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // 注册自定义协议 splashpage:// 用于提供嵌入的 splash HTML
        .register_uri_scheme_protocol("splashpage", |_ctx, request| {
            let path = request.uri().path();
            // 请求图标文件时返回嵌入的 PNG
            if path.contains("icon") && path.ends_with(".png") {
                return tauri::http::Response::builder()
                    .status(200)
                    .header("content-type", "image/png")
                    .body(APP_ICON_PNG.to_vec())
                    .unwrap();
            }
            // 默认返回 splash HTML
            tauri::http::Response::builder()
                .status(200)
                .header("content-type", "text/html; charset=utf-8")
                .body(SPLASH_HTML.as_bytes().to_vec())
                .unwrap()
        })
        // splash 页面加载完成后才显示窗口，避免黑屏闪烁
        .on_page_load(|webview, payload| {
            if webview.label() == "splash" {
                if let tauri::webview::PageLoadEvent::Finished = payload.event() {
                    let _ = webview.window().show();
                    println!("[GClaw] Splash page loaded, window shown");
                }
            }
        })
        .setup(move |app| {
            // Windows: 移除原生标题栏，使用前端模拟红绿灯按钮
            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(false);
                }
            }

            // macOS: 点击关闭时隐藏到托盘（Dock 图标可恢复）
            // Windows/Linux: 点击关闭时直接退出应用并杀掉 Node 进程
            if let Some(main_window) = app.get_webview_window("main") {
                let app_handle: tauri::AppHandle = app.handle().clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        #[cfg(target_os = "macos")]
                        {
                            api.prevent_close();
                            // 在闭包内通过 app_handle 获取窗口
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        #[cfg(not(target_os = "macos"))]
                        {
                            // Windows/Linux: 允许关闭，触发 RunEvent::Exit 清理进程
                            let _ = api;
                        }
                    }
                });
            }

            if let Some(ref url) = remote_url {
                // ---- 远程模式 ----
                println!("[GClaw] Remote mode — connecting to {}", url);
                app.manage(ServerState {
                    child: Mutex::new(None),
                    port: 0,
                });
                let remote = url.clone();
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.navigate(remote.parse().unwrap());
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                });
            } else {
                // ---- 开发模式 / 生产模式：动态创建 splash 窗口 ----
                let handle = app.handle().clone();

                create_splash_window(&handle);

                // 应用主题到 splash 窗口
                std::thread::sleep(std::time::Duration::from_millis(200));
                apply_splash_theme(&handle);

                if is_dev {
                    // ---- 开发模式 ----
                    println!("[GClaw] Dev mode");
                    app.manage(ServerState {
                        child: Mutex::new(None),
                        port: 3100,
                    });

                    let h = handle.clone();
                    std::thread::spawn(move || {
                        splash_update(&h, "正在连接服务...", 30, "");

                        wait_for_server(3100);

                        splash_update(&h, "即将就绪...", 100, "");
                        // 强制导航，防止 devUrl 首次加载失败
                        if let Some(main) = h.get_webview_window("main") {
                            let _ = main.navigate("http://localhost:3100".parse().unwrap());
                        }
                        // 等待前端 app_ready 或超时
                        finalize_launch(&h, 15);
                    });
                } else {
                    // ---- 生产模式：下载运行时 → 启动服务 ----
                    println!("[GClaw] Production mode");

                    std::thread::spawn(move || {
                        // 等待启动页加载
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        run_production_startup(&handle);
                    });
                }
            }

            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_server_url, navigate_to, app_ready, save_file_content, retry_startup])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            match event {
                tauri::RunEvent::Exit => {
                    if let Some(state) = app.try_state::<ServerState>() {
                        if let Ok(mut guard) = state.child.lock() {
                            if let Some(child) = guard.as_mut() {
                                println!("[GClaw] Killing server process...");
                                let _ = child.kill();
                                let _ = child.wait();
                            }
                            *guard = None;
                        }
                    }
                }
                _ => {
                    // macOS: 点击 Dock 图标时重新昺示主窗口
                    #[cfg(target_os = "macos")]
                    if let tauri::RunEvent::Reopen { .. } = event {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
        });
}

// ============ 系统托盘 ============

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;

    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 GClaw", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::new()
        .tooltip("GClaw")
        .menu(&menu)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => { app.exit(0); }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { .. } = event {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;
    Ok(())
}
