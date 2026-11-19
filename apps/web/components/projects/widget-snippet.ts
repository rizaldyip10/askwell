import { PUBLIC_KEY_PATTERN } from "@askwell/shared";

/** Only origin characters (hostname, bracketed IPv6, port): nothing that could break out of the attribute. */
const SAFE_ORIGIN_CHARS = /^https?:\/\/[A-Za-z0-9.\-[\]:]+$/;

/** True for a bare http(s) origin in its serialized form, e.g. `https://askwell.app` or `http://[::1]:3000`. */
function isOrigin(value: string): boolean {
  if (!SAFE_ORIGIN_CHARS.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
  } catch {
    return false;
  }
}

/**
 * The install snippet for a project (project.md §6.9). The loader finds the app from its own
 * `src`, so `appUrl` decides where the widget loads from. Both inputs are checked, so the
 * output is always exactly this shape and needs no escaping.
 */
export function widgetSnippet(appUrl: string, publicKey: string): string {
  if (!isOrigin(appUrl)) {
    throw new Error("widgetSnippet(): appUrl must be an http(s) origin with no path or trailing slash.");
  }
  if (!PUBLIC_KEY_PATTERN.test(publicKey)) throw new Error("widgetSnippet(): invalid public key.");
  return `<script src="${appUrl}/widget.js" data-key="${publicKey}" defer></script>`;
}
