import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: unknown[][] = [];
const capture = vi.fn((...args: unknown[]) => calls.push(["capture", ...args]));
const identify = vi.fn((...args: unknown[]) => calls.push(["identify", ...args]));
const reset = vi.fn(() => calls.push(["reset"]));
let distinctId = "anon-1";
let userState = "anonymous";
const client = {
  capture,
  identify,
  reset,
  get_distinct_id: () => distinctId,
  get_property: (key: string) => (key === "$user_state" ? userState : undefined),
};
const loadPostHog = vi.fn<() => Promise<typeof client | null>>();
vi.mock("../../lib/analytics/browser", () => ({ loadPostHog: () => loadPostHog() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/projects/p1/install" }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isLoaded: true, userId: "user_owner" }) }));

const { InstallSnippet, trackSnippetCopied } = await import("./install-snippet");

const PROJECT = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";

const OWNER = "user_owner";

beforeEach(() => {
  calls.length = 0;
  distinctId = "anon-1";
  userState = "anonymous";
  capture.mockClear();
  identify.mockClear();
  reset.mockClear();
  loadPostHog.mockReset().mockResolvedValue(client);
});

describe("trackSnippetCopied", () => {
  it("sends snippet_copied with the project_id only, under the owner", async () => {
    distinctId = OWNER;
    userState = "identified";
    await trackSnippetCopied(PROJECT, OWNER);
    expect(calls).toEqual([["capture", "snippet_copied", { project_id: PROJECT }]]);
  });

  it("identifies the owner first when the copy beats PostHogIdentify", async () => {
    await trackSnippetCopied(PROJECT, OWNER);
    expect(calls).toEqual([
      ["identify", OWNER],
      ["capture", "snippet_copied", { project_id: PROJECT }],
    ]);
  });

  it("does nothing when PostHog isn't loaded (no key)", async () => {
    loadPostHog.mockResolvedValue(null);
    await expect(trackSnippetCopied(PROJECT, OWNER)).resolves.toBeUndefined();
    expect(capture).not.toHaveBeenCalled();
  });

  it("never throws when PostHog fails", async () => {
    loadPostHog.mockRejectedValue(new Error("blocked"));
    await expect(trackSnippetCopied(PROJECT, OWNER)).resolves.toBeUndefined();
    loadPostHog.mockResolvedValue(client);
    capture.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    await expect(trackSnippetCopied(PROJECT, OWNER)).resolves.toBeUndefined();
  });
});

describe("InstallSnippet", () => {
  it("renders the snippet and the copy button, sending nothing until a copy", () => {
    const html = renderToStaticMarkup(<InstallSnippet snippet='<script src="x" data-key="pk_123"></script>' />);
    expect(html).toContain("Copy script tag");
    expect(loadPostHog).not.toHaveBeenCalled();
  });
});
