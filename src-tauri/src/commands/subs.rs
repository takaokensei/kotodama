use crate::engine::llm::OllamaClient;
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

// State management for OllamaClient could be added here later,
// for now we instantiate on demand or standard lazy static if needed.
// But following simple pattern:

#[tauri::command]
pub async fn translate_batch_command(lines: Vec<String>) -> Result<Vec<String>, String> {
    println!(
        "Backend: translate_batch_command called with {} lines",
        lines.len()
    );


    // Strip ASS formatting codes before translation
    let cleaned_lines: Vec<String> = lines.iter()
        .map(|line| strip_ass_formatting(line))
        .collect();

    // Instantiate client (in production, use managed state)
    let client = OllamaClient::new(None);

    match client.translate_batch(cleaned_lines).await {
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
