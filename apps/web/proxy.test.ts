import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";

// Only the matcher is under test; keep Clerk out of the import.
vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: () => () => undefined }));

const { config } = await import("./proxy");

function matches(path: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url: `https://askwell.test${path}` });
}

describe("proxy matcher", () => {
  it.each(["/embed", "/embed/", "/embed/x", "/embed?key=pk_123", "/api/widget/config", "/api/widget/chat", "/widget.js"])(
    "skips widget path %s",
    (path) => {
      expect(matches(path)).toBe(false);
    },
  );

  it.each(["/", "/dashboard", "/dashboard/billing", "/sign-in", "/api/projects", "/api/projects/abc", "/embedx", "/api/widgets"])(
    "still runs for %s",
    (path) => {
      expect(matches(path)).toBe(true);
    },
  );

  it.each(["/relay", "/relay/e/", "/relay/static/array.js", "/relay/flags/?v=2"])("skips the PostHog proxy path %s", (path) => {
    expect(matches(path)).toBe(false);
  });

  it("still runs for paths that only start with relay", () => {
    expect(matches("/relayx")).toBe(true);
  });

  it("skips Next.js internals and static files", () => {
    expect(matches("/_next/static/chunk.js")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);
  });
});
