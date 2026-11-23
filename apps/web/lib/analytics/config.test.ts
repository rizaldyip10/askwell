import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isTrackedPath,
  missingPosthogVariable,
  posthogAssetsHost,
  posthogRewrites,
  posthogUiHost,
  readPosthogEnv,
} from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("readPosthogEnv", () => {
  it("returns key and host, without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", " phc_test ");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com/");
    expect(readPosthogEnv()).toEqual({ key: "phc_test", host: "https://us.i.posthog.com" });
  });

  it.each([
    ["", "https://us.i.posthog.com", "NEXT_PUBLIC_POSTHOG_KEY"],
    ["phc_test", "", "NEXT_PUBLIC_POSTHOG_HOST"],
    ["  ", "  ", "NEXT_PUBLIC_POSTHOG_KEY"],
  ])("is null when key=%j host=%j", (key, host, missing) => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", key);
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", host);
    expect(readPosthogEnv()).toBeNull();
    expect(missingPosthogVariable()).toBe(missing);
  });
});

describe("isTrackedPath", () => {
  it.each(["/embed", "/embed/", "/embed/x", "/Embed"])("never tracks %s", (path) => {
    expect(isTrackedPath(path)).toBe(false);
  });

  it.each(["/", "/dashboard", "/dashboard/projects/x", "/sign-in", "/embedx"])("tracks %s", (path) => {
    expect(isTrackedPath(path)).toBe(true);
  });
});

describe("hosts", () => {
  it.each(["us", "eu"])("maps the %s cloud hosts", (region) => {
    expect(posthogAssetsHost(`https://${region}.i.posthog.com`)).toBe(`https://${region}-assets.i.posthog.com`);
    expect(posthogUiHost(`https://${region}.i.posthog.com`)).toBe(`https://${region}.posthog.com`);
  });

  it("leaves other hosts alone", () => {
    expect(posthogAssetsHost("https://ph.example.com")).toBe("https://ph.example.com");
  });
});

describe("posthogRewrites", () => {
  it("routes /relay to PostHog, assets before the catch-all", () => {
    expect(posthogRewrites("https://us.i.posthog.com/")).toEqual([
      { source: "/relay/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/relay/array/:path*", destination: "https://us-assets.i.posthog.com/array/:path*" },
      { source: "/relay/:path*", destination: "https://us.i.posthog.com/:path*" },
    ]);
  });

  it.each([undefined, "", " "])("has no rewrites without a host (%j)", (host) => {
    expect(posthogRewrites(host)).toEqual([]);
  });
});
