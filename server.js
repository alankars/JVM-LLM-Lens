// Minimal Express server to serve UI and handle analysis API
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import cors from 'cors';
import { analyzeFile } from './src/llm/langGraphFlow.js';

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
const upload = multer({ dest: 'uploads/' });

app.use(express.static('src/ui'));

app.post('/api/analyze', upload.fields([
  { name: 'jstack', maxCount: 1 },
  { name: 'jmap', maxCount: 1 },
  { name: 'flame', maxCount: 1 },
]), async (req, res) => {
  try {
  const provider = (req.query.provider || req.body?.provider || process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const model = (req.query.model || req.body?.model || undefined);
    const results = {};
    for (const type of ['jstack', 'jmap', 'flame']) {
      const file = req.files[type]?.[0];
      if (file) {
        const text = await fs.readFile(file.path, 'utf-8');
    const result = await analyzeFile(type, text, { provider, model });
        results[type] = result;
      }
    }
    // Compose simple text summary for the textarea
    const textOut = Object.entries(results).map(([type, r]) => `--- ${type.toUpperCase()} ---\n${r.analysis}`).join('\n\n');
    res.json({ results, analysis: textOut });
  } catch (err) {
    const provider = (req.query.provider || req.body?.provider || process.env.LLM_PROVIDER || 'gemini');
    const hint = provider === 'ollama'
      ? 'Check Ollama is running and the model exists: install with `ollama pull <model>`.'
      : 'Check GEMINI_API_KEY and optionally set GEMINI_MODEL.';
    res.status(500).json({ error: err.message, hint });
  }
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
