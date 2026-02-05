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

#[tauri::command]
pub async fn embed_subtitle_command(
    video_path: String,
    subtitle_path: String,
    output_path: String,
    language: Option<String>,
    title: Option<String>,
) -> Result<String, String> {
    embed_subtitle(&video_path, &subtitle_path, &output_path, language, title)
        .await
        .map_err(|e| e.to_string())
}

async fn embed_subtitle(
    video_path: &str,
    subtitle_path: &str,
    output_path: &str,
    language: Option<String>,
    title: Option<String>,
) -> Result<String> {
    println!("Backend: embed_subtitle called");
    println!("  Video: {}", video_path);
    println!("  Subtitle: {}", subtitle_path);
    println!("  Output: {}", output_path);
    
    // Build FFmpeg command to mux subtitle into video
    // -map 0 copies all streams from input 0 (video)
    // -map 1:0 adds the subtitle from input 1
    let lang = language.unwrap_or_else(|| "por".to_string());
    let track_title = title.unwrap_or_else(|| "Portuguese (Translated)".to_string());
    
    // Create bindings to extend lifetime of format! results
    let lang_metadata = format!("language={}", lang);
    let title_metadata = format!("title={}", track_title);
    
    let args = vec![
        "-i", video_path,
        "-i", subtitle_path,
        "-map", "0",          // Copy all streams from input 0 (original video)
        "-map", "1:0",        // Add subtitle from input 1
        "-c", "copy",         // Copy all streams without re-encoding
        "-c:s", "ass",        // Ensure subtitle is in ASS format
        "-metadata:s:s", &lang_metadata,      // Set language for the NEW subtitle track
        "-metadata:s:s", &title_metadata,     // Set title for the NEW subtitle track
        "-disposition:s:0", "default",        // Keep first subtitle as default
        "-y",                 // Overwrite output file
        output_path,
    ];

    println!("Backend: Running FFmpeg with args: {:?}", args);
    
    let status = Command::new("ffmpeg")
        .args(&args)
        .status()
        .map_err(|e| anyhow!("Failed to execute ffmpeg: {}. Is ffmpeg in PATH?", e))?;

    if !status.success() {
        println!("Backend: FFmpeg failed with status: {:?}", status);
        return Err(anyhow!("FFmpeg muxing failed with error code"));
    }

    println!("Backend: FFmpeg muxing completed successfully");
    Ok(output_path.to_string())
}
