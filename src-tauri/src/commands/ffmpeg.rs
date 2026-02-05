use std::process::Command;

use anyhow::{anyhow, Result};
use std::fs;
use tempfile::NamedTempFile;

use crate::engine::parser::{self, SubtitleFile};

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SubtitleTrack {
    pub index: usize,
    pub codec_name: String,
    pub language: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FFprobeOutput {
    streams: Vec<FFprobeStream>,
}

#[derive(Debug, Deserialize)]
struct FFprobeStream {
    index: usize,
    codec_name: String,
    tags: Option<FFprobeTags>,
}

#[derive(Debug, Deserialize)]
struct FFprobeTags {
    language: Option<String>,
    title: Option<String>,
}

#[tauri::command]
pub async fn scan_subtitle_tracks_command(video_path: String) -> Result<Vec<SubtitleTrack>, String> {
    scan_subtitle_tracks(&video_path)
        .await
        .map_err(|e| e.to_string())
}

async fn scan_subtitle_tracks(video_path: &str) -> Result<Vec<SubtitleTrack>> {
    let output = Command::new("ffprobe")
        .args(&[
            "-v", "error",
            "-select_streams", "s",
            "-show_entries", "stream=index,codec_name:stream_tags=language,title",
            "-of", "json",
            video_path
        ])
        .output()
        .map_err(|e| anyhow!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        return Err(anyhow!("ffprobe failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let output_str = String::from_utf8_lossy(&output.stdout);
    let probe: FFprobeOutput = serde_json::from_str(&output_str)
        .map_err(|e| anyhow!("Failed to parse ffprobe output: {}", e))?;

    let tracks = probe.streams.into_iter().map(|s| SubtitleTrack {
        index: s.index,
        codec_name: s.codec_name,
        language: s.tags.as_ref().and_then(|t| t.language.clone()),
        title: s.tags.as_ref().and_then(|t| t.title.clone()),
    }).collect();

    Ok(tracks)
}

#[tauri::command]
pub async fn extract_subtitle_command(video_path: String, track_index: Option<usize>) -> Result<SubtitleFile, String> {
    extract_subtitle(&video_path, track_index)
        .await
        .map_err(|e| e.to_string())
}

async fn extract_subtitle(video_path: &str, track_index: Option<usize>) -> Result<SubtitleFile> {
    // 1. Create a temporary file
    let temp_file = NamedTempFile::new()?;
    let output_path = temp_file.path().to_string_lossy().to_string() + ".ass";

    // Build map identifier: "0:s:0" (default) or "0:<stream_index>"? 
    // FFmpeg map syntax is 0:<stream_specifier>. If we pass loop index from ffprobe which is absolute stream index, 
    // we should use "0:<index>". 
    // BUT ffprobe returns absolute index among ALL streams (video+audio+subs).
    // So "-map 0:<index>" is correct.
    let map_arg = match track_index {
        Some(idx) => format!("0:{}", idx),
        None => "0:s:0".to_string(), // Default to first subtitle stream
    };

    // 2. Run FFmpeg command
    let status = Command::new("ffmpeg")
        .args(&[
            "-i",
            video_path,
            "-map",
            &map_arg,
            "-y",    // Overwrite
            &output_path,
        ])
        .status()
        .map_err(|e| anyhow!("Failed to execute ffmpeg: {}. Is ffmpeg in PATH?", e))?;

    if !status.success() {
        return Err(anyhow!("FFmpeg exited with error code"));
    }

    // 3. Read the extracted file
    let content = fs::read_to_string(&output_path)
        .map_err(|e| anyhow!("Failed to read extracted subtitle: {}", e))?;

    // Cleanup happens automatically for NamedTempFile, but we added extension manually to path string
    // so we should try to remove the specific path we created.
    let _ = fs::remove_file(&output_path);

    // 4. Parse it
    // We assume it's ASS because we extracted it as .ass (ffmpeg converts to ass if needed when output path ends in .ass)
    let file = parser::parse_ass(&content)?;

    Ok(file)
}
