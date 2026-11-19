import { PUBLIC_KEY_PATTERN } from "@askwell/shared";

/** `http(s)://host[:port]` with a plain hostname: nothing that could break out of the attribute. */
const ORIGIN_PATTERN = /^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/;

/**
 * The install snippet for a project (project.md §6.9). The loader finds the app from its own
 * `src`, so `appUrl` decides where the widget loads from. Both inputs are checked, so the
 * output is always exactly this shape and needs no escaping.
 */
export function widgetSnippet(appUrl: string, publicKey: string): string {
  if (!ORIGIN_PATTERN.test(appUrl)) {
    throw new Error("widgetSnippet(): appUrl must be an http(s) origin with no path or trailing slash.");
  }
  if (!PUBLIC_KEY_PATTERN.test(publicKey)) throw new Error("widgetSnippet(): invalid public key.");
  return `<script src="${appUrl}/widget.js" data-key="${publicKey}" defer></script>`;
}
