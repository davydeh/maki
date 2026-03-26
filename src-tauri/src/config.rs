use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;

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
