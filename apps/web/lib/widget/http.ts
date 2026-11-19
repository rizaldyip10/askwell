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

export type JsonBodyResult = { ok: true; value: unknown } | { ok: false; reason: "too_large" | "invalid_json" };

/**
 * Read a JSON request body, counting the bytes actually received and stopping once they pass
 * `maxBytes`, so a public route never buffers or parses an oversized body. Doesn't trust
 * Content-Length (it can be missing or wrong), but rejects early when it already says too much.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  if (!request.body) return { ok: false, reason: "invalid_json" };

  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return { ok: false, reason: "too_large" };
    }
    parts.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}
