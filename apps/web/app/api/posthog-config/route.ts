import type { ApiError, PosthogConfigResponse } from "@askwell/shared";
import { readPosthogEnv } from "../../../lib/analytics/config";

// Read from the environment on every request, never at build time (project.md §8 System).
export const dynamic = "force-dynamic";

/** GET /api/posthog-config: PostHog's public project key and host. Both are public by design (§11). */
export function GET(): Response {
  const env = readPosthogEnv();
  if (!env) {
    const body: ApiError = { error: { code: "internal", message: "Analytics is not configured." } };
    return Response.json(body, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const body: PosthogConfigResponse = { key: env.key, host: env.host };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
