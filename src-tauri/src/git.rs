use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct GitStatus {
    pub branch: String,
    pub dirty: bool,
    pub is_repo: bool,
}

#[tauri::command]
pub fn get_git_status(project_root: String) -> GitStatus {
    let branch = Command::new("git")
        .args(["-C", &project_root, "rev-parse", "--abbrev-ref", "HEAD"])
        .output();

    match branch {
        Ok(output) if output.status.success() => {
            let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let dirty = Command::new("git")
                .args(["-C", &project_root, "status", "--porcelain"])
                .output()
                .map(|o| !o.stdout.is_empty())
                .unwrap_or(false);

            GitStatus {
                branch,
                dirty,
                is_repo: true,
            }
        }
        _ => GitStatus {
            branch: String::new(),
            dirty: false,
            is_repo: false,
        },
    }
}
