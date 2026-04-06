use tauri::Manager;
use std::sync::Mutex;
use std::process::{Child, Command};
use std::net::TcpListener;

/// 服务器状态：持有 Node.js 子进程和端口号
pub struct ServerState {
    pub child: Mutex<Option<Child>>,
    pub port: u16,
}

/// 查找一个可用的本地端口
fn find_available_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("Failed to bind to find available port")
        .local_addr()
        .expect("Failed to get local addr")
        .port()
}

/// 等待 HTTP 服务器就绪（最多 30 秒）
fn wait_for_server(port: u16) {
    let url = format!("http://127.0.0.1:{}", port);
    for _ in 0..300 {
        if std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok() {
            println!("[GClaw] Server ready at {}", url);
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    eprintln!("[GClaw] Warning: Server did not start within 30s at {}", url);
}

/// 启动 Next.js standalone 服务器（生产模式）
fn start_server(app: &tauri::AppHandle) -> (Child, u16) {
    let port = find_available_port();
    let resource_dir = app.path().resource_dir()
        .expect("Failed to get resource dir");
    let server_js = resource_dir.join("server").join("server.js");

    // 获取 app data 目录用于数据持久化
    let data_dir = app.path().app_data_dir()
        .expect("Failed to get app data dir");
    std::fs::create_dir_all(&data_dir).ok();

    // 查找 Node：优先内嵌，fallback 系统
    let node_bin = find_bundled_node(&resource_dir)
        .or_else(|| which_node())
        .unwrap_or_else(|| "node".into());

    let node_dir = std::path::Path::new(&node_bin)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let current_path = std::env::var("PATH").unwrap_or_default();

    // 构建 PATH：内嵌 Node/Python 优先，系统备选
    let mut path_parts = vec![];

    // 1. Node.js 目录（内嵌或系统）
    if !node_dir.is_empty() && !current_path.contains(&node_dir) {
        path_parts.push(node_dir.clone());
    }

    // 2. 内嵌 Python（优先使用）
    if let Some(bundled_python) = find_bundled_python(&resource_dir) {
        if let Some(py_dir) = std::path::Path::new(&bundled_python).parent() {
            let py_dir_str = py_dir.to_string_lossy().to_string();
            if !current_path.contains(&py_dir_str) && !path_parts.contains(&py_dir_str) {
                path_parts.push(py_dir_str);
            }
        }
    }

    // 3. 系统 Python（内嵌不存在时的备选）
    if find_bundled_python(&resource_dir).is_none() {
        if let Some(sys_python) = which_python3() {
            if let Some(py_dir) = std::path::Path::new(&sys_python).parent() {
                let py_dir_str = py_dir.to_string_lossy().to_string();
                if !current_path.contains(&py_dir_str) && py_dir_str != node_dir {
                    path_parts.push(py_dir_str);
                }
            }
        }
    }

    let enhanced_path = if path_parts.is_empty() {
        current_path.clone()
    } else {
        format!("{}:{}", path_parts.join(":"), current_path)
    };

    println!("[GClaw] Starting server: node {} (port={})", server_js.display(), port);

    let mut cmd = Command::new(&node_bin);
    cmd.arg(&server_js)
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("GCLAW_DATA_DIR", data_dir.to_string_lossy().as_ref())
        .env("PATH", &enhanced_path);

    // 使用内嵌 Python 时设置 PYTHONHOME
    if find_bundled_python(&resource_dir).is_some() {
        let python_home = resource_dir.join("python");
        cmd.env("PYTHONHOME", python_home.to_string_lossy().as_ref());
        println!("[GClaw] Using bundled Python, PYTHONHOME={}", python_home.display());
    }

    let child = cmd
        .current_dir(resource_dir.join("server"))
        .spawn()
        .expect("Failed to start Next.js server");

    (child, port)
}

/// 查找系统中的 node 可执行文件路径
fn which_node() -> Option<String> {
    // macOS/Linux: 尝试通过 which 查找
    if let Ok(output) = Command::new("which").arg("node").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }
    // 常见路径 fallback
    for path in &[
        "/usr/local/bin/node",
        "/opt/homebrew/bin/node",
        "/usr/bin/node",
    ] {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    None
}

/// 查找内嵌的 Node.js 路径（resource_dir/node/bin/node）
fn find_bundled_node(resource_dir: &std::path::Path) -> Option<String> {
    let node_bin = resource_dir.join("node").join("bin").join("node");
    if node_bin.exists() {
        println!("[GClaw] Found bundled Node: {}", node_bin.display());
        Some(node_bin.to_string_lossy().to_string())
    } else {
        None
    }
}

/// 查找系统中的 python3 可执行文件路径
fn which_python3() -> Option<String> {
    // 尝试通过 which 查找
    if let Ok(output) = Command::new("which").arg("python3").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }
    // 常见路径 fallback
    for path in &[
        "/usr/local/bin/python3",
        "/opt/homebrew/bin/python3",
        "/opt/homebrew/bin/python3.12",
        "/usr/bin/python3",
    ] {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    None
}

/// 查找内嵌的 Python 路径（resource_dir/python/bin/python3）
fn find_bundled_python(resource_dir: &std::path::Path) -> Option<String> {
    let python_bin = resource_dir.join("python").join("bin").join("python3");
    if python_bin.exists() {
        println!("[GClaw] Found bundled Python: {}", python_bin.display());
        Some(python_bin.to_string_lossy().to_string())
    } else {
        None
    }
}

/// Tauri command: 获取服务器 URL
#[tauri::command]
fn get_server_url(state: tauri::State<ServerState>) -> String {
    format!("http://127.0.0.1:{}", state.port)
}

/// Tauri command: 通过 Rust 端导航（绕过 WebView 导航限制）
#[tauri::command]
fn navigate_to(path: String, state: tauri::State<ServerState>, app: tauri::AppHandle) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}{}", state.port, path);
    println!("[GClaw] Navigating to: {}", url);
    if let Some(window) = app.get_webview_window("main") {
        window.navigate(url.parse().map_err(|e| format!("Invalid URL: {}", e))?);
        Ok(())
    } else {
        Err("Window not found".into())
    }
}

pub fn run() {
    let is_dev = cfg!(debug_assertions);
    // 远程模式：通过环境变量 GCLAW_REMOTE_URL 指定远程服务器地址
    let remote_url = std::env::var("GCLAW_REMOTE_URL").ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            if let Some(ref url) = remote_url {
                // 远程模式：直接连接远程服务器，不启动本地 sidecar
                println!("[GClaw] Remote mode — connecting to {}", url);
                app.manage(ServerState {
                    child: Mutex::new(None),
                    port: 0, // 远程模式无本地端口
                });

                let remote = url.clone();
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    // 短暂延迟等待窗口就绪
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.navigate(remote.parse().unwrap());
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                });
            } else if is_dev {
                // 开发模式：devUrl 已配置为 localhost:3100
                // Next.js dev server 由 beforeDevCommand 自动启动
                println!("[GClaw] Dev mode — using devUrl from tauri.conf.json");
                app.manage(ServerState {
                    child: Mutex::new(None),
                    port: 3100,
                });

                // 开发模式：直接显示窗口（devUrl 自动加载）
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            } else {
                // 生产模式：启动 Node.js sidecar
                let (child, port) = start_server(app.handle());
                app.manage(ServerState {
                    child: Mutex::new(Some(child)),
                    port,
                });

                // 等待服务器就绪后导航 WebView 并显示窗口
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    wait_for_server(port);
                    if let Some(window) = handle.get_webview_window("main") {
                        let url = format!("http://127.0.0.1:{}", port);
                        let _ = window.navigate(url.parse().unwrap());
                        // 导航成功后显示窗口（避免闪屏和 404）
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                });
            }

            // 设置系统托盘
            setup_tray(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_server_url, navigate_to])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // 退出时清理 Node.js 子进程
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

/// Task 4: 系统托盘
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
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}
