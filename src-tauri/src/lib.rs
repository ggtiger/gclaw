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

    // 查找系统 node 二进制路径
    let node_bin = which_node().unwrap_or_else(|| "node".into());

    println!("[GClaw] Starting server: node {} (port={})", server_js.display(), port);

    let child = Command::new(node_bin)
        .arg(&server_js)
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("GCLAW_DATA_DIR", data_dir.to_string_lossy().as_ref())
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

/// Tauri command: 获取服务器 URL
#[tauri::command]
fn get_server_url(state: tauri::State<ServerState>) -> String {
    format!("http://127.0.0.1:{}", state.port)
}

pub fn run() {
    let is_dev = cfg!(debug_assertions);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            if is_dev {
                // 开发模式：devUrl 已配置为 localhost:3100
                // Next.js dev server 由 beforeDevCommand 自动启动
                println!("[GClaw] Dev mode — using devUrl from tauri.conf.json");
                app.manage(ServerState {
                    child: Mutex::new(None),
                    port: 3100,
                });

                // 开发模式: Cmd+Shift+I 可手动打开 DevTools
            } else {
                // 生产模式：启动 Node.js sidecar
                let (child, port) = start_server(app.handle());
                app.manage(ServerState {
                    child: Mutex::new(Some(child)),
                    port,
                });

                // 等待服务器就绪后导航 WebView
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    wait_for_server(port);
                    if let Some(window) = handle.get_webview_window("main") {
                        let url = format!("http://127.0.0.1:{}", port);
                        let _ = window.navigate(url.parse().unwrap());
                    }
                });
            }

            // 设置系统托盘
            setup_tray(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_server_url])
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
