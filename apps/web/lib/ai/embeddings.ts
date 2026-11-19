import "server-only";

import { getOpenAI } from "./client";

/** Embedding model for knowledge chunks and questions (project.md §3). */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

/** OpenAI's embeddings limits: at most 2048 inputs and 300,000 tokens per request. */
export const MAX_INPUTS_PER_REQUEST = 2048;
/**
 * UTF-8 byte budget per request. The model's tokenizer (cl100k_base) is byte-level BPE, so every
 * token covers at least one UTF-8 byte. 300,000 bytes can never exceed the 300,000-token limit,
 * whatever the language. (A character budget can't promise that: one multibyte character can
 * become several tokens.)
 */
export const MAX_BYTES_PER_REQUEST = 300_000;

const utf8 = new TextEncoder();

/** UTF-8 length of a string, an upper bound on its cl100k_base token count. */
export function utf8Bytes(text: string): number {
  return utf8.encode(text).length;
}

/** Split texts into request-sized batches, keeping order. A text over the budget goes alone. */
export function batchTexts(texts: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let bytes = 0;

  for (const text of texts) {
    const size = utf8Bytes(text);
    const full = current.length >= MAX_INPUTS_PER_REQUEST || bytes + size > MAX_BYTES_PER_REQUEST;
    if (current.length > 0 && full) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(text);
    bytes += size;
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
