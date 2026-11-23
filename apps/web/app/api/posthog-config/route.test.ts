import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/posthog-config", () => {
  it("returns the key and host, read at request time", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_one");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    const first = GET();
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(await first.json()).toEqual({ key: "phc_one", host: "https://us.i.posthog.com" });

    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_two");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    expect(await GET().json()).toEqual({ key: "phc_two", host: "https://eu.i.posthog.com" });
  });

  it("is a 503 error when PostHog isn't configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    const res = GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Analytics is not configured." } });
  });
});
