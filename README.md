# JVM-LLM-Lens
This code repo uses LLM to get insight from JStack, JMap etc

Analyze `jstack`, `jmap`, and flame graph files using an LLM (Gemini or Ollama) via LangGraph in Node.js. Parsing is LLM-only; local regex parsers are deprecated.

## Overview & purpose
This repository explores how Large Language Models can accelerate JVM diagnostics workflows without writing brittle parsers. You upload raw JVM artifacts (thread dumps, heap histograms, folded flame stacks), and the app:
- extracts structured metrics via LLM prompts (strict JSON),
- visualizes the results (thread-state pie, top classes by bytes, top hot functions), and
- produces a narrative analysis (findings + actions).

It’s designed for quick triage and knowledge transfer in teams that may not be JVM experts, and for scenarios where formats vary across Java versions and tools.

## Architecture at a glance
- UI (React + Material UI + Recharts): file upload, provider/model selection, charts & analysis.
- API (Express): receives files, invokes the LangGraph flow.
- LangGraph flow:
   1) Summary step: prompt the LLM for strict JSON only.
   2) Analysis step: prompt the LLM for prose insights.
- LLM providers: Gemini (cloud) or Ollama (local). Numbers are normalized for charts.

## Data flow per artifact
- jstack (Java thread dump)
   - JSON schema requested:
      - type: "jstack"
      - totalThreads: number
      - byState: { RUNNABLE, BLOCKED, WAITING, TIMED_WAITING }
      - blockedByMonitor: number
   - Chart: thread-state distribution; Quick summary shows totals.

- jmap -histo (Heap histogram)
   - JSON schema requested:
      - type: "jmap"
      - totalBytes: number
      - topByBytes: [{ className, bytes, instances }] (sorted desc, max 10)
   - Robustness: retries with stricter prompt; removes commas; computes total if missing.
   - Chart: Top classes by bytes.

- Flame (folded stacks)
   - JSON schema requested:
      - type: "flame"
      - totalSamples: number
      - topFunctions: [{ name, samples }] (sorted desc, max 10)
   - Chart: Top leaf functions by samples.

## Why LLM‑only?
JVM tool outputs differ by version, flags, vendors, and even locales. Regex parsers become brittle quickly. LLM-only extraction with strict JSON prompts trades some determinism for adaptability and faster iteration. We normalize numbers and sort client-side to stabilize charts.

## Accuracy and limitations
- The LLM can misread malformed inputs; we mitigate with strict prompts, JSON validation, and numeric normalization.
- For jmap, a stricter retry is used if the first pass is empty. As a last resort, a minimal top list is computed to avoid blank charts.
- Narrative analysis quality depends on the chosen model.

## Privacy & storage
- Files are read for the request and not stored long-term by the app.
- With Gemini, content leaves your machine; with Ollama, processing remains local (subject to your Ollama configuration).
   Choose the provider that matches your privacy needs.

## Typical use cases
- Quick triage of production incidents (hung threads, blocked monitors, memory spikes)
- Postmortems and reports with ready-to-share visuals
- Developer onboarding to JVM diagnostics



## Features
- Upload jstack/jmap/flame files and see analysis plus charts (Material UI + Recharts)
- Choose LLM provider: Gemini (cloud) or Ollama (local)
- Strict JSON summaries for charts (thread states, top classes by bytes, top functions)
- Provider/model selection with per-run override in the UI


## Setup & Initialization

1. **Install dependencies:**
   ```sh
   npm install
   ```

2. **Set your Gemini API key in `.env`:**
   ```
   GEMINI_API_KEY=your-gemini-api-key-here
   ```

   Optional provider defaults:
   ```
   # LLM_PROVIDER=gemini  # or ollama
   # GEMINI_MODEL=gemini-1.5-pro
   # OLLAMA_MODEL=llama3
   # OLLAMA_HOST=http://localhost:11434
   ```

## Running the Project

### CLI Usage

Analyze a file from the command line:
```sh
node src/index.js <type> <file>
```
- `<type>`: `jstack`, `jmap`, or `flame`
- `<file>`: Path to the file to analyze

Example:
```sh
node src/index.js jstack ./example.jstack
```

### Web UI Usage

1. **Start the backend server:**
   ```sh
   npm run server
   ```
   This serves the UI and API at [http://localhost:3000](http://localhost:3000).

2. **(Optional) For hot-reloading UI during development:**
   ```sh
   npm run ui
   ```
   Then open [http://localhost:3000](http://localhost:3000) in your browser.

3. **Upload your files (jstack, jmap, flame graph) and view the analysis and charts.**

## Project Structure
- `src/llm/`: LLM clients and LangGraph flow (LLM-only extraction + analysis)
- `src/ui/`: React-based web UI
- `server.js`: Express server for API and static UI
- `src/index.js`: CLI entry point

---
Notes:
- Provider selection: choose between Gemini and Ollama in the UI. Models can be overridden per-run.
- Ensure GEMINI_API_KEY for Gemini or pull a local model (e.g., `llama3`) for Ollama.
- The app requests strict JSON summaries from the LLM and normalizes numbers for charts.

## Troubleshooting
- Ollama model not found / 500 error: ensure Ollama is running and pull the model, e.g., `ollama pull llama3`.
- Sent Gemini model to Ollama: switch Provider to Gemini or set an Ollama model name.
- Gemini key missing: set `GEMINI_API_KEY` in `.env`. Optionally set `GEMINI_MODEL`.
- Empty jmap chart: the backend retries with stricter prompts and normalizes numbers; if still empty, share a histogram snippet to refine prompts.
