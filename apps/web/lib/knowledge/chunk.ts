/**
 * Chunk size, in characters. About 250 tokens of English, small enough that the top 5
 * chunks (§6.6) stay focused on the question, and large enough to keep a paragraph or two
 * of context together.
 */
export const CHUNK_MAX_CHARS = 1000;

/**
 * Characters each chunk repeats from the end of the one before (at most; it starts on a
 * word boundary, so usually a little less). A fact that straddles a boundary still lands
 * whole in one chunk.
 */
export const CHUNK_OVERLAP_CHARS = 150;

/** A piece of text that is kept whole when possible, with what joins it to the piece before. */
type Unit = { text: string; sep: string };

/**
 * Split normalized text (see normalizeText) into chunks of at most CHUNK_MAX_CHARS.
 *
 * Splits at the largest boundary that fits: paragraphs (blank lines), then sentences, then
 * words, and only cuts inside a word when one word alone is over the limit. Pieces are
 * packed greedily into chunks. Each chunk after the first starts with up to
 * CHUNK_OVERLAP_CHARS from the end of the one before, cut at a word boundary. Chunks are
 * trimmed; empty ones are dropped. Pure: same text, same chunks.
 */
export function chunkText(text: string): string[] {
  const units = splitUnits(text);
  const chunks: string[] = [];
  let current = "";

  for (const unit of units) {
    if (current === "") {
      current = unit.text;
      continue;
    }
    const joined = current + unit.sep + unit.text;
    if (joined.length <= CHUNK_MAX_CHARS) {
      current = joined;
      continue;
    }
    chunks.push(current);
    // Start the next chunk with the overlap, shortened if it and the unit don't fit together.
    const room = CHUNK_MAX_CHARS - unit.text.length - 1;
    const overlap = room > 0 ? overlapTail(current, Math.min(CHUNK_OVERLAP_CHARS, room)) : "";
    current = overlap ? `${overlap} ${unit.text}` : unit.text;
  }
  if (current !== "") chunks.push(current);

  return chunks.map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 0);
}

/** Paragraphs, split further into sentences, words or slices until each fits in a chunk. */
function splitUnits(text: string): Unit[] {
  const units: Unit[] = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    const pieces = trimmed.length <= CHUNK_MAX_CHARS ? [trimmed] : splitParagraph(trimmed);
    pieces.forEach((piece, i) => units.push({ text: piece, sep: i === 0 ? "\n\n" : " " }));
  }
  return units;
}

/** A long paragraph as sentence-sized pieces, each at most CHUNK_MAX_CHARS. */
function splitParagraph(paragraph: string): string[] {
  // A sentence ends at . ! ? (optionally followed by closing quotes or brackets) before space.
  const sentences = paragraph.split(/(?<=[.!?…]["'”’)\]]?)\s+/);
  return sentences.flatMap((sentence) => (sentence.length <= CHUNK_MAX_CHARS ? [sentence] : splitWords(sentence)));
}

/** A long sentence as word-boundary pieces, each at most CHUNK_MAX_CHARS. */
function splitWords(sentence: string): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const word of sentence.split(/\s+/)) {
    if (word.length > CHUNK_MAX_CHARS) {
      if (current) pieces.push(current);
      current = "";
      pieces.push(...sliceLong(word));
      continue;
    }
    if (!current) current = word;
    else if (current.length + 1 + word.length <= CHUNK_MAX_CHARS) current += ` ${word}`;
    else {
      pieces.push(current);
      current = word;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Slice a string with no spaces into CHUNK_MAX_CHARS pieces, never splitting a surrogate pair. */
function sliceLong(word: string): string[] {
  const pieces: string[] = [];
  let start = 0;
  while (start < word.length) {
    let end = Math.min(start + CHUNK_MAX_CHARS, word.length);
    if (end < word.length && isHighSurrogate(word.charCodeAt(end - 1))) end -= 1;
    pieces.push(word.slice(start, end));
    start = end;
  }
  return pieces;
}

/** The last `max` characters or fewer of `text`, starting at a word boundary. */
function overlapTail(text: string, max: number): string {
  if (text.length <= max) return text;
  const tail = text.slice(text.length - max);
  // Already at a word start if the character before the tail is whitespace.
  if (/\s/.test(text.charAt(text.length - max - 1))) return tail.trim();
  const space = tail.search(/\s/);
  return space === -1 ? "" : tail.slice(space).trim();
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
