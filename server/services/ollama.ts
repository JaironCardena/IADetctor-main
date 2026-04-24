import { env } from '../config/env';

export type OllamaMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await promise;
  } finally {
    clearTimeout(timeout);
  }
}

export async function listOllamaModels() {
  const response = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`, {
    headers: { 'ngrok-skip-browser-warning': 'true' }
  });
  if (!response.ok) {
    throw new Error(`No se pudo listar modelos de Ollama: ${response.status}`);
  }
  return response.json();
}

/**
 * Send a single prompt to Ollama and return the response text.
 */
async function callOllama(prompt: { system: string; user: string }): Promise<string> {
  const messages: OllamaMessage[] = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user }
  ];

  const body = {
    model: env.OLLAMA_MODEL,
    messages,
    stream: false,
    options: {
      temperature: 0.88,
      top_p: 0.9,
      top_k: 50,
      repeat_penalty: 1.18,
      repeat_last_n: 192,
      frequency_penalty: 0.3,
      presence_penalty: 0.25,
      num_predict: 8192,
    }
  };

  const fetchPromise = fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true'
    },
    body: JSON.stringify(body)
  });

  // Per-chunk timeout: 3 minutes should be enough for ~2000 chars
  const response = await withTimeout(fetchPromise, env.OLLAMA_TIMEOUT_MS);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error de Ollama (${response.status}): ${text}`);
  }

  const data = await response.json() as {
    message?: { content?: string };
    done?: boolean;
  };

  const raw = (data.message?.content || '').trim();
  return postProcess(raw);
}

/**
 * Clean up common LLM output issues.
 */
function postProcess(text: string): string {
  let cleaned = text;

  // Remove model refusal messages (lines where the model refuses to rewrite)
  const refusalPatterns = [
    /^(Lo siento|No puedo|Me disculpo|Lamento|Disculpa).*(solicitud|cumplir|generar|ilegal|prohibido|Turnitin|GPTZero|detector|IA).*/gmi,
    /^\?(Puedo|Qué prefieres|Me dirijo).*/gmi,
    /^(Si deseas|En lugar podemos|En cambio si).*/gmi,
    /^\d+[-)].*(proporcion|cambio si prefieres).*/gmi,
    /^Es posible que el texto haya perdido.*/gmi,
    /^Nota:.*/gmi,
  ];

  for (const pattern of refusalPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove excessive blank lines left after removing refusals
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Split text into chunks at paragraph boundaries.
 * Each chunk is approximately `maxChars` characters, but never splits a paragraph.
 */
function splitIntoChunks(text: string, maxChars: number = 2500): string[] {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // If adding this paragraph would exceed the limit, save current chunk and start new one
    if (current.length > 0 && (current.length + trimmed.length + 2) > maxChars) {
      chunks.push(current.trim());
      current = trimmed;
    } else {
      current += (current ? '\n\n' : '') + trimmed;
    }
  }

  // Don't forget the last chunk
  if (current.trim()) {
    chunks.push(current.trim());
  }

  // If we got no chunks (single block of text without paragraph breaks), split by sentences
  if (chunks.length === 1 && chunks[0].length > maxChars) {
    return splitBySentences(chunks[0], maxChars);
  }

  return chunks.length > 0 ? chunks : [text];
}

/**
 * Fallback: split by sentences when there are no paragraph breaks.
 */
function splitBySentences(text: string, maxChars: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length > 0 && (current.length + sentence.length) > maxChars) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Humanize text with Ollama. For long texts, automatically splits into chunks,
 * processes each one sequentially, and concatenates the results.
 */
export async function humanizeWithOllama(
  prompt: string | { system: string; user: string },
  onProgress?: (current: number, total: number) => void
): Promise<string> {
  // Legacy string prompt support
  if (typeof prompt === 'string') {
    return callOllama({ system: '', user: prompt });
  }

  // Extract the original text from the user prompt to check its length
  // The user prompt wraps the text between ─── markers
  const textMatch = prompt.user.match(/───+\n([\s\S]*?)\n───+/);
  const originalText = textMatch ? textMatch[1] : '';

  // If the text is short enough, process it in one shot
  const CHUNK_THRESHOLD = 3000; // ~1.5 pages
  if (originalText.length <= CHUNK_THRESHOLD) {
    onProgress?.(1, 1);
    return callOllama(prompt);
  }

  // Split into chunks and process each one
  const chunks = splitIntoChunks(originalText, 2500);
  console.log(`Humanizando ${chunks.length} fragmentos (${originalText.length} caracteres total)`);

  const results: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkNum = i + 1;
    console.log(`  Fragmento ${chunkNum}/${chunks.length} (${chunks[i].length} chars)...`);
    onProgress?.(chunkNum, chunks.length);

    // Build a new user prompt with just this chunk, keeping the same system prompt
    const chunkUserPrompt = prompt.user.replace(
      /───+\n[\s\S]*?\n───+/,
      `───────────────────\n${chunks[i]}\n───────────────────`
    );

    const chunkPrompt = { system: prompt.system, user: chunkUserPrompt };
    const result = await callOllama(chunkPrompt);
    results.push(result);

    console.log(`  Fragmento ${chunkNum}/${chunks.length} completado (${result.length} chars)`);
  }

  return results.join('\n\n');
}
