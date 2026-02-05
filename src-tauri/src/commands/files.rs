use crate::engine::parser::{parse_file, SubtitleFile};
use std::path::PathBuf;

#[tauri::command]
pub async fn open_subtitle_command(path: String) -> Result<SubtitleFile, String> {
    println!("Backend: Opening file: {}", path);
    parse_file(PathBuf::from(path)).map_err(|e| format!("Failed to parse file: {}", e))
}
