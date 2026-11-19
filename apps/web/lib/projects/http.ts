import "server-only";

import type { ApiError, ApiErrorCode } from "@askwell/shared";
import { auth } from "@clerk/nextjs/server";

/** `{ error: { code, message } }` with the given status. */
export function apiError(status: number, code: ApiErrorCode, message: string): Response {
  const body: ApiError = { error: { code, message } };
  return Response.json(body, { status });
}

export const unauthorized = () => apiError(401, "unauthorized", "Sign in to continue");
export const notFound = () => apiError(404, "not_found", "Project not found");
export const internalError = () => apiError(500, "internal", "Something went wrong");

/** The signed-in owner's Clerk user ID from the session, or null. Each route checks it itself. */
export async function currentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

/** Parse a JSON body. Returns `undefined` for a missing or malformed body, so zod rejects it. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
