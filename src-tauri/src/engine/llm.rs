use crate::engine::config::AppConfig;
use anyhow::{anyhow, Result};
use log::{error, info};
use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};



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

#[derive(Serialize, Deserialize)]
pub struct RichLine {
    pub actor: String,
    pub text: String,
}

#[derive(Deserialize)]
struct TranslationOutput {
    translations: Vec<String>,
}

#[derive(Clone)]
pub struct OllamaClient {
    client: Client,
    config: AppConfig,
}

impl OllamaClient {
    pub fn new(config: Option<AppConfig>) -> Self {
        Self {
            client: Client::new(),
            config: config.unwrap_or_default(),
        }
    }

    pub async fn translate_batch(
        &self, 
        lines: Vec<RichLine>, 
        history: Option<Vec<String>>,
        glossary: Option<Vec<(String, String)>>
    ) -> Result<Vec<String>> {
        if lines.is_empty() {
            return Ok(vec![]);
        }

        let glossary_context = {
            let mut ctx = String::from("\nMandatory Terminology (Glossary):\n");
            // 1. Base Genre Glossary (Static)
            ctx.push_str("- \"Light Novel\" MUST be translated as \"Light Novel\"\n");
            ctx.push_str("- \"Isekai\" MUST be translated as \"Isekai\"\n");
            ctx.push_str("- \"Class Rep\" MUST be translated as \"Representante de Classe\"\n");
            
            // 2. User Glossary (Dynamic)
            if let Some(terms) = glossary {
                for (orig, trans) in terms {
                    ctx.push_str(&format!("- \"{}\" MUST be translated as \"{}\"\n", orig, trans));
                }
            }
            ctx
        };

        let history_context = match history {
            Some(h) if !h.is_empty() => {
                format!("\nRecent Context (Previous Translations):\n- {}\n", h.join("\n- "))
            }
            _ => String::new(),
        };

        let system_prompt = format!(r#"
You are an expert anime fansub translator (English to Portuguese Brazil).
Translate exactly {} subtitle lines.

Core Objective:
- **Fansub Style**: Natural, spoken Brazilian Portuguese. Use "você", "cara", "então" naturally.
- **Context Awareness**: Use character names and history to keep consistent genders and tone.
- **Format**: Return a JSON object with exactly ONE key: "translations".

{}{}{}

Example Output:
{{ "translations": ["First line here", "Second line here"] }}

IMPORTANT: 
1. The "translations" array MUST contain exactly {} items.
2. Put ALL {} translations into a SINGLE array under the "translations" key. 
3. DO NOT use multiple "translations" keys.
4. DO NOT repeat content.
"#, lines.len(), history_context, glossary_context, lines.len(), lines.len(), lines.len());

        let user_prompt = format!(
            "Translate the following JSON array to Brazilian Portuguese:\n{}",
            serde_json::to_string(&lines)?
        );
        let full_prompt = format!("{}\n\n{}", system_prompt, user_prompt);

        let request = OllamaRequest {
            model: self.config.model_name.clone(),
            prompt: full_prompt,
            stream: false,
            format: "json".to_string(),
            options: OllamaOptions {
                temperature: self.config.temperature,
                num_gpu: 999,  // Force full GPU offload
                num_ctx: 4096, // Ensure enough context for batches
            },
        };

        info!("Sending batch of {} lines to Ollama...", lines.len());

        let res = self
            .client
            .post(&self.config.ollama_url)
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

        let raw_response = body.response.trim();
        
        // --- JSON REPAIR LOGIC ---
        // If the model returns multiple "translations" keys, merge them.
        let mut final_json = raw_response.to_string();
        if raw_response.matches("\"translations\"").count() > 1 {
            info!("LLM returned duplicate keys. Attempting JSON repair...");
            let re = Regex::new(r#"\]\s*,\s*"translations"\s*:\s*\["#).unwrap();
            final_json = re.replace_all(raw_response, ", ").to_string();
        }

        let output: TranslationOutput = serde_json::from_str(&final_json).map_err(|e| {
            anyhow!(
                "Llama/Qwen returned invalid JSON structure: {}. Content: {}",
                e,
                final_json
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
