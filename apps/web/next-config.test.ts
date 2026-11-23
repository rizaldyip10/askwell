import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "./next.config";

async function headersFor(path: string): Promise<Headers> {
  const res = await unstable_getResponseFromNextConfig({ url: `https://askwell.test${path}`, nextConfig });
  return res.headers;
}

describe("frame headers", () => {
  it.each(["/embed", "/embed/", "/embed/x", "/embed?key=pk_123"])("%s may be framed by any site", async (path) => {
    const h = await headersFor(path);
    expect(h.get("content-security-policy")).toBe("frame-ancestors *");
    expect(h.get("x-frame-options")).toBeNull();
  });

  it.each(["/", "/sign-in", "/dashboard", "/dashboard/billing", "/api/projects", "/embedx", "/widget.js"])(
    "%s may be framed only by the app itself",
    async (path) => {
      const h = await headersFor(path);
      expect(h.get("content-security-policy")).toBe("frame-ancestors 'self'");
      expect(h.get("x-frame-options")).toBe("SAMEORIGIN");
    },
  );
});

describe("/widget.js headers", () => {
  it("is JavaScript, any origin, short cache", async () => {
    const h = await headersFor("/widget.js");
    expect(h.get("content-type")).toMatch(/^application\/javascript/);
    expect(h.get("access-control-allow-origin")).toBe("*");
    expect(h.get("cache-control")).toBe("public, max-age=300");
  });

  it("is not sent on other paths", async () => {
    const h = await headersFor("/");
    expect(h.get("access-control-allow-origin")).toBeNull();
  });
});

describe("PostHog reverse proxy", () => {
  it("doesn't redirect PostHog's trailing-slash paths", () => {
    expect(nextConfig.skipTrailingSlashRedirect).toBe(true);
  });

  it("rewrites /relay to the configured PostHog host", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    try {
      const rewrites = await nextConfig.rewrites?.();
      expect(rewrites).toEqual([
        { source: "/relay/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
        { source: "/relay/array/:path*", destination: "https://us-assets.i.posthog.com/array/:path*" },
        { source: "/relay/:path*", destination: "https://us.i.posthog.com/:path*" },
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each(["/relay/e/", "/relay/static/array.js"])("keeps the frame rules on %s", async (path) => {
    const h = await headersFor(path);
    expect(h.get("content-security-policy")).toBe("frame-ancestors 'self'");
  });
});

it("keeps transpilePackages", () => {
  expect(nextConfig.transpilePackages).toEqual(["@askwell/shared", "@askwell/db"]);
});
