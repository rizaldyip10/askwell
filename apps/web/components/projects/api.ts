// Client helpers for the projects API (P2P-T04). Pure apart from `fetch`, so they're unit tested.

import { API_ERROR_CODES, PROJECT_NAME_MAX_LENGTH, projectNameSchema, type ApiErrorCode } from "@askwell/shared";

export type ApiFailure = { ok: false; status: number; code: ApiErrorCode; message: string };
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

export const GENERIC_ERROR = "Something went wrong. Try again.";
export const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";
export const SIGNED_OUT_ERROR = "Your session has ended. Refresh the page to sign in again.";

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && (API_ERROR_CODES as readonly string[]).includes(value);
}

/** Turn a non-2xx response body into a failure the UI can show. */
export function toApiFailure(status: number, body: unknown): ApiFailure {
  const error =
    typeof body === "object" && body !== null && "error" in body
      ? (body as { error: unknown }).error
      : undefined;
  const code =
    typeof error === "object" && error !== null && "code" in error ? (error as { code: unknown }).code : undefined;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? (error as { message: unknown }).message
      : undefined;

  if (status === 401) return { ok: false, status, code: "unauthorized", message: SIGNED_OUT_ERROR };
  if (isApiErrorCode(code)) {
    return { ok: false, status, code, message: typeof message === "string" && message ? message : GENERIC_ERROR };
  }
  return { ok: false, status, code: status === 404 ? "not_found" : "internal", message: GENERIC_ERROR };
}

/** Call a JSON API route. Never throws: network errors and bad bodies become failures. */
export async function requestJson<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, code: "internal", message: NETWORK_ERROR };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    // These routes always answer JSON. An unreadable body is never a success.
    return res.ok ? { ok: false, status: res.status, code: "internal", message: GENERIC_ERROR } : toApiFailure(res.status, undefined);
  }
  if (res.ok) return { ok: true, data: json as T };
  return toApiFailure(res.status, json);
}

/** Check a project name before sending it. The server checks again. */
export function validateProjectName(raw: string): { ok: true; name: string } | { ok: false; message: string } {
  const parsed = projectNameSchema.safeParse(raw);
  if (parsed.success) return { ok: true, name: parsed.data };
  if (raw.trim().length === 0) return { ok: false, message: "Enter a name." };
  return { ok: false, message: `Use at most ${PROJECT_NAME_MAX_LENGTH} characters.` };
}
