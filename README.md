<div align="center">
  <img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=1a1b26&height=120&section=header"/>
  
  <h1>
    <img src="https://readme-typing-svg.herokuapp.com/?lines=⛩️+KOTODAMA;Sovereign+AI+Translation;Anime+Localization+Tool;Human-in-the-Loop+Workflow&font=Fira+Code&center=true&width=600&height=50&color=7aa2f7&vCenter=true&pause=1000&size=28" />
  </h1>
  
  <samp>Desktop-First · Privacy-Focused · Fansub-Grade Quality</samp>
  <br/><br/>
  
  <img src="https://img.shields.io/badge/Rust-1.75+-c0caf5?style=for-the-badge&logo=rust&logoColor=1a1b26"/>
  <img src="https://img.shields.io/badge/Tauri-v2-7aa2f7?style=for-the-badge&logo=tauri&logoColor=1a1b26"/>
  <img src="https://img.shields.io/badge/React-18-bb9af7?style=for-the-badge&logo=react&logoColor=1a1b26"/>
  <img src="https://img.shields.io/badge/Ollama-Local_AI-9ece6a?style=for-the-badge&logo=ai&logoColor=1a1b26"/>
  <img src="https://img.shields.io/badge/Status-In_Development-f7768e?style=for-the-badge"/>
  <br/><br/>
  <a href="README.pt-br.md">
    <img src="https://img.shields.io/badge/Lang-Português-9ece6a?style=for-the-badge&logo=google-translate&logoColor=1a1b26" alt="Ler em Português"/>
  </a>
</div>

<br/>

## `> project.philosophy()`

```rust
/// Kotodama (言霊) — "The Spirit of Words"
/// 
/// Traditional fansub workflow: Translate → Time → Edit → QC
/// Reality: AI hallucinates terminology, ignores context, breaks immersion.
/// 
/// Solution: Treat LLMs as SYNTAX engines, not TERMINOLOGY engines.
struct Kotodama {
    core_principle: "Human judgment > AI suggestions",
    architecture: "Local-first (No cloud dependencies)",
    workflow: "Edit-in-place with AI assistance",
    sovereignty: "Your data never leaves your machine"
}

impl Kotodama {
    /// The "Regra Zero" (Rule Zero)
    /// If a glossary term exists, the LLM MUST use it.
    /// If the LLM fails, the Semantic Circuit Breaker flags it.
    fn validate_translation(&self, input: &str, output: &str) -> Result<()> {
        let glossary_hits = self.glossary.scan(input);
        for term in glossary_hits {
            if !output.contains(&term.translation) {
                return Err(CircuitBreakerError::TerminologyViolation);
            }
        }
        Ok(())
    }
}
```

<br/>

## `> tech_stack`

<div align="center">
  <img src="https://skillicons.dev/icons?i=rust,tauri,react,ts,sqlite,tailwind,vite&theme=dark&perline=7" />
</div>

<table align="center">
<tr>
<td align="center" width="33%">
<strong>⚙️ Core Engine</strong><br/><br/>
<img src="https://img.shields.io/badge/Rust-1.75+-c0caf5?style=flat-square&logo=rust&logoColor=1a1b26"/>
<img src="https://img.shields.io/badge/Tauri-v2-7aa2f7?style=flat-square&logo=tauri&logoColor=1a1b26"/>
<img src="https://img.shields.io/badge/Tokio-Async_Runtime-9ece6a?style=flat-square"/>
<img src="https://img.shields.io/badge/thiserror%2Fanyhow-Error_Handling-f7768e?style=flat-square"/>
</td>
<td align="center" width="33%">
<strong>🎨 User Interface</strong><br/><br/>
<img src="https://img.shields.io/badge/React-18-bb9af7?style=flat-square&logo=react&logoColor=1a1b26"/>
<img src="https://img.shields.io/badge/TypeScript-5.0-7aa2f7?style=flat-square&logo=typescript&logoColor=1a1b26"/>
<img src="https://img.shields.io/badge/TailwindCSS-3.4-7dcfff?style=flat-square&logo=tailwindcss&logoColor=1a1b26"/>
<img src="https://img.shields.io/badge/Shadcn%2Fui-Components-c0caf5?style=flat-square"/>
<img src="https://img.shields.io/badge/TanStack_Virtual-Performance-9ece6a?style=flat-square"/>
</td>
<td align="center" width="33%">
<strong>🧠 AI & Data</strong><br/><br/>
<img src="https://img.shields.io/badge/Ollama-Local_LLMs-9ece6a?style=flat-square"/>
<img src="https://img.shields.io/badge/SQLite-Database-7aa2f7?style=flat-square&logo=sqlite&logoColor=1a1b26"/>
<img src="https://img.shields.io/badge/sqlite--vss-Vector_Search-bb9af7?style=flat-square"/>
<img src="https://img.shields.io/badge/FFmpeg-Video_Processing-f7768e?style=flat-square&logo=ffmpeg&logoColor=1a1b26"/>
</td>
</tr>
</table>

<br/>

## `> architecture_overview`

```
kotodama/
│
├── 🦀 src-tauri/              # Rust Backend (The Brain)
│   ├── src/
│   │   ├── engine/            # Core Domain Logic
│   │   │   ├── parser.rs      # SSA/SRT Parser (RFC-compliant)
│   │   │   ├── llm.rs         # Ollama Client (Batching + Context)
│   │   │   ├── glossary.rs    # Morphology Validation Engine
│   │   │   └── muxer.rs       # FFmpeg/MKVToolNix Wrapper
│   │   ├── commands/          # Tauri IPC (Frontend ↔ Backend)
│   │   └── db/                # SQLite + Vector Search
│   │
├── ⚛️ src/                     # React Frontend (The Interface)
│   ├── features/
│   │   ├── editor/            # Virtualized Subtitle Grid (10k+ lines)
│   │   ├── glossary/          # Term Management UI
│   │   └── dashboard/         # Project Selection
│   └── components/            # Reusable Shadcn/UI Components
│
├── 📦 resources/              # Sidecar Binaries
│   ├── ffmpeg.exe             # Video processing
│   └── mkvmerge.exe           # Subtitle muxing
│
└── 💾 migrations/             # SQLite Schema Versioning
```

<br/>

## `> workflow_pipeline`

<table align="center">
<tr>
<td width="50%">
<h3 align="center">🎬 Phase 1: Import & Parse</h3>
<p align="center">
<img src="https://img.shields.io/badge/Status-✅_Complete-9ece6a?style=for-the-badge"/>
</p>

**Input:** `.mkv` video or `.srt/.ass` subtitle file  
**Process:**
1. Extract subtitles using FFmpeg (if video)
2. Parse into structured format (timestamps + text + styling)
3. Load into Virtual List (handles 10,000+ lines at 60fps)

**Tech:**
- Parser supports 100% of RFC `.srt` + 95% of `.ass` (SubStation Alpha v4+)
- Malformed files return errors (never crash)
- Performance: < 200ms for 400-line episodes

</td>
<td width="50%">
<h3 align="center">🧠 Phase 2: AI Translation</h3>
<p align="center">
<img src="https://img.shields.io/badge/Status-🚧_In_Progress-f7768e?style=for-the-badge"/>
</p>

**Process:**
1. Batch 5-10 lines (context-aware prompts)
2. Ollama generates translations (local `qwen2.5:7b`)
3. Semantic Circuit Breaker validates glossary terms
4. UI marks lines as 🟡 Draft / ⚠️ Warning / ✅ Validated

**Optimization:**
- Batching avoids I/O bottleneck (1 call vs 400 calls)
- PCA reduces embedding dimensionality (768d → 100d)
- User can cancel mid-translation (state saved)

</td>
</tr>
<tr>
<td width="50%">
<h3 align="center">✏️ Phase 3: Human Review</h3>
<p align="center">
<img src="https://img.shields.io/badge/Status-📋_Planned-7aa2f7?style=for-the-badge"/>
</p>

**The Override Stack (Priority):**
1. 🔒 **Human Lock** (Manual edit)
2. 📖 **Glossary Term** (Enforced terminology)
3. 💾 **Translation Memory** (Previous translations)
4. 🔍 **RAG Context** (Vector search)
5. 🤖 **LLM Baseline** (Fallback)

**Key Feature:**  
Once a user edits a line, it's **locked forever**. No AI can override human judgment.

</td>
<td width="50%">
<h3 align="center">📦 Phase 4: Export</h3>
<p align="center">
<img src="https://img.shields.io/badge/Status-📋_Planned-7aa2f7?style=for-the-badge"/>
</p>

**Output:** `.mkv` with embedded styled subtitles

**Process:**
1. Validate all lines (warn if untranslated rows exist)
2. Reassemble subtitle file (preserve fonts, colors, positioning)
3. Mux video + new subtitle track → `filename_kotodama.mkv`

**Quality Check:**
- Exported file plays in VLC with identical styling
- Translations >50% longer than source flagged as warnings

</td>
</tr>
</table>

<br/>

## `> the_semantic_circuit_breaker`

<div align="center">
<img src="https://img.shields.io/badge/Innovation-Core_IP-f7768e?style=for-the-badge"/>
</div>

**Problem:** LLMs hallucinate terminology. Example:

```yaml
Glossary: { "Hokage" → "Hokage" (Invariant) }
Input:  "The Hokage is strong."
Output: "O Líder da Vila é forte." ❌ WRONG!
```

**Solution:** Post-inference validation with morphology rules.

```rust
enum Morphology {
    Invariant,  // Exact match only (e.g., "Hokage")
    Noun,       // Allow plurals (e.g., "mage" → "mages")
    Verb,       // Allow conjugations (e.g., "cast" → "casting")
    Phrase,     // Multi-word exact match (e.g., "Magic Circle")
}

// If output missing glossary term → Flag as ⚠️ WARNING
if !output.contains(&term.translation) {
    ui.mark_row_yellow(line_id);
}
```

**Result:** Human catches errors immediately, fixes them, locks the line.

<br/>

## `> installation`

```bash
# Prerequisites
# 1. Install Rust (https://rustup.rs/)
# 2. Install Node.js 18+ (https://nodejs.org/)
# 3. Install Ollama (https://ollama.ai/) and pull a model:
ollama pull qwen2.5:7b

# Clone repository
git clone https://github.com/takaokensei/kotodama.git
cd kotodama

# Install dependencies
npm install
cd src-tauri && cargo build --release && cd ..

# Run in development mode
npm run tauri dev

# Build production binary
npm run tauri build
```

<br/>

## `> current_development_phase`

<div align="center">

### 🟢 **Phase 1: The Skeleton** (Complete)

| Task | Status |
|------|--------|
| Tauri v2 Scaffold | ✅ |
| `.srt/.ass` Parser | ✅ |
| Virtual List UI | ✅ |
| Unit Tests | ✅ |

### 🟡 **Phase 2: The Brain** (In Progress)

| Task | Status |
|------|--------|
| Ollama Integration | 🚧 |
| Batching Logic | 🚧 |
| Context-Aware Prompts | ⏳ |
| Cancel/Resume | ⏳ |

### 🔵 **Phase 3: The Guardrails** (Planned)

| Task | Status |
|------|--------|
| Glossary System | 📋 |
| Circuit Breaker | 📋 |
| Video Export | 📋 |
| Translation Memory | 📋 |

</div>

<br/>

## `> performance_benchmarks`

**Reference Hardware:** Intel i5-8th gen / Apple M1 / Ryzen 5 3600 + 16GB RAM

| Operation | Target | Current |
|-----------|--------|---------|
| Parse 400 lines (.srt) | < 200ms | ✅ 180ms |
| Parse 400 lines (.ass) | < 500ms | ✅ 420ms |
| Render 10k virtual rows | 60fps | ✅ 60fps |
| Ollama batch (10 lines) | < 5s | 🚧 Testing |

<br/>

## `> why_kotodama`

<table align="center">
<tr>
<td width="50%">
<h3>❌ Traditional Tools (Aegisub + DeepL)</h3>

- DeepL API costs $25/month (500k chars)
- No terminology enforcement
- Cloud-dependent (privacy risk)
- Manual copy-paste workflow
- No translation memory

</td>
<td width="50%">
<h3>✅ Kotodama (Sovereign AI)</h3>

- 100% local (Ollama models)
- Glossary with morphology validation
- Zero cloud dependencies
- Edit-in-place with AI assist
- Built-in TM + RAG

</td>
</tr>
</table>

<br/>

## `> contributing`

```rust
// Contributions welcome! Priority areas:
enum ContributionPriority {
    High,   // Parser optimization, Glossary morphology
    Medium, // UI/UX improvements, Translation Memory
    Low,    // Documentation, CI/CD
}

// How to contribute:
// 1. Fork the repo
// 2. Create feature branch: git checkout -b feat/amazing-feature
// 3. Follow Conventional Commits: git commit -m "feat: add DBSCAN clustering"
// 4. Push: git push origin feat/amazing-feature
// 5. Open Pull Request
```

<br/>

## `> license`

<div align="center">
  <img src="https://img.shields.io/badge/License-MIT-7aa2f7?style=for-the-badge"/>
  <br/><br/>
  <samp>Free to use, modify, and distribute. See <a href="LICENSE">LICENSE</a> for details.</samp>
</div>

<br/>

## `> contact`

<div align="center">
  
  <strong>Cauã Vitor Figueredo Silva (takaokensei)</strong>
  <br/>
  <samp>Creator & Maintainer</samp>
  <br/>
  <samp>Electrical Engineering Student @ UFRN</samp>
  
  <br/><br/>
  
  <a href="https://github.com/takaokensei">
    <img src="https://img.shields.io/badge/-GitHub-1a1b26?style=for-the-badge&logo=github&logoColor=c0caf5"/>
  </a>
  <a href="https://twitter.com/takaokensei">
    <img src="https://img.shields.io/badge/-Twitter-1a1b26?style=for-the-badge&logo=twitter&logoColor=7aa2f7"/>
  </a>
</div>

<br/>

## `> acknowledgments`

<div align="center">
  <samp>Built with ❤️ for the fansub community</samp>
  <br/>
  <samp>Inspired by years of manual subtitle editing pain</samp>
</div>

<br/>

<div align="center">
  <img src="https://img.shields.io/badge/Made_with-Rust_🦀-c0caf5?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/Powered_by-Tauri_v2-7aa2f7?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/Theme-Tokyo_Night-bb9af7?style=for-the-badge"/>
</div>

<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&color=1a1b26&height=100&section=footer"/>
