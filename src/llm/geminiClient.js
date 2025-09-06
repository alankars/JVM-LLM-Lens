// Gemini LLM client setup
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

// Use a supported model; allow override via env
const MODEL = process.env.GEMINI_MODEL || "gemini-1.5-pro";

export async function analyzeWithGemini(prompt, modelOverride) {
  try {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set in .env");
  const genAI = new GoogleGenerativeAI(apiKey);
  const chosen = modelOverride || MODEL;
  const model = genAI.getGenerativeModel({ model: chosen });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
  throw new Error(`Gemini call failed. Model: ${modelOverride || MODEL}. Tip: set GEMINI_MODEL or pass a model like 'gemini-1.5-pro' or 'gemini-1.5-flash'. Original error: ${msg}`);
  }
}
