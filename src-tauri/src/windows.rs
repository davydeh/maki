use crate::config::canonicalize_existing_project_directory;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, PartialEq, Eq)]
pub enum WindowRegistration {
    Created {
        canonical_path: PathBuf,
        label: String,
    },
    Existing {
        canonical_path: PathBuf,
        label: String,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ProjectWindowOpenResult {
    pub project_path: String,
    pub window_label: String,
    pub created: bool,
}

#[derive(Default)]
pub struct ProjectWindowRegistry {
    inner: Mutex<ProjectWindowRegistryState>,
}

#[derive(Default)]
struct ProjectWindowRegistryState {
    next_window_index: u64,
    project_to_window: HashMap<PathBuf, String>,
    window_to_project: HashMap<String, PathBuf>,
}

impl ProjectWindowRegistry {
    pub fn register_project_path(
        &self,
        project_path: impl AsRef<Path>,
    ) -> Result<WindowRegistration, String> {
        let canonical_path = canonicalize_existing_project_directory(project_path)?;
        let mut state = self.inner.lock().unwrap();

        if let Some(label) = state.project_to_window.get(&canonical_path) {
            return Ok(WindowRegistration::Existing {
                canonical_path,
                label: label.clone(),
            });
        }

        state.next_window_index += 1;
        let label = format!("project-{}", state.next_window_index);
        state
            .project_to_window
            .insert(canonical_path.clone(), label.clone());
        state
            .window_to_project
            .insert(label.clone(), canonical_path.clone());

        Ok(WindowRegistration::Created {
            canonical_path,
            label,
        })
    }

    pub fn unregister_window(&self, label: &str) -> Option<PathBuf> {
        let mut state = self.inner.lock().unwrap();
        let canonical_path = state.window_to_project.remove(label)?;
        state.project_to_window.remove(&canonical_path);
        Some(canonical_path)
    }

    #[cfg(test)]
    pub fn window_label_for_path(&self, project_path: &Path) -> Option<String> {
        let state = self.inner.lock().unwrap();
        state.project_to_window.get(project_path).cloned()
    }
}

#[tauri::command]
pub async fn open_project_window(
    app: tauri::AppHandle,
    registry: State<'_, ProjectWindowRegistry>,
    project_path: String,
) -> Result<ProjectWindowOpenResult, String> {
    let canonical_path = canonicalize_existing_project_directory(&project_path)?;

    loop {
        match registry.register_project_path(&canonical_path)? {
            WindowRegistration::Existing {
                canonical_path,
                label,
            } => {
                if let Some(window) = app.get_webview_window(&label) {
                    window
                        .set_focus()
                        .map_err(|err| format!("Focusing project window {label}: {err}"))?;

                    return Ok(ProjectWindowOpenResult {
                        project_path: canonical_path.to_string_lossy().into_owned(),
                        window_label: label,
                        created: false,
                    });
                }

                registry.unregister_window(&label);
            }
            WindowRegistration::Created {
                canonical_path,
                label,
            } => {
                let title = project_window_title(&canonical_path);
                let build_result =
                    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
                        .title(&title)
                        .inner_size(900.0, 600.0)
                        .min_inner_size(500.0, 300.0)
                        .resizable(true)
                        .build();

                let window = match build_result {
                    Ok(window) => window,
                    Err(err) => {
                        registry.unregister_window(&label);
                        return Err(format!(
                            "Creating project window for {}: {err}",
                            canonical_path.display()
                        ));
                    }
                };

                window
                    .set_focus()
                    .map_err(|err| format!("Focusing project window {label}: {err}"))?;

                return Ok(ProjectWindowOpenResult {
                    project_path: canonical_path.to_string_lossy().into_owned(),
                    window_label: label,
                    created: true,
                });
            }
        }
    }
}

fn project_window_title(project_path: &Path) -> String {
    let project_name = project_path
        .file_name()
        .and_then(|part| part.to_str())
        .unwrap_or("workspace");
    format!("maki - {project_name}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();

        std::env::temp_dir().join(format!("maki-{prefix}-{nanos}-{}", std::process::id()))
    }

    #[test]
    fn registers_a_new_project_with_a_stable_generated_label() {
        let temp_dir = unique_temp_dir("window-register");
        fs::create_dir_all(&temp_dir).unwrap();

        let registry = ProjectWindowRegistry::default();

        let registration = registry.register_project_path(&temp_dir).unwrap();

        assert_eq!(
            registration,
            WindowRegistration::Created {
                canonical_path: temp_dir.canonicalize().unwrap(),
                label: "project-1".to_string(),
            }
        );
    }

    #[test]
    fn focuses_the_existing_window_for_a_duplicate_project_path() {
        let temp_dir = unique_temp_dir("window-focus");
        fs::create_dir_all(&temp_dir).unwrap();

        let registry = ProjectWindowRegistry::default();
        let first = registry.register_project_path(&temp_dir).unwrap();
        assert!(matches!(first, WindowRegistration::Created { .. }));

        let second = registry.register_project_path(&temp_dir).unwrap();

        assert_eq!(
            second,
            WindowRegistration::Existing {
                canonical_path: temp_dir.canonicalize().unwrap(),
                label: "project-1".to_string(),
            }
        );
    }

    #[test]
    fn unregisters_a_project_when_its_window_closes() {
        let temp_dir = unique_temp_dir("window-unregister");
        fs::create_dir_all(&temp_dir).unwrap();

        let registry = ProjectWindowRegistry::default();
        let registration = registry.register_project_path(&temp_dir).unwrap();
        let label = match registration {
            WindowRegistration::Created { label, .. } => label,
            WindowRegistration::Existing { .. } => panic!("expected a new registration"),
        };

        let removed = registry.unregister_window(&label);
        let canonical_path = temp_dir.canonicalize().unwrap();

        assert_eq!(removed.as_deref(), Some(canonical_path.as_path()));
        assert_eq!(registry.window_label_for_path(&canonical_path), None);
    }
}
