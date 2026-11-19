import type { ApiError, ApiErrorCode } from "@askwell/shared";

// Public widget routes allow any origin, with no credentials (project.md §9 CORS).
export const WIDGET_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

/** JSON response for a public widget route, with the CORS headers. */
export function widgetJson(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return Response.json(body, {
    status: init.status ?? 200,
    headers: { ...WIDGET_CORS_HEADERS, ...init.headers },
  });
}

/** `{ error: { code, message } }` for a public widget route. Errors are never cached. */
export function widgetError(status: number, code: ApiErrorCode, message: string): Response {
  const body: ApiError = { error: { code, message } };
  return widgetJson(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Answer a CORS preflight. */
export function widgetPreflight(): Response {
  return new Response(null, { status: 204, headers: WIDGET_CORS_HEADERS });
}
