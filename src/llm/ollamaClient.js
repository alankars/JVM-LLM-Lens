import dotenv from 'dotenv';
dotenv.config();

// Use the official 'ollama' client (default export provides .generate/.chat APIs)
import ollama from 'ollama';

const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'; // library reads env; value shown for diagnostics

export async function analyzeWithOllama(prompt, model) {
  const useModel = model || DEFAULT_OLLAMA_MODEL;
  try {
  const res = await ollama.generate({ model: useModel, prompt });
    // The client returns { response: string, ... }
    return res?.response || '';
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
  throw new Error(`Ollama call failed (model=${useModel}, host=${OLLAMA_HOST}). Ensure Ollama is running and the model is pulled (e.g., 'ollama pull ${useModel}'). Original error: ${msg}`);
  }
}
