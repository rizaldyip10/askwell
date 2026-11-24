import type { KnowledgeSource } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SourceList } from "./source-list";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const source = (
  title: string,
  status: KnowledgeSource["status"],
  type: KnowledgeSource["type"] = "pdf",
  failureReason: KnowledgeSource["failureReason"] = null,
): KnowledgeSource => ({
  id: `id-${title}`,
  projectId: "p",
  title,
  type,
  status,
  failureReason,
  createdAt: "2026-11-19T00:00:00Z",
});

describe("SourceList", () => {
  it("renders titles as text, never HTML (§9 XSS)", () => {
    const html = renderToStaticMarkup(
      <SourceList sources={[source('<img src=x onerror="alert(1)">', "ready")]} onChanged={() => {}} />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x");
  });

  it("has a polite status region for status changes", () => {
    const html = renderToStaticMarkup(<SourceList sources={[source("Guide", "processing")]} onChanged={() => {}} />);
    expect(html).toMatch(/<p role="status" aria-live="polite" class="sr-only"><\/p>/);
  });

  it("shows uploading as Processing, plus type and date", () => {
    const html = renderToStaticMarkup(<SourceList sources={[source("Guide", "uploading")]} onChanged={() => {}} />);
    expect(html).toContain("Processing");
    expect(html).not.toContain("uploading");
    expect(html).toContain("PDF · Added Nov 19, 2026");
  });

  it("a failed source shows its reason in one line under its name", () => {
    const html = renderToStaticMarkup(
      <SourceList sources={[source("Scan", "failed", "pdf", "no_text")]} onChanged={() => {}} />,
    );
    expect(html).toContain("Failed");
    expect(html).toContain("This file has no readable text. A scanned PDF needs a text layer.");
  });

  it("a failed source without a stored reason gets the generic line", () => {
    const html = renderToStaticMarkup(<SourceList sources={[source("Old", "failed")]} onChanged={() => {}} />);
    expect(html).toContain("Something went wrong. Delete it and add it again.");
  });

  it("a ready or processing source shows no reason", () => {
    const html = renderToStaticMarkup(
      <SourceList
        sources={[source("Good", "ready", "md", "no_text"), source("Busy", "processing")]}
        onChanged={() => {}}
      />,
    );
    expect(html).not.toContain("readable text");
    expect(html).not.toContain("Something went wrong");
  });
});
