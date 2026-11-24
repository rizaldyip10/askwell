import "server-only";
import { PUBLIC_KEY_PATTERN } from "@askwell/shared";

/**
 * The public key of the landing page's own widget project (§6.1, §11), or null when there is none.
 * Read from `process.env` on every call, so the landing page picks up each environment's key at
 * request time instead of baking one in at build. Missing or blank → null (no widget, no error).
 * A value that isn't a public key → null too, with a server-side warning, since the loader would
 * render nothing for it anyway.
 */
export function landingWidgetKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.LANDING_WIDGET_KEY?.trim();
  if (!key) return null;
  if (!PUBLIC_KEY_PATTERN.test(key)) {
    console.warn("[landing] LANDING_WIDGET_KEY is not a public key (pk_…); the landing widget is off.");
    return null;
  }
  return key;
}
