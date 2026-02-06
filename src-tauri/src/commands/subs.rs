use crate::engine::llm::{OllamaClient, RichLine};
use regex::Regex;

// Strip ASS formatting codes that interfere with translation
fn strip_ass_formatting(text: &str) -> String {
    let mut cleaned = text.to_string();
    
    // Remove ASS override blocks: {\pos(x,y)}, {\an7}, etc.
    let override_regex = Regex::new(r"\{[^}]+\}").unwrap();
    cleaned = override_regex.replace_all(&cleaned, "").to_string();
    
    // Replace \N (ASS line break) with space to preserve sentence flow
    cleaned = cleaned.replace("\\N", " ");
    
    // Replace \n (literal newline) with space
    cleaned = cleaned.replace("\\n", " ");
    
    // Collapse multiple spaces
    let space_regex = Regex::new(r"\s+").unwrap();
    cleaned = space_regex.replace_all(&cleaned, " ").to_string();
    
    cleaned.trim().to_string()
}

#[tauri::command]
pub async fn translate_batch_command(
    app_handle: tauri::AppHandle,
    lines: Vec<RichLine>,
    history: Option<Vec<String>>,
    glossary: Option<Vec<(String, String)>>
) -> Result<Vec<String>, String> {
    println!(
        "Backend: translate_batch_command called with {} lines, history: {} lines, glossary: {:?}",
        lines.len(),
        history.as_ref().map(|h| h.len()).unwrap_or(0),
        glossary
    );

    // Strip ASS formatting codes before translation for each line
    let cleaned_lines: Vec<RichLine> = lines.into_iter()
        .map(|mut line| {
            line.text = strip_ass_formatting(&line.text);
            line
        })
        .collect();

    // Load configuration
    let config = crate::engine::config::AppConfig::load(&app_handle)
        .unwrap_or_default();

    // Instantiate client with config
    let client = OllamaClient::new(Some(config));

    match client.translate_batch(cleaned_lines, history, glossary).await {
        Ok(translated) => {
            println!("Backend: Translation success: {:?}", translated);
            Ok(translated)
        }
        Err(e) => {
            println!("Backend: Translation error: {}", e);
            Err(format!("Translation Error: {}", e))
        }
    }
}
