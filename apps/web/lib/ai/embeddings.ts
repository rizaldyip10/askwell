import "server-only";

import { getOpenAI } from "./client";

/** Embedding model for knowledge chunks and questions (project.md §3). */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/** OpenAI's embeddings limits: at most 2048 inputs and 300,000 tokens per request. */
export const MAX_INPUTS_PER_REQUEST = 2048;
/**
 * Character budget per request. A token is at least one character, so 300,000 characters
 * can never exceed the 300,000-token limit, whatever the language.
 */
export const MAX_CHARS_PER_REQUEST = 300_000;

/** Split texts into request-sized batches, keeping order. A text over the budget goes alone. */
export function batchTexts(texts: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let chars = 0;

  for (const text of texts) {
    const full = current.length >= MAX_INPUTS_PER_REQUEST || chars + text.length > MAX_CHARS_PER_REQUEST;
    if (current.length > 0 && full) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(text);
    chars += text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Embed texts with {@link EMBEDDING_MODEL}. Returns one vector per text, in input order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const openai = getOpenAI();
  const out: number[][] = [];

  for (const batch of batchTexts(texts)) {
    const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: batch, encoding_format: "float" });
    if (res.data.length !== batch.length) {
      throw new Error(`Embeddings: expected ${batch.length} vectors, got ${res.data.length}`);
    }
    // Each item carries its input index; sort on it rather than trusting response order.
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) out.push(item.embedding);
  }
  return out;
}

/** Embed one text. */
export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  if (!vector) throw new Error("Embeddings: no vector returned");
  return vector;
}
