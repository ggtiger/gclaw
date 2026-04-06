use tauri::Manager;
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
const PYTHON_RELEASE_TAG: &str = "20260325";

// 国内镜像（首次下载快）
const NODE_MIRROR: &str = "https://cdn.npmmirror.com/binaries/node";
const PYTHON_MIRROR: &str = "https://mirror.nju.edu.cn/github-release/astral-sh/python-build-standalone";

// ============ 启动页 HTML ============

const SPLASH_HTML: &str = r##"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: 100%; height: 100%;
  background: #0f172a;
  color: #e2e8f0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.splash-card {
  width: 420px; padding: 48px 40px;
  background: rgba(30, 41, 59, 0.35);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 20px;
  backdrop-filter: blur(20px);
  text-align: center;
}
.logo { font-size: 36px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 8px; }
.logo span { color: #8b5cf6; }
.subtitle { font-size: 13px; color: #94a3b8; margin-bottom: 36px; }
.status { font-size: 14px; color: #cbd5e1; margin-bottom: 16px; min-height: 20px; }
.progress-track {
  width: 100%; height: 6px;
  background: rgba(255,255,255,0.08);
  border-radius: 3px; overflow: hidden; margin-bottom: 12px;
}
.progress-bar {
  height: 100%; width: 0%;
  background: linear-gradient(90deg, #8b5cf6, #6366f1);
  border-radius: 3px;
  transition: width 0.3s ease;
}
.detail { font-size: 12px; color: #64748b; min-height: 16px; }
.checks { display: flex; gap: 24px; justify-content: center; margin-bottom: 28px; }
.check-item { font-size: 13px; color: #475569; }
.check-item.ok { color: #22c55e; }
.check-item.downloading { color: #8b5cf6; }
.check-item::before { margin-right: 4px; }
.check-item.ok::before { content: "✓ "; }
.check-item.downloading::before { content: "↓ "; }
.check-item.pending::before { content: "○ "; }
.retry-btn {
  display: none; margin-top: 20px; padding: 10px 28px;
  background: #8b5cf6; color: #fff; border: none; border-radius: 10px;
  font-size: 14px; cursor: pointer;
}
.retry-btn:hover { background: #7c3aed; }
</style>
</head>
<body>
<div class="splash-card">
  <div class="logo">G<span>Claw</span></div>
  <div class="subtitle">AI 对话助手</div>
  <div class="checks">
    <span id="check-node" class="check-item pending">Node.js</span>
    <span id="check-python" class="check-item pending">Python</span>
  </div>
  <div id="status" class="status">正在检查运行环境...</div>
  <div class="progress-track"><div id="bar" class="progress-bar"></div></div>
  <div id="detail" class="detail"></div>
  <button id="retry-btn" class="retry-btn" onclick="location.reload()">重试</button>
</div>
<script>
window.__splashUpdate = function(opts) {
  if (opts.status !== undefined) document.getElementById('status').textContent = opts.status;
  if (opts.progress !== undefined) document.getElementById('bar').style.width = opts.progress + '%';
  if (opts.detail !== undefined) document.getElementById('detail').textContent = opts.detail;
  if (opts.checkNode) document.getElementById('check-node').className = 'check-item ' + opts.checkNode;
  if (opts.checkPython) document.getElementById('check-python').className = 'check-item ' + opts.checkPython;
  if (opts.error) {
    document.getElementById('retry-btn').style.display = 'inline-block';
  }
};
</script>
</body>
</html>"##;

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
    if let Some(window) = app.get_webview_window("main") {
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
    if let Some(window) = app.get_webview_window("main") {
        let js = format!(
            "window.__splashUpdate && window.__splashUpdate({{check{}:'{}'}})",
            item, state // item: "Node"/"Python", state: "ok"/"downloading"/"pending"
        );
        let _ = window.eval(&js);
    }
}

/// 显示启动页错误
fn splash_error(app: &tauri::AppHandle, msg: &str) {
    if let Some(window) = app.get_webview_window("main") {
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
        rd.join("python").join("bin").join("python.exe")
    } else {
        rd.join("python").join("bin").join("python3")
    };
    if bundled.exists() {
        println!("[GClaw] Found runtime Python: {}", bundled.display());
        return Some(bundled.to_string_lossy().to_string());
    }
    which_python3()
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
            if !path.is_empty() { return Some(path); }
        }
    }
    if cfg!(target_os = "windows") {
        for path in &["C:\\Python312\\python.exe", "C:\\Python311\\python.exe"] {
            if std::path::Path::new(path).exists() { return Some(path.to_string()); }
        }
    } else {
        for path in &["/usr/local/bin/python3", "/opt/homebrew/bin/python3", "/opt/homebrew/bin/python3.12", "/usr/bin/python3"] {
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
        format!("{}-pc-windows-msvc-shared", arch)
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
    name: &str,       // "node" or "python"
    label: &str,      // 显示名 "Node.js" or "Python"
    url: &str,
) -> Result<(), String> {
    let rd = runtimes_dir(app);
    let target_dir = rd.join(name);

    // 已存在则跳过
    let check_bin = if name == "node" {
        if cfg!(target_os = "windows") { target_dir.join("node.exe") }
        else { target_dir.join("bin").join("node") }
    } else {
        if cfg!(target_os = "windows") { target_dir.join("bin").join("python.exe") }
        else { target_dir.join("bin").join("python3") }
    };
    if check_bin.exists() {
        println!("[GClaw] {} already exists, skip download", label);
        return Ok(());
    }

    let temp_dir = std::env::temp_dir().join(format!("gclaw-dl-{}", name));
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let archive_ext = if url.ends_with(".zip") { ".zip" }
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

    let extract_status = if url.ends_with(".tar.xz") {
        hidden_command("tar")
            .args(&["-xJf", archive.to_str().unwrap_or(""), "--strip-components=1"])
            .arg("-C").arg(&target_dir)
            .status()
            .map_err(|e| format!("解压失败: {}", e))?
    } else if url.ends_with(".zip") {
        // Windows tar.exe 支持 .zip
        hidden_command("tar")
            .args(&["-xf", archive.to_str().unwrap_or("")])
            .arg("-C").arg(&target_dir)
            .status()
            .map_err(|e| format!("解压失败: {}", e))?
    } else {
        hidden_command("tar")
            .args(&["-xzf", archive.to_str().unwrap_or(""), "--strip-components=1"])
            .arg("-C").arg(&target_dir)
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
        rd.join("python").join("bin").join("python.exe")
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

// ============ 启动服务器 ============

fn start_server(app: &tauri::AppHandle) -> (Child, u16) {
    let port = find_available_port();
    let resource_dir = app.path().resource_dir()
        .expect("Failed to get resource dir");
    let server_js = resource_dir.join("server").join("server.js");
    let data_dir = app.path().app_data_dir()
        .expect("Failed to get app data dir");
    std::fs::create_dir_all(&data_dir).ok();

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
        rd.join("python").join("bin").join("python.exe")
    } else {
        rd.join("python").join("bin").join("python3")
    };
    if runtime_python.exists() {
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
        .env("PATH", &enhanced_path);

    // 内嵌 Python 的 PYTHONHOME
    if runtime_python.exists() {
        let python_home = rd.join("python");
        cmd.env("PYTHONHOME", python_home.to_string_lossy().as_ref());
        println!("[GClaw] PYTHONHOME={}", python_home.display());
    }

    let child = cmd
        .current_dir(resource_dir.join("server"))
        .spawn()
        .expect("Failed to start Next.js server");

    (child, port)
}

// ============ Tauri Commands ============

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

// ============ 主入口 ============

pub fn run() {
    let is_dev = cfg!(debug_assertions);
    let remote_url = std::env::var("GCLAW_REMOTE_URL").ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
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
            } else if is_dev {
                // ---- 开发模式 ----
                println!("[GClaw] Dev mode");
                app.manage(ServerState {
                    child: Mutex::new(None),
                    port: 3100,
                });
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            } else {
                // ---- 生产模式：启动页 → 下载运行时 → 启动服务 ----
                let handle = app.handle().clone();

                // 显示启动页
                if let Some(window) = handle.get_webview_window("main") {
                    let splash_path = std::env::temp_dir().join("gclaw-splash.html");
                    std::fs::write(&splash_path, SPLASH_HTML).ok();
                    let splash_url = format!("file://{}", splash_path.display());
                    let _ = window.navigate(splash_url.parse().unwrap());
                    let _ = window.show();
                    let _ = window.set_focus();
                }

                // 后台线程：下载 + 启动
                std::thread::spawn(move || {
                    // 等待启动页加载
                    std::thread::sleep(std::time::Duration::from_millis(500));

                    // --- Node.js ---
                    let node_present = find_node(&handle).is_some();
                    if !node_present {
                        splash_check(&handle, "node", "downloading");
                        match download_runtime(&handle, "node", "Node.js", &node_download_url()) {
                            Ok(_) => { splash_check(&handle, "node", "ok"); }
                            Err(e) => {
                                eprintln!("[GClaw] Node.js download failed: {}", e);
                                splash_error(&handle, &format!("Node.js 下载失败: {}", e));
                                return;
                            }
                        }
                    } else {
                        splash_check(&handle, "node", "ok");
                    }

                    // --- Python ---
                    let python_present = find_python3(&handle).is_some();
                    if !python_present {
                        splash_check(&handle, "python", "downloading");
                        match download_runtime(&handle, "python", "Python", &python_download_url()) {
                            Ok(_) => {
                                // 安装 pip 包
                                if let Err(e) = install_python_pip(&handle) {
                                    eprintln!("[GClaw] pip install failed: {}", e);
                                }
                                splash_check(&handle, "python", "ok");
                            }
                            Err(e) => {
                                eprintln!("[GClaw] Python download failed: {}", e);
                                splash_error(&handle, &format!("Python 下载失败: {}", e));
                                return;
                            }
                        }
                    } else {
                        splash_check(&handle, "python", "ok");
                    }

                    // --- 启动服务器 ---
                    splash_update(&handle, "正在启动应用...", 100, "");

                    let (child, port) = start_server(&handle);
                    handle.manage(ServerState {
                        child: Mutex::new(Some(child)),
                        port,
                    });

                    wait_for_server(port);

                    // 导航到应用
                    if let Some(window) = handle.get_webview_window("main") {
                        let url = format!("http://127.0.0.1:{}", port);
                        let _ = window.navigate(url.parse().unwrap());
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                });
            }

            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_server_url, navigate_to])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
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
        .build(app)?;
    Ok(())
}
