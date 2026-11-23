import "server-only";

import type { Plan } from "@askwell/shared";
import { trackSignedUp } from "../analytics/owner-events";
import { createServiceClient, type ServiceClient } from "../supabase/service";

/** Plan for a brand-new account (project.md §6.2). */
export const DEFAULT_PLAN: Plan = "free";

export class EnsureAccountError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EnsureAccountError";
  }
}

/**
 * Makes sure the owner has an `accounts` row. Creates it with plan `free` on first call.
 *
 * - Pass the Clerk user ID from `auth()` on the server, never a value from the client.
 * - Owners have no INSERT grant on `accounts`, so this goes through the service client.
 * - It's an insert that ignores duplicates (`ON CONFLICT (clerk_user_id) DO NOTHING`),
 *   so an existing row, and its plan, is never touched. A Pro owner stays Pro.
 * - Throws `EnsureAccountError` if the write fails.
 * - Sends `signed_up` only when this call created the row: the insert returns the row it
 *   made, and nothing when the row already existed. Not on every sign-in.
 */
export async function ensureAccount(userId: string, client?: ServiceClient): Promise<void> {
  if (!userId) throw new EnsureAccountError("ensureAccount() needs a Clerk user ID.");

  const db = client ?? createServiceClient();
  const { data, error } = await db
    .from("accounts")
    .upsert({ clerk_user_id: userId, plan: DEFAULT_PLAN }, { onConflict: "clerk_user_id", ignoreDuplicates: true })
    .select("clerk_user_id");

  if (error) {
    throw new EnsureAccountError(`Couldn't create the account row: ${error.message}`, { cause: error });
  }
  if (data && data.length > 0) trackSignedUp(userId);
}
