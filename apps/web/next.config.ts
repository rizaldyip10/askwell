import type { NextConfig } from "next";
import { posthogRewrites } from "./lib/analytics/config";

// Clickjacking (project.md §9): only /embed may be framed by other sites.
const EMBED_FRAME_HEADERS = [{ key: "Content-Security-Policy", value: "frame-ancestors *" }];
const SELF_FRAME_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

// The loader runs on any customer site (project.md §6.5, CORS in §9).
const WIDGET_JS_HEADERS = [
  { key: "Content-Type", value: "application/javascript; charset=utf-8" },
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Cache-Control", value: "public, max-age=300" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@askwell/shared", "@askwell/db"],
  // PostHog's API paths end in a slash (`/e/`, `/flags/`): don't redirect them before the rewrite.
  skipTrailingSlashRedirect: true,
  // PostHog reverse proxy (lib/analytics/config.ts): /relay/* → PostHog, same origin for the browser.
  async rewrites() {
    return posthogRewrites(process.env.NEXT_PUBLIC_POSTHOG_HOST);
  },
  async headers() {
    return [
      { source: "/embed", headers: EMBED_FRAME_HEADERS },
      { source: "/embed/:path*", headers: EMBED_FRAME_HEADERS },
      // Everything except /embed and below.
      { source: "/:path((?!embed(?:/|$)).*)", headers: SELF_FRAME_HEADERS },
      { source: "/widget.js", headers: WIDGET_JS_HEADERS },
    ];
  },
};

export default nextConfig;
