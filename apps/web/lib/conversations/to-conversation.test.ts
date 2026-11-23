import { describe, expect, it } from "vitest";
import { messagePreview, PREVIEW_MAX_CHARS, toConversationSummary, toMessage } from "./to-conversation";

const conversation = {
  id: "c1",
  project_id: "p1",
  visitor_id: "v1",
  created_at: "2026-11-23T01:00:00.123456+00:00",
};

describe("messagePreview", () => {
  it("keeps a short message as is, with whitespace collapsed", () => {
    expect(messagePreview("  How do I\n\nreset   my password?  ")).toBe("How do I reset my password?");
  });

  it("keeps a message of exactly the limit", () => {
    const text = "a".repeat(PREVIEW_MAX_CHARS);
    expect(messagePreview(text)).toBe(text);
  });

  it("cuts a long message at a word boundary near the limit, with an ellipsis", () => {
    const text = `${"word ".repeat(40)}end`;
    const preview = messagePreview(text);
    expect(preview.endsWith("word…")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(PREVIEW_MAX_CHARS + 1);
    expect(preview.length).toBeGreaterThan(PREVIEW_MAX_CHARS - 20);
  });

  it("cuts one long word mid-word", () => {
    expect(messagePreview("x".repeat(500))).toBe(`${"x".repeat(PREVIEW_MAX_CHARS)}…`);
  });

  it("never splits a surrogate pair", () => {
    const preview = messagePreview("😀".repeat(200));
    expect(preview).toBe(`${"😀".repeat(PREVIEW_MAX_CHARS)}…`);
  });

  it("keeps HTML as plain text (the dashboard renders text)", () => {
    expect(messagePreview("<b>hi</b>")).toBe("<b>hi</b>");
  });
});

describe("toConversationSummary", () => {
  it("maps the row, its first visitor message and its count", () => {
    expect(
      toConversationSummary({ ...conversation, preview: [{ body: "Hello\nthere" }], stats: [{ count: 4 }] }),
    ).toEqual({
      id: "c1",
      projectId: "p1",
      visitorId: "v1",
      createdAt: conversation.created_at,
      firstMessagePreview: "Hello there",
      messageCount: 4,
    });
  });

  it("gives an empty preview and 0 for a conversation with no messages", () => {
    expect(toConversationSummary({ ...conversation, preview: [], stats: [] })).toMatchObject({
      firstMessagePreview: "",
      messageCount: 0,
    });
  });
});

describe("toMessage", () => {
  const row = { id: "m1", conversation_id: "c1", role: "bot", body: "Hi", created_at: "t" };

  it("maps a message row", () => {
    expect(toMessage(row)).toEqual({ id: "m1", conversationId: "c1", role: "bot", body: "Hi", createdAt: "t" });
  });

  it("throws on an unknown role", () => {
    expect(() => toMessage({ ...row, role: "admin" })).toThrow(/unknown role/);
  });
});
