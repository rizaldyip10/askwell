// Runs in the browser before the app is interactive (Next.js `instrumentation-client`).
// PostHog: landing, auth and dashboard only. `loadPostHog()` skips /embed entirely
// (no tracking on customers' sites), and does nothing when no key is set.
import { loadPostHog } from "./lib/analytics/browser";

void loadPostHog();
