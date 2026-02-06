use crate::engine::config::AppConfig;
use tauri::{AppHandle, command};

#[command]
pub async fn get_config_command(app_handle: AppHandle) -> Result<AppConfig, String> {
    AppConfig::load(&app_handle).map_err(|e| e.to_string())
}

#[command]
pub async fn update_config_command(app_handle: AppHandle, config: AppConfig) -> Result<(), String> {
    config.save(&app_handle).map_err(|e| e.to_string())
}
