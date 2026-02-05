use crate::engine::parser::{parse_file, SubtitleFile};
use std::path::PathBuf;
use std::fs;

// Convert milliseconds to ASS timestamp format (H:MM:SS.CC)
fn format_ass_timestamp(ms: u64) -> String {
    let total_seconds = ms / 1000;
    let centiseconds = (ms % 1000) / 10;
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    
    format!("{}:{:02}:{:02}.{:02}", hours, minutes, seconds, centiseconds)
}

#[tauri::command]
pub async fn open_subtitle_command(path: String) -> Result<SubtitleFile, String> {
    println!("Backend: Opening file: {}", path);
    parse_file(PathBuf::from(path)).map_err(|e| format!("Failed to parse file: {}", e))
}

#[tauri::command]
pub async fn save_subtitle_command(file: SubtitleFile, path: String) -> Result<String, String> {
    println!("Backend: Saving subtitle to: {}", path);
    
    // Reconstruct ASS format from SubtitleFile
    let mut content = String::new();
    
    // Add header (simplified - you may want to preserve original header)
    content.push_str("[Script Info]\n");
    content.push_str("Title: Translated Subtitles\n");
    content.push_str("ScriptType: v4.00+\n\n");
    
    content.push_str("[V4+ Styles]\n");
    content.push_str("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n");
    content.push_str("Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1\n\n");
    
    content.push_str("[Events]\n");
    content.push_str("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n");
    
    for event in &file.events {
        // Convert milliseconds to ASS timestamp format (H:MM:SS.CC)
        let start_time = format_ass_timestamp(event.start_ms);
        let end_time = format_ass_timestamp(event.end_ms);
        
        content.push_str(&format!(
            "Dialogue: 0,{},{},Default,,0,0,0,,{}\n",
            start_time, end_time, event.text_only
        ));
    }
    
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    Ok(path)
}

#[tauri::command]
pub async fn save_project_command(path: String, content: String) -> Result<String, String> {
    println!("Backend: Saving project to: {}", path);
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write project file: {}", e))?;
    Ok(path)
}

#[tauri::command]
pub async fn load_project_command(path: String) -> Result<String, String> {
    println!("Backend: Loading project from: {}", path);
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read project file: {}", e))
}
