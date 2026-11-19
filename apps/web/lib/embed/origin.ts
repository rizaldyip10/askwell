import { embedQuerySchema } from "@askwell/shared";

/**
 * The host page's origin as a postMessage target, or null.
 * `embedQuerySchema.origin` is `z.url()`, which also accepts `javascript:` URLs
 * and URLs with paths, so only `http:`/`https:` pass and only `.origin` is kept.
 */
export function normalizeHostOrigin(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.origin;
}

export type EmbedParams = { key: string; origin: string };

type SearchParams = Record<string, string | string[] | undefined>;

/** Validates `/embed?key=…&origin=…`. Null means the page renders nothing. */
export function parseEmbedParams(searchParams: SearchParams): EmbedParams | null {
  const parsed = embedQuerySchema.safeParse({ key: searchParams.key, origin: searchParams.origin });
  if (!parsed.success) return null;
  const origin = normalizeHostOrigin(parsed.data.origin);
  return origin ? { key: parsed.data.key, origin } : null;
}
