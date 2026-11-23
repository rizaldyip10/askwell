import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// Keep Clerk out of the import, but keep the handler proxy.ts passes to clerkMiddleware.
type Handler = (auth: unknown, req: unknown) => Promise<unknown>;
const captured = vi.hoisted(() => ({ handler: null as Handler | null }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: Handler) => {
    captured.handler = handler;
    return () => undefined;
  },
}));

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

describe("proxy handler", () => {
  const run = async (path: string, method = "GET") => {
    const auth = Object.assign(vi.fn(async () => ({ isAuthenticated: false })), { protect: vi.fn() });
    const result = await captured.handler!(auth, new NextRequest(`https://askwell.test${path}`, { method }));
    return { result, auth };
  };

  it("lets the Clerk webhook through with no session check (verifyWebhook is its only check)", async () => {
    // Matched, so Clerk runs, but nothing gates it: a delivery has no session.
    expect(matches("/api/clerk/webhook")).toBe(true);
    const { result, auth } = await run("/api/clerk/webhook", "POST");
    expect(result).toBeUndefined();
    expect(auth).not.toHaveBeenCalled();
    expect(auth.protect).not.toHaveBeenCalled();
  });

  it("still gates owner API routes with a 401", async () => {
    const { result } = await run("/api/projects");
    expect((result as Response).status).toBe(401);
  });
});
