import type { KnowledgeFileType } from "@askwell/shared";
import { extractText as extractPdfText } from "unpdf";
import { KnowledgeProcessingError } from "./errors";

/**
 * Cap on the text one source may have, in characters, after normalizing (counted as JS
 * string length, i.e. UTF-16 code units).
 *
 * 300,000 characters is about 150 dense PDF pages, or six times the pasted-text limit
 * (KNOWLEDGE_TEXT_MAX_LENGTH, 50,000). It bounds each source to about 350 chunks
 * (CHUNK_MAX_CHARS with CHUNK_OVERLAP_CHARS), about 100,000 embedding tokens, so a 10 MB
 * PDF can't run up an unbounded embedding bill. With text-embedding-3-small that is about
 * $0.002 per source; a Pro project's 25 sources stay under 9,000 chunks, which keeps
 * match_chunks's exact per-project scan small. Over the cap, the source fails with
 * `text_too_long`; nothing is embedded.
 */
export const MAX_EXTRACTED_TEXT_CHARS = 300_000;

/**
 * Clean extracted or pasted text for chunking and storage:
 * - line breaks become `\n`
 * - control characters go (Postgres text can't hold NUL), except `\n`
 * - tabs, no-break and other spaces become one plain space; runs of spaces collapse
 * - each line is trimmed
 * - three or more line breaks become a blank line (`\n\n`), the paragraph break
 */
export function normalizeText(text: string): string {
  return (
    text
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g, " ")
      .replace(/ {2,}/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Throws `no_text` if the text is empty, `text_too_long` if it is over the cap. */
export function checkTextSize(text: string): void {
  if (text.length === 0) throw new KnowledgeProcessingError("no_text", "No text found");
  if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
    throw new KnowledgeProcessingError(
      "text_too_long",
      `Text is ${text.length} characters; the limit is ${MAX_EXTRACTED_TEXT_CHARS}`,
    );
  }
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/**
 * The normalized text of a knowledge file. PDF via unpdf; Markdown and TXT decoded as UTF-8
 * (Markdown stays as written). Throws a KnowledgeProcessingError: `unreadable` if the file
 * can't be decoded, `no_text` if nothing is left, `text_too_long` over the cap.
 */
export async function extractText(type: KnowledgeFileType, bytes: Uint8Array): Promise<string> {
  let raw: string;
  if (type === "pdf") {
    try {
      // pdf.js may take over (detach) the buffer it is given, so it gets a copy.
      const { text } = await extractPdfText(bytes.slice(), { mergePages: true });
      raw = text;
    } catch {
      throw new KnowledgeProcessingError("unreadable", "The PDF could not be read");
    }
  } else {
    try {
      raw = utf8.decode(bytes);
    } catch {
      throw new KnowledgeProcessingError("unreadable", "The file is not UTF-8 text");
    }
  }

  const text = normalizeText(raw);
  checkTextSize(text);
  return text;
}
