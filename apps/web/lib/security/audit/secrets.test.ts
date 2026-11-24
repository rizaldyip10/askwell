// P6H-T05: project.md §9 "Secrets" and §11. No secret in NEXT_PUBLIC_*; each secret is read
// by one server-only module; SUPABASE_SECRET_KEY only by lib/supabase/service.ts.
// (The widget bundle has its own check: apps/widget/src/bundle-secrets.test.ts.)

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { REPO_DIR, type SourceFile, webSources } from "./source";

/** §11: the variables that are public by design. */
const PUBLIC_VARS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
];

/**
 * §11's server-only variables → the one module allowed to read each. `null`: our code never
 * reads it (the Clerk SDK reads CLERK_SECRET_KEY and CLERK_WEBHOOK_SIGNING_SECRET itself).
 */
const SERVER_VARS: Record<string, string | null> = {
  SUPABASE_SECRET_KEY: "lib/supabase/service.ts",
  OPENAI_API_KEY: "lib/ai/client.ts",
  ARCJET_KEY: "lib/security/arcjet.ts",
  LANDING_WIDGET_KEY: "lib/landing/widget-key.ts",
  CLERK_SECRET_KEY: null,
  CLERK_WEBHOOK_SIGNING_SECRET: null,
};

/** Shapes of secret values, to check what the NEXT_PUBLIC_ variables actually hold. */
const SECRET_VALUE = /sb_secret_|\bsk_(?:live|test)_|\bsk-[A-Za-z0-9_-]{20,}|\bwhsec_|\bajkey_|\bsbp_[0-9a-f]{20,}/;

let sources: SourceFile[];
let envExample: Map<string, string>;

beforeAll(async () => {
  sources = await webSources();
  const text = await readFile(join(REPO_DIR, ".env.example"), "utf8");
  envExample = new Map(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
});

describe(".env.example", () => {
  it("lists every §11 variable", () => {
    for (const name of [...PUBLIC_VARS, ...Object.keys(SERVER_VARS)]) expect(envExample.has(name), name).toBe(true);
  });

  it("holds no values", () => {
    expect([...envExample].filter(([, value]) => value !== "").map(([name]) => name)).toEqual([]);
  });

  it("its only NEXT_PUBLIC_ variables are §11's public ones", () => {
    expect([...envExample.keys()].filter((name) => name.startsWith("NEXT_PUBLIC_")).sort()).toEqual(PUBLIC_VARS);
  });

  it("no secret-sounding variable is NEXT_PUBLIC_", () => {
    const suspicious = [...envExample.keys()].filter((n) => n.startsWith("NEXT_PUBLIC_") && /SECRET|TOKEN|PRIVATE|SIGNING|PASSWORD/.test(n));
    expect(suspicious).toEqual([]);
  });

  it(".env files are git-ignored", async () => {
    const gitignore = (await readFile(join(REPO_DIR, ".gitignore"), "utf8")).split("\n").map((l) => l.trim());
    expect(gitignore).toContain(".env");
    expect(gitignore.some((l) => l === ".env*.local" || l === ".env.local" || l === ".env*")).toBe(true);
  });
});

describe("NEXT_PUBLIC_ variables in the app", () => {
  it("the code uses no NEXT_PUBLIC_ name outside §11's public list", () => {
    const used = new Set(sources.flatMap((f) => f.code.match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? []));
    expect([...used].filter((name) => !PUBLIC_VARS.includes(name))).toEqual([]);
  });

  it("none set in this environment holds a secret-shaped value", () => {
    // Checks the real values where they're set (local, a sandbox); in CI they're unset.
    // Reports only the variable's name, never its value.
    const bad = Object.keys(process.env).filter((name) => name.startsWith("NEXT_PUBLIC_") && SECRET_VALUE.test(process.env[name] ?? ""));
    expect(bad).toEqual([]);
  });
});

describe("server-only variables", () => {
  it.each(Object.entries(SERVER_VARS))("%s is read only by %s", (name, owner) => {
    const readers = sources.filter((f) => f.code.includes(name)).map((f) => f.path);
    expect(readers).toEqual(owner ? [owner] : []);
  });

  it.each(Object.values(SERVER_VARS).filter((p): p is string => p !== null))("%s imports server-only first", (path) => {
    const file = sources.find((f) => f.path === path);
    expect(file?.code.trimStart().startsWith('import "server-only";')).toBe(true);
  });

  it("no client component imports a module that reads a secret", () => {
    const secretModules = Object.values(SERVER_VARS)
      .filter((p): p is string => p !== null)
      .map((p) => p.replace(/^lib\//, "").replace(/\.ts$/, ""));
    const offenders = sources
      .filter((f) => /^\s*["']use client["']/.test(f.code))
      .filter((f) => secretModules.some((m) => new RegExp(`from ["'][./]*(?:lib/)?${m}["']`).test(f.code)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
