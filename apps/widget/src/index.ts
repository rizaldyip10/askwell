// Askwell widget loader (project.md §6.5). Customers paste:
//   <script src="https://<app>/widget.js" data-key="pk_..." defer></script>
import { fetchConfig } from "./config";
import { findLoaderScript, readSetup } from "./setup";
import { HOST_TAG, mountWidget, type WidgetHandle } from "./widget";

/** Reads the script tag, fetches the config and renders the button. Does nothing on any failure. */
export async function init(win: Window = window, fetchImpl: typeof fetch = fetch): Promise<WidgetHandle | null> {
  const doc = win.document;
  const setup = readSetup(findLoaderScript(doc));
  if (!setup) return null;
  // Pasted twice: keep the first.
  if (doc.querySelector(HOST_TAG)) return null;
  const config = await fetchConfig(setup.appOrigin, setup.key, fetchImpl);
  if (!config) return null;
  if (doc.querySelector(HOST_TAG)) return null;
  if (!doc.body) await new Promise((r) => doc.addEventListener("DOMContentLoaded", r, { once: true }));
  return mountWidget(setup, config, win);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  void init().catch(() => undefined);
}
