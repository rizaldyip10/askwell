import "server-only";

import type { Plan } from "@askwell/shared";
import { ensureAccount } from "../accounts/ensure-account";
import { trackUpgraded } from "../analytics/owner-events";
import { createServiceClient, type ServiceClient } from "../supabase/service";

/** Writes plus re-reads one delivery may do before it gives up (and Svix retries). */
export const MAX_SYNC_ROUNDS = 3;

export class SyncPlanError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SyncPlanError";
  }
}

/**
 * Sets `accounts.plan` for a Clerk user (service client: owners have no write grant on
 * `accounts`). Creates the row first if the webhook beats the first dashboard visit.
 *
 * The update only matches a row whose plan differs (`plan <> new`), so it returns a row only
 * on a real change; Postgres re-checks that condition after a concurrent update commits, so
 * two deliveries can't both see the same change. Returns whether the plan changed.
 */
export async function setAccountPlan(clerkUserId: string, plan: Plan, client: ServiceClient): Promise<boolean> {
  await ensureAccount(clerkUserId, client);

  const { data, error } = await client
    .from("accounts")
    .update({ plan })
    .eq("clerk_user_id", clerkUserId)
    .neq("plan", plan)
    .select("plan");
  if (error) throw new SyncPlanError(`Updating the plan failed: ${error.message}`, { cause: error });
  return data.length > 0;
}

/**
 * Brings `accounts.plan` in line with Clerk: read the plan (`readPlan`, Clerk's current
 * subscription), write it, then read again. If Clerk changed in between, write the newer plan
 * and check again, up to MAX_SYNC_ROUNDS.
 *
 * Why the second read: two deliveries can interleave as "A reads pro … B reads free, writes
 * free … A writes pro". A's check read comes after its own write, so it sees free and puts it
 * back. The last write of any delivery is always confirmed by a read made after it.
 *
 * `upgraded` is sent once, only when this call moved the row from free to pro and the check
 * confirmed pro: never on a replay, never for a stale write that was then undone.
 * Throws (so the route answers 500 and Svix retries) if Clerk or the database fails, or the
 * plan doesn't settle.
 */
export async function syncAccountPlan(
  clerkUserId: string,
  readPlan: () => Promise<Plan>,
  client?: ServiceClient,
): Promise<{ plan: Plan; changed: boolean }> {
  let plan = await readPlan();
  // Only after Clerk answered: a failed read touches nothing.
  const db = client ?? createServiceClient();
  let changed = false;
  let upgraded = false;

  for (let round = 1; ; round++) {
    if (await setAccountPlan(clerkUserId, plan, db)) {
      changed = true;
      upgraded = plan === "pro";
    }
    const confirmed = await readPlan();
    if (confirmed === plan) break;
    if (round >= MAX_SYNC_ROUNDS) throw new SyncPlanError("The plan kept changing while syncing. Retry later.");
    plan = confirmed;
  }

  if (upgraded) trackUpgraded(clerkUserId);
  return { plan, changed };
}
