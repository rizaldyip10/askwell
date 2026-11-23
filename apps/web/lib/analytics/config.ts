// PostHog config shared by the browser, the server and next.config.ts (project.md §6.11, §11).
// Pure on purpose: no SDK import here, so every side can use it and the tests cover it.

export type PosthogEnv = { key: string; host: string };

/**
 * Same-origin path the browser sends PostHog traffic to. `next.config.ts` rewrites it to
 * PostHog, so ad blockers that block PostHog's hosts don't drop our events. Deliberately
 * not an obvious name like `/analytics` or `/posthog`, which blockers also match.
 */
export const POSTHOG_PROXY_PATH = "/relay";

/** The `defaults` preset posthog-js applies (pageviews on client-side navigation, etc.). */
export const POSTHOG_DEFAULTS = "2026-08-30";

/**
 * The PostHog key and host, or null when either is unset or blank.
 * The literal `process.env.NEXT_PUBLIC_*` reads let Next.js inline them in the browser bundle.
 */
export function readPosthogEnv(): PosthogEnv | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim().replace(/\/+$/, "");
  return key && host ? { key, host } : null;
}

/** The variable that's missing, for the "not configured" message. */
export function missingPosthogVariable(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ? "NEXT_PUBLIC_POSTHOG_HOST" : "NEXT_PUBLIC_POSTHOG_KEY";
}

export function posthogMissingMessage(variable: string): string {
  return `${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`;
}

/**
 * False for `/embed` and below: the widget panel runs on customers' sites, and we never
 * track their visitors (product owner decision). Everything else (landing, auth, dashboard)
 * is tracked.
 */
export function isTrackedPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return !(path === "/embed" || path.startsWith("/embed/"));
}

/** `https://us.i.posthog.com` → `https://us-assets.i.posthog.com` (SDK bundles). Other hosts are used as is. */
export function posthogAssetsHost(host: string): string {
  return host.replace(/^https:\/\/(us|eu)\.i\.posthog\.com$/, "https://$1-assets.i.posthog.com");
}

/** `https://us.i.posthog.com` → `https://us.posthog.com` (the PostHog app, for toolbar links). */
export function posthogUiHost(host: string): string {
  return host.replace(/^https:\/\/(us|eu)\.i\.posthog\.com$/, "https://$1.posthog.com");
}

/**
 * The reverse-proxy rewrites (PostHog's Next.js rewrites guide). Order matters: the static
 * and array rules must come before the catch-all. No host → no rewrites.
 */
export function posthogRewrites(host: string | undefined): { source: string; destination: string }[] {
  const api = host?.trim().replace(/\/+$/, "");
  if (!api) return [];
  const assets = posthogAssetsHost(api);
  return [
    { source: `${POSTHOG_PROXY_PATH}/static/:path*`, destination: `${assets}/static/:path*` },
    { source: `${POSTHOG_PROXY_PATH}/array/:path*`, destination: `${assets}/array/:path*` },
    { source: `${POSTHOG_PROXY_PATH}/:path*`, destination: `${api}/:path*` },
  ];
}
