mod config;
mod git;
mod pty;
mod workspace_state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(pty::PtyState::default())
        .invoke_handler(tauri::generate_handler![
            config::find_config,
            config::get_config,
            config::inspect_project_folder,
            git::get_git_status,
            workspace_state::load_app_state,
            workspace_state::save_app_state,
            pty::spawn_pty,
            pty::write_pty,
            pty::resize_pty,
            pty::kill_pty,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
