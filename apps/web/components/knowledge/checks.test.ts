import { KNOWLEDGE_ALLOWED_MIME_TYPES, MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_FILE_ACCEPT,
  checkKnowledgeFile,
  formatFileSize,
  isProcessing,
  sourceStatusLabel,
  sourceTypeLabel,
  uploadContentType,
} from "./checks";

const MB = 1024 * 1024;

describe("checkKnowledgeFile", () => {
  it.each([
    ["guide.pdf", "pdf"],
    ["GUIDE.PDF", "pdf"],
    ["notes.md", "md"],
    ["notes.markdown", "md"],
    ["faq.txt", "txt"],
  ])("accepts %s as %s", (name, type) => {
    expect(checkKnowledgeFile({ name, size: 1000 })).toEqual({ ok: true, type });
  });

  it.each(["report.docx", "slides.pptx", "image.png", "archive.pdf.zip", "pdf", ".pdf", "noextension"])(
    "refuses %s with a clear message",
    (name) => {
      expect(checkKnowledgeFile({ name, size: 1000 })).toEqual({
        ok: false,
        message: "Choose a PDF, Markdown (.md) or text (.txt) file.",
      });
    },
  );

  it("refuses a 12 MB file, naming its size and the limit", () => {
    expect(checkKnowledgeFile({ name: "big.pdf", size: 12 * MB })).toEqual({
      ok: false,
      message: "This file is 12 MB. The limit is 10 MB.",
    });
  });

  it("accepts exactly 10 MB and refuses one byte more", () => {
    expect(checkKnowledgeFile({ name: "a.pdf", size: MAX_KNOWLEDGE_FILE_BYTES }).ok).toBe(true);
    expect(checkKnowledgeFile({ name: "a.pdf", size: MAX_KNOWLEDGE_FILE_BYTES + 1 }).ok).toBe(false);
  });

  it("refuses an empty file", () => {
    expect(checkKnowledgeFile({ name: "a.txt", size: 0 })).toEqual({ ok: false, message: "This file is empty." });
  });

  it("refuses a file name over the shared max length", () => {
    const result = checkKnowledgeFile({ name: `${"a".repeat(260)}.pdf`, size: 10 });
    expect(result.ok).toBe(false);
  });
});

describe("uploadContentType", () => {
  it("is a MIME type the knowledge bucket accepts, per type", () => {
    expect(uploadContentType("pdf")).toBe("application/pdf");
    expect(uploadContentType("md")).toBe("text/markdown");
    expect(uploadContentType("txt")).toBe("text/plain");
    for (const type of ["pdf", "md", "txt"] as const) {
      expect(KNOWLEDGE_ALLOWED_MIME_TYPES).toContain(uploadContentType(type));
    }
  });
});

describe("KNOWLEDGE_FILE_ACCEPT", () => {
  it("lists the allowed extensions and MIME types for the file picker", () => {
    expect(KNOWLEDGE_FILE_ACCEPT.split(",")).toEqual(
      expect.arrayContaining([".pdf", ".md", ".markdown", ".txt", "application/pdf", "text/markdown", "text/plain"]),
    );
  });
});

describe("formatFileSize", () => {
  it.each([
    [512, "512 B"],
    [1536, "1.5 KB"],
    [12 * MB, "12 MB"],
    [10 * MB + 1, "10 MB"],
    [2.5 * MB, "2.5 MB"],
  ])("%d → %s", (bytes, label) => {
    expect(formatFileSize(bytes)).toBe(label);
  });
});

describe("sourceStatusLabel", () => {
  it("shows uploading and processing as Processing (§6.4)", () => {
    expect(sourceStatusLabel("uploading")).toBe("Processing");
    expect(sourceStatusLabel("processing")).toBe("Processing");
  });

  it("shows ready and failed as themselves", () => {
    expect(sourceStatusLabel("ready")).toBe("Ready");
    expect(sourceStatusLabel("failed")).toBe("Failed");
  });

  it("isProcessing is true only for the Processing statuses", () => {
    expect(["uploading", "processing", "ready", "failed"].map((s) => isProcessing(s as never))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});

describe("sourceTypeLabel", () => {
  it("names each type", () => {
    expect(["text", "pdf", "md", "txt"].map((t) => sourceTypeLabel(t as never))).toEqual([
      "Text",
      "PDF",
      "Markdown",
      "TXT",
    ]);
  });
});
