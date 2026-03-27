use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    pub name: String,
    #[serde(default)]
    pub theme: Option<String>,
    #[serde(default)]
    pub processes: Vec<ProcessConfig>,
    #[serde(default)]
    pub shells: Vec<ShellConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessConfig {
    pub name: String,
    pub cmd: String,
    #[serde(default = "default_true")]
    pub autostart: bool,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
    #[serde(default)]
    pub restart: Option<String>,
    #[serde(default)]
    pub max_restarts: Option<u32>,
    #[serde(default)]
    pub restart_delay: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShellConfig {
    pub name: String,
    #[serde(default)]
    pub cmd: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ProjectInspection {
    pub name: String,
    pub path: String,
    pub exists: bool,
    pub has_config: bool,
    pub detected_stacks: Vec<DetectionSignal>,
    pub script_hints: Vec<String>,
    pub entrypoint_hints: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(tag = "stack", rename_all = "snake_case")]
pub enum DetectionSignal {
    Node {
        package_json: Option<String>,
        scripts: Vec<String>,
    },
    Laravel {
        composer_json: Option<String>,
        artisan: bool,
    },
    Python {
        pyproject_toml: Option<String>,
        requirements_txt: Option<String>,
        entrypoints: Vec<String>,
    },
}

fn default_true() -> bool {
    true
}

#[tauri::command]
pub fn find_config(dir: Option<String>) -> Result<String, String> {
    let start = match dir {
        Some(d) => PathBuf::from(d),
        None => env::current_dir().map_err(|e| e.to_string())?,
    };

    let mut current = start.as_path();
    loop {
        let config_path = current.join("maki.yaml");
        if config_path.exists() {
            return Ok(config_path.to_string_lossy().to_string());
        }
        match current.parent() {
            Some(parent) => current = parent,
            None => break,
        }
    }

    Err("maki.yaml not found".to_string())
}

#[tauri::command]
pub fn get_config(path: String) -> Result<Config, String> {
    let contents = fs::read_to_string(&path).map_err(|e| format!("Reading config: {}", e))?;
    let config: Config =
        serde_yaml::from_str(&contents).map_err(|e| format!("Parsing config: {}", e))?;

    if config.processes.is_empty() && config.shells.is_empty() {
        return Err("Config must have at least one process or shell".to_string());
    }

    Ok(config)
}

#[tauri::command]
pub fn inspect_project_folder(path: String) -> Result<ProjectInspection, String> {
    let resolved_path = resolve_project_path(Path::new(&path))?;
    Ok(inspect_project_folder_path(&resolved_path))
}

pub fn resolve_project_path(path: impl AsRef<Path>) -> Result<PathBuf, String> {
    let path = path.as_ref();

    if path.exists() {
        return path
            .canonicalize()
            .map_err(|e| format!("Resolving project path {}: {}", path.display(), e));
    }

    if path.is_absolute() {
        return Ok(path.to_path_buf());
    }

    let current_dir = env::current_dir().map_err(|e| format!("Resolving project path: {}", e))?;
    Ok(current_dir.join(path))
}

fn inspect_project_folder_path(path: &Path) -> ProjectInspection {
    let exists = path.exists();
    let name = path
        .file_name()
        .and_then(|part| part.to_str())
        .unwrap_or("workspace")
        .to_string();
    let has_config = path.join("maki.yaml").exists();

    let mut detected_stacks = Vec::new();
    let mut script_hints = Vec::new();
    let mut entrypoint_hints = Vec::new();

    if exists {
        detect_node_signals(
            path,
            &mut detected_stacks,
            &mut script_hints,
            &mut entrypoint_hints,
        );
        detect_laravel_signals(path, &mut detected_stacks, &mut entrypoint_hints);
        detect_python_signals(path, &mut detected_stacks, &mut entrypoint_hints);
    }

    ProjectInspection {
        name,
        path: path.to_string_lossy().into_owned(),
        exists,
        has_config,
        detected_stacks,
        script_hints,
        entrypoint_hints,
    }
}

fn detect_node_signals(
    project_path: &Path,
    detected_stacks: &mut Vec<DetectionSignal>,
    script_hints: &mut Vec<String>,
    entrypoint_hints: &mut Vec<String>,
) {
    let package_json_path = project_path.join("package.json");
    if !package_json_path.exists() {
        return;
    }

    let mut scripts = Vec::new();
    if let Ok(contents) = fs::read_to_string(&package_json_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
            if let Some(script_object) = json.get("scripts").and_then(|value| value.as_object()) {
                scripts.extend(script_object.keys().cloned());
            }
        }
    }

    if scripts.is_empty() {
        push_unique(script_hints, "npm run dev".to_string());
        push_unique(script_hints, "npm start".to_string());
    } else {
        for script in &scripts {
            push_unique(script_hints, format!("npm run {}", script));
        }
        if scripts.iter().any(|script| script == "dev") {
            push_unique(entrypoint_hints, "npm run dev".to_string());
        }
        if scripts.iter().any(|script| script == "start") {
            push_unique(entrypoint_hints, "npm start".to_string());
        }
    }

    detected_stacks.push(DetectionSignal::Node {
        package_json: Some(package_json_path.to_string_lossy().into_owned()),
        scripts,
    });
}

fn detect_laravel_signals(
    project_path: &Path,
    detected_stacks: &mut Vec<DetectionSignal>,
    entrypoint_hints: &mut Vec<String>,
) {
    let composer_json_path = project_path.join("composer.json");
    let artisan_path = project_path.join("artisan");

    if !composer_json_path.exists() && !artisan_path.exists() {
        return;
    }

    let mut laravel_framework = false;
    if composer_json_path.exists() {
        if let Ok(contents) = fs::read_to_string(&composer_json_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
                laravel_framework = composer_depends_on_laravel(&json);
            }
        }
    }

    if laravel_framework || artisan_path.exists() {
        push_unique(entrypoint_hints, "php artisan serve".to_string());
        push_unique(entrypoint_hints, "php artisan migrate".to_string());
        detected_stacks.push(DetectionSignal::Laravel {
            composer_json: composer_json_path
                .exists()
                .then(|| composer_json_path.to_string_lossy().into_owned()),
            artisan: artisan_path.exists(),
        });
    }
}

fn detect_python_signals(
    project_path: &Path,
    detected_stacks: &mut Vec<DetectionSignal>,
    entrypoint_hints: &mut Vec<String>,
) {
    let pyproject_toml_path = project_path.join("pyproject.toml");
    let requirements_txt_path = project_path.join("requirements.txt");
    let main_py_path = project_path.join("main.py");
    let app_py_path = project_path.join("app.py");
    let manage_py_path = project_path.join("manage.py");

    if !pyproject_toml_path.exists()
        && !requirements_txt_path.exists()
        && !main_py_path.exists()
        && !app_py_path.exists()
        && !manage_py_path.exists()
    {
        return;
    }

    let mut entrypoints = Vec::new();
    if main_py_path.exists() {
        entrypoints.push("main.py".to_string());
        push_unique(entrypoint_hints, "python main.py".to_string());
    }
    if app_py_path.exists() {
        entrypoints.push("app.py".to_string());
        push_unique(entrypoint_hints, "python app.py".to_string());
    }
    if manage_py_path.exists() {
        entrypoints.push("manage.py".to_string());
        push_unique(entrypoint_hints, "python manage.py".to_string());
    }
    if entrypoints.is_empty() {
        push_unique(entrypoint_hints, "python -m app".to_string());
    }

    detected_stacks.push(DetectionSignal::Python {
        pyproject_toml: pyproject_toml_path
            .exists()
            .then(|| pyproject_toml_path.to_string_lossy().into_owned()),
        requirements_txt: requirements_txt_path
            .exists()
            .then(|| requirements_txt_path.to_string_lossy().into_owned()),
        entrypoints,
    });
}

fn composer_depends_on_laravel(json: &serde_json::Value) -> bool {
    contains_dependency(json, "require", "laravel/framework")
        || contains_dependency(json, "require-dev", "laravel/framework")
}

fn contains_dependency(json: &serde_json::Value, field: &str, dependency: &str) -> bool {
    json
        .get(field)
        .and_then(|value| value.as_object())
        .map(|dependencies| dependencies.contains_key(dependency))
        .unwrap_or(false)
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
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
    fn inspect_project_reports_existing_config() {
        let temp_dir = unique_temp_dir("inspect-config");
        fs::create_dir_all(&temp_dir).unwrap();
        fs::write(
            temp_dir.join("maki.yaml"),
            "name: demo\nprocesses:\n  - name: api\n    cmd: cargo run\n",
        )
        .unwrap();

        let inspection = inspect_project_folder(temp_dir.to_string_lossy().into_owned()).unwrap();

        assert_eq!(inspection.name, temp_dir.file_name().unwrap().to_string_lossy());
        assert_eq!(inspection.path, temp_dir.canonicalize().unwrap().to_string_lossy());
        assert!(inspection.exists);
        assert!(inspection.has_config);
        assert!(inspection.detected_stacks.is_empty());
    }

    #[test]
    fn inspect_project_detects_node_laravel_and_python_signals() {
        let temp_dir = unique_temp_dir("inspect-stacks");
        fs::create_dir_all(&temp_dir).unwrap();

        fs::write(
            temp_dir.join("package.json"),
            r#"{"name":"demo","scripts":{"dev":"vite","start":"node server.js"}}"#,
        )
        .unwrap();
        fs::write(
            temp_dir.join("composer.json"),
            r#"{"require":{"laravel/framework":"^11.0"}}"#,
        )
        .unwrap();
        fs::write(temp_dir.join("artisan"), "#!/usr/bin/env php\n").unwrap();
        fs::write(temp_dir.join("pyproject.toml"), "[project]\nname = \"demo\"\n").unwrap();
        fs::write(temp_dir.join("main.py"), "print('demo')\n").unwrap();

        let inspection = inspect_project_folder(temp_dir.to_string_lossy().into_owned()).unwrap();

        assert!(inspection.detected_stacks.iter().any(|signal| matches!(
            signal,
            DetectionSignal::Node { .. }
        )));
        assert!(inspection.detected_stacks.iter().any(|signal| matches!(
            signal,
            DetectionSignal::Laravel { .. }
        )));
        assert!(inspection.detected_stacks.iter().any(|signal| matches!(
            signal,
            DetectionSignal::Python { .. }
        )));
        assert!(!inspection.script_hints.is_empty());
        assert!(!inspection.entrypoint_hints.is_empty());
    }

    #[test]
    fn inspect_project_returns_project_name_from_folder_basename() {
        let temp_root = unique_temp_dir("project-name");
        fs::create_dir_all(&temp_root).unwrap();
        let temp_dir = temp_root.join("my-project");
        fs::create_dir_all(&temp_dir).unwrap();

        let inspection = inspect_project_folder(temp_dir.to_string_lossy().into_owned()).unwrap();

        assert_eq!(inspection.name, "my-project");
    }
}
