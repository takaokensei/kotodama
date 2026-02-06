use serde::{Deserialize, Serialize};
use std::fs;
use anyhow::{Result, anyhow};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub ollama_url: String,
    pub model_name: String,
    pub temperature: f32,
    pub context_history_lines: usize,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            ollama_url: "http://localhost:11434/api/generate".to_string(),
            model_name: "llama3.1:8b".to_string(),
            temperature: 0.3,
            context_history_lines: 5,
        }
    }
}

impl AppConfig {
    pub fn load(app_handle: &tauri::AppHandle) -> Result<Self> {
        let config_dir = app_handle.path().app_config_dir()
            .map_err(|e| anyhow!("Failed to get config dir: {}", e))?;
        let config_path = config_dir.join("config.json");

        if !config_path.exists() {
            return Ok(Self::default());
        }

        let content = fs::read_to_string(config_path)
            .map_err(|e| anyhow!("Failed to read config file: {}", e))?;
        let config: AppConfig = serde_json::from_str(&content)
            .map_err(|e| anyhow!("Failed to parse config JSON: {}", e))?;
        Ok(config)
    }

    pub fn save(&self, app_handle: &tauri::AppHandle) -> Result<()> {
        let config_dir = app_handle.path().app_config_dir()
            .map_err(|e| anyhow!("Failed to get config dir: {}", e))?;
        
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir)
                .map_err(|e| anyhow!("Failed to create config dir: {}", e))?;
        }

        let config_path = config_dir.join("config.json");
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| anyhow!("Failed to serialize config: {}", e))?;
        fs::write(config_path, content)
            .map_err(|e| anyhow!("Failed to write config file: {}", e))?;
        Ok(())
    }
}
