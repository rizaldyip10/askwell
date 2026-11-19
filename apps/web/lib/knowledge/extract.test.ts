import { describe, expect, it } from "vitest";
import { KnowledgeProcessingError } from "./errors";
import { MAX_EXTRACTED_TEXT_CHARS, checkTextSize, extractText, normalizeText } from "./extract";
import { tinyPdf } from "./test-pdf";

const encode = (text: string) => new TextEncoder().encode(text);

/** The reason of the KnowledgeProcessingError `fn` rejects or throws with. */
async function reasonOf(fn: () => unknown): Promise<string> {
  try {
    await fn();
  } catch (error) {
    expect(error).toBeInstanceOf(KnowledgeProcessingError);
    return (error as KnowledgeProcessingError).reason;
  }
  throw new Error("expected a KnowledgeProcessingError");
}

describe("normalizeText", () => {
  it("unifies line breaks, collapses spaces, trims lines and keeps paragraph breaks", () => {
    const raw = "  Title\r\n\r\n\r\n\r\nFirst\tline  with   spaces \r\nsecond\u00a0line\n\n\nNext para  ";
    expect(normalizeText(raw)).toBe("Title\n\nFirst line with spaces\nsecond line\n\nNext para");
  });

  it("removes control characters Postgres can't store, like NUL", () => {
    expect(normalizeText("a\u0000b\u0007c\u001fd")).toBe("abcd");
  });

  it("returns an empty string for whitespace only", () => {
    expect(normalizeText(" \n\t\r\n ")).toBe("");
  });
});

describe("extractText", () => {
  it("reads the text of a PDF", async () => {
    const text = await extractText("pdf", tinyPdf(["Opening hours are 9 to 5.", "Refunds take 14 days."]));
    expect(text).toContain("Opening hours are 9 to 5.");
    expect(text).toContain("Refunds take 14 days.");
  });

  it("decodes Markdown as UTF-8 and keeps its syntax", async () => {
    const md = "# Shipping\r\n\r\n- Free over **€50**\n- Ships in 2 days 🚚\n";
    expect(await extractText("md", encode(md))).toBe("# Shipping\n\n- Free over **€50**\n- Ships in 2 days 🚚");
  });

  it("decodes TXT as UTF-8, dropping a byte-order mark", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...encode("Café  hours:\t9–5")]);
    expect(await extractText("txt", bytes)).toBe("Café hours: 9–5");
  });

  it("fails as unreadable for a broken PDF", async () => {
    expect(await reasonOf(() => extractText("pdf", encode("%PDF-1.4 not really a pdf")))).toBe("unreadable");
  });

  it("fails as unreadable for text that isn't UTF-8", async () => {
    expect(await reasonOf(() => extractText("txt", new Uint8Array([0x48, 0x69, 0xff, 0xfe])))).toBe("unreadable");
  });

  it("fails with no_text for a PDF without a text layer", async () => {
    expect(await reasonOf(() => extractText("pdf", tinyPdf([])))).toBe("no_text");
  });

  it("fails with no_text for an empty or blank file", async () => {
    expect(await reasonOf(() => extractText("md", new Uint8Array()))).toBe("no_text");
    expect(await reasonOf(() => extractText("txt", encode(" \n\n \t")))).toBe("no_text");
  });

  it("fails with text_too_long over MAX_EXTRACTED_TEXT_CHARS, after normalizing", async () => {
    const atCap = "a".repeat(MAX_EXTRACTED_TEXT_CHARS);
    expect(await extractText("txt", encode(atCap))).toHaveLength(MAX_EXTRACTED_TEXT_CHARS);
    // Extra whitespace doesn't count: it is normalized away first.
    expect(await extractText("txt", encode(`  ${atCap}\n\n\n`))).toHaveLength(MAX_EXTRACTED_TEXT_CHARS);
    expect(await reasonOf(() => extractText("txt", encode(`${atCap}b`)))).toBe("text_too_long");
  });
});

describe("the size cap", () => {
  it("is 300,000 characters", () => {
    expect(MAX_EXTRACTED_TEXT_CHARS).toBe(300_000);
  });

  it("checkTextSize allows the cap and refuses one more, with a message that has no text", async () => {
    expect(() => checkTextSize("x".repeat(MAX_EXTRACTED_TEXT_CHARS))).not.toThrow();
    try {
      checkTextSize("secret ".repeat(MAX_EXTRACTED_TEXT_CHARS / 7 + 1));
      expect.unreachable();
    } catch (error) {
      expect((error as KnowledgeProcessingError).reason).toBe("text_too_long");
      expect((error as Error).message).not.toContain("secret");
    }
  });
});
