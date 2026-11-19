import { describe, expect, it } from "vitest";
import { CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS, chunkText } from "./chunk";

/** A sentence of about `length` characters, numbered so each one is unique. */
const sentence = (n: number, length = 120) => {
  const base = `Sentence ${n} talks about topic ${n} in some detail`;
  return `${base}${" and more words".repeat(Math.max(0, Math.ceil((length - base.length - 1) / 15)))}.`;
};

const paragraph = (from: number, count: number, length?: number) =>
  Array.from({ length: count }, (_, i) => sentence(from + i, length)).join(" ");

/** Length of the longest prefix of `next` (up to the overlap size) that ends `prev`. */
function overlapLength(prev: string, next: string): number {
  for (let k = Math.min(CHUNK_OVERLAP_CHARS, next.length); k > 0; k--) {
    if (prev.endsWith(next.slice(0, k))) return k;
  }
  return 0;
}

describe("chunkText", () => {
  it("returns one chunk for short text, and none for empty text", () => {
    expect(chunkText("Short answer.")).toEqual(["Short answer."]);
    expect(chunkText("")).toEqual([]);
    expect(chunkText("\n\n  \n\n")).toEqual([]);
  });

  it("keeps paragraphs that fit together in one chunk", () => {
    const text = "First paragraph.\n\nSecond paragraph.\n\nThird.";
    expect(chunkText(text)).toEqual([text]);
  });

  it("never makes a chunk longer than CHUNK_MAX_CHARS", () => {
    const text = [paragraph(0, 30), paragraph(30, 3, 900), "x".repeat(2500), paragraph(40, 12, 400)].join("\n\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });

  it("splits at a paragraph boundary when the next paragraph doesn't fit", () => {
    const p1 = paragraph(0, 5); // ~600 chars
    const p2 = paragraph(10, 5);
    const [first, second, ...rest] = chunkText(`${p1}\n\n${p2}`);
    expect(rest).toEqual([]);
    expect(first).toBe(p1);
    expect(second?.endsWith(p2)).toBe(true);
  });

  it("splits a long paragraph at sentence ends", () => {
    const text = paragraph(0, 25); // ~3,000 chars, one paragraph
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const chunk of chunks) expect(chunk.endsWith(".")).toBe(true);
  });

  it("starts each chunk with up to CHUNK_OVERLAP_CHARS from the end of the one before, on a word boundary", () => {
    const chunks = chunkText(paragraph(0, 25));
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]!;
      const k = overlapLength(prev, chunks[i]!);
      expect(k, `chunk ${i}`).toBeGreaterThan(CHUNK_OVERLAP_CHARS / 2);
      expect(k, `chunk ${i}`).toBeLessThanOrEqual(CHUNK_OVERLAP_CHARS);
      // The overlap starts at a word: the character before it in the previous chunk is a space.
      expect(prev.charAt(prev.length - k - 1), `chunk ${i}`).toBe(" ");
    }
  });

  it("loses no sentence: every sentence is whole in some chunk", () => {
    const sentences = Array.from({ length: 40 }, (_, i) => sentence(i, 60 + ((i * 37) % 300)));
    const text = [sentences.slice(0, 15).join(" "), sentences.slice(15, 22).join(" "), sentences.slice(22).join(" ")].join(
      "\n\n",
    );
    const chunks = chunkText(text);
    for (const s of sentences) expect(chunks.some((c) => c.includes(s)), s.slice(0, 20)).toBe(true);
  });

  it("splits a sentence longer than a chunk at word boundaries", () => {
    const words = Array.from({ length: 400 }, (_, i) => `word${i}`);
    const chunks = chunkText(words.join(" "));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      for (const w of chunk.split(" ")) expect(words).toContain(w);
    }
    expect(chunks.at(-1)?.endsWith("word399")).toBe(true);
  });

  it("slices a single word longer than a chunk, without splitting a surrogate pair", () => {
    const emoji = "😀".repeat(1200); // 2,400 UTF-16 units, no spaces
    const chunks = chunkText(emoji);
    expect(chunks.join("")).toBe(emoji);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      expect(chunk).toMatch(/^(😀)+$/u);
    }
  });

  it("is deterministic", () => {
    const text = [paragraph(0, 20), paragraph(20, 20)].join("\n\n");
    expect(chunkText(text)).toEqual(chunkText(text));
  });
});
