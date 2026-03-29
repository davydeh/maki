use tauri::{Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItem, SubmenuBuilder};

mod config;
mod git;
mod pty;
mod windows;
mod theme_import;
mod workspace_state;

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(pty::PtyState::default())
        .manage(windows::ProjectWindowRegistry::default())
        .setup(|app| {
            let new_window = MenuItem::with_id(app, "new-window", "New Window", true, Some("CmdOrCtrl+N"))?;
            let new_tab = MenuItem::with_id(app, "new-tab", "New Tab", true, Some("CmdOrCtrl+T"))?;
            let split_right = MenuItem::with_id(app, "split-right", "Split Right", true, Some("CmdOrCtrl+D"))?;
            let split_down = MenuItem::with_id(app, "split-down", "Split Down", true, Some("CmdOrCtrl+Shift+D"))?;
            let close_tab = MenuItem::with_id(app, "close-tab", "Close", true, Some("CmdOrCtrl+W"))?;
            let check_updates = MenuItem::with_id(app, "check-updates", "Check for Updates...", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings...", true, Some("CmdOrCtrl+,"))?;

            let app_menu = SubmenuBuilder::new(app, "maki")
                .about(None)
                .item(&check_updates)
                .separator()
                .item(&settings)
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&new_window)
                .item(&new_tab)
                .separator()
                .item(&split_right)
                .item(&split_down)
                .separator()
                .item(&close_tab)
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .copy()
                .paste()
                .select_all()
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .maximize()
                .close_window()
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&window_menu)
                .build()?;

            app.set_menu(menu)?;

            app.on_menu_event(move |app_handle, event| {
                let id = event.id().0.as_str();
                let _ = app_handle.emit("menu-action", id);
            });

            // Set window background color to match theme (#1e1e2e)
            // so the transparent title bar blends seamlessly
            #[cfg(target_os = "macos")]
            #[allow(deprecated)]
            {
                use cocoa::appkit::{NSColor, NSWindow};
                use cocoa::base::{id, nil};

                if let Some(window) = app.get_webview_window("main") {
                    let ns_window = window.ns_window().unwrap() as id;
                    unsafe {
                        let bg_color = NSColor::colorWithRed_green_blue_alpha_(
                            nil,
                            30.0 / 255.0,  // #1e
                            30.0 / 255.0,  // #1e
                            46.0 / 255.0,  // #2e
                            1.0,
                        );
                        ns_window.setBackgroundColor_(bg_color);
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let registry = window.state::<windows::ProjectWindowRegistry>();
                registry.unregister_window(window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            config::find_config,
            config::get_config,
            config::inspect_project_folder,
            config::open_folder_dialog,
            config::generate_config_preview,
            config::save_config,
            config::save_settings,
            theme_import::import_iterm2_theme,
            theme_import::import_ghostty_theme,
            git::get_git_status,
            workspace_state::load_app_state,
            workspace_state::save_app_state,
            pty::spawn_pty,
            pty::write_pty,
            pty::resize_pty,
            pty::kill_pty,
            windows::bind_current_project_window,
            windows::get_current_project_window,
            windows::open_project_window,
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
