// LangGraph flow for orchestrating LLM-only summaries and analysis
import { analyzeWithGemini } from './geminiClient.js';
import { analyzeWithOllama } from './ollamaClient.js';
import { StateGraph, START, END } from '@langchain/langgraph';

// State schema: { type, text, provider, model, prompt, summaryPrompt, summary, analysis }

function buildGraph() {
  const graph = new StateGraph({
    channels: {
      type: null,
      text: null,
      provider: null,
      model: null,
      prompt: null,
      summaryPrompt: null,
      summary: null,
      analysis: null,
    },
  });

  // Prepare prompts (no local parsing; ask LLM for JSON summary)
  graph.addNode('prepare', async (state) => {
    const { type, text } = state;
    let prompt;
    let summaryPrompt;
    switch (type) {
      case 'jstack':
        prompt = `You are a senior JVM performance engineer. Analyze this Java thread dump (jstack). Provide hotspots, blocked threads, deadlocks, and remediation steps.\n\n${text}`;
        summaryPrompt = `You are a precise data extractor. From this jstack thread dump, output ONLY a compact JSON object with this exact shape and keys:\n{\n  "type": "jstack",\n  "totalThreads": number,\n  "byState": {"RUNNABLE": number, "BLOCKED": number, "WAITING": number, "TIMED_WAITING": number},\n  "blockedByMonitor": number\n}\nRules: No explanation. No markdown fences. Numbers only.\n\nDump:\n${text}`;
        break;
      case 'jmap':
        prompt = `You are a senior JVM memory analyst. Analyze this Java heap histogram (jmap -histo). Identify memory leaks, large objects, and GC tuning suggestions.\n\n${text}`;
  summaryPrompt = `You are a precise data extractor. From this jmap -histo output, output ONLY a JSON object with EXACT keys and types:\n{\n  "type": "jmap",\n  "totalBytes": number,\n  "topByBytes": [{"className": string, "bytes": number, "instances": number}]\n}\nRules:\n- Parse only histogram rows (ignore headers like \"num #instances #bytes class name\" and footers like \"Total\").\n- Sort topByBytes by bytes desc and include up to 10 entries.\n- Use full class names as-is.\n- Numbers only (no commas), no extra keys, no markdown.\n\nData:\n${text}`;
        break;
      case 'flame':
        prompt = `You are a senior performance profiler. Analyze this CPU flame graph (folded stacks). Summarize top hot paths, potential bottlenecks, and code areas to optimize.\n\n${text}`;
        summaryPrompt = `You are a precise data extractor. From these folded stacks, output ONLY a JSON object:\n{\n  "type": "flame",\n  "totalSamples": number,\n  "topFunctions": [{"name": string, "samples": number}]\n}\nConstraints: topFunctions up to 10 entries sorted by samples desc. No markdown.\n\nData:\n${text}`;
        break;
      default:
        throw new Error('Unknown type: ' + type);
    }
    return { prompt, summaryPrompt };
  });

  // Summarize to JSON via selected LLM
  graph.addNode('summarize', async (state) => {
    const provider = (state.provider || process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const model = chooseModel(provider, state.model);
    const llmCall = provider === 'ollama' ? analyzeWithOllama : analyzeWithGemini;
  const raw = await llmCall(state.summaryPrompt, model);
  let summary = normalizeSummary(safeJson(raw));
    // If jmap extraction failed or is empty, run a stricter refinement
    if (state.type === 'jmap' && (!summary || !Array.isArray(summary.topByBytes) || summary.topByBytes.length === 0)) {
      const refined = await refineJmapSummary(state.text, llmCall, model);
      if (refined) summary = normalizeSummary(refined);
    }
    // If still empty for jmap, try providing pre-cleaned histogram rows to the LLM
    if (state.type === 'jmap' && (!summary || !Array.isArray(summary.topByBytes) || summary.topByBytes.length === 0)) {
      const rows = extractJmapRows(state.text);
      if (rows.length) {
        const refinedFromRows = await refineJmapFromRows(rows, llmCall, model);
        if (refinedFromRows) summary = normalizeSummary(refinedFromRows);
        // Last-resort local fallback to avoid empty charts if LLM still fails
        if (!summary || !Array.isArray(summary.topByBytes) || summary.topByBytes.length === 0) {
          const top = rows
            .map(r => ({ className: r.className, bytes: Number(String(r.bytes).replace(/,/g, '')) || 0, instances: Number(String(r.instances).replace(/,/g, '')) || 0 }))
            .sort((a,b)=> b.bytes - a.bytes)
            .slice(0, 10);
          summary = { type: 'jmap', totalBytes: top.reduce((s,x)=>s+x.bytes,0), topByBytes: top };
        }
      }
    }
    // If still missing totalBytes but topByBytes present, compute it for convenience
    if (state.type === 'jmap' && summary && Array.isArray(summary.topByBytes) && summary.topByBytes.length > 0 && (summary.totalBytes == null || Number.isNaN(Number(summary.totalBytes)))) {
      summary.totalBytes = summary.topByBytes.reduce((s, it) => s + (Number(it.bytes) || 0), 0);
    }
    return { summary };
  });

  // Analyze (prose) via selected LLM
  graph.addNode('analyze', async (state) => {
    const provider = (state.provider || process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const model = chooseModel(provider, state.model);
    const llmCall = provider === 'ollama' ? analyzeWithOllama : analyzeWithGemini;
    const analysis = await llmCall(state.prompt, model);
    return { analysis };
  });

  graph.addEdge(START, 'prepare');
  graph.addEdge('prepare', 'summarize');
  graph.addEdge('summarize', 'analyze');
  graph.addEdge('analyze', END);

  return graph.compile();
}

function safeJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch {}
  const m = String(s).match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

const app = buildGraph();

function normalizeSummary(summary) {
  if (!summary || typeof summary !== 'object') return summary;
  const t = summary.type;
  try {
    if (t === 'jstack') {
      if (summary.totalThreads != null) summary.totalThreads = Number(summary.totalThreads) || 0;
      if (summary.blockedByMonitor != null) summary.blockedByMonitor = Number(summary.blockedByMonitor) || 0;
      if (summary.byState && typeof summary.byState === 'object') {
        for (const k of Object.keys(summary.byState)) {
          summary.byState[k] = Number(summary.byState[k]) || 0;
        }
      }
    } else if (t === 'jmap') {
      if (summary.totalBytes != null) summary.totalBytes = Number(String(summary.totalBytes).replace(/,/g, '')) || 0;
      if (Array.isArray(summary.topByBytes)) {
        summary.topByBytes = summary.topByBytes
          .map(it => ({
            className: String(it.className || ''),
            bytes: Number(String(it.bytes).replace(/,/g, '')) || 0,
            instances: Number(String(it.instances).replace(/,/g, '')) || 0,
          }))
          .sort((a,b) => b.bytes - a.bytes)
          .slice(0, 10);
      }
    } else if (t === 'flame') {
      if (summary.totalSamples != null) summary.totalSamples = Number(summary.totalSamples) || 0;
      if (Array.isArray(summary.topFunctions)) {
        summary.topFunctions = summary.topFunctions.map(it => ({
          name: String(it.name || ''),
          samples: Number(it.samples) || 0,
        }));
      }
    }
  } catch {}
  return summary;
}

function chooseModel(provider, override) {
  const p = (provider || '').toLowerCase();
  if (p === 'ollama') {
    return override || process.env.OLLAMA_MODEL || 'llama3';
  }
  return override || process.env.GEMINI_MODEL || 'gemini-1.5-pro';
}

export async function analyzeFile(type, text, { provider, model } = {}) {
  const out = await app.invoke({ type, text, provider, model });
  return { parsed: null, summary: out.summary, analysis: out.analysis };
}

async function refineJmapSummary(text, llmCall, model) {
  const refinePrompt = `Output ONLY JSON with EXACT keys and types, no markdown:
{
  "type": "jmap",
  "totalBytes": number,
  "topByBytes": [{"className": string, "bytes": number, "instances": number}]
}
Instructions:
- Consider lines matching the histogram row shape, typically: "<rank>: <instances> <bytes> <class name>".
- Remove commas from numbers. Ignore header/footer lines. Use full class names.
- Sort topByBytes by bytes desc; include up to 10.

Data:
${text}`;
  const raw = await llmCall(refinePrompt, model);
  return safeJson(raw);
}

function extractJmapRows(text) {
  const rows = [];
  const lines = String(text).split(/\r?\n/);
  for (const line of lines) {
    // matches: rank: instances bytes class [optional (module)]
    const m = line.match(/^\s*\d+:\s+([\d,]+)\s+([\d,]+)\s+(.+?)\s*(?:\([^)]*\)\s*)?$/);
    if (!m) continue;
    const instances = m[1];
    const bytes = m[2];
    const cls = m[3];
    // Ignore obvious header/footer anomalies
    if (/^num\b/i.test(line) || /^total\b/i.test(cls)) continue;
    rows.push({ instances, bytes, className: cls.trim() });
  }
  return rows;
}

async function refineJmapFromRows(rows, llmCall, model) {
  const list = rows.map(r => `${String(r.instances).replace(/,/g,'')} ${String(r.bytes).replace(/,/g,'')} ${r.className}`).join('\n');
  const prompt = `Output ONLY JSON with EXACT keys and types, no markdown:
{
  "type": "jmap",
  "totalBytes": number,
  "topByBytes": [{"className": string, "bytes": number, "instances": number}]
}
Instructions:
- Use the provided histogram rows only (format: "<instances> <bytes> <class>").
- Sort by bytes desc; include up to 10 entries.
- Numbers only (no commas). Use class as-is.

Rows:
${list}`;
  const raw = await llmCall(prompt, model);
  return safeJson(raw);
}
