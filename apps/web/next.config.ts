import type { NextConfig } from "next";

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
