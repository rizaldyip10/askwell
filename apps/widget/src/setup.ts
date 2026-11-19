import { PUBLIC_KEY_PATTERN } from "@askwell/shared/widget";

export type LoaderSetup = { key: string; appOrigin: string };

/** The loader's own <script> tag. `currentScript` is null for module scripts and after load, so fall back to a lookup. */
export function findLoaderScript(doc: Document): HTMLScriptElement | null {
  const current = doc.currentScript;
  if (current instanceof HTMLScriptElement && current.dataset.key !== undefined) return current;
  return doc.querySelector<HTMLScriptElement>('script[src$="/widget.js"][data-key]');
}

/** Key and app origin from the script tag, or null when the key is bad (then nothing renders). */
export function readSetup(script: HTMLScriptElement | null): LoaderSetup | null {
  const key = script?.dataset.key;
  if (!script || !key || !PUBLIC_KEY_PATTERN.test(key)) return null;
  try {
    const url = new URL(script.src);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return { key, appOrigin: url.origin };
  } catch {
    return null;
  }
}
