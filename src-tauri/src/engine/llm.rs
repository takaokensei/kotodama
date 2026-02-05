use anyhow::{anyhow, Result};
use log::{error, info};
use reqwest::Client;
use serde::{Deserialize, Serialize};

const OLLAMA_API_URL: &str = "http://localhost:11434/api/generate";
const DEFAULT_MODEL: &str = "llama3.1:8b";

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
    format: String,
    options: OllamaOptions,
}

#[derive(Serialize)]
struct OllamaOptions {
    temperature: f32,
    num_gpu: i32,
    num_ctx: i32,
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: String,
}

#[derive(Deserialize)]
struct TranslationOutput {
    translations: Vec<String>,
}

#[derive(Clone)]
pub struct OllamaClient {
    client: Client,
    model: String,
}

impl OllamaClient {
    pub fn new(model: Option<String>) -> Self {
        Self {
            client: Client::new(),
            model: model.unwrap_or_else(|| DEFAULT_MODEL.to_string()),
        }
    }

    pub async fn translate_batch(
        &self, 
        lines: Vec<String>, 
        glossary: Option<Vec<(String, String)>>
    ) -> Result<Vec<String>> {
        if lines.is_empty() {
            return Ok(vec![]);
        }

        let glossary_context = match glossary {
            Some(terms) if !terms.is_empty() => {
                let mut ctx = String::from("\nMandatory Terminology (Glossary):\n");
                for (orig, trans) in terms {
                    ctx.push_str(&format!("- \"{}\" MUST be translated as \"{}\"\n", orig, trans));
                }
                ctx
            }
            _ => String::new(),
        };

        let system_prompt = format!(r#"
You are an expert anime fansub translator (English to Portuguese Brazil).
Translate the subtitle lines contained in the input array.

Context:
- Genre: General Anime / Slice of Life / Isekai.
- Tone: Informal, spoken, natural Brazilian Portuguese (Anime Fansub style).
{}
Output Format:
JSON Object: {{ "translations": ["Line 1", "Line 2"] }}

Rules:
1. **Translate concepts, not just words**: Adapt idioms to Portuguese (e.g., "Talk about close" -> "Foi por pouco!").
2. **Avoid Literal Translation**: Detect phrasing like "spending lunch reading" and translate the *meaning* (e.g., "passava o almoço lendo").
3. **Preserve newlines (\n)** exactly where they appear in the source.
4. Maintain exact line count.
5. Do not output markdown.

Example Input:
["Hello.", "I was spending lunch reading.", "It's a beautiful day.\nLet's go!"]

Example Output:
{{
  "translations": ["Olá.", "Eu passava o almoço lendo.", "Está um belo dia.\nVamos nessa!"]
}}
"#, glossary_context);

        let user_prompt = format!(
            "Translate the following JSON array to Brazilian Portuguese:\n{}",
            serde_json::to_string(&lines)?
        );
        let full_prompt = format!("{}\n\n{}", system_prompt, user_prompt);

        let request = OllamaRequest {
            model: self.model.clone(),
            prompt: full_prompt,
            stream: false,
            format: "json".to_string(),
            options: OllamaOptions {
                temperature: 0.3,
                num_gpu: 999,  // Force full GPU offload
                num_ctx: 4096, // Ensure enough context for batches
            },
        };

        info!("Sending batch of {} lines to Ollama...", lines.len());

        let res = self
            .client
            .post(OLLAMA_API_URL)
            .json(&request)
            .send()
            .await
            .map_err(|e| anyhow!("Failed to connect to Ollama: {}", e))?;

        if !res.status().is_success() {
            let err_text = res.text().await?;
            return Err(anyhow!("Ollama API Error: {}", err_text));
        }

        let body: OllamaResponse = res
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse Ollama response: {}", e))?;

        // Parse the inner JSON string returned by Ollama
        let output: TranslationOutput = serde_json::from_str(&body.response).map_err(|e| {
            anyhow!(
                "Llama/Qwen returned invalid JSON structure: {}. Content: {}",
                e,
                body.response
            )
        })?;

        if output.translations.len() != lines.len() {
            let msg = format!(
                "Batch size mismatch! Sent {}, got {}. Try reducing batch size.",
                lines.len(),
                output.translations.len()
            );
            error!("{}", msg);
            return Err(anyhow!(msg));
        }

        Ok(output.translations)
    }
}
