use serde::{Deserialize, Serialize};
use anyhow::{Result, Context, anyhow};
use regex::Regex;
use std::path::Path;
use std::fs;
use log::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SubtitleFormat {
    Srt,
    Ass,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleEvent {
    pub index: usize,
    pub start_ms: u64,
    pub end_ms: u64,
    pub text_only: String,
    pub style_tags: String, 
    pub original_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleFile {
    pub events: Vec<SubtitleEvent>,
    pub format: SubtitleFormat,
    pub header: Option<String>,
}

pub fn parse_file<P: AsRef<Path>>(path: P) -> Result<SubtitleFile> {
    let path = path.as_ref();
    let content = fs::read_to_string(path).context("Failed to read subtitle file")?;
    let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    
    match extension.as_str() {
        "srt" => parse_srt(&content),
        "ass" | "ssa" => parse_ass(&content),
        _ => Err(anyhow!("Unsupported file format: {}", extension)),
    }
}

fn parse_srt(content: &str) -> Result<SubtitleFile> {
    let mut events = Vec::new();
    let re_timing = Regex::new(r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})").unwrap();
    let content = content.replace("\r\n", "\n");
    let blocks: Vec<&str> = content.split("\n\n").collect();

    for block in blocks {
        let block = block.trim();
        if block.is_empty() { continue; }
        
        let lines: Vec<&str> = block.lines().collect();
        if lines.len() < 2 { continue; }

        let index = lines[0].trim().parse::<usize>().unwrap_or(0);
        
        // Find timing line (sometimes line 0 is timing if index is missing in bad files, but RFC says index first)
        let mut timing_idx = 1;
        if !lines[timing_idx].contains("-->") && lines.len() > 2 {
             // Heuristic: check if line 0 has timing
             if lines[0].contains("-->") {
                 timing_idx = 0;
             }
        }

        let timing_line = lines.get(timing_idx).ok_or(anyhow!("Missing timing line"))?;
        let caps = re_timing.captures(timing_line).ok_or(anyhow::anyhow!("Invalid timing format: {}", timing_line))?;
        
        let start_ms = parse_srt_time(&caps[1], &caps[2], &caps[3], &caps[4]);
        let end_ms = parse_srt_time(&caps[5], &caps[6], &caps[7], &caps[8]);

        let text_lines = &lines[timing_idx+1..];
        let original_text = text_lines.join("\n");
        let (text_only, style_tags) = extract_clean_text(&original_text, SubtitleFormat::Srt);

        events.push(SubtitleEvent {
            index,
            start_ms,
            end_ms,
            text_only,
            style_tags,
            original_text,
        });
    }

    Ok(SubtitleFile {
        events,
        format: SubtitleFormat::Srt,
        header: None,
    })
}

fn parse_ass(content: &str) -> Result<SubtitleFile> {
    let mut events = Vec::new();
    let re_ass_time = Regex::new(r"(\d):(\d{2}):(\d{2})\.(\d{2})").unwrap();
    
    // Split header and events
    // We assume [Events] starts the events section.
    // Format: Dialogue: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
    
    let lines: Vec<&str> = content.lines().collect();
    let mut in_events = false;
    let mut format_order: Vec<String> = Vec::new();
    let mut idx_counter = 1;

    for line in lines {
        let line = line.trim();
        if line == "[Events]" {
            in_events = true;
            continue;
        }
        if !in_events { continue; }

        if line.starts_with("Format:") {
            let key_part = line.strip_prefix("Format:").unwrap().trim();
            format_order = key_part.split(',').map(|s| s.trim().to_lowercase()).collect();
            continue;
        }

        if line.starts_with("Dialogue:") {
            let body = line.strip_prefix("Dialogue:").unwrap().trim();
            // Split by comma, but be careful because Text can contain commas.
            // Expected fields count based on Format. 
            // Standard: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
            let parts: Vec<&str> = body.splitn(format_order.len(), ',').collect();
            
            if parts.len() < format_order.len() {
                warn!("Skipping malformed Dialogue line: {}", line);
                continue;
            }

            // Find Start and End indices
            let start_idx = format_order.iter().position(|s| s == "start").unwrap_or(1);
            let end_idx = format_order.iter().position(|s| s == "end").unwrap_or(2);
            let text_idx = format_order.len() - 1;

            let start_str = parts[start_idx].trim();
            let end_str = parts[end_idx].trim();
            let original_text = parts[text_idx].trim().to_string();

            let start_ms = parse_ass_time(start_str).unwrap_or(0);
            let end_ms = parse_ass_time(end_str).unwrap_or(0);

            let (text_only, style_tags) = extract_clean_text(&original_text, SubtitleFormat::Ass);

            events.push(SubtitleEvent {
                index: idx_counter,
                start_ms,
                end_ms,
                text_only,
                style_tags,
                original_text,
            });
            idx_counter += 1;
        }
    }

    Ok(SubtitleFile {
        events,
        format: SubtitleFormat::Ass,
        header: Some(content.to_string()),
    })
}

fn parse_srt_time(h: &str, m: &str, s: &str, ms: &str) -> u64 {
    let h: u64 = h.parse().unwrap_or(0);
    let m: u64 = m.parse().unwrap_or(0);
    let s: u64 = s.parse().unwrap_or(0);
    let ms: u64 = ms.parse().unwrap_or(0);
    h * 3600_000 + m * 60_000 + s * 1000 + ms
}

fn parse_ass_time(t: &str) -> Option<u64> {
     // 0:00:00.00
     let parts: Vec<&str> = t.split('.').collect();
     if parts.len() != 2 { return None; }
     let hms: Vec<&str> = parts[0].split(':').collect();
     if hms.len() != 3 { return None; }
     
     let h: u64 = hms[0].parse().ok()?;
     let m: u64 = hms[1].parse().ok()?;
     let s: u64 = hms[2].parse().ok()?;
     let cs: u64 = parts[1].parse().ok()?; // Centiseconds

     Some(h * 3600_000 + m * 60_000 + s * 1000 + cs * 10)
}

fn extract_clean_text(text: &str, format: SubtitleFormat) -> (String, String) {
    match format {
        SubtitleFormat::Srt => {
            // Remove HTML tags
            let re_tags = Regex::new(r"<[^>]+>").unwrap();
            let clean = re_tags.replace_all(text, "").to_string();
            // Convert \n or literal \N
            (clean, "".to_string())
        },
        SubtitleFormat::Ass => {
            // Match {...} usually
            let re_tags = Regex::new(r"\{.*?\}").unwrap();
            let clean = re_tags.replace_all(text, "").to_string();
            let tags: Vec<String> = re_tags.find_iter(text).map(|m| m.as_str().to_string()).collect(); 
            // Also handle \N, \n, \h
            let clean = clean.replace(r"\N", "\n").replace(r"\n", "\n").replace(r"\h", " ");
            (clean, tags.join(""))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn get_fixture_path(name: &str) -> PathBuf {
        let mut d = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        d.push("tests/fixtures");
        d.push(name);
        d
    }

    #[test]
    fn test_parse_clean_srt() {
        let p = get_fixture_path("clean.srt");
        let result = parse_file(p);
        assert!(result.is_ok());
        let file = result.unwrap();
        assert_eq!(file.format, SubtitleFormat::Srt);
        assert_eq!(file.events.len(), 2);
        assert_eq!(file.events[0].text_only.trim(), "Hello World\nThis is a test.");
        assert_eq!(file.events[0].start_ms, 1000);
        assert_eq!(file.events[0].end_ms, 4000);
    }

    #[test]
    fn test_parse_broken_srt_returns_error() {
        let p = get_fixture_path("broken.srt");
        let result = parse_file(p);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_complex_ass() {
        let p = get_fixture_path("complex.ass");
        let result = parse_file(p);
        assert!(result.is_ok());
        let file = result.unwrap();
        assert_eq!(file.format, SubtitleFormat::Ass);
        assert_eq!(file.events.len(), 2);
        
        // Event 1: {\an8}Top Text
        // text_only should be "Top Text"
        // style_tags should be "{\an8}"
        assert_eq!(file.events[0].text_only, "Top Text");
        assert_eq!(file.events[0].style_tags, "{\\an8}");
        
        // Event 2: Simple Text
        assert_eq!(file.events[1].text_only, "Simple Text");
        assert!(file.events[1].style_tags.is_empty());
    }
}
