import OpenAI from "openai";
import { getLlmSettings } from "./settings";
import { COURSE_EMBEDDING_DIMENSIONS } from "@/lib/db/schema";

// Anthropic has no public embeddings endpoint, so course-catalog embeddings
// always go through OpenAI regardless of the chosen chat provider.
export const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dims

export class EmbeddingsNotConfiguredError extends Error {
  constructor() {
    super(
      "No OpenAI API key configured. Add one on the AI Settings page to enable course-catalog matching.",
    );
    this.name = "EmbeddingsNotConfiguredError";
  }
}

async function getOpenAiKeyOrThrow(): Promise<string> {
  const settings = await getLlmSettings();
  if (!settings.openaiApiKey) throw new EmbeddingsNotConfiguredError();
  return settings.openaiApiKey;
}

const BATCH_SIZE = 100;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = await getOpenAiKeyOrThrow();
  const client = new OpenAI({ apiKey });

  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: COURSE_EMBEDDING_DIMENSIONS,
    });
    for (const d of res.data) results.push(d.embedding);
  }
  return results;
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
