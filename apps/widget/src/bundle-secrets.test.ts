// @vitest-environment node
// P6H-T05: project.md §9 "Secrets": no secret key in the widget bundle.
//
// `pnpm test` runs before `pnpm build`, so this builds widget.js itself, in memory, with
// the same esbuild options as the package's `build` script (the first test keeps the two
// in step). It checks the minified output that sites load as /widget.js.
import { build } from "esbuild";
import { beforeAll, describe, expect, it } from "vitest";
import pkg from "../package.json";


const BUILD_SCRIPT = "esbuild src/index.ts --bundle --minify --format=iife --target=es2018 --outfile=dist/widget.js";

/** §11's server-only variables. Their names must not even appear in the bundle. */
const SECRET_ENV_NAMES = [
  "SUPABASE_SECRET_KEY",
  "CLERK_SECRET_KEY",
  "OPENAI_API_KEY",
  "CLERK_WEBHOOK_SIGNING_SECRET",
  "ARCJET_KEY",
  "LANDING_WIDGET_KEY",
  "SUPABASE_ACCESS_TOKEN",
];

/** Shapes of real secret values: Supabase, Clerk, OpenAI, Svix (Clerk webhooks), Arcjet, Supabase PAT. */
const SECRET_PATTERNS: [string, RegExp][] = [
  ["Supabase secret key", /sb_secret_/],
  ["Clerk secret key", /\bsk_(?:live|test)_/],
  ["OpenAI key", /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/],
  ["webhook signing secret", /\bwhsec_/],
  ["Arcjet key", /\bajkey_/],
  ["Supabase access token", /\bsbp_[0-9a-f]{20,}/],
  ["JWT (e.g. a legacy service_role key)", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./],
];

let bundle: string;

/**
 * Node's own fileURLToPath (spaces, Windows drive letters). This package has no Node types,
 * so the import is typed by hand; the test runs in Node (see the environment comment above).
 */
async function fileURLToPath(url: URL): Promise<string> {
  const specifier = "node:url";
  const mod = (await import(/* @vite-ignore */ specifier)) as { fileURLToPath: (u: URL) => string };
  return mod.fileURLToPath(url);
}

beforeAll(async () => {
  const result = await build({
    entryPoints: [await fileURLToPath(new URL("./index.ts", import.meta.url))],
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2018",
    write: false,
    logLevel: "silent",
  });
  bundle = result.outputFiles[0]?.text ?? "";
}, 60_000);

describe("widget.js bundle", () => {
  it("is built with the same options as the package's build script", () => {
    expect(pkg.scripts.build).toBe(BUILD_SCRIPT);
    expect(bundle.length).toBeGreaterThan(1000);
  });

  it.each(SECRET_PATTERNS)("contains nothing shaped like a %s", (_name, pattern) => {
    expect(pattern.test(bundle)).toBe(false);
  });

  it.each(SECRET_ENV_NAMES)("doesn't mention %s", (name) => {
    expect(bundle.includes(name)).toBe(false);
  });

  it("reads no environment variable at all (no process.env, no NEXT_PUBLIC_ name)", () => {
    // The widget gets its app origin from its own <script src> and its key from data-key,
    // so it needs no build-time variable, public or secret.
    expect(bundle.includes("process.env")).toBe(false);
    expect(bundle.includes("import.meta.env")).toBe(false);
    expect(bundle.match(/NEXT_PUBLIC_[A-Z_]+/g) ?? []).toEqual([]);
  });

  it("contains none of the secret values in this environment (when they are set)", () => {
    // This package has no Node types; read process.env through globalThis.
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    // In CI these are unset and the test checks nothing; locally or on a machine with real
    // keys it proves none was inlined. Only the variable name is reported, never the value.
    const leaked = SECRET_ENV_NAMES.filter((name) => {
      const value = env[name]?.trim();
      return value !== undefined && value.length >= 8 && bundle.includes(value);
    });
    expect(leaked).toEqual([]);
  });
});
