import { describe, expect, it, vi } from "vitest";
import { appUrl } from "./app-url";

vi.mock("server-only", () => ({}));

const env = (vars: Record<string, string>) => vars as NodeJS.ProcessEnv;

describe("appUrl", () => {
  it("uses the branch URL on a Vercel preview", () => {
    expect(
      appUrl(env({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "askwell-git-x-team.vercel.app", NEXT_PUBLIC_APP_URL: "https://askwell.app" })),
    ).toBe("https://askwell-git-x-team.vercel.app");
  });

  it("uses NEXT_PUBLIC_APP_URL in production, without a trailing slash or path", () => {
    expect(appUrl(env({ VERCEL_ENV: "production", VERCEL_BRANCH_URL: "ignored.vercel.app", NEXT_PUBLIC_APP_URL: "https://askwell.app/" }))).toBe(
      "https://askwell.app",
    );
    expect(appUrl(env({ NEXT_PUBLIC_APP_URL: "https://askwell.app/some/path" }))).toBe("https://askwell.app");
  });

  it("uses NEXT_PUBLIC_APP_URL locally (no VERCEL_ENV)", () => {
    expect(appUrl(env({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }))).toBe("http://localhost:3000");
  });

  it("falls back to NEXT_PUBLIC_APP_URL on a preview without a branch URL", () => {
    expect(appUrl(env({ VERCEL_ENV: "preview", NEXT_PUBLIC_APP_URL: "https://askwell.app" }))).toBe("https://askwell.app");
  });

  it("throws a clear error naming the missing variable", () => {
    expect(() => appUrl(env({}))).toThrow(/NEXT_PUBLIC_APP_URL is not set/);
    expect(() => appUrl(env({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "  " }))).toThrow(/NEXT_PUBLIC_APP_URL is not set/);
    expect(() => appUrl(env({ VERCEL_ENV: "preview" }))).toThrow(/VERCEL_BRANCH_URL is missing/);
  });

  it("rejects values that aren't http(s) URLs", () => {
    expect(() => appUrl(env({ NEXT_PUBLIC_APP_URL: "askwell.app" }))).toThrow(/NEXT_PUBLIC_APP_URL is not a valid URL/);
    expect(() => appUrl(env({ NEXT_PUBLIC_APP_URL: "javascript:alert(1)" }))).toThrow(/must be an http\(s\) URL/);
  });

  it("reads process.env by default", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://from-process.example");
    expect(appUrl()).toBe("https://from-process.example");
    vi.unstubAllEnvs();
  });
});
