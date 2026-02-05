use crate::engine::llm::OllamaClient;

// State management for OllamaClient could be added here later, 
// for now we instantiate on demand or standard lazy static if needed.
// But following simple pattern:

#[tauri::command]
pub async fn translate_batch_command(lines: Vec<String>) -> Result<Vec<String>, String> {
    // Instantiate client (in production, use managed state)
    let client = OllamaClient::new(None);
    
    match client.translate_batch(lines).await {
        Ok(translated) => Ok(translated),
        Err(e) => Err(format!("Translation Error: {}", e)),
    }
}
