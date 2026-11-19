// GET /api/widget/config?key=pk_... (project.md §8 Public). Any origin.
// Rate limited per public key + IP by Arcjet (lib/security). Fails open.

import { widgetConfigQuerySchema, type WidgetConfigResponse } from "@askwell/shared";
import type { NextRequest } from "next/server";
import { protectWidgetConfig } from "../../../../lib/security";
import { getWidgetConfigByKey } from "../../../../lib/widget/config";
import { widgetError, widgetJson, widgetPreflight } from "../../../../lib/widget/http";

export async function GET(request: NextRequest): Promise<Response> {
  const parsed = widgetConfigQuerySchema.safeParse({ key: request.nextUrl.searchParams.get("key") ?? undefined });
  if (!parsed.success) {
    return widgetError(400, "validation_error", parsed.error.issues[0]?.message ?? "Invalid query");
  }

  const protection = await protectWidgetConfig(request, { publicKey: parsed.data.key });
  if (!protection.allowed) {
    return widgetError(429, "rate_limited", "Too many requests. Try again in a minute.");
  }

  try {
    const config = await getWidgetConfigByKey(parsed.data.key);
    if (!config) return widgetError(404, "not_found", "No project with that key");

    const body: WidgetConfigResponse = { config };
    return widgetJson(body, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (error) {
    console.error("[widget] config lookup failed", error);
    return widgetError(500, "internal", "Something went wrong");
  }
}

export function OPTIONS(): Response {
  return widgetPreflight();
}
