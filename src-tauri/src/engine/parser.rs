use anyhow::{anyhow, Context, Result};
use log::warn;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

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
    pub actor: String,     // Who is speaking
    pub style: String,     // Formatting style
    pub text_only: String, // Clean text for LLM inference
    pub raw_text: String,  // Original text payload (preserving tags/structure)
    pub status: String,    // "original" | "translated" | "error"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleFile {
    pub events: Vec<SubtitleEvent>,
    pub format: SubtitleFormat,
    pub header: String, // Metadata before [Events]
}

// Global Regex Compilation (Performance Fix)
fn get_srt_timing_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})")
            .unwrap()
    })
}

fn get_ass_timing_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(\d):(\d{2}):(\d{2})\.(\d{2})").unwrap())
}

fn get_html_tags_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"<[^>]+>").unwrap())
}

fn get_ass_tags_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\{.*?\}").unwrap())
}

pub fn parse_file<P: AsRef<Path>>(path: P) -> Result<SubtitleFile> {
    let path = path.as_ref();
    let content = fs::read_to_string(path).context("Failed to read subtitle file")?;
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "srt" => parse_srt(&content),
        "ass" | "ssa" => parse_ass(&content),
        _ => Err(anyhow!("Unsupported file format: {}", extension)),
    }
}

fn parse_srt(content: &str) -> Result<SubtitleFile> {
    let mut events = Vec::new();
    let re_timing = get_srt_timing_regex();
    // Normalize newlines
    let content = content.replace("\r\n", "\n");
    let blocks: Vec<&str> = content.split("\n\n").collect();

    for block in blocks {
        let block = block.trim();
        if block.is_empty() {
            continue;
        }

        let lines: Vec<&str> = block.lines().collect();
        if lines.len() < 2 {
            continue;
        }

        // RFC srt: index first
        let index = lines[0].trim().parse::<usize>().unwrap_or(0);

        let mut timing_idx = 1;
        // Handle common malformed cases where index is missing
        if !lines[timing_idx].contains("-->") && lines.len() > 2 {
            if lines[0].contains("-->") {
                timing_idx = 0;
            }
        }

        let timing_line = lines
            .get(timing_idx)
            .ok_or(anyhow!("Missing timing line"))?;
        let caps = re_timing
            .captures(timing_line)
            .ok_or(anyhow!("Invalid timing format: {}", timing_line))?;

        let start_ms = parse_srt_time(&caps[1], &caps[2], &caps[3], &caps[4]);
        let end_ms = parse_srt_time(&caps[5], &caps[6], &caps[7], &caps[8]);

        // Content lines
        let text_lines = &lines[timing_idx + 1..];
        let raw_text = text_lines.join("\n");
        let text_only = clean_srt_text(&raw_text);

        events.push(SubtitleEvent {
            index,
            start_ms,
            end_ms,
            actor: String::new(),
            style: String::new(),
            text_only,
            raw_text,
            status: "original".to_string(),
        });
    }

    Ok(SubtitleFile {
        events,
        format: SubtitleFormat::Srt,
        header: String::new(), // SRT has no standard header
    })
}

pub fn parse_ass(content: &str) -> Result<SubtitleFile> {
    let mut events = Vec::new();
    let mut header_lines = Vec::new();
    let mut in_events_section = false;
    let mut format_order: Vec<String> = Vec::new();
    let mut idx_counter = 1;

    let lines: Vec<&str> = content.lines().collect();

    for line in lines {
        let line_trim = line.trim();

        if line_trim == "[Events]" {
            in_events_section = true;
            // We append [Events] to header to allow easy reconstruction,
            // OR we stop here? User said "header should only contain metadata lines (before [Events])".
            // Implementation decision: The simplest way to reconstruct is to keep [Events] in the reconstruction logic,
            // but for the 'header' field, we strictly follow the user: STOP before [Events].
            continue;
        }

        if !in_events_section {
            header_lines.push(line);
            continue;
        }

        // Inside [Events]
        if line_trim.starts_with("Format:") {
            let key_part = line_trim.strip_prefix("Format:").unwrap().trim();
            format_order = key_part
                .split(',')
                .map(|s| s.trim().to_lowercase())
                .collect();
            // We do NOT add Format to header field based on user request (it's inside Events).
            // This suggests we need to store 'Format' line separately or handle it in reconstruction.
            // For now, satisfy parsing logic.
            continue;
        }

        if line_trim.starts_with("Dialogue:") {
            let body = line_trim.strip_prefix("Dialogue:").unwrap().trim();
            // Split by comma, respecting that the final 'Text' field may contain commas.
            // usage of splitn is tricky if we don't know the count perfectly, but
            // usually Format has N fields, and we split N times.
            // Actually, splitn(N) returns N items. The last item is the rest of the string.

            if format_order.is_empty() {
                // Fallback or skip if no Format line found yet
                warn!(
                    "Dialogue found before Format definition, skipping: {}",
                    line
                );
                continue;
            }

            let parts: Vec<&str> = body.splitn(format_order.len(), ',').collect();

            if parts.len() < format_order.len() {
                warn!("Skipping malformed Dialogue line: {}", line);
                continue;
            }

            let start_idx = format_order.iter().position(|s| s == "start").unwrap_or(1);
            let end_idx = format_order.iter().position(|s| s == "end").unwrap_or(2);
            let actor_idx = format_order.iter().position(|s| s == "name").unwrap_or(
                format_order.iter().position(|s| s == "actor").unwrap_or(4)
            );
            let style_idx = format_order.iter().position(|s| s == "style").unwrap_or(3);
            let text_idx = format_order.len() - 1;

            let start_str = parts[start_idx].trim();
            let end_str = parts[end_idx].trim();
            let raw_text = parts[text_idx].trim().to_string(); // Keep raw payload

            let start_ms = parse_ass_time(start_str).unwrap_or(0);
            let end_ms = parse_ass_time(end_str).unwrap_or(0);

            let text_only = clean_ass_text(&raw_text);

            events.push(SubtitleEvent {
                index: idx_counter,
                start_ms,
                end_ms,
                actor: parts.get(actor_idx).unwrap_or(&"").trim().to_string(),
                style: parts.get(style_idx).unwrap_or(&"").trim().to_string(),
                text_only,
                raw_text,
                status: "original".to_string(),
            });
            idx_counter += 1;
        }
    }

    Ok(SubtitleFile {
        events,
        format: SubtitleFormat::Ass,
        header: header_lines.join("\n"),
    })
}

// Helpers

fn parse_srt_time(h: &str, m: &str, s: &str, ms: &str) -> u64 {
    let h: u64 = h.parse().unwrap_or(0);
    let m: u64 = m.parse().unwrap_or(0);
    let s: u64 = s.parse().unwrap_or(0);
    let ms: u64 = ms.parse().unwrap_or(0);
    h * 3600_000 + m * 60_000 + s * 1000 + ms
}

fn parse_ass_time(t: &str) -> Option<u64> {
    // 0:00:00.00
    let re = get_ass_timing_regex();
    let caps = re.captures(t)?;

    let h: u64 = caps[1].parse().ok()?;
    let m: u64 = caps[2].parse().ok()?;
    let s: u64 = caps[3].parse().ok()?;
    let cs: u64 = caps[4].parse().ok()?; // Centiseconds

    Some(h * 3600_000 + m * 60_000 + s * 1000 + cs * 10)
}

fn clean_srt_text(text: &str) -> String {
    let re = get_html_tags_regex();
    re.replace_all(text, "").to_string()
}

fn clean_ass_text(text: &str) -> String {
    let re = get_ass_tags_regex();
    let clean = re.replace_all(text, "");
    // Handle special char replacements
    clean
        .replace(r"\N", "\n")
        .replace(r"\n", "\n")
        .replace(r"\h", " ")
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

        let e0 = &file.events[0];
        assert_eq!(e0.raw_text, "Hello World\nThis is a test.");
        assert_eq!(e0.text_only, "Hello World\nThis is a test.");
        assert_eq!(e0.start_ms, 1000);
        assert_eq!(e0.end_ms, 4000);
    }

    #[test]
    fn test_parse_complex_ass() {
        let p = get_fixture_path("complex.ass");
        let result = parse_file(p);
        assert!(result.is_ok());
        let file = result.unwrap();
        assert_eq!(file.format, SubtitleFormat::Ass);

        // Check Metadata separation
        // Header should NOT contain [Events] or Dialogue
        assert!(file.header.contains("[Script Info]"));
        assert!(!file.header.contains("[Events]"));
        assert!(!file.header.contains("Dialogue:"));

        // Event Check
        let e0 = &file.events[0];
        // Raw text must preserve tags
        assert_eq!(e0.raw_text, "{\\an8}Top Text");
        // Text only must be clean
        assert_eq!(e0.text_only, "Top Text");
    }
}
