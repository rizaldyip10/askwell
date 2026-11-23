import { afterEach, describe, expect, it, vi } from "vitest";

// /embed runs on customers' sites: PostHog must never load there (project.md §6.11, §9).
const posthogImported = vi.fn();
vi.mock("posthog-js", () => {
  posthogImported();
  return { default: { init: vi.fn() } };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  posthogImported.mockClear();
});

describe("PostHog on /embed", () => {
  it.each(["/embed", "/embed/"])("loads nothing on %s", async (pathname) => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    vi.stubGlobal("window", { location: { pathname, hostname: "app.test" } });
    const { loadPostHog } = await import("../../lib/analytics/browser");
    await expect(loadPostHog()).resolves.toBeNull();
    expect(posthogImported).not.toHaveBeenCalled();
  });
});
