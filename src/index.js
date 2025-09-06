// Entry point for CLI usage
import fs from 'fs';
import path from 'path';
import { analyzeFile } from './llm/langGraphFlow.js';

function printUsage() {
  console.log('Usage: node src/index.js <type> <file>');
  console.log('  <type>: jstack | jmap | flame');
  console.log('  <file>: path to the file to analyze');
}

async function main() {
  const [,, type, filePath] = process.argv;
  if (!type || !filePath) {
    printUsage();
    process.exit(1);
  }
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error('File not found:', absPath);
    process.exit(1);
  }
  const text = fs.readFileSync(absPath, 'utf-8');
  try {
    const result = await analyzeFile(type, text);
  console.log('--- Summary (LLM) ---');
  console.dir(result.summary, { depth: 5 });
  console.log('\n--- Analysis (LLM) ---');
    console.log(result.analysis);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
