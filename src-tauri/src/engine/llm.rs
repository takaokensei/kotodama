use serde::{Deserialize, Serialize};
use reqwest::Client;
use anyhow::{Result, anyhow};
use log::{info, error};

const DEFAULT_MODEL: &str = "qwen2.5:7b";
const OLLAMA_API_URL: &str = "http://localhost:11434/api/generate";

pub struct OllamaClient {
    client: Client,
    model: String,
}

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
    format: String, // "json"
    options: OllamaOptions,
}

#[derive(Serialize)]
struct OllamaOptions {
    temperature: f32,
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: String,
}

impl OllamaClient {
    pub fn new(model: Option<String>) -> Self {
        Self {
            client: Client::new(),
            model: model.unwrap_or_else(|| DEFAULT_MODEL.to_string()),
        }
    }

    pub async fn translate_batch(&self, lines: Vec<String>) -> Result<Vec<String>> {
        if lines.is_empty() {
            return Ok(vec![]);
        }

        let system_prompt = r#"
You are a professional anime subtitle translator (English to Portuguese Brazil).
Your output must be a valid JSON Array of strings.
Do not output anything else. No markdown block, no explanation.

Example Input:
["Hello", "World"]

Example Output:
["Olá", "Mundo"]

Constraints:
1. Preserve formatting tags if present.
2. Maintain line count exactly (Input Len == Output Len).
3. Adapts terms to natural spoken Brazilian Portuguese.
"#;

        let user_prompt = format!("Input:\n{}", serde_json::to_string(&lines)?);
        let full_prompt = format!("{}\n\n{}", system_prompt, user_prompt);

        let request = OllamaRequest {
            model: self.model.clone(),
            prompt: full_prompt,
            stream: false,
            format: "json".to_string(), // Force JSON mode
            options: OllamaOptions {
                temperature: 0.1,
            },
        };

        info!("Sending batch of {} lines to Ollama...", lines.len());

        let res = self.client.post(OLLAMA_API_URL)
            .json(&request)
            .send()
            .await
            .map_err(|e| anyhow!("Failed to connect to Ollama: {}", e))?;

        if !res.status().is_success() {
             let err_text = res.text().await?;
             return Err(anyhow!("Ollama API Error: {}", err_text));
        }

        let body: OllamaResponse = res.json().await
            .map_err(|e| anyhow!("Failed to parse Ollama response: {}", e))?;

        // Parse the inner JSON string returned by Ollama
        let translated_lines: Vec<String> = serde_json::from_str(&body.response)
            .map_err(|e| anyhow!("DeepSeek/Qwen returned invalid JSON format: {}. Content: {}", e, body.response))?;

        if translated_lines.len() != lines.len() {
            error!("Batch size mismatch! Sent {}, got {}", lines.len(), translated_lines.len());
            return Err(anyhow!("Batch size mismatch. Integrity check failed."));
        }

        Ok(translated_lines)
    }
}
