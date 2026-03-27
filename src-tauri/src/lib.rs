use tauri::Manager;

mod config;
mod git;
mod pty;
mod windows;
mod workspace_state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyState::default())
        .manage(windows::ProjectWindowRegistry::default())
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
