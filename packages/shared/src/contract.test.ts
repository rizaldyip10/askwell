import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_FAILURE_REASONS,
  toKnowledgeFailureReason,
  API_ERROR_CODES,
  apiErrorSchema,
  createProjectRequestSchema,
  finalizeKnowledgeRequestSchema,
  idParamsSchema,
  KNOWLEDGE_ALLOWED_MIME_TYPES,
  MAX_KNOWLEDGE_FILE_BYTES,
  KNOWLEDGE_TEXT_MAX_LENGTH,
  knowledgeFileTypeFromName,
  knowledgeUploadUrlRequestSchema,
  MESSAGE_MAX_LENGTH,
  pasteKnowledgeRequestSchema,
  PLAN_LIMITS,
  PLANS,
  PROJECT_NAME_MAX_LENGTH,
  renameProjectRequestSchema,
  updateWidgetConfigRequestSchema,
  widgetChatRequestSchema,
  widgetConfigQuerySchema,
} from "./index";

const KEY = "pk_a1b2c3d4e5f6a7b8c9d0e1f2";
const UUID = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";

describe("plans", () => {
  it("lists free and pro", () => {
    expect(PLANS).toEqual(["free", "pro"]);
  });

  it("PLAN_LIMITS matches project.md §5", () => {
    expect(PLAN_LIMITS).toEqual({
      free: { projects: 1, messagesPerMonth: 100, knowledgeSources: 3, customWidget: false, showBadge: true },
      pro: { projects: 5, messagesPerMonth: 2000, knowledgeSources: 25, customWidget: true, showBadge: false },
    });
  });
});

describe("input limits", () => {
  it("has the product owner's values", () => {
    expect(MESSAGE_MAX_LENGTH).toBe(1000);
    expect(KNOWLEDGE_TEXT_MAX_LENGTH).toBe(50_000);
    expect(MAX_KNOWLEDGE_FILE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("knowledgeFileTypeFromName", () => {
  it("maps allowed extensions, case-insensitively", () => {
    expect(knowledgeFileTypeFromName("guide.pdf")).toBe("pdf");
    expect(knowledgeFileTypeFromName("README.MD")).toBe("md");
    expect(knowledgeFileTypeFromName("notes.markdown")).toBe("md");
    expect(knowledgeFileTypeFromName("faq.txt")).toBe("txt");
  });

  it("rejects other types and bare extensions", () => {
    expect(knowledgeFileTypeFromName("app.exe")).toBeNull();
    expect(knowledgeFileTypeFromName("doc.docx")).toBeNull();
    expect(knowledgeFileTypeFromName("pdf")).toBeNull();
    expect(knowledgeFileTypeFromName(".pdf")).toBeNull();
    expect(knowledgeFileTypeFromName("file.pdf.exe")).toBeNull();
  });

  it("lists the bucket MIME types", () => {
    expect(KNOWLEDGE_ALLOWED_MIME_TYPES).toContain("application/pdf");
    expect(KNOWLEDGE_ALLOWED_MIME_TYPES).toContain("text/markdown");
    expect(KNOWLEDGE_ALLOWED_MIME_TYPES).toContain("text/plain");
  });
});

describe("ApiError", () => {
  it("accepts a known code", () => {
    expect(apiErrorSchema.safeParse({ error: { code: "plan_limit", message: "Upgrade" } }).success).toBe(true);
    expect(API_ERROR_CODES).toContain("payment_required");
  });

  it("rejects an unknown code or a missing message", () => {
    expect(apiErrorSchema.safeParse({ error: { code: "teapot", message: "x" } }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ error: { code: "internal" } }).success).toBe(false);
  });
});

describe("widget config query", () => {
  it("accepts a public key", () => {
    expect(widgetConfigQuerySchema.safeParse({ key: KEY }).success).toBe(true);
  });

  it("rejects a malformed key", () => {
    for (const key of ["", "a1b2c3d4e5f6a7b8", "pk_short", "sk_a1b2c3d4e5f6a7b8c9d0", "pk_a1b2c3d4e5f6a7b8<script>"]) {
      expect(widgetConfigQuerySchema.safeParse({ key }).success).toBe(false);
    }
  });
});

describe("widget chat request", () => {
  const good = { key: KEY, visitorId: UUID, message: "What are your opening hours?" };

  it("accepts a message, with or without a conversation", () => {
    expect(widgetChatRequestSchema.safeParse(good).success).toBe(true);
    expect(widgetChatRequestSchema.safeParse({ ...good, conversationId: UUID }).success).toBe(true);
  });

  it("accepts a message of exactly the max length", () => {
    expect(widgetChatRequestSchema.safeParse({ ...good, message: "a".repeat(MESSAGE_MAX_LENGTH) }).success).toBe(true);
  });

  it("rejects a too-long or empty message", () => {
    expect(widgetChatRequestSchema.safeParse({ ...good, message: "a".repeat(MESSAGE_MAX_LENGTH + 1) }).success).toBe(false);
    expect(widgetChatRequestSchema.safeParse({ ...good, message: "   " }).success).toBe(false);
  });

  it("rejects bad ids and unknown fields", () => {
    expect(widgetChatRequestSchema.safeParse({ ...good, visitorId: "abc" }).success).toBe(false);
    expect(widgetChatRequestSchema.safeParse({ ...good, conversationId: "abc" }).success).toBe(false);
    expect(widgetChatRequestSchema.safeParse({ ...good, plan: "pro" }).success).toBe(false);
  });
});

describe("project requests", () => {
  it("accepts and trims a name", () => {
    const parsed = createProjectRequestSchema.parse({ name: "  Help desk  " });
    expect(parsed.name).toBe("Help desk");
    expect(renameProjectRequestSchema.safeParse({ name: "Docs" }).success).toBe(true);
  });

  it("rejects an empty or too-long name", () => {
    expect(createProjectRequestSchema.safeParse({ name: " " }).success).toBe(false);
    expect(createProjectRequestSchema.safeParse({ name: "a".repeat(PROJECT_NAME_MAX_LENGTH + 1) }).success).toBe(false);
    expect(renameProjectRequestSchema.safeParse({}).success).toBe(false);
  });

  it("validates the :id param", () => {
    expect(idParamsSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(idParamsSchema.safeParse({ id: "1" }).success).toBe(false);
  });
});

describe("knowledge failure reasons", () => {
  it("are unique", () => {
    expect(new Set(KNOWLEDGE_FAILURE_REASONS).size).toBe(KNOWLEDGE_FAILURE_REASONS.length);
  });

  it("toKnowledgeFailureReason keeps a known reason and turns anything else into null", () => {
    for (const reason of KNOWLEDGE_FAILURE_REASONS) expect(toKnowledgeFailureReason(reason)).toBe(reason);
    for (const value of [null, undefined, "", "boom", "NO_TEXT"]) expect(toKnowledgeFailureReason(value)).toBeNull();
  });
});

describe("knowledge requests", () => {
  it("accepts pasted text up to the limit", () => {
    expect(pasteKnowledgeRequestSchema.safeParse({ title: "FAQ", text: "a".repeat(KNOWLEDGE_TEXT_MAX_LENGTH) }).success).toBe(true);
  });

  it("rejects too-long or empty pasted text", () => {
    expect(pasteKnowledgeRequestSchema.safeParse({ title: "FAQ", text: "a".repeat(KNOWLEDGE_TEXT_MAX_LENGTH + 1) }).success).toBe(false);
    expect(pasteKnowledgeRequestSchema.safeParse({ title: "FAQ", text: "" }).success).toBe(false);
    expect(pasteKnowledgeRequestSchema.safeParse({ title: "", text: "hello" }).success).toBe(false);
  });

  it("accepts an allowed file up to 10 MB", () => {
    expect(knowledgeUploadUrlRequestSchema.safeParse({ fileName: "guide.pdf", size: MAX_KNOWLEDGE_FILE_BYTES }).success).toBe(true);
    expect(knowledgeUploadUrlRequestSchema.safeParse({ fileName: "notes.md", size: 1 }).success).toBe(true);
  });

  it("rejects a wrong file type", () => {
    expect(knowledgeUploadUrlRequestSchema.safeParse({ fileName: "malware.exe", size: 100 }).success).toBe(false);
    expect(knowledgeUploadUrlRequestSchema.safeParse({ fileName: "photo.png", size: 100 }).success).toBe(false);
  });

  it("rejects an oversize, empty or fractional file size", () => {
    expect(knowledgeUploadUrlRequestSchema.safeParse({ fileName: "guide.pdf", size: MAX_KNOWLEDGE_FILE_BYTES + 1 }).success).toBe(false);
    expect(knowledgeUploadUrlRequestSchema.safeParse({ fileName: "guide.pdf", size: 0 }).success).toBe(false);
    expect(knowledgeUploadUrlRequestSchema.safeParse({ fileName: "guide.pdf", size: 1.5 }).success).toBe(false);
  });

  it("finalize needs a source id", () => {
    expect(finalizeKnowledgeRequestSchema.safeParse({ sourceId: UUID }).success).toBe(true);
    expect(finalizeKnowledgeRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("widget config update", () => {
  it("accepts a full or partial update", () => {
    expect(
      updateWidgetConfigRequestSchema.safeParse({
        buttonColor: "#1A2b3c",
        position: "top-left",
        label: "Help",
        animation: "slide",
        headerText: "Ask us",
        showBadge: false,
      }).success,
    ).toBe(true);
    expect(updateWidgetConfigRequestSchema.safeParse({ animation: "scale" }).success).toBe(true);
  });

  it("rejects an empty update", () => {
    expect(updateWidgetConfigRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a bad color", () => {
    for (const buttonColor of ["red", "#fff", "#12345g", "1a2b3c", "#1a2b3c4d", "url(x)"]) {
      expect(updateWidgetConfigRequestSchema.safeParse({ buttonColor }).success).toBe(false);
    }
  });

  it("rejects a bad position or animation", () => {
    expect(updateWidgetConfigRequestSchema.safeParse({ position: "center" }).success).toBe(false);
    expect(updateWidgetConfigRequestSchema.safeParse({ animation: "bounce" }).success).toBe(false);
  });
});
