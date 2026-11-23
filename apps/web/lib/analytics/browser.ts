import type { PostHog } from "posthog-js";
import {
  POSTHOG_DEFAULTS,
  POSTHOG_PROXY_PATH,
  isTrackedPath,
  missingPosthogVariable,
  posthogMissingMessage,
  posthogUiHost,
  readPosthogEnv,
} from "./config";

let loading: Promise<PostHog | null> | undefined;

/**
 * The browser's PostHog, initialized once per page load, or null when it must not run:
 * on `/embed` (no PostHog at all on customers' sites: the SDK isn't even downloaded), on
 * the server, or with no key set. Called from `instrumentation-client.ts`; components await
 * it instead of importing `posthog-js` directly, so nothing runs before init.
 */
export function loadPostHog(): Promise<PostHog | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  loading ??= init().catch((error: unknown) => {
    console.error("[analytics] PostHog failed to load", error);
    return null;
  });
  return loading;
}

async function init(): Promise<PostHog | null> {
  if (!isTrackedPath(window.location.pathname)) return null;

  const env = readPosthogEnv();
  if (!env) {
    if (process.env.NODE_ENV === "development") console.error(posthogMissingMessage(missingPosthogVariable()));
    return null;
  }

  const { default: posthog } = await import("posthog-js");
  posthog.init(env.key, {
    api_host: POSTHOG_PROXY_PATH,
    ui_host: posthogUiHost(env.host),
    defaults: POSTHOG_DEFAULTS,
    // Error tracking: unhandled errors and rejections.
    capture_exceptions: true,
    // Session replay (landing + dashboard; /embed never gets here). Inputs stay masked.
    session_recording: { maskAllInputs: true },
    // Our own API calls carry the distinct and session IDs, so server errors link to the session.
    tracing_headers: [window.location.hostname],
  });
  return posthog;
}
