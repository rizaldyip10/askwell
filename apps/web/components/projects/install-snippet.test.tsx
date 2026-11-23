import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.fn();
const loadPostHog = vi.fn<() => Promise<{ capture: typeof capture } | null>>();
vi.mock("../../lib/analytics/browser", () => ({ loadPostHog: () => loadPostHog() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/projects/p1/install" }));

const { InstallSnippet, trackSnippetCopied } = await import("./install-snippet");

const PROJECT = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";

beforeEach(() => {
  capture.mockReset();
  loadPostHog.mockReset().mockResolvedValue({ capture });
});

describe("trackSnippetCopied", () => {
  it("sends snippet_copied with the project_id only", async () => {
    await trackSnippetCopied(PROJECT);
    expect(capture.mock.calls).toEqual([["snippet_copied", { project_id: PROJECT }]]);
  });

  it("does nothing when PostHog isn't loaded (no key)", async () => {
    loadPostHog.mockResolvedValue(null);
    await expect(trackSnippetCopied(PROJECT)).resolves.toBeUndefined();
    expect(capture).not.toHaveBeenCalled();
  });

  it("never throws when PostHog fails", async () => {
    loadPostHog.mockRejectedValue(new Error("blocked"));
    await expect(trackSnippetCopied(PROJECT)).resolves.toBeUndefined();
    loadPostHog.mockResolvedValue({ capture });
    capture.mockImplementation(() => {
      throw new Error("boom");
    });
    await expect(trackSnippetCopied(PROJECT)).resolves.toBeUndefined();
  });
});

describe("InstallSnippet", () => {
  it("renders the snippet and the copy button, sending nothing until a copy", () => {
    const html = renderToStaticMarkup(<InstallSnippet snippet='<script src="x" data-key="pk_123"></script>' />);
    expect(html).toContain("Copy script tag");
    expect(loadPostHog).not.toHaveBeenCalled();
  });
});
