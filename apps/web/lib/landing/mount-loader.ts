/** The loader's host element (`HOST_TAG` in `apps/widget/src/widget.ts`). */
export const WIDGET_HOST_TAG = "askwell-widget";

/** How long after leaving `/` a late widget (its config fetch was still in flight) is removed. */
export const LATE_MOUNT_SWEEP_MS = 10_000;

/** Stops the sweep started by the last cleanup, if it is still running. */
let stopSweep: (() => void) | null = null;

/**
 * Adds the widget loader to the page, in the same form as the dashboard's Install snippet:
 * `<script src="{appUrl}/widget.js" data-key="{key}" defer>`. Returns a cleanup that removes the
 * script tag and the widget it rendered, so the corner button doesn't follow a client-side
 * navigation to /sign-up or the dashboard, and a later visit to `/` mounts a fresh one.
 */
export function mountLandingLoader(doc: Document, appUrl: string, key: string): () => void {
  // Back on `/`: the widget mounted from here on is wanted.
  stopSweep?.();

  const script = doc.createElement("script");
  script.src = `${appUrl}/widget.js`;
  script.dataset.key = key;
  script.defer = true;
  doc.body.appendChild(script);

  return () => {
    // A loader that hasn't run yet finds no key and renders nothing.
    delete script.dataset.key;
    script.remove();
    removeHosts(doc);
    stopSweep?.();
    stopSweep = sweepLateMounts(doc);
  };
}

function removeHosts(doc: Document): void {
  for (const host of doc.querySelectorAll(WIDGET_HOST_TAG)) host.remove();
}

/** A loader that was waiting on its config mounts after we left: remove it when it appears. */
function sweepLateMounts(doc: Document): () => void {
  const view = doc.defaultView;
  if (!view || typeof view.MutationObserver !== "function") return () => undefined;
  const observer = new view.MutationObserver(() => removeHosts(doc));
  observer.observe(doc.body, { childList: true });
  const timer = view.setTimeout(stop, LATE_MOUNT_SWEEP_MS);
  function stop() {
    observer.disconnect();
    view?.clearTimeout(timer);
    if (stopSweep === stop) stopSweep = null;
  }
  return stop;
}
