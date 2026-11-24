// Source-file helpers for the §9 audit tests in this folder (test-only, never imported by the app).

import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** apps/web */
export const WEB_DIR = fileURLToPath(new URL("../../..", import.meta.url));
/** The repo root */
export const REPO_DIR = join(WEB_DIR, "..", "..");

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : Promise.resolve([join(dir, e.name)]))),
  );
  return nested.flat();
}

export type SourceFile = {
  /** Path relative to apps/web, with `/` separators on every OS. */
  path: string;
  text: string;
  /** `text` with comments blanked out, so a rule mentioned in a comment doesn't count as code. */
  code: string;
};

/** Blanks `//` and `/* *\/` comments (keeps line breaks, so line numbers still match). Strings with `//` (URLs) are kept. */
export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, (_match, before: string) => before);
}

/**
 * Every app source file in apps/web (app, components, lib, proxy.ts, next.config.ts),
 * without tests, test helpers or this audit folder.
 */
export async function webSources(): Promise<SourceFile[]> {
  const files = [
    ...(await walk(join(WEB_DIR, "app"))),
    ...(await walk(join(WEB_DIR, "components"))),
    ...(await walk(join(WEB_DIR, "lib"))),
    join(WEB_DIR, "proxy.ts"),
    join(WEB_DIR, "next.config.ts"),
  ];
  const sources = await Promise.all(
    files
      .map((f) => ({ abs: f, path: relative(WEB_DIR, f).split(sep).join("/") }))
      .filter(({ path }) => /\.(ts|tsx)$/.test(path))
      .filter(({ path }) => !/\.test\.tsx?$/.test(path) && !/(^|\/)(test-utils|route-test-utils|test-pdf)\.ts$/.test(path))
      .filter(({ path }) => !path.startsWith("lib/security/audit/"))
      .map(async ({ abs, path }) => {
        const text = await readFile(abs, "utf8");
        return { path, text, code: stripComments(text) };
      }),
  );
  return sources.sort((a, b) => a.path.localeCompare(b.path));
}

/** 1-based line of the first match of `pattern` in `text`, or 0. */
export function lineOf(text: string, pattern: RegExp | string): number {
  const index = typeof pattern === "string" ? text.indexOf(pattern) : text.search(pattern);
  return index < 0 ? 0 : text.slice(0, index).split("\n").length;
}
