use tauri::{Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItem, SubmenuBuilder};

mod config;
mod git;
mod pty;
mod windows;
mod workspace_state;

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

            let app_menu = SubmenuBuilder::new(app, "maki")
                .about(None)
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
