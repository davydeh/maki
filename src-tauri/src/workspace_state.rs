use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

const APP_STATE_FILE_NAME: &str = "workspace_state.json";
const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RecentProject {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceAppState {
    #[serde(default = "default_schema_version")]
    pub version: u32,
    #[serde(default)]
    pub last_project_path: Option<String>,
    #[serde(default)]
    pub recent_projects: Vec<RecentProject>,
}

impl Default for WorkspaceAppState {
    fn default() -> Self {
        Self {
            version: SCHEMA_VERSION,
            last_project_path: None,
            recent_projects: Vec::new(),
        }
    }
}

impl WorkspaceAppState {
    #[allow(dead_code)]
    pub fn record_recent_project<N, P>(&mut self, name: N, path: P) -> Result<(), String>
    where
        N: Into<String>,
        P: AsRef<Path>,
    {
        let canonical_path = canonicalize_project_path(path.as_ref())?;
        let canonical_path_string = canonical_path.to_string_lossy().into_owned();

        self.recent_projects
            .retain(|project| project.path != canonical_path_string);
        self.recent_projects.insert(
            0,
            RecentProject {
                name: name.into(),
                path: canonical_path_string,
            },
        );

        Ok(())
    }
}

#[tauri::command]
pub fn load_app_state(app: tauri::AppHandle) -> Result<WorkspaceAppState, String> {
    let state_path = workspace_state_path(&app)?;
    load_app_state_from_file(&state_path)
}

#[tauri::command]
pub fn save_app_state(
    app: tauri::AppHandle,
    state: WorkspaceAppState,
) -> Result<WorkspaceAppState, String> {
    let state_path = workspace_state_path(&app)?;
    save_app_state_to_file(&state_path, &state)
}

pub fn workspace_app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|err| format!("Resolving app data dir: {err}"))
}

pub fn workspace_state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(workspace_app_data_dir(app)?.join(APP_STATE_FILE_NAME))
}

pub fn load_app_state_from_file(path: impl AsRef<Path>) -> Result<WorkspaceAppState, String> {
    let path = path.as_ref();
    if !path.exists() {
        return Ok(WorkspaceAppState::default());
    }

    let contents = fs::read_to_string(path)
        .map_err(|err| format!("Reading app state {}: {err}", path.display()))?;
    let state: WorkspaceAppState = serde_json::from_str(&contents)
        .map_err(|err| format!("Parsing app state {}: {err}", path.display()))?;

    Ok(state)
}

pub fn save_app_state_to_file(
    path: impl AsRef<Path>,
    state: &WorkspaceAppState,
) -> Result<WorkspaceAppState, String> {
    let path = path.as_ref();

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Creating app state dir {}: {err}", parent.display()))?;
    }

    let state_to_save = normalize_app_state_for_save(state)?;

    let json = serde_json::to_string_pretty(&state_to_save)
        .map_err(|err| format!("Serializing app state {}: {err}", path.display()))?;
    fs::write(path, json).map_err(|err| format!("Writing app state {}: {err}", path.display()))?;
    Ok(state_to_save)
}

fn default_schema_version() -> u32 {
    SCHEMA_VERSION
}

fn normalize_app_state_for_save(state: &WorkspaceAppState) -> Result<WorkspaceAppState, String> {
    let mut normalized = state.clone();
    normalized.version = SCHEMA_VERSION;
    normalized.recent_projects = normalize_recent_projects(&state.recent_projects)?;
    Ok(normalized)
}

fn normalize_recent_projects(
    recent_projects: &[RecentProject],
) -> Result<Vec<RecentProject>, String> {
    let mut deduped = Vec::new();
    let mut seen_paths = HashSet::new();

    for project in recent_projects {
        let path = Path::new(&project.path);
        if !path.exists() {
            continue;
        }

        let canonical_path = canonicalize_project_path(path)?;
        let canonical_path_string = canonical_path.to_string_lossy().into_owned();

        if seen_paths.insert(canonical_path_string.clone()) {
            deduped.push(RecentProject {
                name: project.name.clone(),
                path: canonical_path_string,
            });
        }
    }

    Ok(deduped)
}

#[allow(dead_code)]
fn canonicalize_project_path(path: &Path) -> Result<PathBuf, String> {
    path.canonicalize()
        .map_err(|err| format!("Canonicalizing project path {}: {err}", path.display()))
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
    fn loads_default_state_when_file_is_missing() {
        let temp_dir = unique_temp_dir("state-missing");
        fs::create_dir_all(&temp_dir).unwrap();
        let state_path = temp_dir.join("workspace_state.json");

        let state = load_app_state_from_file(&state_path).unwrap();

        assert_eq!(state, WorkspaceAppState::default());
    }

    #[test]
    fn saves_and_reload_recent_projects_in_mru_order() {
        let temp_dir = unique_temp_dir("state-mru");
        fs::create_dir_all(&temp_dir).unwrap();
        let state_path = temp_dir.join("workspace_state.json");

        let project_a = temp_dir.join("alpha");
        let project_b = temp_dir.join("beta");
        fs::create_dir_all(&project_a).unwrap();
        fs::create_dir_all(&project_b).unwrap();

        let mut state = WorkspaceAppState::default();
        state
            .record_recent_project(
                "Alpha".to_string(),
                project_a.to_string_lossy().into_owned(),
            )
            .unwrap();
        state
            .record_recent_project("Beta".to_string(), project_b.to_string_lossy().into_owned())
            .unwrap();
        state
            .record_recent_project(
                "Alpha Updated".to_string(),
                project_a.to_string_lossy().into_owned(),
            )
            .unwrap();

        let normalized = save_app_state_to_file(&state_path, &state).unwrap();
        let reloaded = load_app_state_from_file(&state_path).unwrap();

        assert_eq!(normalized, reloaded);
        assert_eq!(
            reloaded.recent_projects,
            vec![
                RecentProject {
                    name: "Alpha Updated".to_string(),
                    path: project_a
                        .canonicalize()
                        .unwrap()
                        .to_string_lossy()
                        .into_owned(),
                },
                RecentProject {
                    name: "Beta".to_string(),
                    path: project_b
                        .canonicalize()
                        .unwrap()
                        .to_string_lossy()
                        .into_owned(),
                },
            ]
        );
    }

    #[test]
    fn preserves_schema_version_and_last_project_path() {
        let temp_dir = unique_temp_dir("state-version");
        fs::create_dir_all(&temp_dir).unwrap();
        let state_path = temp_dir.join("workspace_state.json");

        let project_path = temp_dir.join("workspace");
        fs::create_dir_all(&project_path).unwrap();

        let mut state = WorkspaceAppState::default();
        state.version = 1;
        state.last_project_path = Some(project_path.to_string_lossy().into_owned());

        save_app_state_to_file(&state_path, &state).unwrap();
        let reloaded = load_app_state_from_file(&state_path).unwrap();

        assert_eq!(reloaded.version, 1);
        assert_eq!(
            reloaded.last_project_path,
            Some(project_path.to_string_lossy().into_owned())
        );
    }

    #[test]
    fn save_normalizes_canonical_aliases_before_persisting() {
        let temp_dir = unique_temp_dir("state-alias");
        fs::create_dir_all(&temp_dir).unwrap();
        let state_path = temp_dir.join("workspace_state.json");

        let project_dir = temp_dir.join("project");
        fs::create_dir_all(&project_dir).unwrap();

        let alias_path = project_dir.join(".");
        let mut state = WorkspaceAppState::default();
        state.recent_projects = vec![
            RecentProject {
                name: "Alias".to_string(),
                path: alias_path.to_string_lossy().into_owned(),
            },
            RecentProject {
                name: "Canonical".to_string(),
                path: project_dir
                    .canonicalize()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned(),
            },
        ];

        let normalized = save_app_state_to_file(&state_path, &state).unwrap();

        let canonical_path = project_dir
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        assert_eq!(
            normalized.recent_projects,
            vec![RecentProject {
                name: "Alias".to_string(),
                path: canonical_path.clone(),
            }]
        );

        let reloaded = load_app_state_from_file(&state_path).unwrap();
        assert_eq!(reloaded, normalized);
        assert_eq!(
            reloaded.recent_projects,
            vec![RecentProject {
                name: "Alias".to_string(),
                path: canonical_path,
            }]
        );
    }

    #[test]
    fn save_skips_stale_recent_projects_without_failing() {
        let temp_dir = unique_temp_dir("state-stale");
        fs::create_dir_all(&temp_dir).unwrap();
        let state_path = temp_dir.join("workspace_state.json");

        let active_project = temp_dir.join("active-project");
        fs::create_dir_all(&active_project).unwrap();
        let stale_project = temp_dir.join("missing-project");

        let mut state = WorkspaceAppState::default();
        state.last_project_path = Some(active_project.to_string_lossy().into_owned());
        state.recent_projects = vec![
            RecentProject {
                name: "Stale".to_string(),
                path: stale_project.to_string_lossy().into_owned(),
            },
            RecentProject {
                name: "Active".to_string(),
                path: active_project.to_string_lossy().into_owned(),
            },
        ];

        let normalized = save_app_state_to_file(&state_path, &state).unwrap();

        assert_eq!(
            normalized.last_project_path,
            Some(active_project.to_string_lossy().into_owned())
        );
        assert_eq!(
            normalized.recent_projects,
            vec![RecentProject {
                name: "Active".to_string(),
                path: active_project
                    .canonicalize()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned(),
            }]
        );

        let reloaded = load_app_state_from_file(&state_path).unwrap();
        assert_eq!(reloaded, normalized);
    }
}
