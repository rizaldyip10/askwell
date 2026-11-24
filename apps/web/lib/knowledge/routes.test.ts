import { describe, expect, it, vi } from "vitest";
import { PROJECT_ID, SOURCE_ID, sourceRow } from "./route-test-utils";
import { toKnowledgeSource } from "./routes";

vi.mock("server-only", () => ({}));

describe("toKnowledgeSource", () => {
  it("maps a row to the API shape, with no reason for a source that isn't failed", () => {
    expect(toKnowledgeSource(sourceRow({ failure_reason: null }))).toEqual({
      id: SOURCE_ID,
      projectId: PROJECT_ID,
      title: "FAQ",
      type: "text",
      status: "processing",
      failureReason: null,
      createdAt: "2026-11-19T00:00:00Z",
    });
  });

  it("maps a failed source's stored reason", () => {
    const source = toKnowledgeSource(sourceRow({ status: "failed", failure_reason: "no_text" }));
    expect(source.status).toBe("failed");
    expect(source.failureReason).toBe("no_text");
  });

  it("a missing column (reserve_knowledge_source's row) or an unknown value maps to null", () => {
    expect(toKnowledgeSource(sourceRow()).failureReason).toBeNull();
    expect(toKnowledgeSource(sourceRow({ status: "failed", failure_reason: "something_new" })).failureReason).toBeNull();
  });
});
