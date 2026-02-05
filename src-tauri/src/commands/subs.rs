use crate::engine::llm::OllamaClient;

// State management for OllamaClient could be added here later,
// for now we instantiate on demand or standard lazy static if needed.
// But following simple pattern:

#[tauri::command]
pub async fn translate_batch_command(lines: Vec<String>) -> Result<Vec<String>, String> {
    println!(
        "Backend: translate_batch_command called with {} lines",
        lines.len()
    );

    // Instantiate client (in production, use managed state)
    let client = OllamaClient::new(None);

    match client.translate_batch(lines).await {
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
